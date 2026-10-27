import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { IncompleteStream, Ledger, PRICE, respondStreamText } from "../lib/meta/client";
import { framesFromUsage, trackNoun } from "../lib/meta/sam";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// the first three frames of a real SAM 3.1 answer
const WIRE = readFileSync(new URL("./fixtures/toss_raw.txt", import.meta.url), "utf8").split("\n").slice(0, 3).map((l) => `${l}\n`);

const sse = (events: object[]) => events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
const deltas = () => WIRE.map((delta) => ({ type: "response.output_text.delta", delta }));

/** Answers every fetch with a streamed body (one chunk per event) and counts the calls. */
function mockStream(events: object[]) {
  process.env.META_API_KEY = "test-key";
  const calls = { n: 0 };
  globalThis.fetch = (async () => {
    calls.n++;
    const enc = new TextEncoder();
    const chunks = sse(events).split("\n\n").filter(Boolean).map((c) => `${c}\n\n`);
    return new Response(new ReadableStream({ start(c) { for (const k of chunks) c.enqueue(enc.encode(k)); c.close(); } }), { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  return calls;
}

test("a stream with no completed event is tried once more, then fails as incomplete", async () => {
  const calls = mockStream([{ type: "response.created" }, ...deltas()]);
  const ledger = new Ledger();
  await assert.rejects(() => trackNoun("file_1", "ball", ledger, 120), (e) => e instanceof IncompleteStream);
  assert.equal(calls.n, 2, "one try and one retry");
  assert.equal(ledger.calls.length, 0, "an incomplete stream is not billed");
});

test("respondStreamText reports the text, when the first event and the last one arrived, and the usage", async () => {
  mockStream([{ type: "response.created" }, ...deltas(), { type: "response.completed", response: { usage: { input_tokens: 9, output_tokens: 3 } } }]);
  const r = await respondStreamText({ model: "sam-3.1" }, null, "test");
  assert.equal(r.text, WIRE.join(""));
  assert.ok(r.firstEventMs >= 0 && r.totalMs >= r.firstEventMs);
  assert.deepEqual(r.usage, { input_tokens: 9, output_tokens: 3 });
});

test("a completed stream with no usage has none", async () => {
  mockStream([...deltas(), { type: "response.completed", response: {} }]);
  assert.equal((await respondStreamText({ model: "sam-3.1" }, null, "test")).usage, undefined);
});

test("SAM is billed from the completed event's usage when it has the frame count", async () => {
  const calls = mockStream([...deltas(), { type: "response.completed", response: { usage: { input_tokens_details: { video_frames: 120 } } } }]);
  const ledger = new Ledger();
  const res = await trackNoun("file_1", "ball", ledger, 200);
  assert.equal(calls.n, 1);
  assert.ok(res.tracks.length > 0);
  assert.equal(ledger.calls.length, 1);
  const c = ledger.calls[0];
  assert.equal(c.model, "sam-3.1");
  assert.equal(c.purpose, 'track "ball"');
  assert.equal(c.frames, 120, "the billed frames, not the 200 sent");
  assert.ok(Math.abs(c.usd - 120 * PRICE.samFrame) < 1e-12);
  assert.equal(c.est, undefined);
  assert.ok(c.firstMaskMs !== undefined && c.firstMaskMs >= 0);
  assert.ok(c.totalMs !== undefined && c.totalMs >= c.firstMaskMs!);
  assert.equal(c.ms, c.totalMs);
});

test("without usage SAM is billed by the old estimate and labelled as one", async () => {
  mockStream([...deltas(), { type: "response.completed", response: {} }]);
  const ledger = new Ledger();
  await trackNoun("file_1", "ball", ledger, 200);
  const c = ledger.calls[0];
  assert.equal(c.purpose, 'track "ball" (est.)');
  assert.equal(c.est, true);
  assert.equal(c.frames, 200);
  assert.ok(Math.abs(c.usd - 200 * PRICE.samFrame) < 1e-12);
  assert.ok(c.firstMaskMs !== undefined && c.totalMs !== undefined);
  // SAM's minimum is 50 frames
  const small = new Ledger();
  mockStream([...deltas(), { type: "response.completed", response: {} }]);
  await trackNoun("file_1", "ball", small, 20);
  assert.equal(small.calls[0].frames, 50);
});

test("frames are read from the usual usage spellings, and from nothing else", () => {
  assert.equal(framesFromUsage({ frames: 12 }), 12);
  assert.equal(framesFromUsage({ video_frames: 30.4 }), 30);
  assert.equal(framesFromUsage({ input_tokens_details: { video_frames: 7 } }), 7);
  assert.equal(framesFromUsage({ input_tokens: 1000, output_tokens: 20 }), undefined);
  assert.equal(framesFromUsage({ frames: 0 }), undefined);
  assert.equal(framesFromUsage(undefined), undefined);
});

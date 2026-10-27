import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fittedResiduals, lag1, refereeBoard, refereePlotSeries, runsTest, type Candidate } from "../lib/experiment";
import { critique, CRITIQUE_SCHEMA, reviseAgentic, RESIDUAL_FEATURES, type Observation } from "../lib/scientist";
import { Ledger, strictable } from "../lib/meta/client";

// the held-out figures are distinctive numbers, so a leak anywhere in a payload can be found by value as well as by name
const TEST_Z = [777.125, 31.375, 4.4137];
const TEST_RMS = [0.0919191, 0.0828282, 0.0737373];

const N = 40;
const t = Array.from({ length: N }, (_, i) => i / 30);
const truth = t.map((x) => 2 + 3 * x);
// law "a" wanders (a drift in the fitted frames); "b" is noise around the truth; "c" is in between
const miss = (k: number) => t.map((x, i) => (k === 0 ? 0.5 * (x - 0.45) : k === 1 ? 0.02 * (i % 2 ? 1 : -1) : 0.1 * Math.sin(i)));
const m = { series: { t, ch: { x: truth } }, noise: { x: 0.02 } };

function cand(i: number, id: string, rank: number, trainZ: number): Candidate {
  return {
    law: { id, title: `Law ${id}`, summary: "", state: ["x"], derivatives: { x: "0" }, params: [], observe: { x: "x" } },
    fit: { lawId: id, ok: true, theta: {}, sigma: {}, trainCost: 1, trainRms: trainZ * 0.02, testRms: TEST_RMS[i], testMax: 1, testZ: TEST_Z[i], trainZ, bic: 10 * i, n: N, k: 1, iterations: 1, events: [], predicted: { x: truth.map((v, j) => v + miss(i)[j]) } },
    origin: "muse",
    rank,
  } as Candidate;
}

// the rank-1 law fits the fitted frames WORST; the rank-3 law fits them best: the table's order must follow the fit, not the rank
const cands = [cand(0, "a", 1, 9), cand(1, "b", 2, 1), cand(2, "c", 3, 4)];

const obs = { phenomenon: "a test", what_happens: "Something moves.", body: "earth" } as unknown as Observation;

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replaces fetch, hands back what was sent, and answers every call with `reply`. */
function mockMeta(reply: unknown) {
  process.env.META_API_KEY = "test-key";
  const sent: { input: unknown; text: unknown }[] = [];
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push({ input: body.input, text: body.text });
    return new Response(JSON.stringify({ id: "resp_1", output: [{ type: "message", content: [{ type: "output_text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }] }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
  }) as typeof fetch;
  return sent;
}

const LEAKS = /rank|testRms|testZ|test_rms|test_z|unseen_miss/i;

test("the referee's board holds no rank or held-out figure, and is ordered by the fit to the fitted frames", () => {
  const board = refereeBoard(cands, m);
  const text = JSON.stringify(board);
  assert.doesNotMatch(text, LEAKS);
  for (const v of [...TEST_Z, ...TEST_RMS]) assert.ok(!text.includes(String(v)), `${v} leaked`);
  assert.deepEqual(board.candidates.map((c) => c.id), ["b", "c", "a"]);
  assert.equal(board.the_law_code_chose, "a");
  // the figure given for each law is its miss on the fitted frames, in noise units
  assert.deepEqual(board.candidates.map((c) => c.misses_the_fitted_frames_by_noise_units), [1, 4, 9]);
});

test("the critique request carries no rank, testRms or testZ", async () => {
  const sent = mockMeta({ residual_feature: "none", strength: 0, verdict: "accept", headline: "h", finding: "f", why_it_won: "w", caveats: [], revision_idea: "", what_if: [] });
  const crit = await critique(obs, { units: {}, given: [], ...refereeBoard(cands, m) }, new Ledger(), undefined, new Uint8Array([1, 2, 3]));
  assert.equal(crit.verdict, "accept");
  assert.equal(sent.length, 1);
  const input = JSON.stringify(sent[0].input);
  assert.doesNotMatch(input, LEAKS);
  for (const v of [...TEST_Z, ...TEST_RMS]) assert.ok(!input.includes(String(v)), `${v} leaked`);
  assert.match(input, /the law code chose/i);
});

test("the Muse Wonder request carries no rank, testRms or testZ", async () => {
  const sent = mockMeta("no tool call here");
  const out = await reviseAgentic(obs, { units: {}, given: [], ...refereeBoard(cands, m) }, "drift in the misses", () => ({ ok: true }), new Ledger(), undefined, 1);
  assert.equal(out.law, null);
  assert.equal(sent.length, 1);
  const input = JSON.stringify(sent[0].input);
  assert.doesNotMatch(input, LEAKS);
  for (const v of [...TEST_Z, ...TEST_RMS]) assert.ok(!input.includes(String(v)), `${v} leaked`);
});

test("the critique schema asks for the residual feature and its strength before the verdict, and stays strict", () => {
  assert.equal(strictable(CRITIQUE_SCHEMA), true);
  const keys = Object.keys(CRITIQUE_SCHEMA.properties);
  assert.ok(keys.indexOf("residual_feature") < keys.indexOf("strength") && keys.indexOf("strength") < keys.indexOf("verdict"));
  assert.deepEqual(CRITIQUE_SCHEMA.properties.residual_feature.enum, ["none", "drift", "oscillating", "growing", "step", "dead-band"]);
  assert.deepEqual([...RESIDUAL_FEATURES], CRITIQUE_SCHEMA.properties.residual_feature.enum);
  assert.deepEqual(CRITIQUE_SCHEMA.properties.strength.enum, [0, 1, 2, 3]);
  assert.ok(CRITIQUE_SCHEMA.required.includes("residual_feature") && CRITIQUE_SCHEMA.required.includes("strength"));
});

test("the residual tests see a drift and see noise", () => {
  const drift = Array.from({ length: 30 }, (_, i) => (i - 15) / 10);
  const rd = runsTest(drift);
  assert.equal(rd.runs, 2);
  assert.ok(rd.z! < -4, `drift z ${rd.z}`);
  assert.ok(lag1(drift)! > 0.8);
  const alternating = Array.from({ length: 30 }, (_, i) => (i % 2 ? 1 : -1));
  assert.ok(runsTest(alternating).z! > 4);
  assert.ok(lag1(alternating)! < -0.8);
  assert.equal(runsTest([1, 2, 3, 4, 5, 6, 7, 8, 9]).z, null);
  assert.equal(runsTest([1, 2, 3, 4, 5, 6, 7, 8, 9]).sameSign, true);
  assert.equal(lag1([1, 2]), null);
});

test("the board carries the winner's runs test and lag-1 autocorrelation, computed on the fitted frames in noise units", () => {
  const board = refereeBoard(cands, m);
  const a = board.candidates.find((c) => c.id === "a")!;
  const tests = a.residual_tests.x;
  assert.ok(tests.runs_z !== null && tests.runs_z < -2, "a steady drift has long runs of one sign");
  assert.ok(tests.lag1_autocorr! > 0.8);
  // 28 fitted frames of 40; the held-out ones are not in the count
  assert.equal(tests.n, 28);
  const b = board.candidates.find((c) => c.id === "b")!;
  assert.ok(b.residual_tests.x.runs_z! > 2, "alternating misses are noise-like in sign but never long runs");
  // noise units: the first fitted frame of law b misses by 0.02 against a noise of 0.02
  const r = fittedResiduals(cands[1].fit, m).x.r;
  assert.ok(Math.abs(Math.abs(r[0]) - 1) < 1e-9);
});

test("the referee's picture uses the fitted frames, in noise units, best fit first", () => {
  const series = refereePlotSeries(cands, m);
  assert.deepEqual(series.map((s) => s.title), ["Law b", "Law c", "Law a"]);
  const lastFitted = t[27];
  for (const s of series) {
    assert.equal(s.t.length, 28);
    assert.ok(Math.max(...s.t) <= lastFitted + 1e-12);
  }
  assert.ok(Math.abs(Math.max(...series[0].r.map(Math.abs)) - 1) < 1e-9);
});

import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { compileLaw, fitLaw, splitIndex, type Law } from "../lib/physics/law";
import { measure, rulerExtent } from "../lib/measure";
import type { Sample, Track } from "../lib/meta/sam";
import { clockSentence, PIPELINE, recordAge, refereeBoard, roughFactor, type Candidate, type Experiment } from "../lib/experiment";
import { OBS_SCHEMA, presetUncertainty, RULER_PRESETS, reviseAgentic, type Observation } from "../lib/scientist";
import { byteRange, refusalStands, underCap, REFUSAL_TTL_MS } from "../lib/guards";
import { asrKeywords, releaseTurn, spokenLength, timedTurns, VOICE_LANGUAGES } from "../lib/i18n";
import { lastSuccess, Ledger, respond } from "../lib/meta/client";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/* ── fix 18: the fitter's own bookkeeping ── */

test("law: a converged fit records how many steps it took, not 9999", () => {
  const t = Array.from({ length: 40 }, (_, i) => i / 30);
  const y = t.map((x) => 1 - 0.5 * 9.81 * x * x + 0.001 * Math.sin(37 * x));
  const law: Law = { id: "fall", title: "fall", summary: "", state: ["y", "vy"], derivatives: { y: "vy", vy: "-g" }, params: [{ name: "g", guess: 8, min: 1, max: 20 }], observe: { y: "y" } };
  const f = fitLaw(law, { t, ch: { y } }, { starts: 1 });
  assert.ok(f.ok);
  assert.ok(f.iterations >= 1 && f.iterations < 120, `iterations ${f.iterations}`);
});

test("law: when one event fires, every other guard is re-read, so a reset doesn't fire a second event a step later", () => {
  // a ball dropped onto a floor: "floor" bounces it; "rise" would fire only on a crossing of v through 0 upwards. The
  // bounce flips v from negative to positive in an instant: with the stale guard it fired "rise" on the next step
  const law: Law = {
    id: "b", title: "b", summary: "", state: ["y", "v"], derivatives: { y: "v", v: "-9.81" }, params: [], observe: { y: "y" },
    events: [{ name: "floor", when: "y", then: { v: "-0.8*v" } }, { name: "rise", when: "-v", then: { v: "v" } }],
  };
  const c = compileLaw(law);
  const times = Array.from({ length: 120 }, (_, i) => i / 60);
  const run = c.run(Float64Array.from([1, -0.1]), times);
  assert.ok(run.events.some((e) => e.name === "floor"));
  assert.equal(run.events.filter((e) => e.name === "rise").length, 0);
});

test("clip route: suffix ranges are the last n bytes; open and closed ranges as before", () => {
  assert.deepEqual(byteRange("bytes=-500", 1000), { start: 500, end: 999 });
  assert.deepEqual(byteRange("bytes=-5000", 1000), { start: 0, end: 999 });
  assert.deepEqual(byteRange("bytes=100-", 1000), { start: 100, end: 999 });
  assert.deepEqual(byteRange("bytes=0-1", 1000), { start: 0, end: 1 });
  assert.deepEqual(byteRange("bytes=10-5000", 1000), { start: 10, end: 999 });
  assert.equal(byteRange("bytes=2000-", 1000), null);
  assert.equal(byteRange("bytes=-0", 1000), null);
  assert.equal(byteRange(null, 1000), "all");
  assert.equal(byteRange("items=0-1", 1000), "all");
  const src = readFileSync("app/api/clip/[id]/route.ts", "utf8");
  assert.match(src, /byteRange\(/);
});

test("series: one visitor's starts are capped per day, and the route counts them", () => {
  let d: Record<string, number> = {};
  for (let i = 0; i < 3; i++) d = underCap(d, "1.2.3.4", 3)!;
  assert.equal(d["1.2.3.4"], 3);
  assert.equal(underCap(d, "1.2.3.4", 3), null);
  assert.equal(underCap(d, "5.6.7.8", 3)!["5.6.7.8"], 1);
  const src = readFileSync("app/api/series/route.ts", "utf8");
  assert.match(src, /underCap\(/);
  assert.match(src, /status: 429/);
});

test("translate: spend is checked against the daily cap and counted; a refusal stands for a day only", () => {
  const now = Date.parse("2026-10-27T12:00:00Z");
  assert.equal(refusalStands({ refused: true, at: "2026-10-27T00:00:00Z" }, now), true);
  assert.equal(refusalStands({ refused: true, at: new Date(now - REFUSAL_TTL_MS - 1).toISOString() }, now), false);
  // refusals written before they carried a time may be tried once more
  assert.equal(refusalStands({ refused: true }, now), false);
  assert.equal(refusalStands({ refused: false, at: "2026-10-27T00:00:00Z" }, now), false);
  const src = readFileSync("lib/translate.ts", "utf8");
  const body = src.slice(src.indexOf("export async function translate("));
  assert.match(body, /spentToday\(/);
  assert.match(body, /DAILY_USD/);
  assert.match(body, /addSpend\(/);
  assert.match(src, /refusalStands\(/);
  assert.match(src, /refused: true, at:/);
});

test("health: a successful call records the model's time, and /api/health reports it", async () => {
  process.env.META_API_KEY = "test-key";
  globalThis.fetch = (async () => new Response(JSON.stringify({ id: "r", output: [], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 })) as typeof fetch;
  const before = Date.now();
  await respond({ model: "muse-spark-1.3", input: [] }, new Ledger(), "test");
  assert.ok(Date.parse(lastSuccess["muse-spark-1.3"]) >= before - 5);
  assert.match(readFileSync("app/api/health/route.ts", "utf8"), /lastSuccess = await lastCalls\(\)/);
});

/* ── fix 11: the held-out 30% is sealed in measurement ── */

function sample(f: number, cx: number, cy: number): Sample {
  return { f, cx, cy, area: 300, angle: 0, major: 20, minor: 20, len: 20, wid: 20, box: [cx - 10, cy - 10, cx + 10, cy + 10], conf: 0.9 };
}

test("measure: the scale from the fall, the noise unit and the pivot read the fitted frames only", () => {
  const times = Array.from({ length: 90 }, (_, i) => i / 60);
  // a ball thrown up and falling, 2000 px/s² of gravity in the picture, with a little deterministic jitter
  const fall = (i: number) => 100 - 300 * times[i] + 1000 * times[i] ** 2 + 0.3 * Math.sin(i * 2.7);
  const clean: Track = { id: "1", noun: "ball", samples: times.map((_, i) => sample(i, 300 + 40 * times[i] + 0.2 * Math.cos(i * 1.9), fall(i))) };
  const a = measure({ track: clean, times, kind: "flight", gravity: 9.81 });
  const split = a.split!;
  assert.equal(split, splitIndex(a.series.t.length));
  // spoil every held-out frame: nothing measured from the path may move
  const heldFrom = a.px[split].f;
  const spoiled: Track = { ...clean, samples: clean.samples.map((s) => (s.f >= heldFrom ? { ...s, cy: s.cy + 25 * Math.sin(s.f), cx: s.cx - 9 * Math.cos(s.f * 3) } : s)) };
  const b = measure({ track: spoiled, times, kind: "flight", gravity: 9.81 });
  assert.equal(b.calibration.kind, "gravity");
  assert.equal(b.window.f0, a.window.f0);
  assert.equal(b.calibration.metresPerPixel, a.calibration.metresPerPixel);
  assert.deepEqual(b.noise, a.noise);

  // a pendulum: the pivot comes from the fitted frames
  const swing = (i: number) => 0.5 * Math.cos(2 * Math.PI * 0.8 * times[i]);
  const pend: Track = { id: "2", noun: "bob", samples: times.map((_, i) => sample(i, 400 + 300 * Math.sin(swing(i)), 50 + 300 * Math.cos(swing(i)))) };
  const p1 = measure({ track: pend, times, kind: "swing", noGravityRuler: true });
  const from = p1.px[p1.split!].f;
  const pend2: Track = { ...pend, samples: pend.samples.map((s) => (s.f >= from ? { ...s, cx: s.cx + 30, cy: s.cy - 12 } : s)) };
  const p2 = measure({ track: pend2, times, kind: "swing", noGravityRuler: true });
  assert.ok(p1.pivot && p2.pivot);
  assert.equal(p2.pivot!.r, p1.pivot!.r);
  assert.equal(p2.pivot!.x, p1.pivot!.x);
});

test("referee board: the law code chose is labelled as the one fact from the held-out frames", () => {
  const t = Array.from({ length: 20 }, (_, i) => i / 30);
  const c = { law: { id: "a", title: "A", summary: "", state: ["x"], derivatives: { x: "0" }, params: [], observe: { x: "x" } }, fit: { lawId: "a", ok: true, theta: {}, sigma: {}, trainCost: 1, trainRms: 1, testRms: 1, testMax: 1, bic: 1, n: 20, k: 1, iterations: 1, events: [], predicted: { x: t } }, origin: "muse", rank: 1 } as unknown as Candidate;
  const board = refereeBoard([c], { series: { t, ch: { x: t } }, noise: { x: 0.1 } });
  assert.equal(board.the_law_code_chose, "a");
  assert.match(board.where_that_choice_comes_from, /held-out frames/);
  assert.doesNotMatch(JSON.stringify(board), /rank|testRms|testZ/i);
});

test("lint: no hand-rolled upper median (length >> 1]) in the pipeline; lib/median.ts is the one median", () => {
  // files other lanes own and are fixing: listed so a new occurrence anywhere else fails
  const pending = new Set(["components/clipPrep.ts", "scripts/marey.ts", "scripts/video-numbers.ts"]);
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const p = path.posix.join(dir, f.name);
      if (f.isDirectory()) walk(p);
      else if (/\.(ts|tsx|mjs)$/.test(f.name) && p !== "lib/median.ts" && !pending.has(p) && readFileSync(p, "utf8").includes("length >> 1]")) hits.push(p);
    }
  };
  for (const d of ["lib", "scripts", "app", "components"]) if (existsSync(d)) walk(d);
  assert.deepEqual(hits, []);
});

/* ── fix 16: the ruler ── */

test("ruler: σ in px is the masks' frame-to-frame scatter over √n with a 1 px edge", () => {
  const still = rulerExtent([100, 100, 100, 100, 100]);
  assert.equal(still.px, 100);
  assert.equal(still.sigmaPx, 1);
  const lens = [96, 98, 100, 102, 104, 100, 99, 101, 100];
  const r = rulerExtent(lens);
  const mad = 1; // |x − 100| sorted: 0,0,0,1,1,2,2,4,4 → median 1
  assert.equal(r.px, 100);
  assert.ok(Math.abs(r.sigmaPx - Math.hypot((1.4826 * mad) / 3, 1)) < 1e-12);
  // a standing person's height: the tallest quarter
  assert.equal(rulerExtent([130, 131, 132, 133, 134, 135, 136, 137], 0.75).px, 136);
});

test("ruler presets: the schema and the prompt agree on paper, and every /new preset carries its own uncertainty", () => {
  const ref = (OBS_SCHEMA.properties.reference.properties as Record<string, { description?: string }>).relative_uncertainty.description!;
  assert.match(ref, /0\.06 for a plain sheet/);
  assert.match(ref, /0\.003 only for a sheet labelled/);
  const src = readFileSync("lib/scientist.ts", "utf8");
  assert.match(src, /relative_uncertainty 0\.06/);
  assert.match(src, /only a sheet labelled A4[^"]*gets 0\.003/);
  const tsx = readFileSync("components/NewExperiment.tsx", "utf8");
  const options = [...tsx.matchAll(/<option value="([^"|]+)\|([\d.]+)"/g)].map((m) => ({ noun: m[1], metres: Number(m[2]) }));
  assert.ok(options.length >= 4);
  for (const o of options) assert.ok(presetUncertainty(o.noun, o.metres) !== undefined, `${o.noun} has no preset uncertainty`);
  assert.equal(presetUncertainty("white A4 sheet of paper", 0.297), 0.003);
  assert.equal(presetUncertainty("metre stick", 1), 0.002);
  assert.equal(presetUncertainty("white paper", 0.297), undefined);
  for (const p of RULER_PRESETS) assert.ok(p.rel > 0 && p.rel < 0.05);
});

/* ── fix 10 item: no ± on a factor derived from a rough value ── */

test("clock: a factor from a g with no error bar is a range in words, never a ±", () => {
  assert.equal(roughFactor(4.27), "4 to 4.5");
  assert.equal(roughFactor(1.46), "1.4 to 1.5");
  assert.equal(roughFactor(12.3), "12 to 13");
  const s = clockSentence(1 / 4.27 ** 2, 4.27, "earth", true);
  assert.match(s, /about 4 to 4\.5× slower/);
  assert.doesNotMatch(s, /±/);
  assert.match(readFileSync("lib/experiment.ts", "utf8"), /\.\.\.\(rough \? \{\} : \{ sigma:/);
});

/* ── fix 13: Muse Wonder ── */

test("Muse Wonder: one tool call per turn is enforced, the budget is in the prompt, its reasoning is stored, and each attempt's plot is shown", async () => {
  process.env.META_API_KEY = "test-key";
  const sent: { input: unknown; reasoning: unknown }[] = [];
  const wire = (title: string) => JSON.stringify({ id: "x", title, summary: "", state: ["x"], derivatives: [{ state: "x", expr: "0" }], params: [], observe: [{ channel: "x", expr: "x" }], events: [], if_it_wins: "" });
  let turn = 0;
  globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    sent.push({ input: body.input, reasoning: body.reasoning });
    turn++;
    const output =
      turn === 1
        ? [{ type: "reasoning", summary: [{ type: "summary_text", text: "Try a drag term first." }] }, { type: "function_call", name: "fit_law", call_id: "c1", arguments: wire("drag") }, { type: "function_call", name: "fit_law", call_id: "c2", arguments: wire("spring") }]
        : [{ type: "reasoning", summary: [{ type: "summary_text", text: "Drag removes the drift." }] }, { type: "function_call", name: "submit_law", call_id: "c3", arguments: wire("drag") }];
    return new Response(JSON.stringify({ id: `r${turn}`, output, usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
  }) as typeof fetch;
  let fits = 0;
  const obs = { phenomenon: "test", what_happens: "x", body: "earth" } as unknown as Observation;
  const out = await reviseAgentic(obs, {}, "drift", async () => { fits++; return { ok: true, train_rms: 0.1, __residual_plot_png: new Uint8Array([137, 80, 78, 71]) }; }, new Ledger(), undefined, 3);
  assert.equal(fits, 1, "only the first call of a turn runs");
  assert.equal(out.law?.title, "drag");
  assert.equal(out.turns.length, 2);
  assert.equal(out.turns[0].reasoning, "Try a drag term first.");
  assert.equal(out.turns[0].ignored, 1);
  assert.equal(out.turns[1].tool, "submit_law");
  const first = JSON.stringify(sent[0].input);
  assert.match(first, /You have 3 turns/);
  assert.match(first, /at most 2 fit_law tries/);
  assert.deepEqual(sent[0].reasoning, { effort: "medium", summary: "concise" });
  const second = JSON.stringify(sent[1].input);
  assert.match(second, /not run: one tool call per turn/);
  assert.match(second, /data:image\/png;base64,/);
  assert.doesNotMatch(second, /__residual_plot_png/);
});

/* ── fix 14: the voice ── */

test("voice: keywords per language, timed turns, a release word sets the window start, lengths parsed in all seven", () => {
  const hi = asrKeywords("Hindi");
  for (const w of ["धागा", "लंबाई", "सेंटीमीटर", "छोड़", "chhod", "lambai"]) assert.ok(hi.includes(w), w);
  assert.ok(asrKeywords("Hindi").includes("pendulum"));
  assert.ok(asrKeywords().length <= 50);
  assert.equal(timedTurns([{ startMs: 2300, transcript: " धागा पचास सेंटीमीटर " }, { startMs: 4000, transcript: "अब छोड़ रहा हूँ" }]), "[2.3 s] धागा पचास सेंटीमीटर\n[4.0 s] अब छोड़ रहा हूँ");
  assert.deepEqual(releaseTurn([{ startMs: 1000, transcript: "धागा पचास सेंटीमीटर का है" }, { startMs: 2300, transcript: "अब छोड़ रहा हूँ" }], "Hindi"), { at: 2.3, word: "छोड़", turn: "अब छोड़ रहा हूँ" });
  assert.equal(releaseTurn([{ startMs: 1000, transcript: "the string is fifty centimetres" }], "English"), null);
  const said: Record<string, string> = {
    English: "the string is fifty centimetres long",
    Hindi: "धागे की लंबाई ६० सेंटीमीटर है",
    Tamil: "நூலின் நீளம் நாற்பது சென்டிமீட்டர்",
    Bengali: "সুতোর দৈর্ঘ্য সত্তর সেন্টিমিটার",
    Marathi: "दोऱ्याची लांबी ऐंशी सेंटीमीटर आहे",
    Telugu: "దారం పొడవు 30 సెంటీమీటర్లు",
    Spanish: "la cuerda mide noventa centímetros",
  };
  const want: Record<string, number> = { English: 0.5, Hindi: 0.6, Tamil: 0.4, Bengali: 0.7, Marathi: 0.8, Telugu: 0.3, Spanish: 0.9 };
  for (const l of VOICE_LANGUAGES) assert.ok(Math.abs((spokenLength(said[l], l)?.metres ?? NaN) - want[l]) < 1e-9, `${l}: ${JSON.stringify(spokenLength(said[l], l))}`);
  assert.equal(spokenLength("1.2 m", "English")?.metres, 1.2);
  assert.equal(spokenLength("no length here", "English"), null);
  assert.match(readFileSync("lib/experiment.ts", "utf8"), /window set from your voice at/);
});

/* ── fix 12: stale records are disclosed ── */

const records = () => {
  const out: Experiment[] = [];
  for (const d of ["data/showcase", "bench/runs/synth"]) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) if (f.endsWith(".json") && f !== "order.json" && !f.endsWith(".error.json")) out.push(JSON.parse(readFileSync(`${d}/${f}`, "utf8")) as Experiment);
  }
  return out.filter((e) => e.ledger && e.video);
};

test("records: a run on the current pipeline (SAM timed) carries the referee's residual feature", () => {
  const current = records().filter((e) => e.pipeline === PIPELINE && e.ledger.calls.some((c) => c.model.startsWith("sam") && c.ms > 0));
  assert.ok(current.length >= 3, `only ${current.length} current records`);
  for (const e of current) if (e.critique) assert.ok(e.critique.residual_feature, `${e.id} has no residual_feature`);
});

test("records: SAM rows with no time and by-eye calls with no frame count are disclosed as an older pipeline", () => {
  const moon = JSON.parse(readFileSync("data/showcase/moon-jump.json", "utf8")) as Experiment;
  const age = recordAge(moon);
  assert.ok(age.samUntimed > 0);
  assert.ok(age.older);
  assert.ok(age.reasons.some((r) => /time not recorded/.test(r)));
  assert.deepEqual(age.eyeball, { frames: 240, estimated: false });
  const hindi = JSON.parse(readFileSync("data/showcase/hindi-pendulum.json", "utf8")) as Experiment;
  const h = recordAge(hindi);
  assert.ok(h.eyeball?.estimated);
  // 1924 input tokens at 1280×720: about 14 frames (2 a second over 7 s)
  assert.ok(Math.abs(h.eyeball!.frames - 14) <= 1, String(h.eyeball?.frames));
  assert.ok(h.reasons.some((r) => /saw ~\d+ frames \(older pipeline/.test(r)));
});

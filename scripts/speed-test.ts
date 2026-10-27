// usage: tsx --conditions=react-server scripts/speed-test.ts
// The fair version of the memory test. Muse Spark sees the two Apollo clips (real speed, and secretly slowed 1.5×):
//  1. each clip alone, asked for the acceleration as the video plays and whether it plays at real speed;
//  2. both clips together, asked whether either is slowed and by what factor;
//  3. both clips with two tools bound to Ansatz's stored measurements: measure_motion (each clip as filmed) and
//     compare_clips (the ratio of the two, which needs no reference value at all).
// Results go to data/showcase/moon-jump.json as extras.speedTest.
import "./env";
import { readFileSync, writeFileSync } from "node:fs";
import { Ledger, outputText, respond, respondJson, uploadFile } from "../lib/meta/client";
import { videoPart } from "../lib/scientist";
import { readVideoInfo } from "../lib/video";
import type { Experiment } from "../lib/experiment";

const ledger = new Ledger();
const load = (id: string) => JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;
const real = load("moon-jump"), slow = load("moon-jump-slowed");
const clips = [
  { label: "A", file: "public/showcase/moon-jump.mp4", e: real },
  { label: "B", file: "public/showcase/moon-jump-slowed.mp4", e: slow },
];
const parts = await Promise.all(
  clips.map(async (c) => {
    const b = readFileSync(c.file), vi = readVideoInfo(b);
    return { ...c, part: videoPart(await uploadFile(b, `${c.label}.mp4`, "video/mp4"), vi.fps, vi.duration).part };
  }),
);
const ruler = "For scale, the jumping astronaut (John Young in his suit) is about 1.88 m tall.";

// 1. each clip alone
const single = [] as { clip: string; playback_accel: number; real_speed: boolean; factor: number; reasoning: string }[];
for (const p of parts) {
  const { value } = await respondJson<{ playback_accel: number; real_speed: boolean; factor: number; reasoning: string }>(
    {
      model: "muse-spark-1.3",
      effort: "medium",
      input: [{ role: "user", content: [p.part, { type: "input_text", text: `${ruler} Watch the jump. (1) As the video plays, what downward acceleration does the astronaut's fall show, in metres per second squared of playback time? (2) Does this clip play at real speed? If not, by what factor is it slowed or sped up?` }] }],
      name: "speed",
      schema: { type: "object", additionalProperties: false, required: ["playback_accel", "real_speed", "factor", "reasoning"], properties: { playback_accel: { type: "number" }, real_speed: { type: "boolean" }, factor: { type: "number", description: "1 for real speed; 2 if it plays twice as slow" }, reasoning: { type: "string" } } },
      maxOutput: 6000,
    },
    ledger,
    `by eye, clip ${p.label} alone`,
  );
  single.push({ clip: p.label, ...value });
}

// 2. both clips together
const { value: pair } = await respondJson<{ slower: string; factor: number; reasoning: string }>(
  {
    model: "muse-spark-1.3",
    effort: "medium",
    input: [{ role: "user", content: [{ type: "input_text", text: "Clip A:" }, parts[0].part, { type: "input_text", text: "Clip B:" }, parts[1].part, { type: "input_text", text: `${ruler} These two clips show the same jump. Is either played at a different speed from the other? Say which is slower ("A", "B" or "neither") and by what factor.` }] }],
    name: "pair",
    schema: { type: "object", additionalProperties: false, required: ["slower", "factor", "reasoning"], properties: { slower: { type: "string", enum: ["A", "B", "neither"] }, factor: { type: "number" }, reasoning: { type: "string" } } },
    maxOutput: 6000,
  },
  ledger,
  "by eye, both clips",
);

// 3. with Ansatz's measurements as tools (bound to the stored runs; no new tracking)
const asFilmed = (e: Experiment) => { const c = e.comparisons[0]; return { law: e.candidates[0].law.title, downward_accel_as_filmed: +c.measured.toFixed(3), sigma: +c.sigma.toFixed(3), unit: "m/s² of playback time" }; };
const rows = real.extras!.memoryTest!.rows;
const ratio = Math.sqrt(rows[0].g / rows[1].g), sr = 0.5 * ratio * Math.hypot((rows[0].sigmaStat ?? rows[0].sigma) / rows[0].g, (rows[1].sigmaStat ?? rows[1].sigma) / rows[1].g);
const tools = [
  { type: "function", name: "measure_motion", description: "Ansatz's measurement of one clip: SAM 3.1 tracks the astronaut in every frame and the winning law of motion gives the downward acceleration as the clip plays, with its uncertainty.", parameters: { type: "object", additionalProperties: false, required: ["clip"], properties: { clip: { type: "string", enum: ["A", "B"] } } } },
  { type: "function", name: "compare_clips", description: "Ansatz's comparison of the two clips: how many times slower clip B plays than clip A, from the ratio of their measured accelerations (acceleration scales as 1/time²). It needs no reference value: the astronaut's assumed height cancels.", parameters: { type: "object", additionalProperties: false, required: [], properties: {} } },
];
let input: unknown = [{ role: "user", content: [{ type: "input_text", text: "Clip A:" }, parts[0].part, { type: "input_text", text: "Clip B:" }, parts[1].part, { type: "input_text", text: `${ruler} These two clips show the same jump. Is either played at a different speed from the other, and by what factor? You may use the tools.` }] }];
let prev: string | undefined, answer = "";
const calls: { name: string; result: unknown }[] = [];
for (let turn = 0; turn < 4; turn++) {
  const r = await respond({ model: "muse-spark-1.3", reasoning: { effort: "medium" }, max_output_tokens: 6000, tools, input, ...(prev ? { previous_response_id: prev } : {}) }, ledger, `with tools, turn ${turn + 1}`);
  prev = r.id;
  const fc = (r.output ?? []).filter((o) => (o as { type: string }).type === "function_call") as unknown as { name: string; arguments: string; call_id: string }[];
  if (!fc.length) { answer = outputText(r).trim(); break; }
  input = fc.map((c) => {
    const result = c.name === "compare_clips" ? { b_slower_than_a_by: +ratio.toFixed(2), sigma: +sr.toFixed(2), independent_of_reference: true } : asFilmed((JSON.parse(c.arguments) as { clip: string }).clip === "B" ? slow : real);
    calls.push({ name: `${c.name}(${c.arguments === "{}" ? "" : c.arguments})`, result });
    return { type: "function_call_output", call_id: c.call_id, output: JSON.stringify(result) };
  });
}
real.extras = { ...real.extras!, speedTest: { truth: 1.5, single, pair, withTools: { calls, answer }, usd: +ledger.usd.toFixed(3) } };
writeFileSync("data/showcase/moon-jump.json", JSON.stringify(real));
console.log(JSON.stringify(real.extras.speedTest, null, 1));

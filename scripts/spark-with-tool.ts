// usage: tsx --conditions=react-server scripts/spark-with-tool.ts <clip.mp4> <showcase-id> [--noun x] [--ruler noun=metres~rel] [--window a-b]
// Muse Spark answers "what is g in this clip?" twice: once by eye, once with Ansatz as a function tool. The tool is
// real: it runs the whole pipeline on the same clip. The exchange is stored on the showcase as extras.toolTest.
import "./env";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { Ledger, outputText, respond, uploadFile } from "../lib/meta/client";
import { runExperiment } from "../lib/experiment";
import { videoPart } from "../lib/scientist";
import { readVideoInfo } from "../lib/video";

const args = process.argv.slice(2);
const [clip, id] = args;
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const bytes = readFileSync(clip);
const vi = readVideoInfo(bytes);
const ledger = new Ledger();
const fileId = await uploadFile(bytes, basename(clip), "video/mp4");
const question = "What is the gravitational acceleration acting on the jumping astronaut in this clip, in m/s²? Give one number and say how sure you are.";
const tools = [
  {
    type: "function",
    name: "measure_motion",
    description: "Measures the motion in this clip: SAM 3.1 tracks the moving object in every frame, candidate laws of motion are fitted to the first 70% and judged on predicting the rest, and the winner's constants come back with uncertainties, plus a check of whether the clip's clock runs at real time.",
    parameters: { type: "object", additionalProperties: false, required: ["object"], properties: { object: { type: "string", description: "what moves, e.g. 'astronaut'" } } },
  },
];
let toolResult: Record<string, unknown> | null = null;
let input: unknown = [{ role: "user", content: [videoPart(fileId, vi.fps, vi.duration).part, { type: "input_text", text: question }] }];
let prev: string | undefined;
let answer = "";
let calledWith = "";
for (let turn = 0; turn < 3; turn++) {
  const r = await respond({ model: "muse-spark-1.3", reasoning: { effort: "medium" }, max_output_tokens: 6000, tools, input, ...(prev ? { previous_response_id: prev } : {}) }, ledger, `Spark with a tool, turn ${turn + 1}`);
  prev = r.id;
  const calls = (r.output ?? []).filter((o) => (o as { type: string }).type === "function_call") as unknown as { name: string; arguments: string; call_id: string }[];
  if (!calls.length) {
    answer = outputText(r);
    break;
  }
  const outs: unknown[] = [];
  for (const c of calls) {
    calledWith = c.arguments;
    const noun = (JSON.parse(c.arguments) as { object?: string }).object || opt("--noun") || "moving object";
    const rul = opt("--ruler");
    const e = await runExperiment(
      { video: bytes, filename: basename(clip), hints: { noun, window: opt("--window") ? { start_s: +opt("--window")!.split("-")[0], end_s: +opt("--window")!.split("-")[1] } : undefined, ruler: rul ? { noun: rul.split("=")[0], metres: +rul.split("=")[1].split("~")[0], relUncertainty: rul.includes("~") ? +rul.split("~")[1] : undefined } : undefined }, skipEyeball: true },
      () => {},
    );
    const g = e.comparisons[0];
    const w = e.candidates[0];
    const constants = w.law.params.filter((p) => !p.fixed && p.name !== "cal").map((p) => ({ name: p.name, meaning: p.meaning, value: +w.fit.theta[p.name].toPrecision(4), sigma: +(w.fit.sigma[p.name] ?? 0).toPrecision(2), unit: p.unit }));
    toolResult = { law: w.law.title, equations: w.law.derivatives, constants, compared_with_reference: g ? { quantity: g.param, value: +g.measured.toFixed(3), sigma: +g.sigma.toFixed(3), reference: g.reference, label: g.label } : null, clock: e.clock ? { slowdown_factor: +e.clock.factor.toFixed(2), note: e.clock.note } : (g ? "the clip's clock is consistent with real time" : "not checked (no reference value was compared)"), cost_usd: +e.ledger.usd.toFixed(3) };
    for (const call of e.ledger.calls) ledger.add({ ...call, purpose: `inside the tool: ${call.purpose}` });
    outs.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(toolResult) });
  }
  input = outs;
}
const f = `data/showcase/${id}.json`;
const exp = JSON.parse(readFileSync(f, "utf8"));
exp.extras = { ...(exp.extras ?? {}), toolTest: { question, calledWith, toolResult, answer: answer.trim(), usd: +ledger.usd.toFixed(3) } };
writeFileSync(f, JSON.stringify(exp));
console.log(JSON.stringify(exp.extras.toolTest, null, 1));

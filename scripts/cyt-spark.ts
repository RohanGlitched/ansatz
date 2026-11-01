// usage: tsx --conditions=react-server scripts/cyt-spark.ts [n=5] [budgetUsd=1.50] [spentBeforeUsd=0]
// "Can you tell?" as Muse Spark plays it: each of the six clips the visitor sees (public/cyt, the same files, uploaded
// unchanged) with the quiz's own question, n times each, answered into a closed schema that can say "sped up". The only
// extra words are the scale cue the page itself states for that clip (none for most) and the playback rate of the
// frames it is shown. Results: data/cyt/spark-quiz.json, read by app/cyt.ts. Stops before a call that could push the
// spend past the budget.
import "./env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { Ledger, deleteFile, respondJson, uploadFile } from "../lib/meta/client";
import { videoPart } from "../lib/scientist";
import { readVideoInfo } from "../lib/video";
import { majorityOf } from "../lib/cytScore";

const n = Number(process.argv[2] ?? 5);
const budget = Number(process.argv[3] ?? 1.5);
// spend from an earlier, aborted attempt counts against the same budget
const spentBefore = Number(process.argv[4] ?? 0);
const MODEL = "muse-spark-1.3";
// low, as for the by-eye baseline in lib/scientist.ts: at medium the first attempt ran past 6000 output tokens on one
// answer, and thirty medium answers would not fit the budget
const EFFORT = "low";
const MAX_OUT = 12000;
const OUT_PRICE = 4.25 / 1e6;
const ledger = new Ledger();

const QUESTION = "Does this clip play at real speed, slowed down, or sped up? Judge from how things move, not from captions. If not real speed, estimate the factor.";
type Verdict = "real time" | "slowed" | "sped up";

// in the order the page shows them; the truth is stored for scoring only and never reaches the prompt
const clips: { id: string; truth: Verdict; truthFactor: number; cue: string | null; cueWhy: string }[] = [
  { id: "cyt-1", truth: "sped up", truthFactor: 5, cue: null, cueWhy: "none: the page gives no scale for this clip" },
  { id: "cyt-2", truth: "real time", truthFactor: 1, cue: "For scale, the astronaut is about 1.88 m tall.", cueWhy: "the astronaut's height, which the page states" },
  { id: "cyt-3", truth: "real time", truthFactor: 1, cue: "For scale, the string is about 50 cm long.", cueWhy: "the string's length, which the page states" },
  { id: "cyt-4", truth: "slowed", truthFactor: 4.8, cue: null, cueWhy: "none: the page gives no scale for this clip" },
  { id: "cyt-5", truth: "slowed", truthFactor: 1.5, cue: "For scale, the astronaut is about 1.88 m tall.", cueWhy: "the astronaut's height, which the page states" },
  { id: "cyt-6", truth: "real time", truthFactor: 1, cue: null, cueWhy: "none: the page gives no scale for this clip" },
];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "factor", "reasoning"],
  properties: {
    verdict: { type: "string", enum: ["real time", "slowed", "sped up"] },
    factor: { type: "number", description: "How many times slower or faster than real life it plays: 1 for real speed; 2 if slowed means half speed, 2 if sped up means double speed" },
    reasoning: { type: "string" },
  },
};

type Answer = { verdict: Verdict; factor: number; reasoning: string; model: string; usd: number };
const results: { id: string; file: string; fps: number; frames: number; durationS: number; cue: string | null; cueWhy: string; prompt: string; truth: Verdict; truthFactor: number; answers: Answer[] }[] = [];

// the most the next call can cost: the dearest input so far, padded, plus a full output allowance
let maxIn = 0;
const worst = () => (maxIn || 0.05) * 1.1 + MAX_OUT * OUT_PRICE;
let stopped: string | null = null;
const failures: { id: string; repeat: number; error: string }[] = [];
const spent = () => spentBefore + ledger.usd;

outer: for (const c of clips) {
  const file = `public/cyt/${c.id}.mp4`;
  const b = readFileSync(file), vi = readVideoInfo(b);
  const vid = videoPart(await uploadFile(b, `${c.id}.mp4`, "video/mp4"), vi.fps, vi.duration);
  const prompt = [`You are shown ${vid.frames} frames, ${vid.fps.toFixed(2)} per second of the clip as it plays.`, c.cue, QUESTION].filter(Boolean).join(" ");
  const row = { id: c.id, file, fps: +vid.fps.toFixed(3), frames: vid.frames, durationS: +vi.duration.toFixed(3), cue: c.cue, cueWhy: c.cueWhy, prompt, truth: c.truth, truthFactor: c.truthFactor, answers: [] as Answer[] };
  results.push(row);
  for (let i = 0; i < n; i++) {
    let value: { verdict: Verdict; factor: number; reasoning: string } | null = null;
    let usd = 0, model = MODEL;
    for (let attempt = 0; attempt < 3 && !value; attempt++) {
      if (spent() + worst() > budget) {
        stopped = `Stopped before ${c.id} repeat ${i + 1}: $${spent().toFixed(3)} spent, and the next call could cost up to $${worst().toFixed(3)} against a $${budget.toFixed(2)} budget.`;
        console.log(stopped);
        await deleteFile(vid.part.file_id);
        break outer;
      }
      const before = ledger.usd, k = ledger.calls.length;
      try {
        value = (
          await respondJson<{ verdict: Verdict; factor: number; reasoning: string }>(
            { model: MODEL, effort: EFFORT, input: [{ role: "user", content: [vid.part, { type: "input_text", text: prompt }] }], name: "speed", schema: SCHEMA, maxOutput: MAX_OUT },
            ledger,
            `can you tell, ${c.id}, repeat ${i + 1}${attempt ? `, attempt ${attempt + 1}` : ""}`,
          )
        ).value;
      } catch (e) {
        failures.push({ id: c.id, repeat: i + 1, error: (e as Error).message.slice(0, 200) });
        console.log(c.id, i + 1, "failed:", (e as Error).message.slice(0, 160));
      }
      for (const call of ledger.calls.slice(k)) {
        model = call.model;
        const inUsd = (((call.inputTokens ?? 0) - (call.cachedTokens ?? 0)) * 1.25 + (call.cachedTokens ?? 0) * 0.15) / 1e6;
        maxIn = Math.max(maxIn, inUsd);
      }
      usd += ledger.usd - before;
    }
    if (!value) continue;
    row.answers.push({ verdict: value.verdict, factor: value.factor, reasoning: value.reasoning, model, usd: +usd.toFixed(4) });
    console.log(c.id, i + 1, value.verdict, value.factor, model, `call $${usd.toFixed(4)}`, `running $${spent().toFixed(3)}`);
  }
  await deleteFile(vid.part.file_id);
}

const out = {
  model: MODEL,
  effort: EFFORT,
  date: new Date().toISOString(),
  n,
  question: QUESTION,
  note: `Each clip is the file the visitor sees (public/cyt), uploaded unchanged and shown at its own frame rate (all six are under 300 frames, so none is thinned). The prompt is the quiz's question, after one line giving the frame rate and, where the page itself states one, a scale cue: the two Apollo clips got "${clips[1].cue}", the Aachen pendulum got "${clips[2].cue}", and the other three clips (both Foucault cuts and the gym ball) got no cue. The answer is held to a closed schema: verdict "real time", "slowed" or "sped up", a factor and the reasoning. Each clip was asked ${n} times in separate calls, at ${EFFORT} reasoning effort; the verdict is the majority.${spentBefore ? ` An earlier attempt at medium effort stopped on its second call, when an answer ran past 6000 output tokens; its spend, about $${spentBefore.toFixed(2)} (estimated from the first call's price), is counted in usd.` : ""}`,
  budgetUsd: budget,
  usd: +spent().toFixed(4),
  usdThisRun: +ledger.usd.toFixed(4),
  stopped,
  failures,
  clips: results.map((r) => {
    const m = majorityOf(r.answers.map((a) => a.verdict));
    return { ...r, majority: m.verdict, majorityCount: m.count, right: m.verdict === r.truth };
  }),
};
mkdirSync("data/cyt", { recursive: true });
writeFileSync("data/cyt/spark-quiz.json", JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out.clips.map((c) => [c.id, c.majority, `${c.majorityCount}/${c.answers.length}`, c.right])), "usd", spent().toFixed(4));

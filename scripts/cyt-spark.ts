// usage: tsx --conditions=react-server scripts/cyt-spark.ts [--parity] [n=5] [budgetUsd=1.50] [spentBeforeUsd=0]
// --parity asks again, on the clips where Ansatz's run was told a length the quiz did not give (both Foucault cuts and
// the gym ball), with that same length and the same footage the run had (the run's whole clip, not the page's 6 s
// crop), and stores the answers as a second, labelled set under "parity" in the same file, keeping the first set as it is.
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

const parity = process.argv.includes("--parity");
const args = process.argv.slice(2).filter((a) => a !== "--parity");
const n = Number(args[0] ?? 5);
const budget = Number(args[1] ?? 1.5);
// spend from an earlier, aborted attempt counts against the same budget
const spentBefore = Number(args[2] ?? 0);
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
type Clip = { id: string; truth: Verdict; truthFactor: number; cue: string | null; cueWhy: string; file?: string; sees?: string };
const firstSet: Clip[] = [
  { id: "cyt-1", truth: "sped up", truthFactor: 5, cue: null, cueWhy: "none: the page gives no scale for this clip" },
  { id: "cyt-2", truth: "real time", truthFactor: 1, cue: "For scale, the astronaut is about 1.88 m tall.", cueWhy: "the astronaut's height, which the page states" },
  { id: "cyt-3", truth: "real time", truthFactor: 1, cue: "For scale, the string is about 50 cm long.", cueWhy: "the string's length, which the page states" },
  { id: "cyt-4", truth: "slowed", truthFactor: 4.8, cue: null, cueWhy: "none: the page gives no scale for this clip" },
  { id: "cyt-5", truth: "slowed", truthFactor: 1.5, cue: "For scale, the astronaut is about 1.88 m tall.", cueWhy: "the astronaut's height, which the page states" },
  { id: "cyt-6", truth: "real time", truthFactor: 1, cue: null, cueWhy: "none: the page gives no scale for this clip" },
];
// the parity set: what each Ansatz run was given (its record's given[]), and the footage that run measured; the gym ball
// last, so a budget stop costs the clip that does not decide the tally
const FOUCAULT_CUE = "For scale, this pendulum is 8.97 m long.";
const paritySet: Clip[] = [
  { id: "cyt-1", truth: "sped up", truthFactor: 5, cue: FOUCAULT_CUE, cueWhy: "the length Ansatz's run was told (data/showcase/foucault-pendulum-5x.json given[])", file: "public/showcase/foucault-pendulum-5x.mp4", sees: "the run's whole 22.5 s clip, as Ansatz measured it, not the page's 6 s crop" },
  { id: "cyt-6", truth: "real time", truthFactor: 1, cue: FOUCAULT_CUE, cueWhy: "the length Ansatz's run was told (data/showcase/foucault-pendulum.json given[])", file: "public/showcase/foucault-pendulum.mp4", sees: "the run's whole 42 s clip, as Ansatz measured it, not the page's 6 s crop" },
  { id: "cyt-4", truth: "slowed", truthFactor: 4.8, cue: "For scale, the ball is about 75 cm across.", cueWhy: "the size Ansatz's run was told (data/strangers/gym-ball-bounce-240fps-b.json given[])", file: "public/cyt/cyt-4.mp4", sees: "the run's whole 2.5 s clip, cropped square around the ball (the page's own file)" },
];
const clips = parity ? paritySet : firstSet;

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
const results: { id: string; file: string; sees?: string; fps: number; frames: number; durationS: number; cue: string | null; cueWhy: string; prompt: string; truth: Verdict; truthFactor: number; answers: Answer[] }[] = [];

// the most the next call can cost: the dearest input so far, padded, plus a full output allowance
let maxIn = 0;
const worst = () => (maxIn || 0.05) * 1.1 + MAX_OUT * OUT_PRICE;
let stopped: string | null = null;
const failures: { id: string; repeat: number; error: string }[] = [];
const spent = () => spentBefore + ledger.usd;

outer: for (const c of clips) {
  const file = c.file ?? `public/cyt/${c.id}.mp4`;
  const b = readFileSync(file), vi = readVideoInfo(b);
  // uploaded under the quiz's neutral name, so the file name gives nothing away
  const vid = videoPart(await uploadFile(b, `${c.id}.mp4`, "video/mp4"), vi.fps, vi.duration);
  // a clip over 300 frames is thinned (videoPart, as for Ansatz's own observer): the line says how many frames it is shown, and at what rate of the clip
  const prompt = [`You are shown ${vid.frames} frames, ${vid.fps.toFixed(2)} per second of the clip as it plays.`, c.cue, QUESTION].filter(Boolean).join(" ");
  const row = { id: c.id, file, ...(c.sees ? { sees: c.sees } : {}), fps: +vid.fps.toFixed(3), frames: vid.frames, durationS: +vi.duration.toFixed(3), cue: c.cue, cueWhy: c.cueWhy, prompt, truth: c.truth, truthFactor: c.truthFactor, answers: [] as Answer[] };
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

const scored = results.map((r) => {
  const m = majorityOf(r.answers.map((a) => a.verdict));
  return { ...r, majority: m.verdict, majorityCount: m.count, right: m.verdict === r.truth };
});
if (parity) {
  // added beside the first set, which stays exactly as it was (app/cyt.ts reads the first set's fields)
  const prev = JSON.parse(readFileSync("data/cyt/spark-quiz.json", "utf8"));
  prev.parity = {
    label: "Information parity: asked again with what Ansatz's runs were given",
    model: MODEL,
    effort: EFFORT,
    date: new Date().toISOString(),
    n,
    question: QUESTION,
    note: `The first set gave Muse Spark no length on clips 1, 4 and 6, while Ansatz's runs of the same footage were told one (8.97 m for both Foucault cuts, 75 cm for the gym ball) and, for the two Foucault cuts, measured the run's whole clip (22.5 s and 42 s) where the quiz showed a 6 s crop. This set asks those three clips again with that same length as the scale cue and the same footage the run measured, thinned to at most 300 frames as Ansatz's own observer sees it, ${n} times each in separate calls at ${EFFORT} reasoning effort (Ansatz's observer runs at medium); the verdict is the majority. Everything else (model, question, schema) is as in the first set.`,
    budgetUsd: budget,
    usd: +spent().toFixed(4),
    stopped,
    failures,
    clips: scored,
  };
  writeFileSync("data/cyt/spark-quiz.json", JSON.stringify(prev, null, 1) + "\n");
  console.log(JSON.stringify(scored.map((c) => [c.id, c.majority, `${c.majorityCount}/${c.answers.length}`, c.right])), "usd", spent().toFixed(4));
  process.exit(0);
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
  clips: scored,
};
mkdirSync("data/cyt", { recursive: true });
writeFileSync("data/cyt/spark-quiz.json", JSON.stringify(out, null, 1) + "\n");
console.log(JSON.stringify(out.clips.map((c) => [c.id, c.majority, `${c.majorityCount}/${c.answers.length}`, c.right])), "usd", spent().toFixed(4));

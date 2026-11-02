// usage: tsx --conditions=react-server scripts/cyt-spark.ts [--parity | --medium] [n=5] [budgetUsd=1.50] [spentBeforeUsd=0]
// --medium asks all six clips again at MEDIUM reasoning effort (the effort Ansatz's own observer runs at), with the
// parity set's cues and footage on the three clips it covers and the page's own cue and file on the other three, one
// call per repeat with no retry, a 32,000-token output cap, and a cut-off answer (status "incomplete") counted as a
// failure even when the text that came back parses; stored as a third, labelled set under "parityMedium".
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
const medium = process.argv.includes("--medium");
const args = process.argv.slice(2).filter((a) => a !== "--parity" && a !== "--medium");
const n = Number(args[0] ?? 5);
const budget = Number(args[1] ?? 1.5);
// spend from an earlier, aborted attempt counts against the same budget
const spentBefore = Number(args[2] ?? 0);
const MODEL = "muse-spark-1.3";
// low, as for the by-eye baseline in lib/scientist.ts: at medium the first attempt ran past 6000 output tokens on one
// answer, and thirty medium answers would not fit the budget
// --medium: Ansatz's observer level (lib/scientist.ts observe), with room for a long reasoning trace
const EFFORT = medium ? "medium" : "low";
const MAX_OUT = medium ? 32000 : 12000;
// the medium set asks each repeat once: an answer that fails or is cut off is a failure, not a retry
const ATTEMPTS = medium ? 1 : 3;
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
// the medium set: every clip, with the parity cue and footage where the parity set has one, else the page's own; the
// gym ball last again, so a budget stop costs the clip that does not decide the verdict tally
const mediumSet: Clip[] = [...paritySet.filter((c) => c.id !== "cyt-4"), ...firstSet.filter((c) => !paritySet.some((p) => p.id === c.id)), paritySet.find((c) => c.id === "cyt-4")!];
const clips = medium ? mediumSet : parity ? paritySet : firstSet;

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

type Answer = { verdict: Verdict; factor: number; reasoning: string; model: string; usd: number; outputTokens?: number; reasoningTokens?: number };
const VERDICTS_OK: unknown[] = ["real time", "slowed", "sped up"];
const results: { id: string; file: string; sees?: string; fps: number; frames: number; durationS: number; cue: string | null; cueWhy: string; prompt: string; truth: Verdict; truthFactor: number; answers: Answer[] }[] = [];

// the most the next call can cost: the dearest input so far, padded, plus a full output allowance
let maxIn = 0;
const worst = () => (maxIn || 0.05) * 1.1 + MAX_OUT * OUT_PRICE;
let stopped: string | null = null;
const failures: { id: string; repeat: number; error: string; usd?: number; outputTokens?: number }[] = [];
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
    let outTok: number | undefined, reasonTok: number | undefined;
    for (let attempt = 0; attempt < ATTEMPTS && !value; attempt++) {
      if (spent() + worst() > budget) {
        stopped = `Stopped before ${c.id} repeat ${i + 1}: $${spent().toFixed(3)} spent, and the next call could cost up to $${worst().toFixed(3)} against a $${budget.toFixed(2)} budget.`;
        console.log(stopped);
        await deleteFile(vid.part.file_id);
        break outer;
      }
      const before = ledger.usd, k = ledger.calls.length;
      let error: string | null = null;
      try {
        const r = await respondJson<{ verdict: Verdict; factor: number; reasoning: string }>(
          { model: MODEL, effort: EFFORT, input: [{ role: "user", content: [vid.part, { type: "input_text", text: prompt }] }], name: "speed", schema: SCHEMA, maxOutput: MAX_OUT },
          ledger,
          `can you tell, ${c.id}, repeat ${i + 1}${attempt ? `, attempt ${attempt + 1}` : ""}`,
        );
        // a response that stopped early is cut off, even when the text that came back happens to parse
        if (r.raw.status === "incomplete") error = `cut off: ${r.raw.incomplete_details?.reason ?? "incomplete"}`;
        else if (!VERDICTS_OK.includes(r.value?.verdict) || typeof r.value?.factor !== "number" || typeof r.value?.reasoning !== "string") error = `not the answer format: ${JSON.stringify(r.value).slice(0, 120)}`;
        else value = r.value;
      } catch (e) {
        // a request the API refuses outright (400: a bad argument) is this script's bug: stop rather than count it
        if (medium && (e as { status?: number }).status === 400) throw e;
        error = (e as Error).message.slice(0, 200);
      }
      for (const call of ledger.calls.slice(k)) {
        model = call.model;
        outTok = call.outputTokens;
        reasonTok = call.reasoningTokens;
        const inUsd = (((call.inputTokens ?? 0) - (call.cachedTokens ?? 0)) * 1.25 + (call.cachedTokens ?? 0) * 0.15) / 1e6;
        maxIn = Math.max(maxIn, inUsd);
      }
      usd += ledger.usd - before;
      if (error) {
        failures.push({ id: c.id, repeat: i + 1, error, usd: +(ledger.usd - before).toFixed(4), ...(outTok !== undefined ? { outputTokens: outTok } : {}) });
        console.log(c.id, i + 1, "FAILED:", error.slice(0, 160), outTok !== undefined ? `${outTok} output tokens` : "", `running $${spent().toFixed(3)}`);
      }
    }
    if (!value) continue;
    row.answers.push({ verdict: value.verdict, factor: value.factor, reasoning: value.reasoning, model, usd: +usd.toFixed(4), ...(medium ? { outputTokens: outTok, reasoningTokens: reasonTok } : {}) });
    console.log(c.id, i + 1, value.verdict, value.factor, model, outTok !== undefined ? `${outTok} out` : "", `call $${usd.toFixed(4)}`, `running $${spent().toFixed(3)}`);
  }
  await deleteFile(vid.part.file_id);
}

const scored = results.map((r) => {
  const m = majorityOf(r.answers.map((a) => a.verdict));
  return { ...r, majority: m.verdict, majorityCount: m.count, right: m.verdict === r.truth, ...(medium ? { failed: failures.filter((f) => f.id === r.id).length } : {}) };
});
if (medium) {
  // added beside the first two sets, which stay exactly as they were; stored in the page's clip order
  const prev = JSON.parse(readFileSync("data/cyt/spark-quiz.json", "utf8"));
  const order = firstSet.map((c) => c.id);
  const calls = scored.reduce((k, c) => k + c.answers.length + (c.failed ?? 0), 0);
  prev.parityMedium = {
    label: "Information parity at medium effort: all six clips asked again at the reasoning effort Ansatz's observer runs at",
    model: MODEL,
    effort: EFFORT,
    maxOutputTokens: MAX_OUT,
    date: new Date().toISOString(),
    n,
    question: QUESTION,
    note: `The first two sets asked Muse Spark at low reasoning effort, while Ansatz's own observer runs at medium. This set asks all six clips again at medium effort, ${n} times each in separate calls, with a ${MAX_OUT.toLocaleString("en-GB")}-token output cap (an earlier medium attempt was stopped when one answer ran past 6,000) and the same closed answer schema. Each clip gets what Ansatz's run of it had: the parity set's length and footage on both Foucault cuts (8.97 m; the run's whole 22.5 s and 42 s clips, thinned to at most 300 frames as Ansatz's observer sees them) and on the gym ball (75 cm; the page's own file), and the page's own file and cue on the other three (the astronaut's 1.88 m on both Apollo clips, the string's 50 cm on Aachen). Each repeat was asked once, with no retry; an answer that failed, or was cut off by the output cap, counts as a failure and is listed under failures, and the verdict is the majority of the answers that came back. Everything else (model, question, schema) is as in the first set.`,
    budgetUsd: budget,
    usd: +spent().toFixed(4),
    calls,
    stopped,
    failures,
    clips: [...scored].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)),
  };
  writeFileSync("data/cyt/spark-quiz.json", JSON.stringify(prev, null, 1) + "\n");
  console.log(JSON.stringify(scored.map((c) => [c.id, c.majority, `${c.majorityCount}/${c.answers.length}`, `failed ${c.failed}`, c.right])), "calls", calls, "usd", spent().toFixed(4));
  process.exit(0);
}
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

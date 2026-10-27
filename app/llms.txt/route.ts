import { readFile } from "node:fs/promises";
import path from "node:path";
import { getExperiment, showcaseIds, winnerOf } from "@/lib/experiments";
import { costText, headline, timeText } from "@/lib/headline";
import { JUDGES_CODE } from "@/lib/classes";

export const dynamic = "force-dynamic";

const SITE = "https://ansatz-lab.vercel.app";
const read = (f: string) => readFile(path.join(process.cwd(), "data", "bench", f), "utf8").then((t) => JSON.parse(t), () => null);

/**
 * A plain-text guide for language-model agents and automated judges: what the project is, where each claim lives,
 * and every headline number with its label, read from the same stored runs the pages use.
 */
export async function GET() {
  const hl = await headline();
  const ids = await showcaseIds();
  const exps = (await Promise.all(ids.map((id) => getExperiment(id).catch(() => null)))).filter((e) => e != null);
  const moon = exps.find((e) => e.id === "moon-jump");
  const rep = moon?.extras?.speedTest?.repeats;
  const ramp = moon?.extras?.memoryTest?.controls?.clips.find((c) => c.id === "ramp");
  const [synth, wonder, referee, lite] = await Promise.all([read("synth.json"), read("wonder.json"), read("referee.json"), read("lite.json")]);
  const L: string[] = [];
  L.push("# Ansatz");
  L.push("");
  L.push("> Film anything that moves; Ansatz finds the law that moves it. SAM 3.1 measures the object in every frame, Muse Spark proposes laws of motion as equations, code fits each law to the first 70% of the motion and ranks it on predicting the last 30% (which no model sees), Muse Spark referees, and Muse Wonder, an agent with a fitting tool, proposes one more law when the referee asks. Entry in the Meta Global AI Developer Hackathon (Indie track).");
  L.push("");
  L.push("## Start here");
  L.push(`- [For judges](${SITE}/judges): the case against the four criteria, a timed tour, every headline number with a link to its source`);
  L.push(`- [Proof](${SITE}/proof): the benchmark on rendered clips with known answers, model checks, error-bar calibration`);
  L.push(`- [How it works](${SITE}/how): the pipeline step by step, with what each step produced on the Moon run`);
  L.push(`- [Run an experiment](${SITE}/new): upload or film a clip; recorded replays cost nothing. Judges' lane with reserved runs: ${SITE}/new?class=${JUDGES_CODE}`);
  L.push(`- Code: https://github.com/RohanGlitched/ansatz`);
  L.push("");
  L.push("## Headline numbers (each with what it means)");
  if (hl.moon) L.push(`- Moon's gravity measured from 1972 Apollo 16 television: ${hl.moon.g.toFixed(2)} ± ${hl.moon.sigma.toFixed(2)} m/s² (statistical and ruler combined; true ${hl.moon.reference}). Page: ${SITE}/x/moon-jump`);
  if (hl.jumpForJump) L.push(`- The same clip slowed 1.5× in secret, measured jump for jump against the broadcast: ${hl.jumpForJump.ratio.toFixed(3)} ± ${hl.jumpForJump.sigma.toFixed(3)}× slower (true 1.5×). This ratio needs no reference value. Page: ${SITE}/x/moon-jump#same-jump`);
  if (hl.moonClock) L.push(`- A different question, the slowed copy against the Moon's known gravity (assumes the world): ${hl.moonClock.factor.toFixed(2)} ± ${hl.moonClock.sigma.toFixed(2)}×. Page: ${SITE}/x/moon-jump-slowed`);
  if (ramp) L.push(`- Control: a copy slowed 1.5× through jump 1 only, real speed through jump 2, same length as the broadcast: ${ramp.jumps.map((j) => `${j.ratio.toFixed(3)} ± ${j.sigma.toFixed(3)}× (true ${j.truth}×)`).join(", then ")}.`);
  if (rep) L.push(`- Muse Spark asked about each clip alone, ${rep.n} times: called the slowed copy real speed ${rep.n - rep.clips[1].calledSlowed} of ${rep.n} times (answering the textbook 1.6 m/s²); called the real broadcast slowed ${rep.clips[0].calledSlowed} of ${rep.n} times.`);
  if (synth) L.push(`- Rendered clips with known physics: ${synth.summary.constantsWithin5pct} of ${synth.summary.constantsChecked} measured numbers within 5% (physical constants and camera scales together); Muse Spark reading the same constants by eye: median ${Math.round(synth.summary.medianEyeballErrPct)}% off. Page: ${SITE}/proof`);
  if (referee) L.push(`- Referee: asked for a new law on ${referee.summary.reviseWhenNeeded} of ${referee.summary.needed} renders that needed one, and on ${referee.summary.reviseWhenRight} of ${referee.summary.right} clips that did not. Page: ${SITE}/proof#models`);
  if (wonder) L.push(`- Muse Wonder challenged on every benchmark clip: kept the right law ${wonder.summary.tie} of ${wonder.summary.clips}; ${wonder.summary.worse} overreaches, all rejected by the held-out test.`);
  if (lite) L.push(`- Lite mode without a language model, measured offline on stored runs: ${lite.summary.constantsWithin5} of ${lite.summary.constantsChecked} constants within 5%. Page: ${SITE}/proof#checks`);
  L.push(`- A run costs ${costText(hl)} and takes ${timeText(hl)}.`);
  L.push("");
  L.push("## Experiments");
  for (const e of exps) {
    const w = winnerOf(e);
    L.push(`- [${e.title}](${SITE}/x/${e.id}): winning law "${w.law.title}"; data as CSV: ${SITE}/x/${e.id}/data.csv; lab report: ${SITE}/x/${e.id}/report`);
  }
  L.push("");
  L.push("## What is not shown yet");
  L.push("- No clip filmed on a phone and no outside student or teacher yet; the benchmark clips are renders; Muse Wonder's two wins are on renders built to need a law outside the base library; one object at a time, no depth.");
  return new Response(L.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}

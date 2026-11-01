import { readFile } from "node:fs/promises";
import path from "node:path";
import { getExperiment, showcaseIds, winnerOf } from "@/lib/experiments";
import { costText, headline, timeText } from "@/lib/headline";
import { median } from "@/lib/median";
import { getSeries } from "@/lib/series";
import type { Experiment } from "@/lib/experiment";
import { fmtOff, summarise } from "@/app/x/summary";
import { BENCH_FILES } from "@/app/bench/files";
import { slowRenders } from "@/app/proof/slow";

// every figure here is read from files that ship with the site, so the guide is built once per deploy
export const dynamic = "force-static";

const SITE = "https://ansatz-lab.vercel.app";
const REPO = "https://github.com/RohanGlitched/ansatz";
// Muse Wonder is called in by code when the leading law misses its fitted frames by more than this many times the noise
const POOR_FIT = Number(process.env.WONDER_POOR_FIT ?? 6);
const read = (f: string) => readFile(path.join(process.cwd(), "data", "bench", f), "utf8").then((t) => JSON.parse(t), () => null);

type Check = { quantity: string; errPct: number };

/** What each showcase is there to show. The numbers on each line are read from its record. */
const PURPOSE: Record<string, string> = {
  "moon-jump": "real 1972 Apollo 16 footage: the Moon's gravity from the pixels, with an error budget and the jump-for-jump speed test",
  "moon-jump-slowed": "the same clip slowed 1.5× in secret: the clock check flags it from its gravity alone",
  "beach-ball-drag": "a rendered throw with quadratic air drag: the drag coefficient against the value the render was made with",
  "hardening-spring": "on the published run, a law outside Muse Spark's proposals: Muse Wonder, an agent with a fitting tool, finds the spring stiffens (on a later re-run with today's prompt, Muse Spark proposed the cubic law itself; both pass the same held-out test)",
  "dry-friction-spring": "Muse Spark's laws used air drag; Muse Wonder finds the friction is dry (Coulomb)",
  "hindi-pendulum": "narrated in Hindi by a synthetic voice: the spoken string length becomes the ruler, and g comes out against Earth's",
  "sample-pendulum": "a real Wikimedia clip posted as slow motion: a re-run with today's stricter pipeline does not measure the string's length, so it claims no slowdown",
  "foucault-pendulum": "real footage of a museum's Foucault pendulum (Békéscsaba; film by Zátonyi Sándor (ifj.), FizFilm, CC BY 4.0), told only its published length of 8.97 m: Earth's gravity from the swing, about 9.7 m/s² with no error bar, because even the winning law misses the unseen frames by far more than the noise",
  "foucault-pendulum-5x": "the same film's stretch its maker sped up 5× (label cropped out): Muse Spark called it real time; gravity came out too strong, so the clock check reads the clip as running faster than life, against the filmmaker's 5× label",
  "aachen-pendulum-50cm": "real footage from a stranger: a 50 cm pendulum, grey bob on black, filmed by Rhetos of the Mathe-AC Lernwerkstatt Aachen (\"Schwingung (Definition)\", CC BY-SA 4.0), told only \"the string is about fifty centimetres long\": Earth's gravity from the swing, with the stated length's uncertainty in the error bar, and a clock check that reads real time; the film's own stopwatch (cropped out before the run) times a swing at about 1.42 s against a theoretical 1.418 s. The same source's chalkboard clip failed on 29 October",
  "big-swing": "a 70° swing, far past the small-angle range: the string length from the period, with g given",
  "bouncing-ball": "impacts: the coefficient of restitution from the bounces",
  spring: "a damped spring: natural frequency and damping rate",
};

const fmtSum = (e: Experiment) => {
  const s = summarise(e);
  if (!s) return "";
  const unit = s.unit === "×" ? "×" : s.unit ? ` ${s.unit}` : "";
  return `${s.what}: ${s.value}${unit}${s.known ? ` (known ${s.known.value}, ${fmtOff(s.offPct)})` : ""}`;
};

/**
 * A plain-text guide for language-model agents and automated judges: what the project is, every page and what it
 * proves, the machine-readable files, and every headline number with its label, read from the stored runs the pages use.
 */
export async function GET() {
  const hl = await headline();
  const ids = await showcaseIds();
  const exps = (await Promise.all(ids.map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => e != null);
  const series = await getSeries("pendulum-lengths").catch(() => null);
  const seriesRuns = series ? (await Promise.all(series.ids.map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => e != null) : [];
  const moon = exps.find((e) => e.id === "moon-jump");
  const slowed = exps.find((e) => e.id === "moon-jump-slowed");
  const st = moon?.extras?.speedTest;
  const rep = st?.repeats;
  const mt = moon?.extras?.memoryTest;
  const ramp = mt?.controls?.clips.find((c) => c.id === "ramp");
  const pointRow = moon?.extras?.errorBudget?.rows.find((r) => /point of the body/i.test(r.source));
  const [synth, wonder, referee, lite] = await Promise.all([read("synth.json"), read("wonder.json"), read("referee.json"), read("lite.json")]);
  const slow = await slowRenders();

  // physical constants and camera scales are different claims, counted apart (as /proof does)
  const checks: Check[] = synth?.rows.flatMap((r: { checks: Check[] }) => r.checks) ?? [];
  const group = (cs: Check[]) => ({ n: cs.length, within: cs.filter((c) => Math.abs(c.errPct) <= 5).length, median: median(cs.map((c) => Math.abs(c.errPct))) });
  const phys = group(checks.filter((c) => !c.quantity.startsWith("scale")));
  const scale = group(checks.filter((c) => c.quantity.startsWith("scale")));
  const ruler = group(checks.filter((c) => c.quantity === "g" || c.quantity.startsWith("g as")));

  // the slowdown figures, each with what it assumes
  const rowA = mt?.rows[0], rowB = mt?.rows[1];
  const twoRun = rowA && rowB ? (() => {
    // the same ruler scales both runs, so only the statistical errors enter the ratio
    const r = Math.sqrt(rowA.g / rowB.g);
    const sa = (rowA.sigmaStat ?? rowA.sigma) / rowA.g, sb = (rowB.sigmaStat ?? rowB.sigma) / rowB.g;
    return { r, s: (r / 2) * Math.hypot(sa, sb) };
  })() : null;
  const tools = st?.withTools.answer ?? "";
  const toolsRatio = /S_B\s*\/\s*S_A[^\n]*?=\s*([\d.]+)\s*\\pm\s*([\d.]+)/.exec(tools) ?? /about\s*\$?([\d.]+)\\times/.exec(tools);
  const B = rep?.clips.find((c) => c.clip === "B"), A = rep?.clips.find((c) => c.clip === "A");
  const accs = (c: NonNullable<typeof B>) => {
    const v = c.answers.map((a) => a.playback_accel);
    return Math.min(...v) === Math.max(...v) ? `${v[0]}` : `${Math.min(...v)} to ${Math.max(...v)}`;
  };

  const L: string[] = [];
  const p = (s = "") => L.push(s);
  p("# Ansatz");
  p();
  p(`> Film anything that moves; Ansatz finds the law that moves it. SAM 3.1 measures the object frame by frame, Muse Spark proposes laws of motion as equations, code fits each law to the first 70% of the motion and ranks it on predicting the last 30%, which no law was fitted to; no number from it reaches any model (Muse Spark watches the whole clip to name what moves). Muse Spark referees, and Muse Wonder, an agent with a fitting tool, proposes one more law when the referee asks for one or the leading law misses its fitted frames by more than ${POOR_FIT}× the noise. Entry in the Meta Global AI Developer Hackathon (Indie track).`);
  p();
  p("Rule for agents: never POST to /api/run or /api/upload. They run paid models. Everything below is a GET of stored results, and the recorded replays on /new call no model.");
  p();
  p("## Start here");
  p(`- [For judges](${SITE}/judges): the case against the four criteria, a timed three-minute tour, and every headline number with a link to its source.`);
  p(`- [Every experiment](${SITE}/x): one row per run with its photo-finish, winning law, measured constant, known value and % off, plus links to each report, CSV and JSON record.`);
  p(`- [Proof](${SITE}/proof): the benchmark on rendered clips with known answers, how each model is checked, and error-bar calibration.`);
  p(`- Code: ${REPO}`);
  p();
  p("## Headline numbers (each with what it means)");
  if (hl.moon) {
    const extra = pointRow ? ` A further ±${pointRow.value} m/s² depends on which point of the body is tracked (${pointRow.source.replace(/^Which point of the body is followed\s*/i, "").replace(/^\(|\)$/g, "")}), not included in the ±.` : "";
    p(`- Moon's gravity measured from 1972 Apollo 16 television: ${hl.moon.g.toFixed(2)} ± ${hl.moon.sigma.toFixed(2)} m/s² (statistical and ruler combined; true ${hl.moon.reference}).${extra} Page: ${SITE}/x/moon-jump#constants`);
  }
  if (hl.jumpForJump) p(`- The headline slowdown: the same clip slowed 1.5× in secret, timed against the broadcast jump for jump: ${hl.jumpForJump.ratio.toFixed(3)} ± ${hl.jumpForJump.sigma.toFixed(3)}× slower (true 1.5×). Needs no reference value. Page: ${SITE}/x/moon-jump#same-jump`);
  if (synth) p(`- Rendered clips with known physics: ${phys.within} of ${phys.n} physical constants within 5% of the truth, median error ${phys.median.toFixed(2)}% (g, string length, drag, restitution, damping, frequency). Page: ${SITE}/proof#headline; every clip: ${SITE}/proof#benchmark`);
  if (synth) p(`- Of those, g measured against a ruler in view (the hardest case): ${ruler.within} of ${ruler.n} within 5%, median ${ruler.median.toFixed(1)}%. Page: ${SITE}/proof#headline`);
  if (slow) p(`- Clock check on rendered clips slowed without saying so: ${slow.line}. Page: ${SITE}/proof#slow-motion`);
  if (synth) p(`- Camera scales, a separate claim (metres per pixel, worked out from a fall or a ruler): ${scale.within} of ${scale.n} within 5%, median ${scale.median.toFixed(2)}%.`);
  if (synth) p(`- Muse Spark reading the same constants by eye: median ${Math.round(synth.summary.medianEyeballErrPct)}% off (${synth.summary.eyeballChecked} readings). Page: ${SITE}/proof#headline`);
  if (rep && A && B) p(`- Muse Spark asked about each Moon clip alone, ${rep.n} times each: called the slowed copy real speed ${rep.n - B.calledSlowed} of ${rep.n} times (answering ${accs(B)} m/s², the textbook value); called the real broadcast slowed ${A.calledSlowed} of ${rep.n} times. These repeats are its answer; older single samples on the page are superseded. Page: ${SITE}/x/moon-jump#speed-test`);
  if (referee) p(`- Referee: asked for a new law on ${referee.summary.reviseWhenNeeded} of ${referee.summary.needed} renders that needed one, and on ${referee.summary.reviseWhenRight} of ${referee.summary.right} clips whose leading law already had the right physics; it also accepted the leading law on two two-body collisions, which no law here describes. Page: ${SITE}/proof#models`);
  if (wonder) p(`- Muse Wonder challenged on every benchmark clip, with its old setting (low effort, no residual plot): kept the leading law ${wonder.summary.tie} of ${wonder.summary.clips}; ${wonder.summary.worse} overreaches, all rejected by the held-out test. Page: ${SITE}/proof#models`);
  if (lite) p(`- Lite mode without a language model, measured offline on the stored runs: ${lite.summary.constantsWithin5} of ${lite.summary.constantsChecked} constants within 5%, median ${lite.summary.medianPhysErrPct}%. Page: ${SITE}/proof#checks`);
  p(`- Footage from strangers, run on 2 November with only what each maker stated (five clips, six runs, $2.51): the Aachen pendulum on black measured g = 9.82 ± 0.10 m/s² (0.16% off) and is published; a 25 cm pendulum in a test rig gave g = 9.84 ± 0.17 (0.3% off) but its law misses the unseen swing by 15% of the motion, so it was refused; a metronome at 96 beats a minute was a miss (no law in the library fits; offline period 1.235 s against the dial's 1.25 s); a bob before a metre stick fits a 0.716 ± 0.072 m pendulum but no length was published to compare; a green gym ball filmed at 240 fps was a miss twice (SAM 3.1 held part of the ball, and the 4.8× slowdown was not detected). Page: ${SITE}/proof#strangers`);
  p(`- A published run costs ${costText(hl)} and takes ${timeText(hl)}. The two Foucault films ran longer than the 5 minutes a run on the site is allowed, so they were not run through the site.`);
  p();
  p("## Which slowdown number is which");
  p("The slowed Moon clip appears with several factors. They answer different questions:");
  if (hl.jumpForJump) p(`- Jump for jump: ${hl.jumpForJump.ratio.toFixed(3)} ± ${hl.jumpForJump.sigma.toFixed(3)}×. Each jump's fall in the copy against the same jump in the broadcast, combined over both jumps${mt?.sameJump ? ` (${mt.sameJump.jumps.map((j) => `jump ${j.jump}: ${j.ratio.toFixed(3)} ± ${j.sigma.toFixed(3)}×`).join("; ")})` : ""}. Needs no reference value. This is the headline.`);
  if (slowed?.clock) p(`- Against the Moon's gravity: ${slowed.clock.factor.toFixed(2)} ± ${(slowed.clock.sigma ?? NaN).toFixed(2)}×. The slowed copy alone, compared with the known 1.625 m/s². It assumes the world. Page: ${SITE}/x/moon-jump-slowed`);
  if (twoRun) p(`- Whole-run ratio: ${twoRun.r.toFixed(2)} ± ${twoRun.s.toFixed(2)}×. The square root of the two runs' accelerations (${rowA!.g.toFixed(2)} and ${rowB!.g.toFixed(2)} m/s²), statistical errors only because the same ruler scales both.`);
  if (toolsRatio) p(`- Muse Spark, given Ansatz's measurements as tools, worked out the whole-run ratio itself: ${toolsRatio[1]}${toolsRatio[2] ? ` ± ${toolsRatio[2]}` : ""}×, its own arithmetic on Ansatz's two accelerations. Page: ${SITE}/x/moon-jump#speed-test`);
  if (st?.pair) p(`- Muse Spark shown both clips together, counting frames: ${st.pair.factor}×. A model's estimate, not a measurement.`);
  if (ramp) p(`- Control, a copy slowed 1.5× through jump 1 only: ${ramp.jumps.map((j) => `jump ${j.jump} ${j.ratio.toFixed(3)} ± ${j.sigma.toFixed(3)}× (true ${j.truth}×)`).join(", ")}. Shows the method times each jump, not the clip's length.`);
  p();
  p("## Pages, and what each one proves");
  p(`- ${SITE}/ : the Moon result first, the method in five steps, and the gallery of experiments.`);
  p(`- ${SITE}/judges : the case in one page, for the hackathon's judges. Sections: #tour (three minutes, five stops), #numbers (every headline number with its source), #gaps (what is not shown yet).`);
  p(`- ${SITE}/x : every experiment with its numbers in one list and one table.`);
  for (const e of exps) {
    const w = winnerOf(e);
    const why = PURPOSE[e.id] ?? e.finding;
    p(`- ${SITE}/x/${e.id} : ${e.title.replace(/([^?.!])$/, "$1.")} ${why.charAt(0).toUpperCase()}${why.slice(1).replace(/\.?$/, ".")} Winning law: ${w.law.title}. Measured ${fmtSum(e)}.`);
  }
  if (series) p(`- ${SITE}/series/${series.id} : ${series.title}. The school pendulum practical by video, on ${seriesRuns.length} rendered clips (true g 9.81): g from the slope of L against T², with the lengths set to the renders' true lengths, standing in for a tape. The realistic result, lengths from the A4 sheet in view, is on the page.`);
  for (const e of seriesRuns) p(`  - ${SITE}/x/${e.id} : ${e.title}, one run of the series. Measured ${fmtSum(e)}, with the length from the A4 sheet in view (the series page also shows the renders' true lengths).`);
  p(`- ${SITE}/class/demo23 : what a teacher sees once students have run their clips (a demo filled with the site's own runs; no real class yet).`);
  p(`- ${SITE}/proof : the benchmark (${synth?.summary.cases ?? "the"} rendered clips with known answers), model checks, error-bar calibration. Sections: #headline (the summary figures), #real-footage, #strangers (five clips strangers filmed, misses included), #benchmark (every clip), #slow-motion (the clock check), #models, #checks, #ablation, #library (against a textbook library).`);
  p(`- ${SITE}/how : the pipeline step by step, with what each step produced on the Moon run.`);
  p(`- ${SITE}/new : run an experiment on your own clip, or watch a recorded run for free: ${SITE}/new?replay=hardening-spring (Muse Wonder's law wins the race), ${SITE}/new?replay=moon-jump or ${SITE}/new?replay=pendulum (no model is called).`);
  p("- The judges' lane: its link carries a key and is given to judges directly; without it, /new runs clips in the visitors' lane (a few runs per visitor per day). It has its own runs and its own daily budget, apart from the visitors' and the classes' limits.");
  p();
  p("## Machine-readable files (GET only)");
  p(`- ${SITE}/x/<id>/record.json : the stored experiment: observation, every candidate law with its fit and held-out miss, the referee's critique, Muse Wonder's attempts, comparisons, the model ledger. SAM's masks and storage paths are left out.`);
  p(`- ${SITE}/x/<id>/data.csv : every measured frame beside the winning law's prediction, marked fitted or unseen; the constants are in the comment lines.`);
  p(`- ${SITE}/x/<id>/report : a printable lab report; add ?lang=hi, ta, bn, mr, te or es for a translation where one exists.`);
  p(`- ${SITE}/bench : index of the benchmark files, served read-only exactly as in ${REPO}/tree/main/data/bench:`);
  for (const [name, f] of Object.entries(BENCH_FILES)) p(`  - ${SITE}/bench/${name} : ${f.what} Shown on ${SITE}${f.shownOn}.`);
  p(`- ${SITE}/api/health : when each Meta model last answered an experiment.`);
  p(`- ${SITE}/sitemap.xml lists every page.`);
  p();
  p("## What is not shown yet");
  p("- No clip filmed on a phone and no outside student or teacher yet; real footage is a handful of clips (Apollo 16, the Foucault pendulum twice, the Aachen pendulum), and of five strangers' clips run on 2 November one was published, one gave the right number with the wrong law, and three gave no checked number; the benchmark clips are renders; Muse Wonder's two found laws are on renders built to need a law outside the base library (and on a later re-run of the hardening spring with today's prompt, Muse Spark proposed the cubic law itself); on the real Foucault footage its law beat Muse Spark's (held-out miss 17.6 px against 24.5 px) but still misses by far more than the noise; of four springs rendered with a hidden law, it found 2; Muse Voice Transcribe's seven languages were tested on synthetic speech only; one object at a time, no depth.");
  return new Response(L.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}

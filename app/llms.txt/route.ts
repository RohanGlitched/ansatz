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
import { fou5Long, fou5Of, fou5SameFilmLawFree } from "@/lib/fou5";
import { offlineText } from "@/app/runtime";
import { canYouTell, quizSaid } from "@/app/cyt";
import { PRACTICALS } from "@/app/lab/practicals";
import { winnerTitle } from "@/lib/tie";
import { sealedTest } from "@/app/sealed";
import { voiceLite } from "@/app/voiceLite";
import { STRANGERS, STRANGERS_RUNS, STRANGERS_RUNS_USD, STRANGERS_WITH_TRANSLATIONS_USD, strangersTally, strangersWord } from "@/app/proof/strangers";

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
  "dry-friction-spring": "run on the benchmarked pipeline (2026-10-27c): Muse Spark's proposed laws used air drag; refereeing their residual plot, Muse Spark named dry (Coulomb) friction, and Muse Wonder turned it into a law with its fitting tool (widening a bound that stuck)",
  "hindi-pendulum": "narrated in Hindi by a synthetic voice: the spoken string length becomes the ruler, and g comes out against Earth's",
  "sample-pendulum": "a real Wikimedia clip posted as slow motion: a re-run with the stricter 27 October pipeline (2026-10-27c) does not measure the string's length, so it claims no slowdown",
  "aachen-pendulum-60cm": "real footage from a stranger, the same Aachen source: a 60 cm pendulum before a ruler (\"Fadenpendelgeschwindigkeit (2 grad)\", Rhetos, CC BY-SA 4.0), told only \"the string is about sixty centimetres long\": g about 10 m/s² with no error bar, because the winning law misses the unseen swing by 21× the noise (the run page's rule), so it is not counted as measured; the clock check reads real time, roughly, which is right (filmed at 24 fps, stored at 25)",
  "sealed-law-6604797": "a spring law drawn by drand round 6604797 and sealed before the clip was rendered: a cubic hardening spring with quadratic damping. Found: the referee named only the stiffening, and Muse Wonder switched the damping to quadratic itself and dropped a viscous term that fitted near zero; every constant within 1σ of the drawn value (lengths converted with the render's own scale; the run found no ruler). Its first run was on older code. Re-run three times on the identical clip at code 0b852c8 after its reveal (replicates, not sealed draws; records and logs in https://github.com/RohanGlitched/ansatz/tree/main/data/replicate), it was found again in two of the three; the third re-run's winner carried a false drive that Muse Wonder wrote at 8.52 rad/s, inside the motion's own band. A separate review re-run on older code, outside this repository, missed it",
  "sealed-law-6604798": "a spring law drawn by drand round 6604798 and sealed before the clip was rendered: a linear spring with viscous damping. Found by Muse Spark's own law, both constants within 2σ",
  "sealed-law-6604796": "a spring law drawn by drand round 6604796 and sealed before the clip was rendered: a linear spring with quadratic damping and a periodic drive. Missed: no model proposed the drive (Muse Wonder's prompt at the time warned against drives, lib/scientist.ts:404 at commit 1811071); Muse Wonder's law won on the unseen frames but misses them by far more than the noise",
  "foucault-pendulum": "real footage of a museum's Foucault pendulum (Békéscsaba; film by Zátonyi Sándor (ifj.), FizFilm, CC BY 4.0), told only its published length of 8.97 m: Earth's gravity from the swing, about 9.7 m/s² with no error bar, because even the winning law misses the unseen frames by far more than the noise",
  "foucault-pendulum-5x": "the same film's stretch its maker sped up 5× (label cropped out): during the run Muse Spark described it as real time (its answers to the blind test's speed question are under Headline numbers); gravity came out too strong, so the clock check reads the clip as running faster than life, against the filmmaker's 5× label",
  "aachen-pendulum-50cm": "real footage from a stranger: a 50 cm pendulum, grey bob on black, filmed by Rhetos of the Mathe-AC Lernwerkstatt Aachen (\"Schwingung (Definition)\", CC BY-SA 4.0), told only \"the string is about fifty centimetres long\" (the film's own description: a pendulum half a metre long): Earth's gravity from the swing, the error bar assuming the stated length is good to 1% (the fit alone gives ± 0.005), and a clock check that reads real time; the film's own result card (cropped out before the run) gives a swing as about 1.42 s against a theoretical 1.418 s. The same source's chalkboard clip failed on 29 October",
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
  const fou5 = fou5Of(exps.find((e) => e.id === "foucault-pendulum-5x"), exps.find((e) => e.id === "foucault-pendulum"));
  const st = moon?.extras?.speedTest;
  const rep = st?.repeats;
  const mt = moon?.extras?.memoryTest;
  const ramp = mt?.controls?.clips.find((c) => c.id === "ramp");
  const pointRow = moon?.extras?.errorBudget?.rows.find((r) => /point of the body/i.test(r.source));
  const [synth, wonder, referee, lite] = await Promise.all([read("synth.json"), read("wonder.json"), read("referee.json"), read("lite.json")]);
  const slow = await slowRenders();
  const cyt = await canYouTell().catch(() => null);
  const sealed = await sealedTest().catch(() => null);
  // the two published lite runs where Muse Voice Transcribe set the length (synthetic voices), read from their records
  const voiceRuns = await voiceLite().catch(() => null);
  const fou5Quiz = quizSaid("foucault-pendulum-5x");
  const gymQuiz = quizSaid("gym-ball-bounce-240fps");

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
  p(`> Film anything that moves; Ansatz finds the law that moves it, one object at a time. SAM 3.1 measures that object frame by frame, Muse Spark proposes laws of motion as equations, code fits each law to the first 70% of the motion and ranks it on predicting the last 30%, which no law was fitted to (within the noise, the simpler law wins); on today's pipeline no number from it reaches any model (Muse Spark watches the whole clip to name what moves). Code also proposes laws built from the models' terms (a drive at an unexplained residual peak; Muse Wonder's stiffness with Muse Spark's damping). Muse Spark referees, and Muse Wonder, an agent with fit_law and residual_spectrum tools on the fitted frames, proposes one more law when the referee asks for one or the leading law misses its fitted frames by more than ${POOR_FIT}× the noise. Entry in the Meta Global AI Developer Hackathon (Indie track).`);
  p();
  p("Ansatz is a law-finder: it returns the equation, every constant with its error bar, and the held-out test that chose it. Because gravity is a clock, the same law also says how fast real footage plays, where Muse Spark, watching, often cannot.");
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
  if (slowed?.clock && fou5) p(`- Gravity is a clock: one known length turns gravity into a clock, so a g wrong by a square says the footage is not playing at life speed. From gravity alone, against the Moon's known gravity and with no original to compare, the slowed Apollo copy reads ${slowed.clock.factor.toFixed(2)} ± ${(slowed.clock.sigma ?? NaN).toFixed(2)}× slower (true 1.5×), and the museum film its maker sped up 5× reads ${fou5Long(fou5, "faster")}${fou5SameFilmLawFree(fou5) ? `; against the same film's real-time stretch, with no reference value at all, ${fou5SameFilmLawFree(fou5)}` : ""}. ${fou5Quiz ? ` On that museum film, during the run Muse Spark described the swing as playing at real time; ${fou5Quiz.said}.` : ""} A blind test of six real clips (you, then Muse Spark asked the same question five times per clip at low reasoning effort, then Ansatz measured, then the truth; the gym ball Ansatz could not measure included) is at ${SITE}/#can-you-tell${cyt ? `. By verdict: Muse Spark gets ${cyt.answers.sets.map((x) => `${x.spark} of ${cyt.answers.clips.length} ${x.key === "first" ? "on its " : ""}${x.label}`).join(", ")}; Ansatz gets ${cyt.answers.ansatz} of ${cyt.answers.clips.length}. Right factor (within ${Math.round(cyt.answers.factor.tol * 100)}%, by majority answer) on the ${cyt.answers.factor.n} retimed clips: Muse Spark gets ${cyt.answers.sets.map((x) => `${x.factor.spark} of ${x.factor.n}`).join(", ")} in that order, and Ansatz ${cyt.answers.factor.ansatz} of ${cyt.answers.factor.n}. ${cyt.answers.factorLine}${cyt.answers.parity ? ` ${cyt.answers.parity.line}` : ""}${cyt.answers.parityMedium ? ` ${cyt.answers.parityMedium.line}` : ""}` : ""}`);
  if (hl.jumpForJump) p(`- The headline slowdown: the same clip slowed 1.5× in secret, timed against the broadcast jump for jump: ${hl.jumpForJump.ratio.toFixed(3)} ± ${hl.jumpForJump.sigma.toFixed(3)}× slower (true 1.5×). Needs no reference value. Page: ${SITE}/x/moon-jump#same-jump`);
  if (synth) p(`- Rendered clips with known physics: ${phys.within} of ${phys.n} physical constants within 5% of the truth, median error ${phys.median.toFixed(2)}% (g, string length, drag, restitution, damping, frequency). Page: ${SITE}/proof#headline; every clip: ${SITE}/proof#benchmark`);
  if (synth) p(`- Of those, g measured against a ruler in view (the hardest case): ${ruler.within} of ${ruler.n} within 5%, median ${ruler.median.toFixed(1)}%. Page: ${SITE}/proof#headline`);
  if (slow) p(`- Clock check on rendered clips slowed without saying so: ${slow.line}. Page: ${SITE}/proof#slow-motion`);
  if (synth) p(`- Camera scales, a separate claim (metres per pixel, worked out from a fall or a ruler): ${scale.within} of ${scale.n} within 5%, median ${scale.median.toFixed(2)}%.`);
  if (synth) p(`- Muse Spark reading the same constants by eye: median ${Math.round(synth.summary.medianEyeballErrPct)}% off (${synth.summary.eyeballChecked} readings). Page: ${SITE}/proof#headline`);
  if (rep && A && B) p(`- Muse Spark asked about each Moon clip alone, ${rep.n} times each: called the slowed copy real speed ${rep.n - B.calledSlowed} of ${rep.n} times (answering ${accs(B)} m/s², the textbook value); called the real broadcast slowed ${A.calledSlowed} of ${rep.n} times (this test's own prompt, on the whole jump with the astronaut's height as a ruler; the blind test on the home page asks a different question of a shorter cut, so its answers about the same footage differ). These repeats are its answer. Before them, a first single ask per clip said both clips were slowed 2× (the real broadcast too), so the headline's 5 of 5 counts the repeats. Page: ${SITE}/x/moon-jump#speed-test`);
  if (sealed) p(`- Sealed-law test: ${sealed.headline} ${sealed.foundText}. Set by set: ${sealed.pattern} ${sealed.summary} Hashes pushed before the runs, and reveals after them, per set: ${sealed.sets.map((x) => `set ${x.set} (rounds ${x.rounds[0]}-${x.rounds.at(-1)}, found ${x.found} of ${x.n}): seal ${x.sealUrl}, reveal ${x.revealUrl}`).join('; ')}. ${sealed.draws.map((d) => `${d.line} Page: ${SITE}${d.href}`).join(" ")}${sealed.wonderStory ? ` ${sealed.wonderStory}` : ""} ${sealed.rule}${sealed.driveNote ? ` ${sealed.driveNote}` : ""} Not counted: ${sealed.review} What the seal proves: ${sealed.proves} Timing: ${sealed.timing} Spend: $${sealed.usd.toFixed(2)} of runs for the ${sealed.n}, $${sealed.spendAll.toFixed(2)} in all with the translations and the replicate re-runs. Constants in metres use the render's own scale; the runs found no ruler. Section: ${SITE}/proof#sealed`);
  if (referee) p(`- Referee: asked for a new law on ${referee.summary.reviseWhenNeeded} of ${referee.summary.needed} renders that needed one, and on ${referee.summary.reviseWhenRight} of ${referee.summary.right} clips whose leading law already had the right physics; it also accepted the leading law on two two-body collisions, which no law here describes. Page: ${SITE}/proof#models`);
  if (wonder) p(`- Muse Wonder challenged on every benchmark clip, with its old setting (low effort, no residual plot): kept the leading law ${wonder.summary.tie} of ${wonder.summary.clips}; ${wonder.summary.worse} overreaches, all rejected by the held-out test. Page: ${SITE}/proof#models`);
  if (lite) p(`- Lite mode (no Muse Spark or Muse Wonder; a length said aloud is set by Muse Voice Transcribe), measured offline on the stored runs with typed lengths, so without the voice: ${lite.summary.constantsWithin5} of ${lite.summary.constantsChecked} constants within 5%, median ${lite.summary.medianPhysErrPct}%. Page: ${SITE}/proof#checks`);
  if (voiceRuns) p(`- ${voiceRuns.sentence} Pages: ${voiceRuns.runs.map((x) => `${SITE}${x.href}`).join(", ")}`);
  p(`- Footage from strangers, run on 2 November in three sets with only what each maker stated: ${strangersTally().text}; ${STRANGERS_RUNS} runs, $${STRANGERS_RUNS_USD.toFixed(2)} in runs ($${STRANGERS_WITH_TRANSLATIONS_USD.toFixed(2)} with the four published pages' translations, the last two estimated). The third set: ${STRANGERS.filter((r) => r.set === 3).map((r) => `${r.clip}, ${r.who} (${r.verdict}: ${r.measured.split(". ")[0].replace(/\.$/, "")})`).join("; ")}; the ThinkTac 60 cm runs to the knot, and the magnet's centre hangs a few millimetres lower. The second set: ${STRANGERS.filter((r) => r.set === 2).map((r) => `${r.clip} (${r.verdict}: ${r.measured.split(". ")[0].replace(/\.$/, "")})`).join("; ")}. The first set: the Aachen pendulum on black measured g = 9.82 ± 0.10 m/s² (0.16% off) and is published; a 25 cm pendulum in a test rig gave g about 9.84 (0.3% off) with no error bar, because its law misses the unseen swing by 102× the noise (15% of the motion), so it was refused; a metronome at 96 beats a minute was a miss (no law in the library fits; offline, timed to a fraction of a frame, the period is about 1.24 s against the dial's 1.25 s); a bob before a metre rule (read as 1 m from its markings, running off the frame) fits a 0.716 ± 0.002 m pendulum, from the period with g held (the ± is Earth's g, assumed to ±0.26%; the rule's scale does not enter), but no length was published to compare; a green gym ball filmed at 240 fps was a miss twice (SAM 3.1 held part of the ball; in both runs Muse Spark, describing the clip to say what to track, took it as real time${gymQuiz ? `, while ${gymQuiz.said}` : ""}; Ansatz measured no gravity, so it could not check the clock). Page: ${SITE}/proof#strangers`);
  p(`- A published run costs ${costText(hl)} and takes ${timeText(hl)}. ${offlineText(exps)}`);
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
  p(`- ${SITE}/judges : the case in one page, for the hackathon's judges. Sections: #tour (three minutes, seven stops), #numbers (every headline number with its source), #gaps (what is not shown yet).`);
  p(`- ${SITE}/x : every experiment with its numbers in one list and one table.`);
  for (const e of exps) {
    const w = winnerOf(e);
    // a sealed run without its own line is described by its draw (the referee's finding was written before the reveal)
    const why = PURPOSE[e.id] ?? sealed?.draws.find((d) => d.href === `/x/${e.id}`)?.line ?? e.finding;
    p(`- ${SITE}/x/${e.id} : ${e.title.replace(/([^?.!])$/, "$1.")} ${why.charAt(0).toUpperCase()}${why.slice(1).replace(/\.?$/, ".")} Winning law: ${winnerTitle(e)}. Measured ${fmtSum(e)}.`);
  }
  if (series) p(`- ${SITE}/series/${series.id} : ${series.title}. The school pendulum practical by video, on ${seriesRuns.length} rendered clips (true g 9.81): g from the slope of L against T², with the lengths set to the renders' true lengths, standing in for a tape. The realistic result, lengths from the A4 sheet in view, is on the page.`);
  {
    const k = (s: string) => PRACTICALS.filter((x) => x.status === s).length;
    p(`- ${SITE}/lab : For teachers. The ${PRACTICALS.length} CBSE Class XI practicals about motion and force (curriculum 2026-27, with the NCERT lab manual's entries), each with what Ansatz does today: ${k("covered")} covered (pendulum, energy dissipation), ${k("part")} in part (projectile, spring by oscillation), ${k("not")} not yet; the run for each, what to film, what to tape up, accuracy read from the stored runs, printable reports, a two-page worksheet in English and Hindi, and a 40-minute lesson plan. No teacher has used it yet.`);
  }
  for (const e of seriesRuns) p(`  - ${SITE}/x/${e.id} : ${e.title}, one run of the series. Measured ${fmtSum(e)}, with the length from the A4 sheet in view (the series page also shows the renders' true lengths).`);
  p(`- ${SITE}/class/demo23 : what a teacher sees once students have run their clips (a demo filled with the site's own runs; no real class yet).`);
  p(`- ${SITE}/proof : the benchmark (${synth?.summary.cases ?? "the"} rendered clips with known answers), model checks, error-bar calibration. Sections: #headline (the summary figures), #real-footage, #strangers (${strangersWord(STRANGERS.length)} clips strangers filmed, misses included), #benchmark (every clip), #slow-motion (the clock check), #models, #checks, #ablation, #library (against a textbook library).`);
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
  p(`- No clip filmed on a phone and no outside student or teacher yet; real footage is a handful of published runs (Apollo 16, the Foucault pendulum twice, the two Aachen pendulums, ThinkTac's 60 cm and Rosolowsky's 27-inch pendulums), and of the ${strangersTally().text}; the benchmark clips are renders; ${sealed ? `of ${4 + sealed.n} springs whose law was not shown (four we built, ${sealed.n} drawn by drand), Ansatz found ${2 + sealed.found} and Muse Wonder wrote ${2 + sealed.wonderFound} of those laws (the dry-friction law stands; ${sealed.replicate ? `drawn round ${sealed.replicate.round} was found on its first run (older code) and in ${sealed.replicate.k} of ${sealed.replicate.n} re-runs on the identical clip at code ${sealed.replicate.code}, and a review re-run on older code missed it` : "drawn round 6604797 was found on its first run"}; on the hardening spring a later re-run had Muse Spark propose the cubic law itself): two on renders we built to need a law outside the base library (on a later re-run of the hardening spring with today's prompt, Muse Spark proposed the cubic law itself) and ${sealed.wonderFound} drawn by drand; the drawn laws: ${sealed.headline.charAt(0).toLowerCase()}${sealed.headline.slice(1).replace(/\.$/, "")};` : ""} on the real Foucault footage and on a driven drawn spring Muse Wonder's law beat Muse Spark's on the unseen frames but still misses by far more than the noise; Muse Voice Transcribe's seven languages were tested on synthetic speech only; one object at a time, no depth.`);
  return new Response(L.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=300" } });
}

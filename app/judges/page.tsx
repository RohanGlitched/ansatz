import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Plate, { Note, Page, Reading, Section } from "@/components/book/Plate";
import { getExperiment, showcaseIds, winnerOf } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiment";
import { LANGUAGES } from "@/lib/translate";
import slits from "@/data/slits.json";
import { costText, headline } from "@/lib/headline";
import { median } from "@/lib/median";
import { slowRenders } from "@/app/proof/slow";
import { PER_VISITOR } from "@/lib/limits";
import caseStyles from "@/components/case/case.module.css";
import Architecture from "@/components/case/Architecture";
import CountUp from "@/components/case/CountUp";
import Fold from "@/components/book/Fold";
import { runTime, runTimeText } from "@/app/runtime";
import { DEMO_VIDEO_LENGTH, demoVideoEmbed, demoVideoUrl } from "@/app/video";
import styles from "./judges.module.css";

export const metadata: Metadata = {
  title: "For judges",
  description: "Ansatz against the four judging criteria, with every claim linked to the run, page or benchmark row that backs it.",
  alternates: { canonical: "/judges" },
};

// reads only the runs and benchmark files that ship with the site: cached, rebuilt at most every 5 minutes
export const revalidate = 300;

type Summary = {
  cases: number;
  medianConstErrPct: number;
  constantsWithin5pct: number;
  constantsChecked: number;
  medianEyeballErrPct: number;
  medianTrackingErrPx: number;
  lawCorrect: number;
  lawJudged: number;
  slowClips?: number;
  slowFlagged?: number;
  totalUsd: number;
  medianSeconds: number;
};
type Check = { quantity: string; errPct: number };

const MODELS: { id: string; name: string; job: string; where: string; href: string }[] = [
  { id: "sam-3.1", name: "SAM 3.1", job: "The measuring instrument. It tracks the object through every frame of the motion, up to 450 a run; Ansatz turns each mask into a sub-pixel centroid from its moments, and measures rulers from true mask extents. Its masks also print the stroboscopic plate and stream live onto the clip during a run.", where: "The orange dots on every strip", href: "/x/hardening-spring" },
  { id: "muse-spark-1.3", name: "Muse Spark 1.3", job: "The observer, the theorist and the referee. It watches the clip and reads its captions under a JSON schema, names what moves and what can serve as a ruler, writes candidate laws in a small equation language, and reads the residual plot to judge them. It is also the baseline we beat: the same model guessing the numbers by eye.", where: "The trial on every experiment", href: "/x/moon-jump#trial" },
  { id: "muse-wonder-1.0", name: "Muse Wonder 1.0", job: "The agent with a tool. When every proposed law misses, it gets a fit_law tool on the seen frames only, tries laws, reads their residuals and submits one, which must then win on the last 30%, which no law was fitted to. On the published runs it found two laws Muse Spark missed, both on renders; on a later re-run of the stiffening spring with today’s prompt, Muse Spark proposed the cubic law itself, and both pass the same held-out test. On the real Foucault footage its law beat Muse Spark’s (held-out miss 17.6 px against 24.5 px) but still misses by far more than the noise. Of four springs rendered with a hidden law, it found 2.", where: "Its notebook on the hardening spring", href: "/x/hardening-spring#notebook" },
  { id: "muse-voice-transcribe-1.0", name: "Muse Voice Transcribe", job: "The ears. What the person filming says (“the string is sixty centimetres”, said in Hindi by a synthetic voice on the published run) becomes a given in the report, with its source quoted, so a spoken length can set the scale.", where: "The Hindi pendulum", href: "/x/hindi-pendulum" },
];

const anchor = (name: string) => name.toLowerCase().replace(/ /g, "-");

export default async function JudgesPage() {
  const ids = await showcaseIds();
  const exps = (await Promise.all(ids.map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => e != null);
  const by = (id: string) => exps.find((e) => e.id === id);
  const moon = by("moon-jump");
  const mt = moon?.extras?.memoryTest;
  const st = moon?.extras?.speedTest;
  const rp = st?.repeats;
  const rep = rp ? { n: rp.n, a: rp.clips.find((c) => c.clip === "A")!, b: rp.clips.find((c) => c.clip === "B")! } : null;
  const ratio = mt ? Math.sqrt(mt.rows[0].g / mt.rows[1].g) : NaN;
  const g = moon?.comparisons.find((c) => c.param === "g");
  // a museum's Foucault pendulum: real footage with its length published, and a stretch its filmmaker sped up 5x
  const fou = by("foucault-pendulum");
  const fouG = fou?.extras?.truth?.rows.find((r) => r.param === "g");
  const fouSpark = fou?.extras?.truth?.rows.find((r) => r.param === "g_spark");
  const fou5 = exps.find((e) => e.id === "foucault-pendulum-5x")?.extras?.truth?.rows.find((r) => r.param === "speedup");
  const spring = by("hardening-spring");
  const springTruth = spring?.extras?.truth?.rows.find((r) => r.param === "beta");
  const sparkBest = (e: Experiment) => e.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0];
  // Muse Wonder's law won these published runs; it "found the law" only where its law predicts the unseen frames within
  // five times the noise. A win that still misses by far more (the real Foucault footage) is an improvement, not a found law.
  const wonderWins = exps.filter((e) => winnerOf(e).origin === "revision");
  const wonderFound = wonderWins.filter((e) => (winnerOf(e).fit.testZ ?? Infinity) <= 5);
  const wonderBetter = wonderWins.filter((e) => !wonderFound.includes(e));
  const px = (v: number) => `${v.toFixed(1)} px`;
  const betterText = wonderBetter
    .map((e) => `on ${e.id.startsWith("foucault") ? "the real Foucault footage" : e.title} its law beat Muse Spark’s (held-out miss ${px(winnerOf(e).fit.testRms)} against ${px(sparkBest(e)?.fit.testRms ?? NaN)}) but still misses by ${Math.round(winnerOf(e).fit.testZ ?? NaN)}× the noise`)
    .join("; ");
  // the published run is the one where Muse Spark's laws missed; a later re-run's note says what changed since
  const springRerun = (spring as (Experiment & { rerun?: { note: string } }) | undefined)?.rerun;
  const Q = "(on a later re-run with today’s prompt, Muse Spark proposed the cubic law itself; both pass the same held-out test)";
  const mm = (m: number) => `${(m * 1000).toFixed(1)} mm`;
  const springGain = spring && sparkBest(spring) ? sparkBest(spring)!.fit.testRms / winnerOf(spring).fit.testRms : NaN;
  // the error budget's rows: the ruler as given, and which point of the body is followed (left out of the ±)
  const budget = moon?.extras?.errorBudget?.rows ?? [];
  const pointRow = budget.find((r) => /point of the body/i.test(r.source));
  const rulerRow = budget.find((r) => /^The ruler:/i.test(r.source));
  const sj = mt?.sameJump?.combined;
  const sjText = sj ? `${sj.ratio.toFixed(3)} ± ${sj.sigma.toFixed(3)}×` : "";
  // how often Muse Spark, asked about the slowed copy on its own, called it real speed
  const realCalls = rep ? rep.n - rep.b.calledSlowed : 0;
  const realCallsText = rep ? `${realCalls} times out of ${rep.n}` : "";
  const slow = await slowRenders();
  const misread = slow?.all.filter((r) => r.outcome === "flagged" && !r.right) ?? [];
  const missedSlow = slow?.all.filter((r) => r.outcome !== "flagged") ?? [];
  const phoneRuns = exps.filter((e) => e.source.phone).length;

  const refb = await readFile(path.join(process.cwd(), "data", "bench", "referee.json"), "utf8").then((t) => JSON.parse(t) as { summary: { reviseWhenNeeded: number; needed: number; reviseWhenRight: number; right: number } }, () => null);
  const wonb = await readFile(path.join(process.cwd(), "data", "bench", "wonder.json"), "utf8").then((t) => JSON.parse(t) as { summary: { clips: number; tie: number; worse: number } }, () => null);
  const lite = await readFile(path.join(process.cwd(), "data", "bench", "lite.json"), "utf8").then((t) => JSON.parse(t) as { summary: { constantsWithin5: number; constantsChecked: number; medianPhysErrPct: number; medianSamUsd: number } }, () => null);
  const sw = await readFile(path.join(process.cwd(), "data", "bench", "pendulum-stopwatch.json"), "utf8").then((t) => JSON.parse(t) as { sheet: { g: number; offPct: number }; tape: { g: number; sgScatter: number; sgTape: number; offPct: number }; stopwatch: { relTpct: number }; rows: { relTpct: number; stopwatch: { relTpct: number } }[] }, () => null);
  const bench = await readFile(path.join(process.cwd(), "data", "bench", "synth.json"), "utf8").then((t) => JSON.parse(t) as { summary: Summary; rows: { checks: Check[] }[] }, () => null);
  const ablation = await readFile(path.join(process.cwd(), "data", "bench", "ablation.json"), "utf8").then((t) => JSON.parse(t) as { summary: { clips: number; sparkBetter: number; tied: number; libraryBetter: number } }, () => null);
  const s = bench?.summary;
  const phys = (bench?.rows.flatMap((r) => r.checks) ?? []).filter((c) => !c.quantity.startsWith("scale"));
  const physErr = phys.map((c) => Math.abs(c.errPct)).sort((a, b) => a - b);
  const physMedian = median(physErr);
  const physWithin = physErr.filter((x) => x <= 5).length;
  const gRuler = phys.filter((c) => (c.quantity === "g" || c.quantity.startsWith("g as"))).map((c) => Math.abs(c.errPct));

  // what each Meta model did across the published runs, from their own ledgers
  const usage = MODELS.map((m) => {
    const calls = exps.flatMap((e) => e.ledger.calls.filter((c) => c.model === m.id));
    return { ...m, calls: calls.length, usd: calls.reduce((a, c) => a + c.usd, 0), frames: calls.reduce((a, c) => a + ((c as { frames?: number }).frames ?? 0), 0) };
  });
  const costs = exps.map((e) => e.ledger.usd).sort((a, b) => a - b);
  const langs = Object.keys(LANGUAGES).length + 1;
  const hl = await headline();
  const rt = runTime(exps);
  const samRuns = exps.map((e) => e.ledger.calls.filter((c) => c.model === "sam-3.1").reduce((t, c) => t + c.usd, 0));
  const samMedianCents = Math.round(median(samRuns) * 100);

  const criteria: { name: string; weight: number; claim: string; points: React.ReactNode[]; evidence: { label: string; href: string }[] }[] = [
    {
      name: "Impact",
      weight: 30,
      claim: "A physics lab that fits in a phone propped on books, for the students who have no light gates.",
      points: [
        <>A student films a ball, says what they know in their own language, and gets the law, the constants with error bars, and how far they are from the textbook. Reports read in {langs} languages, and the numbers in a translation are checked against the English before it is shown.</>,
        <>
          Teachers get a class code, a grading sheet with every student&rsquo;s run and a CSV: <Link href="/class/demo23">a sample class</Link>. The pendulum practical becomes a series: several string lengths fitted together, g from the slope of L against T² (<Link href="/series/pendulum-lengths">an example</Link>).
        </>,
        <>A run costs {costText(hl)} in Meta credits and takes {runTimeText(rt)}; the two Foucault films ran longer than the 5 minutes a run on the site is allowed, so they were not run through the site. Each lab report prints with student fields, or exports as a PDF.</>,
        <>
          Who it is for: an analysis of UDISE+ 2025-26 counts about 1.25 lakh of India&rsquo;s 2.96 lakh schools with secondary classes that have no integrated science lab (<a href="https://educationforallinindia.com/integrated-science-laboratories-in-secondary-schools-in-india-udise-2025-26/">Education for All in India</a>). A two-gate school timing kit is listed at £198 (<a href="https://philipharris.co.uk/product/physics/motions-and-forces/motion-and-acceleration/philip-harris-foundation-physics-light-gate/pp00057791">Philip Harris</a>); a phone is already in most students&rsquo; pockets.
        </>,
        <>
          Beyond the classroom: it is system identification from any video, with a model kept honest.{" "}
          {fou5 ? `On real footage a filmmaker sped up 5× and labelled on screen (we cropped the label out), Muse Spark called the swing real time; the clock check reads it as ${fou5.measured.toFixed(2)} ± ${(fou5.sigma ?? 0).toFixed(2)}× faster than life.` : "On real footage its filmmaker sped up and labelled, the clock check reads how much faster than life it plays."}
        </>,
      ],
      evidence: [
        { label: "A sample class", href: "/class/demo23" },
        { label: "One pendulum, four lengths", href: "/series/pendulum-lengths" },
        { label: "The sped-up Foucault film", href: "/x/foucault-pendulum-5x" },
      ],
    },
    {
      name: "Meta tooling",
      weight: 25,
      claim: "Four Meta models, each doing a job the others can’t, and each checked by code rather than trusted.",
      points: [
        <>SAM 3.1 is the instrument, Muse Spark the observer, theorist and referee, Muse Wonder an agent with a fitting tool, Muse Voice Transcribe the ears. Plate I shows how they fit together; their jobs and their spend across the published runs are in Plate III.</>,
        <>Structured output with strict JSON schemas, video input at the clip&rsquo;s own frame rate, up to 300 frames, function tools for Muse Wonder, streamed SAM masks drawn live during a run. Muse Spark watches the whole clip to name what moves; no number from the last 30% reaches it, and no law is fitted to it.</>,
        <>
          Muse Wonder earned its place: on {wonderFound.length} of the published runs{wonderFound.length === 2 ? ", both renders," : ""} it found the law Muse Spark missed{betterText ? `; ${betterText}` : ""}. Of four springs rendered with a hidden law, it found 2. On the stiffening spring&rsquo;s published run its law missed the unseen motion {Number.isFinite(springGain) ? `${Math.round(springGain)}× less than Muse Spark’s best (${mm(winnerOf(spring!).fit.testRms)} against ${mm(sparkBest(spring!)!.fit.testRms)})` : "by far less than Muse Spark’s best"}
          {springTruth ? `, and recovers the hidden stiffening k₃/m = ${+springTruth.measured.toPrecision(4)} ± ${+springTruth.sigma.toPrecision(2)} against a true ${+springTruth.truth.toPrecision(4)}` : ""}
          {springRerun ? ` ${Q}` : ""}.
        </>,
        <>
          Each model was also tested on its own over the whole benchmark (<Link href="/proof#models">Proof</Link>): the referee asked for a new law on {refb ? `${refb.summary.reviseWhenNeeded} of ${refb.summary.needed}` : "both"} renders that needed one and on {refb ? `${refb.summary.reviseWhenRight} of ${refb.summary.right}` : "none of the"} clips whose leading law already had the right physics (it also accepted the leading law on two two-body collisions, which no law here describes); Muse Wonder, challenged on every clip with its old setting (low effort, no residual plot), kept the leading law on {wonb ? `${wonb.summary.tie} of ${wonb.summary.clips}` : "most"}, and the held-out test threw out the {wonb?.summary.worse ?? "few"} laws where it overreached.
        </>,
        <>Every model call is listed on its experiment with its purpose, time and cost, so you can see exactly what each model did.</>,
      ],
      evidence: [
        { label: "Muse Wonder's notebook", href: "/x/hardening-spring#notebook" },
        { label: "Each model tested alone", href: "/proof#models" },
        { label: "The Hindi pendulum", href: "/x/hindi-pendulum" },
      ],
    },
    {
      name: "Technical depth",
      weight: 20,
      claim: "The model proposes; the data decides; code computes every measured number.",
      points: [
        <>Each law is integrated with RK4 (bounces located inside the step), fitted by Levenberg&ndash;Marquardt to the first 70% of the motion and ranked, in units of the measured noise, on the last 30%, which no law was fitted to; no number from it reaches any model.</>,
        <>
          Checked against {s?.cases ?? "28"} clips rendered with exactly known physics: {physWithin} of {phys.length} physical constants within 5%, median error {physMedian.toFixed(2)}%. Muse Spark reading the same numbers by eye: {s?.medianEyeballErrPct.toFixed(0)}%. SAM centroids land a median {s?.medianTrackingErrPx.toFixed(2)} px from the true centre. All on <Link href="/proof">Proof</Link>.
        </>,
        <>Times come from the video file&rsquo;s own sample table, not an assumed frame rate. Laws are written in a small equation language that Ansatz parses and compiles; nothing a model writes is ever run as code. The referee writes the finding with placeholders, and code fills in the numbers. Two inputs do come from Muse Spark, and every report lists them under &ldquo;Given, not measured&rdquo;: the size of the ruler it picked, and which world the clip is on.</>,
        <>
          Honest about its own method: against a library of 12 textbook laws, Muse Spark&rsquo;s proposals tie on {ablation?.summary.tied ?? 25} of {ablation?.summary.clips ?? 28} clips, win {ablation?.summary.sparkBetter ?? 2} and lose {ablation?.summary.libraryBetter ?? 1}. The model matters where the textbook runs out, which is where Muse Wonder comes in.
        </>,
      ],
      evidence: [
        { label: "The method, step by step", href: "/how" },
        { label: "The scoreboard", href: "/proof#headline" },
        { label: "Against a textbook", href: "/proof#library" },
      ],
    },
    {
      name: "Demo",
      weight: 25,
      claim: "The first screen is real footage and its result, and you can watch a full run without spending anything.",
      points: [
        <>The home page opens on real footage: the 1972 Moon broadcast and the same clip slowed in secret, in their original colour, with the result in one line. Further down, a Falsification Plate puts the line between the motion the laws may see and the motion they must predict in your hands: drag it and, on that published run, Muse Spark&rsquo;s laws are refuted by the future while Muse Wonder&rsquo;s holds (on a later re-run with today&rsquo;s prompt, Muse Spark proposed the cubic law itself). Every experiment page opens on the same plate.</>,
        <>
          <Link href="/new">Run an experiment</Link> replays recorded runs, SAM&rsquo;s measurements included, with no model called. Or film something with a phone propped on books{phoneRuns ? "" : " (no published clip was filmed on a phone yet)"}.
        </>,
        <>Every experiment has an ask box: Muse Spark answers from the run&rsquo;s record, and code checks each number it quotes against that record.</>,
        <>
          The same plate is on <Link href="/proof">Proof</Link> for the beach ball and on <Link href="/how">How it works</Link> for the Moon run, so the held-out test can be tried, not only read about.
        </>,
      ],
      evidence: [
        { label: "The home page", href: "/" },
        { label: "Watch a recorded run", href: "/new?replay=hardening-spring" },
        { label: "Every experiment", href: "/x" },
      ],
    },
  ];
  const total = criteria.reduce((a, c) => a + c.weight, 0);

  const tour = [
    { t: "0:00", title: "The first screen", body: `The Moon, two clips in their original colour: ${rep ? `asked about the slowed copy on its own, Muse Spark called it real speed ${realCallsText}` : "Muse Spark called the slowed copy real speed"}; Ansatz, timing the copy jump for jump against the broadcast, measures it ${sjText ? `${sjText} slower` : "slower"} (truth 1.5×). Then, in §2, a spring that stiffens as it stretches: drag the line and watch Muse Spark’s laws from the published run fail on the last 30%, which no law was fitted to, and Muse Wonder’s hold.`, href: "/", go: "Home" },
    { t: "0:30", title: "The Moon experiment", body: `Gravity measured from the pixels of 1972 television, with a ruler we chose (${rulerRow ? rulerRow.source.replace(/^The ruler:\s*/i, "") : "Young’s suited height"}): ${g ? `${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s² against the Moon’s ${g.reference}` : "the Moon’s gravity"}${pointRow ? `, with a further ±${pointRow.value} depending on which point of the body is followed` : ""}. Scroll to “Can it tell the speed?” for the fair test.`, href: "/x/moon-jump", go: "Open it" },
    { t: "1:15", title: "A law Muse Wonder found", body: `A spring we rendered to stiffen as it stretches: on the published run Muse Spark’s laws miss, Muse Wonder’s notebook shows ${spring?.wonder?.attempts.length ?? "its"} attempts (an older pipeline that allowed several fits a turn; today it is up to two fits in production), and the cubic law it submitted wins on the last 30%, which no law was fitted to${springRerun ? ` ${Q}` : ""}.`, href: "/x/hardening-spring", go: "Open it" },
    { t: "2:00", title: "The scoreboard", body: "Every number Ansatz reported on clips with known answers, beside Muse Spark’s guess by eye, and the cases where it fails.", href: "/proof", go: "Proof" },
    { t: "2:30", title: "Watch a run", body: "A recorded run replays from the start: SAM 3.1’s measurements arrive frame by frame, the photo-finish strip builds as they do, and the candidate laws race across the unseen part. No model is called.", href: "/new?replay=hardening-spring", go: "Watch a recorded run" },
  ];

  const novel = [
    { title: "A test of memory against measurement", body: `We slowed a famous clip and told no one. A model that recognises footage answers from memory; one that measures can’t be fooled. Muse Spark, asked about each clip on its own: ${rep ? `it called the secretly slowed copy real speed ${rep.n - rep.b.calledSlowed} times out of ${rep.n}, answering ${rep.b.answers[0].playback_accel} m/s², the textbook value; it called the real broadcast slowed ${rep.a.calledSlowed} of ${rep.n} times` : "the same answer for both"}. Ansatz, timing each jump in the copy against the same jump in the broadcast: ${sjText ? `${sjText} slower` : "slower"} (truth: 1.5×). ${mt ? `Its two whole-run accelerations, ${mt.rows[0].g.toFixed(2)} and ${mt.rows[1].g.toFixed(2)} m/s², give a whole-run ratio of ${ratio.toFixed(2)}×.` : ""}`, href: "/x/moon-jump#speed-test" },
    { title: "Laws judged on motion they weren’t fitted to", body: "Every law is fitted to the first 70% of the motion and ranked on the last 30%, which no law was fitted to; no number from it reaches any model, and Muse Wonder’s fitting tool only has the first 70%. A law wins by predicting the rest, not by sounding right.", href: "/how" },
    { title: "A clock check from physics", body: "Gravity scales with the square of time. When a ruler makes gravity a measurement, a value far from the planet’s says the clip isn’t real time, and by how much.", href: "/x/foucault-pendulum-5x" },
    { title: "An agent that does science with a tool", body: "Muse Wonder doesn’t answer; it experiments. It fits laws to the seen frames, reads the residuals, revises, and submits one law to a trial it can’t see.", href: "/x/dry-friction-spring" },
    { title: "The video as its own chart", body: "Every frame cut to one slice through the moving object and laid side by side, a race-finish camera for physics. The motion draws its own graph in real pixels, and the measurement sits on top.", href: `/x/${Object.keys(slits)[0]}` },
    { title: "Numbers no model typed", body: "Every measured value in a report comes from the fit; the two things Muse Spark supplies (a ruler’s size, which world) are listed as given. The referee writes with placeholders; an answer from the ask box that quotes a number not in the record is flagged on screen.", href: "/x/moon-jump" },
  ];

  const breakIt = [
    ["Film in slow motion and don’t say so.", "With a ruler in view, the clock check flags it and names the factor. Without one, gravity is assumed and the report says so."],
    ["Say a wrong length aloud.", "The spoken length becomes the scale and is listed under “Given, not measured”, quoted, so the reader can see where the number came from."],
    ["Film something that isn’t textbook physics.", "Every proposed law will miss the unseen frames. Muse Wonder steps in; if it can’t do better, the winner is labelled as the best description available, not a closed case."],
    ["Film toward the camera.", "Depth isn’t measured. The motion has to cross the frame; the How it works page says so."],
    ["Film a dark object against a dark background.", "SAM 3.1 may not find it, and the fits come out poor. Proof shows a real classroom clip where this happened and no usable g was reported."],
    ["Ask the ask box for a number it doesn’t have.", "It is told to say what would be needed; any number it quotes that isn’t in the record is marked as unchecked."],
  ];

  const numbers: { what: string; value: string; href: string }[] = [
    ...(g ? [{ what: "Moon gravity from Apollo 16 television", value: `${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s² (true ${g.reference})`, href: "/x/moon-jump#constants" }] : []),
    ...(fouG ? [{ what: "Real footage: a museum’s Foucault pendulum, g from the swing and its published length (8.97 m)", value: `about ${fouG.measured.toFixed(1)} m/s² (9.81 there)${fouSpark ? `; Muse Spark’s plain law ${fouSpark.measured.toFixed(2)} ± ${(fouSpark.sigma ?? 0).toFixed(2)}` : ""}; no error bar on the winning law, which misses the unseen frames by ${Math.round(winnerOf(fou!).fit.testZ ?? NaN)}× the noise`, href: "/x/foucault-pendulum" }] : []),
    ...(fou5 ? [{ what: "Real footage sped up 5× by its filmmaker (label cropped out): the clock check’s reading", value: `${fou5.measured.toFixed(2)} ± ${(fou5.sigma ?? 0).toFixed(2)}× faster than life (truth 5×); Muse Spark, watching, called it real time`, href: "/x/foucault-pendulum-5x" }] : []),
    ...(sj ? [{ what: "The same clip slowed 1.5× in secret, timed jump for jump", value: `${sjText} slower (truth 1.5×)${mt ? `; whole-run ratio ${ratio.toFixed(2)}× (${mt.rows[1].g.toFixed(2)} ± ${mt.rows[1].sigma.toFixed(2)} against ${mt.rows[0].g.toFixed(2)} m/s²)` : ""}`, href: "/x/moon-jump#same-jump" }] : []),
    ...(springTruth ? [{ what: "Hidden stiffening found by Muse Wonder", value: `k₃/m = ${+springTruth.measured.toPrecision(4)} ± ${+springTruth.sigma.toPrecision(2)} m⁻²s⁻² (true ${+springTruth.truth.toPrecision(4)})`, href: "/x/hardening-spring#constants" }] : []),
    ...(refb ? [{ what: "Referee asked for a new law: when one was missing / when the leading law had the right physics", value: `${refb.summary.reviseWhenNeeded} of ${refb.summary.needed} / ${refb.summary.reviseWhenRight} of ${refb.summary.right}`, href: "/proof#models" }] : []),
    ...(wonb ? [{ what: "Muse Wonder challenged on every benchmark clip, old setting (low effort, no residual plot): kept the leading law", value: `${wonb.summary.tie} of ${wonb.summary.clips}; ${wonb.summary.worse} overreaches, all rejected by the held-out test`, href: "/proof#models" }] : []),
    ...(mt?.controls ? [{ what: "A copy slowed 1.5× through jump 1 only, real speed through jump 2 (same length as the broadcast)", value: mt.controls.clips.find((c) => c.id === "ramp")!.jumps.map((j) => `${j.ratio.toFixed(3)} ± ${j.sigma.toFixed(3)}× (true ${j.truth}×)`).join(", then "), href: "/x/moon-jump#same-jump" }] : []),
    ...(sw ? [{ what: "Pendulum practical on four rendered clips (true g 9.81), with Ansatz’s periods", value: `lengths from the A4 sheet in view, the realistic case: g = ${sw.sheet.g.toFixed(2)} m/s² (${sw.sheet.offPct < 0 ? "−" : "+"}${Math.abs(sw.sheet.offPct).toFixed(1)}%); lengths set to the renders’ true lengths, as a tape would give: ${sw.tape.g.toFixed(3)} ± ${Math.hypot(sw.tape.sgScatter, sw.tape.sgTape).toFixed(3)} m/s² (${Math.abs(sw.tape.offPct).toFixed(2)}% off); period to ${Math.min(...sw.rows.map((r) => r.relTpct)).toFixed(3)}–${Math.max(...sw.rows.map((r) => r.relTpct)).toFixed(2)}% vs about ${sw.stopwatch.relTpct.toFixed(1)}% for a 20-swing stopwatch (estimate)`, href: "/series/pendulum-lengths#stopwatch" }] : []),
    ...(lite ? [{ what: "Lite mode, no language model (measured offline on stored runs)", value: `${lite.summary.constantsWithin5} of ${lite.summary.constantsChecked} constants within 5%, median ${lite.summary.medianPhysErrPct.toFixed(2)}%; about ${Math.round(lite.summary.medianSamUsd * 100)} cents of SAM 3.1 a clip`, href: "/proof#checks" }] : []),
    { what: "Physical constants within 5% on rendered clips", value: `${physWithin} of ${phys.length}, median ${physMedian.toFixed(2)}%`, href: "/proof#headline" },
    ...(gRuler.length ? [{ what: "Of those, g measured against a ruler in view (the hardest case)", value: `${gRuler.filter((x) => x <= 5).length} of ${gRuler.length}, median ${median(gRuler).toFixed(1)}%`, href: "/proof#headline" }] : []),
    ...(s ? [{ what: "Muse Spark reading the same constants by eye", value: `median ${s.medianEyeballErrPct.toFixed(0)}% off`, href: "/proof#headline" }] : []),
    ...(slow ? [{ what: "Clock check on rendered clips slowed without saying so", value: `${slow.line}${misread.length ? ` (the ${misread.map((r) => `${r.slow}× clip read as ${r.factor!.toFixed(1)}×`).join(", ")}: its ruler was misread)` : ""}`, href: "/proof#slow-motion" }] : []),
    ...(s ? [{ what: "SAM 3.1 centroid against the true centre", value: `median ${s.medianTrackingErrPx.toFixed(2)} px`, href: "/proof#headline" }] : []),
    { what: "Cost of a run, median of the published ones", value: `$${median(costs).toFixed(2)} (from $${costs[0]?.toFixed(2)} to $${costs.at(-1)?.toFixed(2)})`, href: "/x/hardening-spring#notebook" },
  ];

  return (
    <article>
      <header className={styles.title}>
        <div className={styles.titleText}>
          <h1>For judges</h1>
          <p className={styles.abstract}>
            Ansatz turns any video of something moving into a physics experiment: SAM 3.1 measures the object frame by frame, Muse Spark and Muse Wonder propose laws of motion, and each law is ranked on the last 30% of the motion, which no law was fitted to; no number from it reaches any model. The law that predicts it best wins. Here it is against your four criteria. Every number on this page is read from the stored runs, and every claim links to where you can check it.
          </p>
          <p className={styles.cta}>
            <Link className="btn" href="/new?replay=hardening-spring">
              Watch a recorded run
            </Link>
            <Link className="btn ghost" href="/new">
              Run your own clip
            </Link>
            <a className="btn ghost" href="#demo-video">
              Watch the demo ({DEMO_VIDEO_LENGTH})
            </a>
          </p>
          <p className={styles.headNote}>
            A recorded run calls no model and needs no link. To run your own clip, open <Link href="/new">Run an experiment</Link>: every visitor gets {PER_VISITOR} runs a day, and a run takes {runTimeText(rt)}. For agents: <a href="/llms.txt">/llms.txt</a> lists every number with its source, and <Link href="/x">/x</Link> indexes every experiment.
          </p>
          <figure className={styles.video} id="demo-video">
            <div className={styles.videoFrame}>
              <iframe
                src={demoVideoEmbed}
                title={`Ansatz, the demo (${DEMO_VIDEO_LENGTH})`}
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
            <figcaption>
              The demo, {DEMO_VIDEO_LENGTH}. <a href={demoVideoUrl}>Open it on YouTube</a>.
            </figcaption>
          </figure>
        </div>

        <nav className={styles.board} aria-label="The judging criteria">
          <p className={styles.boardHead}>
            The criteria, by weight <span>{total} points</span>
          </p>
          <ol>
            {criteria.map((c) => (
              <li key={c.name}>
                <a href={`#${anchor(c.name)}`}>
                  <span className={styles.boardBar} aria-hidden="true">
                    <i style={{ width: `${(c.weight / 30) * 100}%` }} />
                  </span>
                  <span className={styles.boardName}>
                    {c.name}
                    <b>{c.weight}</b>
                  </span>
                  <span className={styles.boardClaim}>{c.claim}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <Plate n="I" id="architecture" tight title="How a clip becomes a law: which model does what, and what only code may touch.">
        <Fold summary="Open the diagram: each model's job, and what only code may touch" className="onPlateFold">
          <Architecture />
        </Fold>
      </Plate>

      <Plate n="II" title="Three numbers to check first." caption="Each opens the run or the table it comes from.">
        <ul className={`${caseStyles.readings} ${caseStyles.long}`}>
          {hl.moon && (
            <li>
              <Link href="/x/moon-jump">
                <Reading
                  value={<CountUp to={hl.moon.g} decimals={2} />}
                  pm={hl.moon.sigma.toFixed(2)}
                  unit="m/s²"
                  tone="measured"
                  label={`the Moon’s gravity, measured from 1972 television by SAM 3.1 and code (true ${hl.moon.reference}); the ± is statistical and ruler${pointRow ? `, and which point of the body is followed adds about ±${pointRow.value}` : ""}`}
                />
              </Link>
            </li>
          )}
          {hl.jumpForJump && (
            <li>
              <Link href="/x/moon-jump#same-jump">
                <Reading
                  value={<CountUp to={hl.jumpForJump.ratio} decimals={3} />}
                  pm={`${hl.jumpForJump.sigma.toFixed(3)}×`}
                  tone="measured"
                  label={`how much slower the secretly slowed copy runs, measured jump for jump (true 1.5×)${rep ? `; Muse Spark, asked about it alone, called it real speed ${realCallsText}` : ""}`}
                />
              </Link>
            </li>
          )}
          <li>
            <Link href="/proof">
              <Reading value={<><CountUp to={physWithin} /> of {phys.length}</>} tone="held" label={`constants within 5% on clips with known physics, median ${physMedian.toFixed(2)}%; Muse Spark by eye: ${s?.medianEyeballErrPct.toFixed(0)}%`} />
            </Link>
          </li>
        </ul>
      </Plate>

      <Page>
        <Section n={1} title="If you have three minutes" id="tour">
          <p>Five stops, in this order. Nothing here spends credits.</p>
        </Section>
      </Page>
      <ol className={styles.tour}>
        {tour.map((x) => (
          <li key={x.t}>
            <span className={styles.tourT}>{x.t}</span>
            <div>
              <h3>{x.title}</h3>
              <p>{x.body}</p>
            </div>
            <Link className="btn ghost" href={x.href}>
              {x.go}
            </Link>
          </li>
        ))}
      </ol>

      <Page>
        <Section n={2} title="Against your criteria" id="criteria">
          <p>Each criterion with its weight, our claim for it, and where to check that claim. The links beside each one go straight to the evidence.</p>
        </Section>
        {criteria.map((c) => [
          <section key={c.name} className={styles.criterion}>
            <p className={styles.cWeight}>
              {c.name}, {c.weight} points
            </p>
            <h3 className={styles.cClaim}>{c.claim}</h3>
            <Fold id={anchor(c.name)} summary={`The case for ${c.name.toLowerCase()}, in ${c.points.length} points`}>
              <ul className={styles.points}>
                {c.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </Fold>
          </section>,
          <Note key={`${c.name}-note`} who="Check it">
            {c.evidence.map((e, i) => (
              <span key={e.href} className={styles.ev}>
                {i > 0 && <br />}
                <Link href={e.href}>{e.label}</Link>
              </span>
            ))}
          </Note>,
        ])}

        <Section n={3} title="What is new here" id="new">
          <p>Plenty of projects ask a model what is in a video. Ansatz treats the model as a scientist that has to be checked, and builds the checks.</p>
          <Fold summary={`${novel.length} things we built that we have not seen elsewhere`}>
          <dl className={styles.novel}>
            {novel.map((n) => (
              <div key={n.title}>
                <dt>{n.title}</dt>
                <dd>
                  {n.body} <Link href={n.href}>See it</Link>.
                </dd>
              </div>
            ))}
          </dl>
          </Fold>
        </Section>
      </Page>

      <Plate n="III" tight title={`Every Meta model has a job only it can do. Calls and spend across the ${exps.length} published runs, read from each run’s own ledger.`}>
        <Fold summary={`Each model's job, calls, frames and spend`} className="onPlateFold">
        <table className={styles.ledger}>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Its job</th>
              <th scope="col" className={styles.rn}>
                Calls
              </th>
              <th scope="col" className={styles.rn}>
                Frames
              </th>
              <th scope="col" className={styles.rn}>
                Spend
              </th>
            </tr>
          </thead>
          <tbody>
            {usage.map((m) => (
              <tr key={m.id}>
                <th scope="row">
                  {m.name}
                  <Link href={m.href} className={styles.ledgerGo}>
                    {m.where}
                  </Link>
                </th>
                <td className={styles.job}>{m.job}</td>
                <td className={styles.rn} data-label="Calls">
                  {m.calls}
                </td>
                <td className={styles.rn} data-label="Frames">
                  {m.frames ? m.frames.toLocaleString("en") : "—"}
                </td>
                <td className={styles.rn} data-label="Spend">
                  ${m.usd.toFixed(2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </Fold>
      </Plate>

      <Page>
        <Section n={4} title="Try to break it" id="break">
          <p>Here is what happens when you do.</p>
          <Fold summary={`${breakIt.length} ways to try, and what happens`}>
          <dl className={styles.breaks}>
            {breakIt.map(([a, b]) => (
              <div key={a}>
                <dt>{a}</dt>
                <dd>{b}</dd>
              </div>
            ))}
          </dl>
          </Fold>
        </Section>
        <Note who="Where each answer is shown">
          <Link href="/proof#slow-motion">The clock check</Link>, <Link href="/how#limits">what it can&rsquo;t do</Link> and <Link href="/proof#fails">where it fails</Link>.
        </Note>

        <Section n={5} title="The numbers, and where each one lives" id="numbers">
          <p>Every headline number, with the page that shows it and its source.</p>
        </Section>
      </Page>

      <div className={styles.tableBlock}>
        <Fold summary={`All ${numbers.length} numbers, each with where to check it`}>
        <table className={`journal ${styles.numbers}`}>
          <thead>
            <tr>
              <th scope="col">Claim</th>
              <th scope="col">Value</th>
              <th scope="col">Check it</th>
            </tr>
          </thead>
          <tbody>
            {numbers.map((n) => (
              <tr key={n.what}>
                <td>{n.what}</td>
                <td className="num">{n.value}</td>
                <td>
                  <Link href={n.href}>{n.href}</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </Fold>
        <p className={styles.code}>
          Code: <a href="https://github.com/RohanGlitched/ansatz">github.com/RohanGlitched/ansatz</a>. The benchmark clips, their true values and the scoring script are in the repository.
        </p>
      </div>

      <Page>
        <Section n={6} title="What we have not shown yet" id="gaps">
          <p>The gaps, in our own words, before you find them.</p>
          <Fold summary="The gaps, one by one">
          <ul className={styles.gaps}>
            <li>{phoneRuns ? `Every clip here was filmed on a phone by us (${phoneRuns}), rendered by us or found online.` : "Every clip here was rendered by us or found online; none was filmed on a phone yet."} No outside student or teacher has run it yet.</li>
            <li>Muse Wonder&rsquo;s two found laws are on renders we built to need a law outside the base textbook library, and both laws (a cubic spring, dry friction) are ones a physicist knows: a library extended with them ties it, and on a later re-run with today&rsquo;s prompt Muse Spark proposed the cubic law itself. {betterText ? `${betterText.charAt(0).toUpperCase()}${betterText.slice(1)}. ` : ""}Of four springs rendered with a hidden law, it found 2: on the two from 29 October its law took the wrong form, or no proposed law described the motion (<Link href="/proof#fails">Proof</Link>). A law nobody planted is still to be shown.</li>
            <li>The benchmark clips are rendered, so the physics is clean. Real footage adds motion blur, rolling shutter and lens distortion that the renders only partly imitate.</li>
            <li>
              It fails when the object doesn&rsquo;t stand out. On a real classroom clip of a dark pendulum bob against a dark chalkboard, SAM 3.1 couldn&rsquo;t hold the bob and Ansatz reported no usable g (<Link href="/proof#fails">Proof, where it fails</Link>).
            </li>
            <li>One object at a time: two bodies colliding, or anything moving toward the camera, isn&rsquo;t measured.</li>
            <li>
              The clock check is only as good as the ruler{slow ? ` (${slow.line})` : ""}
              {misread.length ? `: on the ${misread.map((r) => `${r.slow}× render the ruler was misread and the factor came out ${r.factor!.toFixed(1)}×`).join("; on the ")}` : ""}
              {missedSlow.length ? `; on the ${missedSlow.map((r) => `${r.slow}×`).join(" and ")} ${missedSlow.length === 1 ? "render" : "renders"} the ruler’s size was only guessed or not trusted, so the slowdown wasn’t flagged` : ""}. Stating the ruler&rsquo;s size fixes these.
            </li>
            <li>Without a ruler, a slowed clip and a weaker world look the same: the report says both are possible.</li>
          </ul>
          </Fold>
        </Section>

        <Section n={7} title="After judging, for schools" id="schools">
          <p>What a run costs, where the money goes, and how it gets cheaper. Planned, not built yet, except where it says so.</p>
          <Fold summary="Cost, lite mode, and what is planned">
          <ul className={styles.gaps}>
            <li>Today a run costs {costText(hl)}, which we pay, with daily limits per visitor and per class. Of that, SAM 3.1&rsquo;s measurement is the median {samMedianCents} cents; the rest is Muse Spark watching, proposing and refereeing, and Muse Wonder when it is called in.</li>
            <li>Built: a lite mode for school practicals. The student names the experiment, SAM 3.1 measures, and code fits the textbook laws. It is a choice on <Link href="/new">Run an experiment</Link>, and class links start in it. Its accuracy, measured offline on the stored benchmark runs: {lite ? `${lite.summary.constantsWithin5} of ${lite.summary.constantsChecked} constants within 5% at about ${Math.round(lite.summary.medianSamUsd * 100)} cents a clip` : "the same accuracy at the cost of SAM alone"}.</li>
            <li>Muse Spark Open, the open-weight model, could watch and referee on a school&rsquo;s own machine; we have not tried it yet, and will publish how often it agrees with Muse Spark on the benchmark before relying on it.</li>
            <li>The code, the benchmark clips and their true values stay public, so a teacher or a board can check the method without trusting us.</li>
          </ul>
          </Fold>
        </Section>
        <Note who="Cost, from the ledgers">Every model call&rsquo;s cost is stored with its run; these medians are read from them.</Note>
      </Page>

      <Plate n="IV" id="bring-a-clip" title="Bring a clip.">
        <div className={styles.close}>
          <p>
            Anything that falls, swings, bounces or rolls, filmed from a phone that stays still. Say what you know while you film. Upload it on Run an experiment: every visitor gets {PER_VISITOR} runs a day, and a run takes {runTimeText(rt)}. A recorded run needs no link and calls no model.
          </p>
          <div className={styles.closeCta}>
            <Link className="btn" href="/new">
              Run an experiment
            </Link>
            <Link className="btn ghost" href="/new?replay=hardening-spring">
              Watch a recorded run
            </Link>
            <Link className="btn ghost" href="/how">
              How it works
            </Link>
          </div>
        </div>
      </Plate>
    </article>
  );
}

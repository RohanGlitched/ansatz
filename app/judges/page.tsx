import type { Metadata } from "next";
import HeroStill from "@/components/HeroStill";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getExperiment, showcaseIds, winnerOf } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiment";
import { LANGUAGES } from "@/lib/translate";
import slits from "@/data/slits.json";
import { costText, headline, timeText } from "@/lib/headline";
import { median } from "@/lib/median";
import { getClass, JUDGES_CODE } from "@/lib/classes";
import { slowRenders } from "@/app/proof/slow";
import { PER_VISITOR } from "@/lib/limits";
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
  { id: "sam-3.1", name: "SAM 3.1", job: "The measuring instrument. It tracks the object through every frame; Ansatz turns each mask into a sub-pixel centroid from its moments, and measures rulers from true mask extents. Its masks also print the stroboscopic plate and stream live onto the clip during a run.", where: "The orange dots on every strip", href: "/x/hardening-spring" },
  { id: "muse-spark-1.3", name: "Muse Spark 1.3", job: "The observer, the theorist and the referee. It watches the clip and reads its captions under a JSON schema, names what moves and what can serve as a ruler, writes candidate laws in a small equation language, and reads the residual plot to judge them. It is also the baseline we beat: the same model guessing the numbers by eye.", where: "The trial on every experiment", href: "/x/moon-jump#trial" },
  { id: "muse-wonder-1.0", name: "Muse Wonder 1.0", job: "The agent with a tool. When every proposed law misses, it gets a fit_law tool on the seen frames only, tries laws, reads their residuals and submits one, which must then win on frames it never saw. It has found two laws Muse Spark missed.", where: "Its notebook on the hardening spring", href: "/x/hardening-spring#notebook" },
  { id: "muse-voice-transcribe-1.0", name: "Muse Voice Transcribe", job: "The ears. What the person filming says (“the string is sixty centimetres”, said in Hindi on the published run) becomes a given in the report, with its source quoted, so a spoken length can set the scale.", where: "The Hindi pendulum", href: "/x/hindi-pendulum" },
];

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
  const spring = by("hardening-spring");
  const springTruth = spring?.extras?.truth?.rows.find((r) => r.param === "beta");
  const wonderWins = exps.filter((e) => winnerOf(e).origin === "revision");
  const sparkBest = (e: Experiment) => e.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0];
  const springGain = spring && sparkBest(spring) ? sparkBest(spring)!.fit.testRms / winnerOf(spring).fit.testRms : NaN;
  const slowPendulum = by("sample-pendulum");
  const slowPendulumG = slowPendulum?.comparisons.find((c) => c.param === "g");
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
  // the judges' lane: its end date, read from its record (the code itself is given only in the private testing instructions)
  const lane = await getClass(JUDGES_CODE).catch(() => null);
  const laneEnds = lane ? new Date(lane.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }) : null;
  const phoneRuns = exps.filter((e) => e.source.phone).length;

  const refb = await readFile(path.join(process.cwd(), "data", "bench", "referee.json"), "utf8").then((t) => JSON.parse(t) as { summary: { reviseWhenNeeded: number; needed: number; reviseWhenRight: number; right: number } }, () => null);
  const wonb = await readFile(path.join(process.cwd(), "data", "bench", "wonder.json"), "utf8").then((t) => JSON.parse(t) as { summary: { clips: number; tie: number; worse: number } }, () => null);
  const lite = await readFile(path.join(process.cwd(), "data", "bench", "lite.json"), "utf8").then((t) => JSON.parse(t) as { summary: { constantsWithin5: number; constantsChecked: number; medianPhysErrPct: number; medianSamUsd: number } }, () => null);
  const sw = await readFile(path.join(process.cwd(), "data", "bench", "pendulum-stopwatch.json"), "utf8").then((t) => JSON.parse(t) as { tape: { g: number; sgScatter: number; sgTape: number; offPct: number }; rows: { relTpct: number; stopwatch: { relTpct: number } }[] }, () => null);
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
  const secs = exps.map((e) => e.ledger.ms / 1000).sort((a, b) => a - b);
  const langs = Object.keys(LANGUAGES).length + 1;
  const hl = await headline();
  const samRuns = exps.map((e) => e.ledger.calls.filter((c) => c.model === "sam-3.1").reduce((t, c) => t + c.usd, 0));
  const samMedianCents = Math.round(median(samRuns) * 100);

  const criteria = [
    {
      name: "Impact",
      weight: 30,
      claim: "A physics lab that fits in a phone propped on books, for the students who have no light gates.",
      points: [
        <>A student films a ball, says what they know in their own language, and gets the law, the constants with error bars, and how far they are from the textbook. Reports read in {langs} languages, and the numbers in a translation are checked against the English before it is shown.</>,
        <>
          Teachers get a class code, a grading sheet with every student’s run and a CSV: <Link href="/class/demo23">a sample class</Link>. The pendulum practical becomes a series: several string lengths fitted together, g from the slope of L against T² (<Link href="/series/pendulum-lengths">an example</Link>).
        </>,
        <>
          A run costs {costText(hl)} in Meta credits and takes {timeText(hl)}. Each lab report prints with student fields, or exports as a PDF.
        </>,
        <>
          Who it is for: an analysis of UDISE+ 2025-26 counts about 1.25 lakh of India’s 2.96 lakh schools with secondary classes that have no integrated science lab (<a href="https://educationforallinindia.com/integrated-science-laboratories-in-secondary-schools-in-india-udise-2025-26/">Education for All in India</a>). A two-gate school timing kit is listed at £198 (<a href="https://philipharris.co.uk/product/physics/motions-and-forces/motion-and-acceleration/philip-harris-foundation-physics-light-gate/pp00057791">Philip Harris</a>); a phone is already in most students’ pockets.
        </>,
        <>Beyond the classroom: it is system identification from any video, with a model kept honest. A pendulum clip posted online as “slow motion” came out with gravity about {slowPendulumG ? Math.round(slowPendulumG.reference / slowPendulumG.measured) : "18"}× too weak, which Ansatz reads as footage running about 4 to 4.5× slower than life (unconfirmed: the capture rate isn’t published).</>,
      ],
    },
    {
      name: "Meta tooling",
      weight: 25,
      claim: "Four Meta models, each doing a job the others can’t, and each checked by code rather than trusted.",
      points: [
        <>SAM 3.1 is the instrument, Muse Spark the observer, theorist and referee, Muse Wonder an agent with a fitting tool, Muse Voice Transcribe the ears. Their jobs and their spend across the published runs are in the table below.</>,
        <>Structured output with strict JSON schemas, video input at the clip’s own frame rate, function tools for Muse Wonder, streamed SAM masks drawn live during a run.</>,
        <>
          Muse Wonder earned its place: on {wonderWins.length} of the published runs it found the law Muse Spark missed. On the stiffening spring its law predicts the unseen motion {Number.isFinite(springGain) ? `${Math.round(springGain)}×` : "far"} better than Muse Spark’s best{springTruth ? `, and recovers the hidden stiffening k₃/m = ${+springTruth.measured.toPrecision(4)} ± ${+springTruth.sigma.toPrecision(2)} against a true ${+springTruth.truth.toPrecision(4)}` : ""}.
        </>,
        <>
          Each model was also tested on its own over the whole benchmark (<Link href="/proof#models">Proof</Link>): the referee asked for a new law on {refb ? `${refb.summary.reviseWhenNeeded} of ${refb.summary.needed}` : "both"} renders that needed one and on {refb ? `${refb.summary.reviseWhenRight} of ${refb.summary.right}` : "none of the"} clips that didn’t; Muse Wonder, challenged on every clip, kept the right law on {wonb ? `${wonb.summary.tie} of ${wonb.summary.clips}` : "most"}, and the held-out test threw out the {wonb?.summary.worse ?? "few"} laws where it overreached.
        </>,
        <>Every model call is listed on its experiment with its purpose, time and cost, so you can see exactly what each model did.</>,
      ],
    },
    {
      name: "Technical execution",
      weight: 20,
      claim: "The model proposes; the data decides; code computes every measured number.",
      points: [
        <>Each law is integrated with RK4 (bounces located inside the step), fitted by Levenberg–Marquardt to the first 70% of the motion and ranked, in units of the measured noise, on the last 30%, which no law was fitted to; no number from it reaches any model.</>,
        <>
          Checked against {s?.cases ?? "28"} clips rendered with exactly known physics: {physWithin} of {phys.length} physical constants within 5%, median error {physMedian.toFixed(2)}%. Muse Spark reading the same numbers by eye: {s?.medianEyeballErrPct.toFixed(0)}%. SAM centroids land a median {s?.medianTrackingErrPx.toFixed(2)} px from the true centre. All on <Link href="/proof">Proof</Link>.
        </>,
        <>Times come from the video file’s own sample table, not an assumed frame rate. Laws are written in a small equation language that Ansatz parses and compiles; nothing a model writes is ever run as code. The referee writes the finding with placeholders, and code fills in the numbers. Two inputs do come from Muse Spark, and every report lists them under “Given, not measured”: the size of the ruler it picked, and which world the clip is on.</>,
        <>
          Honest about its own method: against a library of 12 textbook laws, Muse Spark’s proposals tie on {ablation?.summary.tied ?? 25} of {ablation?.summary.clips ?? 28} clips, win {ablation?.summary.sparkBetter ?? 2} and lose {ablation?.summary.libraryBetter ?? 1}. The model matters where the textbook runs out, which is where Muse Wonder comes in.
        </>,
      ],
    },
    {
      name: "Demo",
      weight: 25,
      claim: "The first screen is the result, and you can watch a full run without spending anything.",
      points: [
        <>The home page opens on the experiment: every frame of the 1972 Moon broadcast cut to one slice, so John Young’s jumps draw their own arches, above the same clip slowed in secret, 1.5× longer on the same clock.</>,
        <>
          <Link href="/new">Run an experiment</Link> replays recorded runs, SAM’s measurements included, with no model called. Or film something: a phone propped on books is enough.
        </>,
        <>Every experiment has an ask box: Muse Spark answers from the run’s record, and code checks each number it quotes against that record.</>,
        <>The flagship experiments open on their own photo-finish strip, with the fitted part and the predicted part split by a dashed line.</>,
      ],
    },
  ];

  const tour = [
    { t: "0:00", title: "The first screen", body: `Two strips of the same Moon jump, one slowed in secret. ${rep ? `Asked about the slowed copy on its own, Muse Spark called it real speed ${realCallsText}` : "Muse Spark called the slowed copy real speed"}; Ansatz, timing the copy jump for jump, measures it ${sjText ? `${sjText} slower` : "slower"} (truth 1.5×).`, href: "/", go: "Home" },
    { t: "0:30", title: "The Moon experiment", body: `Gravity measured from the pixels of 1972 television, with a ruler we chose (${rulerRow ? rulerRow.source.replace(/^The ruler:\s*/i, "") : "Young’s suited height"}): ${g ? `${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s² against the Moon’s ${g.reference}` : "the Moon’s gravity"}${pointRow ? `, with a further ±${pointRow.value} depending on which point of the body is followed` : ""}. Scroll to “Can it tell the speed?” for the fair test.`, href: "/x/moon-jump", go: "Open it" },
    { t: "1:15", title: "A law Muse Spark didn’t propose", body: `A spring we rendered to stiffen as it stretches: Muse Spark’s laws miss, Muse Wonder’s notebook shows ${spring?.wonder?.attempts.length ?? "its"} attempts, and the cubic law it submitted wins on the last 30%, which no law was fitted to.`, href: "/x/hardening-spring", go: "Open it" },
    { t: "2:00", title: "The scoreboard", body: "Every number Ansatz reported on clips with known answers, beside Muse Spark’s guess by eye.", href: "/proof", go: "Proof" },
    { t: "2:30", title: "Watch a run", body: "A recorded run replays from the start: SAM 3.1’s measurements arrive frame by frame, the photo-finish strip builds as they do, and the candidate laws race across the unseen part. No model is called.", href: "/new?replay=hardening-spring", go: "Watch a recorded run" },
  ];

  const novel = [
    { title: "A test of memory against measurement", body: `We slowed a famous clip and told no one. A model that recognises footage answers from memory; one that measures can’t be fooled. Muse Spark, asked about each clip on its own: ${rep ? `it called the secretly slowed copy real speed ${rep.n - rep.b.calledSlowed} times out of ${rep.n}, answering ${rep.b.answers[0].playback_accel} m/s², the textbook value; it called the real broadcast slowed ${rep.a.calledSlowed} of ${rep.n} times` : "the same answer for both"}. Ansatz, timing each jump in the copy against the same jump in the broadcast: ${sjText ? `${sjText} slower` : "slower"} (truth: 1.5×). ${mt ? `Its two whole-run accelerations, ${mt.rows[0].g.toFixed(2)} and ${mt.rows[1].g.toFixed(2)} m/s², give a whole-run ratio of ${ratio.toFixed(2)}×.` : ""}`, href: "/x/moon-jump#speed-test" },
    { title: "Laws judged on motion they weren’t fitted to", body: "Every law is fitted to the first 70% of the motion and ranked on the last 30%, which no law was fitted to; no number from it reaches any model, and Muse Wonder’s fitting tool only has the first 70%. A law wins by predicting the rest, not by sounding right.", href: "/how" },
    { title: "A clock check from physics", body: "Gravity scales with the square of time. When a ruler makes gravity a measurement, a value far from the planet’s says the clip isn’t real time, and by how much.", href: "/x/sample-pendulum" },
    { title: "An agent that does science with a tool", body: "Muse Wonder doesn’t answer; it experiments. It fits laws to the seen frames, reads the residuals, revises, and submits one law to a trial it can’t see.", href: "/x/dry-friction-spring" },
    { title: "The video as its own chart", body: "Every frame cut to one slice through the moving object and laid side by side, a race-finish camera for physics. The motion draws its own graph in real pixels, and the measurement sits on top.", href: `/x/${Object.keys(slits)[0]}` },
    { title: "Numbers no model typed", body: "Every measured value in a report comes from the fit; the two things Muse Spark supplies (a ruler’s size, which world) are listed as given. The referee writes with placeholders; an answer from the ask box that quotes a number not in the record is flagged on screen.", href: "/x/moon-jump" },
  ];

  const breakIt = [
    ["Film in slow motion and don’t say so.", "With a ruler in view, the clock check flags it and names the factor. Without one, gravity is assumed and the report says so."],
    ["Say a wrong length aloud.", "The spoken length becomes the scale and is listed under “Given, not measured”, quoted, so the reader can see where the number came from."],
    ["Film something that isn’t textbook physics.", "Every proposed law will miss the unseen frames. Muse Wonder steps in; if it can’t do better, the winner is labelled as the best description available, not a closed case."],
    ["Film toward the camera.", "Depth isn’t measured. The motion has to cross the frame; the How it works page says so."],
    ["Ask the ask box for a number it doesn’t have.", "It is told to say what would be needed; any number it quotes that isn’t in the record is marked as unchecked."],
  ];

  const numbers: { what: string; value: string; href: string }[] = [
    ...(g ? [{ what: "Moon gravity from Apollo 16 television", value: `${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s² (true ${g.reference})`, href: "/x/moon-jump#constants" }] : []),
    ...(sj ? [{ what: "The same clip slowed 1.5× in secret, timed jump for jump", value: `${sjText} slower (truth 1.5×)${mt ? `; whole-run ratio ${ratio.toFixed(2)}× (${mt.rows[1].g.toFixed(2)} ± ${mt.rows[1].sigma.toFixed(2)} against ${mt.rows[0].g.toFixed(2)} m/s²)` : ""}`, href: "/x/moon-jump#same-jump" }] : []),
    ...(springTruth ? [{ what: "Hidden stiffening found by Muse Wonder", value: `k₃/m = ${+springTruth.measured.toPrecision(4)} ± ${+springTruth.sigma.toPrecision(2)} m⁻²s⁻² (true ${+springTruth.truth.toPrecision(4)})`, href: "/x/hardening-spring#constants" }] : []),
    ...(refb ? [{ what: "Referee asked for a new law: when one was missing / when it wasn’t", value: `${refb.summary.reviseWhenNeeded} of ${refb.summary.needed} / ${refb.summary.reviseWhenRight} of ${refb.summary.right}`, href: "/proof#models" }] : []),
    ...(wonb ? [{ what: "Muse Wonder challenged on every benchmark clip: kept the right law", value: `${wonb.summary.tie} of ${wonb.summary.clips}; ${wonb.summary.worse} overreaches, all rejected by the held-out test`, href: "/proof#models" }] : []),
    ...(mt?.controls ? [{ what: "A copy slowed 1.5× through jump 1 only, real speed through jump 2 (same length as the broadcast)", value: mt.controls.clips.find((c) => c.id === "ramp")!.jumps.map((j) => `${j.ratio.toFixed(3)} ± ${j.sigma.toFixed(3)}× (true ${j.truth}×)`).join(", then "), href: "/x/moon-jump#same-jump" }] : []),
    ...(sw ? [{ what: "Pendulum practical: tape lengths with Ansatz’s periods", value: `g = ${sw.tape.g.toFixed(3)} ± ${Math.hypot(sw.tape.sgScatter, sw.tape.sgTape).toFixed(3)} m/s² (${Math.abs(sw.tape.offPct).toFixed(2)}% off); period to ${Math.min(...sw.rows.map((r) => r.relTpct)).toFixed(3)}–${Math.max(...sw.rows.map((r) => r.relTpct)).toFixed(2)}% vs about ${sw.rows[0].stopwatch.relTpct.toFixed(1)}% for a 20-swing stopwatch (estimate)`, href: "/series/pendulum-lengths#stopwatch" }] : []),
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
      <header className={styles.top}>
        <div className={`wrap ${styles.head}`}>
          <div>
            <h1>For judges</h1>
            <p className="lede" style={{ marginTop: 16 }}>
              Ansatz turns any video of something moving into a physics experiment: SAM 3.1 measures every frame, Muse Spark and Muse Wonder propose laws of motion, and each law is ranked on the last 30% of the motion, which no law was fitted to; no number from it reaches any model. The law that predicts it best wins. Here it is against your four criteria. Every number on this page is read from the stored runs, and every claim links to where you can check it.
            </p>
            <p className={styles.headCta}>
              <Link className="btn" href="/new?replay=hardening-spring">
                Watch a recorded run
              </Link>
              <a className="btn ghost" href="#bring-a-clip">
                Run your own clip
              </a>
            </p>
            <HeroStill />
            <p className={styles.headNote}>
              A recorded run calls no model and needs no link. To run your own clip, open <Link href="/new">Run an experiment</Link>: every visitor gets {PER_VISITOR} runs a day{laneEnds ? `, and the judges’ link, if you were sent it, has more reserved for judges until ${laneEnds}` : ""}. For agents: <a href="/llms.txt">/llms.txt</a> lists every number with its source, and <Link href="/x">/x</Link> indexes every experiment.
            </p>
          </div>
          <ol className={styles.board} aria-label="The judging criteria">
            {criteria.map((c) => (
              <li key={c.name}>
                <a href={`#${c.name.toLowerCase().replace(/ /g, "-")}`}>
                  <span className={styles.boardName}>
                    {c.name} <span className={styles.boardWeight}>weight {c.weight}%</span>
                  </span>
                  <span className={styles.boardClaim}>{c.claim}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
        <div className={`wrap ${styles.proofRow}`}>
          {hl.moon && (
            <Link href="/x/moon-jump">
              <b>
                {hl.moon.g.toFixed(2)} ± {hl.moon.sigma.toFixed(2)} m/s²
              </b>
              <span>the Moon’s gravity, measured from 1972 television by SAM 3.1 and code (true {hl.moon.reference}); the ± is statistical and ruler{pointRow ? `, and which point of the body is followed adds about ±${pointRow.value}` : ""}</span>
            </Link>
          )}
          {hl.jumpForJump && (
            <Link href="/x/moon-jump#same-jump">
              <b>
                {hl.jumpForJump.ratio.toFixed(3)} ± {hl.jumpForJump.sigma.toFixed(3)}×
              </b>
              <span>how much slower the secretly slowed copy runs, measured jump for jump (true 1.5×){rep ? `; Muse Spark, asked about it alone, called it real speed ${realCallsText}` : ""}</span>
            </Link>
          )}
          <Link href="/proof">
            <b>
              {physWithin} of {phys.length}
            </b>
            <span>constants within 5% on clips with known physics, median {physMedian.toFixed(2)}%; Muse Spark by eye: {s?.medianEyeballErrPct.toFixed(0)}%</span>
          </Link>
        </div>
      </header>

      <section className="section" id="tour">
        <div className="wrap">
          <h2>If you have three minutes</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Five stops, in this order. Nothing here spends credits.
          </p>
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
        </div>
      </section>

      <section className={`section ${styles.band}`}>
        <div className="wrap">
          <h2>Against your criteria</h2>
          <div className={styles.criteria}>
            {criteria.map((c) => (
              <section key={c.name} id={c.name.toLowerCase().replace(/ /g, "-")} className={styles.criterion}>
                <p className={styles.cWeight}>
                  {c.name}, {c.weight} points
                </p>
                <h3 className={styles.cClaim}>{c.claim}</h3>
                <ul>
                  {c.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>What is new here</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Plenty of projects ask a model what is in a video. Ansatz treats the model as a scientist that has to be checked, and builds the checks.
          </p>
          <div className={styles.novel}>
            {novel.map((n) => (
              <Link key={n.title} href={n.href} className={styles.novelCard}>
                <h3>{n.title}</h3>
                <p>{n.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={`section ${styles.dark}`}>
        <div className="wrap">
          <h2>Every Meta model has a job only it can do</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Calls and spend across the {exps.length} published runs, read from each run’s own ledger.
          </p>
          <div className={styles.models}>
            {usage.map((m) => (
              <section key={m.id} className={styles.model}>
                <h3>{m.name}</h3>
                <p className={styles.modelStat}>
                  {m.calls} {m.calls === 1 ? "call" : "calls"}{m.frames ? `, ${m.frames.toLocaleString("en")} frames` : ""}, ${m.usd.toFixed(2)}
                </p>
                <p>{m.job}</p>
                <Link href={m.href}>{m.where}</Link>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className={`section ${styles.band}`}>
        <div className={`wrap ${styles.two}`}>
          <div>
            <h2>Try to break it</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              Here is what happens when you do.
            </p>
          </div>
          <dl className={styles.breaks}>
            {breakIt.map(([a, b]) => (
              <div key={a}>
                <dt>{a}</dt>
                <dd>{b}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className={`section ${styles.band}`}>
        <div className={`wrap ${styles.two}`}>
          <div>
            <h2>After judging, for schools</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              What a run costs, where the money goes, and how it gets cheaper. Planned, not built yet, except where it says so.
            </p>
          </div>
          <ul className={styles.gaps}>
            <li>
              Today a run costs {costText(hl)}, which we pay, with daily limits per visitor and per class. Of that, SAM 3.1’s measurement is the median {samMedianCents} cents; the rest is Muse Spark watching, proposing and refereeing, and Muse Wonder when it is called in.
            </li>
            <li>A lite mode for school practicals: the student names the experiment, SAM 3.1 measures, and code fits the textbook laws. Measured offline on the stored benchmark runs (not yet a button on the site): {lite ? `${lite.summary.constantsWithin5} of ${lite.summary.constantsChecked} constants within 5% at about ${Math.round(lite.summary.medianSamUsd * 100)} cents a clip` : "the same accuracy at the cost of SAM alone"}.</li>
            <li>Muse Spark Open, the open-weight model, could watch and referee on a school’s own machine; we have not tried it yet, and will publish how often it agrees with Muse Spark on the benchmark before relying on it.</li>
            <li>The code, the benchmark clips and their true values stay public, so a teacher or a board can check the method without trusting us.</li>
          </ul>
        </div>
      </section>

      <section className="section" id="gaps">
        <div className={`wrap ${styles.two}`}>
          <div>
            <h2>What we have not shown yet</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              The gaps, in our own words, before you find them.
            </p>
          </div>
          <ul className={styles.gaps}>
            <li>{phoneRuns ? `Every clip here was filmed on a phone by us (${phoneRuns}), rendered by us or found online.` : "Every clip here was rendered by us or found online; none was filmed on a phone yet."} No outside student or teacher has run it yet.</li>
            <li>Muse Wonder’s two wins are on renders we built to need a law outside the base textbook library, and both laws (a cubic spring, dry friction) are ones a physicist knows: a library extended with them ties it. A law nobody planted is still to be shown.</li>
            <li>The benchmark clips are rendered, so the physics is clean. Real footage adds motion blur, rolling shutter and lens distortion that the renders only partly imitate.</li>
            <li>One object at a time: two bodies colliding, or anything moving toward the camera, isn’t measured.</li>
            <li>
              The clock check is only as good as the ruler{slow ? ` (${slow.line})` : ""}
              {misread.length ? `: on the ${misread.map((r) => `${r.slow}× render the ruler was misread and the factor came out ${r.factor!.toFixed(1)}×`).join("; on the ")}` : ""}
              {missedSlow.length ? `; on the ${missedSlow.map((r) => `${r.slow}×`).join(" and ")} ${missedSlow.length === 1 ? "render" : "renders"} the ruler’s size was only guessed or not trusted, so the slowdown wasn’t flagged` : ""}. Stating the ruler’s size fixes these.
            </li>
            <li>Without a ruler, a slowed clip and a weaker world look the same: the report says both are possible.</li>
          </ul>
        </div>
      </section>

      <section className="section" id="numbers">
        <div className="wrap">
          <h2>The numbers, and where each one lives</h2>
          <table className={styles.numbers}>
            <thead>
              <tr>
                <th>Claim</th>
                <th>Value</th>
                <th>Check it</th>
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
          <p className="small" style={{ marginTop: 12 }}>
            Code: <a href="https://github.com/RohanGlitched/ansatz">github.com/RohanGlitched/ansatz</a>. The benchmark clips, their true values and the scoring script are in the repository.
          </p>
        </div>
      </section>

      <section className={`section ${styles.dark} ${styles.end}`} id="bring-a-clip">
        <div className="wrap">
          <h2>Bring a clip</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Anything that falls, swings, bounces or rolls, filmed from a phone that stays still. Say what you know while you film. Upload it on Run an experiment: every visitor gets {PER_VISITOR} runs a day. The judges’ link, if you were sent it, has runs and a daily budget reserved for judges{laneEnds ? ` until ${laneEnds}` : ""}, so a busy day for visitors won’t lock you out, and every run made with it is listed on one page. A recorded run needs no link and calls no model.
          </p>
          <p style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/new">
              Run an experiment
            </Link>
            <Link className="btn ghost" href="/new?replay=hardening-spring">
              Watch a recorded run
            </Link>
            <Link className="btn ghost" href="/how">
              How it works
            </Link>
          </p>
        </div>
      </section>
    </article>
  );
}

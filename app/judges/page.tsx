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
import { offlineText, runTime, runTimeText } from "@/app/runtime";
import { canYouTell, quizSaid } from "@/app/cyt";
import { PRACTICALS } from "@/app/lab/practicals";
import { sealedTest } from "@/app/sealed";
import { voiceLite } from "@/app/voiceLite";
import { strangersTally } from "@/app/proof/strangers";
import { DEMO_VIDEO_LENGTH, demoVideoEmbed, demoVideoUrl } from "@/app/video";
import { fou5Long, fou5Of, fou5SameFilmLawFree } from "@/lib/fou5";
import { firstScreen } from "@/app/firstScreen";
import BuiltBy from "@/components/book/BuiltBy";
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
  { id: "muse-wonder-1.0", name: "Muse Wonder 1.0", job: "The agent with a tool. When every proposed law misses, it gets a fit_law tool on the seen frames only, tries laws, reads their residuals and submits one, which must then win on the held-out 30%.", where: "Its notebook on the hardening spring", href: "/x/hardening-spring#notebook" },
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
  const fou5 = fou5Of(by("foucault-pendulum-5x"), fou);
  // a stranger's pendulum on black (Aachen), told only its stated length
  const aachenG = by("aachen-pendulum-50cm")?.comparisons.find((c) => c.param === "g");
  const spring = by("hardening-spring");
  const springTruth = spring?.extras?.truth?.rows.find((r) => r.param === "beta");
  const sparkBest = (e: Experiment) => e.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0];
  // Muse Wonder's law won these published runs; it "found the law" only where its law predicts the unseen frames within
  // five times the noise. A win that still misses by far more (the real Foucault footage) is an improvement, not a found law.
  const wonderWins = exps.filter((e) => winnerOf(e).origin === "revision");
  const wonderFound = wonderWins.filter((e) => (winnerOf(e).fit.testZ ?? Infinity) <= 5);
  const wonderBetter = wonderWins.filter((e) => !wonderFound.includes(e));
  const px = (v: number) => `${v.toFixed(1)} px`;
  // a short name for each run where Muse Wonder's law won without finding the law (never the record's long title)
  const shortName = (e: Experiment) => {
    const sd = (e.extras as { sealed?: { round: number; drawn: { drive: boolean } } } | undefined)?.sealed;
    return e.id.startsWith("foucault") ? "the real Foucault footage" : sd ? `the ${sd.drawn.drive ? "driven " : ""}spring drawn by drand (round ${sd.round})` : e.title.toLowerCase();
  };
  const betterText = wonderBetter
    .map((e) => `on ${shortName(e)} its law beat Muse Spark’s (held-out miss ${px(winnerOf(e).fit.testRms)} against ${px(sparkBest(e)?.fit.testRms ?? NaN)}) but still misses by ${Math.round(winnerOf(e).fit.testZ ?? NaN)}× the noise`)
    .join("; ");
  // springs whose law Ansatz was not shown: the four we built (two found, both by Muse Wonder; the lopsided and the tiring
  // spring missed, /proof#fails) and the drand draws; Muse Wonder's finds are counted from the records
  const BUILT = { n: 4, found: 2, wonder: 2 };
  const sealed = await sealedTest().catch(() => null);
  const springsN = BUILT.n + (sealed?.n ?? 0), springsFound = BUILT.found + (sealed?.found ?? 0), springsWonder = BUILT.wonder + (sealed?.wonderFound ?? 0);
  // which of Muse Wonder's found laws stand: the friction law; the drawn cubic spring, with its replicate runs; the hardening
  // spring, which a later re-run had Muse Spark propose itself; and any later drawn law Muse Wonder found
  const sRep = sealed?.replicate;
  const laterWonder = sealed ? sealed.draws.filter((d) => d.verdict === "hit" && d.author === "Muse Wonder" && d.round !== sRep?.round) : [];
  const wonderStand = `the dry-friction law stands; the drawn cubic spring (round ${sRep?.round ?? 6604797}) ${sRep ? `was found on its first run and in ${sRep.k - 1} of ${sRep.n - 1} replicate runs on the identical clip at code ${sRep.code} (${sRep.k} of ${sRep.n} in all; the other wrote a false drive)` : "was found on its first run"}; and on the hardening spring a later re-run had Muse Spark propose the cubic law itself${laterWonder.length ? `; ${laterWonder.length} more drawn ${laterWonder.length === 1 ? "law" : "laws"} found by Muse Wonder (${laterWonder.map((d) => `round ${d.round}, set ${d.set}`).join("; ")}), on ${laterWonder.length === 1 ? "its" : "their"} first run` : ""}`;
  const springsText = `Of ${springsN} springs whose law it was not shown (${BUILT.n} we built, ${sealed?.n ?? 0} drawn by drand), Ansatz found ${springsFound}, and Muse Wonder wrote ${springsWonder} of those laws${springsFound > springsWonder ? `; Muse Spark’s own law was the ${springsFound - springsWonder === 1 ? "other" : "others"}` : ""}`;
  const wonderJob = `The agent with a tool. When every proposed law misses, it gets a fit_law tool on the seen frames only, tries laws, reads their residuals and submits one, which must then win on the held-out 30%. ${springsText}. Of those, ${wonderStand}.${betterText ? ` ${betterText.charAt(0).toUpperCase()}${betterText.slice(1)}.` : ""}`;
  // the published run is the one where Muse Spark's laws missed; a later re-run's note says what changed since
  const springRerun = (spring as (Experiment & { rerun?: { note: string } }) | undefined)?.rerun;
  const Q = "(on a later re-run with today’s prompt, Muse Spark proposed the cubic law itself; both pass the same held-out test)";
  // the friction spring, re-run on the benchmarked pipeline (2026-10-27c): the referee (Muse Spark) named the physics, Muse Wonder made it a law
  const fric = by("dry-friction-spring");
  const fricWin = fric ? winnerOf(fric) : undefined;
  const fricLead = fric?.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.rank - b.rank)[0];
  const fricHandoff = !!fric && fric.wonder?.trigger === "referee" && /coulomb|dry/i.test(fric.critique?.preRevision?.revision_idea ?? "") && fricWin?.origin === "revision";
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
  // the five repeats are its answer; a single ask before them, a separate call, said both clips were slowed
  const firstAsk = st?.single?.find((x) => x.clip === "B");
  const firstAskA = st?.single?.find((x) => x.clip === "A");
  const realCallsText = rep ? `${realCalls} times out of ${rep.n} repeats${firstAsk ? ` (a single ask before them, a separate call, said slowed ${firstAsk.factor}×${firstAskA?.factor === firstAsk.factor ? ", and said the same of the broadcast" : ""})` : ""}` : "";
  const fou5Quiz = quizSaid("foucault-pendulum-5x");
  const fou5Spark = `during the run Muse Spark described the swing as playing at real time${fou5Quiz ? `; ${fou5Quiz.said}` : ""}`;
  const cyt = await canYouTell().catch(() => null);
  const fricTruth = fric?.extras?.truth?.rows.find((r) => r.param === "ac")?.si;
  // /lab's own counts of the Class XI practicals about motion and force
  const lab = { n: PRACTICALS.length, full: PRACTICALS.filter((p) => p.status === "covered").length, part: PRACTICALS.filter((p) => p.status === "part").length, not: PRACTICALS.filter((p) => p.status === "not").length };
  const W = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
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

  // the two published lite runs where Muse Voice Transcribe set the length (synthetic voices), read from their records
  const voice = await voiceLite().catch(() => null);
  // what each Meta model did across the published runs, from their own ledgers
  const usage = MODELS.map((m) => {
    const calls = exps.flatMap((e) => e.ledger.calls.filter((c) => c.model === m.id));
    return { ...m, job: m.id === "muse-wonder-1.0" ? wonderJob : m.id === "muse-voice-transcribe-1.0" && voice ? `${m.job} ${voice.short}: nothing typed, so the length came only from the transcript.` : m.job, calls: calls.length, usd: calls.reduce((a, c) => a + c.usd, 0), frames: calls.reduce((a, c) => a + ((c as { frames?: number }).frames ?? 0), 0) };
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
      claim: `It has measured teaching footage a stranger filmed${aachenG ? ` (a pendulum to ${Math.abs(aachenG.errorPct).toFixed(2)}%, the best of ${strangersTally().n} strangers’ clips)` : ""}. Next, the Class XI pendulum and dissipation practicals, today, with these runs (/lab).`,
      points: [
        <>
          On teaching footage strangers filmed and shared, told only what the film says: a 50 cm pendulum from the Mathe-AC Lernwerkstatt Aachen gives {aachenG ? `g = ${aachenG.measured.toFixed(2)} ± ${aachenG.sigma.toFixed(2)} m/s², ${Math.abs(aachenG.errorPct).toFixed(2)}% off` : "g within a fraction of a percent"} (the ± assumes the stated length is good to 1%). A 25 cm test rig gives 9.84 m/s², 0.3% off, though the publish gate refused its law. A dark bob on a dark chalkboard failed: SAM 3.1 could not hold it. Those are the two best and one miss; in all, {strangersTally().text.replace(/^(\S+) clips strangers filmed: /, "of $1 clips strangers filmed: ")}. All of them are shown (<Link href="/proof#strangers">Proof, footage from strangers</Link>).
        </>,
        <>The promise, not yet shown: a student films a ball, says what they know in their own language, and gets the law, the constants with error bars, and how far they are from the textbook. Reports read in {langs} languages, and the numbers in a translation are checked against the English before it is shown.</>,
        <>
          Teachers get a class code, a grading sheet with every student&rsquo;s run and a CSV: <Link href="/class/demo23">a sample class</Link>. The pendulum practical becomes a series: several string lengths fitted together, g from the slope of L against T² (<Link href="/series/pendulum-lengths">an example</Link>).
        </>,
        <>For a teacher tomorrow: <Link href="/lab">/lab</Link> maps the {W[lab.n] ?? lab.n} Class XI practicals about motion and force (CBSE 2026-27 and the NCERT lab manual, each cited by page) to runs: {W[lab.full] ?? lab.full} covered in full, {W[lab.part] ?? lab.part} in part, {W[lab.not] ?? lab.not} not yet, each with what to film, what to tape up, the stored run&rsquo;s accuracy and a report that prints, plus a worksheet in English and Hindi and a 40-minute lesson on the Falsification Plate. No teacher has used it yet.</>,
        <>A run costs {costText(hl)} in Meta credits and takes {runTimeText(rt)}. {offlineText(exps)} Each lab report prints with student fields, or exports as a PDF.</>,
        <>
          Who it is for: an analysis of UDISE+ 2025-26 counts about 1.25 lakh of India&rsquo;s 2.96 lakh schools with secondary classes that have no integrated science lab (<a href="https://educationforallinindia.com/integrated-science-laboratories-in-secondary-schools-in-india-udise-2025-26/">Education for All in India</a>). A two-gate school timing kit is listed at £198 (<a href="https://philipharris.co.uk/product/physics/motions-and-forces/motion-and-acceleration/philip-harris-foundation-physics-light-gate/pp00057791">Philip Harris</a>); a phone is already in most students&rsquo; pockets.
        </>,
        <>
          Beyond the classroom: it is system identification from any video, with a model kept honest.{" "}
          {fou5 ? `On real footage a filmmaker sped up ${+fou5.truth.toPrecision(3)}× and labelled on screen (we cropped the label out), ${fou5Spark}; the clock check reads it as ${fou5Long(fou5)}${fou5SameFilmLawFree(fou5) ? `, and against the same film’s real-time stretch, with no reference value at all, ${fou5SameFilmLawFree(fou5)}` : ""}.` : "On real footage its filmmaker sped up and labelled, the clock check reads how much faster than life it plays."}
        </>,
      ],
      evidence: [
        { label: "Footage from strangers", href: "/proof#strangers" },
        { label: "A sample class", href: "/class/demo23" },
        { label: "For teachers: the Class XI practicals", href: "/lab" },
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
        <>Structured output with strict JSON schemas, video input at the clip&rsquo;s own frame rate, up to 300 frames, function tools for Muse Wonder, streamed SAM masks drawn live during a run. Muse Spark watches the whole clip to name what moves; on today&rsquo;s pipeline no number from the last 30% reaches it, and no law is fitted to it.</>,
        <>
          {fricHandoff && fricWin && fricLead ? (
            <>
              Muse Spark and Muse Wonder hand off. On a rendered spring slowed by dry friction (<Link href="/x/dry-friction-spring">run on the benchmarked pipeline, 2026-10-27c</Link>), Muse Spark&rsquo;s laws used air drag. Refereeing, Muse Spark read their residual plot and named dry (Coulomb) friction. Muse Wonder turned that into a law with its fitting tool, saw a bound stuck and widened it. Its law misses the unseen motion by {fricWin.fit.testRms.toFixed(3)} px, against {fricLead.fit.testRms.toFixed(2)} px for Muse Spark&rsquo;s leading law ({Math.round(fricLead.fit.testRms / fricWin.fit.testRms)}× less).{" "}
            </>
          ) : null}
          On {wonderFound.length} of the published runs Muse Wonder found the law Muse Spark missed{betterText ? `; ${betterText}` : ""}. {springsText}. On the stiffening spring&rsquo;s published run, an older pipeline, its law missed the unseen motion {Number.isFinite(springGain) ? `${Math.round(springGain)}× less than Muse Spark’s best (${mm(winnerOf(spring!).fit.testRms)} against ${mm(sparkBest(spring!)!.fit.testRms)})` : "by far less than Muse Spark’s best"}
          {springTruth ? `, and recovers the hidden stiffening k₃/m = ${+springTruth.measured.toPrecision(4)} ± ${+springTruth.sigma.toPrecision(2)} against a true ${+springTruth.truth.toPrecision(4)}` : ""}
          {springRerun ? ` ${Q}` : ""}.
        </>,
        <>
          Each model was also tested on its own over the whole benchmark (<Link href="/proof#models">Proof</Link>): the referee asked for a new law on {refb ? `${refb.summary.reviseWhenNeeded} of ${refb.summary.needed}` : "both"} renders that needed one and on {refb ? `${refb.summary.reviseWhenRight} of ${refb.summary.right}` : "none of the"} clips whose leading law already had the right physics (it also accepted the leading law on two two-body collisions, which no law here describes); Muse Wonder, challenged on every clip with its old setting (low effort, no residual plot), kept the leading law on {wonb ? `${wonb.summary.tie} of ${wonb.summary.clips}` : "most"}, and the held-out test threw out the {wonb?.summary.worse ?? "few"} laws where it overreached.
        </>,
        ...(sealed
          ? [
              <>
                {sealed.summary.replace(/\.$/, "")}: the seal {sealed.sets.length > 1 ? "commits" : "commit"}{" "}
                {sealed.sets.map((x, i) => (
                  <span key={x.seal}>
                    {i ? (i === sealed.sets.length - 1 ? " and " : ", ") : ""}
                    <a href={x.sealUrl}>{x.seal}</a> (set {x.set}, revealed in <a href={x.revealUrl}>{x.reveal}</a>)
                  </span>
                ))}
                , the drand rounds{" "}
                {sealed.draws.map((d, i) => (
                  <span key={d.round}>
                    {i ? ", " : ""}
                    <a href={d.url}>{d.round}</a>
                  </span>
                ))}{" "}
                and the runs ({sealed.draws.map((d, i) => (
                  <span key={d.href}>
                    {i ? ", " : ""}
                    <Link href={d.href}>{d.verdict}</Link>
                  </span>
                ))}). <Link href="/proof#sealed">All {sealed.n}, with their constants</Link>. {sealed.headline} {sealed.pattern}
                {sealed.wonderStory ? ` ${sealed.wonderStory}` : ""}
              </>,
              <>
                What the seal proves, and what it does not: {sealed.proves} When each set was sealed, from GitHub&rsquo;s own push records: {sealed.timing}
              </>,
              <>
                {sealed.rule}
                {sealed.driveNote ? ` ${sealed.driveNote}` : ""}
              </>,
            ]
          : []),
        <>Every model call is listed on its experiment with its purpose, time and cost, so you can see exactly what each model did.</>,
      ],
      evidence: [
        { label: "The friction handoff (pipeline 2026-10-27c)", href: "/x/dry-friction-spring#notebook" },
        { label: "Muse Wonder's notebook", href: "/x/hardening-spring#notebook" },
        { label: "Each model tested alone", href: "/proof#models" },
        ...(sealed ? [{ label: "Laws nobody chose: drawn by drand, sealed before the run", href: "/proof#sealed" }] : []),
        { label: "The Hindi pendulum", href: "/x/hindi-pendulum" },
      ],
    },
    {
      name: "Technical depth",
      weight: 20,
      claim: "The model proposes; the data decides; code computes every measured number.",
      points: [
        <>Each law is integrated with RK4 (bounces located inside the step), fitted by Levenberg&ndash;Marquardt to the first 70% of the motion and ranked, in units of the measured noise, on the held-out last 30%; on today&rsquo;s pipeline no number from it reaches any model.</>,
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
        <>The home page opens on real footage: the 1972 Moon broadcast and the same clip slowed in secret, in their original colour, with the result in one line. Further down, a Falsification Plate puts the line between the motion the laws may see and the motion they must predict in your hands: drag it and, on that published run, Muse Spark&rsquo;s laws are refuted by the future while Muse Wonder&rsquo;s holds. Every experiment page opens on the same plate.</>,
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
    { t: "0:00", title: "The first screen", body: `The Moon, two clips in their original colour: ${rep ? `asked about the slowed copy on its own (this test’s own prompt, on the whole jump; the blind test next asks a different question of a shorter cut), Muse Spark called it real speed ${realCallsText}` : "Muse Spark called the slowed copy real speed"}; Ansatz, timing the copy jump for jump against the broadcast (jump windows set by hand), measures it ${sjText ? `${sjText} slower` : "slower"} (truth 1.5×).`, href: "/", go: "Home" },
    ...(cyt
      ? [{ t: "0:20", title: "Can you tell?", body: `Six real clips, about a minute: say whether each plays at real speed, slowed or sped up, then see what Muse Spark answered to the same question (${cyt.pub.n} times a clip) and what Ansatz measured. By verdict, Muse Spark ${cyt.answers.sets.map((x) => `${x.spark} of ${cyt.answers.clips.length} ${x.key === "first" ? "on its " : ""}${x.label}`).join(", ")}; Ansatz ${cyt.answers.ansatz} of ${cyt.answers.clips.length}. The right factor, within ${Math.round(cyt.answers.factor.tol * 100)}% and by majority answer, on the ${cyt.answers.factor.n} retimed clips: Muse Spark ${cyt.answers.sets.map((x) => `${x.factor.spark} of ${x.factor.n}`).join(", ")} in the same order, Ansatz ${cyt.answers.factor.ansatz} of ${cyt.answers.factor.n}.${cyt.answers.parityMedium ? " Muse Spark’s baseline was re-asked at medium reasoning effort, the effort Ansatz’s own observer uses; the low-effort sets stay published beside it." : ""} Watching can say whether; only measuring says by how much.`, href: "/#can-you-tell", go: "Play it" }]
      : []),
    { t: "0:45", title: "The Moon experiment", body: `Gravity measured from the pixels of 1972 television, with a ruler we chose (${rulerRow ? rulerRow.source.replace(/^The ruler:\s*/i, "") : "Young’s suited height"}): ${g ? `${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s² against the Moon’s ${g.reference}` : "the Moon’s gravity"}${pointRow ? `, with a further ±${pointRow.value} depending on which point of the body is followed` : ""}. Scroll to “Can it tell the speed?” for the fair test.`, href: "/x/moon-jump", go: "Open it" },
    fricHandoff && fricWin && fricLead
      ? { t: "1:15", title: "Two models hand off, and Muse Wonder writes the law", body: `A spring we rendered with dry friction, run on the benchmarked pipeline (2026-10-27c). Muse Spark’s laws used air drag. Refereeing, Muse Spark read their residual plot and named dry friction. Muse Wonder turned that into a law with its fitting tool: it misses the unseen motion by ${fricWin.fit.testRms.toFixed(3)} px against ${fricLead.fit.testRms.toFixed(2)} px for Muse Spark’s leading law${fricTruth ? `, with friction ${fricTruth.measured.toFixed(3)} ± ${fricTruth.sigma.toFixed(3)} m/s² against a true ${fricTruth.truth}` : ""}. (The older stiffening-spring run, from an earlier pipeline that allowed several fits a turn, shows ${spring?.wonder?.attempts.length ?? "its"} attempts in its notebook.)`, href: "/x/dry-friction-spring", go: "Open it" }
      : { t: "1:15", title: "A law Muse Wonder found", body: `A spring we rendered to stiffen as it stretches: on the published run, from an older pipeline that allowed several fits a turn, Muse Spark’s laws miss, Muse Wonder’s notebook shows ${spring?.wonder?.attempts.length ?? "its"} attempts, and the cubic law it submitted wins on the held-out 30%.`, href: "/x/hardening-spring", go: "Open it" },
    ...(sealed
      ? [{ t: "1:45", title: "Laws nobody chose", body: `${sealed.headline} Ansatz was told only “${sealed.narration}”. Each draw, the rule for “found”, the prompt line behind the driven misses and what the seal does not prove are on one page.`, href: "/proof#sealed", go: "The sealed laws" }]
      : []),
    { t: "2:00", title: "The scoreboard", body: "Every number Ansatz reported on clips with known answers, beside Muse Spark’s guess by eye, and the cases where it fails.", href: "/proof", go: "Proof" },
    { t: "2:30", title: "Watch a run", body: "A recorded run replays from the start: SAM 3.1’s measurements arrive frame by frame, the photo-finish strip builds as they do, and the candidate laws race across the unseen part. No model is called.", href: "/new?replay=hardening-spring", go: "Watch a recorded run" },
  ];

  const novel = [
    { title: "A test of memory against measurement", body: `We slowed a famous clip and told no one. A model that recognises footage answers from memory; one that measures can’t be fooled. Muse Spark, asked about each clip on its own (this test’s own prompt, on the whole jump with the astronaut’s height as a ruler; the home page’s blind test asks a different question of a shorter cut): ${rep ? `it called the secretly slowed copy real speed ${realCallsText}, answering ${rep.b.answers[0].playback_accel} m/s², the textbook value; it called the real broadcast slowed ${rep.a.calledSlowed} of ${rep.n} times` : "the same answer for both"}. Ansatz, timing each jump in the copy against the same jump in the broadcast: ${sjText ? `${sjText} slower` : "slower"} (truth: 1.5×). ${mt ? `Its two whole-run accelerations, ${mt.rows[0].g.toFixed(2)} and ${mt.rows[1].g.toFixed(2)} m/s², give a whole-run ratio of ${ratio.toFixed(2)}×.` : ""}`, href: "/x/moon-jump#speed-test" },
    { title: "Laws judged on motion they weren’t fitted to", body: "Every law is fitted to the first 70% of the motion and ranked on the last 30%, which no law was fitted to; on today’s pipeline no number from it reaches any model, and Muse Wonder’s fitting tool only has the first 70%. A law wins by predicting the rest, not by sounding right.", href: "/how" },
    { title: "Gravity is a clock", body: "One known length turns gravity into a clock: if g comes out wrong by a square, the footage is not playing at life speed. Gravity scales with the square of time. When a ruler makes gravity a measurement, a value far from the planet’s says the clip isn’t real time, and by how much.", href: "/x/foucault-pendulum-5x" },
    { title: "An agent that does science with a tool", body: "Muse Wonder doesn’t answer; it experiments. It fits laws to the seen frames, reads the residuals, revises, and submits one law to a trial it can’t see.", href: "/x/dry-friction-spring" },
    { title: "The video as its own chart", body: "Every frame cut to one slice through the moving object and laid side by side, a race-finish camera for physics. The motion draws its own graph in real pixels, and the measurement sits on top.", href: `/x/${Object.keys(slits)[0]}` },
    { title: "Numbers no model typed", body: "Every measured value in a report comes from the fit; the two things Muse Spark supplies (a ruler’s size, which world) are listed as given. The referee writes with placeholders; an answer from the ask box that quotes a number not in the record is flagged on screen.", href: "/x/moon-jump" },
  ];

  const breakIt = [
    ["Film in slow motion and don’t say so.", "With a ruler in view, the clock check flags it and names the factor. Without one, gravity is assumed and the report says so."],
    ["Say a wrong length aloud.", "The spoken length becomes the scale and is listed under “Given, not measured”, quoted, so the reader can see where the number came from."],
    ["Film something that isn’t textbook physics.", "Every proposed law will miss the unseen frames. Muse Wonder steps in; if it can’t do better, the winner is labelled as the best description available, not a closed case."],
    ["Film toward the camera.", "Depth isn’t measured. The motion has to cross the frame; the How it works page says so."],
    ["Film a dark object against a dark background.", "SAM 3.1 may not find it, and the fits come out poor. Proof shows a real classroom clip where this happened and no usable g was reported, and the same source's grey bob on black, which measured fine."],
    ["Ask the ask box for a number it doesn’t have.", "It is told to say what would be needed; any number it quotes that isn’t in the record is marked as unchecked."],
  ];

  const numbers: { what: string; value: string; href: string }[] = [
    ...(g ? [{ what: "Moon gravity from Apollo 16 television", value: `${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s² (true ${g.reference})`, href: "/x/moon-jump#constants" }] : []),
    ...(fouG ? [{ what: "Real footage: a museum’s Foucault pendulum, g from the swing and its published length (8.97 m)", value: `about ${fouG.measured.toFixed(1)} m/s² (9.807 there)${fouSpark ? `; Muse Spark’s plain law about ${fouSpark.measured.toFixed(2)}, with no error bar either (it misses by ${Math.round(sparkBest(fou!)?.fit.testZ ?? NaN)}× the noise)` : ""}; no error bar on the winning law, which misses the unseen frames by ${Math.round(winnerOf(fou!).fit.testZ ?? NaN)}× the noise`, href: "/x/foucault-pendulum" }] : []),
    ...(aachenG ? [{ what: "Real footage from a stranger: a 50 cm pendulum on black (Rhetos, Aachen, CC BY-SA 4.0), told only “about fifty centimetres”", value: `${aachenG.measured.toFixed(2)} ± ${aachenG.sigma.toFixed(2)} m/s² (9.807 there; ${Math.abs(aachenG.errorPct).toFixed(2)}% off; the ± assumes the stated length is good to 1%); clock check: real time`, href: "/x/aachen-pendulum-50cm" }] : []),
    ...(fou5 ? [{ what: "Real footage sped up 5× by its filmmaker (label cropped out): the clock check’s reading", value: `${fou5Long(fou5)} (truth 5×)${fou5SameFilmLawFree(fou5) ? `; against the same film’s real-time stretch, with no reference value, ${fou5SameFilmLawFree(fou5)}` : ""}; ${fou5Spark}`, href: "/x/foucault-pendulum-5x" }] : []),
    ...(sealed ? [{ what: "Spring laws drawn by drand and sealed before the clips were rendered, told only “a block on a spring”", value: `${sealed.foundText.replace(/^Found/, "found")}${sealed.within ? `, ${sealed.within}` : ""}${(() => { const t = sealed.sets.filter((x) => x.stage === "tool"); const dh = t.reduce((a, x) => a + x.driveHit, 0), dn = t.reduce((a, x) => a + x.driven, 0); return dn ? `; after the spectrum tool, the winning law carried the drive at the right frequency in ${dh} of ${dn} driven draws` : ""; })()}; ${(() => { const m = sealed.draws.filter((d) => d.verdict === "miss").length; return m ? `the ${m === 1 ? "miss" : `${m} misses`} published` : "no misses"; })()}`, href: "/proof#sealed" }] : []),
    ...(sj ? [{ what: "The same clip slowed 1.5× in secret, timed jump for jump", value: `${sjText} slower (truth 1.5×)${mt ? `; whole-run ratio ${ratio.toFixed(2)}× (${mt.rows[1].g.toFixed(2)} ± ${mt.rows[1].sigma.toFixed(2)} against ${mt.rows[0].g.toFixed(2)} m/s²)` : ""}`, href: "/x/moon-jump#same-jump" }] : []),
    ...(springTruth ? [{ what: "Hidden stiffening found by Muse Wonder", value: `k₃/m = ${+springTruth.measured.toPrecision(4)} ± ${+springTruth.sigma.toPrecision(2)} m⁻²s⁻² (true ${+springTruth.truth.toPrecision(4)})`, href: "/x/hardening-spring#constants" }] : []),
    ...(refb ? [{ what: "Referee asked for a new law: when one was missing / when the leading law had the right physics", value: `${refb.summary.reviseWhenNeeded} of ${refb.summary.needed} / ${refb.summary.reviseWhenRight} of ${refb.summary.right}`, href: "/proof#models" }] : []),
    ...(wonb ? [{ what: "Muse Wonder challenged on every benchmark clip, old setting (low effort, no residual plot): kept the leading law", value: `${wonb.summary.tie} of ${wonb.summary.clips}; ${wonb.summary.worse} overreaches, all rejected by the held-out test`, href: "/proof#models" }] : []),
    ...(mt?.controls ? [{ what: "A copy slowed 1.5× through jump 1 only, real speed through jump 2 (same length as the broadcast)", value: mt.controls.clips.find((c) => c.id === "ramp")!.jumps.map((j) => `${j.ratio.toFixed(3)} ± ${j.sigma.toFixed(3)}× (true ${j.truth}×)`).join(", then "), href: "/x/moon-jump#same-jump" }] : []),
    ...(sw ? [{ what: "Pendulum practical on four rendered clips (true g 9.81), with Ansatz’s periods", value: `lengths from the A4 sheet in view, the realistic case: g = ${sw.sheet.g.toFixed(2)} m/s² (${sw.sheet.offPct < 0 ? "−" : "+"}${Math.abs(sw.sheet.offPct).toFixed(1)}%); lengths set to the renders’ true lengths, as a tape would give: ${sw.tape.g.toFixed(3)} ± ${Math.hypot(sw.tape.sgScatter, sw.tape.sgTape).toFixed(3)} m/s² (${Math.abs(sw.tape.offPct).toFixed(2)}% off); period to ${Math.min(...sw.rows.map((r) => r.relTpct)).toFixed(3)}–${Math.max(...sw.rows.map((r) => r.relTpct)).toFixed(2)}% vs about ${sw.stopwatch.relTpct.toFixed(1)}% for a 20-swing stopwatch (estimate)`, href: "/series/pendulum-lengths#stopwatch" }] : []),
    ...(lite ? [{ what: "Lite mode: no Muse Spark or Muse Wonder (measured offline on stored runs with typed lengths, so no Muse Voice Transcribe either)", value: `${lite.summary.constantsWithin5} of ${lite.summary.constantsChecked} constants within 5%, median ${lite.summary.medianPhysErrPct.toFixed(2)}%; about ${Math.round(lite.summary.medianSamUsd * 100)} cents of SAM 3.1 a clip`, href: "/proof#checks" }] : []),
    { what: "Physical constants within 5% on rendered clips", value: `${physWithin} of ${phys.length}, median ${physMedian.toFixed(2)}%`, href: "/proof#headline" },
    ...(gRuler.length ? [{ what: "Of those, g measured against a ruler in view (the hardest case)", value: `${gRuler.filter((x) => x <= 5).length} of ${gRuler.length}, median ${median(gRuler).toFixed(1)}%`, href: "/proof#headline" }] : []),
    ...(s ? [{ what: "Muse Spark reading the same constants by eye", value: `median ${s.medianEyeballErrPct.toFixed(0)}% off`, href: "/proof#headline" }] : []),
    ...(slow ? [{ what: "Clock check on rendered clips slowed without saying so", value: `${slow.line}${misread.length ? ` (the ${misread.map((r) => `${r.slow}× clip read as ${r.factor!.toFixed(1)}×`).join(", ")}: its ruler was misread)` : ""}`, href: "/proof#slow-motion" }] : []),
    ...(s ? [{ what: "SAM 3.1 centroid against the true centre", value: `median ${s.medianTrackingErrPx.toFixed(2)} px`, href: "/proof#headline" }] : []),
    { what: "Cost of a run, median of the published ones", value: `$${median(costs).toFixed(2)} (from $${costs[0]?.toFixed(2)} to $${costs.at(-1)?.toFixed(2)})`, href: "/x/hardening-spring#notebook" },
  ];

  // the first screen: the four criteria, one sentence each with its strongest fact and where to check it (the figures
  // are the ones quoted further down, read from the same records; the first-screen tiles and the sealed line from app/firstScreen.ts)
  const fs = await firstScreen();
  const tile = (k: string) => fs.tiles.find((t) => t.key === k);
  const apollo = tile("apollo"), museum = tile("museum");
  const sixty: { name: string; weight: number; text: React.ReactNode; links: { label: string; href: string }[] }[] = [
    {
      name: "Impact",
      weight: 30,
      text: (
        <>
          {aachenG ? (
            <>
              On teaching footage a stranger filmed in Aachen, told only &ldquo;about fifty centimetres&rdquo;, it measured{" "}
              <b>
                g = {aachenG.measured.toFixed(2)} ± {aachenG.sigma.toFixed(2)} m/s²
              </b>{" "}
              ({Math.abs(aachenG.errorPct).toFixed(2)}% from Earth&rsquo;s {aachenG.reference.toFixed(3)}); and{" "}
            </>
          ) : null}
          {aachenG ? "" : "It "}maps {W[lab.full] ?? lab.full} of the {W[lab.n] ?? lab.n} Class XI motion practicals in full{lab.part ? ` (${W[lab.part] ?? lab.part} more in part)` : ""} to runs with a worksheet in English and Hindi, ready for a teacher tomorrow (no teacher has used it yet).
        </>
      ),
      links: [
        ...(aachenG ? [{ label: "The Aachen run", href: "/x/aachen-pendulum-50cm" }] : []),
        { label: "For teachers", href: "/lab" },
      ],
    },
    {
      name: "Meta tooling",
      weight: 25,
      text:
        fricHandoff && fricWin && fricLead ? (
          <>
            Four Meta models, each with a job checked by code: on a spring slowed by dry friction, Muse Spark, refereeing, named the friction from the residual plot and Muse Wonder fitted it with its tool, missing the unseen motion <b>{Math.round(fricLead.fit.testRms / fricWin.fit.testRms)}× less</b> than Muse Spark&rsquo;s own law ({fricWin.fit.testRms.toFixed(3)} px against {fricLead.fit.testRms.toFixed(2)} px).
          </>
        ) : (
          <>Four Meta models, each with a job checked by code: SAM 3.1 measures, Muse Spark observes, proposes and referees, Muse Wonder fits laws with a tool, Muse Voice Transcribe hears the stated length and, in lite runs, sets it. {springsText}.</>
        ),
      links: [
        { label: "The handoff, in its notebook", href: "/x/dry-friction-spring#notebook" },
        { label: "Each model’s job", href: "#architecture" },
      ],
    },
    {
      name: "Technical depth",
      weight: 20,
      text: (
        <>
          Every law is fitted on the first 70% of the motion and ranked on the last 30%: on {s?.cases ?? phys.length} rendered clips with known physics, <b>
            {physWithin} of {phys.length} constants land within 5%
          </b> (median {physMedian.toFixed(2)}%{s ? `, against ${s.medianEyeballErrPct.toFixed(0)}% for Muse Spark by eye` : ""})
          {fs.sealed ? (
            <>
              ; of {fs.sealed.n} spring laws drawn by public randomness and sealed before the run,{" "}
              <b>
                {fs.sealed.found} were found, {fs.sealed.drives}
              </b>
              , every one published
            </>
          ) : null}
          .
        </>
      ),
      links: [
        { label: "The scoreboard", href: "/proof#headline" },
        ...(fs.sealed ? [{ label: "Laws nobody chose", href: "/proof#sealed" }] : []),
      ],
    },
    {
      name: "Demo",
      weight: 25,
      text: (
        <>
          {apollo && rep ? (
            <>
              The home page opens on the test: shown the secretly slowed Apollo 16 copy, Muse Spark said &ldquo;real speed&rdquo; {realCalls} of {rep.n} times; Ansatz timed it{" "}
              <b>
                {apollo.value} ± {apollo.pm}× slower
              </b>{" "}
              (truth {apollo.truth}).{" "}
            </>
          ) : null}
          {museum ? <>On a museum film sped up {museum.truth}, it read {museum.value}×. </> : null}
          The blind test puts six real clips to you, and a recorded run replays a whole experiment; neither calls a model.
        </>
      ),
      links: [
        { label: "Play the blind test", href: "/#can-you-tell" },
        { label: `Watch the demo (${DEMO_VIDEO_LENGTH})`, href: "#demo-video" },
        { label: "Watch a recorded run", href: "/new?replay=hardening-spring" },
      ],
    },
  ];

  return (
    <article>
      <section className={styles.sixty} aria-labelledby="sixty">
        <div className={styles.sixtyHead}>
          <h1 id="sixty">For judges</h1>
          <p className={styles.sixtyKicker}>Read this in 60 seconds</p>
          <p className={styles.sixtyLine}>Film anything that moves. Ansatz finds the law that moves it, and tests the law on frames it was never fitted to. Against your four criteria, the strongest fact for each, and where to check it:</p>
        </div>
        <ol className={styles.sixtyList}>
          {sixty.map((c) => (
            <li key={c.name}>
              <span className={styles.boardBar} aria-hidden="true">
                <i style={{ width: `${(c.weight / 30) * 100}%` }} />
              </span>
              <h2 className={styles.sixtyName}>
                {c.name}
                <b>
                  {c.weight}
                  <span className="visually-hidden"> points</span>
                </b>
              </h2>
              <p className={styles.sixtyText}>{c.text}</p>
              <p className={styles.sixtyGo}>
                {c.links.map((l, i) => (
                  <span key={l.href}>
                    {i ? " · " : ""}
                    {l.href.startsWith("/") ? <Link href={l.href}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}
                  </span>
                ))}
              </p>
            </li>
          ))}
        </ol>
        <p className={styles.sixtyNext}>
          Below: <a href="#tour">a three-minute tour</a>, then each criterion in depth, with every number linked to its run.
        </p>
        <BuiltBy className={styles.sixtyBuilt} />
      </section>

      <header className={styles.title}>
        <div className={styles.titleText}>
          <h2 className={styles.titleH}>The case in one page</h2>
          <p className={styles.abstract}>
            Ansatz turns a video of one moving object into a physics experiment: SAM 3.1 measures that object frame by frame, Muse Spark and Muse Wonder propose laws of motion, and each law is ranked on the last 30% of the motion, which no law was fitted to; on today&rsquo;s pipeline no number from it reaches any model. The law that predicts it best wins (within the noise, the simpler one). Here it is against your four criteria. Every number on this page is read from the stored runs, and every claim links to where you can check it.
          </p>
          <p className={styles.abstract}>
            Ansatz is a law-finder: it returns the equation, every constant with its error bar, and the held-out test that chose it. Because gravity is a clock, the same law also says how fast real footage plays, where Muse Spark, watching, often cannot: <Link href="/#can-you-tell">the blind test on the home page</Link> puts six real clips to you, to Muse Spark and to Ansatz.
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
            A recorded run calls no model and needs no link. To run your own clip, open <Link href="/new">Run an experiment</Link>: every visitor gets {PER_VISITOR} runs a day, and a run takes {runTimeText(rt)}. For agents: <a href="/llms.txt">/llms.txt</a> lists every number with its source, and <Link href="/x">/x</Link> indexes every experiment. Or try the blind test on the home page: <Link href="/#can-you-tell">Can you tell?</Link>
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
        <Fold open summary="Each model's job, and what only code may touch" className="onPlateFold">
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
          <p>{["", "One", "Two", "Three", "Four", "Five", "Six", "Seven"][tour.length] ?? tour.length} stops, in this order. Nothing here spends credits.</p>
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
            <li>{springsText}. Two of Muse Wonder&rsquo;s found laws are on renders we built to need a law outside the base textbook library, and both (a cubic spring, dry friction) are ones a physicist knows: a library extended with them ties it, and on a later re-run with today&rsquo;s prompt Muse Spark proposed the cubic law itself. The third was drawn by drand, from stiffness and damping families we had rendered before. {betterText ? `${betterText.charAt(0).toUpperCase()}${betterText.slice(1)}. ` : ""}Of the four springs we built, two missed: on the two from 29 October its law took the wrong form, or no proposed law described the motion (<Link href="/proof#fails">Proof</Link>). {sealed ? `Laws nobody chose: ${sealed.headline}` : "A law nobody planted is still to be shown."}</li>
            <li>The benchmark clips are rendered, so the physics is clean. Real footage adds motion blur, rolling shutter and lens distortion that the renders only partly imitate.</li>
            <li>
              Real footage is still a handful: Apollo 16, the Foucault pendulum twice (real time and sped up 5×), a 50 cm pendulum on black filmed in Aachen{aachenG ? ` (g = ${aachenG.measured.toFixed(2)} ± ${aachenG.sigma.toFixed(2)} m/s²)` : ""} and a 60 cm one from the same source (g about 10 m/s², no error bar: its law misses the unseen swing by far more than the noise), a teacher’s 60 cm ring-magnet pendulum (ThinkTac, g = 9.826 ± 0.099 m/s², measured to the knot) and a 27-inch lab pendulum (Rosolowsky, g about 9.7, its law just over the 5× line). On 2 November we ran {strangersTally().text}. All of them are shown (<Link href="/proof#strangers">Proof, footage from strangers</Link>).
            </li>
            <li>
              It fails when the object doesn&rsquo;t stand out. On a real classroom clip of a dark pendulum bob against a dark chalkboard, SAM 3.1 couldn&rsquo;t hold the bob and Ansatz reported no usable g; a green gym ball in a green-lit corridor was held only in part, so its scale and clock were wrong (<Link href="/proof#fails">Proof, where it fails</Link>).
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
            <li>Built: a lite mode for school practicals. The student names the experiment and types or says the length, SAM 3.1 measures, and code fits the textbook laws: no Muse Spark or Muse Wonder; a length said aloud is set by Muse Voice Transcribe{voice ? `, as in two published lite runs (synthetic voices): ${voice.runs.map((x) => `${x.language}, ${x.g.split(" (")[0].split(",")[0]}`).join("; ")}` : ""}. It is a choice on <Link href="/new">Run an experiment</Link>, and class links start in it. Its accuracy, measured offline on the stored benchmark runs: {lite ? `${lite.summary.constantsWithin5} of ${lite.summary.constantsChecked} constants within 5% at about ${Math.round(lite.summary.medianSamUsd * 100)} cents a clip` : "the same accuracy at the cost of SAM alone"}.</li>
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

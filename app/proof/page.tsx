import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getExperiment, showcaseIds, winnerOf } from "@/lib/experiments";
import { isRoughFit, type Experiment } from "@/lib/experiment";
import slits from "@/data/slits.json";
import { median } from "@/lib/median";
import { plateLaws } from "@/lib/plateLaws";
import Plate, { Note, Page, Reading, Section } from "@/components/book/Plate";
import FalsifyPlate from "@/components/book/FalsifyPlate";
import ErrorStrip from "@/components/case/ErrorStrip";
import Calibration from "@/components/case/Calibration";
import CountUp from "@/components/case/CountUp";
import caseStyles from "@/components/case/case.module.css";
import styles from "./proof.module.css";
import { slowRenders } from "./slow";
import ContactSheet, { type SheetClip } from "@/components/book/ContactSheet";
import { printOf } from "../x/prints";
import { STRANGERS, STRANGERS_RUNS, STRANGERS_RUNS_USD, STRANGERS_WITH_TRANSLATIONS_USD, strangersTally, strangersWord } from "./strangers";
import { fou5Long, fou5Of, fou5Parts, fou5SameFilm, fou5SameFilmLawFree } from "@/lib/fou5";
import { canYouTell, quizSaid } from "@/app/cyt";
import { REPLICATE_URL, sealedTest } from "@/app/sealed";

/** the replicate records' folder, as a link wherever a sealed sentence names it */
const linkRep = (t: string) => {
  const [a, b] = t.split(REPLICATE_URL);
  return b === undefined ? t : (
    <>
      {a}
      <a href={REPLICATE_URL}>data/replicate on GitHub</a>
      {b}
    </>
  );
};
import { voiceLite } from "@/app/voiceLite";
import { fmtAbout } from "@/lib/format";
import { pipelineName } from "@/app/pipelineWords";

// reads only the runs and benchmark files that ship with the site: cached, rebuilt at most every 5 minutes
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Proof",
  description: "Ansatz measured against clips with exactly known physics, against Muse Spark guessing by eye, and on real footage including the Moon.",
  alternates: { canonical: "/proof" },
};

type Check = { quantity: string; truth: number; measured: number; sigma: number; errPct: number; withinSigma: number; eyeball?: number; eyeballErrPct?: number };
type Row = {
  id: string;
  phenomenon: string;
  variant?: string;
  fps: number;
  slowMotion: number;
  winner: { id: string; title: string; origin: string };
  family: { ok: boolean | null; expect: string };
  familyIfChosenByFit: boolean | null;
  trackingErrPx: number | null;
  predictionRel: number;
  predictionRelByFit: number | null;
  predictionRelControl: number | null;
  checks: Check[];
  calibration: string;
  usd: number;
  seconds: number;
  clock?: { factor: number } | null;
};
type Bench = {
  generatedAt: string;
  summary: {
    cases: number;
    lawCorrect: number;
    lawJudged: number;
    lawCorrectIfChosenByFit: number;
    medianTrackingErrPx: number;
    medianConstErrPct: number;
    constantsWithin5pct: number;
    constantsChecked: number;
    medianEyeballErrPct: number;
    medianEyeballErrPctCurrent?: number;
    eyeballCurrent?: number;
    eyeballChecked: number;
    medianPredictionRel: number;
    medianPredictionRelControl: number;
    medianPredictionRelByFit: number;
    totalUsd: number;
    medianSeconds: number;
    slowClips?: number;
    slowFlagged?: number;
    slowFactorErrPct?: number[];
  };
  rows: Row[];
};

async function bench(): Promise<Bench | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", "bench", "synth.json"), "utf8")) as Bench;
  } catch {
    return null;
  }
}

const NAMES: Record<string, string> = {
  free_fall: "Free fall",
  projectile: "Projectile",
  projectile_drag: "Projectile with air drag",
  vertical_toss: "Vertical toss",
  pendulum: "Pendulum",
  spring_mass: "Mass on a spring",
  bouncing_ball: "Bouncing ball",
  incline_rolling: "Ball rolling down a ramp",
  collision_2d: "Two pucks colliding",
};

// the real classroom clip that failed (see "Where it fails"); the figures are from its run, quoted as measured
const PENDEL = "https://commons.wikimedia.org/wiki/File:Pendelgesetz_(mit_Rechnung).webm";

export default async function ProofPage() {
  const b = await bench();
  // the referee and Muse Wonder, each run over every benchmark clip on its own (data/bench/referee.json, wonder.json)
  type Ref = { summary: { clips: number; revise: number; reviseWhenNeeded: number; needed: number; reviseWhenRight: number; right: number; usd: number } };
  type Won = { summary: { clips: number; beat: number; tie: number; worse: number; none: number; usd: number }; rows: { verdict: string; submitted?: string; ratio?: number }[] };
  const refb = await readFile(path.join(process.cwd(), "data", "bench", "referee.json"), "utf8").then((t) => JSON.parse(t) as Ref, () => null);
  const wonb = await readFile(path.join(process.cwd(), "data", "bench", "wonder.json"), "utf8").then((t) => JSON.parse(t) as Won, () => null);
  type Obs = { summary: { runs: number; subjectRight: number; subjectScored: number; firstNounFound: number; worldRight: number; motionKindRight: number; naiveWouldFail: number; naiveWouldFailBy?: Record<string, number>; rulerPicked: number; rulerNeeded: number; rulerLengthRight: number; windowMedianIoU: number; windowNaiveWholeClipMedianIoU: number; narrationFactFound: number; narrationFacts: number } };
  const obsb = await readFile(path.join(process.cwd(), "data", "bench", "observer.json"), "utf8").then((t) => JSON.parse(t) as Obs, () => null);
  const wab = await readFile(path.join(process.cwd(), "data", "bench", "wonder-ab.json"), "utf8").then((t) => JSON.parse(t) as { arms: string[]; rows: { clip: string; needsNew: boolean; arm: string; verdict: string; ratio?: number }[]; usd: number }, () => null);
  const abArm = (arm: string) => {
    const r = wab?.rows.filter((x) => x.arm === arm) ?? [];
    return { found: r.filter((x) => x.needsNew && x.verdict === "found it").length, needed: r.filter((x) => x.needsNew).length, held: r.filter((x) => !x.needsNew && x.verdict === "held back").length, tame: r.filter((x) => !x.needsNew).length };
  };
  const voice = await readFile(path.join(process.cwd(), "data", "bench", "voice.json"), "utf8").then((t) => JSON.parse(t) as { summary: { languages: number; lengthChecked: number; releaseHeard: number } }, () => null);
  const worse = wonb?.rows.filter((r) => r.verdict === "worse" && Number.isFinite(r.ratio)).map((r) => r.ratio!) ?? [];
  const lite = await readFile(path.join(process.cwd(), "data", "bench", "lite.json"), "utf8").then((t) => JSON.parse(t) as { summary: { clips: number; constantsWithin5: number; constantsChecked: number; medianPhysErrPct: number; lawCorrect: number; lawJudged: number; medianSamUsd: number } }, () => null);
  const cov = await readFile(path.join(process.cwd(), "data", "bench", "coverage.json"), "utf8").then((t) => JSON.parse(t) as { trials: number; cases: { law: string; noise: string; "coverage1σ": number; "coverage2σ": number }[] }, () => null);
  const clockc = await readFile(path.join(process.cwd(), "data", "bench", "clock-controls.json"), "utf8").then((t) => JSON.parse(t) as { note: string; rows: { id: string; slow: number; ruler: string | null; g: number | null; sigma: number | null; clock: number | null; outcome: string }[] }, () => null);
  const ab = await readFile(path.join(process.cwd(), "data", "bench", "ablation.json"), "utf8").then(
    (t) => JSON.parse(t) as { summary: { clips: number; sparkBetter: number; tied: number; libraryBetter: number }; extra?: { id: string; title: string; libraryLaw: string; libraryMissMm: number; modelMissMm: number; unit?: string }[] },
    () => null,
  );
  // the published run of each clip in the library table, to say when the table's figures come from an earlier run
  const abPublished = await Promise.all((ab?.extra ?? []).map((x) => getExperiment(x.id).catch(() => null)));
  const abNow = (i: number) => {
    const e = abPublished[i], x = ab?.extra?.[i];
    if (!e || !x) return null;
    const k = (x.unit ?? "mm") === "mm" ? 1000 : 1;
    const won = winnerOf(e).fit.testRms * k;
    const spark = e.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0]?.fit.testRms;
    // a published record that replaced an earlier run of the same clip (rerunOf): the library table was scored on the earlier one
    if (!(e as typeof e & { rerunOf?: unknown }).rerunOf || spark === undefined) return null;
    return `These figures are from an earlier run of this clip. On the published re-run, Muse Wonder’s law misses by ${won.toFixed(2)} ${x.unit ?? "mm"}, against ${(spark * k).toFixed(1)} ${x.unit ?? "mm"} for Muse Spark’s best.`;
  };
  // clips filmed on a phone, each with the person's own tape-measured truth
  const phone = (await Promise.all((await showcaseIds()).map((id) => getExperiment(id).catch(() => null)))).filter((e) => e?.source.phone && e.extras?.truth?.rows.length);
  const phoneErr = phone.flatMap((e) => e!.extras!.truth!.rows.map((r) => Math.abs((r.measured - r.truth) / r.truth) * 100)).sort((a, b) => a - b);
  const moon = await getExperiment("moon-jump");
  const moonG = moon?.comparisons.find((c) => c.param === "g");
  const slow = await getExperiment("sample-pendulum");
  // a museum's Foucault pendulum, real time and a stretch its filmmaker sped up 5x (length published with the video)
  const fou = await getExperiment("foucault-pendulum").catch(() => null);
  const fouRow = fou?.extras?.truth?.rows.find((r) => r.param === "g");
  const fouSpark = fou?.extras?.truth?.rows.find((r) => r.param === "g_spark");
  const fou5 = await getExperiment("foucault-pendulum-5x").catch(() => null);
  const fou5Row = fou5?.extras?.truth?.rows.find((r) => r.param === "speedup");
  const fou5x = fou5Of(fou5, fou);
  // Muse Spark's plain pendulum law on the same film misses the unseen frames by far more than the noise too: no ± either
  const fouPlainZ = fou?.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0]?.fit.testZ;
  // who called Muse Wonder in on the two springs: code (the leader missed its fitted frames), or the referee
  const hard = await getExperiment("hardening-spring").catch(() => null);
  const fric = await getExperiment("dry-friction-spring").catch(() => null);
  const fricLead = fric?.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.rank - b.rank)[0];
  // the stranger's pendulum on black that became an experiment (the same source's chalkboard clip is in "Where it fails")
  const aachen = await getExperiment("aachen-pendulum-50cm").catch(() => null);
  const aachenG = aachen?.comparisons.find((c) => c.param === "g");
  const slowG = slow?.comparisons.find((c) => c.param === "g");
  // the held-out test's example: a law that fits the seen frames and fails after them, read from the stored run
  const bb = await getExperiment("beach-ball-drag").catch(() => null);
  const bbLin = bb?.candidates.find((c) => /linear/i.test(c.law.title) && c.fit.ok && Number.isFinite(c.fit.trainZ) && Number.isFinite(c.fit.testZ));
  const s = b?.summary;
  // Muse Spark was asked about the gym ball and the 5x film twice over: inside each run (to say what to track) and in the
  // home page's blind test (the speed question itself); both answers are named, from their own records
  const gymQuiz = quizSaid("gym-ball-bounce-240fps");
  const sealed = await sealedTest().catch(() => null);
  // the two published lite runs where Muse Voice Transcribe set the length (synthetic voices), read from their records
  const voiceRuns = await voiceLite().catch(() => null);
  const aachen60 = await getExperiment("aachen-pendulum-60cm").catch(() => null);
  // the third set's two promoted strangers' clips, stamped on the contact sheet from their records
  const promoted3 = (await Promise.all(["thinktac-pendulum-60cm", "rosolowsky-pendulum-27in"].map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => e != null);
  const st2 = strangersTally();
  const fou5Quiz = quizSaid("foucault-pendulum-5x");
  // the blind test's baseline re-asked at medium effort (Ansatz's observer's), all six clips with the runs' lengths
  const cytM = (await canYouTell().catch(() => null))?.answers.parityMedium;
  const medFou5 = cytM ? "; asked again at medium effort and told the 8.97 m length, it answered sped up five times, with factors 3×, 3×, 5×, 11.4× and 12×" : "";
  const medGym = cytM ? "; at medium effort and told the ball is 75 cm across, it answered slowed four times (2×, 4×, 4× and 8×) and real time once" : "";
  // the worst constant in the end-to-end coverage, and how its error bars were last scored
  const worstCheck = (() => {
    const w = (s as { coverage?: { worst: number } } | undefined)?.coverage?.worst;
    if (w === undefined) return null;
    for (const r of (b?.rows ?? []) as { id: string; checks: { quantity: string; measured: number; sigma?: number; errPct: number; withinSigma?: number }[] }[]) {
      const c = r.checks.find((x) => x.withinSigma === w);
      if (c) return { id: r.id, ...c };
    }
    return null;
  })();
  const nRestitution = ((b?.rows ?? []) as { checks: { quantity: string }[] }[]).flatMap((r) => r.checks).filter((c) => /restitution/i.test(c.quantity)).length;
  const jackknifed = /jackknife/i.test((b as { pipeline?: string } | null)?.pipeline ?? "");
  const benchDate = (b as { generatedAt?: string } | null)?.generatedAt;
  const slowAll = await slowRenders();
  // the clock-check controls' small slowdowns, each with what its ruler was and what gravity came out as
  const smallSlow = clockc?.rows.filter((r) => r.slow > 1) ?? [];
  const missedSmall = smallSlow.filter((r) => r.clock == null && r.g != null && !/^not checkable/i.test(r.outcome));
  const uncheckedSmall = smallSlow.filter((r) => r.clock == null && /^not checkable/i.test(r.outcome));
  const misread = b?.rows.filter((r) => (r.slowMotion ?? 1) > 1 && r.clock && Math.abs(r.clock.factor / r.slowMotion - 1) > 0.1) ?? [];
  // physical constants and camera scales are different claims, so they are counted apart
  const all = b?.rows.flatMap((r) => r.checks) ?? [];
  const group = (cs: typeof all) => {
    const e = cs.map((c) => Math.abs(c.errPct)).sort((x, y) => x - y);
    return { n: cs.length, within: e.filter((x) => x <= 5).length, median: median(e) };
  };
  const split = { phys: group(all.filter((c) => !c.quantity.startsWith("scale"))), scale: group(all.filter((c) => c.quantity.startsWith("scale"))) };
  // how much each kind of constant leans on a length scale: times and ratios need none; drag and string length need
  // the scale that assuming g gives; g itself needs a ruler in view, which is the hardest case
  const kind = (q: string) => (/^(restitution|damping|omega)/.test(q) ? "free" : (q === "g" || q.startsWith("g as")) ? "ruler" : "assumed");
  const byKind = { free: group(all.filter((c) => !c.quantity.startsWith("scale") && kind(c.quantity) === "free")), assumed: group(all.filter((c) => !c.quantity.startsWith("scale") && kind(c.quantity) === "assumed")), ruler: group(all.filter((c) => !c.quantity.startsWith("scale") && kind(c.quantity) === "ruler")) };
  const pct = (v: number, d = 1) => `${v.toFixed(d)}%`;
  // the winner's miss on the unseen frames as a share of how far the object moved (same units, so no scale is needed)
  const relMiss = (e: NonNullable<Awaited<ReturnType<typeof getExperiment>>>) => {
    const w = winnerOf(e);
    const ch = Object.keys(w.fit.predicted).find((c) => e.measured.series.ch[c]);
    const v = ch ? e.measured.series.ch[ch] : [];
    const range = v.length ? Math.max(...v) - Math.min(...v) : NaN;
    const r = (w.fit.testRms / range) * 100;
    return Number.isFinite(r) ? r.toFixed(r < 1 ? 2 : 1) : "—";
  };
  // a contact sheet of the rendered clips that move along one line: each as a photo-finish, every frame one slice
  const sheet = (await Promise.all(["spring", "hardening-spring", "dry-friction-spring"].filter((id) => id in slits).map((id) => getExperiment(id).catch(() => null)))).filter((e) => e != null);
  // every error on one axis: Ansatz's physical constants, and Muse Spark's estimates of the same by eye
  const stripRows = b
    ? [
        { title: "Ansatz", sub: `${split.phys.n} physical constants`, kind: "measured" as const, errs: all.filter((c) => !c.quantity.startsWith("scale")).map((c) => ({ label: c.quantity, err: Math.abs(c.errPct) })) },
        { title: "Muse Spark, by eye", sub: `${all.filter((c) => c.eyeballErrPct !== undefined).length} estimates of the same`, kind: "eye" as const, errs: all.filter((c) => c.eyeballErrPct !== undefined).map((c) => ({ label: c.quantity, err: Math.abs(c.eyeballErrPct!) })) },
      ]
    : [];
  const slowFlagged = slowAll ? slowAll.all.filter((r) => r.outcome === "flagged").length : 0;
  const plates = { scoreboard: "I", footage: "II", contact: "III", sheet: "IV", calibration: "V", heldOut: "VI" };
  // every real clip Ansatz has been run on, stamped with its verdict: the showcases' figures read from their records,
  // the strangers' from Table 1a (that night's runs), the two failures from "Where it fails"
  const sj = moon?.extras?.memoryTest?.sameJump?.combined;
  const contact: SheetClip[] = [
    ...(moonG ? [{ id: "moon-jump", img: printOf("moon-jump"), title: "Apollo 16, as broadcast", verdict: "measured" as const, line: `The Moon’s gravity: ${moonG.measured.toFixed(2)} ± ${moonG.sigma.toFixed(2)} m/s², against ${moonG.reference}.`, href: "/x/moon-jump" }] : []),
    ...(sj ? [{ id: "moon-jump-slowed", img: printOf("moon-jump-slowed"), title: "Apollo 16, slowed 1.5× in secret", verdict: "measured" as const, line: `Jump for jump against the broadcast: ${sj.ratio.toFixed(3)} ± ${sj.sigma.toFixed(3)}× slower. Muse Spark, by eye: real speed.`, href: "/x/moon-jump-slowed" }] : []),
    ...(fouRow ? [{ id: "foucault-pendulum", img: printOf("foucault-pendulum"), title: "Foucault pendulum, real time", verdict: "about right, no error bar" as const, line: `g about ${fouRow.measured.toFixed(1)}, no error bar: the law missed the unseen frames by ${Math.round(winnerOf(fou!).fit.testZ ?? NaN)}× the noise. Earth’s is 9.807 m/s².`, href: "/x/foucault-pendulum" }] : []),
    ...(fou5Row ? [{ id: "foucault-pendulum-5x", img: printOf("foucault-pendulum-5x"), title: "Foucault pendulum, sped up 5×", verdict: "measured" as const, line: `Plays ${fou5x ? fou5Long(fou5x) : `${fou5Row.measured.toFixed(2)}× faster than life`}; the maker’s label said 5×. Muse Spark, describing it in the run: real time${fou5Quiz ? `; ${fou5Quiz.said}${medFou5}` : ""}.`, href: "/x/foucault-pendulum-5x" }] : []),
    ...(aachenG ? [{ id: "aachen-pendulum-50cm", img: printOf("aachen-pendulum-50cm"), title: "Pendulum on black, Aachen", verdict: "measured" as const, line: `g = ${aachenG.measured.toFixed(2)} ± ${aachenG.sigma.toFixed(2)} m/s², against 9.807. Clock check: real time.`, href: "/x/aachen-pendulum-50cm" }] : []),
    { id: "pendulum-25cm", img: "/prints/real/pendulum-25cm-normal-gravity.webp", title: "Pendulum, 25 cm, in a test rig", verdict: "number right, law wrong", line: "g about 9.84 m/s², 0.3% off, no error bar: the law misses the unseen swing by 102× the noise (15% of the motion), so the publish gate refused it." },
    { id: "pendulum-ruler", img: "/prints/real/pendulum-ruler-limjitning.webp", title: "Brass bob before a metre rule", verdict: "no published answer", line: "A 0.716 ± 0.002 m pendulum fits within the noise (the ± is Earth’s g, assumed to ±0.26%; the rule’s scale does not enter); its maker published no length or period to check it against." },
    ...(slow ? [{ id: "sample-pendulum", img: printOf("sample-pendulum"), title: "A pendulum posted as slow motion", verdict: "no factor claimed" as const, line: "Only the uploader’s title says slow motion. The re-run declines to measure the string, because the clamp catches it, so it claims no factor.", href: "/x/sample-pendulum" }] : []),
    { id: "metronome", img: "/prints/real/metronome-96bpm.webp", title: "Metronome at 96 beats a minute", verdict: "miss", line: "No law in the library is a metronome; the best missed by 25× the noise, so no fit was reported." },
    { id: "gym-ball", img: "/prints/real/gym-ball-bounce-240fps.webp", title: "Gym ball, filmed at 240 fps", verdict: "miss", line: `SAM 3.1 held only part of a green ball in a green-lit corridor, in a clip that plays 4.8× slower than life. In both runs Muse Spark, describing the clip to say what to track, took it as real time${gymQuiz ? `; ${gymQuiz.said}${medGym}` : ""}. Ansatz measured no gravity, so it could not check the clock.` },
    { id: "pendelgesetz", img: "/prints/real/pendelgesetz.webp", title: "Pendulum before a chalkboard", verdict: "miss", line: "A dark bob on a dark board: SAM 3.1 could not hold it, and Ansatz reported no usable g.", anchor: "#fails" },
    ...(aachen60 ? (() => {
      const g = aachen60.comparisons.find((c) => c.param === "g");
      // the run page's rule: a winner that misses its unseen frames by more than five times the noise gets no error bar
      const w = winnerOf(aachen60);
      return g
        ? [
            isRoughFit(w.fit)
              ? { id: "aachen-pendulum-60cm", img: printOf("aachen-pendulum-60cm"), title: "Pendulum before a ruler, Aachen", verdict: "about right, no error bar" as const, line: `g about ${fmtAbout(g.measured)} m/s², no error bar: the law misses the unseen swing by ${Math.round(w.fit.testZ ?? NaN)}× the noise. Earth’s is 9.807. Clock check: real time, roughly, which is right.`, href: "/x/aachen-pendulum-60cm" }
              : { id: "aachen-pendulum-60cm", img: printOf("aachen-pendulum-60cm"), title: "Pendulum before a ruler, Aachen", verdict: "measured" as const, line: `g = ${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s², against 9.807. Clock check: real time.`, href: "/x/aachen-pendulum-60cm" },
          ]
        : [];
    })() : []),
    // the third set: the two promoted clips by the run page's rule (no error bar past 5× the noise), the other three from Table 1a
    ...promoted3.flatMap((e): SheetClip[] => {
      const g = e.comparisons.find((c) => c.param === "g");
      const w = winnerOf(e);
      const title = e.id.startsWith("thinktac") ? "Ring-magnet pendulum, 60 cm (ThinkTac)" : "Pendulum, 27 inches (PHYS124)";
      if (!g) return [];
      return isRoughFit(w.fit)
        ? [{ id: e.id, img: printOf(e.id), title, verdict: "number right, law wrong" as const, line: `g about ${fmtAbout(g.measured)} m/s² (${Math.abs(g.errorPct).toFixed(1)}% off), no error bar: the law misses the unseen frames by ${(w.fit.testZ ?? NaN).toFixed(2)}× the noise, just over the 5× line. Clock check: real time.`, href: `/x/${e.id}` }]
        : [{ id: e.id, img: printOf(e.id), title, verdict: "measured" as const, line: `g = ${g.measured.toFixed(3)} ± ${g.sigma.toFixed(3)} m/s², against 9.807 (the 60 cm runs to the knot; the magnet’s centre hangs a little lower). Clock check: real time.`, href: `/x/${e.id}` }];
    }),
    { id: "pendulum-40cm-physagreg-200g", img: "/prints/real/pendulum-40cm-physagreg-200g.webp", title: "Pendulum, 40 cm, 200 g hanger", verdict: "number right, law wrong", line: "g about 10.0 m/s², 2.1% off, no error bar: the law misses the unseen frames by 9.7× the noise, so the publish gate refused it.", anchor: "#strangers" },
    { id: "pendulum-40cm-physagreg-100g", img: "/prints/real/pendulum-40cm-physagreg-100g.webp", title: "Pendulum, 40 cm, 100 g hanger", verdict: "miss", line: "Tracking: the mask slipped; g about 12 m/s², 21.6% high, and the clock check wrongly called the clip 1.1× fast.", anchor: "#strangers" },
    { id: "pendulum-35cm-muskopf", img: "/prints/real/pendulum-35cm-muskopf.webp", title: "Pendulum, 35 cm, a washer from above", verdict: "miss", line: "Foreshortened from above, the washer blurring mid-swing: g about 8.7 m/s², 11.4% low, no error bar.", anchor: "#strangers" },
    { id: "pendulum-25cm-04g", img: "/prints/real/pendulum-25cm-04g.webp", title: "Pendulum, 25 cm, at 0.4 g", verdict: "miss", line: "Laws holding the stated 25 cm gave g about 4.6 m/s² (the caption’s 1.5 s period means 4.39), but they lost; the winning law kept Earth’s g and a 0.54 m length, so it checks nothing.", anchor: "#strangers" },
    { id: "pendulum-5m-wangerooge", img: "/prints/real/pendulum-5m-wangerooge.webp", title: "Pendulum, 5 m, from a promenade wall", verdict: "miss", line: "Tracking: the swing was read at 3.04 s against the true 4.46 s, and a control with no force won.", anchor: "#strangers" },
    { id: "toss-60cm-10x", img: "/prints/real/toss-60cm-10x.webp", title: "Ball tossed up, 10× slow motion", verdict: "miss", line: "Tracking: slow motion made by repeating frames left 20 usable points.", anchor: "#strangers" },
    { id: "fall-board-5x", img: "/prints/real/fall-board-5x-b.webp", title: "Ball dropped, 5× slow motion", verdict: "miss", line: "Two tries; the second read g in clip time with a 61% error bar, too wide to check the clock.", anchor: "#strangers" },
    { id: "pendulum-50cm-chalkboard", img: "/prints/real/pendulum-50cm-chalkboard.webp", title: "Pendulum before a chalkboard, run again", verdict: "miss", line: "Tracking: g about 6.8 m/s², 30.6% low, with the swing read at 1.72 s against the true 1.42 s.", anchor: "#strangers" },
    { id: "apollo15", img: "/prints/real/apollo15-hammer-feather.webp", title: "Apollo 15, the hammer and the feather", verdict: "miss", line: "The hammer is a rod 3 to 4 pixels wide against a white suit; SAM 3.1 followed the suit, and Ansatz reported a man standing still.", href: "/how#limits" },
  ];

  return (
    <article>
      <header className={styles.title}>
        <h1>Proof</h1>
        <div className={styles.abstract}>
          <p>
            A tool that claims to find laws must be checked against laws we already know. We rendered {s?.cases ?? "a set of"} clips with exactly known physics, ran each through Ansatz with no hints, and compared every number it reported with the truth. We also asked Muse Spark to read the same numbers off the same clips by eye.
          </p>
          <nav className={styles.toc} aria-label="On this page">
            <ol>
              <li><a href="#headline">The scoreboard</a></li>
              <li><a href="#real-footage">Real footage</a></li>
              <li><a href="#benchmark">Every clip with a known answer</a></li>
              <li><a href="#models">Do the models earn their place?</a></li>
              {sealed && <li><a href="#sealed">Laws nobody chose</a></li>}
              <li><a href="#checks">Checks on the method itself</a></li>
              <li><a href="#ablation">What each part adds</a></li>
              <li><a href="#library">Against a textbook</a></li>
              <li><a href="#fails">Where it fails</a></li>
              <li><a href="#limits">What this doesn&rsquo;t show</a></li>
            </ol>
          </nav>
        </div>
      </header>

      {s && (
        <Plate
          n={plates.scoreboard}
          id="headline"
          title={<>The scoreboard: every number Ansatz reported on clips with known physics, beside Muse Spark reading the same numbers by eye.</>}
          caption={<>Each dot is one constant; hover a dot for its name. The full table is in §3.</>}
        >
          <ul className={caseStyles.readings}>
            <li>
              <Reading value={<CountUp to={split.phys.median} decimals={2} suffix="%" />} tone="measured" label={`median error on ${split.phys.n} physical constants; ${split.phys.within} within 5%`} />
            </li>
            <li>
              <Reading value={<CountUp to={s.medianEyeballErrPct} suffix="%" />} tone="struck" label={`median error when Muse Spark read the same constants by eye (${s.eyeballChecked} estimates)`} />
            </li>
            <li>
              <Reading value={<><CountUp to={s.lawCorrect} />/{s.lawJudged}</>} tone="held" label="clips where the winning law had the right physics" />
            </li>
            {slowAll && slowAll.all.length ? (
              <li id="slow-motion">
                <Reading value={<><CountUp to={slowFlagged} />/{slowAll.all.length}</>} label="renders slowed without saying so, flagged by the clock check" />
              </li>
            ) : null}
            <li>
              <Reading value={<CountUp to={s.medianTrackingErrPx} decimals={2} />} unit="px" label="median distance from SAM 3.1's mask centroid to the true centre" />
            </li>
          </ul>
          <div className={styles.stripWrap}>
            <ErrorStrip rows={stripRows} />
          </div>
        </Plate>
      )}

      <Page>
        {s && (
          <Section n={1} title="The scoreboard, in full">
            <p>
              The median error on the {split.phys.n} physical constants Ansatz measured (g, string length, drag, restitution, damping, frequency) is {pct(split.phys.median, 2)}; {split.phys.within} are within 5%. By what they lean on: {byKind.free.n} that need no length scale (restitution, damping, frequency), median {pct(byKind.free.median, 2)}; {byKind.assumed.n} that use the scale from assuming g (drag, string length), median {pct(byKind.assumed.median, 2)}; and {byKind.ruler.n} values of g measured against a ruler in view, the hardest case, median {pct(byKind.ruler.median, 1)}, {byKind.ruler.within} within 5%.
            </p>
          </Section>
        )}
        {s && <Note who="SAM 3.1, then code">SAM 3.1 measured every frame; code fitted each law and computed every constant. Scored against each render&rsquo;s truth file by scripts/score.ts.</Note>}
        {s && (
          <p className={styles.para}>
            Separately, the {split.scale.n} camera scales it worked out (metres per pixel, from a fall or a ruler): median {pct(split.scale.median, 2)}, {split.scale.within} within 5%.
          </p>
        )}
        {s && (
          <p className={styles.para}>
            Muse Spark, estimating the same constants by watching the clip, without SAM 3.1 or the fit, was off by a median {pct(s.medianEyeballErrPct, 0)} over {s.eyeballChecked} estimates
            {s.medianEyeballErrPctCurrent !== undefined && s.eyeballCurrent ? `; the ${s.eyeballCurrent} made with today’s prompt, which shows it more frames: ${pct(s.medianEyeballErrPctCurrent, 0)}` : ""}.
          </p>
        )}
        {s && <Note who="Muse Spark 1.3, by eye">Shown the clip alone and asked for each constant. No measurement and no fit.</Note>}
        {s && (
          <p className={styles.para}>
            The winning law had the right physics on {s.lawCorrect} of {s.lawJudged} clips: drag where there was air drag, none where there wasn&rsquo;t, sin θ for big swings, an impact for bounces.
            {slowAll && slowAll.all.length ? (
              <>
                {" "}
                On the clock: {slowAll.line}. The clock check works from a ruler in view
                {misread.length ? `; the ${misread.map((r) => `${r.slowMotion}× clip read as ${r.clock!.factor.toFixed(1)}×`).join(" and the ")} because its ruler was misread` : ""}.
              </>
            ) : null}
          </p>
        )}
        {s && <Note who="SAM 3.1">The tracking error is the distance from the mask&rsquo;s centroid to the object&rsquo;s true centre, over every measured frame of every render.</Note>}
        {phone.length > 0 && (
          <div className={styles.phone}>
            <Reading value={phone.length} label="clips filmed on a phone, each with the truth measured by tape before the run" />
            <p>
              Median error {median(phoneErr).toFixed(1)}% over {phoneErr.length} quantities:{" "}
              {phone.map((e, i) => (
                <span key={e!.id}>
                  {i > 0 && ", "}
                  <Link href={`/x/${e!.id}`}>{e!.title}</Link>
                </span>
              ))}
              .
            </p>
          </div>
        )}
        {phone.length > 0 && <Note who="code, against a tape">The truth for each phone clip was measured with a tape before the run and stored with it.</Note>}

        <Section n={2} title="Real footage" id="real-footage">
          <p>Rendered clips have exact answers. Real clips don&rsquo;t, so we chose ones whose answers are known some other way: the Moon&rsquo;s gravity, a museum&rsquo;s Foucault pendulum whose length and a sped-up stretch were published with the film, and a pendulum posted online as slow motion. Then, on 2 November, <a href="#strangers">{strangersWord(st2.n)} clips strangers filmed</a>, misses included.{cytM ? ` The blind test’s baseline was re-asked at medium reasoning effort, the level Ansatz’s own observer runs at, on all six clips with the lengths and footage Ansatz’s runs had: Muse Spark scores ${cytM.spark} of 6 by verdict, a tie with Ansatz, and ${cytM.factor.spark} of ${cytM.factor.n} on the factor row against Ansatz’s 2 of 3 (${cytM.calls} calls, none cut off, $${cytM.usd.toFixed(2)}; stored as parityMedium in data/cyt/spark-quiz.json beside the two low-effort sets, which are unchanged).` : ""}</p>
        </Section>
      </Page>

      {(moon || slow) && (
        <Plate n={plates.footage} title="Real clips: the Moon from 1972 television, a museum's Foucault pendulum at real speed and sped up 5×, a stranger's pendulum on black, and a pendulum whose clip may hide its slow motion." caption="Each print lays a run's frames over one another, as Marey photographed motion.">
          <div className={styles.footage}>
            {moon && moonG && (
              <Link href="/x/moon-jump" className={styles.specimen}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/prints/marey/moon-jump.webp" alt="John Young's jump salute on Apollo 16, frames laid over one another" className={styles.print} loading="lazy" />
                <span className={styles.fig}>Fig. a. Apollo 16, John Young&rsquo;s jump salute</span>
                <Reading value={moonG.measured.toFixed(2)} pm={moonG.sigma.toFixed(2)} unit="m/s²" tone="measured" label={`the Moon's gravity, measured from the pixels; known: ${moonG.reference} m/s²`} />
              </Link>
            )}
            {fou && fouRow && (
              <Link href="/x/foucault-pendulum" className={styles.specimen}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/prints/foucault-pendulum.webp" alt="The Foucault pendulum in Békéscsaba, frames laid over one another" className={styles.print} loading="lazy" />
                <span className={styles.fig}>Fig. b. A Foucault pendulum, Békéscsaba, real time</span>
                <Reading
                  value={`about ${fouRow.measured.toFixed(1)}`}
                  unit="m/s²"
                  tone="measured"
                  label={`Earth's gravity from the swing and the published length; 9.81 there. No error bar: the winning law misses the unseen frames by ${Math.round(winnerOf(fou).fit.testZ ?? NaN)}× the noise${fouSpark ? `; Muse Spark's plain law gives about ${fouSpark.measured.toFixed(2)}, with no error bar either (it misses by ${Math.round(fouPlainZ ?? NaN)}× the noise)` : ""}`}
                />
              </Link>
            )}
            {fou5 && fou5Row && (
              <Link href="/x/foucault-pendulum-5x" className={styles.specimen}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/prints/foucault-pendulum-5x.webp" alt="The same pendulum from a sped-up stretch, frames laid over one another" className={styles.print} loading="lazy" />
                <span className={styles.fig}>Fig. c. The same pendulum, a stretch sped up 5×</span>
                <Reading value={`${fou5Row.measured.toFixed(2)}×`} pm={fou5x?.rough ? undefined : (fou5Row.sigma ?? 0).toFixed(2)} tone="measured" label={`how much faster than life it plays, from gravity alone; the filmmaker's label says 5×${fou5x?.rough ? `. ${fou5Parts(fou5x)}; no error bar on g, whose law misses the unseen frames by ${fou5x.testZ.toFixed(1)}× the noise${fou5SameFilmLawFree(fou5x) ? `. Against the same film's real-time stretch: ${fou5SameFilmLawFree(fou5x)}` : ""}` : ""}`} />
              </Link>
            )}
            {aachen && aachenG && (
              <Link href="/x/aachen-pendulum-50cm" className={styles.specimen}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/prints/aachen-pendulum-50cm.webp" alt="A grey pendulum bob swinging on black, frames laid over one another" className={styles.print} loading="lazy" />
                <span className={styles.fig}>Fig. d. A 50 cm pendulum on black, filmed in Aachen</span>
                <Reading value={aachenG.measured.toFixed(2)} pm={aachenG.sigma.toFixed(2)} unit="m/s²" tone="measured" label={`Earth's gravity from a stranger's film, told only "about fifty centimetres"; 9.81 there`} />
              </Link>
            )}
            {slow?.clock && (
              <Link href="/x/sample-pendulum" className={styles.specimen}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/prints/sample-pendulum.webp" alt="A pendulum posted online, frames laid over one another" className={styles.print} loading="lazy" />
                <span className={styles.fig}>Fig. {aachen && aachenG ? "e" : "d"}. A pendulum posted online</span>
                <Reading value="no factor" label={`how much slower than life the clip plays: a re-run with ${pipelineName(slow.pipeline, true)} claims none`} />
              </Link>
            )}
          </div>
        </Plate>
      )}

      <Page>
        {moon && moonG && (
          <p>
            <b>The Moon&rsquo;s gravity from 1972 television, measured from the pixels.</b> John Young&rsquo;s jump salute, Apollo 16. No narration: the only inputs were the clip, the word &ldquo;astronaut&rdquo; for SAM 3.1 and the ruler. SAM 3.1 tracked him, the airborne frames came from his boots leaving the ground, and a plain ballistic law won. The Moon&rsquo;s surface gravity is {moonG.reference} m/s². The error bar is mostly the ruler: his suited height, taken as 1.88 m ± 5%. With that ruler his boots rose 0.40 m on average; the Apollo Lunar Surface Journal says about 0.42 m.
          </p>
        )}
        {moon && moonG && <Note who="SAM 3.1, then code">SAM 3.1 followed &ldquo;astronaut&rdquo;; code took the airborne frames, fitted the laws and scaled by the ruler. <Link href="/x/moon-jump">Open the run</Link>.</Note>}
        {fou && fouRow && fouSpark && (
          <p className={styles.para}>
            <b>A museum&rsquo;s Foucault pendulum, real footage.</b> The pendulum in Békéscsaba, Hungary, filmed by Zátonyi Sándor (ifj.) of FizFilm and published on Wikimedia Commons (CC BY 4.0) with its length (8.97 m) and period (6.0 s). Ansatz was told the length and nothing else. The camera looks down along the swing, so the bob moves toward and away from the lens. Muse Spark&rsquo;s plain pendulum law gives g of about {fouSpark.measured.toFixed(2)} m/s², with no error bar: it misses the unseen frames by {Math.round(fouPlainZ ?? NaN)}× the noise. Muse Wonder, asked by the referee, added the camera&rsquo;s perspective to the law and won: it misses the unseen frames by {winnerOf(fou).fit.testRms.toFixed(1)} px, against {(fou.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0]?.fit.testRms ?? NaN).toFixed(1)} px for Muse Spark&rsquo;s best. Its g is about {fouRow.measured.toFixed(1)} m/s², with no error bar: even this law misses the unseen frames by {Math.round(winnerOf(fou).fit.testZ ?? NaN)}× the noise. Earth&rsquo;s gravity there is 9.807, so about {Math.abs((fouRow.measured / 9.807 - 1) * 100).toFixed(1)}% low.
          </p>
        )}
        {fou && (
          <Note who="SAM 3.1, Muse Spark, Muse Wonder, then code">
            SAM 3.1 followed &ldquo;{fou.tracking.noun}&rdquo; in {fou.tracking.framesSeen} frames, one in {Math.round(fou.video.frames / fou.tracking.framesSeen)} of the clip&rsquo;s {fou.video.frames.toLocaleString("en")}; the length was said, not measured. <Link href="/x/foucault-pendulum">Open the run</Link>.
          </Note>
        )}
        {fou5 && fou5Row && (
          <p className={styles.para}>
            <b>The same pendulum sped up 5×, caught by gravity alone.</b> Part of the same film plays at five times real speed, and the filmmaker labels it on screen; we cropped the label out before the run. During the run Muse Spark, watching it, took it as real time (&ldquo;{fou5.observation.slow_motion?.evidence ?? "no sign of slow motion"}&rdquo;){fou5Quiz ? `; ${fou5Quiz.said}${medFou5}` : ""}. Measured, the swing implies a gravity 25 times Earth&rsquo;s, and the clock check reads that as a clip playing {fou5x ? fou5Long(fou5x) : `${fou5Row.measured.toFixed(2)}× faster than life`}. The label says 5×.{fou5x && fou5SameFilmLawFree(fou5x) ? ` A check that needs no reference value: against the same film’s real-time stretch, ${fou5SameFilmLawFree(fou5x)}${fou5SameFilm(fou5x) ? " (gravity scales as one over time squared, so the ratio of the two gravities is the square of the speed-up)" : ""}.` : ""}
            {(() => {
              // why 4.97 and not 5: the real-time stretch, timed by its zero crossings, swings a little slow for its stated length
              const rt = fou5?.extras?.periodCheck?.realTime;
              if (!rt || !fou5x) return "";
              const short = (1 - fou5x.f / fou5x.truth) * 100;
              const share = rt.overIdealPct / short;
              return ` The real-time stretch, timed the same way, swings in ${rt.period.toFixed(3)} ± ${rt.sigma.toFixed(3)} s, ${rt.overIdealPct.toFixed(2)}% slower than an 8.97 m pendulum should: as if the pendulum were about ${(2 * rt.overIdealPct).toFixed(1)}% longer than stated, which accounts for ${share > 0.4 && share < 0.6 ? "about half" : `${Math.round(share * 100)}%`} of the ${short.toFixed(2)}% by which ${fou5x.f.toFixed(2)} falls short of ${fou5x.truth}.`;
            })()}
          </p>
        )}
        {fou5 && <Note who="code">Gravity scales with the square of time: 25 times too strong is 5 times too fast. <Link href="/x/foucault-pendulum-5x">Open the run</Link>.</Note>}
        {slow?.clock && (
          <p className={styles.para}>
            <b>A clip that may hide its slow motion.</b> A pendulum posted online. With the tennis ball as the ruler, the first run found a gravity of {slowG?.measured.toFixed(2)} m/s², about a twentieth of Earth&rsquo;s: either a weaker world or a clip that plays slower than life. Nothing in the frames says so; only its uploader&rsquo;s title says &ldquo;slow motion&rdquo;. A re-run with {pipelineName(slow?.pipeline, true)} declines to measure the string&rsquo;s length, because the swing isn&rsquo;t one circle (the clamp catches the string), so it claims no factor at all.
          </p>
        )}
        {slow?.clock && <Note who="code">Gravity scales with the square of time, so a g that is too weak names the slowdown that would fix it. <Link href="/x/sample-pendulum">Open the run</Link>.</Note>}
        <p className={styles.para} id="strangers">
          <b>Footage from strangers.</b> Judges asked for footage nobody made for us. On 2 November we took {strangersWord(st2.n)} clips that strangers filmed and published under free licences, in three sets, and ran them through the same pipeline as any run. Ansatz was told only what each maker stated, in the maker&rsquo;s own words (Table 1a quotes them); captions, stopwatches and worked answers were cropped out first. Table 1a shows all {strangersWord(st2.n)}: {st2.text.replace(/^\S+ clips strangers filmed: /, "")}. Most misses are tracking failures: SAM 3.1 held the wrong thing, or the track broke, before any law was tried.
        </p>
        <Note who="SAM 3.1, Muse Spark, then code">The same pipeline as any run. {STRANGERS_RUNS} runs in all (the gym ball and the board fall twice each): ${STRANGERS_RUNS_USD.toFixed(2)} in runs (${STRANGERS_WITH_TRANSLATIONS_USD.toFixed(2)} with the four published pages&rsquo; translations, the last two estimated).</Note>
        {aachen && aachenG && (
          <p className={styles.para}>
            <b>The headline: a stranger&rsquo;s pendulum on black.</b> Rhetos of the Mathe-AC Lernwerkstatt Aachen filmed a grey metal bob on a yellow string against black (&ldquo;Schwingung (Definition)&rdquo;, CC BY-SA 4.0). It is the same source whose chalkboard clip defeated SAM 3.1 on 29 October (§8). Told only &ldquo;the string is about fifty centimetres long&rdquo;, Ansatz measured g = {aachenG.measured.toFixed(2)} ± {aachenG.sigma.toFixed(2)} m/s² against 9.81: {Math.abs(aachenG.errorPct).toFixed(2)}% off, {aachenG.withinSigma.toFixed(1)}σ. The error bar assumes the stated length is good to 1%. The clock check read real time. The film has its own stopwatch, which we cropped out before the run: it times a swing at about 1.42 s, and theory gives 1.418 s.
          </p>
        )}
        {aachen && <Note who="SAM 3.1, then code">SAM 3.1 followed &ldquo;{aachen.tracking.noun}&rdquo; in {aachen.tracking.framesSeen} frames; the length was said, not measured. <Link href="/x/aachen-pendulum-50cm">Open the run</Link>.</Note>}
      </Page>

      <div className={styles.tableBlock}>
        <table className={`journal ${styles.bench}`}>
          <caption>Table 1a. {strangersWord(st2.n).charAt(0).toUpperCase() + strangersWord(st2.n).slice(1)} clips strangers filmed, run on 2 November with only what their makers stated. Green: measured and published. Red: the law or the number failed.</caption>
          <thead>
            <tr>
              <th scope="col">Clip</th>
              <th scope="col">Filmed by, licence</th>
              <th scope="col">What Ansatz was told</th>
              <th scope="col">What it measured</th>
              <th scope="col">The truth</th>
              <th scope="col">Verdict</th>
            </tr>
          </thead>
          <tbody>
            {STRANGERS.map((r) => (
              <tr key={r.clip}>
                <th scope="row" data-label="Clip">
                  <span className={styles.clip}>{r.href ? <Link href={r.href}>{r.clip}</Link> : r.clip}</span>
                </th>
                <td data-label="Filmed by, licence">
                  <a href={r.whoHref}>{r.who}</a>
                  <span className={styles.sub}>{r.licence}</span>
                </td>
                <td data-label="What Ansatz was told">{r.told}</td>
                <td data-label="What it measured">{r.measured}</td>
                <td data-label="The truth">
                  {r.truth}
                  {r.sources?.length ? (
                    <>
                      {" "}Source:{" "}
                      {r.sources.map((x, i) => (
                        <span key={x.href}>
                          {i > 0 && ", "}
                          <a href={x.href}>{x.label}</a>
                        </span>
                      ))}
                      .
                    </>
                  ) : null}
                </td>
                <td data-label="Verdict">
                  <em className={r.verdict === "measured" ? styles.good : r.verdict === "nothing to check" ? undefined : styles.bad}>{r.verdict}</em>
                  <span className={styles.sub}>{r.note}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Plate n={plates.contact} id="contact-sheet" title="Every real clip, stamped." caption={`Every real clip Ansatz has been run on, the misses with the hits: archive footage, a museum's film, strangers' clips and failures. Each frame is the run's own print or a still cut from the clip; open one for its run or its row. ${(() => {
        const k = (vs: string[]) => contact.filter((c) => vs.includes(c.verdict)).length;
        return `Of these ${contact.length}: ${k(["measured"])} measured, ${k(["number right, law wrong", "about right, no error bar"])} where the number is right but the law is not, ${k(["no published answer", "no factor claimed"])} with no published answer to check, and ${k(["miss"])} misses.`;
      })()}`}>
        <ContactSheet clips={contact} />
      </Plate>

      <Page>

        {b && (
          <Section n={3} title="Every clip with a known answer" id="benchmark">
            <p>
              Rendered with the true physics integrated at 10 kHz, then blurred over half a frame, given sensor noise and compressed to H.264: 24 to 240 fps, 720p to 1080p, plain walls, tiled walls, a cluttered room, a blackboard.
            </p>
          </Section>
        )}
        {b && <Note who="code">Renders, truth files and the scoring script are in the repository; nothing here was typed by hand.</Note>}
      </Page>

      {sheet.length > 0 && (
        <Plate n={plates.sheet} title="Three of the rendered clips, every frame cut to one slice and laid side by side." caption="Read left to right as time. Each caption gives how closely the winning law predicted the last 30%, which no law was fitted to, as a share of the motion.">
          <div className={styles.sheet}>
            {sheet.map((e, i) => (
              <Link key={e.id} href={`/x/${e.id}`} className={styles.sheetRow}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/slits/${e.id}.webp`} alt={`Photo-finish of ${e.title}`} />
                <span>
                  <span className={styles.fig}>Fig. {String.fromCharCode(97 + i)}.</span> {e.title}: the last 30%, which no law was fitted to, predicted to {relMiss(e)}% of the motion
                </span>
              </Link>
            ))}
          </div>
        </Plate>
      )}

      {b && (
        <div className={styles.tableBlock}>
          <table className={`journal ${styles.bench}`}>
            <caption>
              Table 1. Every benchmark clip, its winning law, what Ansatz measured and what Muse Spark guessed by eye. Green marks within 5% or the right physics; red marks a miss.
            </caption>
            <thead>
              <tr>
                <th scope="col">Clip</th>
                <th scope="col">Winning law</th>
                <th scope="col">Measured against truth</th>
                <th scope="col">By eye (Muse Spark alone)</th>
                <th scope="col" className="r">Misses unseen frames by (share of the motion)</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r) => (
                <tr key={r.id}>
                  <th scope="row" data-label="Clip">
                    <span className={styles.clip}>{NAMES[r.phenomenon] ?? r.phenomenon}</span>
                    <span className={styles.sub}>
                      {r.variant ? `${r.variant.replace(/_/g, " ")}, ` : ""}
                      {r.fps} fps{r.slowMotion > 1 ? `, ${r.slowMotion}× slow motion` : ""}
                    </span>
                  </th>
                  <td data-label="Winning law">
                    {r.winner.title}
                    <span className={`${styles.sub} ${r.family.ok === false ? styles.bad : r.family.ok ? styles.good : ""}`}>
                      {r.family.ok === null ? "not judged" : r.family.ok ? `right physics (${r.family.expect})` : `wrong: expected ${r.family.expect}`}
                    </span>
                  </td>
                  <td data-label="Measured against truth" className={styles.nums}>
                    {r.checks.filter((c) => !c.quantity.startsWith("scale")).length === 0 && <span className={styles.sub}>no constant to compare</span>}
                    {(r.slowMotion ?? 1) > 1 && (
                      // on a clip slowed in secret the test is the clock check; gravity as filmed is meant to be off
                      <span className={styles.check}>
                        clock check:{" "}
                        {r.clock ? (
                          <em className={Math.abs(r.clock.factor / r.slowMotion - 1) <= 0.1 ? styles.good : styles.bad}>
                            flagged {r.clock.factor.toFixed(2)}× slow (truth {r.slowMotion}×){Math.abs(r.clock.factor / r.slowMotion - 1) > 0.1 ? ": the ruler was misread" : ""}
                          </em>
                        ) : (
                          <em className={styles.bad}>not flagged (truth {r.slowMotion}×)</em>
                        )}
                      </span>
                    )}
                    {r.checks.map((c) => {
                      // a fall sets the scale assuming real time: on a clip slowed n×, it comes out n² too big, as it must
                      const n = r.slowMotion ?? 1, ratio = c.measured / c.truth;
                      const clock = c.quantity.startsWith("scale") && n > 1 && Math.abs(ratio / (n * n) - 1) < 0.05;
                      return (
                        <span key={c.quantity} className={styles.check}>
                          {c.quantity}: {fmt(c.measured)} vs {fmt(c.truth)}{" "}
                          {clock ? (
                            <em className={styles.bad}>
                              {ratio.toFixed(1)}× = {Math.sqrt(ratio).toFixed(2)}², as an {n}× slow clip must give when the fall sets the scale; only a ruler in view can catch it
                            </em>
                          ) : (
                            <em className={Math.abs(c.errPct) <= 5 ? styles.good : styles.bad}>
                              {c.errPct >= 0 ? "+" : ""}
                              {c.errPct.toFixed(Math.abs(c.errPct) < 1 ? 2 : 1)}%
                            </em>
                          )}
                        </span>
                      );
                    })}
                  </td>
                  <td data-label="By eye (Muse Spark alone)" className={styles.nums}>
                    {r.checks
                      .filter((c) => c.eyeballErrPct !== undefined)
                      .map((c) => (
                        <span key={c.quantity} className={styles.check}>
                          {c.quantity}: {fmt(c.eyeball!)}{" "}
                          <em className={Math.abs(c.eyeballErrPct!) <= 5 ? styles.good : styles.bad}>
                            {c.eyeballErrPct! >= 0 ? "+" : ""}
                            {c.eyeballErrPct!.toFixed(0)}%
                          </em>
                        </span>
                      ))}
                  </td>
                  <td data-label="Misses unseen frames by (share of the motion)" className={`r ${styles.nums}`}>
                    {(r.predictionRel * 100).toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Page>
        {refb && wonb && (
          <Section n={4} title="Do the models earn their place?" id="models">
            <p>
              The referee and Muse Wonder, each run on its own over every benchmark clip, from the stored measurements. ${(refb.summary.usd + wonb.summary.usd).toFixed(2)} of model calls in all.
            </p>
          </Section>
        )}
        {refb && wonb && obsb && (
          <p className={styles.para}>
            <b>The observer is what lets a clip nobody labelled become an experiment.</b> Across {obsb.summary.runs} stored runs, Muse Spark named the moving object right {obsb.summary.subjectRight} of {obsb.summary.subjectScored} times (where we didn&rsquo;t hand it the name), and SAM 3.1 found it on that first name every time; it read the world right {obsb.summary.worldRight} of {obsb.summary.runs} times and the kind of experiment {obsb.summary.motionKindRight} of {obsb.summary.runs}, and took the string length from Hindi narration. A lite default that assumes Earth and no ruler would have failed on {obsb.summary.naiveWouldFail} of these runs
            {obsb.summary.naiveWouldFailBy
              ? `: the ${Object.entries(obsb.summary.naiveWouldFailBy).find(([k]) => /world/i.test(k))?.[1] ?? 0} Moon and Mars clips, and ${Object.entries(obsb.summary.naiveWouldFailBy).find(([k]) => /slow/i.test(k))?.[1] ?? 0} slowed clips where the ruler it picked fixed the scale`
              : ", every Moon and Mars clip among them"}
            . Its limits: it used a ruler on only {obsb.summary.rulerPicked} of {obsb.summary.rulerNeeded} clips that had one, because the rendered rulers are unmarked striped bars whose length it declined to guess (it read {obsb.summary.rulerLengthRight} of {obsb.summary.rulerPicked} right when it did; stating the ruler on the run form fixes the rest), and its free-motion window is only a little tighter than the whole clip (median overlap {obsb.summary.windowMedianIoU.toFixed(2)} against {obsb.summary.windowNaiveWholeClipMedianIoU.toFixed(2)}).
          </p>
        )}
        {refb && wonb && obsb && <Note who="Muse Spark 1.3, the observer">Scored over the stored runs by scripts/observer-score.ts; no new model calls.</Note>}
        {refb && wonb && wab && wab.arms.length === 2 && (() => {
          const [o, n] = wab.arms.map(abArm);
          return (
            <p className={styles.para}>
              <b>Muse Wonder, old setting against new.</b> On the two renders whose law was missing and the four clips where it once overreached: at low effort with no picture it found the law {o.found} of {o.needed} times and held back {o.held} of {o.tame}; at medium effort, shown a plot of each attempt&rsquo;s misses, it found the law {n.found} of {n.needed} times and held back {n.held} of {n.tame}. Runs now use the second setting (${wab.usd.toFixed(2)} for the comparison).
            </p>
          );
        })()}
        {refb && wonb && voice && (
          <p className={styles.para}>
            <b>Muse Voice Transcribe, in each language.</b> A spoken string length and a &ldquo;let go&rdquo; word, in synthetic voices: the length heard and parsed right in {voice.summary.lengthChecked} of {voice.summary.languages} languages (Bengali misheard &ldquo;seventy&rdquo;), the let-go word heard in {voice.summary.releaseHeard} of {voice.summary.languages}. Real speakers are still to be tested.
          </p>
        )}
        {voiceRuns && (
          <p className={styles.para}>
            <b>Muse Voice Transcribe set the length in two published lite runs.</b> No Muse Spark and nothing typed, so the length could only come from the transcript. {voiceRuns.runs.map((x, i) => (
              <span key={x.id}>
                {i ? " " : ""}
                {x.language} over {x.clip}: heard &ldquo;{x.heard.replace(/\.$/, "")}&rdquo;, read as {x.length}, {x.g}
                {x.full ? `; ${x.full}` : ""} (<Link href={x.href}>the run</Link>).
              </span>
            ))}{" "}
            {voiceRuns.usdText} a run (synthetic voice, labelled on each run).
          </p>
        )}
        {refb && wonb && voice && <Note who="Muse Voice Transcribe">Synthetic voices only. A real speaker in each language is still to be tested.</Note>}
        {refb && wonb && (
          <p className={styles.para}>
            <b>The referee asks for a new law only when one is missing.</b> Shown the fitted frames alone (no ranks, no held-out errors), Muse Spark asked for one on {refb.summary.reviseWhenNeeded} of the {refb.summary.needed} renders we built to need a law outside the textbook, at full strength, and on {refb.summary.reviseWhenRight} of the {refb.summary.right} clips whose leading law already had the right physics.
          </p>
        )}
        {refb && wonb && <Note who="Muse Spark 1.3, the referee">${refb.summary.usd.toFixed(2)} of calls over {refb.summary.clips} clips.</Note>}
        {refb && wonb && (
          <p className={styles.para}>
            <b>Muse Wonder, challenged on every clip, rarely overreaches, and the held-out test catches it when it does.</b> With its old setting (low effort, no residual plot) and told the leading law might already be right, it kept or matched it on {wonb.summary.tie} of {wonb.summary.clips} clips. {wonb.summary.worse} times it added an effect that wasn&rsquo;t there; each such law missed the last 30%, which no law was fitted to, by more ({worse.length ? `${Math.min(...worse).toFixed(2)}× to ${Math.round(Math.max(...worse))}× the winner’s miss` : "more"}), so it lost. In a real run it is called in only when the referee asks for a new law or when the leading law misses even its own fitted frames by more than six times the noise; on these clips neither happened.
          </p>
        )}
        {refb && wonb && <Note who="Muse Wonder 1.0">${wonb.summary.usd.toFixed(2)} of calls over {wonb.summary.clips} clips, each with a fitting tool on the seen frames only.</Note>}
        {refb && wonb && (
          <p className={styles.para}>
            <b>Where a law really was missing</b>, it found it: the cubic stiffening of the <Link href="/x/hardening-spring">hardening spring</Link> and the dry friction of the <Link href="/x/dry-friction-spring">spring with friction</Link>, each winning on the unseen frames (on the published runs; on a later re-run of the hardening spring with today&rsquo;s prompt, Muse Spark proposed the cubic law itself, and both pass the same held-out test). On the stiffening spring the fit check called it in (the leading law missed its own fitted frames by {hard?.wonder?.missZ ? Math.round(hard.wonder.missZ) : 48}× the noise). On the friction spring the referee asked: its leading law missed its fitted frames by only {fricLead?.fit.trainZ ? Math.round(fricLead.fit.trainZ) : 4}× the noise, and the referee, reading the residual plot, named dry (Coulomb) friction, which Muse Wonder then wrote and fitted. Asked separately on the benchmark, the referee wanted a new law on both. Both are laws a physicist knows: a textbook library extended with a cubic spring and dry friction ties Muse Wonder on both, so these wins show it finding a law the base library lacked, not physics beyond the textbook.
            {fou && winnerOf(fou).origin === "revision"
              ? ` On the real Foucault footage its law beat Muse Spark’s (${winnerOf(fou).fit.testRms.toFixed(1)} px against ${(fou.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0]?.fit.testRms ?? NaN).toFixed(1)} px on the unseen frames) but still misses by ${Math.round(winnerOf(fou).fit.testZ ?? NaN)}× the noise, so it is not counted as a found law.`
              : ""}
          </p>
        )}

        {sealed && (
          <>
            <p className={styles.para} id="sealed">
              <b>Laws nobody chose: {sealed.title}.</b> {sealed.headline}
            </p>
            <p className={styles.para}>
              <b>Set by set.</b> {sealed.pattern}
            </p>
            <p className={styles.para}>
              We let public randomness choose the law. Each of {sealed.n} drand rounds drew one spring law from a fixed list (linear, cubic or lopsided stiffness; viscous, quadratic or dry damping; a periodic drive half the time), with constants from stated ranges. Each law&rsquo;s SHA-256 was pushed to GitHub before its clip was rendered, Ansatz was told only &ldquo;{sealed.narration}&rdquo;, and the laws were revealed after the runs ({sealed.sets.map((x, i) => (
                <span key={x.seal}>
                  {i ? "; " : ""}set {x.set}, rounds {x.rounds[0]}–{x.rounds.at(-1)}: seal <a href={x.sealUrl}>{x.seal}</a>, reveal <a href={x.revealUrl}>{x.reveal}</a>, found {x.found} of {x.n}
                </span>
              ))}). {sealed.foundText}.
            </p>
            <ul className={styles.para}>
              {sealed.draws.map((d) => (
                <li key={d.round}>
                  {d.line} <Link href={d.href}>Open the run</Link>; <a href={d.url}>the drand round</a>.
                </li>
              ))}
            </ul>
            {sealed.wonderStory && <p className={styles.para}>{linkRep(sealed.wonderStory)}</p>}
            {sealed.replicate && !sealed.wonderStory?.includes(sealed.replicate.detail) && (
              <p className={styles.para}>
                <b>The replicate.</b> {linkRep(sealed.replicate.detail)}
              </p>
            )}
            <p className={styles.para}>
              <b>A review run, not counted.</b> {sealed.review}
            </p>
            <p className={styles.para}>
              <b>What counts as found.</b> {sealed.rule}
            </p>
            {sealed.driveNote && <p className={styles.para}>{sealed.driveNote}</p>}
            <p className={styles.para}>
              <b>What the seal proves, and what it does not.</b> {sealed.proves}
            </p>
            <p className={styles.para}>
              <b>When each set was sealed.</b> {sealed.timing}
            </p>
            <Note who="Code, then the same pipeline as any run">Check it yourself: <code>npx tsx scripts/sealed-law.ts verify {sealed.draws[0].round}</code> re-derives a law from its drand round and compares it with the committed hash. ${sealed.usd.toFixed(2)} of runs for the {sealed.n}.</Note>
          </>
        )}

        {(lite || cov || clockc) && (
          <Section n={5} title="Checks on the method itself" id="checks">
            <p>Are the error bars honest, does the clock check raise false alarms, and how much of this needs a language model at all?</p>
          </Section>
        )}
        {cov && (
          <p className={styles.para}>
            <b>Error bars.</b> On {cov.cases.length} sets of {cov.trials} synthetic tracks with known answers (a projectile, a damped spring and a pendulum, each with white noise, smoothly wandering noise, and a mix of the two), the ±1σ intervals held the true value {Math.round(Math.min(...cov.cases.map((c) => c["coverage1σ"])) * 100)}–{Math.round(Math.max(...cov.cases.map((c) => c["coverage1σ"])) * 100)}% of the time and ±2σ {Math.round(Math.min(...cov.cases.map((c) => c["coverage2σ"])) * 100)}–{Math.round(Math.max(...cov.cases.map((c) => c["coverage2σ"])) * 100)}% (ideal: 68% and 95%). Plate {plates.calibration} shows each set.
            {(() => {
              const c = (b?.summary as { coverage?: { checked: number; within1: number; within2: number; worst: number } } | undefined)?.coverage;
              return c
                ? ` End to end, on the ${c.checked} physical constants with an error bar from the rendered clips: within ±1σ ${c.within1} of ${c.checked} (${Math.round((c.within1 / c.checked) * 100)}%), within ±2σ ${c.within2} of ${c.checked} (${Math.round((c.within2 / c.checked) * 100)}%), the worst ${c.worst.toFixed(1)}σ.${jackknifed ? ` These counts follow a re-score${benchDate ? ` on ${new Date(benchDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}` : ""} that gave the ${nRestitution} restitution constants leave-one-flight-out jackknife error bars, which are wider; before it, 19 and 22 of the same 27 held, and the worst was 5.6σ.` : ""}${worstCheck ? ` The worst is ${/x(\d+)$/.test(worstCheck.id) ? `the ${/x(\d+)$/.exec(worstCheck.id)![1]}× slowed clip’s ` : ""}${worstCheck.quantity}: ${Math.round(Math.abs(worstCheck.errPct))}% off, inside 3σ only because its error bar is ±${Math.round(((worstCheck.sigma ?? 0) / Math.abs(worstCheck.measured)) * 100)}%.` : ""}`
                : "";
            })()}
          </p>
        )}
        {cov && <Note who="code">The same fitting code a run uses, on tracks generated by scripts/coverage.ts. No model involved.</Note>}
      </Page>

      {cov && (
        <Plate n={plates.calibration} title="Error bars, put to the test." caption={`Each row is ${cov.trials} synthetic tracks with a known answer. A dot on its dashed line means the error bars are exactly as wide as they should be; left of it, a little too narrow.`}>
          <Calibration cases={cov.cases} trials={cov.trials} />
        </Plate>
      )}

      <Page>
        {clockc && (
          <p>
            <b>Clock-check controls.</b> {clockc.rows.filter((r) => r.slow === 1 && r.ruler).length} real-time clips with a trusted ruler: {clockc.rows.filter((r) => r.slow === 1 && r.ruler && !r.clock).length} not flagged, no false alarm.{" "}
            {smallSlow.length > 0 && `${smallSlow.length === 1 ? "One small slowdown" : `${smallSlow.length} small slowdowns`}: `}
            {missedSmall.map((r) => `${r.slow}× was missed, because Muse Spark took the striped bar for a metre stick only as a guess (±${Math.round((r.sigma! / r.g!) * 100)}%), so the ${Math.round((1 - 1 / (r.slow * r.slow)) * 100)}% shortfall in gravity sat inside the error bar`).join("; ")}
            {missedSmall.length > 0 && uncheckedSmall.length > 0 && "; "}
            {uncheckedSmall.map((r) => `${r.slow}× couldn’t be checked, because it didn’t trust the bar at all`).join("; ")}
            {smallSlow.length > 0 && ". "}
            The check catches a slowdown when the ruler&rsquo;s size is known, which the run form lets you state.
          </p>
        )}
        {clockc && <Note who="code, from Muse Spark's ruler">The clock check is arithmetic on the fitted gravity; the ruler&rsquo;s size is the one thing it takes from Muse Spark.</Note>}
        {lite && (
          <p className={styles.para}>
            <b>A lite mode with no Muse Spark or Muse Wonder</b>, measured offline with typed lengths (so with no Muse Voice Transcribe either) on the same stored runs: the student names the experiment and types or says the length, SAM 3.1 measures, and code fits a textbook library. {lite.summary.constantsWithin5} of {lite.summary.constantsChecked} constants within 5% (median {lite.summary.medianPhysErrPct.toFixed(2)}%), right law on {lite.summary.lawCorrect} of {lite.summary.lawJudged}, at a median {Math.round(lite.summary.medianSamUsd * 100)} cents of SAM 3.1 a clip. On clean textbook motion, the language models add little; they matter on footage nobody labelled, for the clock, and where the textbook runs out.
          </p>
        )}
        {lite && <Note who="SAM 3.1, then code">No Muse Spark or Muse Wonder in this mode; a length said aloud is set by Muse Voice Transcribe, as in the two published lite runs <a href="#models">above</a>. Measured offline by scripts/lite.ts. Lite mode is a choice on <Link href="/new">Run an experiment</Link>, and class links start in it.</Note>}

        {s && (
          <Section n={6} title="What each part adds" id="ablation">
            <p>The same records, re-scored with one part of the method taken away. No new model calls.</p>
          </Section>
        )}
        {s && (
          <dl className={styles.parts}>
            <dt>Without SAM 3.1 and the fit</dt>
            <dd>
              Muse Spark reading numbers off the video: median error {pct(s.medianEyeballErrPct, 0)} instead of {pct(split.phys.median, 2)} on the physical constants.
            </dd>
            <dt>Without Muse&rsquo;s hypotheses</dt>
            <dd>
              Against the one or two fixed controls each run carries, the winner predicts the unseen frames far better ({(s.medianPredictionRel * 100).toFixed(2)}% of the motion against {(s.medianPredictionRelControl * 100).toFixed(2)}%, medians). Against a fair library of twelve textbook laws it ties on most clips: see §7.
            </dd>
            <dt>Without the prediction test</dt>
            <dd>
              Picking the law that fits the seen frames best: on these clean renders, fit alone picks the right physics just as often ({s.lawCorrectIfChosenByFit} of {s.lawJudged} clips). The held-out test earns its keep where a law fits the seen frames and fails after them: on <Link href="/x/beach-ball-drag">the beach ball</Link>, {bbLin ? `linear air drag fits the first 70% to within ${bbLin.fit.trainZ!.toFixed(1)}× the noise, then misses the rest by ${Math.round(bbLin.fit.testZ!)}×` : "linear air drag fits the first 70% closely, then misses the rest"}; quadratic drag, the right physics, wins. Plate {plates.heldOut} lets you move the line yourself.
            </dd>
            <dt>Cost and time</dt>
            <dd>
              ${s.totalUsd.toFixed(2)} for all {s.cases} clips, a median of {s.medianSeconds.toFixed(0)} s each.
            </dd>
          </dl>
        )}
      </Page>

      {bb && (
        <Plate
          n={plates.heldOut}
          title="The beach ball, a render with exactly known quadratic drag. Drag the line: linear drag fits the past and is refuted by the future."
          caption={
            <>
              Each position of the line is a full refit by the same code a run uses. <Link href="/x/beach-ball-drag">Open this experiment</Link>.
            </>
          }
        >
          <FalsifyPlate id={bb.id} video={bb.source.video} t0={bb.measured.window.t0} laws={plateLaws(bb)} />
        </Plate>
      )}

      <Page>
        {ab && (
          <Section n={7} title="Does the model add anything a textbook doesn’t?" id="library">
            <p>
              We fitted a library of {12} textbook laws (simple, large-angle, damped and dragged pendulums; harmonic motion with and without damping or drag; flight in vacuum, with linear or quadratic drag, and bouncing) to every clip with no model involved, and scored them exactly as Muse Spark&rsquo;s laws are scored.
            </p>
          </Section>
        )}
        {ab && <Note who="code">The library is fitted by the same code a run uses; scripts/ablation.ts.</Note>}
        {ab && (
          <table className={`journal ${styles.lib}`}>
            <caption>Table 2. Muse Spark&rsquo;s best law against the library&rsquo;s best, clip by clip.</caption>
            <thead>
              <tr>
                <th scope="col" className="r">Clips</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className={`r ${styles.big}`}>
                  {ab.summary.tied}/{ab.summary.clips}
                </td>
                <td>Muse Spark&rsquo;s best law ties the library&rsquo;s best: on textbook physics it re-derives the textbook, written in the clip&rsquo;s own quantities.</td>
              </tr>
              <tr>
                <td className={`r ${styles.big}`}>
                  {ab.summary.sparkBetter}/{ab.summary.clips}
                </td>
                <td>Spark&rsquo;s law scores better: the two pucks colliding. Neither side truly describes two bodies (both are graded wrong in Table 1), so this is no win; two-body laws are the next thing to build.</td>
              </tr>
              <tr>
                <td className={`r ${styles.big}`}>
                  {ab.summary.libraryBetter}/{ab.summary.clips}
                </td>
                <td>The library is better: a hollow ball rolling down a ramp, whose rolling law Spark wrote less well.</td>
              </tr>
              {ab.extra?.map((x, i) => (
                <tr key={x.id}>
                  <td className={`r ${styles.big}`}>
                    {x.libraryMissMm} to {x.modelMissMm} {x.unit ?? "mm"}
                  </td>
                  <td>
                    <Link href={`/x/${x.id}`}>{x.title}</Link>: the library&rsquo;s best law ({x.libraryLaw}) misses the unseen motion by {x.libraryMissMm} {x.unit ?? "mm"}; Muse Wonder&rsquo;s, found with its fitting tool, by {x.modelMissMm} {x.unit ?? "mm"}. This is where a model that writes laws earns its place.{abNow(i) ? ` ${abNow(i)}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <Section n={8} title="Where it fails" id="fails">
          <p>
            We ran a real classroom clip: <a href={PENDEL}>&ldquo;Pendelgesetz (mit Rechnung)&rdquo;</a> by Rhetos, Mathe-AC Lernwerkstatt Aachen (Wikimedia Commons, CC BY-SA 4.0). It shows a pendulum 0.5 m long whose bob is a small dark lead weight, swinging in front of a dark green chalkboard.
          </p>
        </Section>
        <p className={styles.para}>
          SAM 3.1 could not find the bob by name. The box Muse Spark pointed at held a wrong spot (mean confidence 0.34), and a second attempt, following the yellow string, held the bob in only 13 of 269 frames.
        </p>
        <Note who="Muse Spark, then SAM 3.1">Muse Spark named the bob and pointed at it; SAM 3.1 tracked what it was pointed at.</Note>
        <p className={styles.para}>
          The fits were poor, and Ansatz did not report a usable g. The best pendulum law gave g = 8.58 ± 0.14 m/s², 12% low, and it lost to a control with no swing at all.
        </p>
        <p className={styles.para}>
          On 2 November we ran another clip from the same source: a half-metre pendulum again, but a grey metal ball on a yellow string against black, not a small dark lead weight against a dark board. SAM 3.1 held it, and Ansatz measured g = {aachenG ? `${aachenG.measured.toFixed(2)} ± ${aachenG.sigma.toFixed(2)}` : "9.82 ± 0.10"} m/s² against 9.807 (<Link href="/x/aachen-pendulum-50cm">open the run</Link>). Same maker and the same kind of pendulum; the bob and the background both changed.
        </p>
        <p className={`${styles.para} ${styles.lesson}`}>
          The lesson: the object must stand out from its background. A light ball against a plain wall works, and so does a grey bob on black; a dark weight against a dark board does not.
        </p>
        <Note who="code">Every law was ranked by the same held-out test as any other run.</Note>
        <p className={styles.para}>
          The same thing stopped the most famous experiment filmed on the Moon, the hammer and feather on Apollo 15: the hammer is a few pixels wide against a white suit. <Link href="/how#limits">How it works</Link> tells that story.
        </p>
        <p className={styles.para}>
          <b>Two misses on strangers&rsquo; footage</b> (<a href="#strangers">Table 1a</a>). A metronome at 96 beats a minute: no law in the library is a metronome, and the best one missed by 25× the noise, so no fit was reported. Its period, timed offline from the tracked arm to a fraction of a frame, is about 1.24 s against the dial&rsquo;s 1.25 s. A gym ball filmed at 240 fps and stored at 50, so it plays 4.8× slower than life: it is green, in a green-lit corridor, and SAM 3.1 held only part of it, so every scale was wrong. Two tries, two misses. In both runs Muse Spark, describing the clip to say what to track, took it as real time{gymQuiz ? `; ${gymQuiz.said}${medGym}` : ""}. Ansatz measured no gravity, so it could not check the clock. The clock check is only as good as the ruler, and here the ruler was the ball.
        </p>
        <Note who="SAM 3.1, then code">A mask that holds part of the object gives a wrong size, and a wrong size gives a wrong scale and a wrong clock.</Note>
        <p className={styles.para}>
          <b>Two laws nobody proposed.</b> On 29 October we rendered two springs whose laws are not in any textbook list and ran them with no hints, on {pipelineName("2026-10-27c")}. A lopsided spring, stiffer stretched than squashed: every law Muse Spark wrote missed, and Muse Wonder&rsquo;s law halved the miss on the unseen frames (4.1 px against 8.9 px), but it did so with a drifting rest position, not the lopsided term that was really there. A spring that tires as it works, its stiffness falling through the clip: no proposed law described it, and a textbook control ranked first. Neither is published as a win; both runs are in <code>bench/runs/synth</code>.
        </p>
        <Note who="Muse Wonder, then code">A better prediction is not the same as the right law. The held-out test ranks predictions; naming the physics still needs the right form.</Note>

        <Section n={9} title="What this doesn’t show" id="limits">
          <ul className={styles.limits}>
            <li>The rendered clips are filmed straight on, with no perspective and no lens distortion. A phone at an angle, or motion toward the camera, adds error a ruler in the same plane can only partly remove.</li>
            <li>Many rendered clips have an unlabelled striped bar as a ruler; Muse Spark declined to assume its length, so those runs used gravity as the ruler and measured the camera&rsquo;s scale instead of g.</li>
            <li>Two-body collisions aren&rsquo;t supported yet: Ansatz follows one object at a time.</li>
            <li>A clip in slow motion with no ruler and no caption can&rsquo;t be caught: the clock check needs one length it can trust.</li>
            <li>The real-footage results are a handful of clips, not a benchmark.</li>
          </ul>
        </Section>
        <p className={styles.repro}>
          Reproduce: <code>scripts/bench.ts</code> runs every clip, <code>scripts/score.ts</code> scores the stored records. Clips and truth files are in the repository; the scored data is served at <a href="/bench">/bench</a>. Scored {b ? new Date(b.generatedAt).toUTCString() : "—"}.
        </p>
      </Page>
    </article>
  );
}

function fmt(v: number) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-6 || a >= 1e5)) return v.toExponential(2);
  return String(+v.toPrecision(4));
}

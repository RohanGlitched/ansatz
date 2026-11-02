import "server-only";
import { getExperiment, winnerOf } from "@/lib/experiments";
import { isRoughFit, type Experiment } from "@/lib/experiment";
// bundled with the page, so a revalidation on the server never depends on the file being traced
import gymRun from "@/data/strangers/gym-ball-bounce-240fps-b.json";
import sparkQuiz from "@/data/cyt/spark-quiz.json";
import { answersText, baselineOf, factorTally, majorityOf, speedRange, sparkSaidText, speedOf, speedText, VERDICTS, type FactorTally, type Speed, type Verdict } from "@/lib/cytScore";

/**
 * "Can you tell?": six real clips, each with what Muse Spark answered to the quiz's own question, what Ansatz measured
 * and the truth. Muse Spark's answers are read from data/cyt/spark-quiz.json (scripts/cyt-spark.ts: the same six files
 * the visitor sees, the same question, five times each). Ansatz's are read from stored runs: the five published records
 * in data/showcase, and the gym ball's second run (data/strangers, copied unchanged from the 2 November probe), which
 * was never published because it missed. The clips are short cuts of the same footage (public/cyt), made with ffmpeg
 * without retiming a frame, and named cyt-1 to cyt-6 so their names give nothing away.
 *
 * The page gets only the public half (CytPublic: files and scale cues). The answers (CytAnswers), with each clip's
 * credit, title and source, are served by /api/cyt and fetched when the reader asks for them, so nothing in the page
 * before that carries the truth or names a film (two pairs of clips share a film, and a shared credit would pair them).
 */
export type { Verdict };

export type CytPublicClip = {
  id: string;
  src: string;
  poster: string;
  /** the scale cue Muse Spark was given, which the page states too; null when it got none */
  cue: string | null;
};
export type CytPublic = { question: string; n: number; clips: CytPublicClip[] };

export type CytAnswerClip = {
  id: string;
  /** shown with the answers */
  title: string;
  /** the maker's credit, shown under the clip once the answers are in */
  credit: { who: string; licence: string; href: string };
  /** a short name for the sentence after the reveal ("the gym ball") */
  short: string;
  /** the full credit and how the clip on this page was cut from the run's footage */
  source: { credit: string; licence: string; href: string; cut: string; record: string };
  /** null verdict: Muse Spark's answers split evenly (or it was not asked), which scores as a miss */
  spark: { verdict: Verdict | null; said: string; detail?: string; quote?: string };
  /** null when the run could not measure the clock at all */
  ansatz: { verdict: Verdict | null; reading: string; detail?: string; href?: string; speed: Speed | null };
  truth: { verdict: Verdict; factor: string; source: string; speed: Speed };
};
export type CytAnswers = {
  clips: CytAnswerClip[];
  spark: number;
  ansatz: number;
  /** what the best constant answer scores, and whether Muse Spark's answers were constant: computed from the data */
  baseline: string;
  /** the second row: the right factor (within 10%) on the clips that do not play at real speed */
  factor: FactorTally;
  /** the sentence after the reveal, built from the same answers: what each said on the retimed clips */
  factorLine: string;
  /** a second, labelled set: the clips where Ansatz's run was told a length the first ask was not, asked again with
   * that length and the run's footage; its verdict tally, its factor row and the sentence that discloses it */
  parity?: { spark: number; factor: FactorTally; asked: number; line: string };
  /** how Muse Spark was asked: model, date, cue per clip, cost */
  method: string;
};
export type Cyt = { pub: CytPublic; answers: CytAnswers };

type QuizAnswer = { verdict: Verdict; factor: number; reasoning: string; model: string };
type QuizClip = { id: string; cue: string | null; cueWhy: string; answers: QuizAnswer[]; majority: Verdict | null; majorityCount: number };
type Quiz = { model: string; effort: string; date: string; n: number; question: string; usd: number; clips: QuizClip[] };
const quiz = sparkQuiz as unknown as Quiz;
// the second set, when there is one: those clips asked again with the length Ansatz's run was told and the run's footage
type Parity = { usd: number; n: number; effort: string; clips: (QuizClip & { file: string; durationS: number })[] };
const parity = (sparkQuiz as unknown as { parity?: Parity }).parity;

const fmt = (v: number, d = 2) => v.toFixed(d);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const verdictOf = (factor: number): Verdict => (factor > 1 ? "slowed" : factor < 1 ? "sped up" : "real time");
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const inWords = (k: number) => WORDS[k] ?? String(k);
/** One answer as words: "real time", "slowed 2×", "sped up 3×". */
const said = (a: QuizAnswer) => (a.verdict === "real time" ? "real time" : `${a.verdict} ${+a.factor.toPrecision(2)}×`);
const firstSentence = (s: string) => {
  const m = /^(.{20,220}?[.!?])(\s|$)/.exec(s.trim());
  const t = m ? m[1] : s.trim().slice(0, 200);
  return t.length < s.trim().length && !m ? `${t}…` : t;
};
/** The sentence of Muse Spark's reasoning that gives its reason (the first that talks about speed, time or gravity),
 * else its first sentence: the opening is often only a description of the scene. */
const REASON = /speed|slow|fast|period|time|second|gravity|float/i;
export const reasonOf = (s: string) => {
  // a sentence ends at . ! or ? before a capital, so "i.e. about" stays in one
  const sentences = s.trim().split(/(?<=[.!?])\s+(?=[A-Z“"(])/).filter(Boolean);
  const hit = sentences.find((x) => REASON.test(x));
  if (!hit) return firstSentence(s);
  return hit.length <= 240 ? hit : `${hit.slice(0, hit.lastIndexOf(" ", 220))}…`;
};

/** What Muse Spark answered to the quiz's own question on the visitor's cut: the majority of its repeats. */
function sparkOf(id: string): CytAnswerClip["spark"] {
  const q = quiz.clips.find((c) => c.id === id);
  if (!q || !q.answers.length) return { verdict: null, said: "Not asked", detail: "The run stopped before this clip, to stay inside its budget." };
  const n = q.answers.length;
  const lead = q.majority ? q.answers.find((a) => a.verdict === q.majority) : undefined;
  const factors = [...new Set(q.answers.filter((a) => a.verdict === q.majority && a.verdict !== "real time").map((a) => +a.factor.toPrecision(2)))];
  return {
    verdict: q.majority,
    said: q.majority
      ? `“${cap(q.majority)}${factors.length ? ` ${factors.map((f) => `${f}×`).join(" or ")}` : ""}”, ${q.majorityCount} of ${n}`
      : `Split: ${VERDICTS.map((v) => ({ v, k: q.answers.filter((a) => a.verdict === v).length })).filter((x) => x.k).sort((a, b) => b.k - a.k).map((x) => `${x.k} ${x.v}`).join(", ")}`,
    detail: `All ${inWords(n)}: ${q.answers.map(said).join(", ")}.${q.cue ? ` Told: “${q.cue}”` : ""}`,
    quote: lead ? reasonOf(lead.reasoning) : undefined,
  };
}

/** What Ansatz measured: the run's clock check. A flagged clock gives its factor; an unflagged one is real time, and
 * its factor is read from the gravity it measured (time scales as the square root of gravity). A run whose winning law
 * misses its unseen frames by more than five times the noise (isRoughFit, the experiment page's rule) gets no ± on
 * gravity: the factor is "about", or keeps only a statistical ± that says so. */
function ansatzOf(e: Experiment, extra?: string): CytAnswerClip["ansatz"] {
  const href = e.source.kind === "showcase" ? `/x/${e.id}` : undefined;
  const w = winnerOf(e);
  const rough = !!w && isRoughFit(w.fit);
  const misses = rough ? `the law misses the unseen frames by ${+w.fit.testZ!.toPrecision(2)}× the noise` : "";
  if (e.clock) {
    const f = e.clock.factor, s = e.clock.sigma;
    const sped = f < 1;
    const x = sped ? 1 / f : f, xs = s === undefined ? undefined : sped ? s / (f * f) : s;
    const how = sped ? "faster" : "slower";
    const why = extra ?? `Gravity came out too ${sped ? "strong" : "weak"} by the square of that.`;
    const speed = speedOf(f);
    // the speed-up's ± split into the 1% assumed on the stated length and the fit's own part, and the law-free period
    const sp = e.extras?.truth?.rows.find((r) => r.param === "speedup");
    const pc = e.extras?.periodCheck;
    const parts = sp?.sigmaAssumed != null && sp?.sigmaFit != null ? `± ${sp.sigmaAssumed.toFixed(3)} if the stated length is good to 1%, the fit alone ± ${sp.sigmaFit.toFixed(4)}; ` : xs !== undefined ? `± ${fmt(xs)} statistical; ` : "";
    const period = pc ? `the period from ${pc.crossings} zero crossings, with no law, gives ${pc.speedup.toFixed(3)}×; ` : "";
    if (rough) return { verdict: sped ? "sped up" : "slowed", reading: `${fmt(x)}× ${how} than life`, detail: `${parts}${period}${misses}. ${why}`, href, speed };
    return { verdict: sped ? "sped up" : "slowed", reading: `${fmt(x)}${xs !== undefined ? ` ± ${fmt(xs)}` : ""}× ${how} than life`, detail: why, href, speed };
  }
  if (e.clockCheck && !e.clockCheck.checked) {
    return { verdict: null, reading: "Could not measure", detail: extra ?? e.clockCheck.why, href, speed: null };
  }
  const speed: Speed = { verdict: "real time", factor: 1 };
  const g = e.comparisons.find((c) => c.param === "g");
  if (!g) return { verdict: "real time", reading: "Real time", detail: extra, href, speed };
  const moon = g.reference === 1.625;
  const against = `against ${moon ? "the Moon’s 1.625" : `Earth’s ${fmt(g.reference)}`}.`;
  // the same rounding as the run page's first screen (about 9.68)
  if (rough) return { verdict: "real time", reading: `Real time (no error bar: ${misses})`, detail: extra ?? `g about ${+g.measured.toPrecision(3)} m/s², ${against}`, href, speed };
  const f = Math.sqrt(g.reference / g.measured), s = 0.5 * f * (g.sigma / g.measured);
  return { verdict: "real time", reading: `Real time: ${fmt(f)} ± ${fmt(s)}×`, detail: extra ?? `g = ${fmt(g.measured)} ± ${fmt(g.sigma)} m/s², ${against}`, href, speed };
}

/** What a run was told about scale, from its record's first given ("pendulum length 8.97 m"). */
const toldOf = (e: Experiment) => {
  const m = /([A-Za-z ]+?) = ([\d.]+ m)\b/.exec((e.given[0] ?? "").replace(/^scale:\s*/, ""));
  return m ? `${m[1].trim()} ${m[2]}` : null;
};

/** The quiz's answers on one clip, as speeds. */
const quizSpeeds = (id: string): Speed[] => (quiz.clips.find((c) => c.id === id)?.answers ?? []).map((a) => ({ verdict: a.verdict, factor: a.verdict === "real time" ? 1 : a.factor }));

/**
 * What Muse Spark answered to the blind test's question on the clip cut from a run's footage, in words ("2 slowed
 * (2× or 4×), 2 sped up (3×), 1 real time"), for the pages that also say what Muse Spark wrote inside that run, so
 * both asks are named.
 */
const QUIZ_CLIP: Record<string, string> = { "foucault-pendulum-5x": "cyt-1", "moon-jump": "cyt-2", "aachen-pendulum-50cm": "cyt-3", "gym-ball-bounce-240fps": "cyt-4", "moon-jump-slowed": "cyt-5", "foucault-pendulum": "cyt-6" };
export function quizSaid(run: string): { n: number; answers: string; split: boolean; said: string } | null {
  const id = QUIZ_CLIP[run];
  const q = id ? quiz.clips.find((c) => c.id === id) : undefined;
  if (!q || !q.answers.length) return null;
  const answers = answersText(quizSpeeds(q.id));
  // "asked the quiz's question five times, it split 2 slowed (2× or 4×), 2 sped up (3×), 1 real time"
  const said = `asked the blind test’s question ${inWords(q.answers.length)} times, it ${q.majority ? "answered" : "split"} ${answers}`;
  return { n: q.answers.length, answers, split: !q.majority, said };
}

export async function canYouTell(): Promise<Cyt | null> {
  const [moon, slowed, fou, fou5, aachen] = await Promise.all(["moon-jump", "moon-jump-slowed", "foucault-pendulum", "foucault-pendulum-5x", "aachen-pendulum-50cm"].map((id) => getExperiment(id).catch(() => null)));
  const gym = gymRun as unknown as Experiment;
  if (!moon || !slowed || !fou || !fou5 || !aachen || !gym) return null;

  const st = moon.extras?.speedTest;
  const sj = moon.extras?.memoryTest?.sameJump?.combined;
  const fouT = fou.extras?.truth?.rows.find((r) => r.param === "T");
  const fou5S = fou5.extras?.truth?.rows.find((r) => r.param === "speedup");
  const gymFps = Math.round(gym.video.fps);
  const gymFilmed = 240; // the frame rate its maker states on his own page, which the Commons file names as its source
  const gymCal = gym.measured.calibration as { px?: number; sigmaPx?: number };
  const gymLen = gym.observation.reference.real_length_m;
  const NASA = { who: "NASA, Apollo 16, 1972", licence: "Public domain", href: moon.source.page ?? "" };
  const FIZ = { who: "Zátonyi Sándor (ifj.), FizFilm", licence: "CC BY 4.0", href: fou.source.page ?? "" };
  const GYM_PAGE = "https://commons.wikimedia.org/wiki/File:Flummiversuch_(Gymnastikball-R%C3%BCcksteigh%C3%B6he).webm";
  const GYM_MAKER = "https://www.rhetos.de/html/lex/flummiversuche.htm";
  const src = (e: Experiment) => ({ credit: e.source.credit ?? "", licence: e.source.license ?? "", href: e.source.page ?? "" });
  const SPARK = "data/cyt/spark-quiz.json";
  const fou5Truth = fou5S?.truth ?? 5;
  const gymTruth = gymFilmed / gymFps;
  const slowTruth = st?.truth ?? 1.5;

  // Page order, by which a clip is numbered (the ids are the file names, which Muse Spark's answers are keyed by). The
  // two pairs cut from one film (cyt-1 and cyt-6, cyt-2 and cyt-5) never share a row or a column three across, and
  // are never next to each other two across or one across; the quiz intro tells the reader the pairs are there.
  const rows: { pub: Omit<CytPublicClip, "src" | "poster" | "cue">; ans: Omit<CytAnswerClip, "id" | "spark">; told: string | null }[] = [
    {
      pub: { id: "cyt-1" },
      told: toldOf(fou5),
      ans: {
        title: fou5.title,
        credit: FIZ,
        short: "museum film",
        source: { ...src(fou5), cut: "6 s from 4 s into the run’s clip, cropped square around the bob", record: `data/showcase/foucault-pendulum-5x.json; Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(fou5),
        truth: { verdict: verdictOf(1 / fou5Truth), factor: `${fou5Truth}× faster`, source: "The filmmaker sped this stretch up and labelled it on screen. We cropped the label out before the run.", speed: speedOf(1 / fou5Truth) },
      },
    },
    {
      pub: { id: "cyt-2" },
      told: toldOf(moon),
      ans: {
        title: "Apollo 16, as broadcast",
        credit: NASA,
        short: "Apollo broadcast",
        source: { ...src(moon), cut: "5.2 s from 1.2 s into the broadcast, cropped square around John Young", record: `data/showcase/moon-jump.json; Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(moon),
        truth: { verdict: "real time", factor: "Real time", source: "The 1972 television broadcast, as digitised for the Apollo Lunar Surface Journal.", speed: speedOf(1) },
      },
    },
    {
      pub: { id: "cyt-3" },
      told: toldOf(aachen),
      ans: {
        title: aachen.title,
        credit: { who: "Rhetos, Mathe-AC Lernwerkstatt Aachen", licence: "CC BY-SA 4.0", href: aachen.source.page ?? "" },
        short: "Aachen pendulum",
        source: { ...src(aachen), cut: "5 s from 2 s into the run’s clip, cropped square", record: `data/showcase/aachen-pendulum-50cm.json; Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(aachen),
        truth: { verdict: "real time", factor: "Real time", source: "The film’s own stopwatch, cropped out before the run, times a swing at about 1.42 s; a 0.5 m pendulum on Earth swings in 1.418 s.", speed: speedOf(1) },
      },
    },
    {
      pub: { id: "cyt-4" },
      told: toldOf(gym),
      ans: {
        title: "Gym ball bouncing (not published: a miss)",
        credit: { who: "Rhetos", licence: "CC BY-SA 4.0", href: GYM_PAGE },
        short: "gym ball",
        source: { credit: "Rhetos, Flummiversuch (Gymnastikball-Rücksteighöhe)", licence: "CC BY-SA 4.0", href: GYM_PAGE, cut: "the run’s whole 2.5 s clip (3.0 to 5.5 s of the original), cropped square around the ball", record: `data/strangers/gym-ball-bounce-240fps-b.json (the second of two runs; the first, on 1.5 to 5.5 s, also failed to check the clock); Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(
          gym,
          gymCal.px !== undefined && gymCal.sigmaPx !== undefined
            ? `SAM 3.1 held only part of the green ball in a green-lit corridor: ${Math.round(gymCal.px)} ± ${Math.round(gymCal.sigmaPx)} px across for a ball said to be ${Math.round(gymLen * 100)} cm. No law came out with a gravity, so there was nothing to check the clock against.`
            : undefined,
        ),
        truth: { verdict: verdictOf(gymTruth), factor: `${fmt(gymTruth, 1)}× slower`, source: `Filmed at ${gymFilmed} frames a second, as its maker’s own page says (${GYM_MAKER.replace(/^https:\/\/www\.|\/.*$/g, "")}, which the Commons file names as its source), and stored at ${gymFps}, as the file is.`, speed: speedOf(gymTruth) },
      },
    },
    {
      pub: { id: "cyt-6" },
      told: toldOf(fou),
      ans: {
        title: fou.title,
        credit: FIZ,
        short: "museum film at real time",
        source: { ...src(fou), cut: "6 s from 12 s into the run’s clip, cropped square around the bob", record: `data/showcase/foucault-pendulum.json; Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(fou),
        truth: { verdict: "real time", factor: "Real time", source: `The filmmaker published the pendulum’s length and its ${fouT?.truth ?? 6} s swing with the film.`, speed: speedOf(1) },
      },
    },
    {
      pub: { id: "cyt-5" },
      told: toldOf(slowed),
      ans: {
        title: "Apollo 16, slowed in secret",
        credit: NASA,
        short: "slowed Apollo copy",
        source: { ...src(slowed), cut: "5.2 s from 1.8 s into the slowed copy, cropped square around John Young", record: `data/showcase/moon-jump-slowed.json; Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(slowed, sj ? `From its gravity alone, against the Moon’s. Jump for jump against the broadcast (jump windows set by hand): ${fmt(sj.ratio, 3)} ± ${fmt(sj.sigma, 3)}×.` : undefined),
        truth: { verdict: verdictOf(slowTruth), factor: `${slowTruth}× slower`, source: "We slowed the broadcast ourselves, with motion-interpolated frames at an ordinary 29.97 fps, and told no one.", speed: speedOf(slowTruth) },
      },
    },
  ];

  const cueOf = (id: string) => quiz.clips.find((c) => c.id === id)?.cue ?? null;
  const pub: CytPublic = {
    question: quiz.question,
    n: quiz.n,
    clips: rows.map((r) => ({ ...r.pub, src: `/cyt/${r.pub.id}.mp4`, poster: `/cyt/${r.pub.id}.webp`, cue: cueOf(r.pub.id) })),
  };
  const clips: CytAnswerClip[] = rows.map((r) => ({ id: r.pub.id, ...r.ans, spark: sparkOf(r.pub.id) }));
  // clips are named by their place on the page
  const at = (id: string) => rows.findIndex((r) => r.pub.id === id) + 1;
  const list = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
  const cues = rows.filter((r) => cueOf(r.pub.id)).map((r) => `clip ${at(r.pub.id)} “${cueOf(r.pub.id)!.replace(/\.$/, "")}”`);
  // what Ansatz's runs were told that the quiz did not give Muse Spark
  const toldOnly = rows.filter((r) => r.told && !cueOf(r.pub.id));
  const toldText = toldOnly.length
    ? ` Ansatz’s runs were told more than the quiz gave Muse Spark on ${toldOnly.length === 1 ? "one clip" : `${inWords(toldOnly.length)} clips`}: ${list(toldOnly.map((r) => `clip ${at(r.pub.id)} (${r.told})`))}, each from its maker’s own figures. Without a length, a swing or a fall gives no gravity, and so no clock.`
    : "";
  const date = new Date(quiz.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });

  // the factor row and the sentence after the reveal, from the same answers
  const factor = factorTally(rows.map((r) => ({ truth: r.ans.truth.speed, spark: quizSpeeds(r.pub.id), ansatz: r.ans.ansatz.speed })));
  const retimed = rows.filter((r) => r.ans.truth.speed.verdict !== "real time");
  const read = retimed.filter((r) => r.ans.ansatz.speed).map((r) => r.ans.ansatz.reading.replace(/ than life$/, ""));
  const missed = retimed.filter((r) => !r.ans.ansatz.speed).map((r) => `the ${r.ans.short}`);
  // the same scores with the second set's answers wherever it has them
  const parityLine = (() => {
    if (!parity?.clips.length) return undefined;
    const asked = rows.filter((r) => parity.clips.some((c) => c.id === r.pub.id));
    const answersOf = (id: string): Speed[] => (parity.clips.find((c) => c.id === id)?.answers ?? quiz.clips.find((c) => c.id === id)?.answers ?? []).map((a) => ({ verdict: a.verdict, factor: a.verdict === "real time" ? 1 : a.factor }));
    const spark = rows.filter((r) => majorityOf(answersOf(r.pub.id).map((a) => a.verdict)).verdict === r.ans.truth.verdict).length;
    const f = factorTally(rows.map((r) => ({ truth: r.ans.truth.speed, spark: answersOf(r.pub.id), ansatz: r.ans.ansatz.speed })));
    const ansatzN = rows.filter((r) => r.ans.ansatz.verdict === r.ans.truth.verdict).length;
    const firstN = rows.filter((r) => quiz.clips.find((c) => c.id === r.pub.id)?.majority === r.ans.truth.verdict).length;
    const pc = (id: string) => parity.clips.find((c) => c.id === id)!;
    // footage: the run's whole clip where that is not the page's own file
    const longer = asked.filter((r) => !pc(r.pub.id).file.startsWith("public/cyt/"));
    const said = (id: string) => {
      const c = pc(id);
      const as = answersOf(id);
      const m = majorityOf(as.map((a) => a.verdict));
      const fs = as.filter((a) => a.verdict === m.verdict && a.verdict !== "real time").map((a) => a.factor);
      return `clip ${at(id)} ${m.verdict ?? "split"} ${m.count} of ${c.answers.length}${fs.length ? ` (${speedRange(fs)})` : ""}`;
    };
    const tie = spark === ansatzN ? `, a tie with Ansatz’s ${ansatzN} of ${rows.length}` : `, against Ansatz’s ${ansatzN} of ${rows.length}`;
    // the clip where the second set changed the verdict, and what Ansatz read on it
    const changed = asked.filter((r) => majorityOf(answersOf(r.pub.id).map((a) => a.verdict)).verdict === r.ans.truth.verdict && quiz.clips.find((c) => c.id === r.pub.id)?.majority !== r.ans.truth.verdict && r.ans.truth.speed.verdict !== "real time");
    const number = changed.length
      ? ` The difference is the number: on clip ${at(changed[0].pub.id)} Ansatz reads ${changed[0].ans.ansatz.reading.replace(/ than life$/, "")}, while Muse Spark’s ${pc(changed[0].pub.id).answers.length} factors run from ${speedRange(answersOf(changed[0].pub.id).filter((a) => a.verdict === changed[0].ans.truth.verdict).map((a) => a.factor))}; on the factor row it stays ${f.spark} of ${f.n} (${f.sparkAnswersRight === 0 ? "none" : f.sparkAnswersRight} of its ${f.sparkAnswers} answers on those clips within ${Math.round(f.tol * 100)}%).`
      : ` On the factor row it stays ${f.spark} of ${f.n}.`;
    const line = `Ansatz’s runs were told more than the first ask gave Muse Spark: ${list(asked.map((r) => `clip ${at(r.pub.id)} (${r.told})`))}${longer.length ? `, and on ${list(longer.map((r) => `clip ${at(r.pub.id)}`))} it measured the run’s whole clip (${list(longer.map((r) => `${+pc(r.pub.id).durationS.toFixed(1)} s`))}) where this page shows a crop` : ""}. Muse Spark first saw only this page’s files, with no length, and scored ${firstN} of ${rows.length}. Asked again with the same lengths and the same footage, ${inWords(parity.n)} times each at ${parity.effort} effort ($${parity.usd.toFixed(2)}), it answered ${list(asked.map((r) => said(r.pub.id)))}: with equal information its score is ${spark} of ${rows.length}${tie}.${number}`;
    return { spark, factor: f, asked: asked.length, line };
  })();
  // clauses joined by semicolons, since a split vote carries commas of its own
  const semi = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join("; ")}; and ${xs.at(-1)}`);
  const factorLine = `On the ${inWords(retimed.length)} clips that don’t play at real speed, Muse Spark’s answers were ${semi(retimed.map((r, i) => `${sparkSaidText(quizSpeeds(r.pub.id))} where ${i ? "it" : "the truth"} was ${speedText(r.ans.truth.speed)}`))}. Ansatz read ${list(read)}${missed.length ? `, and could not measure ${list(missed)}` : ""}. Watching can say whether; only measuring says by how much.`;

  return {
    pub,
    answers: {
      clips,
      spark: clips.filter((c) => c.spark.verdict === c.truth.verdict).length,
      ansatz: clips.filter((c) => c.ansatz.verdict === c.truth.verdict).length,
      baseline: baselineOf(
        clips.map((c) => c.truth.verdict),
        clips.map((c) => c.spark.verdict),
        rows.map((r) => (quiz.clips.find((c) => c.id === r.pub.id)?.answers ?? []).map((a) => a.verdict)),
      ),
      factor,
      factorLine,
      ...(parityLine ? { parity: parityLine } : {}),
      method: `Muse Spark (${quiz.model}) was shown each clip on this page, the same file, at its own frame rate, with the question above, ${inWords(quiz.n)} times in separate calls, at ${quiz.effort} reasoning effort, on ${date}, for $${quiz.usd.toFixed(2)} in all (that includes an earlier attempt at medium effort, stopped on its second call when an answer ran past 6,000 output tokens). Its answer had to be “real time”, “slowed” or “sped up”, with a factor; its verdict here is the majority. Besides a line giving the frame rate, the only extra words were the scale cue this page shows under a clip: ${list(cues)}; the other clips got none.${toldText} Ansatz’s answer is the run’s clock check: a flagged clock gives its factor; an unflagged one reads real time, with the factor its measured gravity implies, and no error bar when the run’s law misses its unseen frames by more than five times the noise. The tally counts a match with the truth; “could not measure” and a split vote count as misses. The factor row counts a factor within ${Math.round(factor.tol * 100)}% of the truth on the clips that don’t play at real speed, taking Muse Spark’s majority verdict and the median factor of the answers that gave it; a split vote gives no factor.`,
    },
  };
}

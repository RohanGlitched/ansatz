import "server-only";
import { getExperiment, winnerOf } from "@/lib/experiments";
import { isRoughFit, type Experiment } from "@/lib/experiment";
// bundled with the page, so a revalidation on the server never depends on the file being traced
import gymRun from "@/data/strangers/gym-ball-bounce-240fps-b.json";
import sparkQuiz from "@/data/cyt/spark-quiz.json";
import { baselineOf, VERDICTS, type Verdict } from "@/lib/cytScore";

/**
 * "Can you tell?": six real clips, each with what Muse Spark answered to the quiz's own question, what Ansatz measured
 * and the truth. Muse Spark's answers are read from data/cyt/spark-quiz.json (scripts/cyt-spark.ts: the same six files
 * the visitor sees, the same question, five times each). Ansatz's are read from stored runs: the five published records
 * in data/showcase, and the gym ball's second run (data/strangers, copied unchanged from the 2 November probe), which
 * was never published because it missed. The clips are short cuts of the same footage (public/cyt), made with ffmpeg
 * without retiming a frame, and named cyt-1 to cyt-6 so their names give nothing away.
 *
 * The page gets only the public half (CytPublic: files, credits, scale cues). The answers (CytAnswers) are served by
 * /api/cyt and fetched when the reader asks for them, so nothing in the page before that carries the truth.
 */
export type { Verdict };

export type CytPublicClip = {
  id: string;
  src: string;
  poster: string;
  /** a credit that names the maker without giving the answer away */
  credit: { who: string; licence: string; href: string };
  /** the scale cue Muse Spark was given, which the page states too; null when it got none */
  cue: string | null;
};
export type CytPublic = { question: string; n: number; clips: CytPublicClip[] };

export type CytAnswerClip = {
  id: string;
  /** shown with the answers */
  title: string;
  /** the full credit and how the clip on this page was cut from the run's footage */
  source: { credit: string; licence: string; href: string; cut: string; record: string };
  /** null verdict: Muse Spark's answers split evenly (or it was not asked), which scores as a miss */
  spark: { verdict: Verdict | null; said: string; detail?: string; quote?: string };
  /** null when the run could not measure the clock at all */
  ansatz: { verdict: Verdict | null; reading: string; detail?: string; href?: string };
  truth: { verdict: Verdict; factor: string; source: string };
};
export type CytAnswers = {
  clips: CytAnswerClip[];
  spark: number;
  ansatz: number;
  /** what the best constant answer scores, and whether Muse Spark's answers were constant: computed from the data */
  baseline: string;
  /** how Muse Spark was asked: model, date, cue per clip, cost */
  method: string;
};
export type Cyt = { pub: CytPublic; answers: CytAnswers };

type QuizAnswer = { verdict: Verdict; factor: number; reasoning: string; model: string };
type QuizClip = { id: string; cue: string | null; cueWhy: string; answers: QuizAnswer[]; majority: Verdict | null; majorityCount: number };
type Quiz = { model: string; date: string; n: number; question: string; usd: number; clips: QuizClip[] };
const quiz = sparkQuiz as unknown as Quiz;

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
    quote: lead ? firstSentence(lead.reasoning) : undefined,
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
    if (rough) return { verdict: sped ? "sped up" : "slowed", reading: `${fmt(x)}× ${how} than life`, detail: `${xs !== undefined ? `± ${fmt(xs)} statistical; ` : ""}${misses}. ${why}`, href };
    return { verdict: sped ? "sped up" : "slowed", reading: `${fmt(x)}${xs !== undefined ? ` ± ${fmt(xs)}` : ""}× ${how} than life`, detail: why, href };
  }
  if (e.clockCheck && !e.clockCheck.checked) {
    return { verdict: null, reading: "Could not measure", detail: extra ?? e.clockCheck.why, href };
  }
  const g = e.comparisons.find((c) => c.param === "g");
  if (!g) return { verdict: "real time", reading: "Real time", detail: extra, href };
  const moon = g.reference === 1.625;
  const against = `against ${moon ? "the Moon’s 1.625" : `Earth’s ${fmt(g.reference)}`}.`;
  if (rough) return { verdict: "real time", reading: `Real time (no error bar: ${misses})`, detail: extra ?? `g about ${+g.measured.toPrecision(2)} m/s², ${against}`, href };
  const f = Math.sqrt(g.reference / g.measured), s = 0.5 * f * (g.sigma / g.measured);
  return { verdict: "real time", reading: `Real time: ${fmt(f)} ± ${fmt(s)}×`, detail: extra ?? `g = ${fmt(g.measured)} ± ${fmt(g.sigma)} m/s², ${against}`, href };
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
  const gymFilmed = 240; // the frame rate its maker states on Wikimedia Commons
  const gymCal = gym.measured.calibration as { px?: number; sigmaPx?: number };
  const gymLen = gym.observation.reference.real_length_m;
  const NASA = { who: "NASA, Apollo 16, 1972", licence: "Public domain", href: moon.source.page ?? "" };
  const FIZ = { who: "Zátonyi Sándor (ifj.), FizFilm", licence: "CC BY 4.0", href: fou.source.page ?? "" };
  const GYM_PAGE = "https://commons.wikimedia.org/wiki/File:Flummiversuch_(Gymnastikball-R%C3%BCcksteigh%C3%B6he).webm";
  const src = (e: Experiment) => ({ credit: e.source.credit ?? "", licence: e.source.license ?? "", href: e.source.page ?? "" });
  const SPARK = "data/cyt/spark-quiz.json";

  // mixed, so the two copies of one film are never side by side; the ids are the file names, in page order
  const rows: { pub: Omit<CytPublicClip, "src" | "poster" | "cue">; ans: Omit<CytAnswerClip, "id" | "spark"> }[] = [
    {
      pub: { id: "cyt-1", credit: FIZ },
      ans: {
        title: fou5.title,
        source: { ...src(fou5), cut: "6 s from 4 s into the run’s clip, cropped square around the bob", record: `data/showcase/foucault-pendulum-5x.json; Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(fou5),
        truth: { verdict: verdictOf(1 / (fou5S?.truth ?? 5)), factor: `${fou5S?.truth ?? 5}× faster`, source: "The filmmaker sped this stretch up and labelled it on screen. We cropped the label out before the run." },
      },
    },
    {
      pub: { id: "cyt-2", credit: NASA },
      ans: {
        title: "Apollo 16, as broadcast",
        source: { ...src(moon), cut: "5.2 s from 1.2 s into the broadcast, cropped square around John Young", record: `data/showcase/moon-jump.json; Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(moon),
        truth: { verdict: "real time", factor: "Real time", source: "The 1972 television broadcast, as digitised for the Apollo Lunar Surface Journal." },
      },
    },
    {
      pub: { id: "cyt-3", credit: { who: "Rhetos, Mathe-AC Lernwerkstatt Aachen", licence: "CC BY-SA 4.0", href: aachen.source.page ?? "" } },
      ans: {
        title: aachen.title,
        source: { ...src(aachen), cut: "5 s from 2 s into the run’s clip, cropped square", record: `data/showcase/aachen-pendulum-50cm.json; Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(aachen),
        truth: { verdict: "real time", factor: "Real time", source: "The film’s own stopwatch, cropped out before the run, times a swing at about 1.42 s; a 0.5 m pendulum on Earth swings in 1.418 s." },
      },
    },
    {
      pub: { id: "cyt-4", credit: { who: "Rhetos", licence: "CC BY-SA 4.0", href: GYM_PAGE } },
      ans: {
        title: "Gym ball bouncing (not published: a miss)",
        source: { credit: "Rhetos, Flummiversuch (Gymnastikball-Rücksteighöhe)", licence: "CC BY-SA 4.0", href: GYM_PAGE, cut: "the run’s whole 2.5 s clip (3.0 to 5.5 s of the original), cropped square around the ball", record: `data/strangers/gym-ball-bounce-240fps-b.json (the second of two runs; the first, on 1.5 to 5.5 s, also failed to check the clock); Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(
          gym,
          gymCal.px !== undefined && gymCal.sigmaPx !== undefined
            ? `SAM 3.1 held only part of the green ball in a green-lit corridor: ${Math.round(gymCal.px)} ± ${Math.round(gymCal.sigmaPx)} px across for a ball said to be ${Math.round(gymLen * 100)} cm. No law came out with a gravity, so there was nothing to check the clock against.`
            : undefined,
        ),
        truth: { verdict: verdictOf(gymFilmed / gymFps), factor: `${fmt(gymFilmed / gymFps, 1)}× slower`, source: `Filmed at ${gymFilmed} frames a second and stored at ${gymFps}, as its Wikimedia Commons page says.` },
      },
    },
    {
      pub: { id: "cyt-5", credit: NASA },
      ans: {
        title: "Apollo 16, slowed in secret",
        source: { ...src(slowed), cut: "5.2 s from 1.8 s into the slowed copy, cropped square around John Young", record: `data/showcase/moon-jump-slowed.json; Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(slowed, sj ? `From its gravity alone, against the Moon’s. Jump for jump against the broadcast: ${fmt(sj.ratio, 3)} ± ${fmt(sj.sigma, 3)}×.` : undefined),
        truth: { verdict: verdictOf(st?.truth ?? 1.5), factor: `${st?.truth ?? 1.5}× slower`, source: "We slowed the broadcast ourselves, with motion-interpolated frames at an ordinary 29.97 fps, and told no one." },
      },
    },
    {
      pub: { id: "cyt-6", credit: FIZ },
      ans: {
        title: fou.title,
        source: { ...src(fou), cut: "6 s from 12 s into the run’s clip, cropped square around the bob", record: `data/showcase/foucault-pendulum.json; Muse Spark’s answers in ${SPARK}` },
        ansatz: ansatzOf(fou),
        truth: { verdict: "real time", factor: "Real time", source: `The filmmaker published the pendulum’s length and its ${fouT?.truth ?? 6} s swing with the film.` },
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
  const cues = quiz.clips.filter((c) => c.cue).map((c) => `clip ${c.id.slice(4)} “${c.cue!.replace(/\.$/, "")}”`);
  const date = new Date(quiz.date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
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
      method: `Muse Spark (${quiz.model}) was shown each clip on this page, the same file, at its own frame rate, with the question above, ${inWords(quiz.n)} times in separate calls, on ${date}, for $${quiz.usd.toFixed(2)} in all. Its answer had to be “real time”, “slowed” or “sped up”, with a factor; its verdict here is the majority. Besides a line giving the frame rate, the only extra words were the scale cue this page shows under a clip: ${cues.join(", ")}; the other clips got none. Ansatz’s answer is the run’s clock check: a flagged clock gives its factor; an unflagged one reads real time, with the factor its measured gravity implies, and no error bar when the run’s law misses its unseen frames by more than five times the noise. The tally counts a match with the truth; “could not measure” and a split vote count as misses.`,
    },
  };
}

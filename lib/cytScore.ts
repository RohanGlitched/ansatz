/**
 * Scoring helpers for "Can you tell?" (app/cyt.ts), kept free of server-only imports so tests can call them.
 */
export type Verdict = "real time" | "slowed" | "sped up";
export const VERDICTS: Verdict[] = ["real time", "slowed", "sped up"];

const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const inWords = (k: number) => WORDS[k] ?? String(k);

/** The most common answer, or null when two answers tie for most. */
export function majorityOf(vs: Verdict[]): { verdict: Verdict | null; count: number } {
  const counts = VERDICTS.map((v) => ({ v, k: vs.filter((x) => x === v).length })).sort((a, b) => b.k - a.k);
  if (!counts[0].k) return { verdict: null, count: 0 };
  return { verdict: counts[1].k === counts[0].k ? null : counts[0].v, count: counts[0].k };
}

/** The line under the tally: what answering one verdict for every clip scores, and whether Muse Spark did that. */
export function baselineOf(truths: Verdict[], spark: (Verdict | null)[], answers: Verdict[][]): string {
  const n = truths.length;
  const best = VERDICTS.map((v) => ({ v, k: truths.filter((t) => t === v).length })).sort((a, b) => b.k - a.k)[0];
  const first = `Answering “${best.v}” ${inWords(n)} times scores ${best.k} of ${n}.`;
  const all = answers.flat();
  const asked = spark.filter((v): v is Verdict => v !== null);
  if (asked.length === n && asked.every((v) => v === asked[0])) {
    const k = truths.filter((t) => t === asked[0]).length;
    return `${first} Muse Spark’s answers were constant: “${asked[0]}” on all ${inWords(n)} by majority${all.every((v) => v === asked[0]) ? `, and in all ${all.length} of its answers` : ""}, so its ${k} of ${n} is what that constant answer scores.`;
  }
  const by = VERDICTS.map((v) => ({ v, k: spark.filter((s) => s === v).length })).filter((x) => x.k);
  const split = spark.filter((s) => s === null).length;
  const other = all.filter((v) => v !== "real time").length;
  return `${first} Muse Spark’s answers were not constant: by majority it said ${by.map((x) => `${x.v} on ${inWords(x.k)}`).join(", ")}${split ? `, with ${inWords(split)} split` : ""}; ${other} of its ${all.length} answers were not “real time”.`;
}


/**
 * A speed answer: real time, or slowed / sped up by a factor of at least 1 ("sped up 3" is three times faster). The
 * quiz's answers are stored this way; truths and Ansatz's readings are put into the same form with speedOf().
 */
export type Speed = { verdict: Verdict; factor: number };

/** How close a factor must be to count as right on the factor row: within 10% of the truth. */
export const FACTOR_TOL = 0.1;

/** From a slowness (the clock check's factor: above 1 plays slower than life, below 1 faster) to a Speed. */
export function speedOf(slowness: number): Speed {
  if (slowness > 1) return { verdict: "slowed", factor: slowness };
  if (slowness < 1) return { verdict: "sped up", factor: 1 / slowness };
  return { verdict: "real time", factor: 1 };
}

/** Right on the factor: the same direction as the truth, and a factor within tol of it. */
export function factorRight(truth: Speed, read: Speed | null, tol = FACTOR_TOL): boolean {
  if (!read || read.verdict !== truth.verdict) return false;
  if (truth.verdict === "real time") return true;
  return Math.abs(read.factor / truth.factor - 1) <= tol;
}

/** Muse Spark's answer on one clip, for the factor row: its majority verdict, with the median factor of the answers
 * that gave it; a split vote is no answer. */
export function sparkSpeed(answers: Speed[]): Speed | null {
  const m = majorityOf(answers.map((a) => a.verdict));
  if (!m.verdict) return null;
  if (m.verdict === "real time") return { verdict: "real time", factor: 1 };
  const fs = answers.filter((a) => a.verdict === m.verdict).map((a) => a.factor).sort((a, b) => a - b);
  const mid = fs.length % 2 ? fs[(fs.length - 1) / 2] : (fs[fs.length / 2 - 1] + fs[fs.length / 2]) / 2;
  return { verdict: m.verdict, factor: mid };
}

export type FactorClip = { truth: Speed; spark: Speed[]; ansatz: Speed | null };
export type FactorTally = { n: number; spark: number; ansatz: number; sparkAnswers: number; sparkAnswersRight: number; tol: number };

/** The factor row: on the clips that do not play at real speed, who gave the right factor (within tol). */
export function factorTally(clips: FactorClip[], tol = FACTOR_TOL): FactorTally {
  const retimed = clips.filter((c) => c.truth.verdict !== "real time");
  return {
    n: retimed.length,
    spark: retimed.filter((c) => factorRight(c.truth, sparkSpeed(c.spark), tol)).length,
    ansatz: retimed.filter((c) => factorRight(c.truth, c.ansatz, tol)).length,
    sparkAnswers: retimed.reduce((k, c) => k + c.spark.length, 0),
    sparkAnswersRight: retimed.reduce((k, c) => k + c.spark.filter((a) => factorRight(c.truth, a, tol)).length, 0),
    tol,
  };
}

const x2 = (f: number) => `${+f.toPrecision(2)}×`;
/** Distinct factors, smallest first: "2× or 4×", or a range when there are more than two: "5× to 12×". */
const factorsText = (fs: number[]) => {
  const d = [...new Set(fs.map((f) => +f.toPrecision(2)))].sort((a, b) => a - b);
  return d.length > 2 ? `${d[0]}× to ${d.at(-1)}×` : d.map((f) => `${f}×`).join(" or ");
};

/** A range of factors in words: "5× to 12×", or one factor: "3×". */
export function speedRange(fs: number[]): string {
  const d = [...new Set(fs.map((f) => +f.toPrecision(2)))].sort((a, b) => a - b);
  return d.length > 1 ? `${d[0]}× to ${d.at(-1)}×` : d.length ? `${d[0]}×` : "";
}

/** A speed in words: "real time", "5× faster", "1.5× slower". */
export function speedText(s: Speed): string {
  return s.verdict === "real time" ? "real time" : `${x2(s.factor)} ${s.verdict === "slowed" ? "slower" : "faster"}`;
}

/** Every answer to one clip, counted: "2 slowed 2× or 4×, 2 sped up 3×, 1 real time". */
export function answersText(answers: Speed[]): string {
  return VERDICTS.map((v) => ({ v, as: answers.filter((a) => a.verdict === v) }))
    .filter((x) => x.as.length)
    .sort((a, b) => b.as.length - a.as.length)
    .map((x) => `${x.as.length} ${x.v}${x.v === "real time" ? "" : ` ${factorsText(x.as.map((a) => a.factor))}`}`)
    .join(", ");
}

/** Muse Spark's answer on one clip in words, for the sentence after the reveal: its majority with the factors it
 * gave ("2× or 4× slower", "real time"), or the split itself. */
export function sparkSaidText(answers: Speed[]): string {
  const m = majorityOf(answers.map((a) => a.verdict));
  if (!m.verdict) return `a split vote (${answersText(answers)})`;
  if (m.verdict === "real time") return "real time";
  return `${factorsText(answers.filter((a) => a.verdict === m.verdict).map((a) => a.factor))} ${m.verdict === "slowed" ? "slower" : "faster"}`;
}

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


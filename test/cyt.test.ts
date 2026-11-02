import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { answersText, baselineOf, factorRight, factorTally, majorityOf, sparkSaidText, sparkSpeed, speedOf, speedText, type Speed, type Verdict } from "../lib/cytScore";

type Quiz = { n: number; question: string; usd: number; budgetUsd: number; clips: { id: string; truth: Verdict; cue: string | null; answers: { verdict: Verdict; factor: number }[]; majority: Verdict | null; majorityCount: number; right: boolean }[] };
const quiz = JSON.parse(readFileSync("data/cyt/spark-quiz.json", "utf8")) as Quiz;

test("can you tell: the clip files carry neutral names, so a file name gives no answer away", () => {
  const files = readdirSync("public/cyt").sort();
  assert.deepEqual(files, ["cyt-1.mp4", "cyt-1.webp", "cyt-2.mp4", "cyt-2.webp", "cyt-3.mp4", "cyt-3.webp", "cyt-4.mp4", "cyt-4.webp", "cyt-5.mp4", "cyt-5.webp", "cyt-6.mp4", "cyt-6.webp"]);
});

test("can you tell: Muse Spark answered the quiz's own question on all six clips, inside the budget", () => {
  assert.equal(quiz.clips.length, 6);
  assert.match(quiz.question, /real speed, slowed down, or sped up/);
  assert.ok(quiz.usd <= quiz.budgetUsd, `spent ${quiz.usd} of ${quiz.budgetUsd}`);
  for (const c of quiz.clips) {
    assert.equal(c.answers.length, quiz.n, c.id);
    const m = majorityOf(c.answers.map((a) => a.verdict));
    assert.equal(c.majority, m.verdict, c.id);
    assert.equal(c.majorityCount, m.count, c.id);
    assert.equal(c.right, c.majority === c.truth, c.id);
  }
  // the scale cues are the ones the page states: the astronaut's height on both Apollo clips, the string on Aachen
  assert.deepEqual(quiz.clips.map((c) => !!c.cue), [false, true, true, false, true, false]);
});

test("can you tell: the scorer can record a sped-up answer, and a tie is no majority", () => {
  assert.deepEqual(majorityOf(["sped up", "sped up", "real time", "slowed", "sped up"]), { verdict: "sped up", count: 3 });
  assert.deepEqual(majorityOf(["sped up", "sped up", "real time", "real time", "slowed"]), { verdict: null, count: 2 });
});

test("can you tell: the line under the tally says what a constant answer scores and whether Spark's were constant", () => {
  const truths: Verdict[] = ["sped up", "real time", "real time", "slowed", "slowed", "real time"];
  const allReal = baselineOf(truths, Array(6).fill("real time"), Array(6).fill(Array(5).fill("real time")));
  assert.match(allReal, /^Answering “real time” six times scores 3 of 6\. Muse Spark’s answers were constant: “real time” on all six by majority, and in all 30 of its answers, so its 3 of 6/);
  const mixed = baselineOf(truths, ["sped up", "real time", "real time", "real time", "slowed", null], [["sped up"], ["real time"], ["real time"], ["real time"], ["slowed"], ["real time", "slowed"]]);
  assert.match(mixed, /were not constant: by majority it said real time on three, slowed on one, sped up on one, with one split; 3 of its 7 answers were not “real time”\./);
});

test("can you tell: the factor row scores a factor within 10% of the truth on the retimed clips only", () => {
  // the right direction and within 10%; a wrong direction or a factor 17% off is wrong; real time needs no factor
  assert.equal(factorRight({ verdict: "sped up", factor: 5 }, speedOf(1 / 4.97)), true);
  assert.equal(factorRight({ verdict: "slowed", factor: 1.5 }, speedOf(1.5)), true);
  assert.equal(factorRight({ verdict: "slowed", factor: 4.8 }, { verdict: "slowed", factor: 4 }), false);
  assert.equal(factorRight({ verdict: "sped up", factor: 5 }, { verdict: "sped up", factor: 3 }), false);
  assert.equal(factorRight({ verdict: "slowed", factor: 1.5 }, null), false);
  // Muse Spark's factor is the median of the answers behind its majority; a split gives none
  assert.deepEqual(sparkSpeed([{ verdict: "slowed", factor: 2 }, { verdict: "slowed", factor: 4 }, { verdict: "slowed", factor: 4 }, { verdict: "slowed", factor: 2 }, { verdict: "real time", factor: 1 }]), { verdict: "slowed", factor: 3 });
  assert.equal(sparkSpeed([{ verdict: "sped up", factor: 3 }, { verdict: "sped up", factor: 3 }, { verdict: "real time", factor: 1 }, { verdict: "slowed", factor: 4 }, { verdict: "slowed", factor: 2 }]), null);
});

test("can you tell: on the stored answers, the factor row is Muse Spark 0 of 3 and Ansatz 2 of 3", () => {
  // truth per clip (cyt-1 sped up 5x by its maker, cyt-4 filmed at 240 fps and stored at 50, cyt-5 slowed 1.5x by us);
  // Ansatz's readings from the runs' clock checks (cyt-4: could not measure)
  const truth: Record<string, Speed> = { "cyt-1": speedOf(1 / 5), "cyt-2": speedOf(1), "cyt-3": speedOf(1), "cyt-4": speedOf(240 / 50), "cyt-5": speedOf(1.5), "cyt-6": speedOf(1) };
  const fou5 = JSON.parse(readFileSync("data/showcase/foucault-pendulum-5x.json", "utf8")) as { clock: { factor: number } };
  const slowed = JSON.parse(readFileSync("data/showcase/moon-jump-slowed.json", "utf8")) as { clock: { factor: number } };
  const ansatz: Record<string, Speed | null> = { "cyt-1": speedOf(fou5.clock.factor), "cyt-2": speedOf(1), "cyt-3": speedOf(1), "cyt-4": null, "cyt-5": speedOf(slowed.clock.factor), "cyt-6": speedOf(1) };
  const spark = (id: string) => quiz.clips.find((c) => c.id === id)!.answers.map((a) => ({ verdict: a.verdict, factor: a.verdict === "real time" ? 1 : a.factor }));
  const t = factorTally(Object.keys(truth).map((id) => ({ truth: truth[id], spark: spark(id), ansatz: ansatz[id] })));
  assert.deepEqual({ n: t.n, spark: t.spark, ansatz: t.ansatz, of: t.sparkAnswers, right: t.sparkAnswersRight }, { n: 3, spark: 0, ansatz: 2, of: 15, right: 0 });
  // the words the sentence after the reveal is built from
  assert.equal(sparkSaidText(spark("cyt-1")), "a split vote (2 slowed 2× or 4×, 2 sped up 3×, 1 real time)");
  assert.equal(sparkSaidText(spark("cyt-4")), "2× or 4× slower");
  assert.equal(sparkSaidText(spark("cyt-5")), "real time");
  assert.equal(answersText(spark("cyt-4")), "4 slowed 2× or 4×, 1 real time");
  assert.equal(speedText(truth["cyt-4"]), "4.8× slower");
});

test("the Aachen page's lede quotes the record's own g, error bar and percentage", () => {
  const e = JSON.parse(readFileSync("data/showcase/aachen-pendulum-50cm.json", "utf8")) as { headline: string; comparisons: { param: string; measured: number; sigma: number; errorPct: number }[] };
  const g = e.comparisons.find((c) => c.param === "g")!;
  assert.ok(e.headline.includes(`g = ${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s²`), e.headline);
  assert.ok(e.headline.includes(`${Math.abs(g.errorPct).toFixed(2)}%`), e.headline);
});

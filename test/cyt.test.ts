import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { baselineOf, majorityOf, type Verdict } from "../lib/cytScore";

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

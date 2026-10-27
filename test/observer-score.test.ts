import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fromRender, iou, nameMatches, rulerCat, samCalls, colourOf } from "../scripts/observer-score";
import type { Experiment } from "../lib/experiment";

const truthOf = (id: string) => JSON.parse(readFileSync(`bench/synth/clips/${id}.json`, "utf8"));

test("observer score: the free-motion window is release to impact, in video seconds", () => {
  const t = fromRender(truthOf("ff03_moon_yellow_ball"));
  assert.ok(Math.abs(t.window!.start - 0.6) < 1e-9 && Math.abs(t.window!.end - 2.057) < 1e-3);
  const slowed = fromRender(truthOf("sm01_bounce_240fps_x8"));
  assert.ok(Math.abs(slowed.window!.start - 0.96) < 1e-9, "physics times are multiplied by the slow-motion factor");
  assert.equal(slowed.slow, 8);
});

test("observer score: IoU", () => {
  assert.equal(iou({ start: 0, end: 2 }, { start: 1, end: 2 }), 0.5);
  assert.equal(iou({ start: 0, end: 1 }, { start: 2, end: 3 }), 0);
});

test("observer score: subject matching needs colour and kind, and is lenient on synonyms", () => {
  const block = fromRender(truthOf("sp01_k25_m0.20_b0.35")).objects[0]; // a green weight (a block on a spring)
  assert.deepEqual(nameMatches("green mass", block), { kind: true, colour: true });
  assert.equal(nameMatches("red block", block).colour, false);
  assert.equal(nameMatches("green dog", block).kind, false);
  const bob = fromRender(truthOf("pe01_small_8deg_L0.60")).objects[0]; // colour from the render's RGB
  assert.equal(bob.colour, "red");
  assert.ok(nameMatches("red ball", bob).kind);
  const paper = fromRender(truthOf("pd02_earth_paper_ball_k0.45")).objects[0];
  assert.ok(nameMatches("off-white ball", paper).colour);
  assert.equal(colourOf([20, 165, 170]), "teal");
});

test("observer score: reference kinds", () => {
  assert.equal(rulerCat("black-and-white striped bar"), "stick");
  assert.equal(rulerCat("white paper"), "paper");
  assert.equal(rulerCat("yellow ball"), "ball");
});

test("observer score: ledger fallbacks are read the way experiment.ts writes them", () => {
  const mk = (subject: string, ruler: string | null, purposes: string[], trackedNoun: string) =>
    ({
      observation: { subjects: [{ noun_phrase: subject }], reference: { present: !!ruler, noun_phrase: ruler ?? "" } },
      ledger: { calls: purposes.map((purpose) => ({ purpose })) },
      tracking: { noun: trackedNoun, tracks: 1 },
    }) as unknown as Experiment;
  const clean = samCalls(mk("yellow ball", "white paper", ['track "white paper"', 'track "yellow ball"'], "yellow ball"));
  assert.equal(clean.firstNoun, true);
  assert.equal(clean.rulerFoundByName, true);
  const retry = samCalls(mk("yellow ball", null, ['track "yellow ball"', 'track "ball"'], "ball"));
  assert.equal(retry.firstNoun, false);
  assert.equal(retry.altRetries, 1);
  const pointed = samCalls(mk("blue ball", null, ['track "blue ball"', 'point at "blue ball"', "track pointed objects"], "blue ball (pointed out by Muse Spark)"));
  assert.equal(pointed.firstNoun, false);
  assert.equal(pointed.subjectPointedAt, true);
  // a ruler found by Muse Spark pointing at it is not a subject fallback
  const rulerPoint = samCalls(mk("green ball", "striped scale bar", ['track "striped scale bar"', 'point at "striped scale bar"', 'track "green ball"', "track pointed objects"], "green ball"));
  assert.equal(rulerPoint.firstNoun, true);
  assert.equal(rulerPoint.rulerFoundByName, false);
});

test("observer score: the written file agrees with itself", { skip: !existsSync("data/bench/observer.json") }, () => {
  const o = JSON.parse(readFileSync("data/bench/observer.json", "utf8"));
  assert.equal(o.rows.length, o.summary.runs);
  assert.ok(o.summary.subjectRight <= o.summary.subjectScored);
  assert.ok(o.summary.rulerLengthRight <= o.summary.rulerPicked && o.summary.rulerPicked <= o.summary.rulerNeeded);
  assert.equal(o.summary.naiveWouldFail, o.rows.filter((r: { naive: { wouldFail: boolean } }) => r.naive.wouldFail).length);
});

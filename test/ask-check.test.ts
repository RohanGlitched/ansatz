import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAnswer, NOT_IN_RECORD, parseNumber, resolvePath } from "../lib/askcheck";
import { strictable } from "../lib/meta/client";
import { ASK_SCHEMA } from "../lib/askcheck";

const record = {
  experiment: "Ball toss",
  winning_law: { title: "Vacuum", constants: { g: { value: 9.793, sigma: 0.042, unit: "m/s²" }, k: { value: 0.00037, sigma: 0.00002 } } },
  trial: [{ rank: 1, unseen_miss: 0.0123 }, { rank: 2, unseen_miss: 0.456 }],
  train_fraction: 0.7,
};

test("paths are read from the root of the record, with dots and indexes", () => {
  assert.equal(resolvePath(record, "winning_law.constants.g.value"), 9.793);
  assert.equal(resolvePath(record, "trial[1].unseen_miss"), 0.456);
  assert.equal(resolvePath(record, "$.trial[0].rank"), 1);
  assert.equal(resolvePath(record, "winning_law.constants.h.value"), undefined);
  assert.equal(resolvePath(record, "trial[5].rank"), undefined);
  assert.equal(resolvePath(record, "__proto__.constructor"), undefined);
  assert.equal(resolvePath(record, ""), undefined);
});

test("numbers are parsed with scientific notation and a rounding unit", () => {
  assert.equal(parseNumber("3.7e-4")!.value, 0.00037);
  assert.equal(parseNumber("3.7 × 10^-4")!.value, 0.00037);
  assert.equal(parseNumber("3.7 × 10⁻⁴")!.value, 0.00037);
  assert.equal(parseNumber("−0.5")!.value, -0.5);
  assert.equal(parseNumber("1,234.5")!.value, 1234.5);
  assert.equal(parseNumber("70%")!.pct, true);
  assert.equal(parseNumber("nine"), null);
  assert.ok(Math.abs(parseNumber("3.7e-4")!.unit - 1e-5) < 1e-18);
});

test("a number with a verified quote stays; one without is replaced", () => {
  const text = "Gravity came out at 9.79 ± 0.04 m/s², and the drag term is 3.7e-4. The unseen miss was 0.5 m.";
  const out = checkAnswer(text, [
    { path: "winning_law.constants.g.value", value: "9.79" },
    { path: "winning_law.constants.g.sigma", value: "0.04" },
    { path: "winning_law.constants.k.value", value: "3.7e-4" },
    { path: "trial[0].unseen_miss", value: "0.5" }, // the record holds 0.0123 there
  ], record);
  assert.equal(out.verified, 3);
  assert.equal(out.replaced, 1);
  assert.equal(out.answer, `Gravity came out at 9.79 ± 0.04 m/s², and the drag term is 3.7e-4. The unseen miss was ${NOT_IN_RECORD} m.`);
});

test("a quote counts only at its own path, within rounding", () => {
  // 9.79 is in the record, but the quote points at a different path
  const wrongPath = checkAnswer("It is 9.79.", [{ path: "trial[0].unseen_miss", value: "9.79" }], record);
  assert.equal(wrongPath.verified, 0);
  assert.equal(wrongPath.answer, `It is ${NOT_IN_RECORD}.`);
  // a path that leads nowhere verifies nothing
  assert.equal(checkAnswer("It is 9.79.", [{ path: "winning_law.constants.q.value", value: "9.79" }], record).replaced, 1);
  // rounded to two significant figures is fine; a different number is not
  assert.equal(checkAnswer("g = 9.8", [{ path: "winning_law.constants.g.value", value: "9.8" }], record).replaced, 0);
  assert.equal(checkAnswer("g = 9.9", [{ path: "winning_law.constants.g.value", value: "9.9" }], record).replaced, 1);
  // the number in the text must be the one quoted
  assert.equal(checkAnswer("g = 9.80", [{ path: "winning_law.constants.g.value", value: "9.79" }], record).replaced, 1);
  // a quote with no number in it, or garbage, is ignored without throwing
  const junk = checkAnswer("g = 9.79", [{ path: "winning_law.constants.g.value", value: "about ten" }, null as never, { path: 3 as never, value: "1" }], record);
  assert.equal(junk.verified, 0);
});

test("small integers, years, model names and percentages of the record are left alone", () => {
  const text = "Rank 1 of 4 laws, filmed in 2026, tracked by SAM 3.1 and Muse Spark 1.3; fitted to the first 70% of frames.";
  const out = checkAnswer(text, [{ path: "train_fraction", value: "70%" }], record);
  assert.equal(out.answer, text);
  assert.equal(out.replaced, 0);
  // a number above ten is not exempt, even as an integer
  assert.equal(checkAnswer("There were 120 frames.", [], record).answer, `There were ${NOT_IN_RECORD} frames.`);
});

test("scientific notation in the text is read as one number", () => {
  const out = checkAnswer("The drag is 3.7 × 10^-4 and the noise 2e-5.", [{ path: "winning_law.constants.k.value", value: "0.00037" }], record);
  assert.equal(out.replaced, 1);
  assert.equal(out.answer, `The drag is 3.7 × 10^-4 and the noise ${NOT_IN_RECORD}.`);
});

test("the ask schema is strict", () => {
  assert.equal(strictable(ASK_SCHEMA), true);
});

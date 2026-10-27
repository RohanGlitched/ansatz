import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fmtDate, fmtPair, fmtParam, fmtProse, fmtSignedPct } from "../lib/format";
import { dampingTie, tied } from "../lib/tie";
import { seriesPoint } from "../lib/seriesfit";
import type { Experiment } from "../lib/experiment";

const show = (id: string) => JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;
const winner = (e: Experiment) => e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
const paramsOf = (e: Experiment) => {
  const w = winner(e);
  return Object.fromEntries(w.law.params.map((p) => [p.name, { v: w.fit.theta[p.name], s: w.fit.sigma[p.name] }]));
};

test("fmtPair: the error to two figures, the value to the same place", () => {
  assert.equal(fmtPair(1.71615, 0.11378), "1.72 ± 0.11");
  assert.equal(fmtPair(0.7999478, 0.0021), "0.7999 ± 0.0021");
  assert.equal(fmtPair(4012.4, 17.2), "4012 ± 17");
  assert.equal(fmtPair(9.81, NaN), "9.81");
});

test("fmtParam: given, not determined and measured are three different statements", () => {
  assert.equal(fmtParam(9.807, 0, true), "9.807 (given)");
  assert.match(fmtParam(0.0306, NaN), /^about 0\.0306, fitted; not determined by these frames$/);
  assert.equal(fmtParam(1.71615, 0.11378), "1.72 ± 0.11");
  // a fitted constant with no error bar is never called given
  assert.doesNotMatch(fmtParam(0.5, NaN, false), /given/);
});

test("fmtProse: a model's pair is rewritten to the fitted value and error", () => {
  const big = show("big-swing");
  const out = fmtProse(big.finding, paramsOf(big));
  assert.match(out, /0\.7999 ± 0\.0021 m/);
  assert.doesNotMatch(out, /\b0\.8 ± 0\.0021\b/);
  const moon = show("moon-jump");
  assert.match(fmtProse(moon.finding, paramsOf(moon)), /1\.72 ± 0\.11 m\/s²/);
  // with nothing to match, digits finer than the error are dropped and nothing is padded
  assert.equal(fmtProse("rest at 99.03312 ± 0.026 px"), "rest at 99.033 ± 0.026 px");
  assert.equal(fmtProse("g = 9.81 ± 0.2"), "g = 9.81 ± 0.2");
});

test("every showcase finding, once formatted, shows no digit finer than its error bar", () => {
  for (const f of JSON.parse(readFileSync("data/showcase/order.json", "utf8")) as string[]) {
    const e = show(f);
    const text = fmtProse(`${e.headline ?? ""} ${e.finding}`, paramsOf(e));
    for (const m of text.matchAll(/(\d+(?:\.(\d+))?)\s*±\s*(\d+(?:\.(\d+))?)/g)) {
      const dv = m[2]?.length ?? 0, ds = m[4]?.length ?? 0;
      assert.ok(dv <= Math.max(ds, 0) || Number(m[3]) >= 1, `${f}: "${m[0]}"`);
    }
  }
});

test("dates read as 10 November 2026; signed percentages use a true minus", () => {
  assert.equal(fmtDate("2026-11-10T00:00:00Z"), "10 November 2026");
  assert.equal(fmtSignedPct(-4.12), "−4.1%");
  assert.equal(fmtSignedPct(0.026, 3), "+0.026%");
});

test("demo class: g from Ansatz's period and the tape length lands within 0.1% of 9.81", () => {
  const tape: Record<string, number> = { "pendulum-40cm": 0.4, "pendulum-60cm": 0.6, "pendulum-80cm": 0.8, "pendulum-100cm": 1.0 };
  for (const [id, L] of Object.entries(tape)) {
    const e = show(id);
    const p = seriesPoint(e, winner(e), L);
    assert.ok(p && p.lengthFrom === "tape", id);
    assert.ok(Math.abs(p!.g / 9.80665 - 1) < 0.001, `${id}: ${p!.g}`);
  }
});

test("damping ties: linear and quadratic tie on the 40 cm run; the 70° swing has a clear winner", () => {
  assert.match(dampingTie(show("pendulum-40cm")) ?? "", /linear and quadratic tie/);
  assert.equal(dampingTie(show("big-swing")), null);
  const moon = show("moon-jump");
  const [a, b] = moon.candidates;
  assert.ok(tied(a.fit, b.fit), "the Moon's top two laws tie");
  assert.equal(dampingTie(moon), null, "a tie that isn't between damping forms is not a damping tie");
});

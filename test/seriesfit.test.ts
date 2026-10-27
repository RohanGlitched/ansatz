import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Experiment } from "../lib/experiment";
import { fitSeries, seriesPoint, stopwatch } from "../lib/seriesfit";
import { fullLibrary } from "../lib/physics/library-full";

const s = JSON.parse(readFileSync("data/series/pendulum-lengths.json", "utf8")) as { ids: string[]; tape: Record<string, number>; truth: { g: number; lengths: number[] } };
const runs = s.ids.map((id) => JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment);
const win = (e: Experiment) => e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];

test("the example series: tape lengths with measured periods give g within 0.1%; the sheet alone stays as published", () => {
  const tape = fitSeries(runs.map((e) => seriesPoint(e, win(e), s.tape[e.id])!));
  assert.ok(Math.abs(tape.g - s.truth.g) / s.truth.g < 0.001, `tape g ${tape.g}`);
  assert.equal(tape.sgShared, 0);
  const sheet = fitSeries(runs.map((e) => seriesPoint(e, win(e))!));
  assert.equal(sheet.g.toFixed(2), "9.52");
  assert.equal(sheet.sgShared.toFixed(2), "0.57");
  // the period is a time: the same with either length
  for (const e of runs) assert.equal(seriesPoint(e, win(e), 0.5)!.T, seriesPoint(e, win(e))!.T);
});

test("periods carry their statistical error only, never a printed ±0", () => {
  for (const e of runs) {
    const p = seriesPoint(e, win(e), s.tape[e.id])!;
    assert.ok(p.sT > 0 && p.sT / p.T < 0.001, `${e.id}: σT ${p.sT}`);
  }
});

test("stopwatch estimate: 20 swings, 0.2 s reaction, a 1.42 s period gives 0.7% in T and 1.4% in g", () => {
  const w = stopwatch(1.42);
  assert.equal((w.relT * 100).toFixed(1), "0.7");
  assert.equal((w.relG * 100).toFixed(1), "1.4");
});

test("the textbook library names Duffing and Coulomb springs, and a fall said to be a flight gets flight laws", () => {
  const t = Array.from({ length: 50 }, (_, i) => i / 30);
  const spring = fullLibrary({ t, ch: { s: t.map((x) => Math.cos(6 * x)) } }, { g: 9.81, gFixed: false }).map((l) => l.id);
  assert.ok(spring.includes("lib-duffing") && spring.includes("lib-coulomb"), spring.join());
  const fall = { t, ch: { y: t.map((x) => -4.9 * x * x), s: t.map((x) => 4.9 * x * x) } };
  assert.ok(fullLibrary(fall, { g: 9.81, gFixed: true }).every((l) => !l.id.includes("vacuum")), "untyped: the 1-D path laws, as before");
  assert.ok(fullLibrary(fall, { g: 9.81, gFixed: true, type: "flight" }).some((l) => l.id === "lib-vacuum"));
  const swing = fullLibrary({ t, ch: { theta: t.map((x) => 0.1 * Math.cos(4 * x)) } }, { g: 9.81, gFixed: false, pendulumG: 9.80665 });
  assert.ok(swing.every((l) => l.params.some((p) => p.name === "L" && !p.fixed) && l.params.some((p) => p.name === "g" && p.fixed)));
});

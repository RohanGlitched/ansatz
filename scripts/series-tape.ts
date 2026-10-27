// The example pendulum series two ways, offline from the stored runs (no model calls): lengths from the A4 sheet in view
// (no tape), and lengths from a tape (here the renders' true lengths, 0.40/0.60/0.80/1.00 m) with each run's measured
// period. Also the stopwatch comparison. Writes data/bench/pendulum-stopwatch.json for /judges.
// usage: tsx scripts/series-tape.ts
import { readFileSync, writeFileSync } from "node:fs";
import type { Experiment } from "../lib/experiment";
import { fitSeries, seriesPoint, stopwatch, STOPWATCH, TAPE_SIGMA_M } from "../lib/seriesfit";

const s = JSON.parse(readFileSync("data/series/pendulum-lengths.json", "utf8")) as { ids: string[]; tape?: Record<string, number>; truth: { g: number; lengths: number[] } };
const runs = s.ids.map((id) => JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment);
const win = (e: Experiment) => e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
const sheet = runs.map((e) => seriesPoint(e, win(e))!);
const tape = runs.map((e, i) => seriesPoint(e, win(e), s.tape?.[e.id] ?? s.truth.lengths[i])!);
const A = fitSeries(sheet), B = fitSeries(tape);
const off = (g: number) => ((g - s.truth.g) / s.truth.g) * 100;
console.log(`sheet: g = ${A.g.toFixed(3)} ± ${A.sg.toFixed(3)} ± ${A.sgShared.toFixed(3)} (${off(A.g).toFixed(2)}%)`);
console.log(`tape:  g = ${B.g.toFixed(4)} ± ${B.sg.toFixed(4)} (scatter); tape readings alone ±${B.sgTape.toFixed(4)} (${off(B.g).toFixed(3)}%)`);
const rows = tape.map((p, i) => {
  const sw = stopwatch(p.T);
  return { id: p.id, L: p.L, T: +p.T.toFixed(5), sTms: +(p.sT * 1000).toFixed(3), relTpct: +((p.sT / p.T) * 100).toFixed(4), g: +p.g.toFixed(4), sg: +p.sg.toFixed(4), gSheet: +sheet[i].g.toFixed(3), stopwatch: { sTms: +(sw.sT * 1000).toFixed(1), relTpct: +(sw.relT * 100).toFixed(2), relGpct: +(sw.relG * 100).toFixed(2) } };
});
for (const r of rows) console.log(r.id.padEnd(16), `T ${r.T.toFixed(4)} ± ${r.sTms.toFixed(2)} ms (${r.relTpct}%)  g(tape) ${r.g.toFixed(3)} ± ${r.sg.toFixed(3)}  g(sheet) ${r.gSheet}  stopwatch ±${r.stopwatch.sTms} ms (${r.stopwatch.relTpct}% T, ${r.stopwatch.relGpct}% g)`);
const relT = rows.map((r) => r.relTpct);
writeFileSync(
  "data/bench/pendulum-stopwatch.json",
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      series: "pendulum-lengths",
      sheet: { g: A.g, sgScatter: A.sg, sgShared: A.sgShared, offPct: off(A.g) },
      tape: { g: B.g, sgScatter: B.sg, sgTape: B.sgTape, offPct: off(B.g), tapeSigmaM: TAPE_SIGMA_M },
      rows,
      ansatzRelTpct: { min: Math.min(...relT), max: Math.max(...relT) },
      stopwatch: { ...STOPWATCH, at: "T = 1.42 s (a 50 cm string)", relTpct: +(stopwatch(1.42).relT * 100).toFixed(2), relGpct: +(stopwatch(1.42).relG * 100).toFixed(2), note: "a typical-reaction-time estimate (0.2 s spread over 20 swings), not a measurement" },
      note: "Lengths from a tape are the renders' true lengths (0.40, 0.60, 0.80, 1.00 m), read to ±2 mm by assumption; each period is the stored run's fitted ω₀ (T = 2π/ω₀, the small-swing period, as in the textbook formula), its σ the fit's statistical error with the ruler's share removed. The renders are cleaner than phone footage, so real periods will be less precise than these.",
    },
    null,
    1,
  ),
);
console.log("wrote data/bench/pendulum-stopwatch.json");

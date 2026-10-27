// Muse Spark's best law against the full textbook library, on every stored benchmark run (fits only, no model calls)
// usage: tsx scripts/ablation.ts [--runs bench/runs/synth] [--out data/bench/ablation.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fitWithRoom, rankCandidates, withScaleCorrection, type Candidate, type Experiment } from "../lib/experiment";
import { fullLibrary } from "../lib/physics/library-full";
process.env.FIT_STARTS ??= "4";
const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const dir = opt("--runs", "bench/runs/synth");
const out = opt("--out", "data/bench/ablation.json");
const rows: unknown[] = [];
let beat = 0, tie = 0, lost = 0, none = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
  const e = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")) as Experiment;
  const gUsed = e.measured.calibration.kind === "gravity" ? e.measured.calibration.g : null;
  const lib: Candidate[] = fullLibrary(e.measured.series, { g: gUsed ?? 9.81, gFixed: gUsed !== null }).map((l) => {
    const r = fitWithRoom(l, e.measured.series, gUsed !== null ? withScaleCorrection : undefined);
    return { law: r.law, fitted: r.fitted, fit: r.fit, origin: "control", rank: 0 };
  });
  // Spark's laws refitted with the very same fitter, so both sides are scored alike
  const muse: Candidate[] = e.candidates.filter((c) => c.origin !== "control").map((c) => {
    const inner = { ...c.law, params: c.law.params.filter((p) => p.name !== "cal") };
    const r = fitWithRoom(inner, e.measured.series, gUsed !== null ? withScaleCorrection : undefined);
    return { ...c, law: r.law, fitted: r.fitted, fit: r.fit };
  });
  if (!muse.length || !lib.length) { none++; continue; }
  const all = [...muse, ...lib];
  rankCandidates(all, 0);
  const score = (c: Candidate) => Math.max(c.fit.testZ ?? Infinity, c.fit.trainZ ?? 0);
  const bm = Math.min(...muse.map(score)), bl = Math.min(...lib.map(score));
  const tied = Math.max(bm, bl) < 1.5 || Math.abs(bm - bl) < Math.max(0.1 * Math.max(bm, bl), 0.5);
  const verdict = tied ? "tie" : bm < bl ? "spark" : "library";
  if (verdict === "tie") tie++; else if (verdict === "spark") beat++; else lost++;
  rows.push({ id: f.replace(".json", ""), verdict, spark: +bm.toFixed(2), library: +bl.toFixed(2), sparkLaw: muse.sort((a, b) => score(a) - score(b))[0].law.title, libraryLaw: lib.sort((a, b) => score(a) - score(b))[0].law.title, winner: all[0].law.title, winnerOrigin: all[0].origin });
  console.log(f.padEnd(40), verdict.padEnd(8), bm.toFixed(2), bl.toFixed(2));
}
const summary = { clips: rows.length, sparkBetter: beat, tied: tie, libraryBetter: lost, skipped: none };
console.log(summary);
writeFileSync(out, JSON.stringify({ summary, rows }, null, 1));

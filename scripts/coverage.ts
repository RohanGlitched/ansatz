// Monte Carlo calibration of the fitter's error bars: synthetic tracks with known truth, white and AR(0.8) noise
// (plus a white + AR(0.8) mixture as a robustness check), fitted by the real fitter. Offline: no model calls.
// usage: tsx scripts/coverage.ts [--trials 400] [--out data/bench/coverage.json]
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { COVARIANCE } from "../lib/physics/law";
import { coverage } from "../lib/stats/coverage";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const trials = Number(opt("--trials", "400"));
const out = opt("--out", "data/bench/coverage.json");

const t0 = Date.now();
const all = coverage({ trials, noises: ["white", "ar0.8", "mixed"] });
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
for (const [m, rows] of Object.entries(all)) for (const r of rows) console.log(`${m.padEnd(13)} ${r.law.padEnd(18)} ${r.noise.padEnd(6)} 1σ ${pct(r.coverage1σ)}  2σ ${pct(r.coverage2σ)}  mean|pull| ${r.meanAbsPull.toFixed(2)}`);

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({
  generatedAt: new Date().toISOString(),
  method: COVARIANCE,
  about: "Each case fits the same synthetic track family many times with the real fitter (first 70% of frames); coverage is the share of fits whose ±1σ / ±2σ interval holds the truth (68.3% / 95.4% if calibrated); pulls are (fit − truth)/σ. 'mixed' noise is half white, half AR(0.8) by variance, a check on noise that is not AR(1).",
  trials,
  seconds: Math.round((Date.now() - t0) / 1000),
  cases: all[COVARIANCE],
  comparison: Object.entries(all).map(([method, rows]) => ({ method, rows: rows.map(({ pulls: _p, ...r }) => r) })),
}, null, 1));
console.log("wrote", out);

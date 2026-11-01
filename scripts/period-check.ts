// usage: tsx scripts/period-check.ts
// The sped-up Foucault film's speed-up read with no law at all: the swing's period from the up-crossings of the stored
// distance-along-the-line series (lib/period.ts), against the period an 8.97 m pendulum has at standard gravity, and
// against the same film's real-time stretch (whose ratio needs neither the length nor g). Stores the result in the
// record's extras.periodCheck, splits the speed-up's ± into its two parts on the truth row (the fit's own statistical
// part and the 1% assumed on the stated length), and rewrites the record's clock-check sentence to say so. No model call.
import { readFileSync, writeFileSync } from "node:fs";
import { zeroCrossingPeriod } from "../lib/period";
import type { Experiment } from "../lib/experiment";

const FAST = "data/showcase/foucault-pendulum-5x.json", REAL = "data/showcase/foucault-pendulum.json";
const G0 = 9.80665, L = 8.97, LENGTH_REL = 0.01;
const fast = JSON.parse(readFileSync(FAST, "utf8")) as Experiment;
const real = JSON.parse(readFileSync(REAL, "utf8")) as Experiment;
if (!fast.given.some((g) => /8\.97 m/.test(g))) throw new Error("the 5× record was not told 8.97 m");

const pf = zeroCrossingPeriod(fast.measured.series.t, fast.measured.series.ch.s)!;
const pr = zeroCrossingPeriod(real.measured.series.t, real.measured.series.ch.s)!;
const tIdeal = 2 * Math.PI * Math.sqrt(L / G0);
const speedup = tIdeal / pf.period;
const sameFilm = pr.period / pf.period;
const sameFilmSigma = sameFilm * Math.hypot(pr.sigma / pr.period, pf.sigma / pf.period);

const row = fast.extras!.truth!.rows.find((r) => r.param === "speedup")!;
const win = fast.candidates.find((c) => c.law.id === fast.winner)!;
const gFit = fast.comparisons.find((c) => c.param === "g")!;
// the speed-up is √(g / 9.807): half of g's relative σ, split into the fit's own and the stated length's 1%
const sigmaFit = 0.5 * row.measured * (win.fit.sigma.g / gFit.measured);
const sigmaAssumed = 0.5 * row.measured * LENGTH_REL;
Object.assign(row, { sigmaFit: +sigmaFit.toFixed(5), sigmaAssumed: +sigmaAssumed.toFixed(5) });

const r = (x: number, d: number) => +x.toFixed(d);
fast.extras!.periodCheck = {
  channel: "s",
  period: r(pf.period, 6),
  sigma: r(pf.sigma, 6),
  crossings: pf.crossings,
  residualMs: r(pf.residualMs, 2),
  lengthM: L,
  idealPeriod: r(tIdeal, 5),
  speedup: r(speedup, 4),
  speedupSigmaPeriod: r((speedup * pf.sigma) / pf.period, 5),
  speedupSigmaAssumed: r(0.5 * speedup * LENGTH_REL, 4),
  fit: { speedup: r(row.measured, 4), sigmaFit: r(sigmaFit, 5), sigmaAssumed: r(sigmaAssumed, 4) },
  realTime: { period: r(pr.period, 4), sigma: r(pr.sigma, 4), crossings: pr.crossings, overIdealPct: r((pr.period / tIdeal - 1) * 100, 2) },
  sameFilm: { ratio: r(sameFilm, 4), sigma: r(sameFilmSigma, 4) },
  note: `The speed-up is a frequency ratio, so it does not depend on the law. With no law at all, the ${pf.crossings} upward crossings of the swing's mean line in the stored distance-along-the-line series fall on a straight line in time to ${pf.residualMs.toFixed(1)} ms: the period is ${pf.period.toFixed(5)} ± ${pf.sigma.toFixed(5)} s. An 8.97 m pendulum at standard gravity swings in 2π√(8.97 / 9.80665) = ${tIdeal.toFixed(4)} s, so the clip plays ${speedup.toFixed(3)}× faster than life (the fit's law gives ${row.measured.toFixed(3)}×). Its uncertainty is almost all the stated length: ± ${(0.5 * speedup * LENGTH_REL).toFixed(3)} if the 8.97 m is good to 1%, against ± ${((speedup * pf.sigma) / pf.period).toFixed(4)} from the period (the fit alone gives ± ${sigmaFit.toFixed(4)}). The same film's real-time stretch, timed the same way (${pr.crossings} crossings), swings in ${pr.period.toFixed(3)} ± ${pr.sigma.toFixed(3)} s, ${((pr.period / tIdeal - 1) * 100).toFixed(2)}% longer than 2π√(8.97 / 9.80665), as if the pendulum were about ${(((pr.period / tIdeal) ** 2 - 1) * 100).toFixed(1)}% longer than stated; the ratio of the two periods, which needs neither the length nor g, is ${sameFilm.toFixed(3)} ± ${sameFilmSigma.toFixed(3)}. Computed by scripts/period-check.ts from the stored series; no model call.`,
};
fast.clockCheck = {
  checked: true,
  why: `Clock checked: gravity came out 25× too strong, so the clip plays faster than life. The speed-up is a frequency ratio and does not depend on the law: the swing's period, ${pf.period.toFixed(5)} ± ${pf.sigma.toFixed(5)} s from ${pf.crossings} zero crossings with no law at all, against the ${tIdeal.toFixed(3)} s of an 8.97 m pendulum, gives ${speedup.toFixed(3)}× (the fit gives ${row.measured.toFixed(3)}×). Its ± ${sigmaAssumed.toFixed(3)} is the 1% assumed on the stated 8.97 m length; the statistical part is ± ${sigmaFit.toFixed(4)} from the fit, ± ${((speedup * pf.sigma) / pf.period).toFixed(4)} from the crossings.`,
};
// stored minified, as every showcase record is
writeFileSync(FAST, JSON.stringify(fast));
console.log(JSON.stringify(fast.extras!.periodCheck, null, 1));
console.log(fast.clockCheck.why);

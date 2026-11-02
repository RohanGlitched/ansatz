import type { Experiment } from "./experiment";

/**
 * The sped-up Foucault film's speed-up, as every page quotes it. Its winning law misses the unseen frames by a little
 * over five times the noise (the site's rough-fit line), so its gravity carries no error bar. The speed-up does not need
 * one from the law: it is a frequency ratio, and a shape misfit (the swing runs toward the camera, so perspective bends
 * it) leaves the period alone. Its ± is split into its parts, never called statistical as a whole: almost all of it is the
 * 1% assumed on the stated 8.97 m length (sigmaAssumed); the fit's own statistical part is a twentieth of that (sigmaFit),
 * and the period from the zero crossings, with no law at all, is fixed tighter still (extras.periodCheck, from
 * scripts/period-check.ts). The check that needs no reference value is the same film's real-time stretch: g scales as
 * 1/time², so the ratio of the two stretches' gravities is the square of the speed-up, f = √(g sped up ÷ g real time).
 */
export type Fou5 = {
  f: number;
  /** the whole ±, as the truth row stores it */
  stat: number;
  /** its parts: the fit's own statistical σ, and the 1% assumed on the stated length */
  sigmaFit: number | null;
  sigmaAssumed: number | null;
  truth: number;
  testZ: number;
  rough: boolean;
  gFast: number;
  gReal: number | null;
  sameFilm: number | null;
  /** the period with no law at all, and the speed-up it gives */
  period: { T: number; sigma: number; crossings: number; speedup: number; lengthM: number } | null;
  /** the ratio of the real-time stretch's period to the sped-up one's: needs no law, no length and no g */
  sameFilmPeriod: { ratio: number; sigma: number } | null;
};

export function fou5Of(fast: Experiment | null | undefined, real?: Experiment | null): Fou5 | null {
  const row = fast?.extras?.truth?.rows.find((r) => r.param === "speedup");
  if (!fast || !row) return null;
  const win = fast.candidates.find((c) => c.law.id === fast.winner) ?? fast.candidates[0];
  const testZ = win?.fit.testZ ?? NaN;
  const g = (e: Experiment | null | undefined) => e?.comparisons.find((c) => c.param === "g")?.measured ?? null;
  const gFast = g(fast)!;
  const gReal = g(real);
  const pc = fast.extras?.periodCheck;
  return {
    f: row.measured,
    stat: row.sigma ?? 0,
    sigmaFit: row.sigmaFit ?? null,
    sigmaAssumed: row.sigmaAssumed ?? null,
    truth: row.truth,
    testZ,
    rough: Number.isFinite(testZ) && testZ > 5,
    gFast,
    gReal,
    sameFilm: gReal && gFast ? Math.sqrt(gFast / gReal) : null,
    period: pc ? { T: pc.period, sigma: pc.sigma, crossings: pc.crossings, speedup: pc.speedup, lengthM: pc.lengthM } : null,
    sameFilmPeriod: (pc as { sameFilm?: { ratio: number; sigma: number } } | undefined)?.sameFilm ?? null,
  };
}

/** "4.97×" */
export const fou5Short = (x: Fou5) => `${x.f.toFixed(2)}×`;

/** "± 0.025 if the stated 8.97 m is good to 1%; the fit alone ± 0.0015", or the plain ± where the parts are not stored */
export const fou5Parts = (x: Fou5) =>
  x.sigmaAssumed != null && x.sigmaFit != null ? `± ${x.sigmaAssumed.toFixed(3)} if the stated ${x.period?.lengthM ?? 8.97} m is good to 1%; the fit alone ± ${x.sigmaFit.toFixed(4)}` : `± ${x.stat.toFixed(2)}, almost all of it the 1% assumed on the stated length`;

/** "the period, 1.2084 s, needs no law: 19 zero crossings give 4.973×" */
export const fou5Period = (x: Fou5) => (x.period ? `the swing’s period, ${x.period.T.toFixed(4)} s, needs no law: ${x.period.crossings} zero crossings give ${x.period.speedup.toFixed(3)}×` : null);

/**
 * "4.97× faster than life (± 0.025 if the stated 8.97 m is good to 1%; the fit alone ± 0.0015; the swing's period,
 * 1.2084 s, needs no law: 19 zero crossings give 4.973×; the law's shape misses the unseen frames by 5.3× the noise, so
 * g itself has no error bar)", or with a plain ± on a clean fit
 */
export const fou5Long = (x: Fou5, what = "faster than life") =>
  x.rough
    ? `${x.f.toFixed(2)}× ${what} (${fou5Parts(x)}${fou5Period(x) ? `; ${fou5Period(x)}` : ""}; the law’s shape misses the unseen frames by ${x.testZ.toFixed(1)}× the noise, so g itself has no error bar)`
    : `${x.f.toFixed(2)} ± ${x.stat.toFixed(2)}× ${what}`;

/** "√(242.9 ÷ 9.683) = 5.01×": the reference-free check against the same film's real-time stretch */
export const fou5SameFilm = (x: Fou5) => (x.sameFilm && x.gReal ? `√(${x.gFast.toFixed(1)} ÷ ${x.gReal.toFixed(3)}) = ${x.sameFilm.toFixed(2)}×` : null);

/**
 * "4.987 ± 0.007 from the ratio of the two stretches' periods, which needs no law, no length and no g (the two fitted
 * gravities, both from rough fits, give √(242.4 ÷ 9.683) = 5.00×)": the same-film check led by its law-free figure
 */
export const fou5SameFilmLawFree = (x: Fou5) =>
  x.sameFilmPeriod
    ? `${x.sameFilmPeriod.ratio.toFixed(3)} ± ${x.sameFilmPeriod.sigma.toFixed(3)}× from the ratio of the two stretches’ periods, which needs no law, no length and no g${fou5SameFilm(x) ? ` (the two fitted gravities, both from rough fits, give ${fou5SameFilm(x)})` : ""}`
    : fou5SameFilm(x);

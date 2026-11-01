import type { Experiment } from "./experiment";

/**
 * The sped-up Foucault film's speed-up, as every page quotes it. Its winning law misses the unseen frames by a little
 * over five times the noise (the site's rough-fit line), so its gravity carries no error bar and the speed-up's ±, which
 * is computed from that gravity's σ, is only statistical: it is printed as such, never as the headline's ±. The check
 * that needs no reference value at all is the same film's real-time stretch: g scales as 1/time², so the ratio of the
 * two stretches' gravities is the square of the speed-up, f = √(g sped up ÷ g real time).
 */
export type Fou5 = { f: number; stat: number; truth: number; testZ: number; rough: boolean; gFast: number; gReal: number | null; sameFilm: number | null };

export function fou5Of(fast: Experiment | null | undefined, real?: Experiment | null): Fou5 | null {
  const row = fast?.extras?.truth?.rows.find((r) => r.param === "speedup");
  if (!fast || !row) return null;
  const win = fast.candidates.find((c) => c.law.id === fast.winner) ?? fast.candidates[0];
  const testZ = win?.fit.testZ ?? NaN;
  const g = (e: Experiment | null | undefined) => e?.comparisons.find((c) => c.param === "g")?.measured ?? null;
  const gFast = g(fast)!;
  const gReal = g(real);
  return { f: row.measured, stat: row.sigma ?? 0, truth: row.truth, testZ, rough: Number.isFinite(testZ) && testZ > 5, gFast, gReal, sameFilm: gReal && gFast ? Math.sqrt(gFast / gReal) : null };
}

/** "4.97×" */
export const fou5Short = (x: Fou5) => `${x.f.toFixed(2)}×`;

/** "4.97× faster than life (statistical ± 0.02; the law misses the unseen frames by 5.3× the noise, so no error bar)", or with a plain ± on a clean fit */
export const fou5Long = (x: Fou5, what = "faster than life") => (x.rough ? `${x.f.toFixed(2)}× ${what} (statistical ± ${x.stat.toFixed(2)}; the law misses the unseen frames by ${x.testZ.toFixed(1)}× the noise, so no error bar)` : `${x.f.toFixed(2)} ± ${x.stat.toFixed(2)}× ${what}`);

/** "√(242.9 ÷ 9.683) = 5.01×": the reference-free check against the same film's real-time stretch */
export const fou5SameFilm = (x: Fou5) => (x.sameFilm && x.gReal ? `√(${x.gFast.toFixed(1)} ÷ ${x.gReal.toFixed(3)}) = ${x.sameFilm.toFixed(2)}×` : null);

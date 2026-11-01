/**
 * The period of an oscillation with no law at all: the times the series crosses its own mean going up, each found by
 * linear interpolation between the two frames either side, fitted by a straight line t_k = t₀ + k·T. Its σ is the
 * scatter of the crossings about that line, propagated to the slope. A shape misfit (a perspective-bent swing, a
 * harmonic the law leaves out) moves the crossings together and leaves T alone, which is why a speed-up read from a
 * frequency needs no law. Null with fewer than four crossings.
 */
export type PeriodCheck = { period: number; sigma: number; crossings: number; residualMs: number };

export function zeroCrossingPeriod(t: number[], y: number[]): PeriodCheck | null {
  const pts = t.map((ti, i) => [ti, y[i]] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pts.length < 8) return null;
  const mean = pts.reduce((s, [, b]) => s + b, 0) / pts.length;
  const up: number[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [t0, y0] = pts[i - 1], [t1, y1] = pts[i];
    if (y0 - mean < 0 && y1 - mean >= 0) up.push(t0 + ((mean - y0) / (y1 - y0)) * (t1 - t0));
  }
  // a crossing much closer to the last than half the typical spacing is noise at the mean line, not a new cycle
  const gaps = up.slice(1).map((u, i) => u - up[i]).sort((a, b) => a - b);
  const typical = gaps[Math.floor(gaps.length / 2)] ?? 0;
  const kept = up.filter((u, i) => i === 0 || u - up[i - 1] > 0.5 * typical);
  const n = kept.length;
  if (n < 4) return null;
  const kBar = (n - 1) / 2, tBar = kept.reduce((s, u) => s + u, 0) / n;
  let sxx = 0, sxy = 0;
  kept.forEach((u, k) => ((sxx += (k - kBar) ** 2), (sxy += (k - kBar) * (u - tBar))));
  const T = sxy / sxx;
  const res = kept.map((u, k) => u - (tBar + (k - kBar) * T));
  const s2 = res.reduce((s, r) => s + r * r, 0) / (n - 2);
  return { period: T, sigma: Math.sqrt(s2 / sxx), crossings: n, residualMs: Math.sqrt(s2) * 1000 };
}

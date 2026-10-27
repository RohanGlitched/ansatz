/**
 * Parameter covariance for a least-squares fit whose residuals are correlated frame to frame (a tracked
 * centroid jitters smoothly, so neighbouring frames share their error). Everything works on the linearised
 * problem at the optimum: J (weighted Jacobian, one row per residual), r (weighted residuals), and the rows
 * grouped into channel segments, time-ordered within each.
 *
 * The estimators, compared by Monte Carlo in scripts/coverage.ts (results in data/bench/coverage.json):
 * - "ols": s²(JᵀJ)⁻¹, right only for white noise.
 * - "ar1-inflate": the original rule, s²(JᵀJ)⁻¹ scaled by √((1+ρ)/(1−ρ)) with ρ the raw lag-1 autocorrelation
 *   of the residuals. ρ from residuals is biased low (the fit soaks up the slow part of the noise), so it
 *   under-covers when the noise is strongly correlated.
 * - "newey-west": the HAC sandwich with Bartlett weights and Andrews' AR(1) plug-in lag.
 * - "ar1-sandwich": the exact sandwich under AR(1) noise, (JᵀJ)⁻¹ JᵀΣJ (JᵀJ)⁻¹, with ρ and σ² found by matching
 *   the residuals' lag-0 and lag-1 sums to their expectations after the fit's own projection, so the fit
 *   absorbing part of the noise no longer biases ρ.
 * - "ar1-white": the same sandwich for white noise plus an AR(1) wander (see mixedMoments). It matches
 *   "ar1-sandwich" on pure white or pure AR(1) noise and holds up better on the mixture, so it is the default.
 * Only the diagonal (σ of each parameter) is read downstream.
 */

export type CovMethod = "ols" | "ar1-inflate" | "newey-west" | "ar1-sandwich" | "ar1-white";

export type CovResult = { cov: number[][] | null; rho: number; lag?: number; whiteShare?: number };

type Segments = number[]; // start row of each channel segment, plus the total row count at the end

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

export function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const x = solve(A, Array.from({ length: n }, (_, i) => (i === j ? 1 : 0)));
    if (!x) return null;
    cols.push(x);
  }
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]));
}

// lags used to separate the white share from the wander: 4 or 6 moved coverage by under 2 points, so the least
const MIXED_LAGS = 2;

const zeros = (a: number, b: number) => Array.from({ length: a }, () => new Array(b).fill(0));

/** AᵀB for row-major n×p A and n×q B. */
function tmul(A: number[][], B: number[][], p: number, q: number) {
  const out = zeros(p, q);
  for (let i = 0; i < A.length; i++) for (let a = 0; a < p; a++) { const x = A[i][a]; if (x) for (let b = 0; b < q; b++) out[a][b] += x * B[i][b]; }
  return out;
}

function mm(A: number[][], B: number[][]) {
  return A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)));
}

const trace = (A: number[][]) => A.reduce((s, r, i) => s + r[i], 0);

/** R·X column by column, R the AR(1) correlation ρ^|i−j| within each segment: two O(n) recursions. */
function applyR(X: number[][], seg: Segments, rho: number, p: number) {
  const out = zeros(X.length, p);
  for (let s = 0; s + 1 < seg.length; s++) {
    const a = seg[s], b = seg[s + 1];
    for (let j = 0; j < p; j++) {
      let f = 0;
      for (let i = a; i < b; i++) { f = X[i][j] + rho * f; out[i][j] = f; }
      let g = 0;
      for (let i = b - 1; i >= a; i--) { g = X[i][j] + rho * g; out[i][j] += g - X[i][j]; }
    }
  }
  return out;
}

/** D·X, D the lag-l adjacency (ones l above and l below the diagonal) within each segment. */
function applyD(X: number[][], seg: Segments, p: number, l = 1) {
  const out = zeros(X.length, p);
  for (let s = 0; s + 1 < seg.length; s++) {
    const a = seg[s], b = seg[s + 1];
    for (let i = a; i < b; i++) for (let j = 0; j < p; j++) out[i][j] = (i - l >= a ? X[i - l][j] : 0) + (i + l < b ? X[i + l][j] : 0);
  }
  return out;
}

function lagSum(r: number[], seg: Segments, l = 1) {
  let num = 0, den = 0;
  for (let s = 0; s + 1 < seg.length; s++) for (let i = seg[s]; i < seg[s + 1]; i++) { den += r[i] * r[i]; if (i - l >= seg[s]) num += r[i] * r[i - l]; }
  return { num, den };
}
const lag1 = (r: number[], seg: Segments) => lagSum(r, seg, 1);
const pairs = (seg: Segments, l: number) => seg.slice(1).reduce((s, b, i) => s + Math.max(0, b - seg[i] - l), 0);

/**
 * Projection-corrected AR(1) moments. With M = I − J P Jᵀ the fit's residual-maker, E[eᵀe] = σ² tr(RM) and
 * E[eᵀDe] = σ² tr(RMDM); solving the observed ratio for ρ removes the fit's pull towards zero correlation.
 */
function ar1Moments(J: number[][], r: number[], seg: Segments, P: number[][]) {
  const n = r.length, k = P.length;
  const DJ = applyD(J, seg, k);
  const JtDJ = tmul(J, DJ, k, k);
  const nPairs = seg.slice(1).reduce((s, b, i) => s + Math.max(0, b - seg[i] - 1), 0);
  const ratio = (rho: number) => {
    const RJ = applyR(J, seg, rho, k);
    const JtRJ = tmul(J, RJ, k, k);
    const trRM = n - trace(mm(P, JtRJ));
    const trRD = 2 * nPairs * rho;
    const trRHD = trace(mm(P, tmul(DJ, RJ, k, k)));
    const trRHDH = trace(mm(mm(P, JtDJ), mm(P, JtRJ)));
    return { q: (trRD - 2 * trRHD + trRHDH) / trRM, trRM, JtRJ, RJ };
  };
  const { num, den } = lag1(r, seg);
  const target = den > 0 ? (2 * num) / den : 0;
  // q(ρ) rises with ρ; bisect, holding ρ inside a stationary range
  let lo = -0.9, hi = 0.985;
  if (ratio(lo).q >= target) hi = lo;
  else if (ratio(hi).q <= target) lo = hi;
  else for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (ratio(mid).q < target) lo = mid; else hi = mid; }
  const rho = (lo + hi) / 2;
  return { rho, ...ratio(rho) };
}

/**
 * Projection-corrected moments for white noise plus an AR(1) wander, R = (1−λ)I + λR_φ: pixel quantisation on top
 * of a centroid that drifts over several frames. A pure AR(1) read from lag 1 alone mistakes that mixture for a
 * weak, short correlation and under-covers; lag 2 separates the two (its correlation is λφ² against λφ at lag 1).
 * For each φ the lag-1 moment fixes λ in closed form (both moments are linear in λ); φ is then the one whose
 * lag-2 moment matches.
 */
function mixedMoments(J: number[][], r: number[], seg: Segments, P: number[][]) {
  const n = r.length, k = P.length;
  const L = MIXED_LAGS;
  const DJ = Array.from({ length: L + 1 }, (_, l) => (l ? applyD(J, seg, k, l) : J));
  const PD = DJ.map((X) => mm(P, tmul(J, X, k, k)));
  const np = DJ.map((_, l) => pairs(seg, l));
  // white parts: tr(M) and tr(M D_l M) = −tr(P JᵀD_lJ)
  const W = PD.map((X, l) => (l ? -trace(X) : n - k));
  const tl = DJ.map((_, l) => { const x = lagSum(r, seg, l); return x.den > 0 ? (l ? 2 : 1) * x.num / x.den : 0; });
  const at = (phi: number) => {
    const RJ = applyR(J, seg, phi, k);
    const JtRJ = tmul(J, RJ, k, k);
    const PR = mm(P, JtRJ);
    const A = DJ.map((X, l) => (l ? 2 * np[l] * phi ** l - 2 * trace(mm(P, tmul(X, RJ, k, k))) + trace(mm(PD[l], PR)) : n - trace(PR)));
    const a = W[1] - tl[1] * W[0], b = A[1] - tl[1] * A[0];
    const lambda = a === b ? 0 : Math.min(1, Math.max(0, a / (a - b)));
    let miss = 0;
    for (let l = 2; l <= L; l++) miss += (((1 - lambda) * W[l] + lambda * A[l]) / ((1 - lambda) * W[0] + lambda * A[0]) - tl[l]) ** 2;
    return { phi, lambda, miss, RJ, JtRJ };
  };
  // coarse grid, denser towards φ → 1 where the error bars are most sensitive, then golden-section refinement
  const grid = Array.from({ length: 41 }, (_, j) => 0.985 - 1.885 * (j / 40) ** 2);
  let best = at(grid[0]);
  let bi = 0;
  grid.forEach((phi, j) => { if (j) { const x = at(phi); if (x.miss < best.miss) { best = x; bi = j; } } });
  let lo = grid[Math.min(grid.length - 1, bi + 1)], hi = grid[Math.max(0, bi - 1)];
  for (let it = 0; it < 18 && hi - lo > 1e-4; it++) {
    const a = hi - 0.618 * (hi - lo), b = lo + 0.618 * (hi - lo);
    const fa = at(a), fb = at(b);
    if (fa.miss < fb.miss) { hi = b; if (fa.miss < best.miss) best = fa; } else { lo = a; if (fb.miss < best.miss) best = fb; }
  }
  return best;
}

/**
 * Covariance of the fitted parameters. `frame` gives each row's frame index (rows from different channels at
 * the same frame share it); only Newey–West needs it, to add channels' scores frame by frame.
 */
export function paramCovariance(J: number[][], r: number[], seg: Segments, frame: number[], method: CovMethod): CovResult {
  const n = r.length, k = J[0]?.length ?? 0;
  if (!k || n <= k) return { cov: null, rho: NaN };
  const JtJ = tmul(J, J, k, k);
  const P = invert(JtJ);
  if (!P) return { cov: null, rho: NaN };
  const ss = r.reduce((s, x) => s + x * x, 0);
  const scale = (A: number[][], f: number) => A.map((row) => row.map((v) => v * f));

  if (method === "ols") return { cov: scale(P, ss / (n - k)), rho: 0 };

  if (method === "ar1-inflate") {
    // the original rule: lag-1 autocorrelation over the rows as concatenated, clipped to [0, 0.95]
    let num = 0;
    for (let i = 1; i < n; i++) num += r[i] * r[i - 1];
    const rho = ss > 0 ? Math.max(0, Math.min(0.95, num / ss)) : 0;
    return { cov: scale(P, (ss / (n - k)) * ((1 + rho) / (1 - rho))), rho };
  }

  if (method === "newey-west") {
    // scores per frame, summed over channels
    const frames = [...new Set(frame)].sort((a, b) => a - b);
    const at = new Map(frames.map((f, i) => [f, i]));
    const g = zeros(frames.length, k);
    for (let i = 0; i < n; i++) { const row = g[at.get(frame[i])!]; for (let a = 0; a < k; a++) row[a] += J[i][a] * r[i]; }
    const { num, den } = lag1(r, seg);
    const rho = den > 0 ? Math.max(-0.95, Math.min(0.95, num / den)) : 0;
    // Andrews (1991) Bartlett bandwidth from an AR(1) fit: 1.1447 (α T)^(1/3), α = 4ρ²/((1−ρ)²(1+ρ)²)
    const T = frames.length;
    const alpha = (4 * rho * rho) / ((1 - rho) ** 2 * (1 + rho) ** 2);
    const lag = Math.min(T - 1, Math.max(0, Math.floor(1.1447 * Math.cbrt(alpha * T))));
    const S = zeros(k, k);
    for (let l = 0; l <= lag; l++) {
      const w = l === 0 ? 1 : 1 - l / (lag + 1);
      for (let t = l; t < T; t++) for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) {
        const v = g[t][a] * g[t - l][b];
        S[a][b] += w * v;
        if (l > 0) S[b][a] += w * v;
      }
    }
    return { cov: scale(mm(mm(P, S), P), n / (n - k)), rho, lag };
  }

  // the sandwich under R = (1−λ)I + λR_φ (λ = 1 for the pure AR(1)): σ² per channel (the weights only roughly
  // equalise channels), the correlation shared
  const m = method === "ar1-white" ? mixedMoments(J, r, seg, P) : { ...ar1Moments(J, r, seg, P), lambda: 1 };
  const lam = m.lambda;
  const RJ = lam === 1 ? m.RJ : J.map((row, i) => row.map((v, a) => (1 - lam) * v + lam * m.RJ[i][a]));
  const JtRJ = lam === 1 ? m.JtRJ : JtJ.map((row, a) => row.map((v, b) => (1 - lam) * v + lam * m.JtRJ[a][b]));
  const trRM = n - trace(mm(P, JtRJ));
  const JtSJ = zeros(k, k);
  const JP = J.map((row) => P.map((_, b) => row.reduce((s, v, a) => s + v * P[a][b], 0)));
  for (let s = 0; s + 1 < seg.length; s++) {
    const a0 = seg[s], b0 = seg[s + 1];
    let e2 = 0, trc = 0;
    for (let i = a0; i < b0; i++) {
      e2 += r[i] * r[i];
      // this channel's share of tr(M R M): 1 − 2(RH)_ii + (H R H)_ii
      let h = 0, hrh = 0;
      for (let a = 0; a < k; a++) {
        h += RJ[i][a] * JP[i][a];
        for (let b = 0; b < k; b++) hrh += JP[i][a] * JtRJ[a][b] * JP[i][b];
      }
      trc += 1 - 2 * h + hrh;
    }
    const s2 = trc > 0.5 ? e2 / trc : ss / trRM;
    for (let i = a0; i < b0; i++) for (let a = 0; a < k; a++) { const x = J[i][a] * s2; if (x) for (let b = 0; b < k; b++) JtSJ[a][b] += x * RJ[i][b]; }
  }
  const rho = "phi" in m ? m.phi : m.rho;
  const cov = mm(mm(P, JtSJ), P);
  // near a unit root (lag-1 correlation over 0.95) the AR(1) reading can't be told from a misfit oscillating at the
  // motion's own frequency (a sinusoid sampled at 30 fps also has lag-1 correlation ≈ 0.98), which the sandwich
  // would wrongly call harmless: there no variance goes below the long-run inflation's
  if (rho > 0.95) {
    const old = paramCovariance(J, r, seg, frame, "ar1-inflate").cov;
    if (old) for (let i = 0; i < k; i++) if (old[i][i] > cov[i][i]) cov[i][i] = old[i][i];
  }
  return { cov, rho, ...(method === "ar1-white" ? { whiteShare: 1 - lam } : {}) };
}

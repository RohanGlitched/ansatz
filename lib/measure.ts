/**
 * From SAM's pixels to physics' channels. A tracked body becomes x(t), y(t) in metres (y up, origin at
 * its first sighting), with real seconds from the container's clock divided by any slow-motion factor.
 * Two derived channels make common experiments scale-free or one-dimensional: `theta` (angle about a
 * pivot found by fitting a circle to the path) and `s` (distance along the path's best-fit line).
 */
import type { Sample, Track } from "./meta/sam";
import { noiseScale, type Series } from "./physics/law";

export type Calibration =
  | { kind: "reference"; metresPerPixel: number; note: string }
  | { kind: "stated"; metresPerPixel: number; note: string }
  | { kind: "gravity"; metresPerPixel: number; note: string; g: number }
  | { kind: "pendulum"; metresPerPixel: number; note: string }
  | { kind: "none"; metresPerPixel: number; note: string };

export type Pivot = {
  x: number; y: number; r: number; rmsPx: number; arcDeg: number;
  /** bootstrap 1σ of r, px */
  sigmaR?: number;
  /** the algebraic (Kåsa) radius the geometric fit started from, px: the gap is the short-arc bias it removed */
  kasaR?: number;
  /** whether the path may set the pendulum's length (arc over 25°, one circle); `why` says when not */
  lengthOk?: boolean;
  why?: string;
  drift?: { px: number; p: number };
  bimodality?: number;
  twoRadii?: boolean;
};

export type Measured = {
  series: Series;
  /** px coordinates of the body at each series time, for overlays */
  px: { f: number; x: number; y: number }[];
  origin: { x: number; y: number };
  calibration: Calibration;
  pivot?: Pivot;
  /** why a near-circular path was not given a pivot */
  pivotNote?: string;
  line?: { x0: number; y0: number; ux: number; uy: number };
  coverage: number; // fraction of frames in the window where the body was seen
  noise: Record<string, number>;
  window: { f0: number; f1: number; t0: number; t1: number };
  slowMotion: number;
};

/** Picks the track SAM followed longest (and most confidently): the experiment's subject. */
export function mainTrack(tracks: Track[], f0 = 0, f1 = Infinity): Track | null {
  let best: Track | null = null, bestScore = -1;
  for (const t of tracks) {
    const inWin = t.samples.filter((s) => s.f >= f0 && s.f <= f1);
    const motion = pathLength(inWin);
    const score = inWin.length * (0.02 + Math.min(motion / 50, 4)) * (avg(inWin.map((s) => s.conf ?? 0.5)) + 0.2);
    if (score > bestScore) { bestScore = score; best = t; }
  }
  return best;
}

function avg(a: number[]) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function pathLength(s: Sample[]) { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i].cx - s[i - 1].cx, s[i].cy - s[i - 1].cy); return L; }

type Pt = { x: number; y: number };
type Circle = { x: number; y: number; r: number };
// Math.hypot is several times slower than this in V8, and the bootstrap calls it millions of times
const dist = (dx: number, dy: number) => Math.sqrt(dx * dx + dy * dy);

/** Kåsa algebraic circle fit: closed form, but on a short arc it pulls the circle smaller (L biased low). */
export function kasaCircle(pts: Pt[]): Circle | null {
  const n = pts.length;
  if (n < 3) return null;
  const mx = avg(pts.map((p) => p.x)), my = avg(pts.map((p) => p.y));
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const p of pts) {
    const u = p.x - mx, v = p.y - my;
    suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u;
  }
  const det = suu * svv - suv * suv;
  if (Math.abs(det) < 1e-9) return null;
  const b1 = 0.5 * (suuu + suvv), b2 = 0.5 * (svvv + svuu);
  const uc = (b1 * svv - b2 * suv) / det, vc = (suu * b2 - suv * b1) / det;
  return { x: uc + mx, y: vc + my, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
}

/** Orthogonal-distance (geometric) circle fit: Levenberg–Marquardt on the radial residuals |p − c| − r. */
export function geometricCircle(pts: Pt[], c0: Circle, maxIter = 60): Circle | null {
  let c = { ...c0 };
  const cost = (q: Circle) => pts.reduce((s, p) => s + (dist(p.x - q.x, p.y - q.y) - q.r) ** 2, 0);
  let f = cost(c), lambda = 1e-3;
  for (let it = 0; it < maxIter; it++) {
    const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], g = [0, 0, 0];
    for (const p of pts) {
      const d = dist(p.x - c.x, p.y - c.y) || 1e-12;
      const e = d - c.r, j = [-(p.x - c.x) / d, -(p.y - c.y) / d, -1];
      for (let a = 0; a < 3; a++) { g[a] += j[a] * e; for (let b = 0; b < 3; b++) A[a][b] += j[a] * j[b]; }
    }
    let stepped = false;
    for (let tries = 0; tries < 10 && !stepped; tries++) {
      const d = solve3(A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) : v))), g.map((x) => -x));
      if (!d) { lambda *= 10; continue; }
      const q = { x: c.x + d[0], y: c.y + d[1], r: c.r + d[2] };
      const fq = cost(q);
      if (q.r > 0 && fq <= f) {
        // a step under 1e-5 px changes nothing a camera can see
        const done = f - fq <= 1e-10 * Math.max(f, 1e-30) || Math.abs(d[0]) + Math.abs(d[1]) + Math.abs(d[2]) < 1e-5;
        c = q; f = fq; lambda = Math.max(lambda / 4, 1e-12); stepped = true;
        if (done) return c;
      } else lambda *= 10;
    }
    if (!stepped) break;
  }
  return Number.isFinite(c.r) && c.r > 0 ? c : null;
}

/**
 * Two arcs that meet at the bottom: about (x, y) with radius r on one side, about a peg d below it with radius
 * r − d on the other (the string caught by a peg under the pivot). Fitted by Levenberg–Marquardt from a single
 * circle; d is 0 for a plain pendulum.
 */
function pegCircle(pts: Pt[], onPeg: boolean[], c0: Circle, maxIter = 30): number {
  let q = [c0.x, c0.y, c0.r, 0];
  const resid = (v: number[]) => pts.map((p, i) => (onPeg[i] ? dist(p.x - v[0], p.y - v[1] - v[3]) - (v[2] - v[3]) : dist(p.x - v[0], p.y - v[1]) - v[2]));
  const cost = (v: number[]) => resid(v).reduce((s, e) => s + e * e, 0);
  let f = cost(q), lambda = 1e-3;
  for (let it = 0; it < maxIter; it++) {
    const A = [0, 1, 2, 3].map(() => [0, 0, 0, 0]), g = [0, 0, 0, 0];
    pts.forEach((p, i) => {
      const dy = p.y - q[1] - (onPeg[i] ? q[3] : 0), dx = p.x - q[0], d = dist(dx, dy) || 1e-12;
      const e = d - q[2] + (onPeg[i] ? q[3] : 0);
      const j = [-dx / d, -dy / d, -1, onPeg[i] ? 1 - dy / d : 0];
      for (let a = 0; a < 4; a++) { g[a] += j[a] * e; for (let b = 0; b < 4; b++) A[a][b] += j[a] * j[b]; }
    });
    let stepped = false;
    for (let tries = 0; tries < 10 && !stepped; tries++) {
      const d = solveN(A.map((row, i) => row.map((v, j) => (i === j ? v * (1 + lambda) + 1e-12 : v))), g.map((x) => -x));
      if (!d) { lambda *= 10; continue; }
      const v = q.map((x, i) => x + d[i]);
      const fv = cost(v);
      if (fv <= f) { const done = f - fv <= 1e-10 * Math.max(f, 1e-30) || d.reduce((a, x) => a + Math.abs(x), 0) < 1e-5; q = v; f = fv; lambda = Math.max(lambda / 4, 1e-12); stepped = true; if (done) return q[3]; }
      else lambda *= 10;
    }
    if (!stepped) break;
  }
  return q[3];
}

function solveN(A: number[][], b: number[]): number[] | null {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/** Signed angle of each point from straight down (px, y down) about the centre, unwrapped around the path's mean direction. */
function anglesAbout(pts: Pt[], c: Pt) {
  const m = Math.atan2(avg(pts.map((p) => p.x - c.x)), avg(pts.map((p) => p.y - c.y)));
  return pts.map((p) => {
    const a = Math.atan2(p.x - c.x, p.y - c.y) - m;
    return m + Math.atan2(Math.sin(a), Math.cos(a));
  });
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

const sd = (a: number[]) => { const v = a.filter(Number.isFinite); const m = avg(v); return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1)); };

/** Below this arc a circle's radius isn't pinned by its path: L comes from a stated length or not at all. */
export const MIN_ARC_FOR_LENGTH_DEG = 25;

/**
 * Pendulum pivot and radius. Kåsa's closed form starts an orthogonal-distance fit (unbiased where Kåsa is not, on
 * short arcs); a moving-block bootstrap of the radial residuals gives σ of the radius; and the path must earn the
 * right to set the length L: an arc over 25°, residuals that don't drift with angle, and one radius on both sides
 * of the bottom (a peg that catches the string, an interrupted pendulum, swings on two).
 */
export function fitCircle(pts: Pt[], opts: { boot?: number; seed?: number } = {}): Pivot | null {
  const n = pts.length;
  if (n < 6) return null;
  const k0 = kasaCircle(pts);
  if (!k0) return null;
  // a nearly straight path drives the geometric fit off to an enormous circle: keep Kåsa's there
  const g0 = geometricCircle(pts, k0);
  const c = g0 && g0.r < 20 * k0.r ? g0 : k0;
  const res = pts.map((p) => dist(p.x - c.x, p.y - c.y) - c.r);
  const ang = anglesAbout(pts, c);
  const arcDeg = (Math.max(...ang) - Math.min(...ang)) * (180 / Math.PI);
  const rmsPx = Math.sqrt(avg(res.map((e) => e * e)));

  // angle bins (equal counts) for the drift test
  const nb = Math.max(3, Math.min(8, Math.floor(n / 10)));
  const bin = new Array<number>(n);
  ang.map((a, i) => [a, i] as const).sort((p, q) => p[0] - q[0]).forEach(([, i], j) => (bin[i] = Math.min(nb - 1, Math.floor((j * nb) / n))));
  const binMeans = (e: number[]) => {
    const s = new Array(nb).fill(0), m = new Array(nb).fill(0);
    e.forEach((x, i) => { s[bin[i]] += x; m[bin[i]]++; });
    return s.map((x, b) => x / Math.max(1, m[b]));
  };
  const chi = (e: number[]) => binMeans(e).reduce((s, x) => s + x * x, 0);
  // either side of straight down, each with some arc of its own, for the two-radius (peg) test
  const side = ang.map((a) => a > 0);
  const spanOf = (want: boolean) => { const a = ang.filter((_, i) => side[i] === want).map(Math.abs); return a.length >= 6 ? Math.max(...a) * (180 / Math.PI) : 0; };
  const sides = spanOf(true) >= 5 && spanOf(false) >= 5;

  // moving-block bootstrap: blocks of radial residuals (in time order, so a wandering centroid keeps its
  // correlation) laid back onto the fitted circle at the observed angles, refitted each time
  let num = 0;
  for (let i = 1; i < n; i++) num += res[i] * res[i - 1];
  const rho = rmsPx > 0 ? Math.max(0, Math.min(0.9, num / (n * rmsPx * rmsPx))) : 0;
  const block = Math.max(1, Math.min(Math.floor(n / 4), Math.round(Math.cbrt(n) * Math.sqrt((1 + rho) / (1 - rho)))));
  // fewer resamples on a long track keep this under ~0.3 s; σ from 100 is good to about 7%
  const B = opts.boot ?? (n > 600 ? 100 : 200);
  const rand = rng(opts.seed ?? 12345);
  const inflate = Math.sqrt(n / (n - 3));
  const rs: number[] = [], chis: number[] = [], gaps: number[] = [];
  for (let b = 0; b < B; b++) {
    const e: number[] = [];
    while (e.length < n) { const s0 = Math.floor(rand() * (n - block + 1)); for (let j = 0; j < block && e.length < n; j++) e.push(res[s0 + j] * inflate); }
    const P = pts.map((_, i) => ({ x: c.x + (c.r + e[i]) * Math.sin(ang[i]), y: c.y + (c.r + e[i]) * Math.cos(ang[i]) }));
    const f = geometricCircle(P, c, 30);
    if (!f) continue;
    rs.push(f.r);
    chis.push(chi(P.map((p) => dist(p.x - f.x, p.y - f.y) - f.r)));
    if (sides) gaps.push(pegCircle(P, side, c));
  }
  const sigmaR = rs.length > 10 ? sd(rs) : NaN;

  // drift: angle-binned mean residuals beyond what the same noise scrambled in time produces (p < 1%). No size
  // floor: on a short arc a few tenths of a pixel of structure (a string wrapping on a round pivot) moves r by 5–8%
  const driftPx = Math.max(...binMeans(res).map(Math.abs));
  const chiObs = chi(res);
  const pDrift = chis.length ? chis.filter((x) => x >= chiObs).length / chis.length : 1;
  const drifts = pDrift < 0.01 && driftPx > 0.05;
  // two radii: the peg model's offset d beyond 4σ of its bootstrap spread under one circle, and over 1.5% of r
  const gap = sides ? pegCircle(pts, side, c) : NaN;
  const sdGap = gaps.length > 10 ? sd(gaps) : NaN;
  const twoRadii = Number.isFinite(gap) && Number.isFinite(sdGap) && Math.abs(gap) > 4 * sdGap && Math.abs(gap) > 0.015 * c.r;
  // bimodality coefficient of the residuals: 1/3 for a normal, 5/9 for a uniform, towards 1 for two separate bands
  const m2 = avg(res.map((e) => e * e)), m3 = avg(res.map((e) => e ** 3)), m4 = avg(res.map((e) => e ** 4));
  const skew = m2 > 0 ? m3 / m2 ** 1.5 : 0, exk = m2 > 0 ? m4 / (m2 * m2) - 3 : 0;
  const bimodality = (skew * skew + 1) / (exk + (3 * (n - 1) ** 2) / ((n - 2) * (n - 3)));
  const bimodal = bimodality > 5 / 9 && pDrift < 0.01;

  let why: string | undefined;
  if (twoRadii) why = `the path is two arcs: on one side of the bottom the radius is ${Math.abs(gap).toFixed(1)} px ${gap > 0 ? "shorter" : "longer"} than on the other (a peg catching the string?), so no single length fits it`;
  else if (bimodal) why = `the distances from the pivot split into two bands (bimodality ${bimodality.toFixed(2)}), so the path is not one circle`;
  else if (drifts) why = `the distance from the pivot drifts with angle by up to ${driftPx.toFixed(1)} px (p ${pDrift < 0.005 ? "< 0.005" : `= ${pDrift.toFixed(3)}`}), so the path is not one circle: perspective, a stretching string, or a swing out of the picture plane`;
  else if (arcDeg < MIN_ARC_FOR_LENGTH_DEG) why = `the swing covers only ${arcDeg.toFixed(0)}° of arc; under ${MIN_ARC_FOR_LENGTH_DEG}° the path doesn't determine the radius (±${Number.isFinite(sigmaR) ? sigmaR.toFixed(0) : "?"} px), so L isn't measured from it`;
  return {
    x: c.x, y: c.y, r: c.r, rmsPx, arcDeg,
    sigmaR, kasaR: k0.r,
    lengthOk: !why, ...(why ? { why } : {}),
    drift: { px: driftPx, p: pDrift }, bimodality, twoRadii,
  };
}

/**
 * The pendulum length the path measured, with its 1σ: the bootstrap spread of the radius and the ruler's relative
 * uncertainty in quadrature. Null when the arc is short or the path isn't one circle: then L isn't determined.
 */
export function pendulumLength(p: Pivot, metresPerPixel: number, rulerRel = 0): { L: number; sigma: number; rel: number } | null {
  if (!p.lengthOk || !Number.isFinite(p.sigmaR)) return null;
  const rel = Math.hypot(p.sigmaR! / p.r, rulerRel);
  return { L: p.r * metresPerPixel, sigma: rel * p.r * metresPerPixel, rel };
}

/** Principal line through the path (for 1-D motion such as a ramp). */
export function fitLine(pts: { x: number; y: number }[]) {
  const mx = avg(pts.map((p) => p.x)), my = avg(pts.map((p) => p.y));
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of pts) { const dx = p.x - mx, dy = p.y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ux = Math.cos(ang), uy = Math.sin(ang);
  // orient along the direction of travel
  const first = pts[0], last = pts[pts.length - 1];
  if ((last.x - first.x) * ux + (last.y - first.y) * uy < 0) { ux = -ux; uy = -uy; }
  const off = Math.sqrt(avg(pts.map((p) => ((p.x - mx) * -uy + (p.y - my) * ux) ** 2)));
  return { x0: first.x, y0: first.y, ux, uy, rmsOffPx: off };
}

/** Splits a vertical px path into free-flight arcs at impacts (sharp reversals of vertical velocity). */
export function flightSegments(t: number[], ypx: number[]): [number, number][] {
  const n = t.length;
  if (n < 6) return [[0, n - 1]];
  const v: number[] = [];
  for (let i = 1; i < n; i++) v.push((ypx[i] - ypx[i - 1]) / (t[i] - t[i - 1]));
  const cuts: number[] = [];
  for (let i = 1; i < v.length; i++) {
    // y is down in px: falling = v > 0; an impact turns large +v into -v within a frame or two
    if (v[i - 1] > 0 && v[i] < 0) {
      const jump = v[i - 1] - v[i];
      const scale = Math.max(...v.slice(Math.max(0, i - 6), i + 6).map(Math.abs));
      if (jump > 0.8 * scale) cuts.push(i);
    }
  }
  const segs: [number, number][] = [];
  let a = 0;
  for (const c of cuts) { if (c - 1 - a >= 4) segs.push([a, c - 1]); a = c + 1; }
  if (n - 1 - a >= 4) segs.push([a, n - 1]);
  return segs.length ? segs : [[0, n - 1]];
}

/** Local vertical acceleration (px/s², down positive) from a quadratic over ±h samples around each point. */
export function localAccel(t: number[], ypx: number[], h = 3): number[] {
  const n = t.length;
  return t.map((_, i) => {
    const a = Math.max(0, i - h), b = Math.min(n - 1, i + h);
    if (b - a < 4) return NaN;
    const ts = t.slice(a, b + 1), ys = ypx.slice(a, b + 1);
    const tm = ts.reduce((s, x) => s + x, 0) / ts.length;
    const S = [0, 0, 0, 0, 0], Y = [0, 0, 0];
    ts.forEach((tt, k) => {
      const x = tt - tm;
      const p = [1, x, x * x, x ** 3, x ** 4];
      for (let j = 0; j < 5; j++) S[j] += p[j];
      for (let j = 0; j < 3; j++) Y[j] += p[j] * ys[k];
    });
    const c = solve3([[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]], Y);
    return c ? 2 * c[2] : NaN;
  });
}

/**
 * Where the body is in free flight: frames whose local vertical acceleration sits near the clip's common
 * free-fall value, joined across bounces (short spikes) but split at long stretches of rolling or resting.
 * Returns sample indices [a, b], or null when there is no flight.
 */
export function flightWindow(t: number[], ypx: number[]): { a: number; b: number; aPx: number } | null {
  const acc = localAccel(t, ypx);
  const pos = acc.filter((x) => Number.isFinite(x) && x > 0).sort((x, y) => x - y);
  if (pos.length < 6) return null;
  const A0 = pos[Math.floor(pos.length * 0.6)];
  const near = pos.filter((x) => x > 0.5 * A0 && x < 1.5 * A0);
  if (near.length < 5) return null;
  const A = near[near.length >> 1];
  const flight = acc.map((x) => Number.isFinite(x) && Math.abs(x - A) < 0.4 * A);
  // group flight samples, bridging short gaps: a bounce smears the local fit over ~2h samples, so allow
  // 6 samples or 0.08 s, whichever is longer (high frame rates make a bounce span more samples)
  let best: [number, number] | null = null;
  let start = -1, lastIn = -1;
  const bridged = (i: number) => i - lastIn <= 6 || (t[Math.min(i, t.length - 1)] - t[lastIn]) <= 0.08;
  for (let i = 0; i <= flight.length; i++) {
    if (i < flight.length && flight[i]) {
      if (start < 0) start = i;
      lastIn = i;
    } else if (start >= 0 && (i === flight.length || !bridged(i))) {
      if (!best || lastIn - start > best[1] - best[0]) best = [start, lastIn];
      start = -1;
    }
  }
  if (!best || best[1] - best[0] < 6) return null;
  // the quadratic smears 3 samples at each end
  return { a: Math.max(0, best[0] - 2), b: Math.min(t.length - 1, best[1] + 2), aPx: A };
}

/**
 * The longest stretch one downward-curving parabola explains to within the measurement noise: the airborne
 * part of a jump or throw, found globally (every start and end), so it works when the curvature per frame is
 * smaller than the pixel quantisation (a slow lunar jump in 240-line TV). O(n²) windows, O(1) each via
 * prefix sums.
 */
export function parabolicSegment(t: number[], y: number[], opts: { minLen?: number; tolPx?: number } = {}): { a: number; b: number; rms: number; aPx: number } | null {
  const n = t.length;
  const minLen = opts.minLen ?? 10;
  if (n < minLen) return null;
  const t0 = t[0];
  const P = Array.from({ length: 9 }, () => new Float64Array(n + 1));
  for (let i = 0; i < n; i++) {
    const x = t[i] - t0, v = y[i];
    const terms = [1, x, x * x, x ** 3, x ** 4, v, v * x, v * x * x, v * v];
    for (let k = 0; k < 9; k++) P[k][i + 1] = P[k][i] + terms[k];
  }
  // noise from second differences of the whole series
  const d: number[] = [];
  for (let i = 2; i < n; i++) d.push(Math.abs(y[i] - 2 * y[i - 1] + y[i - 2]));
  d.sort((p, q) => p - q);
  const noise = Math.max(0.5, ((d[d.length >> 1] ?? 1) * 1.4826) / Math.sqrt(6));
  const tol = opts.tolPx ?? Math.max(1.0, 1.8 * noise);
  let best: { a: number; b: number; rms: number; aPx: number } | null = null;
  for (let a = 0; a + minLen <= n; a++) {
    for (let b = n - 1; b >= a + minLen - 1; b--) {
      const len = b - a + 1;
      if (best && len < best.b - best.a + 1) break;
      const S = (k: number) => P[k][b + 1] - P[k][a];
      const M = [[S(0), S(1), S(2)], [S(1), S(2), S(3)], [S(2), S(3), S(4)]];
      const Y = [S(5), S(6), S(7)];
      const c = solve3(M, Y);
      if (!c) continue;
      const ssr = S(8) - (c[0] * Y[0] + c[1] * Y[1] + c[2] * Y[2]);
      const rms = Math.sqrt(Math.max(0, ssr) / len);
      const aPx = 2 * c[2];
      const span = t[b] - t[a];
      // it must actually curve (sagitta of the arc well above the noise): a flat or drifting stretch is not a flight
      const curves = 0.125 * aPx * span * span >= 3 * tol;
      if (rms <= tol && aPx > 0 && curves && (!best || len > best.b - best.a + 1 || (len === best.b - best.a + 1 && rms < best.rms))) {
        best = { a, b, rms, aPx };
        break;
      }
    }
  }
  return best;
}

/** Vertical acceleration in px/s² from parabola fits on each flight arc, weighted by arc length. */
export function pixelGravity(t: number[], ypx: number[]): { aPx: number; arcs: number } | null {
  const segs = flightSegments(t, ypx);
  let num = 0, den = 0, arcs = 0;
  const fits: { a: number; n: number }[] = [];
  for (const [a, b] of segs) {
    const n = b - a + 1;
    if (n < 6) continue;
    const ts = t.slice(a, b + 1), ys = ypx.slice(a, b + 1);
    const tm = avg(ts);
    // least squares y = c0 + c1 τ + c2 τ²
    let S = [0, 0, 0, 0, 0], Y = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      const x = ts[i] - tm;
      const p = [1, x, x * x, x ** 3, x ** 4];
      for (let k = 0; k < 5; k++) S[k] += p[k];
      for (let k = 0; k < 3; k++) Y[k] += p[k] * ys[i];
    }
    const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
    const c = solve3(M, Y);
    if (!c) continue;
    fits.push({ a: 2 * c[2], n });
  }
  if (!fits.length) return null;
  const top = Math.max(...fits.map((f) => f.a));
  for (const f of fits) if (f.a > 0.6 * top) { num += f.a * f.n; den += f.n; arcs++; }
  return den ? { aPx: num / den, arcs } : null;
}

function solve3(M: number[][], y: number[]) {
  const d = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = d(M);
  if (Math.abs(D) < 1e-12) return null;
  return [0, 1, 2].map((k) => d(M.map((row, i) => row.map((v, j) => (j === k ? y[i] : v)))) / D);
}

export function localGravity(body: "earth" | "moon" | "mars" | string, latitudeDeg?: number) {
  if (body === "moon") return 1.625;
  if (body === "mars") return 3.721;
  if (latitudeDeg === undefined) return 9.80665;
  // WGS84 Somigliana normal gravity at sea level
  const s = Math.sin((latitudeDeg * Math.PI) / 180) ** 2;
  return (9.7803253359 * (1 + 0.00193185265241 * s)) / Math.sqrt(1 - 0.00669437999013 * s);
}

/**
 * Builds the series for one tracked body. `metresPerPixel` may be null: then the fall calibrates the
 * camera (gravity) or, failing that, the series stays in pixels (labelled as such).
 */
export function measure(args: {
  track: Track;
  times: number[];
  window?: { t0: number; t1: number };
  slowMotion?: number;
  metresPerPixel?: { value: number; kind: "reference" | "stated"; note: string } | null;
  gravity?: number;
  wantPivot?: boolean;
  /** "flight": keep only the free-flight stretch (drop rolling, resting, being carried) */
  kind?: "flight" | "swing" | "oscillation" | "along a path" | "other";
  /** which point of the mask to follow: its centroid, or its top (a person's head, steadier than a body whose limbs move) */
  point?: "centroid" | "top";
  /** never use gravity as the ruler (the motion isn't free flight) */
  noGravityRuler?: boolean;
}): Measured {
  const slow = args.slowMotion && args.slowMotion > 1 ? args.slowMotion : 1;
  const T = (f: number) => (args.times[f] ?? args.times[args.times.length - 1] + (f - args.times.length + 1) * (args.times[1] - args.times[0] || 1 / 30)) / slow;
  const w0 = args.window ? args.window.t0 / slow : -Infinity, w1 = args.window ? args.window.t1 / slow : Infinity;
  let samples = args.track.samples.filter((s) => T(s.f) >= w0 - 1e-9 && T(s.f) <= w1 + 1e-9);
  let airborne = false;
  if (args.point === "top") {
    // a jumping person is airborne while the feet (the mask's bottom edge) are above where they stand
    const bottoms = samples.map((s) => s.box[3]);
    const ground = [...bottoms].sort((a, b) => a - b)[Math.floor(bottoms.length * 0.9)];
    const up = bottoms.map((b) => b < ground - 3);
    let best: [number, number] | null = null, start = -1;
    for (let i = 0; i <= up.length; i++) {
      if (i < up.length && up[i]) { if (start < 0) start = i; }
      else if (start >= 0) { if (!best || i - 1 - start > best[1] - best[0]) best = [start, i - 1]; start = -1; }
    }
    if (best && best[1] - best[0] >= 8) {
      samples = samples.slice(best[0], best[1] + 1);
      airborne = true;
    }
    samples = samples.map((s) => ({ ...s, cx: (s.box[0] + s.box[2]) / 2, cy: s.box[1] }));
  }
  // slow motion made by repeating frames: identical masks in a row are one real frame shown many times
  const dedup: Sample[] = [];
  for (const s of samples) {
    const p = dedup[dedup.length - 1];
    if (p && p.cx === s.cx && p.cy === s.cy && p.area === s.area) continue;
    dedup.push(s);
  }
  // a moving object never lands on exactly the same sub-pixel centroid twice by chance: identical masks in a
  // row are a repeated frame (slow motion by repetition, or a 24 fps source padded to 30 fps, one in five)
  const repeated = samples.length - dedup.length;
  if (repeated >= Math.max(2, samples.length * 0.08)) samples = dedup;
  if (!airborne && (args.kind === "flight" || args.kind === "along a path") && samples.length >= 12) {
    const ts = samples.map((s) => T(s.f)), ysPx = samples.map((s) => s.cy);
    const fw = flightWindow(ts, ysPx);
    // one long arc found globally beats a short run of noisy local accelerations; several arcs (bounces) keep fw
    const ps = parabolicSegment(ts, ysPx);
    // the global search only overrides the local one when that clearly failed; it is trimmed by a frame at
    // each end, where a take-off or a landing bends the path
    const pick = ps && (!fw || ps.b - ps.a > 1.4 * (fw.b - fw.a)) ? { a: ps.a + 1, b: ps.b - 1 } : fw;
    if (pick) samples = samples.slice(pick.a, pick.b + 1);
  }
  if (samples.length < 6) throw new Error(`SAM saw the ${args.track.noun} in only ${samples.length} frames of that window`);
  const f0 = samples[0].f, f1 = samples[samples.length - 1].f;
  const coverage = samples.length / (f1 - f0 + 1);
  const t = samples.map((s) => T(s.f) - T(f0));
  const xs = samples.map((s) => s.cx), ys = samples.map((s) => s.cy);
  const origin = { x: xs[0], y: ys[0] };

  let cal: Calibration;
  if (args.metresPerPixel) cal = { kind: args.metresPerPixel.kind, metresPerPixel: args.metresPerPixel.value, note: args.metresPerPixel.note };
  else {
    // a body on a straight track (a ramp) accelerates at less than g, so its fall can't be the ruler; a curved path can
    const straight = args.kind === "along a path" && fitLine(samples.map((s) => ({ x: s.cx, y: s.cy }))).rmsOffPx < 3;
    const pg = args.noGravityRuler || straight ? null : pixelGravity(t, ys);
    const g = args.gravity ?? 9.80665;
    // gravity as the ruler only when the result is physically plausible: the object must come out between 5 mm and 3 m
    const sizePx = [...samples.map((s) => s.minor)].sort((a, b) => a - b)[samples.length >> 1] ?? 0;
    const plausible = pg && pg.aPx > 0 && pg.arcs > 0 && sizePx * (g / pg.aPx) > 0.005 && sizePx * (g / pg.aPx) < 3;
    if (pg && plausible) cal = { kind: "gravity", metresPerPixel: g / pg.aPx, g, note: `scale from the fall itself: ${pg.aPx.toFixed(0)} px/s² over ${pg.arcs} arc${pg.arcs > 1 ? "s" : ""} = g of ${g.toFixed(3)} m/s²` };
    else cal = { kind: "none", metresPerPixel: 1, note: "no scale: lengths are in pixels" };
  }
  const k = cal.metresPerPixel;
  const ch: Record<string, number[]> = {
    x: xs.map((x) => (x - origin.x) * k),
    y: ys.map((y) => -(y - origin.y) * k),
  };
  let pivot: Pivot | undefined;
  const pc = args.wantPivot === true || (args.wantPivot === undefined && (args.kind === "swing" || args.kind === undefined)) ? fitCircle(samples.map((s) => ({ x: s.cx, y: s.cy }))) : null;
  // a pendulum: the path hugs a circle whose centre sits above the body, over a real arc. Two arcs of different
  // radius (an interrupted pendulum) have no one pivot to measure an angle about
  let pivotNote: string | undefined;
  if (pc?.twoRadii) pivotNote = pc.why;
  else if (pc && pc.rmsPx < Math.max(1.5, pc.r * 0.02) && pc.arcDeg > 3 && pc.arcDeg < 340 && pc.y < avg(ys)) {
    pivot = pc;
    ch.theta = samples.map((s) => Math.atan2(s.cx - pc.x, s.cy - pc.y));
    ch.r = samples.map((s) => Math.hypot(s.cx - pc.x, s.cy - pc.y) * k);
  }
  const line = fitLine(samples.map((s) => ({ x: s.cx, y: s.cy })));
  if (line.rmsOffPx < 3) ch.s = samples.map((s) => ((s.cx - line.x0) * line.ux + (s.cy - line.y0) * line.uy) * k);
  const noise = Object.fromEntries(Object.entries(ch).map(([c, v]) => [c, noiseScale(v, t)]));
  return {
    series: { t, ch },
    px: samples.map((s) => ({ f: s.f, x: s.cx, y: s.cy })),
    origin,
    calibration: cal,
    pivot,
    ...(pivotNote ? { pivotNote } : {}),
    line: line.rmsOffPx < 3 ? { x0: line.x0, y0: line.y0, ux: line.ux, uy: line.uy } : undefined,
    coverage,
    noise,
    window: { f0, f1, t0: T(f0), t1: T(f1) },
    slowMotion: slow,
  };
}

/** A compact, model-readable digest of a measured series: what the scientist sees before proposing laws. */
export function digest(m: Measured, maxRows = 40, frac = 1) {
  const { t, ch: all } = m.series;
  const n = Math.max(3, Math.round(t.length * frac));
  const ch = Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.slice(0, n)]));
  const step = Math.max(1, Math.ceil(n / maxRows));
  const keys = Object.keys(ch);
  const rows: string[] = [`t_s,${keys.join(",")}`];
  for (let i = 0; i < n; i += step) rows.push([t[i].toFixed(4), ...keys.map((k) => fmt(ch[k][i]))].join(","));
  const stats = keys.map((k) => {
    const v = ch[k].filter(Number.isFinite);
    return `${k}: min ${fmt(Math.min(...v))}, max ${fmt(Math.max(...v))}, noise ≈ ${fmt(m.noise[k])}`;
  });
  return {
    samples: n,
    note: frac < 1 ? `These are the first ${Math.round(frac * 100)}% of the measured frames; the rest are held back to test the laws.` : undefined,
    duration_s: +(t[n - 1] - t[0]).toFixed(4),
    units: m.calibration.kind === "none" ? "x, y, r, s in pixels (no scale); theta in radians; t in seconds" : "x, y, r, s in metres (y up); theta in radians from straight down; t in seconds",
    calibration: m.calibration.note,
    pivot: m.pivot ? `path fits a circle of radius ${fmt(m.pivot.r * m.calibration.metresPerPixel)}${m.pivot.sigmaR !== undefined && Number.isFinite(m.pivot.sigmaR) ? ` ± ${fmt(m.pivot.sigmaR * m.calibration.metresPerPixel)}` : ""} ${m.calibration.kind === "none" ? "px" : "m"} (fit error ${m.pivot.rmsPx.toFixed(2)} px, arc ${m.pivot.arcDeg.toFixed(0)}°)${m.pivot.lengthOk === false && m.pivot.why ? `; the pendulum's length is not determined from this path: ${m.pivot.why}` : ""}` : m.pivotNote ? `path is not one circular arc: ${m.pivotNote}` : "path is not a circular arc",
    straight_line: m.line ? "path is a straight line; s = distance along it" : "path is not a straight line",
    channel_stats: stats,
    table: rows.join("\n"),
  };
}

function fmt(x: number) {
  if (!Number.isFinite(x)) return "nan";
  const a = Math.abs(x);
  return a !== 0 && (a < 1e-3 || a >= 1e5) ? x.toExponential(3) : (+x.toPrecision(5)).toString();
}

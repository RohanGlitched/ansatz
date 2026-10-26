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

export type Pivot = { x: number; y: number; r: number; rmsPx: number; arcDeg: number };

export type Measured = {
  series: Series;
  /** px coordinates of the body at each series time, for overlays */
  px: { f: number; x: number; y: number }[];
  origin: { x: number; y: number };
  calibration: Calibration;
  pivot?: Pivot;
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

/** Kåsa algebraic circle fit. */
export function fitCircle(pts: { x: number; y: number }[]): Pivot | null {
  const n = pts.length;
  if (n < 6) return null;
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
  const cx = uc + mx, cy = vc + my;
  const r = Math.sqrt(uc * uc + vc * vc + (suu + svv) / n);
  const res = pts.map((p) => Math.hypot(p.x - cx, p.y - cy) - r);
  const angles = pts.map((p) => Math.atan2(p.x - cx, p.y - cy));
  const arc = (Math.max(...angles) - Math.min(...angles)) * (180 / Math.PI);
  return { x: cx, y: cy, r, rmsPx: Math.sqrt(avg(res.map((e) => e * e))), arcDeg: arc };
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
  if (args.point === "top") samples = samples.map((s) => ({ ...s, cx: (s.box[0] + s.box[2]) / 2, cy: s.box[1] }));
  // slow motion made by repeating frames: identical masks in a row are one real frame shown many times
  const dedup: Sample[] = [];
  for (const s of samples) {
    const p = dedup[dedup.length - 1];
    if (p && p.cx === s.cx && p.cy === s.cy && p.area === s.area) continue;
    dedup.push(s);
  }
  const repeated = samples.length - dedup.length;
  if (repeated > samples.length * 0.3) samples = dedup;
  if ((args.kind === "flight" || args.kind === "along a path") && samples.length >= 12) {
    const ts = samples.map((s) => T(s.f)), ysPx = samples.map((s) => s.cy);
    const fw = flightWindow(ts, ysPx);
    // one long arc found globally beats a short run of noisy local accelerations; several arcs (bounces) keep fw
    const ps = parabolicSegment(ts, ysPx);
    const pick = ps && (!fw || ps.b - ps.a > fw.b - fw.a) ? ps : fw;
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
    const pg = args.noGravityRuler ? null : pixelGravity(t, ys);
    const g = args.gravity ?? 9.80665;
    if (pg && pg.aPx > 0 && pg.arcs > 0) cal = { kind: "gravity", metresPerPixel: g / pg.aPx, g, note: `scale from the fall itself: ${pg.aPx.toFixed(0)} px/s² over ${pg.arcs} arc${pg.arcs > 1 ? "s" : ""} = g of ${g.toFixed(3)} m/s²` };
    else cal = { kind: "none", metresPerPixel: 1, note: "no scale: lengths are in pixels" };
  }
  const k = cal.metresPerPixel;
  const ch: Record<string, number[]> = {
    x: xs.map((x) => (x - origin.x) * k),
    y: ys.map((y) => -(y - origin.y) * k),
  };
  let pivot: Pivot | undefined;
  const pc = args.wantPivot === true || (args.wantPivot === undefined && (args.kind === "swing" || args.kind === undefined)) ? fitCircle(samples.map((s) => ({ x: s.cx, y: s.cy }))) : null;
  // a pendulum: the path hugs a circle whose centre sits above the body, over a real arc
  if (pc && pc.rmsPx < Math.max(1.5, pc.r * 0.02) && pc.arcDeg > 3 && pc.arcDeg < 340 && pc.y < avg(ys)) {
    pivot = pc;
    ch.theta = samples.map((s) => Math.atan2(s.cx - pc.x, s.cy - pc.y));
    ch.r = samples.map((s) => Math.hypot(s.cx - pc.x, s.cy - pc.y) * k);
  }
  const line = fitLine(samples.map((s) => ({ x: s.cx, y: s.cy })));
  if (line.rmsOffPx < 3) ch.s = samples.map((s) => ((s.cx - line.x0) * line.ux + (s.cy - line.y0) * line.uy) * k);
  const noise = Object.fromEntries(Object.entries(ch).map(([c, v]) => [c, noiseScale(v)]));
  return {
    series: { t, ch },
    px: samples.map((s) => ({ f: s.f, x: s.cx, y: s.cy })),
    origin,
    calibration: cal,
    pivot,
    line: line.rmsOffPx < 3 ? { x0: line.x0, y0: line.y0, ux: line.ux, uy: line.uy } : undefined,
    coverage,
    noise,
    window: { f0, f1, t0: T(f0), t1: T(f1) },
    slowMotion: slow,
  };
}

/** A compact, model-readable digest of a measured series: what the scientist sees before proposing laws. */
export function digest(m: Measured, maxRows = 40) {
  const { t, ch } = m.series;
  const n = t.length;
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
    duration_s: +(t[n - 1] - t[0]).toFixed(4),
    units: m.calibration.kind === "none" ? "x, y, r, s in pixels (no scale); theta in radians; t in seconds" : "x, y, r, s in metres (y up); theta in radians from straight down; t in seconds",
    calibration: m.calibration.note,
    pivot: m.pivot ? `path fits a circle of radius ${fmt(m.pivot.r * m.calibration.metresPerPixel)} ${m.calibration.kind === "none" ? "px" : "m"} (fit error ${m.pivot.rmsPx.toFixed(2)} px, arc ${m.pivot.arcDeg.toFixed(0)}°)` : "path is not a circular arc",
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

/**
 * Jump for jump: every jump in a clip of a person hopping, measured the same way (the helmet top over every airborne
 * frame, a quadratic over the whole flight), so two copies of one piece of footage can be compared jump by jump. The
 * ratio of their accelerations gives each jump's playback factor with no reference gravity and no ruler (it cancels).
 * Used offline on cached SAM tracks (scripts/samejump.ts) and by its test.
 */
import type { Track } from "./meta/sam";
import { measure } from "./measure";

/** y = c0 + c1 τ + c2 τ² (τ = t − mean t) by least squares; a = 2 c2 with its ordinary (white-noise) 1σ. */
export function quad(t: number[], y: number[]) {
  const n = t.length, tm = t.reduce((a, b) => a + b, 0) / n;
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = [0, 0, 0];
  t.forEach((tt, i) => { const x = tt - tm; const v = [1, x, x * x]; for (let r = 0; r < 3; r++) { B[r] += v[r] * y[i]; for (let c = 0; c < 3; c++) A[r][c] += v[r] * v[c]; } });
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  const c = [0, 1, 2].map((k) => det(A.map((row, i) => row.map((v, j) => (j === k ? B[i] : v)))) / D);
  const at = (tt: number) => { const x = tt - tm; return c[0] + c[1] * x + c[2] * x * x; };
  const res = t.map((tt, i) => y[i] - at(tt));
  const s2 = res.reduce((a, r) => a + r * r, 0) / (n - 3);
  // covariance of c2: s2 · (A⁻¹)₂₂
  const minor = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  return { a: 2 * c[2], sa: 2 * Math.sqrt((s2 * minor) / D), n, res, at };
}

/** A small seeded generator (mulberry32), so a bootstrap gives the same σ on every run. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Moving-block bootstrap of a quadratic fit's residuals: blocks of `block` consecutive residuals (rescaled for the
 * three fitted parameters) are drawn with replacement and laid back on the fitted parabola, and the fit is redone.
 * Blocks keep the frame-to-frame correlation of SAM's mask edges (and the repeated or interpolated frames of a
 * retimed clip), which the ordinary least-squares σ assumes away. Returns every resampled acceleration.
 */
export function blockBootstrap(t: number[], y: number[], block: number, draws = 2000, seed = 1): number[] {
  const q = quad(t, y), n = t.length, b = Math.max(1, Math.min(block, n));
  const inflate = Math.sqrt(n / (n - 3));
  const fit = t.map(q.at), r = q.res.map((e) => e * inflate);
  const rand = rng(seed), out: number[] = [];
  for (let k = 0; k < draws; k++) {
    const ys: number[] = [];
    while (ys.length < n) {
      const s = Math.floor(rand() * (n - b + 1));
      for (let j = 0; j < b && ys.length < n; j++) ys.push(fit[ys.length] + r[s + j]);
    }
    out.push(quad(t, ys).a);
  }
  return out;
}

export const sd = (v: number[]) => { const m = v.reduce((a, b) => a + b, 0) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };

/**
 * Where the person is airborne over the whole clip, by the rule measure() uses inside a window: the feet (the mask's
 * bottom edge) more than 3 px above where they usually stand (the 90th percentile of the bottom edge), for at least
 * nine samples in a row. Returns frame ranges.
 */
export function airborneRuns(track: Track, minSamples = 9): { f0: number; f1: number }[] {
  const s = track.samples;
  const bottoms = s.map((x) => x.box[3]);
  const ground = [...bottoms].sort((a, b) => a - b)[Math.floor(bottoms.length * 0.9)];
  const runs: { f0: number; f1: number }[] = [];
  let start = -1;
  for (let i = 0; i <= s.length; i++) {
    const up = i < s.length && s[i].box[3] < ground - 3;
    if (up && start < 0) start = i;
    else if (!up && start >= 0) {
      if (i - start >= minSamples) runs.push({ f0: s[start].f, f1: s[i - 1].f });
      start = -1;
    }
  }
  return runs;
}

/**
 * One window per jump, wide enough for measure() to see standing frames on both sides: from halfway after the last
 * jump (or 0.6 s before take-off) to halfway to the next (or 0.6 s after landing). measure() then finds the
 * airborne frames inside it by itself.
 */
export function jumpWindows(track: Track, times: number[], pad = 0.6): { t0: number; t1: number }[] {
  const T = (f: number) => times[Math.min(f, times.length - 1)];
  const runs = airborneRuns(track);
  return runs.map((r, i) => {
    const prev = runs[i - 1], next = runs[i + 1];
    const t0 = Math.max(prev ? (T(prev.f1) + T(r.f0)) / 2 : -Infinity, T(r.f0) - pad, 0);
    const t1 = Math.min(next ? (T(r.f1) + T(next.f0)) / 2 : Infinity, T(r.f1) + pad, times[times.length - 1]);
    return { t0, t1 };
  });
}

export type JumpFit = {
  /** |a| in m/s² of playback time (the ruler only sets units: it cancels in a ratio) */
  g: number;
  /** ordinary least-squares 1σ (white noise) */
  sigmaOls: number;
  /** the quoted 1σ: the least-squares one (the bootstrap below agrees with it to about 10%, and combined comes out smaller) */
  sigma: number;
  /** moving-block bootstrap 1σ */
  sigmaBoot: number;
  block: number;
  f0: number; f1: number; t0: number; t1: number; n: number;
  /** helmet-top px at each measured frame, and the fitted parabola there: [frame, y, fit] */
  px: [number, number, number][];
  draws: number[];
};

/**
 * Frames where the mask's top jumps away from the flight: more than 6 robust σ (and 3 px) off a parabola through the
 * whole flight. One pass, the same rule for every clip; a glitch of SAM's mask, not of the motion.
 */
export function glitches(t: number[], ypx: number[]): number[] {
  const q = quad(t, ypx);
  const abs = q.res.map(Math.abs).sort((a, b) => a - b);
  const robust = 1.4826 * abs[abs.length >> 1];
  return q.res.map((r, i) => (Math.abs(r) > Math.max(3, 6 * robust) ? i : -1)).filter((i) => i >= 0);
}

/** Measures every jump in one clip from its SAM track. `blockFor(n, jump)` picks the bootstrap block in samples. */
export function measureJumps(track: Track, times: number[], metresPerPixel: number, blockFor: (n: number, jump: number) => number, seed = 1): (JumpFit & { dropped: number[] })[] {
  return jumpWindows(track, times).map((w, j) => {
    const m = measure({ track, times, window: w, kind: "flight", point: "top", metresPerPixel: { value: metresPerPixel, kind: "reference", note: "" } });
    const bad = new Set(glitches(m.series.t, m.px.map((p) => p.y)));
    const keep = (_: unknown, i: number) => !bad.has(i);
    const t = m.series.t.filter(keep), y = m.series.ch.y.filter(keep), pxs = m.px.filter(keep);
    const all = quad(t, y);
    const block = blockFor(t.length, j);
    const draws = blockBootstrap(t, y, block, 2000, seed + j).map(Math.abs);
    const fitPx = quad(t, pxs.map((p) => p.y));
    const px = pxs.map((p, i) => [p.f, +p.y.toFixed(2), +fitPx.at(t[i]).toFixed(2)] as [number, number, number]);
    return { g: Math.abs(all.a), sigmaOls: all.sa, sigma: all.sa, sigmaBoot: sd(draws), block, f0: m.window.f0, f1: m.window.f1, t0: m.window.t0, t1: m.window.t1, n: t.length, px, draws, dropped: [...bad].map((i) => m.px[i].f) };
  });
}

/** The base block: about n^⅓ samples (the usual moving-block rate), at least 3. */
export const baseBlock = (n: number) => Math.max(3, Math.ceil(Math.cbrt(n)));

/**
 * Playback factor of clip B against clip A for one jump: √(a_A / a_B). The two clips were tracked by separate SAM
 * calls, so their errors are independent and add in quadrature (half, for the square root).
 */
export function pairRatio(a: Pick<JumpFit, "g" | "sigma" | "sigmaOls">, b: Pick<JumpFit, "g" | "sigma" | "sigmaOls">) {
  const ratio = Math.sqrt(a.g / b.g);
  return { ratio, sigma: 0.5 * ratio * Math.hypot(a.sigma / a.g, b.sigma / b.g), sigmaOls: 0.5 * ratio * Math.hypot(a.sigmaOls / a.g, b.sigmaOls / b.g) };
}

/** Inverse-variance mean of independent ratios. */
export function combine(rs: { ratio: number; sigma: number }[]) {
  const w = rs.map((r) => 1 / r.sigma ** 2), W = w.reduce((x, y) => x + y, 0);
  return { ratio: rs.reduce((x, r, i) => x + r.ratio * w[i], 0) / W, sigma: 1 / Math.sqrt(W) };
}

/** A stored fit without the bootstrap draws. */
export const stored = ({ draws: _d, ...f }: JumpFit) => f;

/** The clips measured jump for jump: SAM tracks cached in data/sam (text, committed), clips for their frame clocks. */
export const CLIPS = {
  broadcast: { track: "data/sam/astronaut-broadcast.txt", video: "public/showcase/moon-jump.mp4" },
  slowed: { track: "data/sam/astronaut-slowed.txt", video: "public/showcase/moon-jump-slowed.mp4" },
  ramp: { track: "data/sam/astronaut-ramp.txt", video: "data/sam/controls/moon-jump-ramp.mp4" },
  realtime: { track: "data/sam/astronaut-realtime.txt", video: "data/sam/controls/moon-jump-23976.mp4" },
} as const;
export type ClipId = keyof typeof CLIPS;

/** The ruler (metres per source pixel, an estimate): it only sets units here, since it cancels in every ratio. */
export const MOON_MPP = 0.013823529411764705;

/**
 * Every jump in every clip, offline. The broadcast's bootstrap block is about n^⅓ of its samples; every other clip uses
 * a block spanning the same stretch of the jump (scaled by its sample count for that jump), so a retimed copy's
 * interpolated frames are counted as the source frames they came from.
 */
export async function measureAll(ids: ClipId[] = ["broadcast", "slowed", "ramp", "realtime"]) {
  const { readFileSync } = await import("node:fs");
  const { parseSam } = await import("./meta/sam");
  const { mainTrack } = await import("./measure");
  const { readVideoInfo } = await import("./video");
  const out = {} as Record<ClipId, (JumpFit & { dropped: number[] })[]>;
  const order: ClipId[] = ["broadcast", ...ids.filter((i) => i !== "broadcast")];
  const runs = {} as Record<ClipId, { f0: number; f1: number; s: number }[]>;
  order.forEach((id, ci) => {
    const tr = mainTrack(parseSam(readFileSync(CLIPS[id].track, "utf8"), "astronaut", false).tracks)!;
    const vi = readVideoInfo(readFileSync(CLIPS[id].video));
    const nb = out.broadcast?.map((j) => j.n);
    out[id] = measureJumps(tr, vi.times, MOON_MPP, (n, j) => (id === "broadcast" || !nb ? baseBlock(n) : Math.max(1, Math.round((baseBlock(nb[j]) * n) / nb[j]))), 1 + 1000 * ci);
    // hang time by frame count (the naive per-jump answer): first to last airborne frame, plus one frame
    runs[id] = airborneRuns(tr).map((r) => ({ ...r, s: vi.times[r.f1] - vi.times[r.f0] + (vi.times[1] - vi.times[0]) }));
  });
  return { fits: out, hang: runs };
}

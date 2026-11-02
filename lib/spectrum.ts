/**
 * The residual spectrum the theorist reads, and the start a drive's frequency takes from it. A law that misses a
 * periodic drive leaves the drive in its misses: they oscillate at the drive's frequency, not the motion's own. The
 * spectrum is a least-squares periodogram (a sinusoid plus an offset fitted at each trial frequency, so uneven sampling
 * and dropped frames are fine), and the two peaks are found one at a time: the strongest is fitted and taken out of
 * the misses before the next is looked for, so a sidelobe of the first is never reported as the second. Fitted frames
 * only: the series passed in is a law's misses on the frames it was fitted to.
 */
import { parse, type Node } from "./physics/expr";
import type { Law } from "./physics/law";

export type SpectrumPeak = {
  /** angular frequency, rad/s */
  omega: number;
  /** amplitude of the sinusoid at that frequency, in units of the measurement noise (every channel together) */
  ampNoise: number;
  /** its amplitude in each channel's own unit (px, m or rad) */
  byChannel: Record<string, number>;
  /** n when the peak sits within 3% of n times the motion's own frequency (n = 2 or 3): a harmonic of the motion, which
   * a lopsided (2ω₀) or hardening (3ω₀) spring leaves in the misses of a linear law; not evidence of a drive */
  harmonic?: number;
  /** what the peak is (classifyPeaks): the motion's own frequency, a harmonic of it, a drift (under two cycles in the
   * fitted frames), the noise (under the look-elsewhere threshold), one of a pair of sidebands mirrored about the
   * motion's frequency (the motion's own amplitude or frequency changing), or unexplained (none of these: worth a drive) */
  label?: PeakLabel;
  /** the fitted sinusoid a·cos ωt + b·sin ωt in each channel's own unit (t as in the series), for a drive's start */
  coef?: Record<string, { a: number; b: number }>;
};
export type PeakLabel = "motion" | "harmonic" | "sideband" | "drift" | "noise" | "unexplained";
export type ResidualSpectrum = {
  law: string;
  peaks: SpectrumPeak[];
  /** the motion's own frequency (rad/s): the strongest in the measured series */
  motionOmega?: number;
  /** the amplitude (noise units) a peak of pure white noise exceeds once in 1000 spectra, anywhere in the band */
  noiseThreshold?: number;
  /** the fitted frames' span (s): a peak under two cycles in it is a drift */
  spanS?: number;
  /** the highest frequency searched (rad/s), 90% of the frame rate's limit: a drive's frequency is kept under it */
  maxOmega?: number;
};

/** The peaks of a spectrum with each one at 2ω or 3ω of the motion (within 3%) marked as a harmonic. */
export function labelHarmonics(s: ResidualSpectrum, motionOmega: number | undefined, tol = 0.03): ResidualSpectrum {
  if (!(motionOmega && motionOmega > 0)) return s;
  return {
    ...s,
    motionOmega,
    peaks: s.peaks.map((p) => {
      const n = [2, 3].find((k) => Math.abs(p.omega - k * motionOmega) <= tol * k * motionOmega);
      const { harmonic: _, ...rest } = p;
      return n ? { ...rest, harmonic: n } : rest;
    }),
  };
}
type Chan = { ch: string; t: number[]; r: number[]; noise: number };

/** least-squares a·cos ωt + b·sin ωt + c on one series: the sinusoid's amplitude and its values at the samples */
function sinusoidAt(t: number[], r: number[], w: number) {
  let n = 0, C = 0, S = 0, CC = 0, SS = 0, CS = 0, R = 0, RC = 0, RS = 0;
  for (let i = 0; i < t.length; i++) {
    const c = Math.cos(w * t[i]), s = Math.sin(w * t[i]), y = r[i];
    n++; C += c; S += s; CC += c * c; SS += s * s; CS += c * s; R += y; RC += y * c; RS += y * s;
  }
  // normal equations for [a, b, k]
  const A = [[CC, CS, C], [CS, SS, S], [C, S, n]], b = [RC, RS, R];
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(A);
  if (!(Math.abs(D) > 1e-12 * Math.max(1, n ** 3))) return { amp: 0, a: 0, bb: 0 };
  const col = (j: number) => A.map((row, i) => row.map((v, k) => (k === j ? b[i] : v)));
  const a = det(col(0)) / D, bb = det(col(1)) / D;
  return { amp: Math.hypot(a, bb), a, bb };
}

/** combined power over channels at ω, each channel in noise units */
const powerAt = (chans: Chan[], w: number) => chans.reduce((s, c) => s + sinusoidAt(c.t, c.r.map((v) => v / c.noise), w).amp ** 2, 0);

/**
 * The strongest `count` frequencies in a set of residual series (per channel, in the channel's own unit, with that
 * channel's noise), from one cycle over the span up to the frame rate's limit. Returns them strongest first.
 */
export function residualPeaks(series: Record<string, { t: number[]; r: number[] }>, noise: Record<string, number>, count = 2): SpectrumPeak[] {
  let chans: Chan[] = Object.entries(series)
    .map(([ch, s]) => {
      const keep = s.t.map((_, i) => i).filter((i) => Number.isFinite(s.t[i]) && Number.isFinite(s.r[i]));
      return { ch, t: keep.map((i) => s.t[i]), r: keep.map((i) => s.r[i]), noise: noise[ch] > 0 ? noise[ch] : 1 };
    })
    .filter((c) => c.t.length >= 8);
  if (!chans.length) return [];
  const names = chans.map((c) => c.ch);
  const all = chans.flatMap((c) => c.t);
  const T = Math.max(...all) - Math.min(...all);
  const dts = chans.flatMap((c) => c.t.slice(1).map((v, i) => v - c.t[i])).filter((d) => d > 0).sort((a, b) => a - b);
  if (!(T > 0) || !dts.length) return [];
  const dt = dts[Math.floor(dts.length / 2)];
  // up to 90% of the frame rate's limit: at the limit itself sin(ωt) vanishes on every frame, the fit is singular and
  // the amplitude meaningless
  const wLo = (2 * Math.PI) / T, wHi = (0.9 * Math.PI) / dt;
  // ten trial frequencies per resolution width (2π/T)
  const step = wLo / 10;
  const out: SpectrumPeak[] = [];
  for (let k = 0; k < count; k++) {
    let bestW = NaN, bestP = -1;
    for (let w = wLo; w <= wHi; w += step) {
      const p = powerAt(chans, w);
      if (p > bestP) { bestP = p; bestW = w; }
    }
    if (!Number.isFinite(bestW) || bestP <= 0) break;
    // refine inside ±one trial step by golden-section search
    let lo = Math.max(wLo * 0.5, bestW - step), hi = Math.min(wHi, bestW + step);
    const g = (Math.sqrt(5) - 1) / 2;
    for (let it = 0; it < 40; it++) {
      const m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo);
      if (powerAt(chans, m1) > powerAt(chans, m2)) hi = m2; else lo = m1;
    }
    const w = (lo + hi) / 2;
    const byChannel: Record<string, number> = {};
    const coef: Record<string, { a: number; b: number }> = {};
    // take the fitted sinusoid out of every channel before the next peak is looked for
    chans = chans.map((c, j) => {
      const f = sinusoidAt(c.t, c.r, w);
      byChannel[names[j]] = f.amp;
      coef[names[j]] = { a: f.a, b: f.bb };
      return { ...c, r: c.r.map((v, i) => v - f.a * Math.cos(w * c.t[i]) - f.bb * Math.sin(w * c.t[i])) };
    });
    out.push({ omega: w, ampNoise: Math.sqrt(chans.reduce((s, c, j) => s + (byChannel[names[j]] / c.noise) ** 2, 0)), byChannel, coef });
  }
  return out;
}

/** P(χ² with 2c degrees of freedom > x): e^(−x/2) Σ_{k<c} (x/2)^k / k! */
function chi2EvenSurvival(x: number, c: number) {
  let term = 1, tot = 1;
  for (let k = 1; k < c; k++) { term *= x / 2 / k; tot += term; }
  return Math.exp(-x / 2) * tot;
}

/**
 * The amplitude, in noise units, that the strongest peak of pure white noise exceeds in one spectrum out of 1/p,
 * searched over the whole band: n samples per channel, `channels` channels, about n/2 independent frequencies (the
 * look-elsewhere factor). Each channel's least-squares a, b have variance 2/n in noise units, so ampNoise²·n/2 is χ² with
 * 2·channels degrees of freedom at one frequency. Never under 2: tracking noise is not white (a mask's wander is slow),
 * so a sinusoid smaller than twice the per-frame noise is not read as a signal.
 */
export function noiseThreshold(n: number, channels = 1, p = 1e-3): number {
  if (!(n > 4)) return Infinity;
  const M = Math.max(1, n / 2);
  let lo = 0, hi = 400;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (M * chi2EvenSurvival(mid, Math.max(1, channels)) > p) lo = mid; else hi = mid;
  }
  return Math.max(2, Math.sqrt((2 * hi) / n));
}

/**
 * Labels every peak of a residual spectrum. In order: under the noise threshold → noise; under two cycles in the fitted
 * span → drift (a slow trend, not resolvable as a periodic force); within 10% (or half a resolution width, π/T, if
 * wider) of the motion's own frequency → motion (the law's own frequency, damping or amplitude is off); within 3% of
 * 2ω or 3ω of the motion → harmonic (a lopsided or hardening spring's); otherwise → unexplained. Then two unexplained
 * peaks mirrored about the motion's frequency (their mean within 3% of it) with amplitudes within a factor 2 of each
 * other → sideband, both: a swing whose amplitude or frequency changes over the clip (a damping or stiffness law of the
 * wrong form) leaves such a pair, while a drive leaves one line that dominates its mixing products. Only a peak still
 * unexplained says a periodic drive at that frequency is worth testing.
 */
export function classifyPeaks(s: ResidualSpectrum, motionOmega: number | undefined, opts: { spanS: number; n: number; channels: number }): ResidualSpectrum {
  const thr = noiseThreshold(opts.n, opts.channels);
  const res = (2 * Math.PI) / opts.spanS;
  const withH = labelHarmonics(s, motionOmega);
  return {
    ...withH,
    noiseThreshold: thr,
    spanS: opts.spanS,
    peaks: withH.peaks.map((p) => {
      let label: PeakLabel;
      if (!(p.ampNoise > thr)) label = "noise";
      else if (p.omega < 2 * res) label = "drift";
      else if (motionOmega && Math.abs(p.omega - motionOmega) <= Math.max(0.1 * motionOmega, res / 2)) label = "motion";
      else if (p.harmonic) label = "harmonic";
      else label = "unexplained";
      return { ...p, label };
    }).map((p, i, all) => {
      if (p.label !== "unexplained" || !motionOmega) return p;
      const twin = all.find((q, j) => j !== i && q.label === "unexplained" && Math.abs((p.omega + q.omega) / 2 - motionOmega) <= 0.03 * motionOmega && Math.max(p.ampNoise, q.ampNoise) < 2 * Math.min(p.ampNoise, q.ampNoise));
      return twin ? { ...p, label: "sideband" as const } : p;
    }),
  };
}

/** A law's misses as a labelled spectrum: the `count` strongest peaks, each classified (classifyPeaks). */
export function residualSpectrum(law: string, series: Record<string, { t: number[]; r: number[] }>, noise: Record<string, number>, motionOmega: number | undefined, count = 3): ResidualSpectrum {
  const peaks = residualPeaks(series, noise, count);
  const used = Object.values(series).filter((x) => x.t.filter(Number.isFinite).length >= 8);
  const all = used.flatMap((x) => x.t.filter(Number.isFinite));
  const spanS = all.length ? Math.max(...all) - Math.min(...all) : 0;
  const ns = used.map((x) => x.t.length).sort((a, b) => a - b);
  const n = ns.length ? ns[Math.floor(ns.length / 2)] : 0;
  const dts = used.flatMap((x) => x.t.slice(1).map((v, i) => v - x.t[i])).filter((d) => d > 0).sort((a, b) => a - b);
  const maxOmega = dts.length ? (0.9 * Math.PI) / dts[Math.floor(dts.length / 2)] : undefined;
  return { ...classifyPeaks({ law, peaks }, motionOmega, { spanS: spanS > 0 ? spanS : 1, n, channels: Math.max(1, used.length) }), ...(maxOmega ? { maxOmega } : {}) };
}

/** The strongest peak labelled unexplained, or null. */
export const unexplainedPeak = (s: ResidualSpectrum | null) => s?.peaks.find((p) => p.label === "unexplained") ?? null;

const LABEL_WORDS: Record<PeakLabel, (s: ResidualSpectrum) => string> = {
  motion: () => ": the motion's own frequency (the law's own frequency, damping or amplitude is off), not a drive",
  harmonic: () => "", // worded from the harmonic number
  sideband: () => ": one of a pair mirrored about the motion's own frequency with like amplitudes, the motion's own amplitude or frequency changing over the clip (the form of the damping or the stiffness), not a drive",
  drift: (s) => `: under two cycles in the fitted ${s.spanS ? s.spanS.toFixed(1) + " s" : "frames"}, a slow drift, not resolvable as a periodic force`,
  noise: (s) => `: within the noise (pure noise reaches ${s.noiseThreshold ? s.noiseThreshold.toFixed(2) : "?"} × the noise somewhere in the band once in a thousand spectra)`,
  unexplained: () => ": UNEXPLAINED, neither the motion's own frequency nor a harmonic of it; a periodic drive at this frequency is worth testing, and the held-out frames will reject one that is not there",
};

/** One line per peak for the theorist: frequency, amplitude in noise units and in each channel's unit, and its label. */
export function spectrumSummary(s: ResidualSpectrum | null, units: Record<string, string> = {}): string {
  if (!s || !s.peaks.length) return "";
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toPrecision(3) : v.toPrecision(2));
  const peaks = s.peaks.map((p, i) => {
    const ch = Object.entries(p.byChannel).map(([c, a]) => `${fmt(a)}${units[c] ? ` ${units[c]}` : ""} in ${c}`).join(", ");
    const h = p.harmonic && (!p.label || p.label === "harmonic") ? `: ${p.harmonic}× the motion's own frequency, a harmonic of the motion (expected for a nonlinear spring), not evidence of a drive` : "";
    const l = p.label && p.label !== "harmonic" ? LABEL_WORDS[p.label](s) : "";
    return `${i ? "next" : "strongest"} at ω = ${p.omega.toFixed(2)} rad/s (period ${((2 * Math.PI) / p.omega).toFixed(3)} s), amplitude ${fmt(p.ampNoise)} × the noise (${ch})${h}${l}`;
  });
  const own = s.motionOmega ? ` The motion's own frequency is ${s.motionOmega.toFixed(2)} rad/s.` : "";
  return `Residual spectrum of “${s.law}” on the fitted frames (its misses, fitted as sinusoids one at a time, strongest first): ${peaks.join("; ")}.${own}`;
}

/** The spectrum as the theorist's residual_spectrum tool returns it: every peak with its amplitude and label. */
export function spectrumTool(s: ResidualSpectrum, units: Record<string, string> = {}) {
  return {
    law: s.law,
    motion_omega_rad_s: s.motionOmega ?? null,
    noise_threshold: s.noiseThreshold ?? null,
    peaks: s.peaks.map((p) => ({
      omega_rad_s: +p.omega.toFixed(4),
      period_s: +((2 * Math.PI) / p.omega).toFixed(4),
      amplitude_in_noise_units: +p.ampNoise.toPrecision(4),
      amplitude: Object.fromEntries(Object.entries(p.byChannel).map(([c, a]) => [c, `${+a.toPrecision(4)}${units[c] ? ` ${units[c]}` : ""}`])),
      label: p.label ?? (p.harmonic ? "harmonic" : "unlabelled"),
      ...(p.harmonic ? { harmonic_of_motion: p.harmonic } : {}),
    })),
    summary: spectrumSummary(s, units),
  };
}

/* ─────────────────────── a drive's frequency ─────────────────────── */

const FREQ_UNIT = /rad\s*\/\s*s|^1\s*\/\s*s$|s\^-1|s⁻¹|hz|per second/i;

/** sin/cos calls whose argument depends on time t */
function trigOfTime(n: Node, out: Node[] = []): Node[] {
  if (n.k === "call") {
    if ((n.fn === "sin" || n.fn === "cos") && n.args.some((a) => hasVar(a, "t"))) out.push(n.args[0]);
    n.args.forEach((a) => trigOfTime(a, out));
  } else if (n.k === "neg") trigOfTime(n.a, out);
  else if (n.k === "bin") { trigOfTime(n.a, out); trigOfTime(n.b, out); }
  return out;
}
function hasVar(n: Node, v: string): boolean {
  if (n.k === "var") return n.name === v;
  if (n.k === "neg") return hasVar(n.a, v);
  if (n.k === "bin") return hasVar(n.a, v) || hasVar(n.b, v);
  if (n.k === "call") return n.args.some((a) => hasVar(a, v));
  return false;
}
/** the names multiplied with t inside an argument (w*t, t*w, 2*pi*f*t, (w*t + phi)) */
function timesT(n: Node, out = new Set<string>()): Set<string> {
  const factors = (m: Node): Node[] => (m.k === "bin" && m.op === "*" ? [...factors(m.a), ...factors(m.b)] : [m]);
  if (n.k === "bin" && (n.op === "+" || n.op === "-")) { timesT(n.a, out); timesT(n.b, out); return out; }
  if (n.k === "neg") return timesT(n.a, out);
  const fs = factors(n);
  if (fs.some((f) => f.k === "var" && f.name === "t")) for (const f of fs) if (f.k === "var" && f.name !== "t" && f.name !== "pi") out.add(f.name);
  return out;
}

/**
 * A law's drive-frequency parameters: free parameters multiplied with t inside a sin or cos (a periodic drive), with
 * whether each is in cycles per second (the argument carries 2π) rather than radians per second.
 */
export function driveFrequencyParams(law: Law): { name: string; cycles: boolean }[] {
  const found = new Map<string, boolean>();
  const exprs = [...Object.values(law.derivatives), ...Object.values(law.observe)];
  for (const src of exprs) {
    let tree: Node;
    try { tree = parse(src); } catch { continue; }
    for (const arg of trigOfTime(tree)) {
      const cycles = hasVar(arg, "pi");
      for (const name of timesT(arg)) {
        const p = law.params.find((q) => q.name === name);
        if (!p || p.fixed) continue;
        if (/phi|phase/i.test(name) || /^rad$/i.test((p.unit ?? "").trim())) continue;
        if (!FREQ_UNIT.test(p.unit ?? "") && !/^(w|om|omega|f|nu)/i.test(name)) continue;
        found.set(name, found.get(name) || cycles || /hz/i.test(p.unit ?? ""));
      }
    }
  }
  return [...found].map(([name, cycles]) => ({ name, cycles }));
}

/**
 * The law with every drive-frequency parameter started at the strongest residual frequency (its bounds widened to take
 * it when they don't), or null when the law has no drive term or there is no peak. Only the starting value changes:
 * the fit still decides where the frequency ends up.
 */
export function seedDriveFrequency(law: Law, spectrum: ResidualSpectrum | null): Law | null {
  // a harmonic of the motion is not a drive: the start comes from the strongest unexplained peak, or failing one the
  // strongest that is neither a harmonic, the motion's own frequency, a drift nor noise-level
  const peak = unexplainedPeak(spectrum) ?? spectrum?.peaks.find((p) => !p.harmonic && (!p.label || p.label === "unexplained"));
  if (!peak || !(peak.omega > 0)) return null;
  const drive = driveFrequencyParams(law);
  if (!drive.length) return null;
  return {
    ...law,
    params: law.params.map((p) => {
      const d = drive.find((x) => x.name === p.name);
      if (!d) return p;
      const v = d.cycles ? peak.omega / (2 * Math.PI) : peak.omega;
      return { ...p, guess: v, min: p.min !== undefined && p.min > v ? v / 2 : p.min, max: p.max !== undefined && p.max < v ? v * 2 : p.max };
    }),
  };
}

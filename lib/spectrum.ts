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
};
export type ResidualSpectrum = { law: string; peaks: SpectrumPeak[] };
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
  const wLo = (2 * Math.PI) / T, wHi = Math.PI / dt;
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
    let lo = Math.max(wLo * 0.5, bestW - step), hi = bestW + step;
    const g = (Math.sqrt(5) - 1) / 2;
    for (let it = 0; it < 40; it++) {
      const m1 = hi - g * (hi - lo), m2 = lo + g * (hi - lo);
      if (powerAt(chans, m1) > powerAt(chans, m2)) hi = m2; else lo = m1;
    }
    const w = (lo + hi) / 2;
    const byChannel: Record<string, number> = {};
    // take the fitted sinusoid out of every channel before the next peak is looked for
    chans = chans.map((c, j) => {
      const f = sinusoidAt(c.t, c.r, w);
      byChannel[names[j]] = f.amp;
      return { ...c, r: c.r.map((v, i) => v - f.a * Math.cos(w * c.t[i]) - f.bb * Math.sin(w * c.t[i])) };
    });
    out.push({ omega: w, ampNoise: Math.sqrt(chans.reduce((s, c, j) => s + (byChannel[names[j]] / c.noise) ** 2, 0)), byChannel });
  }
  return out;
}

/** One line per peak for the theorist: frequency, amplitude in noise units and in each channel's unit. */
export function spectrumSummary(s: ResidualSpectrum | null, units: Record<string, string> = {}): string {
  if (!s || !s.peaks.length) return "";
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 1 ? v.toPrecision(3) : v.toPrecision(2));
  const peaks = s.peaks.map((p, i) => {
    const ch = Object.entries(p.byChannel).map(([c, a]) => `${fmt(a)}${units[c] ? ` ${units[c]}` : ""} in ${c}`).join(", ");
    return `${i ? "next" : "strongest"} at ω = ${p.omega.toFixed(2)} rad/s (period ${((2 * Math.PI) / p.omega).toFixed(3)} s), amplitude ${fmt(p.ampNoise)} × the noise (${ch})`;
  });
  return `Residual spectrum of “${s.law}” on the fitted frames (its misses, fitted as sinusoids one at a time, strongest first): ${peaks.join("; ")}.`;
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
  const peak = spectrum?.peaks[0];
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

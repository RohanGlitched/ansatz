import type { Candidate, Experiment } from "@/lib/experiment";
import { toPixels } from "@/lib/pixels";
import slits from "@/data/slits.json";

export type Slit = {
  slice: number;
  frames: number;
  height: number;
  fps: number;
  duration: number;
  /** y: a fixed column; follow: a column riding on SAM's x; arc: a band along a pendulum's circle, unrolled */
  axis?: "y" | "follow" | "arc";
  x?: number;
  /** arc only: the swing angle at the strip's top row, and radians per row */
  top?: number;
  step?: number;
};

export const slitOf = (id: string): Slit | undefined => (slits as Record<string, Slit>)[id];

/** A law's miss, in the unit the experiment page uses for it. */
export function fmtMiss(v: number, e: Experiment, channels: string[]) {
  if (!Number.isFinite(v)) return "—";
  if (channels.length === 1 && channels[0] === "theta") return `${((v * 180) / Math.PI).toFixed(2)}°`;
  if (e.measured.calibration.kind === "none") return `${v.toFixed(1)} px`;
  return v < 0.01 ? `${(v * 1000).toFixed(1)} mm` : `${(v * 100).toFixed(1)} cm`;
}

/**
 * Everything a photo-finish strip needs, in the strip's own pixels: where each measured frame sits, the winning law and
 * the runner-up as paths, and the split between the frames the laws were fitted to and the ones they had to predict.
 * Fractions (`at`) are of the strip's width, which is also the fraction of the clip's playback.
 */
export function stripGeometry(e: Experiment) {
  const meta = slitOf(e.id);
  if (!meta) return null;
  const m = e.measured;
  const W = meta.frames * meta.slice, H = meta.height;
  const axis = meta.axis ?? "y";
  const pv = m.pivot;
  if (axis === "arc" && (!pv || meta.top === undefined || !meta.step)) return null;
  const X = (f: number) => (f + 0.5) * meta.slice;
  // where a point sits along the slice: its height, or for an unrolled arc, its swing angle about the pivot
  const Y = (p: { x: number; y: number }) => (axis === "arc" ? (meta.top! - Math.atan2(p.x - pv!.x, p.y - pv!.y)) / meta.step! : p.y);
  const at = (f: number) => (f + 0.5) / meta.frames;
  const n = m.px.length;
  const splitIdx = Math.min(n - 1, Math.max(1, Math.round(n * e.trainFrac)));
  const split = m.px[splitIdx];
  const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  // the same runner-up the experiment page names
  const runner = e.candidates.find((c) => c.law.id !== win.law.id && c.fit.ok) ?? null;
  const channels = Object.keys(win.fit.predicted).filter((c) => m.series.ch[c]);
  /** a candidate's path over frames [from, to] */
  const pathOf = (c: Candidate, from = 0, to = n - 1) => {
    const law = toPixels(c.fit.predicted, m);
    let d = "";
    for (let i = Math.max(0, from); i <= Math.min(to, n - 1); i++) {
      if (!law[i]) continue;
      const y = Y(law[i]);
      if (!Number.isFinite(y)) continue;
      d += `${d ? "L" : "M"}${X(m.px[i].f).toFixed(1)} ${y.toFixed(1)}`;
    }
    return d;
  };
  /**
   * How far a law has missed the unseen frames so far: the running root-mean-square over the frames the scan has
   * passed, the same sum the fit's own `testRms` makes at the end. A few checkpoints, each with the fraction it lands at.
   */
  const missSoFar = (c: Candidate, steps = 10) => {
    const ch = Object.keys(c.fit.predicted).filter((k) => m.series.ch[k]);
    let sq = 0, cnt = 0;
    const per: { i: number; v: number }[] = [];
    for (let i = splitIdx; i < n; i++) {
      for (const k of ch) {
        const o = m.series.ch[k][i], p = c.fit.predicted[k][i];
        if (!Number.isFinite(o) || !Number.isFinite(p)) continue;
        sq += (p - o) ** 2;
        cnt++;
      }
      per.push({ i, v: cnt ? Math.sqrt(sq / cnt) : NaN });
    }
    if (!per.length) return [];
    const k = Math.max(1, Math.ceil(per.length / steps));
    const pts = per.filter((_, j) => j % k === k - 1 || j === per.length - 1);
    // the last checkpoint is the fit's own number, so the count ends exactly where the page's readout does
    return pts.map((p, j) => ({ at: at(m.px[p.i].f), v: j === pts.length - 1 && Number.isFinite(c.fit.testRms) ? c.fit.testRms : p.v }));
  };
  return { meta, m, W, H, axis, X, Y, at, n, splitIdx, split, win, runner, channels, pathOf, missSoFar };
}

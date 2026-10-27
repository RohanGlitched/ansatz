/**
 * The school pendulum practical from video runs: each run's period T comes from its fitted law (every frame of the
 * swing), and its length L from a tape when the student gives one (the classroom default), else from the sheet of
 * paper in view (about 6%: the sheet's size is assumed and SAM reads its edge a few percent short). g is the slope of
 * L against T², times 4π². Pure functions, shared by /series and the offline check (scripts/series-tape.ts).
 */
import type { Candidate, Experiment } from "./experiment";

/** How well a student reads a string length with a metre scale, pivot to the bob's centre (an assumption, stated). */
export const TAPE_SIGMA_M = 0.002;

/** A stopwatch on N swings, started and stopped by hand: a typical-reaction-time estimate, not a measurement. */
export const STOPWATCH = { swings: 20, reactionS: 0.2 };
export function stopwatch(T: number, s = STOPWATCH) {
  const relT = s.reactionS / (s.swings * T);
  return { sT: s.reactionS / s.swings, relT, relG: 2 * relT };
}

export type SeriesPoint = {
  id: string;
  title: string;
  /** period from the fit, and its statistical 1σ (the ruler doesn't touch a time) */
  T: number;
  sT: number;
  L: number;
  sL: number;
  /** where L came from: a tape length typed in, a length said in the clip, or the sheet in view */
  lengthFrom: "tape" | "stated" | "sheet";
  /** the sheet's share of L's error, shared by every run that used one */
  relShared: number;
  g: number;
  sg: number;
};

/**
 * ω₀² of the winning law, with its statistical relative σ: the ruler's share, which the pipeline adds to every
 * length-carrying constant, is taken back out (a period is a pure time measurement).
 */
export function omega2(e: Pick<Experiment, "measured" | "observation">, w: Pick<Candidate, "law" | "fit">): { w2: number; rel: number } | null {
  const th = w.fit.theta, sg = w.fit.sigma;
  const added = (w.fit as { rulerAdded?: boolean }).rulerAdded
    ? e.measured.calibration.kind === "reference"
      ? e.observation.reference.relative_uncertainty ?? 0.03
      : e.observation.body === "earth"
        ? e.observation.location?.latitude_deg != null ? 0.0005 : 0.0026
        : 0
    : 0;
  const statRel = (p: string, pw: number) => {
    const v = th[p], s = sg[p];
    if (!(v > 0)) return NaN;
    const r = Number.isFinite(s) ? Math.abs(s / v) : 0;
    return Math.sqrt(Math.max(0, r * r - (pw * added) ** 2));
  };
  const free = (n: string) => w.law.params.some((p) => p.name === n && !p.fixed);
  for (const n of ["w0", "omega0", "omega", "w"]) if (th[n] > 0 && free(n)) return { w2: th[n] ** 2, rel: 2 * statRel(n, 0) };
  if (th.g > 0 && th.L > 0) {
    // one of g, L is fitted and the other held: ω₀² = g/L carries the fitted one's statistical error
    const rel = free("g") ? statRel("g", 1) : free("L") ? statRel("L", 1) : 0;
    return { w2: th.g / th.L, rel };
  }
  return null;
}

/** One run as a point of the series. `tape` is the length the student measured, in metres, when given. */
export function seriesPoint(e: Pick<Experiment, "id" | "title" | "given" | "measured" | "observation">, w: Pick<Candidate, "law" | "fit">, tape?: number): SeriesPoint | null {
  const o = omega2(e, w);
  if (!o || !(o.w2 > 0)) return null;
  const T = (2 * Math.PI) / Math.sqrt(o.w2), sT = 0.5 * T * (Number.isFinite(o.rel) ? o.rel : 0);
  const text = e.given.join(" ");
  const stated = Number(/pendulum length L = ([\d.]+) m \(stated\)/.exec(text)?.[1]);
  const sheet = Number(/pendulum length L = ([\d.]+) m, measured from the radius/.exec(text)?.[1]) || (w.fit.theta.L > 0 ? w.fit.theta.L : NaN);
  let L: number, sL: number, lengthFrom: SeriesPoint["lengthFrom"], relShared = 0;
  if (tape && tape > 0) [L, sL, lengthFrom] = [tape, TAPE_SIGMA_M, "tape"];
  else if (stated > 0) [L, sL, lengthFrom] = [stated, TAPE_SIGMA_M, "stated"];
  else if (sheet > 0 && e.measured.calibration.kind === "reference") {
    relShared = e.observation.reference.relative_uncertainty ?? 0.03;
    [L, sL, lengthFrom] = [sheet, relShared * sheet, "sheet"];
  } else return null; // a length that came from an assumed g can't measure g
  const g = (4 * Math.PI ** 2 * L) / T ** 2;
  return { id: e.id, title: e.title, T, sT, L, sL, lengthFrom, relShared, g, sg: g * Math.hypot(sL / L, (2 * sT) / T) };
}

/**
 * L = k T² through the origin, g = 4π² k. The first σ is the scatter between runs (it shrinks as lengths are added);
 * the second is what sheet-measured runs share (the sheet's true size), which no number of runs removes: zero when
 * every length came from a tape.
 */
export function fitSeries(pts: SeriesPoint[]) {
  const sxx = pts.reduce((a, p) => a + p.T ** 4, 0), sxy = pts.reduce((a, p) => a + p.L * p.T ** 2, 0);
  const k = sxy / sxx;
  const s2 = pts.length > 1 ? pts.reduce((a, p) => a + (p.L - k * p.T ** 2) ** 2, 0) / (pts.length - 1) : NaN;
  const g = 4 * Math.PI ** 2 * k, sg = 4 * Math.PI ** 2 * Math.sqrt(s2 / sxx);
  const sheet = pts.filter((p) => p.lengthFrom === "sheet");
  const relShared = sheet.length ? Math.min(...sheet.map((p) => p.relShared)) * (sheet.length / pts.length) : 0;
  // what the tape readings alone allow (independent run to run), for comparison with the scatter
  const sgTape = pts.every((p) => p.lengthFrom !== "sheet") ? g * Math.sqrt(pts.reduce((a, p) => a + (p.sL / p.L) ** 2, 0)) / pts.length : NaN;
  return { k, g, sg, sgShared: g * relShared, relShared, sgTape, n: pts.length };
}

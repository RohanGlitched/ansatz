import { fmtPair } from "../lib/format";
import { prettyUnit } from "../lib/units";

/**
 * Pure helpers for the live photo-finish on /new: which SAM points belong to which object, which object is the one
 * that moves, which strip column each measured point sits in, and which clip time each column was cut from.
 * They work from what a real run streams (track updates, the observer's window, the upload's frame rate), so a
 * replay and a live run draw the same strip.
 */

/** [frame in the tracked clip, x, y] in the clip's pixels, as SAM 3.1's masks stream in */
export type Pt = [number, number, number];

/**
 * Splits the stream into objects: each point joins the nearest object that has no point in its frame yet.
 * SAM sends every object's centroid frame by frame, so nearest-neighbour linking is enough.
 */
export function linkObjects(pts: Pt[], W: number, H: number): Pt[][] {
  const objs: Pt[][] = [];
  const reach = 0.2 * Math.max(W, H);
  for (const p of [...pts].sort((a, b) => a[0] - b[0])) {
    let best = -1, bd = Infinity;
    for (let j = 0; j < objs.length; j++) {
      const last = objs[j][objs[j].length - 1];
      if (last[0] >= p[0]) continue;
      const d = Math.hypot(last[1] - p[1], last[2] - p[2]);
      if (d < bd) (bd = d), (best = j);
    }
    if (best >= 0 && bd < reach) objs[best].push(p);
    else objs.push([p]);
  }
  return objs;
}

/** The object that moves the most so far (the others are rulers, flags and bystanders). */
export function pickSubject(objs: Pt[][]): number {
  let best = -1, score = -1;
  objs.forEach((o, j) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const p of o) (x0 = Math.min(x0, p[1])), (x1 = Math.max(x1, p[1])), (y0 = Math.min(y0, p[2])), (y1 = Math.max(y1, p[2]));
    const s = Math.hypot(x1 - x0, y1 - y0) + o.length * 1e-3;
    if (s > score) (score = s), (best = j);
  });
  return best;
}

/**
 * The strip column of each measured point, when the stream doesn't say: the measured points are the subject's
 * tracked frames inside the motion window, every s-th one, so slide them along each object's track and keep the
 * offset whose differences are most constant (a jumper is measured at the top of his mask, not its centroid).
 */
export function alignMeasure(px: [number, number][], objs: Pt[][]): number[] | null {
  const n = px.length;
  if (n < 3) return null;
  let best: { score: number; o: Pt[]; off: number; s: number } | null = null;
  for (const o of objs) {
    const L = o.length;
    for (let s = 1; s <= Math.min(6, Math.max(1, Math.ceil(L / n))); s++) {
      for (let off = 0; off + (n - 1) * s < L; off++) {
        let sx = 0, sy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < n; i++) {
          const q = o[off + i * s];
          const dx = px[i][0] - q[1], dy = px[i][1] - q[2];
          sx += dx, sy += dy, sxx += dx * dx, syy += dy * dy;
        }
        const score = sxx / n - (sx / n) ** 2 + syy / n - (sy / n) ** 2;
        if (!best || score < best.score) best = { score, o, off, s };
      }
    }
  }
  if (!best) return null;
  const { o, off, s } = best;
  return px.map((_, i) => o[off + i * s][0]);
}

export type ClockIn = {
  /** the clip's length in seconds (from the video element) */
  duration: number;
  /** frames SAM was sent (the track update's `frames`) */
  frames: number;
  /** the clip's frame rate, read from the upload step */
  fps?: number;
  /** the observer's motion window */
  window?: { start_s: number; end_s: number };
  /** the window the track step reported it cut, when it cut one */
  cut?: [number, number];
};

/**
 * Which clip time each tracked frame came from. The run cuts the observer's window (padded by 0.4 s) out of the clip
 * when it is short, and thins it to at most 450 frames; frame k of that cut is clip frame first + k·every.
 */
export function clockOf(c: ClockIn) {
  const dur = c.duration;
  let w0 = 0, w1 = dur;
  if (c.window) {
    w0 = Math.max(0, Math.min(c.window.start_s, dur) - 0.4);
    w1 = Math.min(dur, (c.window.end_s > c.window.start_s ? c.window.end_s : dur) + 0.4);
  }
  // the track step prints its window to 0.1 s: trust it only where the observer's own numbers disagree
  if (c.cut && (Math.abs(c.cut[0] - w0) > 0.06 || Math.abs(c.cut[1] - w1) > 0.06)) [w0, w1] = c.cut;
  const span = w1 - w0;
  let cutUsed = !!c.cut || (span < 0.8 * dur && span > 0.5);
  if (!cutUsed && c.fps && c.frames < 0.9 * dur * c.fps) cutUsed = true;
  if (!cutUsed) (w0 = 0), (w1 = dur);
  const fps = c.fps && c.fps > 0 ? c.fps : c.frames / Math.max(1e-6, w1 - w0);
  const j0 = cutUsed ? Math.max(0, Math.ceil(w0 * fps - 1e-3)) : 0;
  const every = cutUsed ? Math.max(1, Math.round(((w1 - w0) * fps) / c.frames)) : 1;
  return {
    fps,
    every,
    /** the middle of frame k's display interval, for seeking */
    tOf: (k: number) => (j0 + k * every + 0.5) / fps,
    /** where clip time t falls along the tracked frames, in frames (fractional) */
    kAt: (t: number) => (t * fps - j0) / every,
    /** the tracked frame shown at clip time t, or -1 */
    kOf: (t: number) => {
      const j = Math.round(t * fps) - j0;
      if (j < 0 || j % every) return -1;
      const k = j / every;
      return k < c.frames ? k : -1;
    },
  };
}

/** A law's miss on the unseen frames, in millimetres when it is a length (the race counts it up in mm). */
export function missOf(miss: string, rel: number): { value: number; unit: string } {
  const m = /^\s*([\d.,]+)\s*(mm|cm|m|°|deg|rad)?/.exec(miss);
  if (!m) return { value: rel, unit: "" };
  const v = Number(m[1].replace(/,/g, ""));
  const u = m[2] ?? "";
  const mm = { mm: 1, cm: 10, m: 1000 }[u as "mm" | "cm" | "m"];
  if (mm) {
    const fromRel = rel * 1000;
    // rel is the same miss in metres, to more digits than the label
    return { value: Number.isFinite(fromRel) && Math.abs(fromRel - v * mm) <= 0.06 * v * mm + 0.06 * mm ? fromRel : v * mm, unit: "mm" };
  }
  return { value: v, unit: u };
}

export function fmtMiss(v: number, unit: string) {
  if (unit === "mm") return `${v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString("en-US")} mm`;
  return `${v < 10 ? v.toFixed(2) : v.toFixed(1)}${unit ? (unit === "°" ? "°" : ` ${unit}`) : ""}`;
}

/**
 * The frame SAM's coordinates live in, given the size the run reported (the clip's display size) and the size the
 * browser decodes. They agree for square pixels. A clip normalised down to 1280 px is the same picture, scaled. A clip
 * with non-square pixels (old broadcast footage) is measured on its stored frame, which the browser keeps as its width
 * while stretching its height, so x is in the browser's own units there.
 */
export function samFrame(w: number, h: number, vw: number, vh: number): [number, number] {
  if (!vw || !vh) return [w, h];
  const rx = vw / w, ry = vh / h;
  if (Math.abs(rx - 1) < 0.01 && Math.abs(ry - 1) < 0.01) return [w, h];
  if (Math.max(w, h) >= 1278) return [w, h];
  if (rx > 1.01 && Math.abs(rx - ry) < 0.02) return [vw, h];
  return [w, h];
}

/** What the end of a run shows in large type: the measured value against the known one (as /x/<id> leads with). */
export type Readout = { label: string; value: string; against: string };

/** The fields of a stored experiment the readout reads (a record from /x/<id>/record.json has them all). */
type ReadoutRecord = {
  winner: string;
  clock: { factor: number; sigma?: number } | null;
  comparisons: { param: string; measured: number; sigma: number; reference: number; label: string; errorPct: number; withinSigma: number }[];
  candidates: { law: { id: string; params: { name: string; unit?: string; fixed?: boolean }[] }; fit: { ok?: boolean; testRms: number; testZ?: number; trainZ?: number; predicted?: Record<string, number[]> }; rank: number }[];
  measured: { calibration: { kind: string }; px: unknown[] };
  trainFrac?: number;
  extras?: { truth?: { rows: { label: string; param: string; measured: number; sigma: number; truth: number; unit: string }[] }; errorBudget?: { rows: { source: string; value: number; included: boolean }[] } };
};

const sig = (v: number, n = 2) => (Number.isFinite(v) ? String(+v.toPrecision(n)) : "—");

/** Units as a textbook prints them ("m/s^2" → "m/s²"; a per-length-squared-per-second-squared as "m⁻²s⁻²"). */
function unitText(u?: string) {
  if (!u || u === "1" || u === "-") return "";
  const map: Record<string, string> = { "1/(m²·s²)": "m⁻²s⁻²" };
  return ` ${map[u] ?? prettyUnit(u)}`;
}

/**
 * The large readout at the end of a run: how much slower than life the clip plays when gravity says so; else the
 * measured constant against its known value (or, for a clip we rendered, against the value it was rendered with);
 * else the winning law's miss on the unseen frames. The same choice /x/<id> makes.
 */
export function readoutOf(e: ReadoutRecord): Readout {
  const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  const free = win.law.params.filter((p) => !p.fixed && p.name !== "cal");
  const rough = Number.isFinite(win.fit.testZ) && win.fit.testZ! > 5;
  if (e.clock) {
    return {
      label: "How much slower than life the clip plays",
      value: rough ? `about ${e.clock.factor.toFixed(1)}×` : `${e.clock.factor.toFixed(2)}${e.clock.sigma ? ` ± ${e.clock.sigma.toFixed(2)}` : ""}×`,
      against: rough
        ? `Unconfirmed: gravity came out too weak for the world, and the winning law misses the unseen frames by ${sig(win.fit.testZ!)}× the noise.`
        : "From gravity coming out too weak against the world’s known value, so it assumes the world.",
    };
  }
  const point = e.extras?.errorBudget?.rows.find((r) => !r.included && /point of the body/.test(r.source));
  const cmp = e.comparisons.find((c) => free.some((p) => p.name === c.param));
  if (cmp) {
    const p = free.find((q) => q.name === cmp.param)!;
    const v = /accelerates at g|gravity/i.test(cmp.label) ? Math.abs(cmp.measured) : cmp.measured;
    const u = unitText(p.unit);
    return {
      label: cmp.label.charAt(0).toUpperCase() + cmp.label.slice(1),
      value: rough ? `about ${sig(v)}${u}` : `${fmtPair(v, cmp.sigma)}${u}`,
      against: `Known value ${+cmp.reference.toPrecision(4)}${u}: off by ${sig(Math.abs(cmp.errorPct))}%${Number.isFinite(cmp.withinSigma) && cmp.withinSigma < 20 ? `, ${sig(cmp.withinSigma)}σ` : ""}.${point ? ` Which point of the body is followed adds a further ±${point.value}${u}.` : ""}`,
    };
  }
  // a rendered clip: the constant only the winning law has, against the value the clip was rendered with
  const rows = (e.extras?.truth?.rows ?? []).filter((r) => free.some((p) => p.name === r.param));
  if (rows.length) {
    const runner = e.candidates.find((c) => c.law.id !== win.law.id && c.fit.ok !== false);
    const own = rows.find((r) => !runner?.law.params.some((p) => p.name === r.param && !p.fixed)) ?? rows[0];
    const errPct = ((own.measured - own.truth) / own.truth) * 100;
    const z = own.sigma > 0 ? Math.abs(own.measured - own.truth) / own.sigma : NaN;
    const u = unitText(own.unit);
    return {
      label: own.label.charAt(0).toUpperCase() + own.label.slice(1),
      value: `${fmtPair(own.measured, own.sigma)}${u}`,
      against: `Rendered with ${+own.truth.toPrecision(4)}${u}: off by ${sig(Math.abs(errPct))}%${Number.isFinite(z) && z < 20 ? `, ${sig(z)}σ` : ""}.`,
    };
  }
  const n = e.measured.px.length;
  const unseen = n - Math.max(1, Math.round(n * (e.trainFrac ?? 0.7)));
  const angle = !!win.fit.predicted && Object.keys(win.fit.predicted).length === 1 && "theta" in win.fit.predicted;
  const v = win.fit.testRms;
  const len = !Number.isFinite(v) ? "—" : angle ? `${((v * 180) / Math.PI).toFixed(2)}°` : e.measured.calibration.kind === "none" ? `${v.toFixed(1)} px` : v < 0.01 ? `${(v * 1000).toFixed(1)} mm` : `${(v * 100).toFixed(1)} cm`;
  return {
    label: `Average miss on the ${unseen} frames no law was fitted to`,
    value: len,
    against: Number.isFinite(win.fit.testZ) ? `${sig(win.fit.testZ!)}× the measurement noise.` : "",
  };
}

/** The ranking's own score for a law: the worse of its misses on the fitted and the unseen frames, in noise units. */
export function noiseScore(fit: { ok?: boolean; testZ?: number; trainZ?: number }) {
  if (fit.ok === false || !Number.isFinite(fit.testZ)) return undefined;
  return Math.max(fit.testZ!, Number.isFinite(fit.trainZ) ? fit.trainZ! : 0);
}

/** Two noise-unit scores the ranking calls a tie (lib/experiment.ts rankCandidates uses the same rule). */
export function tiedScores(a: number, b: number) {
  return Math.max(a, b) < 1.5 || Math.abs(a - b) < Math.max(0.1 * Math.max(a, b), 0.5);
}

/** "1.0×", "237×": a noise-unit miss, to two figures. */
export function fmtZ(z: number) {
  return `${z < 10 ? z.toFixed(1) : Math.round(z).toLocaleString("en-US")}×`;
}

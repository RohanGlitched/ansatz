/**
 * One experiment, end to end: observe → measure → hypothesise → fit and falsify → referee → report.
 * Each step emits progress so the page can show the method as it happens, and the finished record keeps
 * everything a reader needs to check it: the tracked pixels, every candidate's fit and prediction error,
 * the model calls and their cost.
 */
import { deleteFile, Ledger, transcribe, uploadFile, type Call } from "./meta/client";
import { trackBoxes, trackNoun, type LiveMask, type SamResult, type Sample, type Track } from "./meta/sam";
import { digest, localGravity, mainTrack, measure, type Calibration, type Measured, type Pivot } from "./measure";
import { compileLaw, fitLaw, type Fit, type Law, type Series } from "./physics/law";
import { controls } from "./physics/library";
import { critique, eyeball, hypothesise, MODELS, observe, point as pointAt, reviseAgentic, type Critique, type Eyeball, type Observation, type WonderAttempt } from "./scientist";
import { readVideoInfo, type VideoInfo } from "./video";
import { toPixels } from "./pixels";
import { metrePower, prettyUnit } from "./units";
import { lawLatex } from "./latex";
export { toPixels };
import { cut, frameAt, prepare } from "./transcode";

export type Step = "upload" | "listen" | "observe" | "track" | "measure" | "hypothesise" | "fit" | "referee" | "report";

export type Progress = { step: Step; state: "start" | "done" | "fail" | "update"; detail?: string; at: number; data?: unknown };

export type Candidate = {
  /** the law as proposed (what pages and models see) */
  law: Law;
  /** the law actually fitted: `law` plus any measurement-only parameters (the scale correction) */
  fitted?: Law;
  fit: Fit;
  origin: "muse" | "control" | "revision";
  ifItWins?: string;
  rank: number;
};

export type Comparison = { param: string; measured: number; sigma: number; reference: number; label: string; errorPct: number; withinSigma: number };

export type Experiment = {
  id: string;
  createdAt: string;
  title: string;
  source: { kind: "upload" | "showcase"; video: string; credit?: string; license?: string; page?: string };
  video: Pick<VideoInfo, "width" | "height" | "fps" | "duration" | "codec" | "rotation"> & { frames: number; jitter: number };
  narration?: { transcript: string; turns: { startMs: number; endMs: number; transcript: string }[] };
  observation: Observation;
  observationSources: { url: string; title: string }[];
  tracking: { noun: string; tracks: number; framesSeen: number; meanConfidence: number };
  measured: Pick<Measured, "calibration" | "pivot" | "line" | "coverage" | "noise" | "window" | "slowMotion" | "origin"> & { series: Measured["series"]; px: Measured["px"]; point?: "centroid" | "top" };
  given: string[];
  reasoning: string;
  candidates: Candidate[];
  winner: string;
  critique: Critique | null;
  /** at most a dozen plain words; no numbers */
  headline: string;
  finding: string;
  comparisons: Comparison[];
  eyeball: (Eyeball & { model: string }) | null;
  /** set when the measured gravity says the clip's clock isn't real time */
  clock: { factor: number; note: string } | null;
  whatIf: { label: string; param: string; factor: number; px: { x: number; y: number }[] }[];
  strobe: { f: number; t: number; box: Sample["box"]; rle: Sample["rle"] }[];
  trainFrac: number;
  /** what Muse Wonder did when it was asked for one more law: the laws it tried on the fitted frames, and what it submitted */
  wonder?: { idea: string; attempts: WonderAttempt[]; submitted: string | null } | null;
  /** hand-made notes for a showcase: a robustness table, an independent cross-check, caveats on the ruler */
  extras?: { truth?: { note: string; rows: { label: string; param: string; measured: number; sigma: number; truth: number; unit: string }[] }; robustness?: { note: string; rows: { label: string; g: number; sigma: number }[] }; crossCheck?: string; eyeballNote?: string; ruler?: string; memoryTest?: { note: string; rows: { clip: string; eye?: number; g: number; sigma: number; clock: string; href?: string }[] } };
  ledger: { calls: Call[]; usd: number; tokens: number; ms: number };
  models: typeof MODELS;
  /** which version of the method produced this record, and whether the clip was one of the site's own samples */
  pipeline?: string;
  sample?: boolean;
};

/** Bumped when the method changes in a way that changes results; older visitor runs stop being listed. */
export const PIPELINE = "2026-10-27c";

const TRAIN = 0.7;

export class ExperimentError extends Error {
  constructor(message: string, readonly step: Step) {
    super(message);
  }
}

export function newId() {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

// plain decimals down to a millionth (0.00037, not 3.70e-4); exponents only for the very large or very small
const fmtNum = (v: number, sig = 3) => (Math.abs(v) >= 1e4 || (Math.abs(v) < 1e-6 && v !== 0) ? v.toExponential(2) : (+v.toPrecision(sig)).toString());

/** Writes "g = {g}" as "g = 9.79 ± 0.04 m/s²" using the fitted values, never the model's numbers. */
export function fillPlaceholders(text: string, fit: Fit, law: Law) {
  return text.replace(/\{([A-Za-z_][A-Za-z_0-9]*)\}/g, (m, name) => {
    if (!(name in fit.theta)) return m;
    const p = law.params.find((q) => q.name === name);
    const v = fit.theta[name], s = fit.sigma[name];
    const unit = p?.unit && p.unit !== "1" && p.unit !== "-" ? ` ${prettyUnit(p.unit)}` : "";
    return s && Number.isFinite(s) && !p?.fixed ? `${fmtNum(v)} ± ${fmtNum(s, 2)}${unit}` : `${fmtNum(v)}${unit}`;
  });
}

/** Residual pattern the referee reads: mean residual in eight time bins per channel, over the fitted frames only. */
export function residualPattern(fit: Fit, m: Measured, frac = 1) {
  const out: Record<string, number[]> = {};
  const n = Math.max(3, Math.round(m.series.t.length * frac));
  for (const [ch, pred] of Object.entries(fit.predicted)) {
    const ob = m.series.ch[ch];
    if (!ob) continue;
    const bins = new Array(8).fill(0), cnt = new Array(8).fill(0);
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(ob[i]) || !Number.isFinite(pred[i])) continue;
      const b = Math.min(7, Math.floor((i / n) * 8));
      bins[b] += pred[i] - ob[i];
      cnt[b]++;
    }
    out[ch] = bins.map((s, i) => +(cnt[i] ? s / cnt[i] : 0).toPrecision(3));
  }
  return out;
}

/**
 * Ranks by prediction error on the unseen frames. Two laws whose errors differ by less than the
 * measurement noise (or 3%) are a tie, and a tie goes to the simpler law (lower BIC): Occam, measured.
 */
export function rankCandidates(cands: Candidate[], noiseFloor = 0) {
  // one yardstick for every law: error in units of measurement noise (laws may observe different channels), on the
  // worse of its two halves. Predicting the unseen frames is the test; but a law that can't describe the frames it
  // was fitted to hasn't explained the motion, even if a quiet ending happens to suit it
  const score = (c: Candidate) => {
    if (!c.fit.ok) return Infinity;
    if (Number.isFinite(c.fit.testZ)) return Math.max(c.fit.testZ!, Number.isFinite(c.fit.trainZ) ? c.fit.trainZ! : 0);
    return noiseFloor > 0 ? c.fit.testRms / noiseFloor : c.fit.testRms;
  };
  // a perfect law misses by about 1 (pure noise): two laws that both predict within the noise are equally good, and
  // otherwise half a noise unit or 10% apart is too close to call
  const tie = (fa: number, fb: number) => Math.max(fa, fb) < 1.5 || Math.abs(fa - fb) < Math.max(0.1 * Math.max(fa, fb), 0.5);
  // a law whose fitted parameter is pressed against its bound was limited, not measured: it ranks after every
  // law whose parameters all landed inside their ranges
  const pinned = (c: Candidate) => c.law.params.some((p) => !p.fixed && p.name !== "cal" && atBound(c.law, p.name, c.fit.theta[p.name]));
  // among laws that predict equally well, the simpler one wins: fewer parameters, then clearly lower BIC, then the
  // smaller error
  // (a strict key, so the order is transitive: BIC in steps of 2, the usual threshold for "positive evidence"). Two
  // laws that are the same equation fit identically; then the one written in physical quantities (g, not a) leads
  const origin = (c: Candidate) => (c.origin === "control" ? 1 : 0);
  const simpler = (a: Candidate, b: Candidate) =>
    a.fit.k - b.fit.k || Math.round(a.fit.bic / 2) - Math.round(b.fit.bic / 2) || Math.round((score(a) - score(b)) * 1e3) || origin(a) - origin(b) || a.law.id.localeCompare(b.law.id);
  // rank by repeated selection, so the result doesn't depend on the order the laws arrived in: each place goes to
  // the simplest law among those tied with the best remaining error
  const out: Candidate[] = [];
  for (const group of [cands.filter((c) => c.fit.ok && !pinned(c)), cands.filter((c) => c.fit.ok && pinned(c)), cands.filter((c) => !c.fit.ok)]) {
    const left = [...group];
    while (left.length) {
      const best = Math.min(...left.map(score));
      const pool = Number.isFinite(best) ? left.filter((c) => tie(score(c), best)) : left;
      const pick = pool.sort(simpler)[0];
      out.push(pick);
      left.splice(left.indexOf(pick), 1);
    }
  }
  cands.splice(0, cands.length, ...out);
  cands.forEach((c, i) => (c.rank = i + 1));
}

function referenceValues(law: Law, fit: Fit, obs: Observation, gUsed: number | null, stated: Record<string, number>, line?: Measured["line"], m?: Measured): Comparison[] {
  const out: Comparison[] = [];
  // a free flight written as uniform acceleration along a vertical path: |a| is the gravity it measured
  const a = law.params.find((p) => !p.fixed && /^a$/i.test(p.name) && /m\/s/.test(p.unit ?? ""));
  if (a && gUsed === null && obs.motion_kind === "flight" && line && Math.abs(line.uy) > 0.95 && !law.params.some((p) => p.name === "g" && !p.fixed)) {
    const v = Math.abs(fit.theta[a.name]), s = fit.sigma[a.name] || 0;
    const ref = localGravity(obs.body, obs.location.latitude_deg ?? undefined);
    if (Number.isFinite(v)) out.push({ param: a.name, measured: v, sigma: s, reference: ref, label: `${obs.body === "earth" ? "standard gravity on Earth" : `surface gravity of the ${obs.body === "moon" ? "Moon" : obs.body}`} (a fall straight down accelerates at g)`, errorPct: ((v - ref) / ref) * 100, withinSigma: s ? Math.abs(v - ref) / s : NaN });
  }
  // a pendulum written with an angular frequency w0 = sqrt(g/L): with L known, g = w0² L is a measurement too
  const w = law.params.find((p) => !p.fixed && (/^(w0|w|omega0|omega)$/i.test(p.name) || /angular frequency/i.test(p.meaning ?? "")));
  // L is the narrator's figure, or else the radius of the swing's circle measured against the ruler in view
  const ruled = m?.pivot && (m.calibration.kind === "reference" || m.calibration.kind === "stated") && m.pivot.arcDeg > 15;
  const Lm = stated.l ?? (ruled ? m!.pivot!.r * m!.calibration.metresPerPixel : undefined);
  const relL = stated.l !== undefined ? 0 : ruled ? Math.hypot(m!.pivot!.rmsPx / m!.pivot!.r, obs.reference.relative_uncertainty ?? 0.05) : 0;
  if (w && Lm !== undefined && !law.params.some((p) => p.name === "g" && !p.fixed) && gUsed === null) {
    const v = fit.theta[w.name] ** 2 * Lm, s = Math.hypot(2 * fit.theta[w.name] * Lm * (fit.sigma[w.name] || 0), v * relL);
    const ref = localGravity(obs.body, obs.location.latitude_deg ?? undefined);
    if (Number.isFinite(v)) out.push({ param: "g", measured: v, sigma: s, reference: ref, label: `${obs.body === "earth" ? "standard gravity on Earth" : `gravity on the ${obs.body}`} (g = ω₀²L)`, errorPct: ((v - ref) / ref) * 100, withinSigma: s ? Math.abs(v - ref) / s : NaN });
  }
  for (const p of law.params) {
    if (p.fixed || p.name === "cal") continue;
    const v = fit.theta[p.name], s = fit.sigma[p.name];
    let ref: number | undefined, label = "";
    const nm = p.name.toLowerCase();
    if ((nm === "g" || /gravit/.test(p.meaning ?? "")) && gUsed === null) {
      ref = localGravity(obs.body, obs.location.latitude_deg ?? undefined);
      label = obs.body === "earth" ? (obs.location.latitude_deg !== null ? `normal gravity at ${obs.location.latitude_deg.toFixed(1)}° latitude` : "standard gravity on Earth") : `surface gravity of the ${obs.body === "moon" ? "Moon" : obs.body === "mars" ? "planet Mars" : obs.body}`;
    } else if (stated[nm] !== undefined) {
      ref = stated[nm];
      label = "what the narrator said";
    }
    if (ref !== undefined && Number.isFinite(v)) out.push({ param: p.name, measured: v, sigma: s, reference: ref, label, errorPct: ((v - ref) / ref) * 100, withinSigma: s ? Math.abs(v - ref) / s : NaN });
  }
  return out;
}

export type RunInput = {
  /** the experiment's id (chosen up front so the clip can be stored under it) */
  id?: string;
  video: Uint8Array;
  filename: string;
  narrationWav?: Uint8Array | null;
  narrationText?: string;
  source?: Experiment["source"];
  /** the clip is one of the site's bundled samples */
  sample?: boolean;
  /** the narration's language, as a name ("Hindi"), when the person filming says which */
  language?: string;
  hints?: { slowMotion?: number; noun?: string; window?: { start_s: number; end_s: number }; ruler?: { noun: string; metres: number; dimension?: "longest side" | "shortest side"; relUncertainty?: number } };
  skipEyeball?: boolean;
  /** called with the normalised clip (H.264, ≤1280 px) so the caller can store it for playback */
  onPrepared?: (video: Uint8Array) => Promise<string | void>;
};

export async function runExperiment(input: RunInput, emit: (p: Progress) => void = () => {}): Promise<Experiment> {
  const t0 = Date.now();
  const ledger = new Ledger();
  const step = async <T>(s: Step, fn: () => Promise<T>, detail?: (r: T) => string, data?: (r: T) => unknown): Promise<T> => {
    emit({ step: s, state: "start", at: Date.now() - t0 });
    try {
      const r = await fn();
      emit({ step: s, state: "done", detail: detail?.(r), at: Date.now() - t0, data: data?.(r) });
      return r;
    } catch (e) {
      const msg = (e as Error).message;
      emit({ step: s, state: "fail", detail: msg, at: Date.now() - t0 });
      throw e instanceof ExperimentError ? e : new ExperimentError(msg, s);
    }
  };

  // 1. the clip and its clock: normalise (H.264 ≤1280 px, original frame times, narration as WAV)
  const info = await step("upload", async () => {
    const raw = readVideoInfo(input.video);
    if (raw.duration > 60) throw new ExperimentError("Clips longer than 60 seconds aren't supported yet. Trim it to the motion.", "upload");
    const prep = await prepare(input.video, { maxSeconds: 60 });
    const vi = readVideoInfo(prep.video);
    if (vi.times.length < 12) throw new ExperimentError("That clip has too few frames to measure.", "upload");
    const fileId = await uploadFile(prep.video, "clip.mp4", "video/mp4");
    const stored = input.onPrepared ? await input.onPrepared(prep.video) : undefined;
    return { vi, fileId, prep, stored: stored || undefined, rawInfo: raw };
  }, (r) => `${r.vi.times.length} frames at ${r.vi.fps.toFixed(r.vi.fps % 1 ? 2 : 0)} fps (${r.rawInfo.codec}, ${r.rawInfo.width}×${r.rawInfo.height}), clock read from the file${r.prep.hadAudio ? ", narration found" : ""}`);
  const { vi, fileId, prep } = info;
  const extraFiles: string[] = [];

  try {
    // 2. narration
    let narration: Experiment["narration"];
    const wav = input.narrationWav?.length ? input.narrationWav : prep.wav;
    if (wav?.length) {
      const tr = await step("listen", () => transcribe(wav, ledger, { keywords: ["pendulum", "metre", "centimetre", "slow motion", "fps", "drop", "bounce"], languages: input.language ? [input.language] : undefined }), (r) => (r.transcript ? `“${r.transcript.slice(0, 120)}${r.transcript.length > 120 ? "…" : ""}”` : "no speech heard"));
      narration = { transcript: tr.transcript, turns: tr.turns.map((t) => ({ startMs: t.startMs, endMs: t.endMs, transcript: t.transcript })) };
    } else {
      if (input.narrationText) narration = { transcript: input.narrationText, turns: [] };
      emit({ step: "listen", state: "done", detail: input.narrationText ? "typed notes used; the clip has no sound" : "the clip has no sound", at: Date.now() - t0 });
    }
    const narr = narration?.transcript ?? "";

    // 3. observe
    const { obs, sources } = await step("observe", () => observe(fileId, narr, ledger, vi.duration), (r) => `${r.obs.phenomenon}: tracking “${r.obs.subjects[0]?.noun_phrase}”${r.obs.reference.present ? `, ruler “${r.obs.reference.noun_phrase}” (${r.obs.reference.real_length_m} m)` : ""}${r.obs.slow_motion.factor > 1 ? `, slowed ${r.obs.slow_motion.factor}×` : ""}`, (r) => r.obs);
    if (input.hints?.slowMotion) obs.slow_motion = { factor: input.hints.slowMotion, evidence: "given with the clip" };
    if (input.hints?.noun) obs.subjects = [{ noun_phrase: input.hints.noun, alternatives: [], description: "given with the clip" }];
    if (input.hints?.window) obs.window = input.hints.window;
    if (input.hints?.ruler) obs.reference = { present: true, noun_phrase: input.hints.ruler.noun, real_length_m: input.hints.ruler.metres, dimension: input.hints.ruler.dimension ?? "longest side", basis: "given with the clip", relative_uncertainty: input.hints.ruler.relUncertainty ?? obs.reference.relative_uncertainty ?? 0.03 };

    // 4. track: cut the motion window (+0.4 s each side), then SAM follows the subject (and the ruler) through every frame
    const subjectNoun = obs.subjects[0]?.noun_phrase || "ball";
    const padS = 0.4;
    const w0 = Math.max(0, Math.min(obs.window.start_s, vi.duration) - padS);
    const w1 = Math.min(vi.duration, (obs.window.end_s > obs.window.start_s ? obs.window.end_s : vi.duration) + padS);
    const framesInWindow = vi.times.filter((t) => t >= w0 && t <= w1).length;
    const MAX_SAM_FRAMES = Number(process.env.MAX_SAM_FRAMES ?? 450);
    const every = Math.max(1, Math.ceil(framesInWindow / MAX_SAM_FRAMES));
    const useCut = (w1 - w0 < vi.duration * 0.8 && w1 - w0 > 0.5) || every > 1;
    const [subj, ref, frameMap] = await step("track", async () => {
      let trackFile = fileId;
      let map = (f: number) => f;
      let frames = vi.times.length;
      let trackBytes = prep.video;
      let trackTimes = vi.times;
      if (useCut) {
        const clip = await cut(prep.video, w0, w1, every);
        const ci = readVideoInfo(clip);
        const offIdx = vi.times.findIndex((t) => t >= w0 - 1e-4);
        const offset = vi.times[Math.max(0, offIdx)];
        // cut frame k sits at offset + ci.times[k] in the full clip: map to the nearest full frame
        map = (k: number) => {
          const target = offset + (ci.times[k] ?? 0);
          let j = Math.max(0, offIdx);
          while (j < vi.times.length - 1 && Math.abs(vi.times[j + 1] - target) < Math.abs(vi.times[j] - target)) j++;
          return j;
        };
        trackFile = await uploadFile(clip, "window.mp4", "video/mp4");
        extraFiles.push(trackFile);
        frames = ci.times.length;
        trackBytes = clip;
        trackTimes = ci.times;
      }
      // SAM's masks are drawn on the clip as they stream in, a few times a second
      let buf: [number, number, number][] = [], last = 0;
      const flush = () => {
        if (!buf.length) return;
        emit({ step: "track", state: "update", at: Date.now() - t0, data: { width: vi.width, height: vi.height, frames, pts: buf } });
        buf = [];
        last = Date.now();
      };
      const onMask = (k: LiveMask) => {
        buf.push([k.f, Math.round(k.cx * 10) / 10, Math.round(k.cy * 10) / 10]);
        if (Date.now() - last > 300) flush();
      };
      const jobs: Promise<SamResult | null>[] = [trackNoun(trackFile, subjectNoun, ledger, frames, onMask).finally(flush)];
      const selfRuler = obs.reference.present && sameThing(obs.reference.noun_phrase, subjectNoun);
      // the ruler, found by name; failing that, Muse Spark points at it and SAM 3.1 follows the box (in parallel
      // with the subject, so the run doesn't wait twice)
      const findRuler = async (): Promise<SamResult | null> => {
        const byName = await trackNoun(trackFile, obs.reference.noun_phrase, ledger, frames).catch(() => null);
        if (byName?.tracks.length) return byName;
        const png = await frameAt(trackBytes, trackTimes[0] ?? 0);
        const box = await pointAt(png, { width: vi.width, height: vi.height }, obs.reference.noun_phrase, `a reference object of known size, ${obs.reference.real_length_m} m along its ${obs.reference.dimension}; it does not move`, ledger, true).catch(() => null);
        if (!box) return byName;
        const r2 = await trackBoxes(trackFile, { width: vi.width, height: vi.height }, [{ id: 1, frame: 0, box }], ledger, frames).catch(() => null);
        if (!r2?.tracks.length) return byName;
        for (const t of r2.tracks) t.noun = `${obs.reference.noun_phrase} (pointed out by Muse Spark)`;
        return r2;
      };
      jobs.push(obs.reference.present && obs.reference.noun_phrase && !selfRuler ? findRuler() : Promise.resolve(null));
      let [s, r] = await Promise.all(jobs);
      if (selfRuler) r = s;
      const moving = (res: SamResult | null) => !!res && res.tracks.some((t) => pathPx(t) > 20);
      if (!moving(s)) {
        // a shorter or plainer phrase often finds what a precise one misses
        for (const alt of altNouns(subjectNoun, obs)) {
          const s2 = await trackNoun(trackFile, alt, ledger, frames);
          if (moving(s2)) { s = s2; break; }
        }
      }
      if (!s || !moving(s)) {
        // no noun phrase found it: Muse Spark points at the object in one frame and SAM 3.1 follows that box
        const k = Math.max(0, trackTimes.findIndex((t) => t >= (useCut ? padS : obs.window.start_s)));
        const png = await frameAt(trackBytes, trackTimes[k] ?? 0);
        const box = await pointAt(png, { width: vi.width, height: vi.height }, subjectNoun, obs.subjects[0]?.description ?? "", ledger).catch(() => null);
        if (box) {
          const s3 = await trackBoxes(trackFile, { width: vi.width, height: vi.height }, [{ id: 1, frame: k, box }], ledger, frames).catch(() => null);
          if (s3 && moving(s3)) {
            for (const t of s3.tracks) t.noun = `${subjectNoun} (pointed out by Muse Spark)`;
            s = s3;
          }
        }
      }
      if (!s || !moving(s)) throw new ExperimentError(`SAM 3.1 couldn't find a moving “${subjectNoun}” in the clip. Name the moving object yourself and run it again.`, "track");
      for (const res of [s, r]) if (res) for (const t of res.tracks) for (const smp of t.samples) smp.f = map(smp.f);
      return [s, r, frames] as const;
    }, ([s, , n]) => `${s.tracks.length} object${s.tracks.length > 1 ? "s" : ""} named “${s.tracks[0].noun}”, ${Math.max(...s.tracks.map((t) => t.samples.length))} of ${n} frames with a mask${useCut ? ` (window ${w0.toFixed(1)}–${w1.toFixed(1)} s)` : ""}`);
    void frameMap;

    // 5. measure
    const slow = obs.slow_motion.factor > 1 ? obs.slow_motion.factor : 1;
    const winT = { t0: Math.max(0, obs.window.start_s), t1: Math.min(vi.duration, obs.window.end_s > obs.window.start_s ? obs.window.end_s : vi.duration) };
    const fOf = (t: number) => { let i = 0; while (i < vi.times.length - 1 && vi.times[i] < t) i++; return i; };
    const track = mainTrack(subj.tracks, fOf(winT.t0), fOf(winT.t1));
    if (!track) throw new ExperimentError("No track inside the motion window.", "measure");
    const gBody = localGravity(obs.body, obs.location.latitude_deg ?? undefined);
    // a jumping person: follow the head (top of the mask); arms and legs move the body's centroid around
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1] ?? 0;
    const tall = med(track.samples.map((s) => s.box[3] - s.box[1])) / Math.max(1, med(track.samples.map((s) => s.box[2] - s.box[0]))) > 1.8;
    const person = /\b(astronaut|person|man|woman|boy|girl|child|kid|jumper|athlete|player|dancer|student|human|spacesuit|suit)\b/i.test(`${subjectNoun} ${obs.subjects[0]?.description ?? ""}`);
    const point: "centroid" | "top" = person && tall && obs.motion_kind === "flight" ? "top" : "centroid";
    let scale: { value: number; kind: "reference" | "stated"; note: string } | null = null;
    if (ref && ref.tracks.length && obs.reference.real_length_m > 0) {
      const selfRuler = sameThing(obs.reference.noun_phrase, subjectNoun);
      const rt = selfRuler ? track : mainTrack(ref.tracks)!;
      // a moving ball smears along its path, so a round subject's true diameter is its mask's short axis;
      // anything elongated (a person, a stick) is measured along the side the observer named
      const med = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1] ?? 0;
      const round = med(rt.samples.map((s) => s.major)) / Math.max(1e-9, med(rt.samples.map((s) => s.minor))) < 1.35;
      const useMinor = obs.reference.dimension === "shortest side" || (selfRuler && round);
      // the mask's true extent along its axes (a moment-based size overstates a rectangle by 15%)
      // a standing person's height is the box's vertical extent in the frames where they stand tallest
      // (a crouch or tucked legs only ever make the box shorter), not the length of a tilted mask axis
      const personRuler = selfRuler && person && !useMinor;
      const lens = rt.samples.map((s) => (personRuler ? s.box[3] - s.box[1] : useMinor ? s.wid ?? s.minor : s.len ?? s.major)).sort((a, b) => a - b);
      const px = personRuler ? lens[Math.floor(lens.length * 0.75)] : lens[lens.length >> 1];
      if (px > 8) scale = { value: obs.reference.real_length_m / px, kind: "reference", note: `${obs.reference.noun_phrase} = ${obs.reference.real_length_m} m (${obs.reference.basis}) spans ${px.toFixed(0)} px in SAM's mask` };
    }
    const m = await step("measure", async () => {
      // gravity can only stand in for a ruler when the body flies freely: a ball rolling down a ramp accelerates at less than g
      let mm = measure({ track, times: vi.times, window: winT, slowMotion: slow, metresPerPixel: scale, gravity: gBody, kind: obs.motion_kind, point, noGravityRuler: obs.motion_kind === "swing" || obs.motion_kind === "oscillation" });
      if (obs.motion_kind === "swing" || obs.motion_kind === "oscillation") mm = trimStatic(mm, track, vi, winT, slow, scale, gBody, obs.motion_kind, { point, noGravityRuler: true });
      // a pendulum's angle needs no ruler: without one, measure only theta (lengths in pixels would mislead the theorist)
      if (mm.series.ch.theta && (mm.calibration.kind === "none" || mm.calibration.kind === "gravity")) {
        mm = { ...mm, calibration: { kind: "none", metresPerPixel: 1, note: "no ruler needed: the swing is measured as an angle" }, series: { t: mm.series.t, ch: { theta: mm.series.ch.theta } }, noise: { theta: mm.noise.theta } };
      }
      return mm;
    }, (r) => `${r.series.t.length} points over ${(r.series.t[r.series.t.length - 1]).toFixed(2)} s; ${r.calibration.note}${r.pivot ? "; swings about a pivot" : ""}`, (r) => {
      const step = Math.max(1, Math.ceil(r.px.length / 160));
      return { width: vi.width, height: vi.height, px: r.px.filter((_, i) => i % step === 0).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]), pivot: r.pivot ? [r.pivot.x, r.pivot.y] : null };
    });

    // what is given, not measured
    const given: string[] = [];
    const stated: Record<string, number> = {};
    if (m.calibration.kind === "gravity") given.push(`g = ${m.calibration.g.toFixed(3)} m/s² (${obs.body === "earth" ? "Earth" : obs.body}); it set the scale, so treat g as known and fixed`);
    if (m.calibration.kind === "reference") given.push(`scale: ${m.calibration.note}, known to ±${Math.round((obs.reference.relative_uncertainty ?? 0.03) * 100)}%`);
    if (slow > 1) given.push(`the clip plays ${slow}× slower than real life (${obs.slow_motion.evidence}); times are already corrected to real seconds`);
    for (const f of obs.stated_facts) {
      given.push(`${f.quantity} = ${f.value} ${f.unit} (“${f.said}”)`);
      const q = f.quantity.toLowerCase();
      if (/length|string|rope/.test(q) && /^m|metre|meter|cm/.test(f.unit.toLowerCase())) stated.l = /cm/.test(f.unit) ? f.value / 100 : f.value;
    }
    if (m.series.ch.theta && m.pivot && m.calibration.kind === "reference" && stated.l === undefined) {
      const lGeo = m.pivot.r * m.calibration.metresPerPixel;
      stated.l = lGeo;
      given.push(`pendulum length L = ${lGeo.toFixed(3)} m, measured from the radius of the swing with the ruler: hold L fixed and measure g`);
    } else if (m.series.ch.theta && !m.series.ch.x) {
      if (stated.l !== undefined) given.push(`pendulum length L = ${stated.l} m (stated): hold L fixed and measure g`);
      else given.push(`g = ${gBody.toFixed(3)} m/s² (${obs.body === "earth" ? "Earth" : obs.body}): hold g fixed and measure the pendulum's length L in metres from its swing`);
    }
    const gUsed = m.calibration.kind === "gravity" ? m.calibration.g : null;

    // 6. hypothesise
    // the theorist sees only the frames the laws are fitted to: the last 30% stays unseen by every model
    const dig = digest(m, 40, TRAIN);
    const hyp = await step("hypothesise", () => hypothesise(obs, dig, given, ledger), (r) => r.laws.map((l) => l.title).join("; "), (r) => ({ reasoning: r.reasoning, laws: r.laws.map((l) => ({ id: l.id, title: l.title, summary: l.summary, latex: safeLatex(l) })) }));

    // 7. fit every candidate on the first 70%, predict the rest
    const channels = Object.keys(m.series.ch);
    const noiseFloor = Math.sqrt(Object.values(m.noise).reduce((s2, v) => s2 + v * v, 0) / Math.max(1, Object.keys(m.noise).length));
    const cands: Candidate[] = await step("fit", async () => {
      const list: Candidate[] = [];
      const seen = new Set<string>();
      const add = (law: Law, origin: Candidate["origin"], ifItWins?: string) => {
        let id = law.id;
        while (seen.has(id)) id += "-2";
        seen.add(id);
        const l = { ...law, id };
        if (gUsed !== null) for (const p of l.params) if (p.name === "g") { p.guess = gUsed; p.fixed = true; }
        // the scale correction is the measurement's business, not the law's: fit the wrapped law, show the inner one
        const wrap = (x: Law) => (gUsed !== null ? withScaleCorrection(x) : x);
        const { law: law2, fitted, fit } = fitWithRoom(l, m.series, wrap);
        list.push({ law: law2, fitted, fit, origin, ifItWins, rank: 0 });
      };
      for (const l of hyp.laws) add(l, "muse", hyp.ifItWins[l.id]);
      for (const l of controls(channels, { g: gUsed ?? gBody, gFixed: gUsed !== null })) add(l, "control");
      rankCandidates(list, noiseFloor);
      return list;
    }, (r) => `${r.length} laws fitted; the best predicts the unseen ${Math.round((1 - TRAIN) * 100)}% to within ${fmtErr(r[0].fit.testRms, m.calibration, !m.series.ch.x && !!m.series.ch.theta)}`, (r) => ({
      board: r.map((c) => ({ id: c.law.id, title: c.law.title, origin: c.origin, rank: c.rank, miss: fmtErr(c.fit.testRms, m.calibration, !m.series.ch.x && !!m.series.ch.theta), rel: c.fit.testRms, latex: safeLatex(c.law), path: toPixels(c.fit.predicted, m).filter((_, i, a) => i % Math.max(1, Math.ceil(a.length / 160)) === 0).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]) })),
    }));

    // the ruler's own uncertainty moves every length-carrying constant: add it to the fit's statistical error. When
    // gravity is the ruler (a given g, or a fall that sets the scale), the ruler is good to the spread of g over
    // Earth's surface (9.78 to 9.83, ±0.26%), or ±0.05% where the latitude is known
    const gRel = obs.location.latitude_deg != null ? 0.0005 : 0.0026;
    const rulerRel = m.calibration.kind === "reference" ? Math.max(0, obs.reference.relative_uncertainty ?? 0.03) : obs.body === "earth" && (m.calibration.kind === "gravity" || gUsed !== null) ? gRel : 0;
    const inflate = (c: Candidate) => {
      if (!rulerRel || (c.fit as Fit & { rulerAdded?: boolean }).rulerAdded) return;
      for (const p of c.law.params) {
        if (p.fixed) continue;
        const pw = metrePower(p.unit);
        const v = c.fit.theta[p.name], sStat = c.fit.sigma[p.name];
        if (pw && Number.isFinite(v)) c.fit.sigma[p.name] = Math.hypot(Number.isFinite(sStat) ? sStat : 0, Math.abs(pw) * rulerRel * Math.abs(v));
      }
      (c.fit as Fit & { rulerAdded?: boolean }).rulerAdded = true;
    };
    cands.forEach(inflate);

    // 8. referee (and one revision), with the eyeball baseline in parallel
    const boardOf = () => cands.map((c) => ({
      id: c.law.id,
      title: c.law.title,
      origin: c.origin,
      rank: c.rank,
      equations: c.law.derivatives,
      observes: c.law.observe,
      events: c.law.events ?? [],
      fitted: Object.fromEntries(Object.keys(c.fit.theta).filter((k) => !k.endsWith("@0") && k !== "cal").map((k) => [k, `${fmtNum(c.fit.theta[k])} ± ${fmtNum(c.fit.sigma[k], 2)}${atBound(c.law, k, c.fit.theta[k]) ? " (stuck at its limit)" : ""}`])),
      train_rms: c.fit.trainRms,
      bic: c.fit.bic,
      ok: c.fit.ok,
      error: c.fit.why,
      residual_by_time_bin_on_fitted_frames: residualPattern(c.fit, m, TRAIN),
    }));
    const board = boardOf();
    const winnerFirst = cands[0];
    const eyePromise: Promise<Eyeball | null> = input.skipEyeball
      ? Promise.resolve(null)
      : winnerFirst.law.params.some((p) => !p.fixed && p.name !== "cal") === false
        ? Promise.resolve(null)
        : eyeball(fileId, narr, winnerFirst.law.params.filter((p) => !p.fixed && p.name !== "cal").map((p) => ({ name: p.name, unit: p.unit ?? "", meaning: p.meaning ?? p.name })), ledger).catch(() => null);
    const winnerAtReferee = cands[0].law.id;
    let wonder: Experiment["wonder"] = null;
    const crit = await step("referee", async () => {
      let c = await critique(obs, { units: dig.units, given, candidates: board }, ledger).catch(() => null);
      if (c) c.winnerId = cands[0].law.id;
      // Muse Wonder steps in when the referee names a missing effect, or when even the winner misses the frames it
      // was fitted to by more than three times the measurement noise (judged on fitted frames only)
      const lead = cands[0];
      const poorFit = lead.fit.ok && lead.fit.trainRms > Number(process.env.WONDER_POOR_FIT ?? 6) * noiseFloor;
      const idea = c?.verdict === "revise" && c.revision_idea ? c.revision_idea : poorFit ? `The winner misses even the frames it was fitted to by ${(lead.fit.trainRms / noiseFloor).toFixed(1)} times the measurement noise; some effect is missing.` : "";
      // a run must finish inside the 300 s function limit (the watchdog fires at 285 s)
      const budgetLeft = Number(process.env.RUN_BUDGET_MS ?? 250_000) - (Date.now() - t0);
      // two theorist turns take about a minute; more turns only when there's room
      if (idea && budgetLeft > 75_000) {
        try {
          const tryLaw = (law: Law) => {
            const l2 = { ...law, params: law.params.filter((p) => p.name !== "cal") };
            if (gUsed !== null) for (const p of l2.params) if (p.name === "g") { p.guess = gUsed; p.fixed = true; }
            const wrapped = gUsed !== null ? withScaleCorrection(l2) : l2;
            const f = fitLaw(wrapped, m.series, { trainFrac: TRAIN });
            return {
              ok: f.ok,
              error: f.why,
              train_rms: f.trainRms,
              fitted: Object.fromEntries(Object.keys(f.theta).filter((k) => !k.endsWith("@0") && k !== "cal").map((k) => [k, `${fmtNum(f.theta[k])} ± ${fmtNum(f.sigma[k], 2)}${atBound(l2, k, f.theta[k]) ? " (stuck at its bound)" : ""}`])),
              residual_by_time_bin_on_fitted_frames: residualPattern(f, m, TRAIN),
            };
          };
          const { law: revised, attempts, auto } = await reviseAgentic(obs, { units: dig.units, given, candidates: board }, idea, tryLaw, ledger, undefined, Math.min(Number(process.env.WONDER_MAX_TURNS ?? 3), budgetLeft > 170_000 ? 6 : budgetLeft > 110_000 ? 3 : 2));
          wonder = { idea, attempts, submitted: revised ? `${revised.title}${auto ? " (its best attempt, entered for it when its turns ran out)" : ""}` : null };
          if (!revised) throw new Error("no law submitted");
          const law = revised;
          compileLaw(law);
          if (gUsed !== null) for (const p of law.params) if (p.name === "g") { p.guess = gUsed; p.fixed = true; }
          const inner = { ...law, id: `${law.id}-rev`, params: law.params.filter((p) => p.name !== "cal") };
          const rev = gUsed !== null ? withScaleCorrection(inner) : inner;
          cands.push({ law: inner, fitted: rev, fit: fitLaw(rev, m.series, { trainFrac: TRAIN }), origin: "revision", rank: 0 });
          inflate(cands[cands.length - 1]);
          rankCandidates(cands, noiseFloor);
        } catch {
          /* an unusable revision simply doesn't compete */
        }
        // the revision won: the referee's words were about a law that no longer leads, so it writes up the new winner
        const left = Number(process.env.RUN_BUDGET_MS ?? 250_000) - (Date.now() - t0);
        if (cands[0].law.id !== winnerAtReferee && left > 25_000) {
          const c2 = await critique(obs, { units: dig.units, given, candidates: boardOf() }, ledger).catch(() => null);
          if (c2) c = { ...c2, verdict: "accept", revision_idea: c?.revision_idea ?? "", winnerId: cands[0].law.id };
        }
      }
      return c;
    }, (c) => (wonder ? `Muse Wonder tried ${wonder.attempts.length} law${wonder.attempts.length === 1 ? "" : "s"} on the fitted frames and submitted “${wonder.submitted ?? "none"}”` : c ? "accepted the result" : "referee unavailable; ranking stands"));
    // the baseline is a comparison, not part of the result: it gets a short grace period after the referee
    const eye = await Promise.race([eyePromise, new Promise<null>((res) => setTimeout(() => res(null), Number(process.env.EYEBALL_GRACE_MS ?? 25_000)))]);

    // 9. report
    const win = cands[0];
    const rep = await step("report", async () => {
      const comps = referenceValues(win.law, win.fit, obs, gUsed, stated, m.line, m);
      // the referee's sentence is used only if it types no numbers of its own and names the winner's fitted values
      const typed = crit?.finding ? /\d/.test(crit.finding.replace(/\{[^}]*\}/g, "")) : true;
      const winnerFree = win.law.params.filter((p) => !p.fixed && p.name !== "cal").map((p) => p.name);
      const namesOne = !winnerFree.length || winnerFree.some((n) => crit?.finding?.includes(`{${n}}`));
      const refereedWinner = !crit || cands[0].law.id === (crit.winnerId ?? winnerAtReferee);
      const filled = refereedWinner && crit?.finding && !typed && namesOne && crit.finding.length < 320 ? fillPlaceholders(crit.finding, win.fit, win.law) : null;
      // a placeholder code couldn't fill (a state, not a fitted parameter) means the sentence can't be trusted
      let finding = filled && !/\{[^}]*\}/.test(filled) ? filled : defaultFinding(win.law, win.fit);
      // counterfactuals: re-run the winner with one parameter scaled, over the same span ×1.4
      const cl = compileLaw(win.law);
      const span = m.series.t;
      const T = span[span.length - 1];
      const dt = T / Math.max(30, span.length);
      const times = Array.from({ length: Math.ceil((T * 1.4) / dt) }, (_, i) => i * dt);
      const whatIf = (crit?.what_if ?? []).flatMap((w) => {
        const free = cl.free;
        const idx = free.indexOf(w.param);
        const theta = Float64Array.from(free.map((f) => win.fit.theta[f]));
        const fixedParam = win.law.params.find((p) => p.name === w.param && p.fixed);
        if (idx < 0 && !fixedParam) return [];
        if (idx >= 0) theta[idx] *= w.factor;
        const law2 = fixedParam ? { ...win.law, params: win.law.params.map((p) => (p.name === w.param ? { ...p, guess: p.guess * w.factor } : p)) } : win.law;
        const run = (fixedParam ? compileLaw(law2) : cl).run(theta, times);
        return run.ok ? [{ label: w.label, param: w.param, factor: w.factor, px: toPixels(run.obs, m) }] : [];
      });
      // the clock check: a g far from the planet's says the clip's clock is not real time
      let clock: Experiment["clock"] = null;
      const gc = comps.find((c) => (c.param.toLowerCase() === "g" || /accelerates at g/.test(c.label)) && c.label !== "what the narrator said");
      if (gc && slow === 1) {
        const r = gc.measured / gc.reference;
        if (r > 0 && (r < 0.6 || r > 1.7)) {
          const f = Math.sqrt(1 / r);
          clock = { factor: f, note: r < 1 ? `Gravity came out ${fmtNum(1 / r, 2)}× too weak. Either this happened somewhere with ${fmtNum(r, 2)}× ${obs.body === "earth" ? "Earth’s" : `the ${obs.body === "moon" ? "Moon’s" : `${obs.body}’s`}`} gravity, or the clip plays about ${fmtNum(f, 2)}× slower than real life (slow motion). Run it again with the slow-motion factor set.` : `Gravity came out ${fmtNum(r, 2)}× too strong: the clip probably plays about ${fmtNum(1 / f, 2)}× faster than real life (time-lapse or dropped frames).` };
        }
      }
      // a number the clock casts doubt on is never left standing on its own
      if (clock) finding += ` ${clockSentence(gc!.measured / gc!.reference, clock.factor, obs.body)}`;
      const headline = crit?.headline && refereedWinner && !/\d/.test(crit.headline) && crit.headline.length < 110 ? crit.headline : win.law.summary;
      return { comps, finding, whatIf, clock, headline };
    }, (r) => r.finding);

    // strobe frames: ~16 evenly spaced masks across the window
    const strobe = pickStrobe(track.samples, m.window.f0, m.window.f1, vi.times);

    return {
      id: input.id ?? newId(),
      createdAt: new Date().toISOString(),
      pipeline: PIPELINE,
      sample: input.sample || undefined,
      title: obs.phenomenon.charAt(0).toUpperCase() + obs.phenomenon.slice(1),
      source: input.source ?? { kind: "upload", video: info.stored ?? input.filename },
      video: { width: vi.width, height: vi.height, fps: vi.fps, duration: vi.duration, codec: vi.codec, rotation: vi.rotation, frames: vi.times.length, jitter: vi.jitter },
      narration,
      observation: obs,
      observationSources: sources,
      tracking: { noun: subj.tracks[0]?.noun ?? subjectNoun, tracks: subj.tracks.length, framesSeen: track.samples.length, meanConfidence: track.samples.reduce((s, x) => s + (x.conf ?? 0), 0) / track.samples.length },
      measured: { series: m.series, px: m.px, calibration: m.calibration, pivot: m.pivot, line: m.line, coverage: m.coverage, noise: m.noise, window: m.window, slowMotion: m.slowMotion, origin: m.origin, point },
      given,
      reasoning: hyp.reasoning,
      candidates: cands.map((c) => ({ ...c, fit: { ...c.fit } })),
      winner: win.law.id,
      critique: crit,
      headline: rep.headline,
      finding: rep.finding,
      comparisons: rep.comps,
      eyeball: eye ? { ...eye, model: MODELS.eyeball } : null,
      whatIf: rep.whatIf,
      clock: rep.clock,
      wonder,
      strobe,
      trainFrac: TRAIN,
      ledger: { calls: ledger.calls, usd: ledger.usd, tokens: ledger.tokens, ms: Date.now() - t0 },
      models: MODELS,
    };
  } finally {
    void deleteFile(fileId);
    for (const f of extraFiles) void deleteFile(f);
  }
}

/** One sentence for the finding when the measured gravity says the clip's clock isn't real time. */
export function clockSentence(r: number, factor: number, body: string) {
  const world = body === "earth" ? "Earth’s" : body === "moon" ? "the Moon’s" : `${body}’s`;
  return r < 1
    ? `That is ${fmtNum(1 / r, 2)}× weaker than ${world} gravity, so the clip most likely plays about ${fmtNum(factor, 2)}× slower than real life.`
    : `That is ${fmtNum(r, 2)}× stronger than ${world} gravity, so the clip most likely plays about ${fmtNum(1 / factor, 2)}× faster than real life.`;
}

/** The finding written by code when the referee is missing or typed its own numbers. */
function defaultFinding(law: Law, fit: Fit) {
  const ps = law.params.filter((p) => !p.fixed && p.name !== "cal" && Number.isFinite(fit.theta[p.name]));
  const parts = ps.slice(0, 3).map((p) => `${p.meaning ?? p.name} ${fillPlaceholders(`{${p.name}}`, fit, law)}`);
  return `${law.summary}${parts.length ? ` Measured: ${parts.join("; ")}.` : ""}`;
}

const LENGTH_CHANNELS = new Set(["x", "y", "s", "r"]);

/** A fitted value pressed against its bound was not measured, only limited. */
export function atBound(law: Law, name: string, v: number) {
  const p = law.params.find((q) => q.name === name);
  if (!p || p.fixed) return false;
  const span = (p.max ?? Infinity) - (p.min ?? -Infinity);
  const tol = Number.isFinite(span) ? span * 0.005 : Math.abs(v) * 0.005;
  return (p.max !== undefined && Math.abs(v - p.max) <= tol && p.max !== 0) || (p.min !== undefined && p.min !== 0 && Math.abs(v - p.min) <= tol);
}

/**
 * Fits a law; a theorist's bounds are guesses, so a fit pressed against one gets ten times the room (twice at most),
 * restarting from where it stopped, and keeps the wider law unless that fits the seen frames worse.
 */
export function fitWithRoom(l: Law, series: Series, wrap: (x: Law) => Law = (x) => x) {
  let law2 = l, fitted = wrap(l), fit = fitLaw(fitted, series, { trainFrac: TRAIN });
  for (let round = 0; round < 2 && fit.ok; round++) {
    const stuck = law2.params.filter((p) => !p.fixed && p.name !== "cal" && atBound(law2, p.name, fit.theta[p.name]));
    if (!stuck.length) break;
    const wider: Law = {
      ...law2,
      params: law2.params.map((p) => {
        // a warm start: every parameter begins where the last fit left it
        const at = Number.isFinite(fit.theta[p.name]) && !p.fixed ? { ...p, guess: fit.theta[p.name] } : p;
        if (!stuck.includes(p)) return at;
        const v = fit.theta[p.name];
        const atMax = p.max !== undefined && (p.min === undefined || Math.abs(v - p.max) < Math.abs(v - p.min));
        return atMax ? { ...at, max: p.max! > 0 ? p.max! * 10 : p.max! / 10 } : { ...at, min: p.min! < 0 ? p.min! * 10 : p.min! / 10 };
      }),
      initialGuess: { ...(law2.initialGuess ?? {}), ...Object.fromEntries(Object.entries(fit.theta).filter(([k]) => k.endsWith("@0")).map(([k, v]) => [k.slice(0, -2), v])) },
    };
    const fitted2 = wrap(wider), fit2 = fitLaw(fitted2, series, { trainFrac: TRAIN });
    // the wider law stands if it fits no worse: then the old bound wasn't what held the value there
    if (!fit2.ok || !(fit2.trainCost <= fit.trainCost * (1 + 1e-6))) break;
    law2 = wider;
    fitted = fitted2;
    fit = fit2;
  }
  return { law: law2, fitted, fit };
}

/**
 * When the fall itself set the scale (g fixed), the provisional metres are only right if the flight was a
 * vacuum parabola. Each law gets a free scale correction `cal` so drag (or anything else that bends the
 * path) is not silently absorbed into the ruler: shape decides drag, gravity decides scale.
 */
export function withScaleCorrection(law: Law): Law {
  if (law.params.some((p) => p.name === "cal")) return law;
  const lengthObs = Object.keys(law.observe).filter((c) => LENGTH_CHANNELS.has(c));
  if (!lengthObs.length) return law;
  return {
    ...law,
    params: [...law.params, { name: "cal", guess: 1, min: 0.3, max: 3, unit: "", meaning: "scale correction: true metres per provisional metre" }],
    observe: Object.fromEntries(Object.entries(law.observe).map(([c, e]) => [c, LENGTH_CHANNELS.has(c) ? `(${e})/cal` : e])),
  };
}

/** Strobe instants spaced by distance travelled (about one body-width apart), like a multiflash photograph. */
export function pickStrobe(samples: Sample[], f0: number, f1: number, times: number[]) {
  const inWin = samples.filter((s) => s.f >= f0 && s.f <= f1);
  const size = [...inWin.map((s) => s.minor)].sort((a, b) => a - b)[inWin.length >> 1] || 20;
  let pathLen = 0;
  for (let i = 1; i < inWin.length; i++) pathLen += Math.hypot(inWin[i].cx - inWin[i - 1].cx, inWin[i].cy - inWin[i - 1].cy);
  // one body-width apart for things that travel; a jump in place still gets about eight exposures
  const gap = Math.max(2, Math.min(size * 1.05, pathLen / 8));
  const picked: Sample[] = [];
  let acc = 0;
  for (let i = 0; i < inWin.length; i++) {
    if (i) acc += Math.hypot(inWin[i].cx - inWin[i - 1].cx, inWin[i].cy - inWin[i - 1].cy);
    if (!picked.length || acc >= gap) {
      picked.push(inWin[i]);
      acc = 0;
    }
  }
  const thin = Math.max(1, Math.ceil(picked.length / 28));
  return picked.filter((_, i) => i % thin === 0).map((s) => ({ f: s.f, t: times[s.f] ?? 0, box: s.box, rle: s.rle }));
}

function safeLatex(l: Law) {
  try {
    return lawLatex(l);
  } catch {
    return [];
  }
}

/** "tennis ball" and "yellow tennis ball" name the same object: one phrase contains the other's words. */
function sameThing(a: string, b: string) {
  const wa = a.toLowerCase().split(/\W+/).filter(Boolean), wb = b.toLowerCase().split(/\W+/).filter(Boolean);
  if (!wa.length || !wb.length) return false;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.every((w) => long.includes(w));
}

function pathPx(t: Track) {
  let L = 0;
  for (let i = 1; i < t.samples.length; i++) L += Math.hypot(t.samples[i].cx - t.samples[i - 1].cx, t.samples[i].cy - t.samples[i - 1].cy);
  return L;
}

/** Fallback phrases for SAM: the last word ("ball"), then the observer's description's last two words. */
function altNouns(noun: string, obs: Observation): string[] {
  const words = noun.toLowerCase().split(/\s+/).filter(Boolean);
  const out = new Set<string>(obs.subjects[0]?.alternatives ?? []);
  if (words.length > 1) out.add(words.slice(-1)[0]);
  if (words.length > 2) out.add(words.slice(-2).join(" "));
  const d = obs.subjects[0]?.description?.toLowerCase().match(/\b(ball|bob|weight|bottle|stone|block|cube|bag|puck|car|disc|coin|toy|fruit|apple|orange|egg|balloon|shuttlecock)\b/);
  if (d) out.add(d[1]);
  out.delete(noun.toLowerCase());
  return [...out].slice(0, 3);
}

function fmtErr(v: number, cal: Calibration, angle = false) {
  if (!Number.isFinite(v)) return "—";
  if (angle) return `${((v * 180) / Math.PI).toFixed(2)}°`;
  if (cal.kind === "none") return `${v.toFixed(1)} px`;
  return v < 0.01 ? `${(v * 1000).toFixed(1)} mm` : `${(v * 100).toFixed(1)} cm`;
}

/** Drops the frames at either end where the body sits still (held in a hand, resting on the floor). */
function trimStatic(m: Measured, track: Track, vi: VideoInfo, win: { t0: number; t1: number }, slow: number, scale: { value: number; kind: "reference" | "stated"; note: string } | null, g: number, kind: Observation["motion_kind"], extra: { point?: "centroid" | "top"; noGravityRuler?: boolean } = {}): Measured {
  const px = m.px;
  if (px.length < 12) return m;
  const sp = px.map((p, i) => (i ? Math.hypot(p.x - px[i - 1].x, p.y - px[i - 1].y) : 0));
  const max = [...sp].sort((a, b) => a - b)[Math.floor(sp.length * 0.9)];
  const moving = (i: number) => sp[i] > Math.max(0.6, max * 0.08);
  let a = 1, b = px.length - 1;
  while (a < b && !moving(a)) a++;
  while (b > a && !moving(b)) b--;
  a = Math.max(0, a - 1);
  if (b - a < 10 || (a < 2 && b > px.length - 3)) return m;
  const fa = px[a].f, fb = px[b].f;
  const T = (f: number) => vi.times[f] ?? 0;
  return measure({ track, times: vi.times, window: { t0: Math.max(win.t0, T(fa)), t1: Math.min(win.t1, T(fb)) }, slowMotion: slow, metresPerPixel: scale, gravity: g, kind, ...extra });
}

export type { Pivot };

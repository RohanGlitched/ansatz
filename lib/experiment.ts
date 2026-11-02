/**
 * One experiment, end to end: observe → measure → hypothesise → fit and falsify → referee → report.
 * Each step emits progress so the page can show the method as it happens, and the finished record keeps
 * everything a reader needs to check it: the tracked pixels, every candidate's fit and prediction error,
 * the model calls and their cost.
 */
import { deleteFile, Ledger, transcribe, uploadFile, type Call } from "./meta/client";
import { segmentImage, trackBoxes, trackNoun, type LiveMask, type SamResult, type Sample, type Track } from "./meta/sam";
import { digest, localGravity, mainTrack, measure, rulerExtent, type Calibration, type Measured, type Pivot } from "./measure";
import { compileLaw, fitLaw, splitIndex, withEventJackknife, type Fit, type Law, type Series } from "./physics/law";
import { asrKeywords, releaseTurn, timedTurns } from "./i18n";
import { controls } from "./physics/library";
import { critique, eyeball, hypothesise, MODELS, observe, point as pointAt, presetUncertainty, reviseAgentic, WONDER_EFFORT, WONDER_PLOT, type Critique, type Eyeball, type Observation, type WonderAttempt, type WonderTurn } from "./scientist";
import { readVideoInfo, type VideoInfo } from "./video";
import { residualPlot } from "./plot";
import { toPixels } from "./pixels";
import { metrePower, prettyUnit, secondPower, toMetres } from "./units";
import { driveFrequencyParams, residualPeaks, seedDriveFrequency, spectrumSummary, type ResidualSpectrum } from "./spectrum";
import { fmtPair } from "./format";
import { median } from "./median";
import { lawLatex } from "./latex";
export { toPixels };
import { cut, frameAt, prepare } from "./transcode";
import { liteLaws, liteObservation, liteStatedFacts, NO_SPARK, type LiteType } from "./lite";

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

export type Comparison = {
  param: string; measured: number; sigma: number; reference: number; label: string; errorPct: number; withinSigma: number;
  /** the fit's own statistical part of sigma (with the ruler's share when the value scales with the ruler) */
  sigmaFit?: number;
  /** the part from a value assumed, not measured: a stated length held in the law, good to STATED_REL */
  sigmaAssumed?: number;
  /** the winning law misses its unseen frames by more than ROUGH_Z times the noise: the value is printed with no ± */
  rough?: boolean;
};

export type Experiment = {
  id: string;
  createdAt: string;
  title: string;
  source: { kind: "upload" | "showcase"; video: string; credit?: string; license?: string; page?: string; phone?: string };
  // codedWidth: the stored frame width, when pixels aren't square (old broadcast TV); SAM's coordinates live in it
  video: Pick<VideoInfo, "width" | "height" | "fps" | "duration" | "codec" | "rotation"> & { frames: number; jitter: number; codedWidth?: number };
  /** what was said in the clip (transcribed), and what was typed with it ("What do you know?"), kept apart */
  narration?: { transcript: string; turns: { startMs: number; endMs: number; transcript: string }[]; typed?: string };
  observation: Observation;
  observationSources: { url: string; title: string }[];
  tracking: { noun: string; tracks: number; framesSeen: number; meanConfidence: number };
  measured: Pick<Measured, "calibration" | "pivot" | "pivotNote" | "rejectedPivot" | "line" | "coverage" | "noise" | "window" | "slowMotion" | "origin" | "split" | "flightSearch"> & { series: Measured["series"]; px: Measured["px"]; point?: "centroid" | "top" };
  given: string[];
  reasoning: string;
  candidates: Candidate[];
  winner: string;
  /** the referee's record. When a revision took the lead, `verdict` and its words are the second critique's, about the
   * new winner; preRevision keeps what the first referee saw and asked for (the moment Muse Wonder was called in), and
   * postRevision the second referee's own verdict, which code no longer overwrites with "accept" */
  critique: (Critique & { preRevision?: CritiqueVerdict; postRevision?: CritiqueVerdict }) | null;
  /** at most a dozen plain words; no numbers */
  headline: string;
  finding: string;
  comparisons: Comparison[];
  eyeball: (Eyeball & { model: string; seen?: { fps: number; frames: number } }) | null;
  /** set when the measured gravity says the clip's clock isn't real time */
  clock: { factor: number; sigma?: number; note: string } | null;
  /** whether the clock check could run at all (absent on records before it): `checked` is false when gravity set the
   * scale, when there was no ruler and no stated length, when no gravity was measured, or when a slow-motion factor was
   * set; `why` says which, in a sentence a page can show as it is */
  clockCheck?: ClockCheck;
  whatIf: { label: string; param: string; factor: number; px: { x: number; y: number }[] }[];
  strobe: { f: number; t: number; box: Sample["box"]; rle: Sample["rle"] }[];
  trainFrac: number;
  /** what Muse Wonder did when it was asked for one more law: the laws it tried on the fitted frames, and what it submitted */
  wonder?: {
    idea: string;
    /** who called Muse Wonder in (absent on older records) */ trigger?: "referee" | "code";
    /** for a call by code: how far the winner missed the fitted frames, in noise units, to one decimal (the idea's text prints the same figure) */ missZ?: number;
    attempts: WonderAttempt[];
    submitted: string | null;
    /** what Muse Wonder wrote on each turn (its reasoning summary and any text), and the one tool it called */
    turns?: WonderTurn[];
    /** the turn budget it was told and the reasoning effort it ran at */
    budget?: { turns: number; effort: string };
  } | null;
  /** when the narration said "let go" (or its word in the spoken language) after the observer's start, the window starts there */
  voiceWindow?: { at: number; word: string; turn: string } | null;
  /** hand-made notes for a showcase: a robustness table, an independent cross-check, caveats on the ruler */
  extras?: {
    /** the fair version of the memory test: one clip at a time, both together, and with Ansatz's measurements as tools */
    speedTest?: {
      truth: number;
      single: { clip: string; playback_accel: number; real_speed: boolean; factor: number; reasoning: string }[];
      pair: { slower: string; factor: number; reasoning: string };
      withTools: { calls: { name: string; result: unknown }[]; answer: string };
      usd: number;
      /** the one-clip question asked n times per clip: how often it called each clip slowed */
      repeats?: { n: number; note: string; clips: { clip: string; truth: string; answers: { playback_accel: number; real_speed: boolean; factor: number }[]; calledSlowed: number }[]; usd: number };
    };
    /** g against the ruler's percentile: the person's height read at p50, p75 (the published choice), p90 or the tallest frame */
    rulerPercentiles?: { note: string; method: string; rows: { at: string; px: number; g: number; sigma: number; chosen?: boolean }[] };
    /** the 24 fps film under the 30 fps broadcast: repeated frames dropped, unique frames retimed to k/24 s, refitted */
    telecine?: { g: number; sigma: number; note: string; method: string; cadence?: { period: number; phase: number; repeats: number; frames: number }; jumps?: { jump: number; g: number; sigma: number; n: number }[]; subpixel?: { g: number; sigma: number; note: string } };
    /** a second ruler nobody tuned: the flag, at its documented size */
    flagRuler?: { note: string; source: string; sizeM: { width: number; height: number; rel: number }; px: { width: number; height: number; sigma: number; frames: number }; g: number; sigma: number; gHeightRuler: number; sam?: { usd: number; frames: number } };
    toolTest?: { question: string; calledWith: string; toolResult: unknown; answer: string; usd: number }; truth?: { note: string; rows: { label: string; param: string; measured: number; sigma: number; truth: number; unit: string; si?: TruthInMetres; /** the fit's own statistical part of sigma */ sigmaFit?: number; /** the part from a value assumed, not measured (a stated length good to 1%) */ sigmaAssumed?: number }[] }; periodCheck?: PeriodCheckRecord; robustness?: { note: string; rows: { label: string; g: number; sigma: number }[] }; crossCheck?: string; errorBudget?: { note: string; rows: { source: string; value: number; included: boolean; signed?: string }[]; total: { value: number; label: string } }; eyeballNote?: string; ruler?: string; memoryTest?: { note: string; rows: { clip: string; eye?: number; g: number; sigma: number; sigmaStat?: number; clock: string; href?: string }[]; renders?: { note: string; eye: number[]; clocks: number[]; slows: number[] }; tool?: { answer: string; href: string }; sameJump?: { note: string; jumps: { jump: number; real: SameJumpFit; slowed: SameJumpFit; ratio: number; sigma: number }[]; combined: { ratio: number; sigma: number } }; controls?: { note: string; clips: { id: string; made: string; jumps: { jump: number; ratio: number; sigma: number; truth: number; hangRatio?: number }[] }[] } } };
  ledger: { calls: Call[]; usd: number; tokens: number; ms: number };
  models: typeof MODELS;
  /** which version of the method produced this record, and whether the clip was one of the site's own samples */
  pipeline?: string;
  /** the code that ran it: the git commit, and whether tracked files differed from it (the paths, when they did) */
  code?: { commit: string; dirty: boolean; changed?: string[] };
  /** the misses' spectrum on the fitted frames of the best-fitting law without a drive (the theorist reads it), and the
   * drive laws whose frequency started from its strongest peak (kept: the seeded start fitted the fitted frames better) */
  residualSpectrum?: ResidualSpectrum & { seeded: { law: string; params: string[]; kept: boolean }[] };
  sample?: boolean;
  /** the class link it was run with, and the name or roll number the student gave */
  class?: string;
  student?: string;
};

/** A speed-up read from the swing's period with no law (scripts/period-check.ts): the frequency ratio, its parts, and the same film's real-time stretch. */
export type PeriodCheckRecord = {
  channel: string;
  period: number;
  sigma: number;
  crossings: number;
  residualMs: number;
  lengthM: number;
  idealPeriod: number;
  speedup: number;
  speedupSigmaPeriod: number;
  speedupSigmaAssumed: number;
  fit: { speedup: number; sigmaFit: number; sigmaAssumed: number };
  realTime?: { period: number; sigma: number; crossings: number; overIdealPct: number };
  sameFilm?: { ratio: number; sigma: number };
  note: string;
};

/** A truth row fitted in pixels (no ruler in view), restated in metres with a scale from outside the run (scripts/truth-in-metres.ts). */
export type TruthInMetres = { measured: number; sigma: number; truth: number; unit: string; metresPerPixel: number; scale: string };

/** Bumped when the method changes in a way that changes results; older visitor runs stop being listed. */
// 2026-10-27c: every published showcase and the bench (data/bench/pipelines.json lists which record is which).
// 2026-11-02a: rounds 12 to 14 (the flight-window seal, held pendulum lengths, the pivot gate, ties that never break
// on a law's id, the clock check when g is held, the take-off frame).
export const PIPELINE = "2026-11-02a";

const TRAIN = 0.7;

/** One referee's verdict as it stood: what it saw in the leader's misses on the fitted frames, and what it asked for. */
export type CritiqueVerdict = Pick<Critique, "verdict" | "residual_feature" | "strength" | "revision_idea" | "winnerId">;
const verdictOf = (c: Critique): CritiqueVerdict => ({ verdict: c.verdict, residual_feature: c.residual_feature, strength: c.strength, revision_idea: c.revision_idea, winnerId: c.winnerId });

/** A ruler's scale as measure() takes it, with how it was read (px and its σ from the masks, how many, video or stills). */
type Scale = { value: number; kind: "reference" | "stated"; note: string; px?: number; sigmaPx?: number; frames?: number; how?: "video" | "image" };
/** The id of a ruler read from still frames by SAM 3.1's image mode rather than tracked through the video. */
const STILL_RULER = "still-frames";

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

/** A winner that misses its unseen frames by more than this many times the noise is "rough": its values carry no ±. */
export const ROUGH_Z = 5;
/** The page's rule (app/x/[id]/view.tsx, data.csv): a rough fit's constants are printed as "about 9.8", never with a ±. */
export const isRoughFit = (fit: Pick<Fit, "testZ">) => Number.isFinite(fit.testZ) && fit.testZ! > ROUGH_Z;
/** What a parameter the clip does not determine (Fit.undetermined) is printed as, in place of a value. */
export const NOT_DETERMINED = "not determined by this clip";

/**
 * Writes "g = {g}" as "g = 9.79 ± 0.04 m/s²" using the fitted values, never the model's numbers. A rough fit (testZ over
 * ROUGH_Z) gets "about 9.8" with no ±, as on the readout card and in data.csv; a parameter the clip doesn't determine
 * gets NOT_DETERMINED, never a value with a ± wider than itself.
 */
export function fillPlaceholders(text: string, fit: Fit, law: Law) {
  const rough = isRoughFit(fit);
  return text.replace(/\{([A-Za-z_][A-Za-z_0-9]*)\}/g, (m, name) => {
    if (!(name in fit.theta)) return m;
    const p = law.params.find((q) => q.name === name);
    const v = fit.theta[name], s = fit.sigma[name];
    const unit = p?.unit && p.unit !== "1" && p.unit !== "-" ? ` ${prettyUnit(p.unit)}` : "";
    if (!p?.fixed && fit.undetermined?.includes(name)) return NOT_DETERMINED;
    if (!p?.fixed && rough) return `about ${+v.toPrecision(Math.abs(v) >= 100 ? 3 : 2)}${unit}`;
    // a value held fixed was given, not measured, and says so
    if (p?.fixed) return `${fmtNum(v)}${unit} (given)`;
    return s && Number.isFinite(s) && Math.abs(v) < 1e5 ? `${fmtPair(v, s)}${unit}` : `${fmtNum(v)}${unit}`;
  });
}

/** Residual pattern the referee reads: mean residual in eight time bins per channel, over the fitted frames only (in noise units when asked). */
export function residualPattern(fit: Fit, m: Pick<Measured, "series" | "noise">, frac = 1, inNoise = false) {
  const out: Record<string, number[]> = {};
  const n = Math.max(3, Math.round(m.series.t.length * frac));
  for (const [ch, pred] of Object.entries(fit.predicted)) {
    const ob = m.series.ch[ch];
    if (!ob) continue;
    const unit = inNoise ? noiseOf(m.noise, ch) : 1;
    const bins = new Array(8).fill(0), cnt = new Array(8).fill(0);
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(ob[i]) || !Number.isFinite(pred[i])) continue;
      const b = Math.min(7, Math.floor((i / n) * 8));
      bins[b] += (pred[i] - ob[i]) / unit;
      cnt[b]++;
    }
    out[ch] = bins.map((s, i) => +(cnt[i] ? s / cnt[i] : 0).toPrecision(3));
  }
  return out;
}

/** A channel's measurement noise, never zero (it divides). */
const noiseOf = (noise: Record<string, number>, ch: string) => (noise[ch] > 0 ? noise[ch] : 1);

/** One noise unit for laws that observe different channels: the RMS of the channels' noises. */
export const noiseFloorOf = (noise: Record<string, number>) => Math.sqrt(Object.values(noise).reduce((s, v) => s + v * v, 0) / Math.max(1, Object.keys(noise).length));

/** Wald–Wolfowitz runs test on the signs of a residual series: z well below 0 means the misses keep one sign in long stretches. */
export function runsTest(r: number[]) {
  const s = r.filter((v) => Number.isFinite(v) && v !== 0).map((v) => (v > 0 ? 1 : -1));
  const n = s.length, pos = s.filter((v) => v > 0).length, neg = n - pos;
  let runs = n ? 1 : 0;
  for (let i = 1; i < n; i++) if (s[i] !== s[i - 1]) runs++;
  if (n < 8 || !pos || !neg) return { n, runs, expected: pos && neg ? +(1 + (2 * pos * neg) / n).toFixed(1) : null, z: null as number | null, sameSign: n >= 8 && (!pos || !neg) };
  const mu = 1 + (2 * pos * neg) / n;
  const variance = (2 * pos * neg * (2 * pos * neg - n)) / (n * n * (n - 1));
  return { n, runs, expected: +mu.toFixed(1), z: variance > 0 ? +((runs - mu) / Math.sqrt(variance)).toFixed(2) : null, sameSign: false };
}

/** Lag-1 autocorrelation of a residual series (mean removed): near 0 for noise, towards 1 for a smooth drift. */
export function lag1(r: number[]) {
  const v = r.filter(Number.isFinite);
  if (v.length < 4) return null;
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  let num = 0, den = 0;
  for (let i = 0; i < v.length; i++) {
    den += (v[i] - mean) ** 2;
    if (i) num += (v[i] - mean) * (v[i - 1] - mean);
  }
  return den > 0 ? +(num / den).toFixed(2) : null;
}

/** A candidate's misses on the fitted frames only, per channel, in units of that channel's measurement noise. */
export function fittedResiduals(fit: Fit, m: Pick<Measured, "series" | "noise">, frac = TRAIN) {
  const N = m.series.t.length;
  const n = splitIndex(N, frac);
  const out: Record<string, { t: number[]; r: number[] }> = {};
  for (const [ch, pred] of Object.entries(fit.predicted)) {
    const ob = m.series.ch[ch];
    if (!ob) continue;
    const unit = noiseOf(m.noise, ch);
    const t: number[] = [], r: number[] = [];
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(ob[i]) || !Number.isFinite(pred[i])) continue;
      t.push(m.series.t[i]);
      r.push((pred[i] - ob[i]) / unit);
    }
    out[ch] = { t, r };
  }
  return out;
}

/** How far a candidate misses the frames it was fitted to, in noise units (the held-out frames play no part). */
const trainMiss = (c: Candidate, noise: Record<string, number>) => (!c.fit.ok ? Infinity : Number.isFinite(c.fit.trainZ) ? c.fit.trainZ! : c.fit.trainRms / noiseFloorOf(noise));

/** The candidates by their fit to the fitted frames, best first: what the referee and the theorist may see. */
const byFittedFit = (cands: Candidate[], noise: Record<string, number>) => [...cands].sort((a, b) => trainMiss(a, noise) - trainMiss(b, noise) || a.law.id.localeCompare(b.law.id));

/**
 * The table the referee and the theorist read. Fitted frames only: no rank, no held-out error, and the order is by
 * the fit to the fitted frames, so neither the order nor a field says how the laws did on the frames held back.
 * The law code chose is named, nothing more, and labelled as what it is: the one fact on the board that comes from the
 * held-out frames. Misses are in units of each channel's measurement noise.
 */
export function refereeBoard(cands: Candidate[], m: Pick<Measured, "series" | "noise">, frac = TRAIN) {
  const chosen = cands.reduce<Candidate | null>((best, c) => (!best || c.rank < best.rank ? c : best), null);
  return {
    the_law_code_chose: chosen?.law.id ?? null,
    where_that_choice_comes_from: "Code chose it by how well each law predicted the held-out frames (the last 30% of the motion). Its name is the only thing on this board derived from those frames; no number from them is given here.",
    how_to_read_the_residual_tests: "Computed by code on each law's misses over the fitted frames, per channel, in noise units. runs_z below about -2 means the misses keep one sign in long stretches (structure); lag1_autocorr near 0 means noise, towards 1 a smooth drift.",
    candidates: byFittedFit(cands, m.noise).map((c) => ({
      id: c.law.id,
      title: c.law.title,
      origin: c.origin,
      equations: c.law.derivatives,
      observes: c.law.observe,
      events: c.law.events ?? [],
      fitted: Object.fromEntries(Object.keys(c.fit.theta).filter((k) => !k.endsWith("@0") && k !== "cal").map((k) => [k, `${fmtNum(c.fit.theta[k])} ± ${fmtNum(c.fit.sigma[k], 2)}${atBound(c.law, k, c.fit.theta[k]) ? " (stuck at its limit)" : ""}`])),
      train_rms: c.fit.trainRms,
      misses_the_fitted_frames_by_noise_units: Number.isFinite(trainMiss(c, m.noise)) ? +trainMiss(c, m.noise).toFixed(2) : null,
      bic: c.fit.bic,
      ok: c.fit.ok,
      error: c.fit.why,
      residual_by_time_bin_in_noise_units: residualPattern(c.fit, m, frac, true),
      residual_tests: Object.fromEntries(Object.entries(fittedResiduals(c.fit, m, frac)).map(([ch, { r }]) => {
        const t = runsTest(r);
        return [ch, { n: t.n, runs: t.runs, expected_runs: t.expected, runs_z: t.z, lag1_autocorr: lag1(r), ...(t.sameSign ? { note: "every miss has the same sign" } : {}) }];
      })),
    })),
  };
}

/** The referee's picture: the three best-fitting candidates' misses in noise units (every channel in one colour), best fit first. */
export function refereePlotSeries(cands: Candidate[], m: Pick<Measured, "series" | "noise">, frac = TRAIN) {
  return byFittedFit(cands.filter((c) => c.fit.ok), m.noise).slice(0, 3).map((c) => {
    const per = Object.values(fittedResiduals(c.fit, m, frac));
    return { title: c.law.title, t: per.flatMap((p) => p.t), r: per.flatMap((p) => p.r) };
  });
}

/** A candidate's misses on the fitted frames, per channel in the channel's own unit, as two sinusoid peaks. */
export function spectrumOf(c: Pick<Candidate, "law" | "fit">, m: Pick<Measured, "series" | "noise">, frac = TRAIN): ResidualSpectrum {
  const per = fittedResiduals(c.fit, m, frac);
  const series = Object.fromEntries(Object.entries(per).map(([ch, p]) => [ch, { t: p.t, r: p.r.map((v) => v * noiseOf(m.noise, ch)) }]));
  return { law: c.law.title, peaks: residualPeaks(series, m.noise, 2) };
}

/** The spectrum a drive's frequency starts from: the best fit to the fitted frames among laws with no drive term (any law when all have one). */
export function baseSpectrum(cands: Candidate[], m: Pick<Measured, "series" | "noise">, frac = TRAIN): ResidualSpectrum | null {
  const ok = byFittedFit(cands.filter((c) => c.fit.ok), m.noise);
  const pick = ok.find((c) => !driveFrequencyParams(c.law).length) ?? ok[0];
  return pick ? spectrumOf(pick, m, frac) : null;
}

/** The fit with the better fitted-frames cost of the law as written and the law with its drive frequency seeded. */
export function fitSeeded<T extends { fit: Fit }>(law: Law, spectrum: ResidualSpectrum | null, fitOne: (l: Law) => T): T & { seeded: boolean } {
  const plain = fitOne(law);
  const s = seedDriveFrequency(law, spectrum);
  if (!s) return { ...plain, seeded: false };
  const seeded = fitOne(s);
  return seeded.fit.ok && (!plain.fit.ok || seeded.fit.trainCost < plain.fit.trainCost) ? { ...seeded, seeded: true } : { ...plain, seeded: false };
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
  // (a parameter the data can't pin down, σ larger than its value, isn't limited by its bound in any way that matters:
  // a smoothing scale at its floor, say)
  const pinned = (c: Candidate) =>
    c.law.params.some((p) => {
      if (p.fixed || p.name === "cal" || !atBound(c.law, p.name, c.fit.theta[p.name])) return false;
      const v = c.fit.theta[p.name], sg = c.fit.sigma[p.name];
      return Number.isFinite(sg) && sg <= Math.abs(v);
    });
  // among laws that predict equally well, the simpler one wins: fewer parameters, then clearly lower BIC
  // (a strict key, so the order is transitive: BIC in steps of 2, the usual threshold for "positive evidence"; the steps
  // sit on fixed boundaries, so two laws under 2 apart can still fall in different steps, and a page says the BIC
  // decided only when the difference itself is 2 or more: lib/tie.ts tieBreakReason). When
  // they are equally simple, the smaller miss on the unseen frames leads, then the smaller miss on the fitted frames.
  // (each to a thousandth of a noise unit, so two laws that are the same equation, which fit identically up to rounding,
  // tie here). Then the one written in physical quantities (g, not a) leads. The id a model chose for a law never
  // decides: the last key is the equation itself
  const origin = (c: Candidate) => (c.origin === "control" ? 1 : 0);
  const milli = (x: number) => (Number.isFinite(x) ? Math.round(x * 1e3) : Infinity);
  const heldOut = (c: Candidate) => milli(Number.isFinite(c.fit.testZ) ? c.fit.testZ! : c.fit.testRms);
  const fitted = (c: Candidate) => milli(Number.isFinite(c.fit.trainZ) ? c.fit.trainZ! : c.fit.trainRms);
  const equation = (c: Candidate) => JSON.stringify([c.law.state, c.law.derivatives, c.law.observe]);
  const cmp = <T extends number | string>(x: T, y: T) => (x < y ? -1 : x > y ? 1 : 0);
  const simpler = (a: Candidate, b: Candidate) =>
    a.fit.k - b.fit.k ||
    Math.round(a.fit.bic / 2) - Math.round(b.fit.bic / 2) ||
    cmp(heldOut(a), heldOut(b)) ||
    cmp(fitted(a), fitted(b)) ||
    origin(a) - origin(b) ||
    cmp(equation(a), equation(b));
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

/**
 * The ruler's relative uncertainty, which moves every length-carrying constant. A ruler in view: how well its size is
 * known, and how well SAM's mask measured it in pixels (calibration.sigmaPx), in quadrature. When gravity is the ruler
 * (a given g, or a fall that sets the scale), the ruler is good to the spread of g over Earth's surface (9.78 to 9.83,
 * ±0.26%), or ±0.05% where the latitude is known.
 */
export function rulerShare(obs: Pick<Observation, "body" | "location" | "reference">, cal: Calibration, gUsed: number | null) {
  const gRel = obs.location.latitude_deg != null ? 0.0005 : 0.0026;
  const sizeRel = Math.max(0, obs.reference.relative_uncertainty ?? 0.03);
  const pxRel = cal.kind === "reference" && cal.px && cal.sigmaPx && Number.isFinite(cal.sigmaPx / cal.px) ? cal.sigmaPx / cal.px : 0;
  const rulerRel = cal.kind === "reference" ? Math.hypot(sizeRel, pxRel) : obs.body === "earth" && (cal.kind === "gravity" || gUsed !== null) ? gRel : 0;
  // fromRuler: the scale is a ruler in view, so a length the law holds that the ruler did not give does not move with it
  return { rulerRel, gRel, sizeRel, pxRel, fromRuler: cal.kind === "reference" };
}

/** A fit with what the ruler's share added: the σ before it (sigmaFit) and, when measured, how each constant scales with the ruler. */
export type RulerFit = Fit & { rulerAdded?: boolean; sigmaFit?: Record<string, number>; rulerExp?: Record<string, number> };

/**
 * Whether a pendulum length the law holds moves with the ruler: it was measured against it (the swing's radius), or
 * the ruler is that same length (a thread stated as 60 cm and used as the scale). A length stated while a different
 * ruler sets the scale (a 60 cm string before a 30 cm wooden ruler) does not.
 */
export function heldLengthFromRuler(obs: Pick<Observation, "reference">, cal: Pick<Calibration, "kind">, statedL: number | undefined, fromArc: boolean) {
  if (fromArc) return true;
  const r = obs.reference;
  return cal.kind === "reference" && statedL !== undefined && !!r?.present && Number.isFinite(r.real_length_m) && Math.abs(r.real_length_m - statedL) <= 0.005 * statedL;
}

/** a fixed constant with a length in it that does not scale with the ruler (a stated string length, a held g) */
const heldOffRuler = (p: Law["params"][number], heldFromRuler: boolean) => !!p.fixed && p.name !== "cal" && metrePower(p.unit) !== 0 && !(heldFromRuler && isLParam(p));

/**
 * How each free constant scales with the ruler: d ln θ / d ln λ when every length measured against the ruler is
 * multiplied by λ. A law whose lengths all come from the ruler scales by each constant's metre power (g in m/s² as λ, a
 * quadratic drag in 1/m as 1/λ), and null is returned. A law that holds a length the ruler did not give breaks that: in
 * s'' = −(g/L)(s − s_eq) with L held at a stated 0.6 m, scaling s by λ leaves g/L, and so g, unchanged, and only s_eq
 * moves. Then the exponent is measured, whatever the law: it is refitted from its own optimum to the length channels
 * scaled by 1.01 and by 1/1.01, and the slope of θ taken (rounded to 0.001). Null too when it can't be measured.
 */
export function rulerExponents(c: Candidate, series: Series, heldFromRuler = false): Record<string, number> | null {
  if (!c.fit.ok || !c.law.params.some((p) => heldOffRuler(p, heldFromRuler))) return null;
  const law = c.fitted ?? c.law;
  let free: string[];
  try {
    free = compileLaw(law).free;
  } catch {
    return null;
  }
  const theta0 = Float64Array.from(free.map((n) => c.fit.theta[n]));
  if (theta0.some((v) => !Number.isFinite(v))) return null;
  const F = 1.01;
  const refit = (f: number) => {
    const ch = Object.fromEntries(Object.entries(series.ch).map(([k, v]) => [k, LENGTH_CHANNELS.has(k) ? v.map((x) => x * f) : v]));
    // a warm start: the initial positions and speeds are lengths too, so they start scaled
    const th = Float64Array.from(free.map((n, i) => (n.endsWith("@0") ? theta0[i] * f : theta0[i])));
    return fitLaw(law, { t: series.t, ch }, { trainFrac: TRAIN, theta0: th, jackknife: false });
  };
  const up = refit(F), down = refit(1 / F);
  if (!up.ok || !down.ok) return null;
  const out: Record<string, number> = {};
  for (const p of c.law.params) {
    if (p.fixed || p.name === "cal") continue;
    const v = c.fit.theta[p.name], a = up.theta[p.name], b = down.theta[p.name];
    const k = (a - b) / (v * (F - 1 / F));
    out[p.name] = Number.isFinite(k) ? Math.round(k * 1000) / 1000 || 0 : metrePower(p.unit);
  }
  return out;
}

/**
 * Adds the ruler's share to each length-carrying constant's statistical σ (once per fit), by how far the constant
 * actually moves with the ruler. When every length the law holds came from the ruler (or no `opts.series` is given)
 * that is its metre power; when the law holds a length the ruler did not give (a stated string length before a
 * separate ruler), it is measured by rulerExponents: there g = ω²L carries no ruler share at all, since only g/L is in
 * the motion. The σ before the share is kept (fit.sigmaFit), and a measured exponent too (fit.rulerExp).
 */
export function inflateForRuler(c: Candidate, share: { rulerRel: number; gRel: number; fromRuler?: boolean }, body: string, arcRel = 0, opts: { series?: Series; heldFromRuler?: boolean } = {}) {
  // a law that holds Earth's g fixed (a swing measured as an angle) turns time into length through g, so its lengths
  // carry g's spread even with no ruler in view
  const holdsG = body === "earth" && c.law.params.some((p) => p.fixed && /^g$/i.test(p.name));
  // a length taken from the swing's radius carries that radius's own spread too
  const rel = Math.hypot(share.rulerRel || (holdsG ? share.gRel : 0), arcRel);
  const f = c.fit as RulerFit;
  if (!rel || f.rulerAdded) return;
  // a ruler in view and a held length it did not give: how each constant scales is measured, not read off its unit
  const exp = share.fromRuler && opts.series ? rulerExponents(c, opts.series, opts.heldFromRuler) : null;
  const before: Record<string, number> = {};
  for (const p of c.law.params) {
    if (p.fixed) continue;
    const k = exp ? exp[p.name] ?? metrePower(p.unit) : metrePower(p.unit);
    const v = f.theta[p.name], sStat = f.sigma[p.name];
    before[p.name] = sStat;
    // (a measured exponent carries the ruler alone: the arc's spread belongs to a length from the arc, never held here)
    const r = exp ? share.rulerRel : rel;
    if (k && Number.isFinite(v)) f.sigma[p.name] = Math.hypot(Number.isFinite(sStat) ? sStat : 0, Math.abs(k) * r * Math.abs(v));
  }
  f.sigmaFit = before;
  if (exp) f.rulerExp = exp;
  f.rulerAdded = true;
}

/** the uncertainty a stated length carries into g = ω²L */
const STATED_REL = Number(process.env.STATED_LENGTH_REL ?? 0.01);

/**
 * Whether a fitted value may be compared with a known one (and so feed the clock check): the clip determined it (not on a
 * ridge with another parameter) and its σ is under a third of it. A g of 10 ± 830 matching Earth's 9.81 is the fit's
 * starting guess surviving along a ridge, not a measurement.
 */
export function comparable(fit: Fit, name: string) {
  const v = fit.theta[name], s = fit.sigma[name];
  return Number.isFinite(v) && !fit.undetermined?.includes(name) && !(Number.isFinite(s) && s > Math.abs(v) / 3);
}

export function referenceValues(law: Law, fit: Fit, obs: Observation, gUsed: number | null, stated: Record<string, number>, line?: Measured["line"], m?: Measured, lFromRuler = false): Comparison[] {
  const out: Comparison[] = [];
  // a free flight written as uniform acceleration along a vertical path: |a| is the gravity it measured
  const a = law.params.find((p) => !p.fixed && /^a$/i.test(p.name) && /m\/s/.test(p.unit ?? ""));
  // (in metres only: with no ruler and no stated length an acceleration is in pixels, and no clock check can run)
  if (a && comparable(fit, a.name) && m && m.calibration.kind !== "none" && gUsed === null && obs.motion_kind === "flight" && line && Math.abs(line.uy) > 0.95 && !law.params.some((p) => p.name === "g" && !p.fixed)) {
    const v = Math.abs(fit.theta[a.name]), s = fit.sigma[a.name] || 0;
    const ref = localGravity(obs.body, obs.location.latitude_deg ?? undefined);
    if (Number.isFinite(v)) out.push({ param: a.name, measured: v, sigma: s, reference: ref, label: `${obs.body === "earth" ? "standard gravity on Earth" : `surface gravity of the ${obs.body === "moon" ? "Moon" : obs.body}`} (a fall straight down accelerates at g)`, errorPct: ((v - ref) / ref) * 100, withinSigma: s ? Math.abs(v - ref) / s : NaN });
  }
  // a pendulum written with an angular frequency w0 = sqrt(g/L): with L known, g = w0² L is a measurement too
  const w = law.params.find((p) => !p.fixed && (/^(w0|w|omega0|omega)$/i.test(p.name) || /angular frequency/i.test(p.meaning ?? "")));
  // L is the narrator's figure, or else the radius of the swing's circle measured against the ruler in view
  const ruled = m?.pivot && (m.calibration.kind === "reference" || m.calibration.kind === "stated") && m.pivot.lengthOk !== false && m.pivot.arcDeg > 15;
  const Lm = stated.l ?? (ruled ? m!.pivot!.r * m!.calibration.metresPerPixel : undefined);
  // a spoken or typed length is rounded ("fifty centimetres"): it carries 1% unless the arc measured it
  const relL = stated.l !== undefined ? STATED_REL : ruled ? Math.hypot((m!.pivot!.sigmaR ?? m!.pivot!.rmsPx) / m!.pivot!.r, obs.reference.relative_uncertainty ?? 0.05, rulerShare(obs, m!.calibration, null).pxRel) : 0;
  if (w && comparable(fit, w.name) && Lm !== undefined && !law.params.some((p) => p.name === "g" && !p.fixed) && gUsed === null) {
    const v = fit.theta[w.name] ** 2 * Lm, s = Math.hypot(2 * fit.theta[w.name] * Lm * (fit.sigma[w.name] || 0), v * relL);
    const ref = localGravity(obs.body, obs.location.latitude_deg ?? undefined);
    if (Number.isFinite(v)) out.push({ param: "g", measured: v, sigma: s, reference: ref, label: `${obs.body === "earth" ? "standard gravity on Earth" : `gravity on the ${obs.body}`} (g = ω₀²L)`, errorPct: ((v - ref) / ref) * 100, withinSigma: s ? Math.abs(v - ref) / s : NaN });
  }
  for (const p of law.params) {
    if (p.fixed || p.name === "cal" || !comparable(fit, p.name)) continue;
    const v = fit.theta[p.name], s = fit.sigma[p.name];
    let ref: number | undefined, label = "";
    const nm = p.name.toLowerCase();
    // only an acceleration in real units can be compared with a world's gravity (a rest position "set by gravity" can't):
    // metres come from a ruler, or from a length the person stated (a pendulum measured as an angle, its L said aloud)
    const accel = metrePower(p.unit) === 1 && secondPower(p.unit) === -2 && (m?.calibration.kind !== "none" || stated.l !== undefined);
    if ((nm === "g" || /gravit/.test(p.meaning ?? "")) && accel && gUsed === null) {
      ref = localGravity(obs.body, obs.location.latitude_deg ?? undefined);
      label = obs.body === "earth" ? (obs.location.latitude_deg !== null ? `normal gravity at ${obs.location.latitude_deg.toFixed(1)}° latitude` : "standard gravity on Earth") : `surface gravity of the ${obs.body === "moon" ? "Moon" : obs.body === "mars" ? "planet Mars" : obs.body}`;
    } else if (stated[nm] !== undefined) {
      ref = stated[nm];
      label = "what the narrator said";
    }
    // a g fitted against a stated length carries that length's rounding too (g ∝ L). With no ruler all of g's metres
    // come from that length; with a ruler in view and the stated length held in the law, the share is the part the
    // ruler does not carry (rulerExponents: g = ω²L moves with L alone, so its sensitivity to L is 1 − 0)
    const exp = (fit as RulerFit).rulerExp?.[p.name];
    const holdsStated = stated.l !== undefined && !lFromRuler && law.params.some((q) => q.fixed && isLParam(q) && Math.abs(q.guess - stated.l) <= 1e-9 * stated.l);
    const sens = m?.calibration.kind === "none" && stated.l !== undefined ? 1 : holdsStated && exp !== undefined ? Math.abs(metrePower(p.unit) - exp) : 0;
    const assumed = ref !== undefined && label !== "what the narrator said" && sens ? Math.abs(v) * STATED_REL * sens : 0;
    const sd = assumed ? Math.hypot(s || 0, assumed) : s;
    if (ref !== undefined && Number.isFinite(v)) out.push({ param: p.name, measured: v, sigma: sd, reference: ref, label, errorPct: ((v - ref) / ref) * 100, withinSigma: sd ? Math.abs(v - ref) / sd : NaN, ...(assumed ? { sigmaFit: s || 0, sigmaAssumed: assumed } : {}) });
  }
  return out;
}

/** A swing measured as an angle: which of g and L code holds when a law leaves both free (only g/L is in the motion). */
export type PendulumHold = { name: "g" | "L"; value: number } | null;

/**
 * A stated length, or one measured from the swing's radius against a ruler, is held and g measured; with neither, the
 * world's gravity is held and L measured. Null when there is no swing (no angle channel, and no circle refused as a
 * pivot, whose swing is then measured along s) or the fall already set g.
 */
export function pendulumHold(ch: Record<string, number[]>, gUsed: number | null, statedL: number | undefined, gWorld: number, swingOnLine = false): PendulumHold {
  if ((!ch.theta && !swingOnLine) || gUsed !== null) return null;
  return statedL !== undefined && statedL > 0 ? { name: "L", value: statedL } : { name: "g", value: gWorld };
}

const isGParam = (p: Law["params"][number]) => /^g$/i.test(p.name) || (/gravit/i.test(p.meaning ?? "") && metrePower(p.unit) === 1 && secondPower(p.unit) === -2);
const isLParam = (p: Law["params"][number]) => /^(l|len|length|l_m)$/i.test(p.name) || (/length/i.test(p.meaning ?? "") && metrePower(p.unit) === 1 && !secondPower(p.unit));

/** Holds g or L (as `hold` says) in a law that leaves both free; a law that already fixes one of them is left alone. */
export function holdPendulum(law: Law, hold: PendulumHold) {
  if (!hold) return law;
  const g = law.params.find((p) => !p.fixed && isGParam(p)), L = law.params.find((p) => !p.fixed && isLParam(p));
  if (!g || !L) return law;
  const p = hold.name === "g" ? g : L;
  p.guess = hold.value;
  p.fixed = true;
  return law;
}

/**
 * What the observer reads: the narration as timed turns ("[2.3 s] …", so it can place the release in the clip), and the
 * typed notes after it. A clip with sound used to replace the typed notes with its transcript; now both reach it.
 */
export function narrationForObserver(heard: { transcript: string; turns: { startMs: number; transcript: string }[] } | undefined, typed?: string): string {
  const spoken = heard ? (heard.turns.length ? timedTurns(heard.turns) : heard.transcript.trim()) : "";
  return spoken && typed ? `${spoken}\nTyped with the clip: ${typed}` : spoken || typed || "";
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
  /** lite mode (lib/lite.ts): the person says what kind of experiment it is and names the moving thing (hints.noun);
   * no Muse Spark or Muse Wonder call is made, and Earth, real time and the whole clip are assumed. What they state is
   * kept: a length typed (narrationText) or, with listen, said in the clip (Muse Voice Transcribe, the one Meta model a
   * lite run may call) is read by code and enters the run as a stated fact */
  lite?: { type: LiteType; listen?: boolean };
  /** the caller's ledger, so what a run spent can be counted even when it throws */
  ledger?: Ledger;
  /** the code running it (scripts/run.ts reads git); live runs take VERCEL_GIT_COMMIT_SHA */
  code?: Experiment["code"];
  /** called with the normalised clip (H.264, ≤1280 px) so the caller can store it for playback */
  onPrepared?: (video: Uint8Array) => Promise<string | void>;
};

export async function runExperiment(input: RunInput, emit: (p: Progress) => void = () => {}): Promise<Experiment> {
  const t0 = Date.now();
  // the code that ran this record: what the caller read from git, or the deployed commit (a deploy is a clean tree)
  const code: Experiment["code"] = input.code ?? (process.env.VERCEL_GIT_COMMIT_SHA ? { commit: process.env.VERCEL_GIT_COMMIT_SHA, dirty: false } : undefined);
  const ledger = input.ledger ?? new Ledger();
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
    // the original's own sample table when it has one (MP4/MOV); a browser recording (WebM) is read after conversion,
    // which keeps every frame's timestamp
    let raw: VideoInfo | null = null;
    try {
      raw = readVideoInfo(input.video);
    } catch {
      raw = null;
    }
    if (raw && raw.duration > 60) throw new ExperimentError("Clips longer than 60 seconds aren't supported yet. Trim it to the motion.", "upload");
    const prep = await prepare(input.video, { maxSeconds: 60 });
    const vi = readVideoInfo(prep.video);
    if (vi.duration > 61) throw new ExperimentError("Clips longer than 60 seconds aren't supported yet. Trim it to the motion.", "upload");
    if (vi.times.length < 12) throw new ExperimentError("That clip has too few frames to measure.", "upload");
    const fileId = await uploadFile(prep.video, "clip.mp4", "video/mp4");
    const stored = input.onPrepared ? await input.onPrepared(prep.video) : undefined;
    return { vi, fileId, prep, stored: stored || undefined, rawInfo: raw ?? vi };
  }, (r) => `${r.vi.times.length} frames at ${r.vi.fps.toFixed(r.vi.fps % 1 ? 2 : 0)} fps (${r.rawInfo.codec}, ${r.rawInfo.width}×${r.rawInfo.height}), clock read from the file${r.prep.hadAudio ? ", narration found" : ""}`);
  const { vi, fileId, prep } = info;
  const extraFiles: string[] = [];

  try {
    // 2. narration: what was said in the clip (transcribed) and what was typed with it; neither drops the other
    let narration: Experiment["narration"];
    let heard: NonNullable<Experiment["narration"]> | undefined;
    const wav = input.narrationWav?.length ? input.narrationWav : prep.wav;
    const typed = input.narrationText?.trim() || undefined;
    // a full run always listens; a lite run listens when asked (Muse Voice Transcribe, $0.18 an hour of audio)
    const listen = !!wav?.length && (!input.lite || !!input.lite.listen);
    const asr = () => transcribe(wav!, ledger, { keywords: asrKeywords(input.language), languages: input.language ? [input.language] : undefined });
    const quote = (t: string) => (t ? `“${t.slice(0, 120)}${t.length > 120 ? "…" : ""}”` : "no speech heard");
    const heardOf = (tr: Awaited<ReturnType<typeof transcribe>>) => ({ transcript: tr.transcript, turns: tr.turns.map((t) => ({ startMs: t.startMs, endMs: t.endMs, transcript: t.transcript })) });
    if (input.lite) {
      // lite mode: logged in the run's notebook, so the record says which models it skipped
      ledger.add({ model: "lite mode", purpose: `${NO_SPARK} (observe, propose, referee, Muse Wonder and the by-eye baseline skipped; ${listen ? "narration transcribed only so code can read a stated length" : "narration not transcribed"}${typed ? "; typed notes read by code" : ""})`, ms: 0, usd: 0 });
    }
    if (listen && input.lite) {
      // a lite run that can't transcribe goes on without it: a typed length still stands, and nothing else needed it
      emit({ step: "listen", state: "start", at: Date.now() - t0 });
      try {
        heard = heardOf(await asr());
        emit({ step: "listen", state: "done", detail: `lite mode, listening only for a stated length: ${quote(heard.transcript)}`, at: Date.now() - t0 });
      } catch (e) {
        emit({ step: "listen", state: "done", detail: `lite mode: the narration couldn’t be transcribed (${(e as Error).message.slice(0, 120)}); going on without it`, at: Date.now() - t0 });
      }
    } else if (listen) {
      // the words to listen for in the language the person speaks (and English, which narrators mix in)
      heard = heardOf(await step("listen", asr, (r) => quote(r.transcript)));
    } else {
      emit({ step: "listen", state: "done", detail: input.lite ? (typed ? "lite mode: not listening; the typed notes are read by code" : "lite mode: the narration isn’t transcribed") : typed ? "typed notes used; the clip has no sound" : "the clip has no sound", at: Date.now() - t0 });
    }
    narration = heard ? (typed ? { ...heard, typed } : heard) : typed ? { transcript: typed, turns: [] } : undefined;
    const narr = narrationForObserver(heard, typed);

    // 3. observe
    const { obs, sources } = input.lite
      ? await step("observe", async () => ({ obs: liteObservation(input.lite!.type, input.hints?.noun || "ball", vi.duration, undefined, undefined, liteStatedFacts(input.lite!.type, { typed, heard: heard?.transcript, language: input.language })), sources: [] as { url: string; title: string }[] }), (r) => `${NO_SPARK}: a ${input.lite!.type}, as you said, on Earth, in real time, over the whole clip${r.obs.stated_facts.map((f) => `; ${f.quantity} ${f.value} ${f.unit}, as you ${/\(said\)$/.test(f.said) ? "said" : "typed"}`).join("")}`, (r) => r.obs)
      : await step("observe", () => observe(fileId, narr, ledger, vi.duration, vi.fps), (r) => `${r.obs.phenomenon}: tracking “${r.obs.subjects[0]?.noun_phrase}”${r.obs.reference.present ? `, ruler “${r.obs.reference.noun_phrase}” (${r.obs.reference.real_length_m} m)` : ""}${r.obs.slow_motion.factor > 1 ? `, slowed ${r.obs.slow_motion.factor}×` : ""}`, (r) => r.obs);
    if (input.hints?.slowMotion) obs.slow_motion = { factor: input.hints.slowMotion, evidence: "given with the clip" };
    if (input.hints?.noun) obs.subjects = [{ noun_phrase: input.hints.noun, alternatives: [], description: "given with the clip" }];
    if (input.hints?.window) obs.window = input.hints.window;
    // a preset the person picked carries the uncertainty of that object's standard (an A4 sheet they named is A4 to ±0.3%)
    if (input.hints?.ruler) obs.reference = { present: true, noun_phrase: input.hints.ruler.noun, real_length_m: input.hints.ruler.metres, dimension: input.hints.ruler.dimension ?? "longest side", basis: "given with the clip", relative_uncertainty: input.hints.ruler.relUncertainty ?? presetUncertainty(input.hints.ruler.noun, input.hints.ruler.metres) ?? obs.reference.relative_uncertainty ?? 0.03 };
    // a release word heard after the observer's start moves the start to it: the person said when they let go
    let voiceWindow: Experiment["voiceWindow"] = null;
    const rel = !input.hints?.window && narration?.turns.length ? releaseTurn(narration.turns, input.language) : null;
    if (rel && rel.at > obs.window.start_s && rel.at < (obs.window.end_s > obs.window.start_s ? obs.window.end_s : vi.duration) - 0.5) {
      obs.window = { ...obs.window, start_s: rel.at };
      voiceWindow = rel;
    }

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
        if (byName?.tracks.length || input.lite) return byName;
        const png = await frameAt(trackBytes, trackTimes[0] ?? 0);
        const box = await pointAt(png, { width: vi.width, height: vi.height }, obs.reference.noun_phrase, `a reference object of known size, ${obs.reference.real_length_m} m along its ${obs.reference.dimension}; it does not move`, ledger, true).catch(() => null);
        if (!box) return byName;
        const r2 = await trackBoxes(trackFile, { width: vi.width, height: vi.height }, [{ id: 1, frame: 0, box }], ledger, frames).catch(() => null);
        if (!r2?.tracks.length) return byName;
        for (const t of r2.tracks) t.noun = `${obs.reference.noun_phrase} (pointed out by Muse Spark)`;
        return r2;
      };
      // a ruler that never moves, filmed by a camera that doesn't, needs no tracking: SAM 3.1's image mode reads it in
      // three still frames (start, middle, end: one the subject hides still leaves two), $0.0025 a frame against
      // $0.0002 for every frame of the video. Nothing found in the stills falls back to tracking it
      const stillRuler = async (): Promise<SamResult | null> => {
        // (the very last frame is not seekable as a still: the end one is a few frames before it)
        const ks = [...new Set([0, Math.floor((trackTimes.length - 1) / 2), Math.max(0, trackTimes.length - 3)])];
        const found = await Promise.all(
          ks.map(async (k) => {
            const png = await frameAt(trackBytes, trackTimes[k] ?? 0).catch(() => null);
            const res = png ? await segmentImage(png, obs.reference.noun_phrase, ledger, k).catch(() => null) : null;
            return res?.tracks.flatMap((t) => t.samples).sort((a, b) => (b.conf ?? 0) - (a.conf ?? 0) || b.area - a.area)[0] ?? null;
          }),
        );
        const samples = found.filter((x): x is Sample => !!x);
        return samples.length ? { width: vi.width, height: vi.height, frames, raw: "", tracks: [{ id: STILL_RULER, noun: `${obs.reference.noun_phrase} (${samples.length} still frame${samples.length > 1 ? "s" : ""})`, samples }] } : null;
      };
      const rulerJob = async () => (obs.camera_static && process.env.RULER_STILLS !== "0" ? ((await stillRuler().catch(() => null)) ?? findRuler()) : findRuler());
      jobs.push(obs.reference.present && obs.reference.noun_phrase && !selfRuler ? rulerJob() : Promise.resolve(null));
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
      if ((!s || !moving(s)) && !input.lite) {
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
      // map each result once: when the subject is its own ruler, s and r are the same object, and mapping it twice
      // sent every frame of a cut clip to the wrong place (a windowed run then found the subject in 0 frames)
      for (const res of new Set([s, r])) if (res) for (const t of res.tracks) for (const smp of t.samples) smp.f = map(smp.f);
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
    const tall = median(track.samples.map((s) => s.box[3] - s.box[1])) / Math.max(1, median(track.samples.map((s) => s.box[2] - s.box[0]))) > 1.8;
    const person = /\b(astronaut|person|man|woman|boy|girl|child|kid|jumper|athlete|player|dancer|student|human|spacesuit|suit)\b/i.test(`${subjectNoun} ${obs.subjects[0]?.description ?? ""}`);
    const point: "centroid" | "top" = person && tall && obs.motion_kind === "flight" ? "top" : "centroid";
    let scale: Scale | null = null;
    const selfRuler = sameThing(obs.reference.noun_phrase, subjectNoun);
    const rulerTrack = ref && ref.tracks.length && obs.reference.real_length_m > 0 ? (selfRuler ? track : mainTrack(ref.tracks)!) : null;
    // the ruler read from these samples: its length in px is the median of the per-frame mask extents (a standing
    // person's height their tallest quarter), and its σ in px is their frame-to-frame scatter with a 1 px edge
    const scaleFrom = (samples: Sample[]): Scale | null => {
      if (!rulerTrack || !samples.length) return null;
      // a moving ball smears along its path, so a round subject's true diameter is its mask's short axis;
      // anything elongated (a person, a stick) is measured along the side the observer named
      const round = median(samples.map((s) => s.major)) / Math.max(1e-9, median(samples.map((s) => s.minor))) < 1.35;
      const useMinor = obs.reference.dimension === "shortest side" || (selfRuler && round);
      // the mask's true extent along its axes (a moment-based size overstates a rectangle by 15%)
      // a standing person's height is the box's vertical extent in the frames where they stand tallest
      // (a crouch or tucked legs only ever make the box shorter), not the length of a tilted mask axis
      const personRuler = selfRuler && person && !useMinor;
      const ext = rulerExtent(samples.map((s) => (personRuler ? s.box[3] - s.box[1] : useMinor ? s.wid ?? s.minor : s.len ?? s.major)), personRuler ? 0.75 : 0.5);
      if (!(ext.px > 8)) return null;
      const how = rulerTrack.id === STILL_RULER ? "image" : "video";
      return { value: obs.reference.real_length_m / ext.px, kind: "reference", px: ext.px, sigmaPx: ext.sigmaPx, frames: ext.n, how, note: `${obs.reference.noun_phrase} = ${obs.reference.real_length_m} m (${obs.reference.basis}) spans ${ext.px.toFixed(0)} ± ${ext.sigmaPx.toFixed(1)} px in SAM's mask${how === "image" ? ` (read in ${ext.n} still frame${ext.n > 1 ? "s" : ""})` : ` (${ext.n} frames)`}` };
    };
    if (rulerTrack) scale = scaleFrom(rulerTrack.samples);
    const m = await step("measure", async () => {
      // gravity can only stand in for a ruler when the body flies freely: a ball rolling down a ramp accelerates at less than g
      const once = () => {
        let mm = measure({ track, times: vi.times, window: winT, slowMotion: slow, metresPerPixel: scale, gravity: gBody, kind: obs.motion_kind, point, noGravityRuler: obs.motion_kind === "swing" || obs.motion_kind === "oscillation", trainFrac: TRAIN, frame: { width: vi.width, height: vi.height } });
        if (obs.motion_kind === "swing" || obs.motion_kind === "oscillation") mm = trimStatic(mm, track, vi, winT, slow, scale, gBody, obs.motion_kind, { point, noGravityRuler: true });
        return mm;
      };
      let mm = once();
      // a subject that is its own ruler is read only on frames before the held-out ones, so they set nothing
      const heldFrom = mm.px[mm.split ?? mm.px.length]?.f;
      if (selfRuler && scale && heldFrom !== undefined) {
        const sealed = scaleFrom(rulerTrack!.samples.filter((s) => s.f < heldFrom));
        if (sealed && sealed.value !== scale.value) {
          scale = sealed;
          mm = once();
        }
      }
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
    if (m.calibration.kind === "reference") {
      const { rulerRel: ru, sizeRel, pxRel } = rulerShare(obs, m.calibration, null);
      given.push(`scale: ${m.calibration.note}, ${ru < 0.005 ? "its length taken as exact" : `known to ±${+(ru * 100).toPrecision(2)}%${pxRel ? ` (its size ±${+(sizeRel * 100).toPrecision(2)}%, its length in pixels ±${+(pxRel * 100).toPrecision(2)}%)` : ""}`}`);
    }
    if (voiceWindow) given.push(`window set from your voice at ${voiceWindow.at.toFixed(1)} s (“${voiceWindow.word}” in “${voiceWindow.turn}”)`);
    if (slow > 1) given.push(`the clip plays ${slow}× slower than real life (${obs.slow_motion.evidence}); times are already corrected to real seconds`);
    for (const f of obs.stated_facts) {
      given.push(`${f.quantity} = ${f.value} ${f.unit} (“${f.said}”)`);
      const q = f.quantity.toLowerCase();
      const metres = toMetres(f.value, f.unit);
      if (/length|string|rope|thread|dhaga|dhaage/.test(q) && metres !== undefined && metres > 0.02 && metres < 30) stated.l = metres;
    }
    // the swing's radius is a length only when the arc is wide enough and the path is one circle (measure.ts decides)
    let arcRel = 0, lFromArc = false;
    if (m.series.ch.theta && m.pivot && m.pivot.lengthOk !== false && m.calibration.kind === "reference" && stated.l === undefined) {
      const lGeo = m.pivot.r * m.calibration.metresPerPixel;
      stated.l = lGeo;
      lFromArc = true;
      arcRel = (m.pivot.sigmaR ?? 0) / m.pivot.r;
      given.push(`pendulum length L = ${lGeo.toFixed(3)} m, measured from the radius of the swing with the ruler: hold L fixed and measure g`);
    } else if (m.series.ch.theta || m.rejectedPivot) {
      // whatever channels are kept (a ruler keeps x and y): a swing alone measures only g/L, so one of them is held
      if (stated.l !== undefined) given.push(`pendulum length L = ${stated.l} m (stated): hold L fixed and measure g`);
      else given.push(`g = ${gBody.toFixed(3)} m/s² (${obs.body === "earth" ? "Earth" : obs.body}): hold g fixed and measure the pendulum's length L in metres from its swing${m.pivot?.lengthOk === false && m.pivot.why ? ` (L isn't determined from the arc: ${m.pivot.why})` : ""}`);
    }
    const gUsed = m.calibration.kind === "gravity" ? m.calibration.g : null;
    // what code holds whatever the theorist writes: a law with both g and L free gets the one the given says is known
    const hold = pendulumHold(m.series.ch, gUsed, stated.l, gBody, !!m.rejectedPivot);

    // 6. hypothesise
    // the theorist sees only the frames the laws are fitted to: no number from the last 30% reaches any model
    const dig = digest(m, 40, TRAIN);
    const hyp = await step("hypothesise", () => (input.lite
      ? Promise.resolve({ reasoning: `${NO_SPARK}: the textbook laws for a ${input.lite.type}.`, laws: liteLaws(input.lite.type, m.series, { g: gUsed ?? 9.81, gFixed: gUsed !== null, pendulumG: m.calibration.kind === "none" && m.series.ch.theta ? gBody : undefined, pixels: m.calibration.kind === "none", statedL: m.series.ch.theta ? stated.l : undefined }), ifItWins: {} as Record<string, string> } as Awaited<ReturnType<typeof hypothesise>>)
      : hypothesise(obs, dig, given, ledger)), (r) => r.laws.map((l) => l.title).join("; "), (r) => ({ reasoning: r.reasoning, laws: r.laws.map((l) => ({ id: l.id, title: l.title, summary: l.summary, latex: safeLatex(l) })) }));

    // 7. fit every candidate on the first 70%, predict the rest
    const channels = Object.keys(m.series.ch);
    const noiseFloor = noiseFloorOf(m.noise);
    let spectrum: ResidualSpectrum | null = null;
    const seededLog: { law: string; params: string[]; kept: boolean }[] = [];
    const cands: Candidate[] = await step("fit", async () => {
      const list: Candidate[] = [];
      const seen = new Set<string>();
      const add = (law: Law, origin: Candidate["origin"], ifItWins?: string) => {
        let id = law.id;
        while (seen.has(id)) id += "-2";
        seen.add(id);
        const l = { ...law, id };
        if (gUsed !== null) for (const p of l.params) if (p.name === "g") { p.guess = gUsed; p.fixed = true; }
        holdPendulum(l, hold);
        // the scale correction is the measurement's business, not the law's: fit the wrapped law, show the inner one
        const wrap = (x: Law) => (gUsed !== null ? withScaleCorrection(x) : x);
        const { law: law2, fitted, fit } = fitWithRoom(l, m.series, wrap);
        list.push({ law: law2, fitted, fit, origin, ifItWins, rank: 0 });
      };
      for (const l of hyp.laws) add(l, input.lite ? "control" : "muse", hyp.ifItWins[l.id]);
      if (!input.lite) for (const l of controls(channels, { g: gUsed ?? gBody, gFixed: gUsed !== null })) add(l, "control");
      // a law with a periodic drive also starts its frequency at the strongest peak in the misses of the best law
      // without one (fitted frames only), and keeps whichever start fits the fitted frames better
      spectrum = baseSpectrum(list, m);
      for (const c of list) {
        const s = seedDriveFrequency(c.law, spectrum);
        if (!s) continue;
        const wrap = (x: Law) => (gUsed !== null ? withScaleCorrection(x) : x);
        const r = fitWithRoom(s, m.series, wrap);
        const kept = r.fit.ok && (!c.fit.ok || r.fit.trainCost < c.fit.trainCost);
        seededLog.push({ law: c.law.id, params: driveFrequencyParams(c.law).map((d) => d.name), kept });
        if (kept) Object.assign(c, { law: r.law, fitted: r.fitted, fit: r.fit });
      }
      rankCandidates(list, noiseFloor);
      return list;
    }, (r) => `${r.length} laws fitted; the best predicts the unseen ${Math.round((1 - TRAIN) * 100)}% to within ${fmtErr(r[0].fit.testRms, m.calibration, !m.series.ch.x && !!m.series.ch.theta)}`, (r) => ({
      board: r.map((c) => ({ id: c.law.id, title: c.law.title, origin: c.origin, rank: c.rank, miss: fmtErr(c.fit.testRms, m.calibration, !m.series.ch.x && !!m.series.ch.theta), rel: c.fit.testRms, latex: safeLatex(c.law), path: toPixels(c.fit.predicted, m).filter((_, i, a) => i % Math.max(1, Math.ceil(a.length / 160)) === 0).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]) })),
    }));

    // the ruler's own uncertainty moves every length-carrying constant: add it to the fit's statistical error. When
    // gravity is the ruler (a given g, or a fall that sets the scale), the ruler is good to the spread of g over
    // Earth's surface (9.78 to 9.83, ±0.26%), or ±0.05% where the latitude is known
    const share = rulerShare(obs, m.calibration, gUsed);
    // a held length moves with the ruler only when the ruler gave it (the swing's radius, or the ruler is that length)
    const lFromRuler = heldLengthFromRuler(obs, m.calibration, stated.l, lFromArc);
    const inflate = (c: Candidate) => inflateForRuler(c, share, obs.body, arcRel, { series: m.series, heldFromRuler: lFromRuler });
    cands.forEach(inflate);

    // 8. referee (and one revision), with the eyeball baseline in parallel
    // the table the referee and the theorist read holds the fitted frames only: no rank, no held-out error
    const tableOf = () => ({ units: dig.units, given, ...refereeBoard(cands, m, TRAIN) });
    const spectrumUnits = Object.fromEntries(channels.map((ch) => [ch, ch === "theta" ? "rad" : m.calibration.kind === "none" ? "px" : "m"]));
    const winnerFirst = cands[0];
    const eyePromise: Promise<(Eyeball & { seen?: { fps: number; frames: number } }) | null> = input.skipEyeball || input.lite
      ? Promise.resolve(null)
      : winnerFirst.law.params.some((p) => !p.fixed && p.name !== "cal") === false
        ? Promise.resolve(null)
        : eyeball(fileId, narr, winnerFirst.law.params.filter((p) => !p.fixed && p.name !== "cal").map((p) => ({ name: p.name, unit: p.unit ?? "", meaning: p.meaning ?? p.name })), ledger, {
            fps: vi.fps,
            duration: vi.duration,
            ruler: obs.reference.present ? `the ${obs.reference.noun_phrase} is ${obs.reference.real_length_m} m along its ${obs.reference.dimension}` : undefined,
          }).catch(() => null);
    const winnerAtReferee = cands[0].law.id;
    let wonder: Experiment["wonder"] = null;
    const crit = input.lite ? await step("referee", async () => null as Critique | null, () => "lite mode: no referee and no Muse Wonder; the ranking stands") : await step("referee", async () => {
      // the three best-fitting laws' misses over the fitted frames, drawn as a picture for the referee (best effort):
      // in noise units, so the dashed band is ±1, and ordered by the fit to the fitted frames
      const plot = await residualPlot(refereePlotSeries(cands, m, TRAIN), 1).catch(() => undefined);
      let c: Experiment["critique"] = await critique(obs, tableOf(), ledger, undefined, plot).catch(() => null);
      if (c) c.winnerId = cands[0].law.id;
      // Muse Wonder steps in when the referee names a missing effect, or when even the winner misses the frames it
      // was fitted to by more than six times the measurement noise (WONDER_POOR_FIT; judged on fitted frames only)
      const lead = cands[0];
      // (judged on the fitted frames only: whether to look for a new law must not depend on the held-out frames)
      const poorFit = lead.fit.ok && (lead.fit.trainZ ?? lead.fit.trainRms / noiseFloor) > Number(process.env.WONDER_POOR_FIT ?? 6);
      // how far the leader misses the frames it was fitted to, in units of each channel's noise (the same figure the
      // poor-fit test uses and the page prints)
      // rounded once, to one decimal, so the stored figure and the sentence Muse Wonder reads are the same number
      const leadMiss = +(Number.isFinite(lead.fit.trainZ) ? lead.fit.trainZ! : lead.fit.trainRms / noiseFloor).toFixed(1);
      const trigger: "referee" | "code" = c?.verdict === "revise" && c.revision_idea ? "referee" : "code";
      const idea = trigger === "referee" ? c!.revision_idea : poorFit ? `The winner misses even the frames it was fitted to by ${leadMiss.toFixed(1)} times the measurement noise; some effect is missing.` : "";
      // what the first referee saw and asked for, kept whatever happens next
      const pre = c ? verdictOf(c) : null;
      // a run must finish inside the 300 s function limit (the watchdog fires at 285 s)
      const budgetLeft = Number(process.env.RUN_BUDGET_MS ?? 250_000) - (Date.now() - t0);
      // two theorist turns take about a minute; more turns only when there's room
      if (idea && budgetLeft > 75_000) {
        try {
          const tryLaw = async (law: Law) => {
            const l2 = { ...law, params: law.params.filter((p) => p.name !== "cal") };
            if (gUsed !== null) for (const p of l2.params) if (p.name === "g") { p.guess = gUsed; p.fixed = true; }
            holdPendulum(l2, hold);
            const wrapped = gUsed !== null ? withScaleCorrection(l2) : l2;
            // (an attempt's σ is only shown to Muse Wonder: no jackknife here; the law it submits is refitted with one)
            // a drive's frequency also starts at the strongest residual peak; the better fit to the fitted frames stands
            const { fit: f, seeded } = fitSeeded(wrapped, spectrum, (x) => ({ fit: fitLaw(x, m.series, { trainFrac: TRAIN, jackknife: false }) }));
            // the attempt's misses on the fitted frames as a picture, the same kind the referee reads (best effort)
            const per = f.ok ? Object.values(fittedResiduals(f, m, TRAIN)) : [];
            const plot = per.length ? await residualPlot([{ title: law.title, t: per.flatMap((p) => p.t), r: per.flatMap((p) => p.r) }], 1).catch(() => undefined) : undefined;
            return {
              ok: f.ok,
              error: f.why,
              train_rms: f.trainRms,
              fitted: Object.fromEntries(Object.keys(f.theta).filter((k) => !k.endsWith("@0") && k !== "cal").map((k) => [k, `${fmtNum(f.theta[k])} ± ${fmtNum(f.sigma[k], 2)}${atBound(l2, k, f.theta[k]) ? " (stuck at its bound)" : ""}`])),
              residual_by_time_bin_on_fitted_frames: residualPattern(f, m, TRAIN),
              ...(f.ok ? { residual_spectrum: spectrumSummary(spectrumOf({ law, fit: f }, m), spectrumUnits) } : {}),
              ...(seeded ? { note: "the drive frequency was started at the strongest residual frequency (of the best law in the table without a drive); that start fitted the fitted frames better than your guess" } : {}),
              ...(plot ? { [WONDER_PLOT]: plot } : {}),
            };
          };
          // the theorist reads the same table as the referee: fitted frames only, no rank, sorted by the fit to them
          const maxTurns = Math.min(Number(process.env.WONDER_MAX_TURNS ?? 3), budgetLeft > 170_000 ? 3 : 2);
          const { law: revised, attempts, auto, turns } = await reviseAgentic(obs, tableOf(), idea, tryLaw, ledger, undefined, maxTurns, t0 + Number(process.env.RUN_BUDGET_MS ?? 250_000) - 45_000, spectrumSummary(spectrum, spectrumUnits));
          wonder = { idea, trigger, ...(trigger === "code" ? { missZ: leadMiss } : {}), attempts, submitted: revised ? `${revised.title}${auto ? " (its best attempt, entered for it when its turns ran out)" : ""}` : null, turns, budget: { turns: maxTurns, effort: WONDER_EFFORT() } };
          if (!revised) throw new Error("no law submitted");
          const law = revised;
          compileLaw(law);
          if (gUsed !== null) for (const p of law.params) if (p.name === "g") { p.guess = gUsed; p.fixed = true; }
          holdPendulum(law, hold);
          const inner = { ...law, id: `${law.id}-rev`, params: law.params.filter((p) => p.name !== "cal") };
          // the submitted law's drive frequency, if it has one, starts where its attempt's did: both starts, the better fit stands
          const sub = fitSeeded(inner, spectrum, (x) => { const fx = gUsed !== null ? withScaleCorrection(x) : x; return { law: x, fitted: fx, fit: fitLaw(fx, m.series, { trainFrac: TRAIN }) }; });
          if (driveFrequencyParams(inner).length) seededLog.push({ law: inner.id, params: driveFrequencyParams(inner).map((d) => d.name), kept: sub.seeded });
          cands.push({ law: sub.law, fitted: sub.fitted, fit: sub.fit, origin: "revision", rank: 0 });
          inflate(cands[cands.length - 1]);
          rankCandidates(cands, noiseFloor);
        } catch {
          /* an unusable revision simply doesn't compete */
        }
        // the revision won: the referee's words were about a law that no longer leads, so it writes up the new winner
        const left = Number(process.env.RUN_BUDGET_MS ?? 250_000) - (Date.now() - t0);
        if (cands[0].law.id !== winnerAtReferee && left > 25_000) {
          const plot2 = await residualPlot(refereePlotSeries(cands, m, TRAIN), 1).catch(() => undefined);
          const c2 = await critique(obs, tableOf(), ledger, undefined, plot2).catch(() => null);
          // the second referee's own verdict stands in the record; the first one's is kept beside it
          if (c2) c = { ...c2, winnerId: cands[0].law.id, ...(pre ? { preRevision: pre } : {}), postRevision: verdictOf({ ...c2, winnerId: cands[0].law.id }) };
        }
      }
      return c;
    }, (c) => (wonder ? `Muse Wonder tried ${wonder.attempts.length} law${wonder.attempts.length === 1 ? "" : "s"} on the fitted frames and submitted “${wonder.submitted ?? "none"}”` : c ? "accepted the result" : "referee unavailable; ranking stands"));
    // the baseline is a comparison, not part of the result: it gets a short grace period after the referee
    const eye = await Promise.race([eyePromise, new Promise<null>((res) => setTimeout(() => res(null), Number(process.env.EYEBALL_GRACE_MS ?? 25_000)))]);

    // 9. report
    // the winner's restitution σ: the larger of the sandwich and a leave-one-flight-out jackknife
    jackknifeLeader(cands, m.series);
    const win = cands[0];
    const rep = await step("report", async () => {
      // a rough fit's values carry no ± on any page: the comparison says so itself
      const comps = referenceValues(win.law, win.fit, obs, gUsed, stated, m.line, m, lFromRuler).map((c) => (isRoughFit(win.fit) ? { ...c, rough: true } : c));
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
      // any comparison against a world's gravity, whatever the law called its parameter (g, gmoon, a)
      const gc = gravityComparison(comps);
      if (gc && slow === 1) {
        const r = gc.measured / gc.reference;
        // flag only a miss that is both significant (over 3σ, the ruler's share included) and large (over 15%, beyond
        // what an off-plane ruler or lens can do); the factor carries half gravity's relative error (g ∝ 1/time²)
        const sr = gc.sigma > 0 ? gc.sigma / gc.reference : 0;
        if (r > 0 && Math.abs(r - 1) > Math.max(0.15, 3 * sr)) {
          const f = Math.sqrt(1 / r);
          // a g with no error bar (a rough fit) gives a factor with none either: a range in words, never a ±
          const rough = !(gc.sigma > 0 && Number.isFinite(gc.sigma));
          const say = (x: number) => (rough ? roughFactor(x) : fmtNum(x, 2));
          // g scales with the length that set the scale as well as with 1/time²: a misread ruler looks like a changed clock
          const scaleBy = lengthBehindG(m.calibration, stated.l !== undefined, obs.reference.noun_phrase);
          const orRuler = scaleBy ? ` Or ${scaleBy} is not the length assumed: g scales with it, so a length read ${fmtNum(1 / r, 2)}× too long looks just like a clip slowed ${say(f)}×.` : "";
          clock = { factor: f, ...(rough ? {} : { sigma: 0.5 * f * (gc.sigma / gc.measured) }), note: r < 1 ? `Gravity came out ${fmtNum(1 / r, 2)}× too weak. Either this happened somewhere with ${fmtNum(r, 2)}× ${obs.body === "earth" ? "Earth’s" : `the ${obs.body === "moon" ? "Moon’s" : `${obs.body}’s`}`} gravity, or the clip plays about ${say(f)}× slower than real life (slow motion).${orRuler} Run it again with the slow-motion factor set${scaleBy ? ", or check the length" : ""}.` : `Gravity came out ${fmtNum(r, 2)}× too strong: the clip probably plays about ${say(1 / f)}× faster than real life (time-lapse or dropped frames)${scaleBy ? `, or ${scaleBy} is not the length assumed (a length read ${fmtNum(r, 2)}× too short looks the same)` : ""}.` };
        }
      }
      // a number the clock casts doubt on is never left standing on its own
      if (clock) finding += ` ${clockSentence(gc!.measured / gc!.reference, clock.factor, obs.body, clock.sigma === undefined, lengthBehindG(m.calibration, stated.l !== undefined, obs.reference.noun_phrase))}`;
      const clockCheck = clockCheckOf({ slowSet: slow > 1, calibration: m.calibration.kind, statedLength: stated.l !== undefined, gravity: gc ?? null, flagged: !!clock, body: obs.body, gHeld: hold?.name === "g" });
      const headline = crit?.headline && refereedWinner && !/\d/.test(crit.headline) && crit.headline.length < 110 ? crit.headline : win.law.summary;
      return { comps, finding, whatIf, clock, clockCheck, headline };
    }, (r) => r.finding);

    // strobe frames: ~16 evenly spaced masks across the window
    const strobe = pickStrobe(track.samples, m.window.f0, m.window.f1, vi.times);
    // (set inside the fit step's closure, so read back through its declared type)
    const spectrumFinal = spectrum as ResidualSpectrum | null;

    return {
      id: input.id ?? newId(),
      createdAt: new Date().toISOString(),
      pipeline: PIPELINE,
      ...(code ? { code } : {}),
      ...(spectrumFinal ? { residualSpectrum: { ...spectrumFinal, seeded: seededLog } } : {}),
      sample: input.sample || undefined,
      title: obs.phenomenon.charAt(0).toUpperCase() + obs.phenomenon.slice(1),
      source: input.source ?? { kind: "upload", video: info.stored ?? input.filename },
      video: { width: vi.width, height: vi.height, fps: vi.fps, duration: vi.duration, codec: vi.codec, rotation: vi.rotation, frames: vi.times.length, jitter: vi.jitter },
      narration,
      observation: obs,
      observationSources: sources,
      tracking: { noun: subj.tracks[0]?.noun ?? subjectNoun, tracks: subj.tracks.length, framesSeen: track.samples.length, meanConfidence: track.samples.reduce((s, x) => s + (x.conf ?? 0), 0) / track.samples.length },
      measured: { series: m.series, px: m.px, calibration: m.calibration, pivot: m.pivot, ...(m.pivotNote ? { pivotNote: m.pivotNote } : {}), ...(m.rejectedPivot ? { rejectedPivot: m.rejectedPivot } : {}), line: m.line, coverage: m.coverage, noise: m.noise, window: m.window, slowMotion: m.slowMotion, origin: m.origin, point, split: m.split, ...(m.flightSearch ? { flightSearch: m.flightSearch } : {}) },
      ...(voiceWindow ? { voiceWindow } : {}),
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
      clockCheck: rep.clockCheck,
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

/**
 * One sentence for the finding when the measured gravity says the clip's clock isn't real time. `scaleBy` names the
 * length that set the scale (lengthBehindG): a misread length and a changed clock look alike, so both are offered.
 */
export function clockSentence(r: number, factor: number, body: string, rough = false, scaleBy?: string | null) {
  const world = body === "earth" ? "Earth’s" : body === "moon" ? "the Moon’s" : `${body}’s`;
  const say = (x: number) => (rough ? roughFactor(x) : fmtNum(x, 2));
  const or = scaleBy ? `, or ${scaleBy} is not the length assumed` : "";
  return r < 1
    ? `That is ${fmtNum(1 / r, 2)}× weaker than ${world} gravity, so the clip most likely plays about ${say(factor)}× slower than real life${or}.`
    : `That is ${fmtNum(r, 2)}× stronger than ${world} gravity, so the clip most likely plays about ${say(1 / factor)}× faster than real life${or}.`;
}

/** The length a measured g rests on, in words ("the metre stick"), or null when no length set the scale. */
export function lengthBehindG(cal: Pick<Calibration, "kind">, statedLength: boolean, rulerNoun?: string) {
  if (cal.kind === "reference") return rulerNoun ? `the ${rulerNoun.replace(/^(the|a|an)\s+/i, "")}` : "the ruler";
  if (cal.kind === "stated") return "the stated scale";
  if (statedLength) return "the stated pendulum length";
  return null;
}

/** Whether a run's clock could be checked against gravity, and why not when it couldn't. */
export type ClockCheck = { checked: boolean; why: string };

const GIVEN_G_WHY = "Clock not checked: gravity was given, not measured, so the clip’s clock could not be checked against it (a swing alone fixes only g/L, so g was held at the world’s value and the length measured). Type the string’s length to measure g and check the clock.";

/** The comparison that carries the run's gravity, if any (what the clock check tests). */
export const gravityComparison = (comps: Comparison[]) => comps.find((c) => (c.param.toLowerCase() === "g" || /accelerates at g|gravity/i.test(c.label)) && c.label !== "what the narrator said");

/**
 * The clock check a page shows: the record's own, with the reason corrected where g was held as given (records before
 * that case said "no gravity was measured"), or, on a record from before the check was stored, the same rule applied
 * to what the record holds.
 */
export function clockCheckFor(e: Pick<Experiment, "clockCheck" | "given" | "measured" | "comparisons" | "clock" | "observation"> & Partial<Pick<Experiment, "candidates" | "winner">>): ClockCheck {
  const gHeld = e.given.some((g) => /hold g fixed/i.test(g));
  const stored = e.clockCheck && !e.clockCheck.checked && gHeld && /no gravity was measured/.test(e.clockCheck.why) ? { checked: false, why: GIVEN_G_WHY } : e.clockCheck;
  const withdrawn = !!(e.clock as { withdrawn?: boolean } | null)?.withdrawn;
  const c =
    stored ??
    clockCheckOf({
      slowSet: (e.measured.slowMotion ?? 1) > 1,
      calibration: e.measured.calibration.kind,
      statedLength: e.given.some((g) => /(stated)/.test(g)) || (e.observation.stated_facts ?? []).some((s) => /length|string|rope|thread|pendulum/i.test(s.quantity) && s.unit !== "px" && s.value > 0),
      gravity: gravityComparison(e.comparisons) ?? null,
      flagged: !!e.clock && !withdrawn,
      body: e.observation.body,
      gHeld,
    });
  // a gravity from a law that misses the unseen frames by far more than the noise has no error bar: the check is a rough one
  const win = e.candidates?.find((x) => x.law.id === e.winner);
  const z = win?.fit.testZ;
  if (c.checked && z !== undefined && Number.isFinite(z) && z > 5 && !e.clock) return { checked: true, why: `${c.why.replace(/^Clock checked: gravity came out within/, "Clock checked, roughly: gravity came out within about").replace(/, so the clip plays in real time.$/, ", so the clip plays at about real time")}; the winning law misses the unseen frames by ${Math.round(z)}× the noise, so this carries no error bar.` };
  return c;
}

/**
 * The clock check runs only when gravity is a measurement: a ruler or a stated length gives metres, and the winning law
 * measured a g. When gravity set the scale it was assumed, so it can't test the clock; with no ruler and no stated length
 * there are no metres to measure it in; a slow-motion factor that was set is a correction, not a check.
 */
export function clockCheckOf(a: { slowSet: boolean; calibration: Calibration["kind"]; statedLength: boolean; gravity: Pick<Comparison, "measured" | "reference"> | null; flagged: boolean; body: string; gHeld?: boolean }): ClockCheck {
  const world = a.body === "earth" ? "Earth’s" : a.body === "moon" ? "the Moon’s" : `${a.body}’s`;
  if (a.slowSet) return { checked: false, why: "Clock not checked: a slow-motion factor was set, so times were corrected by it, not tested." };
  if (a.calibration === "gravity") return { checked: false, why: "Clock not checked: the fall set the scale, so gravity was assumed, not measured. A slowed clip would look the same." };
  if (a.calibration === "none" && !a.statedLength) return { checked: false, why: "Clock not checked: with no ruler in view and no length stated, gravity can’t be measured in metres. A slowed clip would look the same." };
  if (!a.gravity && a.gHeld) return { checked: false, why: GIVEN_G_WHY };
  if (!a.gravity) return { checked: false, why: "Clock not checked: no gravity was measured in this run (the winning law has none, or the clip didn’t determine it)." };
  if (a.flagged) return { checked: true, why: "Clock checked: gravity came out far from the world’s, so the clip’s clock, or the length behind the scale, is in doubt." };
  const pct = Math.abs(a.gravity.measured / a.gravity.reference - 1) * 100;
  return { checked: true, why: `Clock checked: gravity came out within ${fmtNum(pct, 2)}% of ${world}, so the clip plays in real time.` };
}

/**
 * A factor derived from a value with no error bar, as a range in words: 4.27 → "4 to 4.5", 1.46 → "1.4 to 1.5",
 * 12.3 → "12 to 13". Half-steps above 2, tenths below, whole numbers from 10.
 */
export function roughFactor(x: number) {
  const step = x < 2 ? 0.1 : x < 10 ? 0.5 : 1;
  const lo = Math.floor(x / step + 1e-9) * step;
  const p = (v: number) => (+v.toFixed(1)).toString();
  return `${p(lo)} to ${p(lo + step)}`;
}

/**
 * How many frames the by-eye call saw, from its input tokens when the record predates eyeball.seen: about 130 tokens a
 * frame at 1280×720 and about 56 at broadcast size (321×240), measured on the records that store both (±1 frame or so),
 * after about 120 tokens of question.
 */
export function framesFromTokens(inputTokens: number, video: Pick<Experiment["video"], "width" | "height">) {
  const perFrame = video.width * video.height >= 300_000 ? 130 : 56;
  return Math.max(1, Math.round((inputTokens - 120) / perFrame));
}

/** A SAM ledger row with no time on it came from a pipeline that didn't record SAM's timing. */
export const samUntimed = (c: Call) => c.model.startsWith("sam") && !c.ms && !c.totalMs;

/**
 * What a stored record shows of the current method, so a page can disclose an older record instead of hiding it:
 * SAM calls with no time recorded, a by-eye call whose frame count was never stored (estimated from its tokens), and a
 * referee who named no residual feature. `older` is true when any of these holds, or the pipeline stamp is not today's.
 */
export function recordAge(e: Pick<Experiment, "pipeline" | "ledger" | "eyeball" | "critique" | "video">) {
  const samRows = e.ledger.calls.filter((c) => c.model.startsWith("sam"));
  const untimed = samRows.filter(samUntimed).length;
  const eyeCall = e.ledger.calls.find((c) => /^eyeball/.test(c.purpose));
  const eyeball = e.eyeball?.seen ? { frames: e.eyeball.seen.frames, estimated: false } : eyeCall?.inputTokens ? { frames: framesFromTokens(eyeCall.inputTokens, e.video), estimated: true } : null;
  const reasons: string[] = [];
  if (e.pipeline !== PIPELINE) reasons.push(`run on ${e.pipeline ? `pipeline ${e.pipeline}` : "a pipeline before version stamps"}, not ${PIPELINE}`);
  if (untimed) reasons.push(`SAM 3.1's time not recorded on ${untimed} of ${samRows.length} call${samRows.length === 1 ? "" : "s"} (older pipeline)`);
  if (eyeball?.estimated) reasons.push(`by eye: saw ~${eyeball.frames} frames (older pipeline; estimated from the call's input tokens)`);
  if (e.critique && !e.critique.residual_feature) reasons.push("the referee named no residual feature (older pipeline)");
  return { older: reasons.length > 0, reasons, samUntimed: untimed, eyeball, residualFeature: !!e.critique?.residual_feature };
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
  // a phase bounded at ±π wraps around: sitting at −π is the same as sitting at +π, not a limit
  if (p.min !== undefined && p.max !== undefined && Math.abs(p.min + Math.PI) < 0.01 && Math.abs(p.max - Math.PI) < 0.01) return false;
  const span = (p.max ?? Infinity) - (p.min ?? -Infinity);
  const tol = Number.isFinite(span) ? span * 0.005 : Math.abs(v) * 0.005;
  return (p.max !== undefined && Math.abs(v - p.max) <= tol && p.max !== 0) || (p.min !== undefined && p.min !== 0 && Math.abs(v - p.min) <= tol);
}

/**
 * Fits a law; a theorist's bounds are guesses, so a fit pressed against one gets ten times the room (twice at most),
 * restarting from where it stopped, and keeps the wider law unless that fits the seen frames worse.
 */
export function fitWithRoom(l: Law, series: Series, wrap: (x: Law) => Law = (x) => x) {
  // the restitution jackknife runs on the leading law only, once it is known (jackknifeLeader), not on every candidate
  let law2 = l, fitted = wrap(l), fit = fitLaw(fitted, series, { trainFrac: TRAIN, jackknife: false });
  for (let round = 0; round < 2 && fit.ok; round++) {
    // a ratio that physics caps at 1 (restitution, a fraction kept) is never widened past it
    const capped = (p: Law["params"][number]) => p.max !== undefined && p.max <= 1 && Math.abs(fit.theta[p.name] - p.max) < Math.abs(fit.theta[p.name] - (p.min ?? -Infinity)) && (/restitution|fraction|ratio|kept/i.test(p.meaning ?? "") || /^e(_r)?$/i.test(p.name));
    const stuck = law2.params.filter((p) => !p.fixed && p.name !== "cal" && atBound(law2, p.name, fit.theta[p.name]) && !capped(p));
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
    const fitted2 = wrap(wider), fit2 = fitLaw(fitted2, series, { trainFrac: TRAIN, jackknife: false });
    // the wider law stands if it fits no worse: then the old bound wasn't what held the value there
    if (!fit2.ok || !(fit2.trainCost <= fit.trainCost * (1 + 1e-6))) break;
    law2 = wider;
    fitted = fitted2;
    fit = fit2;
  }
  return { law: law2, fitted, fit };
}

/**
 * The leading law's event-reset parameters (restitution) get the leave-one-flight-out jackknife σ when it is larger than
 * the sandwich σ (lib/physics/law.ts withEventJackknife). Run on the leader alone, after ranking: it refits the law once
 * per flight (up to a few seconds on a bouncing ball), and ranking doesn't use σ except to spot a parameter pinned at
 * its bound.
 */
export function jackknifeLeader(cands: Candidate[], series: Series) {
  const c = cands[0];
  if (!c?.fit.ok || !c.law.events?.length) return;
  const f = withEventJackknife(c.fitted ?? c.law, series, c.fit, { trainFrac: TRAIN });
  if (f !== c.fit) c.fit = Object.assign(f, (c.fit as Fit & { rulerAdded?: boolean }).rulerAdded ? { rulerAdded: true } : {});
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
  const size = median(inWin.map((s) => s.minor)) || 20;
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
function trimStatic(m: Measured, track: Track, vi: VideoInfo, win: { t0: number; t1: number }, slow: number, scale: Scale | null, g: number, kind: Observation["motion_kind"], extra: { point?: "centroid" | "top"; noGravityRuler?: boolean } = {}): Measured {
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
  return measure({ track, times: vi.times, window: { t0: Math.max(win.t0, T(fa)), t1: Math.min(win.t1, T(fb)) }, slowMotion: slow, metresPerPixel: scale, gravity: g, kind, trainFrac: TRAIN, frame: { width: vi.width, height: vi.height }, ...extra });
}

export type { Pivot };

/** One jump measured by the same code in one clip: |a| from a quadratic over every airborne frame (helmet top). */
export type SameJumpFit = { g: number; sigma: number; f0: number; f1: number; t0: number; t1: number; n: number };

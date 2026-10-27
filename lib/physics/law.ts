/**
 * A law is a hypothesis written as equations of motion. Muse proposes it; this file turns it into numbers:
 * integrate it (RK4, with impact events), fit its unknowns to what SAM measured (Levenberg–Marquardt),
 * and score how well it predicts the part of the clip it never saw. No model output is trusted until a law
 * written from it has predicted the future of the clip.
 */
import { compile, names, parse, type Compiled } from "./expr";
import { paramCovariance, type CovMethod } from "../stats/covariance";

export type ParamSpec = {
  name: string;
  guess: number;
  min?: number;
  max?: number;
  unit?: string;
  meaning?: string;
  /** Held at `guess` instead of fitted (e.g. g = 9.81 when the fall itself is the ruler). */
  fixed?: boolean;
};

export type EventSpec = {
  /** Fires when this expression crosses from positive to zero or below (e.g. "y - floor"). */
  when: string;
  /** State updates at the event, evaluated with the pre-event state (e.g. { vy: "-e*vy" }). */
  then: Record<string, string>;
  name?: string;
};

export type Law = {
  id: string;
  title: string;
  /** One plain sentence: what the law says. */
  summary: string;
  state: string[];
  derivatives: Record<string, string>;
  params: ParamSpec[];
  /** Guesses for initial state values that are not observed channels; every initial value is fitted. */
  initialGuess?: Record<string, number>;
  /** Observed channel name -> expression over state, params and t. */
  observe: Record<string, string>;
  events?: EventSpec[];
};

export type Series = {
  t: number[];
  /** channel -> values (NaN where the body was not seen) */
  ch: Record<string, number[]>;
};

export type CompiledLaw = {
  law: Law;
  free: string[]; // fitted symbols: free params then initial states (as "state@0")
  run(theta: Float64Array, times: number[], opts?: { maxEvents?: number }): { obs: Record<string, number[]>; events: { t: number; name: string }[]; ok: boolean };
};

export class LawError extends Error {}

const STATE0 = (s: string) => `${s}@0`;

export function validate(law: Law) {
  const { state, params } = law;
  if (!state.length || state.length > 12) throw new LawError("a law needs 1–12 state variables");
  if (params.length > 12) throw new LawError("too many parameters");
  const known = new Set([...state, ...params.map((p) => p.name), "t"]);
  const dup = [...state, ...params.map((p) => p.name)].find((n, i, a) => a.indexOf(n) !== i);
  if (dup) throw new LawError(`"${dup}" is defined twice`);
  for (const s of state) if (!(s in law.derivatives)) throw new LawError(`no derivative for "${s}"`);
  const check = (src: string, where: string) => {
    for (const n of names(parse(src))) {
      // `e` is the restitution in a bounce, not Euler's number: it needs declaring, and exp(1) is how to write 2.718…
      if (n === "e" && !known.has("e")) throw new LawError(`${where}: \`e\` is not defined; name the restitution parameter e, or use exp(1)`);
      if (!known.has(n) && n !== "pi") throw new LawError(`${where} uses unknown symbol "${n}"`);
    }
  };
  for (const [s, d] of Object.entries(law.derivatives)) {
    if (!state.includes(s)) throw new LawError(`derivative for unknown state "${s}"`);
    check(d, `d${s}/dt`);
  }
  for (const [c, o] of Object.entries(law.observe)) check(o, `observed ${c}`);
  for (const ev of law.events ?? []) {
    check(ev.when, "event condition");
    for (const [s, v] of Object.entries(ev.then)) {
      if (!state.includes(s)) throw new LawError(`event resets unknown state "${s}"`);
      check(v, "event reset");
    }
  }
}

/** Compiles a law. Scope layout: [state..., params..., t]. */
export function compileLaw(law: Law): CompiledLaw {
  validate(law);
  const vars = [...law.state, ...law.params.map((p) => p.name), "t"];
  const nS = law.state.length;
  const nP = law.params.length;
  const ti = nS + nP;
  const der: Compiled[] = law.state.map((s) => compile(law.derivatives[s], vars));
  const obsKeys = Object.keys(law.observe);
  const obs: Compiled[] = obsKeys.map((k) => compile(law.observe[k], vars));
  const events = (law.events ?? []).map((ev) => ({
    name: ev.name ?? "event",
    when: compile(ev.when, vars),
    then: Object.entries(ev.then).map(([s, v]) => ({ i: law.state.indexOf(s), f: compile(v, vars) })),
  }));
  const freeParams = law.params.filter((p) => !p.fixed);
  const free = [...freeParams.map((p) => p.name), ...law.state.map(STATE0)];
  const paramIndex = law.params.map((p) => (p.fixed ? -1 : freeParams.indexOf(p)));

  function run(theta: Float64Array, times: number[], opts: { maxEvents?: number } = {}) {
    const scope = new Float64Array(vars.length);
    law.params.forEach((p, j) => (scope[nS + j] = paramIndex[j] >= 0 ? theta[paramIndex[j]] : p.guess));
    for (let i = 0; i < nS; i++) scope[i] = theta[freeParams.length + i];
    const out: Record<string, number[]> = Object.fromEntries(obsKeys.map((k) => [k, [] as number[]]));
    const fired: { t: number; name: string }[] = [];
    if (!times.length) return { obs: out, events: fired, ok: true };
    const t0 = times[0];
    let t = t0;
    scope[ti] = t;
    const span = times[times.length - 1] - t0;
    const h0 = Math.max(span / 4000, Math.min(1 / 480, span / 200 || 1 / 480));
    const k1 = new Float64Array(nS), k2 = new Float64Array(nS), k3 = new Float64Array(nS), k4 = new Float64Array(nS);
    const tmp = new Float64Array(vars.length);
    const y0 = new Float64Array(nS);
    const evalDer = (s: Float64Array, into: Float64Array) => { for (let i = 0; i < nS; i++) into[i] = der[i](s); };
    const step = (h: number) => {
      // classic RK4 on scope[0..nS)
      y0.set(scope.subarray(0, nS));
      evalDer(scope, k1);
      tmp.set(scope);
      for (let i = 0; i < nS; i++) tmp[i] = y0[i] + (h / 2) * k1[i];
      tmp[ti] = t + h / 2;
      evalDer(tmp, k2);
      for (let i = 0; i < nS; i++) tmp[i] = y0[i] + (h / 2) * k2[i];
      evalDer(tmp, k3);
      for (let i = 0; i < nS; i++) tmp[i] = y0[i] + h * k3[i];
      tmp[ti] = t + h;
      evalDer(tmp, k4);
      for (let i = 0; i < nS; i++) scope[i] = y0[i] + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
      t += h;
      scope[ti] = t;
    };
    const maxEvents = opts.maxEvents ?? 60;
    let ok = true;
    const prevG = events.map((e) => e.when(scope));
    const record = () => obsKeys.forEach((k, j) => out[k].push(obs[j](scope)));
    let idx = 0;
    // record samples at exactly t0
    while (idx < times.length && times[idx] <= t + 1e-12) { record(); idx++; }
    let guard = 0;
    while (idx < times.length) {
      if (++guard > 2_000_000) { ok = false; break; }
      const target = times[idx];
      const h = Math.min(h0, target - t);
      if (h <= 0) { record(); idx++; continue; }
      const before = scope.slice(0, nS);
      const tBefore = t;
      step(h);
      // events: a guard that crossed from positive to <= 0 during this step
      for (let e = 0; e < events.length; e++) {
        const g = events[e].when(scope);
        if (prevG[e] > 0 && g <= 0 && fired.length < maxEvents) {
          // locate the crossing by linear interpolation of the guard, re-step to it
          const frac = prevG[e] / (prevG[e] - g);
          scope.set(before, 0);
          t = tBefore;
          scope[ti] = t;
          if (frac * h > 1e-12) step(frac * h);
          const pre = scope.slice(0, nS);
          const updates = events[e].then.map((u) => ({ i: u.i, v: u.f(scope) }));
          for (const u of updates) scope[u.i] = u.v;
          fired.push({ t, name: events[e].name });
          // nudge so the guard re-arms only after it becomes positive again
          prevG[e] = Math.max(events[e].when(scope), 0) || 0;
          void pre;
          break;
        }
        prevG[e] = g;
      }
      for (let i = 0; i < nS; i++) if (!Number.isFinite(scope[i])) { ok = false; break; }
      if (!ok) break;
      while (idx < times.length && times[idx] <= t + 1e-12) { record(); idx++; }
    }
    // pad if the run stopped early
    for (const k of obsKeys) while (out[k].length < times.length) out[k].push(NaN);
    return { obs: out, events: fired, ok };
  }
  return { law, free, run };
}

/* ─────────────────────────────── fitting ─────────────────────────────── */

export type Fit = {
  lawId: string;
  ok: boolean;
  why?: string;
  theta: Record<string, number>;
  sigma: Record<string, number>;
  /** weighted sum of squared residuals the optimiser minimised */
  trainCost: number;
  /** RMS residual on the frames the law was fitted to, metres or radians per channel (weighted mean) */
  trainRms: number;
  /** RMS error predicting frames it never saw */
  testRms: number;
  /** worst prediction error on held-out frames */
  testMax: number;
  /** RMS held-out error in units of each channel's measurement noise: comparable between laws that observe different channels */
  testZ?: number;
  /** the same on the fitted frames */
  trainZ?: number;
  bic: number;
  n: number;
  k: number;
  iterations: number;
  events: { t: number; name: string }[];
  /** the law's prediction at every observed time (whole clip), per channel */
  predicted: Record<string, number[]>;
  /** how sigma was estimated, and the frame-to-frame correlation of the residuals it allowed for */
  cov?: { method: CovMethod; rho: number; lag?: number; whiteShare?: number };
  /** sigma under every estimator (only when asked for: the coverage Monte Carlo compares them) */
  sigmaBy?: Partial<Record<CovMethod, Record<string, number>>>;
};

/**
 * Robust per-channel noise: MAD of normalised third divided differences. Third differences cancel a constant
 * acceleration, so a fall filmed at 24 fps doesn't pass its own curvature off as noise (second differences
 * overstated the noise 17-fold there; this stays within about 20% for falls, swings and springs from 24 to 240
 * fps). Divided on the real timestamps, so a dropped frame, a gap where the body was hidden or a variable frame
 * rate doesn't read as a jolt; each difference is scaled by its own white-noise spread, which on an even clock
 * is the old Δ³/√20.
 */
export function noiseScale(v: number[], t?: number[]): number {
  const pts: [number, number][] = [];
  for (let i = 0; i < v.length; i++) if (Number.isFinite(v[i]) && (!t || Number.isFinite(t[i]))) pts.push([t ? t[i] : i, v[i]]);
  const d: number[] = [];
  for (let i = 3; i < pts.length; i++) {
    let x = 0, s2 = 0;
    for (let j = i - 3; j <= i; j++) {
      let den = 1;
      for (let m = i - 3; m <= i; m++) if (m !== j) den *= pts[j][0] - pts[m][0];
      if (!den) { s2 = NaN; break; }
      x += pts[j][1] / den;
      s2 += 1 / (den * den);
    }
    if (Number.isFinite(x) && s2 > 0) d.push(Math.abs(x) / Math.sqrt(s2));
  }
  if (d.length < 3) return 1e-3;
  d.sort((a, b) => a - b);
  return Math.max(d[Math.floor(d.length / 2)] * 1.4826, 1e-5);
}

function slopeAtStart(t: number[], v: number[], n = 6) {
  const pts: [number, number][] = [];
  for (let i = 0; i < t.length && pts.length < n; i++) if (Number.isFinite(v[i])) pts.push([t[i], v[i]]);
  if (pts.length < 2) return 0;
  const mt = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const mv = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  let num = 0, den = 0;
  for (const [a, b] of pts) { num += (a - mt) * (b - mv); den += (a - mt) ** 2; }
  return den ? num / den : 0;
}

/** Initial guesses for every free symbol, from the law's own guesses and the data. */
export function initialTheta(c: CompiledLaw, data: Series): Float64Array {
  const law = c.law;
  const theta = new Float64Array(c.free.length);
  const free = law.params.filter((p) => !p.fixed);
  free.forEach((p, i) => (theta[i] = p.guess));
  law.state.forEach((s, i) => {
    let g = law.initialGuess?.[s];
    if (g === undefined) {
      // a state observed directly (observe[ch] === s) starts at the first sample
      const ch = Object.keys(law.observe).find((k) => law.observe[k].replace(/\s/g, "") === s);
      if (ch && data.ch[ch]) g = data.ch[ch].find(Number.isFinite);
      // v<ch> / d<ch> / <ch>dot starts at the channel's initial slope
      const base = s.replace(/^v_?|^d_?|_?dot$|^omega_?/, "");
      const ch2 = Object.keys(law.observe).find((k) => law.observe[k].replace(/\s/g, "") === base);
      if (g === undefined && ch2 && base !== s && data.ch[ch2]) g = slopeAtStart(data.t, data.ch[ch2]);
    }
    theta[free.length + i] = g ?? 0;
  });
  return theta;
}

function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-300) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => r[n] / r[i]);
}

/**
 * Fits a law to the first `trainFrac` of the clip and predicts the rest. Residuals are weighted per channel
 * by that channel's measured noise, so pixels-to-metres scale doesn't decide which channel matters.
 */
type FitOpts = { trainFrac?: number; maxIter?: number; theta0?: Float64Array; starts?: number; covariance?: CovMethod; allCovariances?: boolean };

/** Chosen by scripts/coverage.ts: the estimator whose 1σ intervals hold ~68% under white and AR(0.8) noise. */
export const COVARIANCE: CovMethod = "ar1-white";

export function fitLaw(law: Law, data: Series, opts: FitOpts = {}): Fit {
  const starts = opts.starts ?? Number(process.env.FIT_STARTS ?? 6);
  let best = fitOnce(law, data, opts);
  const nFree = law.params.filter((p) => !p.fixed).length;
  if (!nFree || opts.theta0) return best;
  // deterministic multi-start: each extra start scales every free parameter's guess by a log-spaced factor
  const factors = [0.35, 2.5, 0.15, 6, 0.6, 1.6];
  for (let k = 0; k < starts - 1 && k < factors.length; k++) {
    const law2: Law = { ...law, params: law.params.map((p, i) => (p.fixed ? p : { ...p, guess: clampTo(p, p.guess === 0 ? (p.max !== undefined && Number.isFinite(p.max) ? p.max * 0.1 * factors[(k + i) % factors.length] : factors[(k + i) % factors.length] - 1) : p.guess * factors[(k + i) % factors.length]) })) };
    const f = fitOnce(law2, data, opts);
    if (f.ok && (!best.ok || f.trainCost < best.trainCost)) best = f;
  }
  return best;
}

function clampTo(p: ParamSpec, v: number) {
  return Math.min(p.max ?? Infinity, Math.max(p.min ?? -Infinity, v));
}

function fitOnce(law: Law, data: Series, opts: FitOpts = {}): Fit {
  const fail = (why: string): Fit => ({ lawId: law.id, ok: false, why, theta: {}, sigma: {}, trainCost: Infinity, trainRms: Infinity, testRms: Infinity, testMax: Infinity, bic: Infinity, n: 0, k: 0, iterations: 0, events: [], predicted: {} });
  let c: CompiledLaw;
  try {
    c = compileLaw(law);
  } catch (e) {
    return fail((e as Error).message);
  }
  const chans = Object.keys(law.observe).filter((k) => data.ch[k]);
  if (!chans.length) return fail(`the law observes ${Object.keys(law.observe).join(", ")}, none of which were measured`);
  const N = data.t.length;
  const split = Math.max(3, Math.min(N - 1, Math.round(N * (opts.trainFrac ?? 0.7))));
  const trainT = data.t.slice(0, split);
  const w = Object.fromEntries(chans.map((k) => [k, 1 / noiseScale(data.ch[k], data.t)]));
  const free = law.params.filter((p) => !p.fixed);
  const lo = c.free.map((_, i) => (i < free.length ? free[i].min ?? -Infinity : -Infinity));
  const hi = c.free.map((_, i) => (i < free.length ? free[i].max ?? Infinity : Infinity));
  const clamp = (th: Float64Array) => { for (let i = 0; i < th.length; i++) th[i] = Math.min(hi[i], Math.max(lo[i], th[i])); return th; };

  const residuals = (th: Float64Array): number[] | null => {
    const r = c.run(th, trainT);
    if (!r.ok) return null;
    const out: number[] = [];
    for (const k of chans) {
      const ob = data.ch[k], pr = r.obs[k];
      for (let i = 0; i < split; i++) if (Number.isFinite(ob[i])) out.push((pr[i] - ob[i]) * w[k]);
    }
    return out.some((x) => !Number.isFinite(x)) ? null : out;
  };
  const ss = (r: number[]) => r.reduce((s, x) => s + x * x, 0);
  // residual rows run channel by channel, in time order: the covariance needs where each channel starts and each row's frame
  const seg: number[] = [0], frame: number[] = [];
  for (const k of chans) { for (let i = 0; i < split; i++) if (Number.isFinite(data.ch[k][i])) frame.push(i); seg.push(frame.length); }

  let theta = clamp(opts.theta0 ? Float64Array.from(opts.theta0) : initialTheta(c, data));
  let r = residuals(theta);
  if (!r) return fail("the law could not be integrated from its starting guess");
  let cost = ss(r);
  let lambda = 1e-3;
  const P = theta.length;
  let iter = 0;
  let J: number[][] = [];
  for (; iter < (opts.maxIter ?? 120); iter++) {
    // numeric Jacobian
    J = r.map(() => new Array(P).fill(0));
    for (let j = 0; j < P; j++) {
      const h = 1e-6 * Math.max(Math.abs(theta[j]), 1e-3);
      const tp = Float64Array.from(theta);
      tp[j] += h;
      const rp = residuals(tp);
      if (!rp || rp.length !== r.length) continue;
      for (let i = 0; i < r.length; i++) J[i][j] = (rp[i] - r[i]) / h;
    }
    const JtJ = Array.from({ length: P }, (_, a) => Array.from({ length: P }, (_, b) => { let s = 0; for (let i = 0; i < r!.length; i++) s += J[i][a] * J[i][b]; return s; }));
    const Jtr = Array.from({ length: P }, (_, a) => { let s = 0; for (let i = 0; i < r!.length; i++) s += J[i][a] * r![i]; return s; });
    let improved = false;
    for (let tries = 0; tries < 12; tries++) {
      const A = JtJ.map((row, i) => row.map((v, j) => (i === j ? v + lambda * (v || 1) : v)));
      const d = solve(A, Jtr.map((x) => -x));
      if (!d) { lambda *= 10; continue; }
      const cand = clamp(Float64Array.from(theta, (v, i) => v + d[i]));
      const rc = residuals(cand);
      if (rc && rc.length === r.length && ss(rc) < cost) {
        const rel = (cost - ss(rc)) / Math.max(cost, 1e-30);
        theta = cand; r = rc; cost = ss(rc);
        lambda = Math.max(lambda / 3, 1e-12);
        improved = true;
        if (rel < 1e-10) iter = 1e9; // converged
        break;
      }
      lambda *= 8;
    }
    if (!improved) break;
  }
  const n = r.length;
  const k = P;
  const theta2: Record<string, number> = {};
  // residuals of a tracked body are correlated frame to frame, so n samples carry fewer than n independent pieces
  // of information; see lib/stats/covariance.ts for the estimators and data/bench/coverage.json for their calibration
  // FIT_COVARIANCE picks another estimator for offline comparisons (re-scoring stored runs)
  const method = opts.covariance ?? ((process.env.FIT_COVARIANCE as CovMethod | undefined) || COVARIANCE);
  const sigmaOf = (m: CovMethod) => {
    const cv = paramCovariance(J, r!, seg, frame, m);
    const out: Record<string, number> = {};
    // a negative or non-finite variance means the parameter isn't identifiable from this data: say so, never ±0
    c.free.forEach((name, i) => { const v = cv.cov ? cv.cov[i][i] : NaN; out[name] = Number.isFinite(v) && v > 0 ? Math.sqrt(v) : NaN; });
    return { sigma: out, cv };
  };
  const main = sigmaOf(method);
  const sigma = main.sigma;
  c.free.forEach((name, i) => (theta2[name] = theta[i]));
  let sigmaBy: Fit["sigmaBy"];
  if (opts.allCovariances) sigmaBy = Object.fromEntries((["ols", "ar1-inflate", "newey-west", "ar1-sandwich", "ar1-white"] as CovMethod[]).map((m) => [m, sigmaOf(m).sigma]));
  for (const p of law.params) if (p.fixed) { theta2[p.name] = p.guess; sigma[p.name] = 0; }

  const full = c.run(theta, data.t);
  let trainSq = 0, trainN = 0, testSq = 0, testN = 0, testMax = 0, testZ2 = 0, trainZ2 = 0;
  for (const kch of chans) {
    const ob = data.ch[kch], pr = full.obs[kch];
    for (let i = 0; i < N; i++) {
      if (!Number.isFinite(ob[i]) || !Number.isFinite(pr[i])) continue;
      const e = pr[i] - ob[i];
      if (i < split) { trainSq += e * e; trainN++; trainZ2 += (e * w[kch]) ** 2; } else { testSq += e * e; testN++; testMax = Math.max(testMax, Math.abs(e)); testZ2 += (e * w[kch]) ** 2; }
    }
  }
  return {
    lawId: law.id,
    ok: full.ok,
    theta: theta2,
    sigma,
    trainCost: cost,
    trainRms: Math.sqrt(trainSq / Math.max(1, trainN)),
    testRms: testN ? Math.sqrt(testSq / testN) : NaN,
    testMax,
    testZ: testN ? Math.sqrt(testZ2 / testN) : NaN,
    trainZ: trainN ? Math.sqrt(trainZ2 / trainN) : NaN,
    bic: n * Math.log(cost / n) + k * Math.log(n),
    n,
    k,
    iterations: Math.min(iter, 9999),
    events: full.events,
    predicted: full.obs,
    cov: { method, rho: main.cv.rho, ...(main.cv.lag !== undefined ? { lag: main.cv.lag } : {}), ...(main.cv.whiteShare !== undefined ? { whiteShare: main.cv.whiteShare } : {}) },
    ...(sigmaBy ? { sigmaBy } : {}),
  };
}

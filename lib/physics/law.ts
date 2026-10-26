/**
 * A law is a hypothesis written as equations of motion. Muse proposes it; this file turns it into numbers:
 * integrate it (RK4, with impact events), fit its unknowns to what SAM measured (Levenberg–Marquardt),
 * and score how well it predicts the part of the clip it never saw. No model output is trusted until a law
 * written from it has predicted the future of the clip.
 */
import { compile, names, parse, type Compiled } from "./expr";

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
    for (const n of names(parse(src))) if (!known.has(n) && n !== "pi" && n !== "e") throw new LawError(`${where} uses unknown symbol "${n}"`);
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
  bic: number;
  n: number;
  k: number;
  iterations: number;
  events: { t: number; name: string }[];
  /** the law's prediction at every observed time (whole clip), per channel */
  predicted: Record<string, number[]>;
};

/** Robust per-channel noise: MAD of second differences / sqrt(6) (white noise on a smooth path). */
export function noiseScale(v: number[]): number {
  const d: number[] = [];
  for (let i = 2; i < v.length; i++) {
    const x = v[i] - 2 * v[i - 1] + v[i - 2];
    if (Number.isFinite(x)) d.push(Math.abs(x));
  }
  if (d.length < 3) return 1e-3;
  d.sort((a, b) => a - b);
  const mad = d[Math.floor(d.length / 2)] * 1.4826;
  return Math.max(mad / Math.sqrt(6), 1e-5);
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

function invert(A: number[][]): number[][] | null {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = Array.from({ length: n }, (_, i) => (i === j ? 1 : 0));
    const x = solve(A, e);
    if (!x) return null;
    cols.push(x);
  }
  return Array.from({ length: n }, (_, i) => cols.map((c) => c[i]));
}

/**
 * Fits a law to the first `trainFrac` of the clip and predicts the rest. Residuals are weighted per channel
 * by that channel's measured noise, so pixels-to-metres scale doesn't decide which channel matters.
 */
export function fitLaw(law: Law, data: Series, opts: { trainFrac?: number; maxIter?: number; theta0?: Float64Array; starts?: number } = {}): Fit {
  const starts = opts.starts ?? 6;
  let best = fitOnce(law, data, opts);
  const nFree = law.params.filter((p) => !p.fixed).length;
  if (!nFree || opts.theta0) return best;
  // deterministic multi-start: each extra start scales every free parameter's guess by a log-spaced factor
  const factors = [0.35, 2.5, 0.6, 1.6, 0.15, 6];
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

function fitOnce(law: Law, data: Series, opts: { trainFrac?: number; maxIter?: number; theta0?: Float64Array } = {}): Fit {
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
  const w = Object.fromEntries(chans.map((k) => [k, 1 / noiseScale(data.ch[k])]));
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
  const dof = Math.max(1, n - k);
  const s2 = cost / dof;
  const JtJ = Array.from({ length: P }, (_, a) => Array.from({ length: P }, (_, b) => { let s = 0; for (let i = 0; i < n; i++) s += (J[i]?.[a] ?? 0) * (J[i]?.[b] ?? 0); return s; }));
  const cov = invert(JtJ);
  const theta2: Record<string, number> = {};
  const sigma: Record<string, number> = {};
  // residuals of a smooth track are correlated frame to frame, so n samples carry fewer than n independent
  // pieces of information: inflate by sqrt((1+rho)/(1-rho)) from the lag-1 autocorrelation of the residuals
  let rho = 0;
  {
    let num = 0, den = 0;
    for (let i = 1; i < r.length; i++) num += r[i] * r[i - 1];
    for (let i = 0; i < r.length; i++) den += r[i] * r[i];
    rho = den > 0 ? Math.max(0, Math.min(0.95, num / den)) : 0;
  }
  const inflate = Math.sqrt((1 + rho) / (1 - rho));
  c.free.forEach((name, i) => {
    theta2[name] = theta[i];
    // a negative or non-finite variance means the parameter isn't identifiable from this data: say so, never ±0
    const v = cov ? cov[i][i] * s2 : NaN;
    sigma[name] = Number.isFinite(v) && v > 0 ? Math.sqrt(v) * inflate : NaN;
  });
  for (const p of law.params) if (p.fixed) { theta2[p.name] = p.guess; sigma[p.name] = 0; }

  const full = c.run(theta, data.t);
  let trainSq = 0, trainN = 0, testSq = 0, testN = 0, testMax = 0;
  for (const kch of chans) {
    const ob = data.ch[kch], pr = full.obs[kch];
    for (let i = 0; i < N; i++) {
      if (!Number.isFinite(ob[i]) || !Number.isFinite(pr[i])) continue;
      const e = pr[i] - ob[i];
      if (i < split) { trainSq += e * e; trainN++; } else { testSq += e * e; testN++; testMax = Math.max(testMax, Math.abs(e)); }
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
    bic: n * Math.log(cost / n) + k * Math.log(n),
    n,
    k,
    iterations: Math.min(iter, 9999),
    events: full.events,
    predicted: full.obs,
  };
}

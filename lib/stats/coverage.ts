/**
 * Are the error bars honest? A Monte Carlo over synthetic tracks with known truth: fit each with the real fitter,
 * then count how often truth falls inside ±1σ and ±2σ (68.3% and 95.4% if σ is calibrated) and histogram the
 * pulls (fit − truth)/σ, which should look like a unit normal. Noise is white, or AR(1) with ρ = 0.8 (a centroid
 * that wanders smoothly over several frames, the hard case for any error bar built from residuals).
 */
import { compileLaw, fitLaw, type Law, type Series } from "../physics/law";
import type { CovMethod } from "./covariance";

export type NoiseKind = "white" | "ar0.8" | "mixed";

type Case = { name: string; law: Law; truth: Record<string, number>; key: string; fps: number; seconds: number; noise: Record<string, number> };

export const CASES: Case[] = [
  {
    name: "vacuum projectile",
    law: {
      id: "vacuum", title: "Projectile", summary: "", state: ["x", "y", "vx", "vy"],
      derivatives: { x: "vx", y: "vy", vx: "0", vy: "-g" },
      params: [{ name: "g", guess: 8, min: 0.1, max: 40, unit: "m/s^2" }],
      observe: { x: "x", y: "y" },
    },
    truth: { g: 9.81, "x@0": 0, "y@0": 0, "vx@0": 1.2, "vy@0": 2.6 },
    key: "g", fps: 60, seconds: 0.9, noise: { x: 0.0015, y: 0.0015 },
  },
  {
    name: "damped spring",
    law: {
      id: "spring", title: "Damped spring", summary: "", state: ["x", "v"],
      derivatives: { x: "v", v: "-k*x - c*v" },
      params: [{ name: "k", guess: 30, min: 0.1, max: 500, unit: "1/s^2" }, { name: "c", guess: 0.3, min: 0, max: 20, unit: "1/s" }],
      observe: { x: "x" },
    },
    truth: { k: 39.5, c: 0.4, "x@0": 0.08, "v@0": 0 },
    key: "k", fps: 30, seconds: 4, noise: { x: 0.0006 },
  },
  {
    name: "pendulum",
    law: {
      id: "pendulum", title: "Damped pendulum", summary: "", state: ["theta", "omega"],
      derivatives: { theta: "omega", omega: "-w0^2*sin(theta) - c*omega" },
      params: [{ name: "w0", guess: 3, min: 0.1, max: 60, unit: "rad/s" }, { name: "c", guess: 0.05, min: 0, max: 5, unit: "1/s" }],
      observe: { theta: "theta" },
    },
    truth: { w0: 3.5, c: 0.1, "theta@0": 0.35, "omega@0": 0 },
    key: "w0", fps: 30, seconds: 5, noise: { theta: 0.004 },
  },
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    // mulberry32
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() + 1e-300)) * Math.cos(2 * Math.PI * r());
}

/** One noisy track of a case: the truth integrated at the frame times plus white or AR(0.8) noise of the stated marginal spread. */
export function synthesise(cs: Case, noise: NoiseKind, seed: number): Series {
  const c = compileLaw(cs.law);
  const n = Math.round(cs.fps * cs.seconds);
  const t = Array.from({ length: n }, (_, i) => i / cs.fps);
  const theta = Float64Array.from(c.free, (k) => cs.truth[k]);
  const clean = c.run(theta, t).obs;
  const r = rng(seed);
  // "mixed": half the variance white (pixel quantisation), half a slow AR(0.8) wander; not an AR(1) at all
  const rho = noise === "white" ? 0 : 0.8;
  const white = noise === "mixed" ? Math.SQRT1_2 : 0, slow = noise === "mixed" ? Math.SQRT1_2 : 1;
  const ch: Record<string, number[]> = {};
  for (const [k, sd] of Object.entries(cs.noise)) {
    let e = sd * gauss(r);
    ch[k] = clean[k].map((v, i) => {
      if (i > 0) e = rho * e + Math.sqrt(1 - rho * rho) * sd * gauss(r);
      return v + slow * e + white * sd * gauss(r);
    });
  }
  return { t, ch };
}

export type Bin = { from: number; to: number; count: number };

export type CoverageRow = { law: string; param: string; noise: NoiseKind; n: number; coverage1σ: number; coverage2σ: number; meanAbsPull: number; pulls: Bin[]; failed: number };

const EDGES = [-Infinity, -4, -3.5, -3, -2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, Infinity];

function summarise(law: string, param: string, noise: NoiseKind, pulls: number[], failed: number): CoverageRow {
  const n = pulls.length;
  const counts = EDGES.slice(1).map((hi, i) => pulls.filter((p) => p >= EDGES[i] && p < hi).length);
  return {
    law, param, noise, n,
    coverage1σ: n ? pulls.filter((p) => Math.abs(p) <= 1).length / n : NaN,
    coverage2σ: n ? pulls.filter((p) => Math.abs(p) <= 2).length / n : NaN,
    meanAbsPull: n ? pulls.reduce((s, p) => s + Math.abs(p), 0) / n : NaN,
    pulls: counts.map((count, i) => ({ from: EDGES[i], to: EDGES[i + 1], count })),
    failed,
  };
}

/**
 * Runs `trials` fits per case and noise kind, scoring every estimator from the same fits (each fit is done once
 * and its σ computed every way), so the comparison is like for like.
 */
export function coverage(opts: { trials: number; seed?: number; cases?: string[]; noises?: NoiseKind[]; methods?: CovMethod[] }): Record<CovMethod, CoverageRow[]> {
  const methods = opts.methods ?? (["ols", "ar1-inflate", "newey-west", "ar1-sandwich", "ar1-white"] as CovMethod[]);
  const out = Object.fromEntries(methods.map((m) => [m, [] as CoverageRow[]])) as Record<CovMethod, CoverageRow[]>;
  for (const cs of CASES.filter((c) => !opts.cases || opts.cases.includes(c.name))) {
    for (const noise of opts.noises ?? (["white", "ar0.8"] as NoiseKind[])) {
      const pulls = Object.fromEntries(methods.map((m) => [m, [] as number[]])) as Record<CovMethod, number[]>;
      let failed = 0;
      for (let i = 0; i < opts.trials; i++) {
        const data = synthesise(cs, noise, (opts.seed ?? 1) * 100003 + i * 7919 + (noise === "white" ? 0 : noise === "ar0.8" ? 50021 : 70001) + cs.name.length * 131);
        const fit = fitLaw(cs.law, data, { starts: 1, allCovariances: true });
        if (!fit.ok || !fit.sigmaBy) { failed++; continue; }
        for (const m of methods) {
          const s = fit.sigmaBy[m]?.[cs.key];
          if (Number.isFinite(s) && s! > 0) pulls[m].push((fit.theta[cs.key] - cs.truth[cs.key]) / s!);
        }
      }
      for (const m of methods) out[m].push(summarise(cs.name, cs.key, noise, pulls[m], opts.trials - pulls[m].length));
    }
  }
  return out;
}

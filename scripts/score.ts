// Scores benchmark runs against the synthetic suite's exact truth. No model calls.
// usage: tsx scripts/score.ts [--runs ../bench/runs/synth] [--out data/bench/synth.json]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { median } from "../lib/median";
import path from "node:path";
import { PIPELINE, recordAge, type Candidate, type Experiment } from "../lib/experiment";
import { names, parse } from "../lib/physics/expr";
import type { Law } from "../lib/physics/law";

const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const runsDir = opt("--runs", "bench/runs/synth");
const truthDir = "bench/synth/clips";
const out = opt("--out", "data/bench/synth.json");
// which version of the method the scored runs come from (a re-score names its own: --pipeline "2026-10-27c sealed")
const pipeline = opt("--pipeline", "");

type Truth = {
  case_id: string;
  phenomenon: string;
  variant?: string;
  body: string;
  params: Record<string, { value: number | string | number[]; unit?: string }>;
  metres_per_pixel: number;
  width: number;
  slow_motion_factor: number;
  fps: number;
  moving_objects: { noun_phrase: string; centroid_px: [number, number][] }[];
};

const tv = (t: Truth, k: string) => {
  const v = t.params[k]?.value;
  return typeof v === "number" ? v : undefined;
};

type Check = { quantity: string; truth: number; measured: number; sigma: number; errPct: number; withinSigma: number; eyeball?: number; eyeballErrPct?: number };

function velocityStates(law: Law) {
  // states that are some other state's derivative
  return new Set(law.state.filter((s) => law.state.some((o) => (law.derivatives[o] ?? "").replace(/\s/g, "") === s)));
}

function hasDrag(law: Law) {
  const vel = velocityStates(law);
  for (const v of vel) {
    const e = law.derivatives[v];
    if (!e) continue;
    const used = names(parse(e));
    if ([...vel].some((u) => used.has(u))) return true;
  }
  return false;
}

function usesSin(law: Law) {
  return Object.values(law.derivatives).some((e) => /\bsin\s*\(/.test(e));
}

function paramMatches(law: Law, fit: Candidate["fit"], pred: (p: Law["params"][number]) => boolean) {
  const p = law.params.find((q) => !q.fixed && q.name !== "cal" && pred(q));
  if (!p || !Number.isFinite(fit.theta[p.name])) return null;
  return { name: p.name, v: fit.theta[p.name], s: fit.sigma[p.name] };
}

function check(quantity: string, truth: number | undefined, got: { name: string; v: number; s: number } | null, eye?: Experiment["eyeball"], transform = (x: number) => x): Check | null {
  if (truth === undefined || !got) return null;
  const measured = transform(got.v);
  const sigma = Math.abs(transform(got.v + (Number.isFinite(got.s) ? got.s : 0)) - measured);
  const ey = eye?.estimates.find((x) => x.quantity.toLowerCase() === got.name.toLowerCase());
  const eyv = ey ? transform(ey.value) : undefined;
  return {
    quantity,
    truth,
    measured,
    sigma,
    errPct: ((measured - truth) / truth) * 100,
    withinSigma: sigma ? Math.abs(measured - truth) / sigma : NaN,
    eyeball: eyv,
    eyeballErrPct: eyv !== undefined ? ((eyv - truth) / truth) * 100 : undefined,
  };
}

function constants(e: Experiment, t: Truth, c: Candidate): Check[] {
  const law = c.law, fit = c.fit, eye = e.eyeball;
  const out: (Check | null)[] = [];
  const ph = t.phenomenon;
  // footage slowed s× (and not declared so) really shows gravity g/s²: that is what a measurement of the clip as filmed
  // should find, and the clock check then names the factor (scored separately)
  const slowUnknown = (t.slow_motion_factor ?? 1) > 1 && (e.measured.slowMotion ?? 1) === 1 ? t.slow_motion_factor : 1;
  if (e.measured.calibration.kind !== "none") out.push(check(slowUnknown > 1 ? "g as filmed" : "g", tv(t, "g") === undefined ? undefined : tv(t, "g")! / slowUnknown ** 2, paramMatches(law, fit, (p) => /^g$/i.test(p.name)), eye));
  if (ph === "pendulum") {
    out.push(check("L", tv(t, "L"), paramMatches(law, fit, (p) => /^l$/i.test(p.name) || (/length/i.test(p.meaning ?? "") && p.unit === "m")), eye));
    out.push(check("damping", tv(t, "linear_damping_c"), paramMatches(law, fit, (p) => /1\/s|s\^-1/.test(p.unit ?? "") && /damp|viscous|friction|drag/i.test(p.meaning ?? "")), eye));
  }
  if (ph === "spring_mass") {
    out.push(check("omega0", tv(t, "omega0"), paramMatches(law, fit, (p) => /^(w|w0|omega|omega0|omega_0)$/i.test(p.name) || /angular frequency/i.test(p.meaning ?? "")), eye));
    out.push(check("damping", tv(t, "damping_b"), paramMatches(law, fit, (p) => /^(1\/s|s\^-1)$/.test((p.unit ?? "").replace(/\s/g, "")) && /damp|viscous|friction|drag/i.test(p.meaning ?? "")), eye));
  }
  if (ph === "projectile_drag") out.push(check("drag k", tv(t, "quadratic_drag_k"), paramMatches(law, fit, (p) => /^(1\/m|m\^-1)$/.test((p.unit ?? "").replace(/\s/g, ""))), eye));
  if (ph === "bouncing_ball" || ph === "collision_2d") out.push(check("restitution e", tv(t, "coefficient_of_restitution_e"), paramMatches(law, fit, (p) => /^e$/i.test(p.name) || /restitution/i.test(p.meaning ?? "")), eye));
  if (ph === "incline_rolling") {
    const a = paramMatches(law, fit, (p) => /m\/s/.test(p.unit ?? "") && !/^g$/i.test(p.name) && /accel|downhill|along|slope/i.test(p.meaning ?? ""));
    const G = paramMatches(law, fit, (p) => /gee|in g|of g/i.test(p.meaning ?? ""));
    out.push(check("slope acceleration", tv(t, "slope_acceleration_a"), a ?? (G ? { ...G, v: G.v * 9.81, s: G.s * 9.81 } : null), eye));
  }
  // the camera's scale: what the fall (or the ruler) said a pixel is
  const cal = e.measured.calibration;
  if (cal.kind !== "none") {
    const k = (cal.metresPerPixel * (cal.kind === "gravity" && Number.isFinite(c.fit.theta.cal) ? c.fit.theta.cal : 1) * e.video.width) / t.width;
    out.push({ quantity: `scale (${cal.kind === "gravity" ? "from the fall" : "from a ruler"})`, truth: t.metres_per_pixel, measured: k, sigma: NaN, errPct: ((k - t.metres_per_pixel) / t.metres_per_pixel) * 100, withinSigma: NaN });
  }
  return out.filter((x): x is Check => !!x);
}

function familyOk(t: Truth, law: Law, fit: Candidate["fit"]): { ok: boolean | null; expect: string } {
  const ph = t.phenomenon;
  const dragParam = law.params.find((p) => !p.fixed && /drag|air|damp|viscous/i.test(`${p.name} ${p.meaning}`));
  const dragTiny = dragParam ? Math.abs(fit.theta[dragParam.name]) < 2 * (fit.sigma[dragParam.name] || 0) || Math.abs(fit.theta[dragParam.name]) < 1e-3 : true;
  if (ph === "projectile_drag") return { ok: hasDrag(law) && !dragTiny, expect: "air drag" };
  if (ph === "free_fall" || ph === "vertical_toss" || (ph === "projectile" && t.variant === "no_drag")) return { ok: !hasDrag(law) || dragTiny, expect: "no air drag" };
  if (ph === "pendulum" && t.variant === "large_amplitude") return { ok: usesSin(law), expect: "sin θ (large swings)" };
  if (ph === "pendulum") return { ok: true, expect: "a pendulum law" };
  if (ph === "bouncing_ball") return { ok: (law.events?.length ?? 0) > 0, expect: "bounces (an impact event)" };
  if (ph === "spring_mass") return { ok: hasDrag(law) && !usesSin(law) && !law.state.includes("theta"), expect: "a damped spring (not a pendulum)" };
  if (ph === "collision_2d") return { ok: false, expect: "two bodies (not supported yet)" };
  return { ok: null, expect: "—" };
}

function trackingErrorPx(e: Experiment, t: Truth): number | null {
  const truth = t.moving_objects[0]?.centroid_px;
  if (!truth) return null;
  // our pixels are the normalised clip's (≤1280 wide); the truth is in the original's
  const r = t.width / e.video.width;
  const errs = e.measured.px.map((p) => (truth[p.f] ? Math.hypot(p.x * r - truth[p.f][0], p.y * r - truth[p.f][1]) / r : NaN)).filter(Number.isFinite);
  return errs.length ? median(errs) : null;
}

function relPrediction(e: Experiment, c: Candidate) {
  const chs = Object.keys(c.fit.predicted).filter((k) => e.measured.series.ch[k]);
  const amp = Math.max(...chs.map((k) => { const v = e.measured.series.ch[k].filter(Number.isFinite); return Math.max(...v) - Math.min(...v); }));
  return amp > 0 ? c.fit.testRms / amp : NaN;
}

const rows: unknown[] = [];
const files = existsSync(runsDir) ? readdirSync(runsDir).filter((f) => f.endsWith(".json") && !f.endsWith(".error.json")) : [];
for (const f of files.sort()) {
  const id = f.replace(/\.json$/, "");
  const truthFile = path.join(truthDir, `${id}.json`);
  if (!existsSync(truthFile)) continue;
  const e = JSON.parse(readFileSync(path.join(runsDir, f), "utf8")) as Experiment;
  const t = JSON.parse(readFileSync(truthFile, "utf8")) as Truth;
  const win = e.candidates[0];
  // baseline A: choose by fit to the seen frames only (lowest training error), no prediction test
  const byFit = [...e.candidates].filter((c) => c.fit.ok).sort((a, b) => a.fit.trainRms - b.fit.trainRms)[0];
  // baseline B: textbook controls only, no Muse hypotheses
  const ctl = e.candidates.filter((c) => c.origin === "control" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0];
  const fam = familyOk(t, win.law, win.fit);
  const famFit = byFit ? familyOk(t, byFit.law, byFit.fit) : { ok: null, expect: "" };
  rows.push({
    id,
    phenomenon: t.phenomenon,
    variant: t.variant,
    fps: t.fps,
    slowMotion: t.slow_motion_factor,
    winner: { id: win.law.id, title: win.law.title, origin: win.origin },
    family: fam,
    familyIfChosenByFit: famFit.ok,
    winnerIsByFit: byFit?.law.id === win.law.id,
    trackingErrPx: trackingErrorPx(e, t),
    point: e.measured.px.length,
    predictionRel: relPrediction(e, win),
    predictionRelByFit: byFit ? relPrediction(e, byFit) : null,
    predictionRelControl: ctl ? relPrediction(e, ctl) : null,
    checks: constants(e, t, win),
    calibration: e.measured.calibration.kind,
    clock: e.clock,
    pipeline: e.pipeline ?? null,
    // a by-eye reading from an older pipeline saw a handful of frames, not every frame: it is left out of the by-eye median
    eyeStale: !!e.eyeball && !e.eyeball.seen,
    eyeFrames: recordAge(e).eyeball,
    usd: e.ledger.usd,
    seconds: e.ledger.ms / 1000,
  });
}

const R = rows as { family: { ok: boolean | null }; familyIfChosenByFit: boolean | null; checks: Check[]; trackingErrPx: number | null; predictionRel: number; predictionRelControl: number | null; predictionRelByFit: number | null; usd: number; seconds: number }[];
const med = median;
// every measured number counts, the camera's scale included (a wrong scale is a wrong measurement)
const checks = R.flatMap((r) => r.checks);
// physical constants only (a camera scale has no σ): how often the truth falls inside ±1σ and ±2σ
const withSigma = checks.filter((c) => !c.quantity.startsWith("scale") && Number.isFinite(c.withinSigma));
const eyeChecks = (R as unknown as { eyeStale: boolean; checks: Check[] }[]).filter((r) => !r.eyeStale).flatMap((r) => r.checks).filter((c) => c.eyeballErrPct !== undefined);
const summary = {
  cases: R.length,
  lawCorrect: R.filter((r) => r.family.ok === true).length,
  lawJudged: R.filter((r) => r.family.ok !== null).length,
  lawCorrectIfChosenByFit: R.filter((r) => r.familyIfChosenByFit === true).length,
  medianTrackingErrPx: med(R.map((r) => r.trackingErrPx ?? NaN)),
  medianConstErrPct: med(checks.map((c) => Math.abs(c.errPct))),
  constantsWithin5pct: checks.filter((c) => Math.abs(c.errPct) <= 5).length,
  constantsChecked: checks.length,
  // current-pipeline by-eye readings only (every frame seen); the older ones are counted separately
  // the headline counts every by-eye reading; the ones made with today's prompt (more frames) are reported beside it
  medianEyeballErrPct: med(checks.filter((c) => c.eyeballErrPct !== undefined).map((c) => Math.abs(c.eyeballErrPct!))),
  eyeballChecked: checks.filter((c) => c.eyeballErrPct !== undefined).length,
  medianEyeballErrPctCurrent: med(eyeChecks.map((c) => Math.abs(c.eyeballErrPct!))),
  eyeballCurrent: eyeChecks.length,
  coverage: { checked: withSigma.length, within1: withSigma.filter((c) => c.withinSigma <= 1).length, within2: withSigma.filter((c) => c.withinSigma <= 2).length, worst: withSigma.length ? Math.max(...withSigma.map((c) => c.withinSigma)) : null },
  medianPredictionRel: med(R.map((r) => r.predictionRel)),
  medianPredictionRelControl: med(R.map((r) => r.predictionRelControl ?? NaN)),
  medianPredictionRelByFit: med(R.map((r) => r.predictionRelByFit ?? NaN)),
  // the clock check, scored on the clips rendered in slow motion: was it flagged, and how close was the factor?
  slowClips: (rows as { slowMotion: number }[]).filter((r) => r.slowMotion > 1).length,
  slowFlagged: (rows as { slowMotion: number; clock: { factor: number } | null }[]).filter((r) => r.slowMotion > 1 && r.clock).length,
  slowFactorErrPct: (rows as { slowMotion: number; clock: { factor: number } | null }[]).filter((r) => r.slowMotion > 1 && r.clock).map((r) => +(((r.clock!.factor - r.slowMotion) / r.slowMotion) * 100).toFixed(1)),
  totalUsd: R.reduce((s, r) => s + r.usd, 0),
  medianSeconds: med(R.map((r) => r.seconds)),
};
mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), pipeline: pipeline || [...new Set((rows as { pipeline: string | null }[]).map((r) => r.pipeline ?? "before version stamps"))].join(", "), scoredWith: PIPELINE, summary, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
for (const r of rows as { id: string; family: { ok: boolean | null; expect: string }; winner: { id: string }; checks: Check[]; trackingErrPx: number | null; predictionRel: number }[])
  console.log(`${r.id.padEnd(34)} law ${r.family.ok === null ? "  -  " : r.family.ok ? " ok  " : "WRONG"} ${r.winner.id.padEnd(26)} track ${r.trackingErrPx?.toFixed(2) ?? "-"}px  pred ${(r.predictionRel * 100).toFixed(2)}%  ${r.checks.map((c) => `${c.quantity}: ${c.measured.toPrecision(4)} vs ${c.truth.toPrecision(4)} (${c.errPct >= 0 ? "+" : ""}${c.errPct.toFixed(1)}%${c.eyeballErrPct !== undefined ? `, eye ${c.eyeballErrPct >= 0 ? "+" : ""}${c.eyeballErrPct.toFixed(0)}%` : ""})`).join("; ")}`);

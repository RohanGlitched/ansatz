import { test } from "node:test";
import assert from "node:assert/strict";
import { additiveTerms, combineStiffnessDamping, dampingSignature, freeModes, hasLopsided, motionPair, print, warmStart, withDrive, withDryDamping, withLopsided } from "../lib/combine";
import { classifyPeaks, noiseThreshold, spectrumTool, unexplainedPeak } from "../lib/spectrum";
import { compile, parse } from "../lib/physics/expr";
import { baseCandidate, driveCandidate, driveGuard, fitWithRoom, rankCandidates, recombinations, spectrumOf, type Candidate } from "../lib/experiment";
import { compileLaw, type Law, type Series } from "../lib/physics/law";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

/** a spring in pixels like the sealed renders: 7 s at 60 fps, released `A` px from rest, any law of motion, white noise */
function spring(acc: (x: number, v: number, t: number) => number, opts: { A?: number; noise?: number; seed?: number; s0?: number } = {}): Series {
  const r = rng(opts.seed ?? 1);
  const A = opts.A ?? 80, s0 = opts.s0 ?? 300, sd = opts.noise ?? 0.15;
  const T: number[] = [], Y: number[] = [];
  let x = A, v = 0;
  const h = 1 / 600;
  for (let i = 0; i <= 7 * 600; i++) {
    const ti = i * h;
    if (i % 10 === 0) { T.push(ti); Y.push(s0 + x + sd * gauss(r)); }
    const k1x = v, k1v = acc(x, v, ti);
    const k2x = v + (h / 2) * k1v, k2v = acc(x + (h / 2) * k1x, v + (h / 2) * k1v, ti + h / 2);
    const k3x = v + (h / 2) * k2v, k3v = acc(x + (h / 2) * k2x, v + (h / 2) * k2v, ti + h / 2);
    const k4x = v + h * k3v, k4v = acc(x + h * k3x, v + h * k3v, ti + h);
    x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  return { t: T, ch: { s: Y } };
}

const base = { summary: "", state: ["s", "v"], observe: { s: "s" } };
/** the laws Muse Spark tends to propose for a spring, in pixels */
const viscous: Law = { ...base, id: "viscous", title: "Damped spring", derivatives: { s: "v", v: "-w0*w0*(s - s_eq) - gamma*v" }, params: [{ name: "w0", guess: 8, min: 0.5, max: 30, unit: "rad/s" }, { name: "s_eq", guess: 300, min: 0, max: 700, unit: "px" }, { name: "gamma", guess: 0.3, min: 0, max: 5, unit: "1/s" }] };
const quadratic: Law = { ...base, id: "quadratic", title: "Spring with quadratic drag", derivatives: { s: "v", v: "-w0*w0*(s - s_eq) - cq*v*abs(v)" }, params: [{ name: "w0", guess: 8, min: 0.5, max: 30, unit: "rad/s" }, { name: "s_eq", guess: 300, min: 0, max: 700, unit: "px" }, { name: "cq", guess: 0.001, min: 0, max: 0.1, unit: "1/px" }] };
const duffingViscous: Law = { ...base, id: "duffing-viscous", title: "Hardening spring, viscous", derivatives: { s: "v", v: "-w0^2*(s - s_eq) - beta*(s - s_eq)^3 - gamma*v" }, params: [{ name: "w0", guess: 8, min: 0.5, max: 30, unit: "rad/s" }, { name: "s_eq", guess: 300, min: 0, max: 700, unit: "px" }, { name: "beta", guess: 0.003, min: 0, max: 0.1, unit: "1/(px^2 s^2)" }, { name: "gamma", guess: 0.3, min: 0, max: 5, unit: "1/s" }] };

const fitOne = (l: Law, data: Series) => fitWithRoom(l, data);
const pool = (laws: Law[], data: Series, origin: Candidate["origin"] = "muse"): Candidate[] =>
  laws.map((l) => {
    const r = fitOne(l, data);
    return { law: r.law, fitted: r.fitted, fit: r.fit, origin, rank: 0 };
  });

test("terms of an acceleration: printed back to the same equation, split by what they do", () => {
  const vars = ["w0", "s", "s_eq", "beta", "gamma", "v", "k", "m", "x", "c", "F", "w", "t", "p", "a", "b", "d", "q"];
  const at = Float64Array.from(vars.map((_, i) => 0.3 + 0.17 * i));
  for (const src of ["-w0^2*(s - s_eq) - beta*(s - s_eq)^3 - gamma*v", "-(k/m)*x - c*v*abs(v) + F*cos(w*t + p)", "a - b/(c - d) - -q^2", "-(x^2)^3", "(-x)^2 - a/(b*c) - (a - b) - a*-b"]) {
    const back = print(parse(src));
    assert.ok(Math.abs(compile(back, vars)(at) - compile(src, vars)(at)) < 1e-12, `${src} → ${back}`);
  }
  const terms = additiveTerms(parse("-w0^2*(s - s_eq) - gamma*v + F*cos(w*t)")).map((t) => print(t));
  assert.deepEqual(terms, ["-w0 ^ 2 * (s - s_eq)", "-gamma * v", "F * cos(w * t)"]);
  assert.equal(print(parse("(-x)^2")), "(-x) ^ 2");
  assert.deepEqual(motionPair(viscous, "s"), { pos: "s", vel: "v" });
  assert.equal(dampingSignature(viscous), "linear");
  assert.equal(dampingSignature(quadratic), "quadratic");
  assert.equal(dampingSignature({ ...viscous, derivatives: { s: "v", v: "-w*w*s - g*v - mu*tanh(v/2)" } }), "dry+linear");
});

test("Muse Wonder's stiffness with Muse Spark's damping: the hardening spring with quadratic drag that neither wrote", () => {
  const c = combineStiffnessDamping(duffingViscous, { ...quadratic, state: ["x", "u"], derivatives: { x: "u", u: "-w0*w0*(x - s_eq) - gamma*u*abs(u)" }, observe: { s: "x" }, params: [{ name: "w0", guess: 8, unit: "rad/s" }, { name: "s_eq", guess: 300, unit: "px" }, { name: "gamma", guess: 0.002, min: 0, max: 0.1, unit: "1/px" }] }, "s")!;
  assert.ok(c);
  assert.equal(c.derivatives.v, "-w0 ^ 2 * (s - s_eq) - beta * (s - s_eq) ^ 3 - gamma * v * abs(v)");
  assert.deepEqual(c.params.map((p) => p.name), ["w0", "s_eq", "beta", "gamma"], "Wonder's own gamma goes with its damping; Spark's takes the name");
  assert.equal(c.params.find((p) => p.name === "gamma")!.unit, "1/px");
  // a clash with a constant the stiffness keeps is renamed
  const k = combineStiffnessDamping({ ...duffingViscous, derivatives: { s: "v", v: "-w0^2*(s - s_eq) - beta*(s - s_eq)^3 - g*v" }, params: duffingViscous.params.map((p) => (p.name === "gamma" ? { ...p, name: "g" } : p)) }, { ...quadratic, derivatives: { s: "v", v: "-w0*w0*(s - s_eq) - beta*v*abs(v)" }, params: [...quadratic.params.slice(0, 2), { name: "beta", guess: 0.002, unit: "1/px" }] }, "s")!;
  assert.equal(k.derivatives.v, "-w0 ^ 2 * (s - s_eq) - beta * (s - s_eq) ^ 3 - beta_d * v * abs(v)");
  assert.doesNotThrow(() => compileLaw(c));
  assert.equal(combineStiffnessDamping(duffingViscous, viscous, "s"), null, "the same damping: nothing to combine");
  assert.equal(combineStiffnessDamping(duffingViscous, { ...quadratic, derivatives: { s: "v", v: "-w0*w0*(s - s_eq) - cq*v*abs(v) + F*cos(w*t)" } }, "s"), null, "a law with a drive is not a damping donor");
});

test("a drive on a law: F·cos(ω_d t + φ) on the acceleration, started at the peak, every other term as it was", () => {
  const d = withDrive(viscous, { omega: 4.2, ampNoise: 100, byChannel: { s: 20 }, coef: { s: { a: 0, b: -20 } } }, 7.6, "px")!;
  assert.equal(d.derivatives.v, "-w0*w0*(s - s_eq) - gamma*v + F_drive*cos(w_drive*t + phi_drive)");
  const p = Object.fromEntries(d.params.map((x) => [x.name, x]));
  assert.equal(p.w_drive.guess, 4.2);
  // missing motion −(0·cos − 20 sin) = 20 sin ωt = 20 cos(ωt − π/2); below ω₀ the force is in phase
  assert.ok(Math.abs(p.F_drive.guess - (7.6 ** 2 - 4.2 ** 2) * 20) < 1e-9);
  assert.ok(Math.abs(p.phi_drive.guess + Math.PI / 2) < 1e-9);
  assert.equal(p.F_drive.unit, "px/s^2");
  assert.doesNotThrow(() => compileLaw(d));
  assert.equal(withDrive(d, { omega: 4.2, ampNoise: 100, byChannel: { s: 20 } }, 7.6, "px"), null, "never a second drive");
});

test("peak labels: noise under the look-elsewhere threshold, drift under two cycles, the motion's own, harmonics, and unexplained", () => {
  // 294 samples, one channel: white noise reaches about 0.41 × the noise once in a thousand spectra; never under 2
  assert.equal(noiseThreshold(294, 1), 2);
  assert.ok(noiseThreshold(8, 1) > 2);
  const s = classifyPeaks(
    { law: "x", peaks: [{ omega: 4.0, ampNoise: 180, byChannel: { s: 25 } }, { omega: 15.0, ampNoise: 40, byChannel: { s: 6 } }, { omega: 7.9, ampNoise: 30, byChannel: { s: 4 } }, { omega: 1.4, ampNoise: 20, byChannel: { s: 3 } }, { omega: 11.0, ampNoise: 0.6, byChannel: { s: 0.1 } }] },
    7.5,
    { spanS: 4.9, n: 294, channels: 1 },
  );
  assert.deepEqual(s.peaks.map((p) => p.label), ["unexplained", "harmonic", "motion", "drift", "noise"]);
  // a pair mirrored about the motion with like amplitudes: sidebands of a changing swing, not a drive; a dominant line keeps its label
  const sb = classifyPeaks({ law: "x", peaks: [{ omega: 9.38, ampNoise: 10.5, byChannel: {} }, { omega: 6.82, ampNoise: 7.6, byChannel: {} }, { omega: 18.5, ampNoise: 100, byChannel: {} }, { omega: 9.3, ampNoise: 29, byChannel: {} }] }, 8.1, { spanS: 4.9, n: 294, channels: 1 });
  assert.deepEqual(sb.peaks.map((p) => p.label), ["sideband", "sideband", "unexplained", "unexplained"]);
  assert.equal(unexplainedPeak(s)!.omega, 4.0);
  const tool = spectrumTool(s, { s: "px" });
  assert.equal(tool.peaks[0].label, "unexplained");
  assert.equal(tool.peaks[1].harmonic_of_motion, 2);
  assert.match(tool.summary, /UNEXPLAINED/);
});

test("a driven spring: the best law without a drive leaves an unexplained peak at the drive, code adds the drive, and it wins on the held-out frames", () => {
  // like sealed round 6605125 in pixels: ω₀ 7.59, a drive at 4.25 rad/s slower than the spring, viscous damping
  const data = spring((x, v, t) => -(7.59 ** 2) * x - 0.3 * v + 1100 * Math.cos(4.25 * t + 0.4), { seed: 3 });
  const m = { series: data, noise: { s: 0.15 } };
  const cands = pool([viscous, quadratic], data);
  const b = baseCandidate(cands, m)!;
  const spec = spectrumOf(b, m);
  const peak = unexplainedPeak(spec);
  assert.ok(peak && Math.abs(peak.omega - 4.25) / 4.25 < 0.08, `unexplained peak ${peak?.omega} (${spec.peaks.map((p) => `${p.omega.toFixed(2)} ${p.label}`).join(", ")})`);
  const dc = driveCandidate(b, spec, () => "px", (l) => fitOne(l, data))!;
  assert.ok(dc.cand.fit.ok);
  assert.ok(Math.abs(dc.cand.fit.theta.w_drive - 4.25) / 4.25 < 0.005, `w_drive ${dc.cand.fit.theta.w_drive}`);
  assert.ok(Math.abs(dc.cand.fit.theta.w0 - 7.59) / 7.59 < 0.005, `w0 ${dc.cand.fit.theta.w0}`);
  cands.push(dc.cand);
  rankCandidates(cands, 0.15);
  assert.equal(cands[0].combined, "drive", `winner ${cands[0].law.id}`);
});

test("undriven springs: no false drive (no unexplained peak, or a drive that loses), over linear, hardening and dry-friction springs", () => {
  const cases: { name: string; acc: (x: number, v: number, t: number) => number; laws: Law[] }[] = [
    { name: "viscous", acc: (x, v) => -(7.78 ** 2) * x - 0.46 * v, laws: [viscous, quadratic] },
    { name: "quadratic", acc: (x, v) => -(9.1 ** 2) * x - 0.0016 * v * Math.abs(v), laws: [viscous, quadratic] },
    { name: "hardening + quadratic", acc: (x, v) => -(7.56 ** 2) * x - 0.0044 * x ** 3 - 0.0015 * v * Math.abs(v), laws: [viscous, quadratic, duffingViscous] },
    { name: "dry friction", acc: (x, v) => -(8 ** 2) * x - 250 * Math.tanh(v / 2), laws: [viscous, quadratic] },
  ];
  let falseDrives = 0;
  for (const c of cases)
    for (const seed of [5, 6]) {
      const data = spring(c.acc, { seed });
      const m = { series: data, noise: { s: 0.15 } };
      const cands = pool(c.laws, data);
      const b = baseCandidate(cands, m)!;
      const spec = spectrumOf(b, m);
      const dc = driveCandidate(b, spec, () => "px", (l) => fitOne(l, data));
      if (dc?.cand.fit.ok) cands.push(dc.cand);
      rankCandidates(cands, 0.15);
      if (cands[0].combined === "drive") falseDrives++;
      if (process.env.COMBINE_DEBUG) console.log(c.name, seed, b.law.id, spec.peaks.map((p) => `${p.omega.toFixed(2)} ${p.ampNoise.toFixed(1)} ${p.label}`).join(", "), dc ? `drive ${dc.cand.fit.ok} w ${dc.cand.fit.theta.w_drive?.toFixed(2)} testZ ${dc.cand.fit.testZ?.toFixed(2)}` : "no drive candidate", "| winner", cands[0].law.id, cands[0].fit.testZ?.toFixed(2));
    }
  assert.equal(falseDrives, 0);
});

test("recombination in the pool: Muse Wonder's hardening with Muse Spark's quadratic drag beats both parents on a hardening spring with quadratic damping", () => {
  // like sealed round 6604797's replicate: Wonder wrote hardening + viscous, Spark had quadratic drag on a linear spring
  const data = spring((x, v) => -(8.41 ** 2) * x - 0.0051 * x ** 3 - 0.0021 * v * Math.abs(v), { seed: 9 });
  const m = { series: data, noise: { s: 0.15 } };
  const cands = [...pool([viscous, quadratic], data), ...pool([duffingViscous], data, "revision")];
  const rev = cands.find((c) => c.origin === "revision")!;
  const recs = recombinations(rev, cands, m);
  assert.equal(recs.length, 1, recs.map((r) => r.law.id).join(", "));
  assert.deepEqual(recs[0].from, ["duffing-viscous", "quadratic"]);
  const r = fitOne(recs[0].law, data);
  cands.push({ law: r.law, fitted: r.fitted, fit: r.fit, origin: "combined", combined: "stiffness+damping", rank: 0 });
  rankCandidates(cands, 0.15);
  assert.equal(cands[0].combined, "stiffness+damping", `winner ${cands[0].law.id}`);
  assert.ok(Math.abs(cands[0].fit.theta.cq - 0.0021) / 0.0021 < 0.02, `quadratic drag ${cands[0].fit.theta.cq}`);
});

test("a driven lopsided spring (like sealed round 6605629): the drive's line is unexplained, its mixing product at 2ω₀ − ω_d is labelled mixing, no peak is a sideband, and code's drive recovers ω_d", () => {
  // in pixels at 0.00129 m/px: ω₀ 9.03, k2/m 213.75 /(m s²) = 0.2757 /(px s²), viscous 0.40, drive 2.996 m/s² = 2322 px/s² at 13.13 rad/s
  const data = spring((x, v, t) => -(9.0277 ** 2) * x - 0.2757 * x * x - 0.4038 * v + 2322 * Math.cos(13.13 * t), { A: 94, seed: 11 });
  const m = { series: data, noise: { s: 0.15 } };
  const cands = pool([viscous, quadratic], data);
  const b = baseCandidate(cands, m)!;
  const spec = spectrumOf(b, m, undefined, 4);
  const say = spec.peaks.map((p) => `${p.omega.toFixed(2)} ${p.ampNoise.toFixed(0)} ${p.label}`).join(", ");
  const peak = unexplainedPeak(spec);
  assert.ok(peak && Math.abs(peak.omega - 13.13) / 13.13 < 0.02, `unexplained peak ${peak?.omega} (${say})`);
  assert.ok(!spec.peaks.some((p) => p.label === "sideband"), `no sideband label (${say})`);
  const mix = spec.peaks.find((p) => p.label === "mixing");
  assert.ok(mix && Math.abs(mix.omega - (2 * spec.motionOmega! - peak!.omega)) < 0.5, `mixing product near 2ω₀ − ω_d (${say})`);
  const tool = spectrumTool(spec, { s: "px" });
  assert.match(tool.what_follows, /write the drive term yourself/);
  assert.match(String(tool.peaks.find((p) => p.label === "unexplained")!.meaning), /is the usual cause; a drive whose fitted frequency slides onto the motion's own frequency is not a drive/);
  const dc = driveCandidate(b, spec, () => "px", (l) => fitOne(l, data))!;
  assert.ok(dc.cand.fit.ok, dc.cand.fit.why);
  assert.ok(Math.abs(dc.cand.fit.theta.w_drive - 13.13) / 13.13 < 0.01, `w_drive ${dc.cand.fit.theta.w_drive}`);
  assert.equal(driveGuard(dc.cand.law, dc.cand.fit, spec), null, "a drive at the drive's own frequency passes the guard");
});

test("a drive a model writes inside the motion's band is rejected (sealed replicate 6604797-r3), and no spectrum of an undriven spring asks for one", () => {
  // the hardening spring with quadratic drag of round 6604797; Muse Wonder wrote "a gentle periodic push near the bobbing rate"
  const data = spring((x, v) => -(8.41 ** 2) * x - 0.0051 * x ** 3 - 0.0021 * v * Math.abs(v), { seed: 9 });
  const m = { series: data, noise: { s: 0.15 } };
  const cands = pool([viscous, quadratic], data);
  const spec = spectrumOf(baseCandidate(cands, m)!, m);
  const nearRes: Law = { ...base, id: "spring-damped-drive-near-res", title: "Damped spring with a push near the bobbing rate", derivatives: { s: "v", v: "-w0*w0*(s - s_eq) - gamma*v + F*cos(w_d*t + phi)" }, params: [...viscous.params, { name: "F", guess: 300, min: 0, max: 5000, unit: "px/s^2" }, { name: "w_d", guess: 8.5, min: 7.8, max: 9.4, unit: "rad/s" }, { name: "phi", guess: 0, min: -7, max: 7, unit: "rad" }] };
  const r = fitOne(nearRes, data);
  assert.ok(r.fit.ok);
  const g = driveGuard(r.law, r.fit, spec);
  assert.ok(g, `w_d ${r.fit.theta.w_d} against the motion's ${spec.motionOmega}`);
  assert.match(g!.why, /slid onto the motion's own/);
  // in cycles per second the same: 2π f is the frequency checked
  const hz: Law = { ...nearRes, id: "hz", derivatives: { s: "v", v: "-w0*w0*(s - s_eq) - gamma*v + F*cos(2*pi*f_d*t + phi)" }, params: [...viscous.params, { name: "F", guess: 300, min: 0, max: 5000, unit: "px/s^2" }, { name: "f_d", guess: 1.35, min: 1.25, max: 1.5, unit: "Hz" }, { name: "phi", guess: 0, min: -7, max: 7, unit: "rad" }] };
  assert.ok(driveGuard(hz, { ok: true, theta: { f_d: 1.36 } }, spec));
  assert.equal(driveGuard(hz, { ok: true, theta: { f_d: 2.2 } }, spec), null, "13.8 rad/s is clear of the motion");
  assert.ok(driveGuard(hz, { ok: true, theta: { f_d: 40 } }, spec)!.why.includes("frame rate"), "past the frame rate's limit");
});

test("code moves on the leader: a driven law keeps its drive when its damping is swapped (recombination or dry friction), an x² stiffness joins about the law's own rest position, and a drive written as a free undamped oscillator is seen", () => {
  const driven: Law = { ...viscous, id: "viscous-drive", title: "Damped spring, driven", derivatives: { s: "v", v: "-w0*w0*(s - s_eq) - gamma*v + F_drive*cos(w_drive*t + phi_drive)" }, params: [...viscous.params, { name: "F_drive", guess: 2000, min: 0, max: 9000, unit: "px/s^2" }, { name: "w_drive", guess: 13.9, min: 7, max: 28, unit: "rad/s" }, { name: "phi_drive", guess: 0, min: -7, max: 7, unit: "rad" }] };
  const rec = combineStiffnessDamping(driven, quadratic, "s")!;
  assert.ok(rec, "a driven stiffness law takes another damping");
  assert.match(rec.derivatives.v, /F_drive \* cos\(w_drive \* t \+ phi_drive\)/);
  assert.match(rec.derivatives.v, /cq \* v \* abs\(v\)/);
  assert.doesNotThrow(() => compileLaw(rec));
  const dry = withDryDamping(driven, { omega: 10, amp: 80 })!;
  assert.equal(dry.derivatives.v, "-w0 * w0 * (s - s_eq) + F_drive * cos(w_drive * t + phi_drive) - mu_dry*tanh(v/v0_dry)");
  assert.ok(!dry.params.some((p) => p.name === "gamma"), "the viscous constant goes with its term");
  assert.equal(withDryDamping(dry, { omega: 10, amp: 80 }), null, "never a second dry term");
  const lop = withLopsided(driven, { omega: 10, amp: 80 })!;
  assert.match(lop.derivatives.v, /- k2_lop\*\(s - s_eq\)\^2$/);
  assert.ok(hasLopsided(lop));
  assert.equal(withLopsided(lop, { omega: 10, amp: 80 }), null);
  assert.doesNotThrow(() => compileLaw(withDryDamping(lop, { omega: 10, amp: 80 })!));
  // 6604982's winner: two free modes, one undamped at the drive's frequency
  const twoMode: Law = { ...base, id: "two-mode", title: "Two modes", state: ["u", "v", "p", "w"], derivatives: { u: "v", v: "-om*om*u - g1*v", p: "w", w: "-om2*om2*p - g2*w" }, observe: { s: "seq + u + p" }, params: [{ name: "om", guess: 15, unit: "rad/s" }, { name: "g1", guess: 0, unit: "1/s" }, { name: "om2", guess: 9, unit: "rad/s" }, { name: "g2", guess: 0.3, unit: "1/s" }, { name: "seq", guess: 300, unit: "px" }] };
  const modes = freeModes(twoMode, { om: 15.21, g1: 0.0, om2: 9.356, g2: 0.26, seq: 300 }, { om: 0.27, g1: 0.53, om2: 0.056, g2: 0.11, seq: 0.1 });
  assert.equal(modes.length, 2);
  assert.ok(modes[0].undamped && Math.abs(modes[0].omega - 15.21) < 1e-3, JSON.stringify(modes[0]));
  assert.ok(!modes[1].undamped, "γ 0.26 ± 0.11 is damped");
  assert.deepEqual(freeModes(viscous, { w0: 8, s_eq: 300, gamma: 0.3 }), [], "one oscillator: no free mode");
});

test("an undriven lopsided spring (the stiffness drawn 5 of 12 times): no false drive, and code's x² move on the leader recovers k2", () => {
  // like sealed round 6605123 without its dry friction, in pixels: ω₀ 7.49, k2/m 0.183 /(px s²), viscous 0.3
  let falseDrives = 0;
  for (const seed of [21, 22]) {
    const data = spring((x, v) => -(7.49 ** 2) * x - 0.183 * x * x - 0.3 * v, { A: 108, seed });
    const m = { series: data, noise: { s: 0.15 } };
    const cands = pool([viscous, quadratic], data);
    const b = baseCandidate(cands, m)!;
    const spec = spectrumOf(b, m);
    const dc = driveCandidate(b, spec, () => "px", (l) => fitOne(l, data));
    if (dc?.cand.fit.ok) cands.push(dc.cand);
    rankCandidates(cands, 0.15);
    if (cands[0].combined === "drive") falseDrives++;
    const lead = cands[0];
    const marked = spec.peaks.some((p) => p.label === "drift" || p.harmonic === 2);
    assert.ok(marked, `a drift or a 2ω₀ line marks the lopsided spring (${spec.peaks.map((p) => `${p.omega.toFixed(2)} ${p.label}`).join(", ")})`);
    const l = withLopsided(warmStart(lead.law, lead.fit.theta), { omega: spec.motionOmega!, amp: 108 })!;
    const r = fitOne(l, data);
    assert.ok(r.fit.ok, r.fit.why);
    cands.push({ law: r.law, fitted: r.fitted, fit: r.fit, origin: "combined", combined: "lopsided", rank: 0 });
    rankCandidates(cands, 0.15);
    assert.equal(cands[0].combined, "lopsided", `winner ${cands[0].law.id}`);
    assert.ok(Math.abs(r.fit.theta.k2_lop - 0.183) / 0.183 < 0.03, `k2 ${r.fit.theta.k2_lop}`);
  }
  assert.equal(falseDrives, 0);
});

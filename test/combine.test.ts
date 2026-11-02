import { test } from "node:test";
import assert from "node:assert/strict";
import { additiveTerms, combineStiffnessDamping, dampingSignature, motionPair, print, withDrive } from "../lib/combine";
import { classifyPeaks, noiseThreshold, spectrumTool, unexplainedPeak } from "../lib/spectrum";
import { compile, parse } from "../lib/physics/expr";
import { baseCandidate, driveCandidate, fitWithRoom, rankCandidates, recombinations, spectrumOf, type Candidate } from "../lib/experiment";
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

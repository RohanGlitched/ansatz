import { test } from "node:test";
import assert from "node:assert/strict";
import { compile, parse, toLatex, ExprError } from "../lib/physics/expr";
import { compileLaw, fitLaw, LawError, type Law, type Series } from "../lib/physics/law";

// deterministic noise
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
function gauss(r: () => number) {
  return Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
}

test("expressions: precedence, functions, unknown names rejected", () => {
  const f = compile("-x^2 + 2*sin(pi/2) - 3/4", ["x"]);
  assert.equal(f(Float64Array.of(3)), -9 + 2 - 0.75);
  assert.equal(compile("2^3^2", [])(new Float64Array(0)), 512);
  assert.equal(compile("x**2", ["x"])(Float64Array.of(4)), 16);
  assert.throws(() => compile("process.exit(1)", []), ExprError);
  assert.throws(() => compile("constructor", []), ExprError);
  assert.throws(() => compile("foo(1)", []), ExprError);
  assert.throws(() => compile("toString(1)", []), ExprError);
  assert.throws(() => compile("__proto__", []), ExprError);
  assert.throws(() => parse("1 +"), ExprError);
  assert.match(toLatex("-g - k*vy*sqrt(vx^2+vy^2)"), /\\sqrt/);
});

const freeFall: Law = {
  id: "fall",
  title: "Uniform gravity",
  summary: "Falls with constant acceleration g.",
  state: ["y", "vy"],
  derivatives: { y: "vy", vy: "-g" },
  params: [{ name: "g", guess: 5, min: 0, max: 50, unit: "m/s^2" }],
  observe: { y: "y" },
};

function sample(n: number, fps: number, f: (t: number) => number, noise: number, seed = 1) {
  const r = rng(seed);
  const t = Array.from({ length: n }, (_, i) => i / fps);
  return { t, v: t.map((x) => f(x) + noise * gauss(r)) };
}

test("free fall: recovers g from 1 mm noise", () => {
  const { t, v } = sample(48, 60, (t) => 1.2 + 0.4 * t - 0.5 * 9.81 * t * t, 0.001);
  const fit = fitLaw(freeFall, { t, ch: { y: v } });
  assert.ok(fit.ok, fit.why);
  assert.ok(Math.abs(fit.theta.g - 9.81) < 0.08, `g=${fit.theta.g}`);
  assert.ok(fit.sigma.g > 0 && fit.sigma.g < 0.2, `sigma=${fit.sigma.g}`);
  assert.ok(fit.testRms < 0.01, `test rms ${fit.testRms}`);
});

test("pendulum: large-amplitude law recovers g/L and beats the small-angle law on held-out swings", () => {
  const L = 0.8, g = 9.81, th0 = 1.1, c = 0.05;
  // integrate truth finely
  const fps = 30, T = 6;
  const truth: number[] = [];
  let th = th0, w = 0;
  const h = 1e-4;
  for (let i = 0, tt = 0; i <= T * fps; i++) {
    const target = i / fps;
    while (tt < target - 1e-12) { const a = -(g / L) * Math.sin(th) - c * w; w += a * h; th += w * h; tt += h; }
    truth.push(th);
  }
  const r = rng(3);
  const data: Series = { t: truth.map((_, i) => i / fps), ch: { theta: truth.map((x) => x + 0.004 * gauss(r)) } };
  const big: Law = {
    id: "pend",
    title: "Pendulum",
    summary: "",
    state: ["theta", "omega"],
    derivatives: { theta: "omega", omega: "-(g/L)*sin(theta) - c*omega" },
    params: [
      { name: "g", guess: 9.81, fixed: true },
      { name: "L", guess: 1, min: 0.05, max: 10 },
      { name: "c", guess: 0, min: 0, max: 5 },
    ],
    observe: { theta: "theta" },
  };
  const small: Law = { ...big, id: "small", derivatives: { theta: "omega", omega: "-(g/L)*theta - c*omega" } };
  const fb = fitLaw(big, data);
  const fs = fitLaw(small, data);
  assert.ok(Math.abs(fb.theta.L - L) < 0.01, `L=${fb.theta.L}`);
  assert.ok(Math.abs(fb.theta.c - c) < 0.01, `c=${fb.theta.c}`);
  assert.ok(fb.testRms < fs.testRms / 5, `big ${fb.testRms} vs small ${fs.testRms}`);
});

test("bounce: an impact event recovers the coefficient of restitution", () => {
  const g = 9.81, e = 0.78, R = 0.03;
  const fps = 120;
  const ts: number[] = [], ys: number[] = [];
  let y = 0.9, v = 0;
  const h = 1e-5;
  let tt = 0;
  for (let i = 0; i < 1.8 * fps; i++) {
    const target = i / fps;
    while (tt < target - 1e-12) { v -= g * h; y += v * h; if (y < R && v < 0) { v = -e * v; y = R; } tt += h; }
    ts.push(target); ys.push(y);
  }
  const r = rng(9);
  const data: Series = { t: ts, ch: { y: ys.map((x) => x + 0.0015 * gauss(r)) } };
  const law: Law = {
    id: "bounce",
    title: "Bouncing ball",
    summary: "",
    state: ["y", "vy"],
    derivatives: { y: "vy", vy: "-g" },
    params: [
      { name: "g", guess: 9.5, min: 1, max: 20 },
      { name: "e", guess: 0.6, min: 0, max: 1 },
      { name: "floor", guess: 0.0, min: -1, max: 1 },
    ],
    observe: { y: "y" },
    events: [{ when: "y - floor", then: { vy: "-e*vy" }, name: "bounce" }],
  };
  const fit = fitLaw(law, data);
  assert.ok(fit.ok, fit.why);
  assert.ok(Math.abs(fit.theta.e - e) < 0.03, `e=${fit.theta.e}`);
  assert.ok(Math.abs(fit.theta.g - g) < 0.3, `g=${fit.theta.g}`);
  assert.ok(fit.events.length >= 2, `events ${fit.events.length}`);
});

test("projectile with quadratic drag: drag law predicts held-out flight better than the vacuum law", () => {
  const g = 9.81, k = 0.25;
  const fps = 60;
  let x = 0, y = 0, vx = 6, vy = 7;
  const t: number[] = [], X: number[] = [], Y: number[] = [];
  const h = 1e-4;
  let tt = 0;
  for (let i = 0; i < 1.3 * fps; i++) {
    const target = i / fps;
    while (tt < target - 1e-12) {
      const s = Math.hypot(vx, vy);
      vx += -k * vx * s * h; vy += (-g - k * vy * s) * h; x += vx * h; y += vy * h; tt += h;
    }
    t.push(target); X.push(x); Y.push(y);
  }
  const r = rng(5);
  const data: Series = { t, ch: { x: X.map((v) => v + 0.002 * gauss(r)), y: Y.map((v) => v + 0.002 * gauss(r)) } };
  const base = {
    title: "",
    summary: "",
    state: ["x", "y", "vx", "vy"],
    observe: { x: "x", y: "y" },
  };
  const vacuum: Law = { ...base, id: "vac", derivatives: { x: "vx", y: "vy", vx: "0", vy: "-g" }, params: [{ name: "g", guess: 9.81, fixed: true }] };
  const drag: Law = {
    ...base,
    id: "drag",
    derivatives: { x: "vx", y: "vy", vx: "-k*vx*sqrt(vx^2+vy^2)", vy: "-g - k*vy*sqrt(vx^2+vy^2)" },
    params: [{ name: "g", guess: 9.81, fixed: true }, { name: "k", guess: 0.05, min: 0, max: 5 }],
  };
  const fv = fitLaw(vacuum, data), fd = fitLaw(drag, data);
  assert.ok(Math.abs(fd.theta.k - k) < 0.03, `k=${fd.theta.k}`);
  assert.ok(fd.testRms < fv.testRms / 3, `drag ${fd.testRms} vacuum ${fv.testRms}`);
  assert.ok(fd.bic < fv.bic);
});

test("compileLaw rejects symbols the law never defined", () => {
  assert.throws(() => compileLaw({ ...freeFall, derivatives: { y: "vy", vy: "-g*mass" } }), /unknown symbol "mass"/);
  assert.throws(() => compileLaw({ ...freeFall, derivatives: { y: "vy" } }), /no derivative/);
});

test("laws: a bare e is not Euler's number; restitution must be declared", () => {
  const bounce = (params: Law["params"]): Law => ({
    id: "bounce", title: "Bounce", summary: "", state: ["y", "vy"], derivatives: { y: "vy", vy: "-9.81" },
    params: [{ name: "floor", guess: 0, min: -1, max: 1 }, ...params], observe: { y: "y" },
    events: [{ name: "bounce", when: "y - floor", then: { vy: "-e*vy" } }],
  });
  assert.throws(() => compileLaw(bounce([])), (err: Error) => err instanceof LawError && /`e` is not defined; name the restitution parameter e, or use exp\(1\)/.test(err.message));
  assert.doesNotThrow(() => compileLaw(bounce([{ name: "e", guess: 0.7, min: 0.05, max: 1 }])));
  // exp(1) and pi still work
  assert.doesNotThrow(() => compileLaw({ ...bounce([]), events: [{ name: "b", when: "y - floor", then: { vy: "-vy*exp(1)/pi" } }] }));
});

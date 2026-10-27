import { test } from "node:test";
import assert from "node:assert/strict";
import { noiseScale } from "../lib/physics/law";
import { coverage } from "../lib/stats/coverage";

// the published run is scripts/coverage.ts (400 tracks per case, data/bench/coverage.json); this is a fast check
// of the same thing, pooled over the projectile, the spring and the pendulum
test("error bars are calibrated: ±1σ and ±2σ hold the truth about 68% and 95% of the time, white or AR(0.8) noise", () => {
  const rows = coverage({ trials: 40, seed: 7, methods: ["ar1-white"] })["ar1-white"];
  for (const noise of ["white", "ar0.8"] as const) {
    const rs = rows.filter((r) => r.noise === noise);
    const n = rs.reduce((s, r) => s + r.n, 0);
    const c1 = rs.reduce((s, r) => s + r.coverage1σ * r.n, 0) / n, c2 = rs.reduce((s, r) => s + r.coverage2σ * r.n, 0) / n;
    assert.ok(n >= 110, `${noise}: only ${n} fits succeeded`);
    assert.ok(c1 > 0.55 && c1 < 0.8, `${noise}: 1σ coverage ${c1.toFixed(3)}`);
    assert.ok(c2 > 0.88 && c2 < 0.99, `${noise}: 2σ coverage ${c2.toFixed(3)}`);
  }
  // the plain least-squares error bar is the thing being fixed: under AR(0.8) it holds the truth far less often
  const ols = coverage({ trials: 20, seed: 7, noises: ["ar0.8"], methods: ["ols"], cases: ["pendulum"] }).ols[0];
  assert.ok(ols.coverage1σ < 0.5, `ols 1σ ${ols.coverage1σ}`);
});

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("noise is read on the real clock: a jittery frame rate or dropped frames don't pass motion off as noise", () => {
  const sigma = 0.0006;
  for (const fps of [30, 240]) for (const kind of ["jitter", "gaps"]) {
    for (const f of [(x: number) => 1.5 - 4.905 * x * x, (x: number) => 0.3 * Math.sin((2 * Math.PI * x) / 1.55)]) {
      // the median over 15 clips: one 2 s clip at 30 fps has ~50 differences, whose MAD scatters ±30% by itself
      const ratios = Array.from({ length: 15 }, (_, seed) => {
        const r = rng(fps * 13 + kind.length + seed * 101);
        const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
        const t: number[] = [];
        let tt = 0;
        // a phone's variable frame rate (±20% per frame), or every seventh frame followed by two dropped ones
        for (let i = 0; i < fps * 2; i++) { tt += kind === "jitter" ? (0.8 + 0.4 * r()) / fps : (i % 7 === 3 ? 3 : 1) / fps; t.push(tt); }
        return noiseScale(t.map((x) => f(x) + sigma * g()), t) / sigma;
      }).sort((a, b) => a - b);
      assert.ok(Math.abs(ratios[7] - 1) < 0.2, `${fps} fps ${kind}: median ratio ${ratios[7].toFixed(2)}`);
    }
  }
  // reading the same jittery fall as if evenly spaced overstates its noise many times over
  const r = rng(5);
  const t: number[] = [];
  let tt = 0;
  for (let i = 0; i < 60; i++) { tt += (0.8 + 0.4 * r()) / 30; t.push(tt); }
  const v = t.map((x) => 1.5 - 4.905 * x * x);
  assert.ok(noiseScale(v) > 10 * noiseScale(v, t), `${noiseScale(v)} vs ${noiseScale(v, t)}`);
});

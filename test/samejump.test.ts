import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { combine, measureAll, pairRatio, type ClipId } from "../lib/samejump";

type Fit = { g: number; sigma: number; f0: number; f1: number; n: number; px: [number, number, number][] };
const e = JSON.parse(readFileSync("data/showcase/moon-jump.json", "utf8"));
const same = e.extras.memoryTest.sameJump as { jumps: { jump: number; real: Fit; slowed: Fit; ratio: number; sigma: number }[]; combined: { ratio: number; sigma: number } };
const controls = e.extras.memoryTest.controls as { clips: { id: ClipId; jumps: { jump: number; copy: Fit; ratio: number; sigma: number; truth: number }[] }[] };
const { fits } = await measureAll();
const near = (a: number, b: number, tol: number, what: string) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs stored ${b}`);
const sameFit = (got: Fit, want: Fit, what: string) => {
  assert.equal(got.f0, want.f0, `${what} first frame`);
  assert.equal(got.f1, want.f1, `${what} last frame`);
  assert.equal(got.n, want.n, `${what} points`);
  near(got.g, want.g, 5e-5, `${what} |a|`);
  near(got.sigma, want.sigma, 5e-5, `${what} σ`);
  assert.deepEqual(got.px, want.px, `${what} px`);
};

test("the cached SAM tracks reproduce the stored jump-for-jump result, windows found by code", () => {
  same.jumps.forEach((j, k) => {
    sameFit(fits.broadcast[k], j.real, `broadcast jump ${j.jump}`);
    sameFit(fits.slowed[k], j.slowed, `slowed jump ${j.jump}`);
    const p = pairRatio(fits.broadcast[k], fits.slowed[k]);
    near(p.ratio, j.ratio, 5e-4, `jump ${j.jump} ratio`);
    near(p.sigma, j.sigma, 5e-4, `jump ${j.jump} σ`);
  });
  const c = combine(same.jumps.map((_, k) => pairRatio(fits.broadcast[k], fits.slowed[k])));
  assert.equal(c.ratio.toFixed(3), same.combined.ratio.toFixed(3));
  assert.equal(c.sigma.toFixed(3), same.combined.sigma.toFixed(3));
});

test("the controls reproduce, and recover each jump's own factor within 2σ", () => {
  for (const clip of controls.clips)
    clip.jumps.forEach((j, k) => {
      sameFit(fits[clip.id][k], j.copy, `${clip.id} jump ${j.jump}`);
      const p = pairRatio(fits.broadcast[k], fits[clip.id][k]);
      near(p.ratio, j.ratio, 5e-4, `${clip.id} jump ${j.jump} ratio`);
      assert.ok(Math.abs(p.ratio - j.truth) < 2 * p.sigma, `${clip.id} jump ${j.jump}: ${p.ratio} ± ${p.sigma}, truth ${j.truth}`);
    });
});

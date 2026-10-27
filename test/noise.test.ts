import { test } from "node:test";
import assert from "node:assert/strict";
import { noiseScale } from "../lib/physics/law";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("noise is recovered within 25% for falls and swings from 24 to 240 fps", () => {
  const sigma = 0.0006;
  for (const fps of [24, 30, 60, 240]) {
    const r = rng(fps);
    const g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
    for (const f of [(t: number) => 1.5 - 4.905 * t * t, (t: number) => 0.3 * Math.sin((2 * Math.PI * t) / 1.55)]) {
      const v = Array.from({ length: fps * 2 }, (_, i) => f(i / fps) + sigma * g());
      const ratio = noiseScale(v) / sigma;
      assert.ok(ratio > 0.75 && ratio < 1.25, `fps ${fps}: ratio ${ratio.toFixed(2)}`);
    }
  }
});

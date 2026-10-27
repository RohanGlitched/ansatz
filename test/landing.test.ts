import { test } from "node:test";
import assert from "node:assert/strict";
import { landingIndex } from "../lib/measure";

// y in pixels, downward; 60 fps; g = 2000 px/s²
const fps = 60, g = 2000;
const times = (n: number) => Array.from({ length: n }, (_, i) => i / fps);

test("landing: a fall that stops on the floor ends at the last free frame", () => {
  const t = times(60), floor = 500;
  const y = t.map((tt) => Math.min(floor, 100 + 0.5 * g * tt * tt));
  const lastFree = y.findIndex((v) => v >= floor) - 1;
  const k = landingIndex(t, y);
  assert.ok(k >= lastFree - 1 && k <= lastFree, `landing at ${k}, last free ${lastFree}`);
});

test("landing: bounces are not landings", () => {
  const t = times(120), floor = 500;
  let yv = 100, v = 0;
  const y: number[] = [];
  for (let i = 0; i < t.length; i++) {
    v += g / fps; yv += v / fps;
    if (yv > floor) { yv = floor - (yv - floor); v = -0.8 * v; }
    y.push(yv);
  }
  assert.equal(landingIndex(t, y), -1);
});

test("landing: a fall slowed by drag and an apex are not landings", () => {
  const t = times(90);
  // thrown up, through the apex, then falling against drag toward terminal speed
  let yv = 400, v = -900;
  const y: number[] = [];
  for (let i = 0; i < t.length; i++) {
    v += (g - 0.004 * v * Math.abs(v)) / fps; yv += v / fps;
    y.push(yv + Math.sin(i * 1.7) * 0.3);
  }
  assert.equal(landingIndex(t, y), -1);
});

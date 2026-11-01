import { test } from "node:test";
import assert from "node:assert/strict";
import { fitCircle, pivotUnusable } from "../lib/measure";
import { clockCheckOf, clockCheckFor, type Experiment } from "../lib/experiment";

/* ── the pivot gate: a long pendulum filmed close up keeps its real, far pivot ── */

test("pivot gate: the Aachen close-up (centre 2,400 px above a 1000×1080 frame, straight above the swing) is a pivot", () => {
  // path x 264–960, y 458–484 about a centre at (612, −2431), radius 2913 px, as in the published run's pivot note
  const C = { x: 612, y: -2431 }, R = 2913, A = Math.asin(348 / R);
  const pts = Array.from({ length: 300 }, (_, i) => {
    const a = A * Math.cos(i / 7) * Math.exp(-i / 2000);
    return { x: C.x + R * Math.sin(a) + 0.3 * Math.sin(i * 1.7), y: C.y + R * Math.cos(a) + 0.3 * Math.cos(i * 2.3) };
  });
  const p = fitCircle(pts)!;
  assert.ok(Math.abs(p.x - C.x) < 30 && Math.abs(p.r - R) < 120, `centre ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, r ${p.r.toFixed(0)}`);
  assert.equal(pivotUnusable(p, pts, { width: 1000, height: 1080 }), null);
});

test("pivot gate: a far centre beside the path is still refused", () => {
  // the same arc turned on its side: the centre is far off to the left, not above
  const C = { x: 612, y: -2431 }, R = 2913, A = Math.asin(348 / R);
  const arc = Array.from({ length: 300 }, (_, i) => { const a = A * Math.cos(i / 7); return { x: C.x + R * Math.sin(a), y: C.y + R * Math.cos(a) }; });
  const side = arc.map((q) => ({ x: q.y + 2500, y: 1000 - q.x }));
  assert.ok(pivotUnusable(fitCircle(side)!, side, { width: 1000, height: 1080 }));
});

/* ── the clock check says why it could not run when g was held as given ── */

test("clock check: g held as given (a short swing, no length) says gravity was given, not measured", () => {
  const c = clockCheckOf({ slowSet: false, calibration: "reference", statedLength: false, gravity: null, flagged: false, body: "earth", gHeld: true });
  assert.equal(c.checked, false);
  assert.match(c.why, /gravity was given, not measured/);
  assert.doesNotMatch(c.why, /no gravity was measured/);
  // a stored record with the old reason is corrected on the page
  const e = { clockCheck: { checked: false, why: "Clock not checked: no gravity was measured in this run (the winning law has none, or the clip didn’t determine it)." }, given: ["g = 9.807 m/s² (Earth): hold g fixed and measure the pendulum's length L in metres from its swing"], measured: { calibration: { kind: "reference" }, slowMotion: 1 }, comparisons: [], clock: null, observation: { body: "earth" } } as unknown as Experiment;
  assert.match(clockCheckFor(e).why, /gravity was given, not measured/);
});

test("clock check: a record from before the check was stored gets the same rule applied", () => {
  const e = { given: [], measured: { calibration: { kind: "reference" }, slowMotion: 1 }, comparisons: [{ param: "g", measured: 1.716, sigma: 0.114, reference: 1.625, label: "surface gravity of the Moon", errorPct: 5.6, withinSigma: 0.8 }], clock: null, observation: { body: "moon" } } as unknown as Experiment;
  const c = clockCheckFor(e);
  assert.equal(c.checked, true);
  assert.match(c.why, /the Moon’s/);
});

/* ── short tosses: rest before the throw is dropped when the flight search falls back to the whole window ── */

import { measure, takeoffIndex } from "../lib/measure";
import type { Sample, Track } from "../lib/meta/sam";

const sample = (f: number, cx: number, cy: number): Sample => ({ f, cx, cy, area: 300, angle: 0, major: 20, minor: 20, len: 20, wid: 20, box: [cx - 10, cy - 10, cx + 10, cy + 10], conf: 0.9 });

test("take-off: the first moving frame after a rest at the start, and 0 when the window starts in motion", () => {
  const t = Array.from({ length: 24 }, (_, i) => i / 24);
  const t0 = 0.3;
  const y = t.map((s) => (s < t0 ? 400 : 400 - 300 * (s - t0) + 490 * (s - t0) ** 2) + 0.2 * Math.sin(s * 997));
  const x = t.map((s) => 200 + 150 * Math.max(0, s - t0) + 0.2 * Math.cos(s * 611));
  const up = takeoffIndex(t, x, y);
  assert.ok(up >= 6 && up <= 8, `take-off at frame ${up} (the throw is at frame 7.2)`);
  assert.equal(takeoffIndex(t.slice(8), x.slice(8), y.slice(8)), 0);
});

test("short toss: when no flight search range is long enough, the window starts at the take-off, not with the rest before it", () => {
  // the judge's case: 24 fps, thrown at 0.3 s, landing at 0.6 s; a window of 14 frames, the throw at frame 7
  const times = Array.from({ length: 14 }, (_, i) => i / 24);
  const t0 = 0.3, land = 0.6, a = 980, v0 = (a * (land - t0)) / 2;
  const y = (s: number) => (s < t0 || s > land ? 400 : 400 - v0 * (s - t0) + (a / 2) * (s - t0) ** 2) + 0.2 * Math.sin(s * 997);
  const x = (s: number) => 200 + 150 * Math.min(Math.max(s - t0, 0), land - t0) + 0.2 * Math.cos(s * 611);
  const track: Track = { id: "1", noun: "ball", samples: times.map((s, f) => sample(f, x(s), y(s))) };
  const m = measure({ track, times, kind: "flight", metresPerPixel: { kind: "stated", value: 0.001, note: "test" }, frame: { width: 640, height: 480 } });
  assert.ok(m.window.f0 >= 6, `window starts at frame ${m.window.f0}`);
});

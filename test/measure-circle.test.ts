import { test } from "node:test";
import assert from "node:assert/strict";
import { fitCircle, kasaCircle, measure, pendulumLength } from "../lib/measure";
import type { Track } from "../lib/meta/sam";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-300)) * Math.cos(2 * Math.PI * r());

const R = 400;

/**
 * A bob swinging through `arcDeg` (peak to peak) about (640, 100), radius 400 px, three periods at 30 fps, with
 * 0.7 px centroid noise (white, or AR(1) frame to frame). `peg`: the string catches a peg that far below the
 * pivot on the right-hand side (an interrupted pendulum). `rod`: the string wraps on a round pivot of that radius,
 * so the free length shortens by rod·|θ| as it swings out.
 */
function swing(o: { arcDeg: number; seed: number; rho?: number; peg?: number; rod?: number }) {
  const A = ((o.arcDeg / 2) * Math.PI) / 180, fps = 30, n = 180, sd = 0.7, rho = o.rho ?? 0;
  const r = rng(o.seed);
  let ex = sd * gauss(r), ey = sd * gauss(r);
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const th = A * Math.cos((Math.PI * i) / fps + 0.3);
    if (i) {
      ex = rho * ex + Math.sqrt(1 - rho * rho) * sd * gauss(r);
      ey = rho * ey + Math.sqrt(1 - rho * rho) * sd * gauss(r);
    }
    const peg = o.peg && th > 0 ? o.peg : 0;
    const len = R - peg - (o.rod ?? 0) * Math.abs(th);
    pts.push({ x: 640 + len * Math.sin(th) + ex, y: 100 + peg + len * Math.cos(th) + ey });
  }
  return pts;
}

const sdOf = (a: number[]) => { const m = a.reduce((s, x) => s + x, 0) / a.length; return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

test("40° arc: the geometric fit recovers the radius, its bootstrap σ matches the spread, and L is determined", () => {
  const rs: number[] = [], sig: number[] = [], kasa: number[] = [];
  let within = 0;
  for (let s = 1; s <= 30; s++) {
    const pts = swing({ arcDeg: 40, seed: s });
    const p = fitCircle(pts)!;
    assert.ok(p.lengthOk, `seed ${s}: ${p.why}`);
    assert.ok(Math.abs(p.arcDeg - 40) < 2, `arc ${p.arcDeg}`);
    rs.push(p.r); sig.push(p.sigmaR!); kasa.push(kasaCircle(pts)!.r);
    if (Math.abs(p.r - R) <= 2 * p.sigmaR!) within++;
  }
  const bias = rs.reduce((a, x) => a + x, 0) / rs.length - R, kBias = kasa.reduce((a, x) => a + x, 0) / kasa.length - R;
  const ratio = sdOf(rs) / (sig.reduce((a, x) => a + x, 0) / sig.length);
  assert.ok(Math.abs(bias) < Math.abs(kBias), `geometric bias ${bias.toFixed(2)} px vs Kåsa ${kBias.toFixed(2)} px`);
  assert.ok(ratio > 0.75 && ratio < 1.35, `spread / bootstrap σ = ${ratio.toFixed(2)}`);
  assert.ok(within >= 26, `${within}/30 within 2σ`);
  const L = pendulumLength(fitCircle(swing({ arcDeg: 40, seed: 1 }))!, 0.002, 0.03)!;
  assert.ok(L && Math.abs(L.L - 0.8) < 0.02 && L.rel > 0.03 && L.rel < 0.035, JSON.stringify(L));
});

test("10° and 20° arcs: the radius isn't determined, and the pivot says so instead of passing on a biased L", () => {
  for (const arcDeg of [10, 20]) {
    const p = fitCircle(swing({ arcDeg, seed: 7 }))!;
    assert.equal(p.lengthOk, false);
    assert.match(p.why!, /only \d+° of arc/);
    assert.equal(pendulumLength(p, 0.002), null);
    // what L would have been: Kåsa pulls a 20° arc tens of pixels short, the geometric fit far less
    const kb = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => kasaCircle(swing({ arcDeg, seed: s }))!.r - R);
    const gb = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => fitCircle(swing({ arcDeg, seed: s }), { boot: 20 })!.r - R);
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    assert.ok(Math.abs(mean(gb)) < 0.5 * Math.abs(mean(kb)), `${arcDeg}°: geometric ${mean(gb).toFixed(1)} px, Kåsa ${mean(kb).toFixed(1)} px`);
    assert.ok(p.sigmaR! > (arcDeg === 10 ? 15 : 4), `σ_r ${p.sigmaR}`);
  }
  // and over 25° it is
  assert.ok(fitCircle(swing({ arcDeg: 30, seed: 7 }))!.lengthOk);
});

test("gaps in the track (the bob hidden for stretches) leave the arc and the radius intact", () => {
  const pts = swing({ arcDeg: 40, seed: 11 });
  const kept = pts.filter((_, i) => !((i >= 20 && i < 50) || (i >= 95 && i < 120) || (i >= 150 && i < 160)));
  const p = fitCircle(kept)!;
  assert.ok(p.lengthOk, p.why);
  assert.ok(Math.abs(p.arcDeg - 40) < 3, `arc ${p.arcDeg}`);
  assert.ok(Math.abs(p.r - R) < 3 * p.sigmaR!, `r ${p.r.toFixed(1)} ± ${p.sigmaR!.toFixed(1)}`);
});

test("correlated centroid noise raises no false alarm of drift or two radii", () => {
  for (let s = 1; s <= 12; s++) for (const arcDeg of [40, 70]) {
    const p = fitCircle(swing({ arcDeg, seed: 100 + s, rho: 0.8 }), { seed: s })!;
    assert.ok(p.lengthOk, `seed ${s}, ${arcDeg}°: ${p.why}`);
  }
});

test("an interrupted pendulum (two radii) and a string wrapping on its pivot (radius drifting with angle) don't set L", () => {
  const peg = fitCircle(swing({ arcDeg: 50, seed: 3, peg: 100 }))!;
  assert.equal(peg.twoRadii, true);
  assert.equal(peg.lengthOk, false);
  assert.match(peg.why!, /two arcs/);
  // a 10 px rod shortens the string by 5 px at the ends of a 60° swing: a circle still fits to 0.8 px rms, but its
  // radius comes out 30 px (7%) short
  const wrapped = fitCircle(swing({ arcDeg: 60, seed: 3, rod: 10 }))!;
  assert.ok(wrapped.rmsPx < 1.5 && R - wrapped.r > 15, `rms ${wrapped.rmsPx}, r ${wrapped.r}`);
  assert.equal(wrapped.lengthOk, false);
  assert.match(wrapped.why!, /drifts with angle|two bands/);
  // through measure(): the interrupted path gets no pivot (no single centre to measure an angle about), and says why
  const track = (pts: { x: number; y: number }[]): Track => ({
    id: "bob", noun: "bob",
    samples: pts.map((p, f) => ({ f, cx: p.x, cy: p.y, area: 300, angle: 0, major: 20, minor: 20, len: 20, wid: 20, box: [p.x - 10, p.y - 10, p.x + 10, p.y + 10], conf: 0.9 })),
  });
  const times = Array.from({ length: 180 }, (_, i) => i / 30);
  const m = measure({ track: track(swing({ arcDeg: 50, seed: 3, peg: 100 })), times, kind: "swing", metresPerPixel: { value: 0.002, kind: "reference", note: "ruler" } });
  assert.equal(m.pivot, undefined);
  assert.equal(m.series.ch.theta, undefined);
  assert.match(m.pivotNote ?? "", /two arcs/);
  const ok = measure({ track: track(swing({ arcDeg: 40, seed: 3 })), times, kind: "swing", metresPerPixel: { value: 0.002, kind: "reference", note: "ruler" } });
  assert.ok(ok.pivot?.lengthOk && ok.series.ch.theta);
});

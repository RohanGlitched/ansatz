import { test } from "node:test";
import assert from "node:assert/strict";
import { driveFrequencyParams, labelHarmonics, residualPeaks, seedDriveFrequency, spectrumSummary } from "../lib/spectrum";
import { fitSeeded, spectrumOf } from "../lib/experiment";
import { fitLaw, type Law, type Series } from "../lib/physics/law";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());

test("residual spectrum: the two strongest frequencies and their amplitudes, a sidelobe never taken for the second", () => {
  const r = rng(7);
  // 4.9 s at 60 fps (the fitted 70% of a 7 s clip), every 9th frame dropped
  const t: number[] = [], y: number[] = [];
  for (let i = 0; i < 294; i++) {
    if (i % 9 === 4) continue;
    const ti = i / 60;
    t.push(ti);
    y.push(3 * Math.sin(15.22 * ti + 0.3) + 1.1 * Math.cos(9.75 * ti) + 0.4 + 0.2 * gauss(r));
  }
  const peaks = residualPeaks({ y: { t, r: y } }, { y: 0.2 }, 2);
  assert.equal(peaks.length, 2);
  assert.ok(Math.abs(peaks[0].omega - 15.22) / 15.22 < 0.005, `strongest at ${peaks[0].omega}`);
  assert.ok(Math.abs(peaks[0].byChannel.y - 3) < 0.15, `amplitude ${peaks[0].byChannel.y}`);
  assert.ok(Math.abs(peaks[0].ampNoise - 15) < 0.8, `in noise units ${peaks[0].ampNoise}`);
  assert.ok(Math.abs(peaks[1].omega - 9.75) / 9.75 < 0.01, `next at ${peaks[1].omega}`);
  assert.ok(Math.abs(peaks[1].byChannel.y - 1.1) < 0.15, `next amplitude ${peaks[1].byChannel.y}`);

  const line = spectrumSummary({ law: "Damped spring", peaks }, { y: "px" });
  assert.match(line, /“Damped spring”/);
  assert.match(line, /strongest at ω = 15\.2\d rad\/s/);
  assert.match(line, /next at ω = 9\.7\d rad\/s/);
  assert.match(line, /px in y/);
  assert.equal(spectrumSummary(null), "");
  assert.equal(spectrumSummary({ law: "x", peaks: [] }), "");
});

test("drive-frequency parameters: a free frequency multiplied with t inside sin or cos", () => {
  const base = { id: "d", title: "d", summary: "", state: ["s", "v"], observe: { y: "s" } };
  const driven: Law = { ...base, derivatives: { s: "v", v: "-w0^2*s - b*v + F0*cos(wd*t + phi)" }, params: [{ name: "w0", guess: 9, unit: "rad/s" }, { name: "b", guess: 0.3, unit: "1/s" }, { name: "F0", guess: 1, unit: "m/s^2" }, { name: "wd", guess: 10, min: 1, max: 12, unit: "rad/s" }, { name: "phi", guess: 0, unit: "rad" }] };
  assert.deepEqual(driveFrequencyParams(driven), [{ name: "wd", cycles: false }]);
  const hz: Law = { ...base, derivatives: { s: "v", v: "-k*s + A*sin(2*pi*f*t)" }, params: [{ name: "k", guess: 90, unit: "1/s^2" }, { name: "A", guess: 1, unit: "m/s^2" }, { name: "f", guess: 1.5, unit: "Hz" }] };
  assert.deepEqual(driveFrequencyParams(hz), [{ name: "f", cycles: true }]);
  const free: Law = { ...base, derivatives: { s: "v", v: "-w0^2*s - b*v" }, params: [{ name: "w0", guess: 9, unit: "rad/s" }, { name: "b", guess: 0.3, unit: "1/s" }] };
  assert.deepEqual(driveFrequencyParams(free), []);
  const held: Law = { ...driven, params: driven.params.map((p) => (p.name === "wd" ? { ...p, fixed: true } : p)) };
  assert.deepEqual(driveFrequencyParams(held), []);

  const spec = { law: "free", peaks: [{ omega: 15.2, ampNoise: 10, byChannel: { y: 2 } }] };
  const s = seedDriveFrequency(driven, spec)!;
  const wd = s.params.find((p) => p.name === "wd")!;
  assert.equal(wd.guess, 15.2);
  assert.ok(wd.max! >= 15.2, "the bound widens to take the start");
  assert.equal(s.params.find((p) => p.name === "w0")!.guess, 9, "nothing else moves");
  assert.ok(Math.abs(seedDriveFrequency(hz, spec)!.params.find((p) => p.name === "f")!.guess - 15.2 / (2 * Math.PI)) < 1e-12);
  assert.equal(seedDriveFrequency(free, spec), null);
  assert.equal(seedDriveFrequency(driven, null), null);
});

test("a drive's frequency started at the strongest residual frequency recovers a drive the law's own guess misses", () => {
  // a driven, damped linear spring like sealed round 6604982: w0 9.75, b 0.23, F0 3.4 m/s² at wd 15.22 rad/s
  const r = rng(11);
  const T: number[] = [], Y: number[] = [];
  let s = 0.1, v = 0;
  const h = 1 / 600;
  for (let i = 0; i <= 7 * 600; i++) {
    const ti = i * h;
    if (i % 20 === 0) { T.push(ti); Y.push(s + 0.0004 * gauss(r)); }
    const acc = (x: number, u: number, tt: number) => -(9.75 ** 2) * x - 0.23 * u + 3.4 * Math.cos(15.22 * tt);
    // RK4
    const k1x = v, k1v = acc(s, v, ti);
    const k2x = v + (h / 2) * k1v, k2v = acc(s + (h / 2) * k1x, v + (h / 2) * k1v, ti + h / 2);
    const k3x = v + (h / 2) * k2v, k3v = acc(s + (h / 2) * k2x, v + (h / 2) * k2v, ti + h / 2);
    const k4x = v + h * k3v, k4v = acc(s + h * k3x, v + h * k3v, ti + h);
    s += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
  }
  const data: Series = { t: T, ch: { y: Y } };
  const m = { series: data, noise: { y: 0.0004 } };
  const base = { id: "", title: "", summary: "", state: ["s", "v"], observe: { y: "s" } };
  const free: Law = { ...base, id: "free", title: "Damped spring", derivatives: { s: "v", v: "-w0^2*s - b*v" }, params: [{ name: "w0", guess: 9, min: 0.1, max: 60, unit: "rad/s" }, { name: "b", guess: 0.3, min: 0, max: 5, unit: "1/s" }] };
  const freeFit = fitLaw(free, data, { trainFrac: 0.7, jackknife: false, starts: 1 });
  const spec = spectrumOf({ law: free, fit: freeFit }, m);
  assert.ok(Math.abs(spec.peaks[0].omega - 15.22) / 15.22 < 0.02, `the free spring's misses peak at ${spec.peaks[0].omega}`);

  // the theorist guesses near resonance, as Muse Wonder did on the judge's run of 6604982 (it settled at 10.3)
  const driven: Law = { ...base, id: "driven", title: "Driven spring", derivatives: { s: "v", v: "-w0^2*s - b*v + F0*cos(wd*t + phi)" }, params: [{ name: "w0", guess: 9, min: 0.1, max: 60, unit: "rad/s" }, { name: "b", guess: 0.3, min: 0, max: 5, unit: "1/s" }, { name: "F0", guess: 1, min: 0, max: 50, unit: "m/s^2" }, { name: "wd", guess: 10.3, min: 1, max: 30, unit: "rad/s" }, { name: "phi", guess: 0, min: -Math.PI, max: Math.PI, unit: "rad" }] };
  const own = fitLaw(driven, data, { trainFrac: 0.7, jackknife: false, starts: 1 });
  const best = fitSeeded(driven, spec, (l) => ({ fit: fitLaw(l, data, { trainFrac: 0.7, jackknife: false, starts: 1 }) }));
  assert.ok(best.seeded, "the seeded start fits the fitted frames better");
  assert.ok(Math.abs(best.fit.theta.wd - 15.22) / 15.22 < 0.005, `seeded wd ${best.fit.theta.wd}`);
  assert.ok(Math.abs(best.fit.theta.w0 - 9.75) / 9.75 < 0.005, `seeded w0 ${best.fit.theta.w0}`);
  assert.ok(Math.abs(own.theta.wd - 15.22) / 15.22 > 0.05, `from its own guess wd ends at ${own.theta.wd}`);
  assert.ok(best.fit.trainCost <= own.trainCost, "never worse than the law's own start");
  // a law with no drive is fitted once, as written
  assert.equal(fitSeeded(free, spec, (l) => ({ fit: fitLaw(l, data, { trainFrac: 0.7, jackknife: false, starts: 1 }) })).seeded, false);
});

test("a peak at 2ω or 3ω of the motion is a harmonic: labelled for the theorist, never a drive's start", () => {
  const spec = labelHarmonics({ law: "Linear spring", peaks: [{ omega: 19.6, ampNoise: 40, byChannel: { y: 6 } }, { omega: 15.2, ampNoise: 12, byChannel: { y: 2 } }] }, 9.75);
  assert.equal(spec.peaks[0].harmonic, 2, "19.6 is within 3% of 2 × 9.75");
  assert.equal(spec.peaks[1].harmonic, undefined, "15.2 is no multiple of 9.75");
  assert.equal(labelHarmonics({ law: "x", peaks: [{ omega: 29.0, ampNoise: 5, byChannel: {} }] }, 9.75).peaks[0].harmonic, 3);
  assert.equal(labelHarmonics({ law: "x", peaks: [{ omega: 21.0, ampNoise: 5, byChannel: {} }] }, 9.75).peaks[0].harmonic, undefined, "7.7% off 2ω is not a harmonic");
  const line = spectrumSummary(spec, { y: "px" });
  assert.match(line, /strongest at ω = 19\.60 rad\/s.*a harmonic of the motion, not evidence of a drive; a 2ω₀ line is the mark of an even \(lopsided, asymmetric, x²\) nonlinearity/);
  assert.match(line, /The motion's own frequency is 9\.75 rad\/s/);
  const driven: Law = { id: "d", title: "d", summary: "", state: ["s", "v"], observe: { y: "s" }, derivatives: { s: "v", v: "-w0^2*s + F0*cos(wd*t)" }, params: [{ name: "w0", guess: 9, unit: "rad/s" }, { name: "F0", guess: 1, unit: "m/s^2" }, { name: "wd", guess: 10, min: 1, max: 30, unit: "rad/s" }] };
  assert.equal(seedDriveFrequency(driven, spec)!.params.find((p) => p.name === "wd")!.guess, 15.2, "the start skips the harmonic");
  assert.equal(seedDriveFrequency(driven, { ...spec, peaks: [spec.peaks[0]] }), null, "only a harmonic: no start");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { Law, Series } from "../lib/physics/law";
import { fitWithRoom, heldLengthFromRuler, inflateForRuler, referenceValues, rulerExponents, rulerShare, type Candidate, type Experiment, type RulerFit } from "../lib/experiment";
import type { Calibration } from "../lib/measure";
import type { Observation } from "../lib/scientist";

/* The ruler's share of the error goes only to constants that move with the ruler. A pendulum law that holds a stated
   length (L = 0.6 m, said aloud) while a separate ruler sets the scale measures g/L from the period alone: scaling the
   ruler scales s and s_eq, and leaves g where it is. The Aachen 60 cm record carried g = 9.97 ± 2.99 from a ±30% ruler. */

const G = 9.81, L = 0.6, W = Math.sqrt(G / L);
// 25 fps, 6.6 s, a 7 cm swing in metres along the line, a little deterministic noise
const t = Array.from({ length: 166 }, (_, i) => i / 25);
const s = t.map((x, i) => 0.009 + 0.07 * Math.cos(W * x + 0.3) + 0.0002 * Math.sin(i * 2.399));
const series: Series = { t, ch: { s } };

const sho = (held: boolean): Law => ({
  id: "sho-ideal",
  title: "Ideal small-angle pendulum",
  summary: "",
  state: ["s", "v"],
  derivatives: { s: "v", v: "-(g/L)*(s - s_eq)" },
  params: [
    { name: "g", guess: 9.5, min: 5, max: 15, unit: "m/s^2", meaning: "gravitational acceleration" },
    { name: "L", guess: L, min: 0.5, max: 0.7, unit: "m", meaning: "pendulum string length", fixed: held },
    { name: "s_eq", guess: 0, min: -0.1, max: 0.1, unit: "m", meaning: "equilibrium" },
  ],
  observe: { s: "s" },
});

const candidate = (): Candidate => {
  const { law, fitted, fit } = fitWithRoom(sho(true), series);
  return { law, fitted, fit, origin: "muse", rank: 1 };
};

// a 30 cm wooden ruler guessed to ±30%, 1296 ± 5.7 px in SAM's mask (the Aachen 60 cm clip)
const cal = { kind: "reference", metresPerPixel: 0.3 / 1296, note: "wooden ruler", px: 1296, sigmaPx: 5.7, frames: 3, how: "image" } as unknown as Calibration;
const obs = (rulerM: number, rel: number) => ({ body: "earth", location: { latitude_deg: null, place: "" }, reference: { present: true, noun_phrase: "wooden ruler", real_length_m: rulerM, relative_uncertainty: rel, dimension: "longest side", basis: "" } }) as unknown as Observation;

test("ruler share: a stated length held while a separate ruler sets the scale gives g no ruler share (Aachen 60 cm geometry)", () => {
  const c = candidate();
  const stat = c.fit.sigma.g, g = c.fit.theta.g;
  assert.ok(Math.abs(g - G) < 0.05, `g ${g}`);
  const share = rulerShare(obs(0.3, 0.3), cal, null);
  assert.ok(share.rulerRel > 0.29 && share.fromRuler);
  const held = heldLengthFromRuler(obs(0.3, 0.3), cal, L, false);
  assert.equal(held, false, "a 60 cm string before a 30 cm ruler: the ruler did not give the length");
  const sEqStat = c.fit.sigma.s_eq;
  inflateForRuler(c, share, "earth", 0, { series, heldFromRuler: held, statedL: L });
  const f = c.fit as RulerFit;
  // g = ω²L does not move with the ruler; s_eq, a position in metres, moves with it one for one
  assert.equal(f.rulerExp?.g, 0);
  assert.ok(Math.abs(f.rulerExp!.s_eq - 1) < 0.01, `s_eq exponent ${f.rulerExp!.s_eq}`);
  assert.equal(f.sigma.g, stat, "g keeps the fit's own σ");
  assert.ok(f.sigma.g / g < 0.02, `σg/g ${f.sigma.g / g}`);
  assert.equal(f.sigmaFit?.g, stat);
  assert.ok(Math.abs(f.sigma.s_eq - Math.hypot(sEqStat, share.rulerRel * Math.abs(c.fit.theta.s_eq))) < 1e-12, "s_eq still carries the ruler's 30%");
  // the stated length's own 1% is what g's error bar carries instead, kept apart from the fit's
  const [cmp] = referenceValues(c.law, c.fit, { ...obs(0.3, 0.3), motion_kind: "swing", stated_facts: [] } as unknown as Observation, null, { l: L }, undefined, { calibration: cal } as never, held);
  assert.equal(cmp.param, "g");
  assert.ok(Math.abs(cmp.sigmaAssumed! - 0.01 * g) < 1e-12, `assumed ${cmp.sigmaAssumed}`);
  assert.equal(cmp.sigmaFit, stat);
  assert.ok(Math.abs(cmp.sigma - Math.hypot(stat, 0.01 * g)) < 1e-12);
  assert.ok(cmp.sigma / g < 0.02);
});

test("ruler share: a length that came from the ruler (the swing's radius, or the ruler is the string itself) keeps the full share", () => {
  // the bench pendulums: L measured from the arc against an A4 sheet, ±6%, plus the arc's own 1%
  const c = candidate();
  const stat = c.fit.sigma.g, g = c.fit.theta.g;
  const share = rulerShare(obs(0.297, 0.06), cal, null);
  assert.equal(heldLengthFromRuler(obs(0.297, 0.06), cal, 0.402, true), true);
  inflateForRuler(c, share, "earth", 0.01, { series, heldFromRuler: true, statedL: L });
  const f = c.fit as RulerFit;
  assert.equal(f.rulerExp?.g, 1, "the held length scales with the ruler, so g does too");
  assert.ok(Math.abs(f.sigma.g - Math.hypot(stat, Math.hypot(share.rulerRel, 0.01) * g)) < 1e-12, "g carries ruler and arc once, as before");
  // Hindi: the 60 cm thread is both the ruler and the length, so g ∝ that one length and carries its 2%
  const h = candidate();
  const hs = rulerShare(obs(0.6, 0.02), cal, null);
  const heldH = heldLengthFromRuler(obs(0.6, 0.02), cal, 0.6, false);
  assert.equal(heldH, true);
  const hStat = h.fit.sigma.g;
  inflateForRuler(h, hs, "earth", 0, { series, heldFromRuler: heldH, statedL: 0.6 });
  assert.ok(Math.abs(h.fit.sigma.g - Math.hypot(hStat, hs.rulerRel * h.fit.theta.g)) < 1e-12);
  // and a caller that passes no series gets the old metre-power rule
  const o = candidate();
  const oStat = o.fit.sigma.g;
  inflateForRuler(o, share, "earth", 0);
  assert.ok(Math.abs(o.fit.sigma.g - Math.hypot(oStat, share.rulerRel * o.fit.theta.g)) < 1e-12);
});

test("ruler share: rulerExponents gives the metre powers when the ruler gave the held length, and reads a quadratic drag as 1/λ", () => {
  // the held length came from the ruler (the swing's radius): every length is the ruler's, so the metre powers stand
  const { law, fitted, fit } = fitWithRoom({ ...sho(false), params: sho(false).params.map((p) => (p.name === "L" ? { ...p, fixed: true } : p)) }, series);
  assert.deepEqual(rulerExponents({ law, fitted, fit, origin: "muse", rank: 1 }, series, true, L), { g: 1, s_eq: 1 });
  // a damped swing with quadratic drag kq (1/m) and L held: kq scales as 1/λ, g as λ⁰
  const tq = Array.from({ length: 200 }, (_, i) => i / 30);
  const lawQ: Law = {
    ...sho(true),
    id: "quad",
    derivatives: { s: "v", v: "-(g/L)*(s - s_eq) - kq*v*abs(v)" },
    params: [...sho(true).params, { name: "kq", guess: 1, min: 0, max: 50, unit: "1/m", meaning: "quadratic drag" }],
  };
  // simulate it (RK4, 1 ms) with kq = 4 /m
  const sq: number[] = [];
  let x = 0.08, v = 0, tt = 0;
  const acc = (x: number, v: number) => -(G / L) * (x - 0.01) - 4 * v * Math.abs(v);
  for (const target of tq) {
    while (tt < target - 1e-9) {
      const h = Math.min(0.001, target - tt);
      const k1x = v, k1v = acc(x, v);
      const k2x = v + (h / 2) * k1v, k2v = acc(x + (h / 2) * k1x, v + (h / 2) * k1v);
      const k3x = v + (h / 2) * k2v, k3v = acc(x + (h / 2) * k2x, v + (h / 2) * k2v);
      const k4x = v + h * k3v, k4v = acc(x + h * k3x, v + h * k3v);
      x += (h / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
      v += (h / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
      tt += h;
    }
    sq.push(x + 0.0001 * Math.sin(sq.length * 1.7));
  }
  const sQ: Series = { t: tq, ch: { s: sq } };
  const r = fitWithRoom(lawQ, sQ);
  const exp = rulerExponents({ law: r.law, fitted: r.fitted, fit: r.fit, origin: "muse", rank: 1 }, sQ, false)!;
  assert.ok(Math.abs(r.fit.theta.kq - 4) < 0.2, `kq ${r.fit.theta.kq}`);
  assert.equal(exp.g, 0);
  assert.ok(Math.abs(exp.kq + 1) < 0.01, `kq exponent ${exp.kq}`);
  assert.ok(Math.abs(exp.s_eq - 1) < 0.01);
});

test("ruler share: the stored records — Aachen 60 cm no longer carries the ruler on g; Hindi and the bench pendulums are unchanged", () => {
  const rec = (id: string) => JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;
  const a = rec("aachen-pendulum-60cm");
  const g = a.comparisons.find((c) => c.param === "g")!;
  assert.ok(g.sigma / g.measured < 0.02, `σ ${g.sigma}`);
  assert.ok(Math.abs(g.sigmaAssumed! - 0.01 * g.measured) < 1e-9, "the 1% assumed on the stated 60 cm");
  assert.ok(g.sigmaFit! < g.sigmaAssumed!);
  assert.equal(g.rough, true, "the law misses the unseen frames by 21× the noise: no ± on any page");
  const w = a.candidates.find((c) => c.law.id === a.winner)!.fit as RulerFit;
  assert.equal(w.rulerExp?.g, 0);
  assert.ok((w.testZ ?? 0) > 5);
  // left as the run made them: the ruler gave the length (the thread itself, or the swing's radius)
  const fixed: [string, number][] = [["hindi-pendulum", 0.199], ["pendulum-40cm", 0.5913], ["pendulum-60cm", 0.5642], ["pendulum-80cm", 0.5819], ["pendulum-100cm", 0.5637]];
  for (const [id, sg] of fixed) {
    const c = rec(id).comparisons.find((x) => x.param === "g")!;
    assert.ok(Math.abs(c.sigma - sg) < 5e-4, `${id} σ ${c.sigma}`);
  }
  // Aachen 50 cm (no ruler): ± 0.098 is the 1% on the stated 50 cm and the fit's 0.0048
  const b = rec("aachen-pendulum-50cm").comparisons.find((x) => x.param === "g")!;
  assert.ok(Math.abs(b.sigma - 0.0983) < 5e-4);
});

/* r16: a held g's own spread, and a held length however it is written */

test("ruler share: Earth's g held while a metre rule sets the scale: L = g/ω² carries g's ±0.26%, not the rule's 10% and not nothing (brass-bob run)", () => {
  // the law holds g at 9.807 and measures L; the rule (10%) cancels from L, Earth's g (±0.26%, latitude unknown) does not
  const law: Law = { ...sho(false), id: "held-g", params: [{ name: "g", guess: 9.807, unit: "m/s^2", meaning: "gravitational acceleration", fixed: true }, { name: "L", guess: 0.5, min: 0.1, max: 2, unit: "m", meaning: "pendulum length" }, { name: "s_eq", guess: 0, min: -0.1, max: 0.1, unit: "m", meaning: "equilibrium" }] };
  const r = fitWithRoom(law, series);
  const c: Candidate = { law: r.law, fitted: r.fitted, fit: r.fit, origin: "muse", rank: 1 };
  const Lfit = c.fit.theta.L, stat = c.fit.sigma.L;
  assert.ok(Math.abs(Lfit - (9.807 / 9.81) * L) < 0.002, `L ${Lfit}`);
  const share = rulerShare(obs(1, 0.1), cal, null);
  assert.equal(share.gRel, 0.0026);
  inflateForRuler(c, share, "earth", 0, { series, heldFromRuler: false });
  const f = c.fit as RulerFit;
  assert.equal(f.rulerExp?.L, 0, "the rule's scale does not enter L");
  assert.ok(Math.abs(f.sigmaHeld!.L - 0.0026 * Lfit) < 1e-5, `held share ${f.sigmaHeld?.L}`);
  assert.ok(f.sigma.L >= Lfit * share.gRel, `σL ${f.sigma.L} under L × gRel`);
  assert.ok(Math.abs(f.sigma.L - Math.hypot(stat, 0.0026 * Lfit)) < 1e-5);
  assert.ok(f.sigma.L < 0.01 * Lfit, "and nowhere near the rule's 10%");
});

test("ruler share: a stated length written into the law as a number, with no unit, in cm, or named r still gives g no ruler share and its 1%", () => {
  const share = rulerShare(obs(0.3, 0.3), cal, null);
  const base = sho(true);
  const variants: [string, Law][] = [
    ["inline 0.6", { ...base, id: "inline", derivatives: { s: "v", v: "-(g/0.6)*(s - s_eq)" }, params: base.params.filter((p) => p.name !== "L") }],
    ["L with no unit", { ...base, id: "nounit", params: base.params.map((p) => (p.name === "L" ? { ...p, unit: undefined } : p)) }],
    ["L in cm", { ...base, id: "cm", derivatives: { s: "v", v: "-(g/(L/100))*(s - s_eq)" }, params: base.params.map((p) => (p.name === "L" ? { ...p, guess: 60, min: 50, max: 70, unit: "cm" } : p)) }],
    ["named r", { ...base, id: "r", derivatives: { s: "v", v: "-(g/r)*(s - s_eq)" }, params: base.params.map((p) => (p.name === "L" ? { ...p, name: "r", meaning: "radius of swing" } : p)) }],
  ];
  for (const [what, law] of variants) {
    const r = fitWithRoom(law, series);
    const c: Candidate = { law: r.law, fitted: r.fitted, fit: r.fit, origin: "muse", rank: 1 };
    const g = c.fit.theta.g, stat = c.fit.sigma.g;
    assert.ok(Math.abs(g - G) < 0.05, `${what}: g ${g}`);
    inflateForRuler(c, share, "earth", 0, { series, heldFromRuler: false, statedL: L });
    const f = c.fit as RulerFit;
    assert.equal(f.rulerExp?.g, 0, `${what}: g's ruler exponent`);
    assert.ok(f.sigma.g / g < 0.02, `${what}: σg/g ${f.sigma.g / g}`);
    assert.equal(f.statedSens?.g, 1, `${what}: g moves with the stated length one for one`);
    const [cmp] = referenceValues(c.law, c.fit, { ...obs(0.3, 0.3), motion_kind: "swing", stated_facts: [] } as unknown as Observation, null, { l: L }, undefined, { calibration: cal } as never, false);
    assert.ok(Math.abs(cmp.sigmaAssumed! - 0.01 * g) < 1e-9, `${what}: the 1% on the stated length (${cmp.sigmaAssumed})`);
    assert.ok(Math.abs(cmp.sigma - Math.hypot(stat, 0.01 * g)) < 1e-9, `${what}: total σ`);
  }
});

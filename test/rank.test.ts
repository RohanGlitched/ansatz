import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, type Candidate } from "../lib/experiment";
import { tieBreakReason } from "../lib/tie";

const cand = (id: string, testZ: number, k: number, bic: number, origin: Candidate["origin"] = "muse"): Candidate =>
  ({
    law: { id, title: id, summary: "", state: ["x"], derivatives: { x: "0" }, params: [], observe: { x: "x" } },
    fit: { lawId: id, ok: true, theta: {}, sigma: {}, trainCost: 1, trainRms: 1, testRms: testZ, testMax: 1, testZ, bic, n: 50, k, iterations: 1, events: [], predicted: {} },
    origin,
    rank: 0,
  }) as Candidate;

test("the ranking does not depend on the order the laws arrive in", () => {
  const make = () => [cand("a", 1.0, 3, 10), cand("b", 1.04, 2, 12), cand("c", 2.4, 1, 30), cand("d", 1.02, 2, 9), cand("e", 9, 1, 50, "control")];
  const orders: string[] = [];
  for (let i = 0; i < 24; i++) {
    const list = make();
    for (let j = list.length - 1; j > 0; j--) {
      const r = (i * 7 + j * 13) % (j + 1);
      [list[j], list[r]] = [list[r], list[j]];
    }
    rankCandidates(list);
    orders.push(list.map((c) => c.law.id).join(""));
  }
  assert.equal(new Set(orders).size, 1, orders.join(" "));
  // a, b and d predict equally well (within the tie margin); d is simpler than a and has the lower BIC of the two-parameter laws
  assert.equal(orders[0][0], "d");
});

test("a clearly better prediction beats a simpler law", () => {
  const list = [cand("simple", 6, 1, 5), cand("rich", 1, 4, 40)];
  rankCandidates(list);
  assert.equal(list[0].law.id, "rich");
});

test("500 random candidate sets rank the same however they are shuffled", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  for (let n = 0; n < 500; n++) {
    const size = 2 + Math.floor(rnd() * 6);
    // scores cluster near noise level so ties are common, the hard case for a ranking
    const base = Array.from({ length: size }, (_, i) => ({ id: `l${i}`, z: 0.6 + rnd() * (rnd() < 0.5 ? 1.2 : 6), k: 1 + Math.floor(rnd() * 5), bic: Math.round(rnd() * 40), origin: (rnd() < 0.3 ? "control" : "muse") as Candidate["origin"] }));
    const orders = new Set<string>();
    for (let p = 0; p < 6; p++) {
      const list = base.map((b) => cand(b.id, b.z, b.k, b.bic, b.origin));
      for (let j = list.length - 1; j > 0; j--) {
        const r = Math.floor(rnd() * (j + 1));
        [list[j], list[r]] = [list[r], list[j]];
      }
      rankCandidates(list);
      orders.add(list.map((c) => c.law.id).join(","));
    }
    assert.equal(orders.size, 1, `set ${n}: ${[...orders].join(" | ")}`);
  }
});

test("a tie between equally simple laws goes to the smaller unseen miss, never to the id a model chose", () => {
  // round 13: linear damping (the truth) missed the unseen frames by 0.335× the noise, quadratic by 0.351×; same k,
  // same BIC bucket. The old comparator fell through to the ids, and 'quadratic-drag' < 'viscous-damped'
  for (const [lin, quad] of [["viscous-damped", "quadratic-drag"], ["damped-linear", "damped-quadratic"], ["z-linear", "a-quadratic"]]) {
    const list = [cand(quad, 0.351, 4, -192.4), cand(lin, 0.335, 4, -192.1)];
    rankCandidates(list);
    assert.equal(list[0].law.id, lin, `${lin} vs ${quad}`);
    const back = [cand(lin, 0.335, 4, -192.1), cand(quad, 0.351, 4, -192.4)];
    rankCandidates(back);
    assert.equal(back[0].law.id, lin, `${lin} vs ${quad}, other arrival order`);
  }
});

test("with equal unseen misses, the smaller fitted miss leads; ids still never decide", () => {
  const a = cand("aaa", 0.5, 3, 10), b = cand("zzz", 0.5, 3, 10);
  a.fit.trainZ = 1.4;
  b.fit.trainZ = 1.1;
  const list = [a, b];
  rankCandidates(list);
  assert.equal(list[0].law.id, "zzz");
});

test("the tie explanation names the key that decided", () => {
  const f = (k: number, bic: number) => ({ fit: { ok: true, testZ: 1, trainZ: 1, k, bic } });
  assert.match(tieBreakReason(f(3, 0), f(4, 0)), /fewer parameters/);
  assert.match(tieBreakReason(f(4, -272), f(4, -269)), /lower BIC/);
  assert.match(tieBreakReason(f(4, -192.4), f(4, -192.1)), /neither is preferred/);
});

test("an older record that listed the worse of two equally simple laws first says their order means nothing", () => {
  const a = { fit: { ok: true, testZ: 0.351, trainZ: 1, k: 4, bic: -192.4 } }, b = { fit: { ok: true, testZ: 0.335, trainZ: 1, k: 4, bic: -192.1 } };
  assert.match(tieBreakReason(a, b), /order says nothing/);
});

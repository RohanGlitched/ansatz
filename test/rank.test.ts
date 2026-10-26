import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, type Candidate } from "../lib/experiment";

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

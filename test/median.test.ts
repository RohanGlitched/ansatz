import { test } from "node:test";
import assert from "node:assert/strict";
import { median } from "../lib/median";

test("median: odd, even, non-finite values dropped", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([NaN, 5, Infinity, 1]), 3);
  assert.ok(Number.isNaN(median([])));
});

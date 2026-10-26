import { test } from "node:test";
import assert from "node:assert/strict";
import { metrePower } from "../lib/units";
test("metre powers", () => {
  assert.equal(metrePower("m/s^2"), 1);
  assert.equal(metrePower("m/s²"), 1);
  assert.equal(metrePower("1/m"), -1);
  assert.equal(metrePower("rad/s"), 0);
  assert.equal(metrePower("1/s"), 0);
  assert.equal(metrePower("m"), 1);
  assert.equal(metrePower("m^2"), 2);
  assert.equal(metrePower("kg/m"), -1);
  assert.equal(metrePower(""), 0);
  assert.equal(metrePower("mm"), 0);
});

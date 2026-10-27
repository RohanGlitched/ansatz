import { test } from "node:test";
import assert from "node:assert/strict";
import { strictable } from "../lib/meta/client";
import { CRITIQUE_SCHEMA, EYEBALL_SCHEMA, LAW_SCHEMA, LAWS_SCHEMA, OBS_SCHEMA, POINT_SCHEMA, WONDER_TOOLS } from "../lib/scientist";

// every object closed, every property required: what strict structured output and strict tools demand
test("every json_schema sent to the Responses API is strict-compatible", () => {
  const schemas = { OBS_SCHEMA, LAW_SCHEMA, LAWS_SCHEMA, CRITIQUE_SCHEMA, EYEBALL_SCHEMA, POINT_SCHEMA };
  for (const [name, s] of Object.entries(schemas)) assert.equal(strictable(s), true, `${name} is not strict-compatible`);
});

test("every function tool is strict, with a strict-compatible schema", () => {
  assert.ok(WONDER_TOOLS.length >= 2);
  for (const t of WONDER_TOOLS) {
    assert.equal(t.type, "function");
    assert.equal(t.strict, true, `${t.name} is not strict`);
    assert.equal(strictable(t.parameters), true, `${t.name}'s parameters are not strict-compatible`);
  }
});

test("strictable rejects an optional field and an open object", () => {
  assert.equal(strictable({ type: "object", additionalProperties: false, required: ["a"], properties: { a: { type: "string" }, b: { type: "string" } } }), false);
  assert.equal(strictable({ type: "object", required: ["a"], properties: { a: { type: "string" } } }), false);
});

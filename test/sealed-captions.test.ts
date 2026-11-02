import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import type { Experiment } from "../lib/experiment";
import { sealedCaption, sealedOf } from "../app/sealedWords";
import { fmtAbout, fmtNoise } from "../lib/format";
import { datedPipeline } from "../app/pipelineWords";

const sealedRecords = readdirSync("data/showcase")
  .filter((f) => /^sealed-law-\d+\.json$/.test(f))
  .map((f) => JSON.parse(readFileSync(`data/showcase/${f}`, "utf8")) as Experiment);

// each drawn term in words, and the words of the other forms, which must not appear
const STIFF: Record<string, RegExp> = { linear: /\ba linear spring\b/, cubic: /\bcubic hardening spring\b/, asymmetric: /\blopsided spring\b/ };
const DAMP: Record<string, RegExp> = { viscous: /\bviscous damping\b/, quadratic: /\bquadratic damping\b/, coulomb: /\bdry friction\b/ };

test("every sealed card's caption names the drawn stiffness, damping and drive, and no other form", () => {
  assert.ok(sealedRecords.length >= 6, "the six sealed records ship");
  for (const e of sealedRecords) {
    const s = sealedOf(e)!;
    const caption = sealedCaption(e)!;
    const drawnPart = caption.split(". ")[0];
    assert.match(drawnPart, STIFF[s.drawn.stiffness], `${e.id}: stiffness ${s.drawn.stiffness} in “${drawnPart}”`);
    assert.match(drawnPart, DAMP[s.drawn.damping], `${e.id}: damping ${s.drawn.damping} in “${drawnPart}”`);
    for (const [k, re] of Object.entries(STIFF)) if (k !== s.drawn.stiffness) assert.doesNotMatch(drawnPart, re, `${e.id}: not ${k}`);
    for (const [k, re] of Object.entries(DAMP)) if (k !== s.drawn.damping) assert.doesNotMatch(drawnPart, re, `${e.id}: not ${k}`);
    assert.equal(/\bdrive\b/.test(drawnPart), s.drawn.drive, `${e.id}: drive ${s.drawn.drive}`);
    assert.match(caption, s.verdict === "hit" ? /\bFound\b/ : /\bMissed\b/, `${e.id}: verdict ${s.verdict}`);
  }
});

test("the second set's cards describe dry friction and the lopsided spring (round 16's wrong captions)", () => {
  const by = (r: number) => sealedCaption(sealedRecords.find((e) => sealedOf(e)?.round === r)!)!;
  assert.match(by(6604980), /a linear spring with dry friction and a periodic drive/);
  assert.match(by(6604981), /a cubic hardening spring with dry friction and a periodic drive/);
  assert.match(by(6604982), /a lopsided spring with viscous damping and a periodic drive/);
});

test("rough values: one rule, and a known value beside them keeps enough figures", () => {
  assert.equal(fmtAbout(11.5094, 11.4957), "11.5"); // not "12" beside a known 11.5 and 0.12% off
  assert.equal(fmtAbout(9.71), "9.7");
  assert.equal(fmtAbout(242.3), "242"); // three figures from 100 up, as lib/experiment.ts fills a rough value
  assert.equal(fmtAbout(10.3, 9.81), "10");
  assert.equal(fmtNoise(102.898), "103"); // the integer /proof prints, never "100"
  assert.equal(fmtNoise(4.27), "4.3");
});

test("a stored note's 'today's pipeline' is named by its tag", () => {
  assert.equal(datedPipeline("Re-run on 27 October 2026 with today’s stricter pipeline: x", "2026-10-27c"), "Re-run on 27 October 2026 with the stricter 27 October pipeline (2026-10-27c): x");
});

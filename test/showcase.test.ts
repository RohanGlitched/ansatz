import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { rankCandidates, type Experiment } from "../lib/experiment";

const ids = JSON.parse(readFileSync("data/showcase/order.json", "utf8")) as string[];
const all = readdirSync("data/showcase").filter((f) => f.endsWith(".json") && f !== "order.json").map((f) => f.replace(/\.json$/, ""));
const load = (id: string) => JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;

test("every gallery entry exists, with its clip and print", () => {
  for (const id of ids) {
    assert.ok(all.includes(id), id);
    assert.ok(readdirSync("public/showcase").includes(`${id}.mp4`), `${id}.mp4`);
    assert.ok(readdirSync("public/prints").includes(`${id}.webp`), `${id}.webp`);
  }
});

test("published records agree with the current ranking and their own referee", () => {
  for (const id of all) {
    const e = load(id);
    assert.equal(e.candidates[0].law.id, e.winner, `${id}: winner is not first`);
    if (e.critique?.winnerId) assert.equal(e.critique.winnerId, e.winner, `${id}: the referee wrote about another law`);
    for (const c of e.candidates.filter((c) => c.fit.ok)) assert.ok(Number.isFinite(c.fit.testZ) && Number.isFinite(c.fit.trainZ), `${id}/${c.law.id}: no noise-unit scores`);
    const order = e.candidates.map((c) => c.law.id).join(",");
    const again = [...e.candidates];
    rankCandidates(again, 0);
    assert.equal(again.map((c) => c.law.id).join(","), order, `${id}: the ranking would change today`);
  }
});

test("the README's memory-test numbers are the published ones", () => {
  const rows = load("moon-jump").extras!.memoryTest!.rows;
  const readme = readFileSync("README.md", "utf8");
  assert.ok(readme.includes(`**${rows[0].g.toFixed(2)} ± ${rows[0].sigma.toFixed(2)} m/s²**`), "real-speed g");
  assert.ok(readme.includes(`**${rows[1].g.toFixed(2)} ±`), "slowed g");
});

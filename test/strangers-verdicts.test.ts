import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isRoughFit, type Experiment } from "../lib/experiment";
import { STRANGERS, strangersTally } from "../app/proof/strangers";

const show = (id: string) => JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;
const winner = (e: Experiment) => e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];

test("a stranger's row with a run page follows that page's rough-fit rule: a rough winner is never 'measured' and carries no ±", () => {
  const promoted = STRANGERS.filter((r) => r.href?.startsWith("/x/"));
  assert.ok(promoted.length >= 2);
  for (const r of promoted) {
    const e = show(r.href!.slice(3));
    const rough = isRoughFit(winner(e).fit);
    if (rough) {
      assert.notEqual(r.verdict, "measured", `${r.clip}: its run page prints no error bar (testZ ${winner(e).fit.testZ})`);
      assert.doesNotMatch(r.measured.split(".")[0], /±/, `${r.clip}: a rough fit's value carries no ±`);
    } else {
      assert.equal(r.verdict, "measured", `${r.clip}: a clean published fit`);
    }
  }
});

test("the strangers' tally is counted from the table: 1 measured, 3 number right but law wrong, 1 with nothing to check, 6 misses", () => {
  const t = strangersTally();
  assert.deepEqual([t.n, t.measured, t.lawWrong, t.nothing, t.miss], [11, 1, 3, 1, 6]);
  assert.match(t.text, /^eleven clips strangers filmed: one measured, three where the number landed/);
});

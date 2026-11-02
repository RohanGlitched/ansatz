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

test("the strangers' tally is counted from the table: 2 measured, 4 number right but law wrong, 1 with nothing to check, 9 misses", () => {
  const t = strangersTally();
  assert.deepEqual([t.n, t.measured, t.lawWrong, t.nothing, t.miss], [16, 2, 4, 1, 9]);
  assert.match(t.text, /^sixteen clips strangers filmed: two measured, four where the number landed/);
});

test("every stranger's figure follows the run page's rough-fit rule: no ± where the winning law misses by more than 5× the noise", () => {
  const dir = ".probe/real-2026-11-02";
  let read = 0;
  for (const r of STRANGERS.filter((x) => x.record)) {
    let e: Experiment;
    try {
      e = JSON.parse(readFileSync(`${dir}/${r.record}.json`, "utf8")) as Experiment;
    } catch {
      continue; // the records are kept with the review notes; a checkout without them skips the row
    }
    read++;
    if (isRoughFit(winner(e).fit)) {
      assert.doesNotMatch(r.measured, /±/, `${r.clip}: the winner misses by ${winner(e).fit.testZ?.toFixed(0)}× the noise, so no ±`);
      assert.notEqual(r.verdict, "measured", `${r.clip}: a rough winner is never measured`);
    }
  }
  if (read) assert.ok(read >= 8, `read ${read} stranger records`);
});

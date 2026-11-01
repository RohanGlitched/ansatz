import { test } from "node:test";
import assert from "node:assert/strict";
import { SHEETS } from "../app/lab/sheets";
import { PRACTICALS } from "../app/lab/practicals";

// The /lab worksheet prints in English and Hindi: the two must say the same things, line for line, with the same
// {placeholders}, so a printed Hindi page never drops a box or a question the English one has.
const holes = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");

test("the Hindi worksheet has every key, list line and placeholder of the English one", () => {
  const en = SHEETS.en as Record<string, unknown>;
  const hi = SHEETS.hi as Record<string, unknown>;
  assert.deepEqual(Object.keys(hi).sort(), Object.keys(en).sort());
  for (const k of Object.keys(en)) {
    const a = en[k];
    const b = hi[k];
    if (Array.isArray(a)) {
      assert.ok(Array.isArray(b), k);
      assert.equal((b as string[]).length, a.length, `${k}: line count`);
      a.forEach((s: string, i) => assert.equal(holes((b as string[])[i]), holes(s), `${k}[${i}]`));
    } else if (k !== "lang") {
      assert.equal(holes(b as string), holes(a as string), k);
    }
  }
  // the blanks a student fills in: as many in Hindi as in English
  const blanks = (s: Record<string, unknown>) => JSON.stringify(s).match(/_{4,}/g)?.length ?? 0;
  assert.equal(blanks(hi), blanks(en));
});

test("every practical on /lab cites its CBSE page, and every covered one names a run", () => {
  for (const p of PRACTICALS) {
    assert.ok(p.cbse.page >= 7 && p.cbse.page <= 9, p.title);
    if (p.status !== "not") assert.ok(p.runs.length > 0, p.title);
    for (const n of p.ncert) assert.match(n.file, /^kelm1\d\d\.pdf$/);
  }
});

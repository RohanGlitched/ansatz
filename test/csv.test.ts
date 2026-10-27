import { test } from "node:test";
import assert from "node:assert/strict";
import { csvNum, csvText } from "../lib/csv";
import { sameOrigin } from "../lib/origin";

test("csv: text that a spreadsheet would run as a formula is neutralised", () => {
  for (const bad of ["=1+1", "+SUM(A1)", "-2+3", "@cmd", "\tx", "\rx"]) assert.ok(csvText(bad).replace(/^"/, "").startsWith("'"), JSON.stringify(bad));
  assert.equal(csvText("=HYPERLINK(\"http://x\")"), `"'=HYPERLINK(""http://x"")"`);
  assert.equal(csvText("Asha"), "Asha");
  assert.equal(csvText("Rao, A"), `"Rao, A"`);
  assert.equal(csvText("a=b"), "a=b");
});

test("csv: numbers keep their sign, a number-shaped cell that is not one is neutralised", () => {
  assert.equal(csvNum("-0.51"), "-0.51");
  assert.equal(csvNum("1.5e-7"), "1.5e-7");
  assert.equal(csvNum(""), "");
  assert.equal(csvNum("-1+cmd"), "'-1+cmd");
});

test("origin: an unparsable Origin such as null is refused, not thrown on", () => {
  const req = (origin?: string) => new Request("https://ansatz-lab.vercel.app/api/run", { method: "POST", headers: origin ? { origin } : {} });
  assert.equal(sameOrigin(req()), true);
  assert.equal(sameOrigin(req("https://ansatz-lab.vercel.app")), true);
  assert.equal(sameOrigin(req("https://evil.example")), false);
  assert.equal(sameOrigin(req("null")), false);
  assert.equal(sameOrigin(req("not a url")), false);
});

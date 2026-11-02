// usage: npx tsx scripts/sealed-terms.ts <record.json> [<round>]
//
// The term check behind a sealed verdict, printed for a person to read: the winning law's acceleration split into its
// terms (stiffness by power of the displacement, damping by form, drive), each term's fitted constants with their
// σ and whether the term is present (some constant in it more than 2σ from zero), against the drawn law's terms when a
// round is given (sealed/<round>.json). It prints; it decides nothing. Verdicts are written by hand in the annotate
// scripts, under the rule in scripts/sealed-law.ts SCORING.
import { readFileSync, existsSync } from "node:fs";
import { additiveTerms, motionPair, print, termKind } from "../lib/combine";
import { names, parse, type Node } from "../lib/physics/expr";

const [file, round] = process.argv.slice(2);
const e = JSON.parse(readFileSync(file, "utf8"));
const win = e.candidates.find((c: { law: { id: string } }) => c.law.id === e.winner) ?? e.candidates[0];
const law = win.law;
const pair = motionPair(law, Object.keys(law.observe)[0]);
if (!pair) throw new Error(`no position–velocity pair in ${law.id}`);

/** the power of the displacement in a stiffness term: count of position factors, with ^n */
function power(t: Node, pos: string): number {
  const s = print(t).replace(/\s+/g, "");
  const p = pos.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const caret = s.match(new RegExp(`\\(${p}-\\w+\\)\\^(\\d)|\\b${p}\\^(\\d)`));
  if (caret) return +(caret[1] ?? caret[2]);
  const n = (s.match(new RegExp(`\\(${p}-\\w+\\)|\\b${p}\\b(?!\\^)`, "g")) ?? []).length;
  return n || 0;
}
const form = (t: Node) => {
  const s = print(t).replace(/\s+/g, "");
  if (/\b(sign|tanh|atan)\(/.test(s)) return "dry (Coulomb)";
  if (/abs\(|\^2|hypot|sqrt/.test(s)) return "quadratic";
  return "viscous";
};
const terms = additiveTerms(parse(law.derivatives[pair.vel]));
console.log(`${file}: winner ${law.id} (${win.origin}${win.combined ? `, ${win.combined}` : ""}); test ${win.fit.testRms.toFixed(3)} (z ${win.fit.testZ?.toFixed(1)})`);
console.log(`  a = ${law.derivatives[pair.vel]}`);
for (const t of terms) {
  const kind = termKind(t, pair);
  const label = kind === "stiffness" ? (power(t, pair.pos) === 0 ? "offset" : `stiffness, power ${power(t, pair.pos)}`) : kind === "damping" ? `damping, ${form(t)}` : "drive";
  // a term's strength is its coefficient: the rest position inside (s − s_eq) says where, not how much
  const rest = new Set([...print(t).matchAll(new RegExp(String.raw`\(${pair.pos} - (\w+)\)`, "g"))].map((m) => m[1]));
  const consts = [...names(t)].filter((n) => !rest.has(n) && law.params.some((p: { name: string; fixed?: boolean }) => p.name === n && !p.fixed));
  const z = consts.map((n) => ({ n, v: win.fit.theta[n], s: win.fit.sigma[n], z: Math.abs(win.fit.theta[n] / win.fit.sigma[n]) }));
  const present = z.some((x) => x.z > 2) || !z.length;
  console.log(`  ${print(t).padEnd(48)} ${label.padEnd(22)} ${z.map((x) => `${x.n} = ${x.v.toPrecision(5)} ± ${x.s?.toPrecision(2)} (${x.z.toFixed(1)}σ)`).join(", ")} → ${present ? "PRESENT" : "absent (within 2σ of zero)"}`);
}
if (round && existsSync(`sealed/${round}.json`)) {
  const d = JSON.parse(readFileSync(`sealed/${round}.json`, "utf8"));
  console.log(`  drawn: ${d.law.equation}  (${d.law.stiffness}, ${d.law.damping}${d.law.drive ? ", drive" : ""})`);
  console.log(`  drawn constants: ${Object.entries(d.constants as Record<string, { value: number; unit: string }>).map(([k, c]) => `${k} ${c.value} ${c.unit}`).join(", ")}; ω₀ ${d.derived.omega0.value.toFixed(4)}`);
}
for (const x of e.codeAdded ?? []) console.log(`  code added: ${x.law} (${x.how}, ${x.stage}, from ${x.from.join(" + ")}${x.peak ? `, peak ${x.peak.omega.toFixed(2)} rad/s at ${x.peak.ampNoise.toFixed(0)}× noise` : ""}) ok=${x.ok} rank ${x.rank ?? "-"}`);

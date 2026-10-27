// usage: tsx scripts/promote.ts <run-name> <showcase-id> [--credit "..."] [--license "..."] [--page url] [--clip path.mp4] [--force]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
const [name, id] = process.argv.slice(2);
const opt = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const base = name.includes("/") ? name : `.probe/runs/${name}`;
const e = JSON.parse(readFileSync(`${base}.json`, "utf8"));
// publish gate: a showcase must not carry a result a physicist would wince at
{
  const win = e.candidates.find((c: { law: { id: string } }) => c.law.id === e.winner) ?? e.candidates[0];
  const problems: string[] = [];
  if (e.measured.calibration.kind === "gravity" && e.observation.motion_kind !== "flight" && e.observation.motion_kind !== "along a path") problems.push("gravity used as the ruler on motion that isn't a flight");
  const spans = Object.values(e.measured.series.ch as Record<string, number[]>).map((v) => { const f = v.filter(Number.isFinite); return Math.max(...f) - Math.min(...f); });
  const span = Math.max(...spans);
  if (span > 0 && win.fit.testRms > 0.1 * span) problems.push(`misses the unseen frames by ${((win.fit.testRms / span) * 100).toFixed(0)}% of the motion`);
  for (const p of win.law.params) {
    const v = win.fit.theta[p.name];
    if (!p.fixed && /^m$/.test(p.unit ?? "") && Number.isFinite(v) && (Math.abs(v) < 0.001 || Math.abs(v) > 100)) problems.push(`length ${p.name} = ${v}`);
  }
  if (problems.length && !process.argv.includes("--force")) {
    console.error("REFUSED:", problems.join("; "));
    process.exit(1);
  }
}
e.id = id;
e.source = { kind: "showcase", video: `/showcase/${id}.mp4`, credit: opt("--credit"), license: opt("--license"), page: opt("--page") };
mkdirSync("data/showcase", { recursive: true });
mkdirSync("public/showcase", { recursive: true });
writeFileSync(`data/showcase/${id}.json`, JSON.stringify(e));
// the run keeps its prepared clip under the input's name; --clip says where when --out renamed the record
copyFileSync(opt("--clip") ?? `${base}.mp4`, `public/showcase/${id}.mp4`);
const orderF = "data/showcase/order.json";
const order: string[] = existsSync(orderF) ? JSON.parse(readFileSync(orderF, "utf8")) : [];
if (!order.includes(id)) order.push(id);
writeFileSync(orderF, JSON.stringify(order, null, 1));
console.log("now run: npx tsx scripts/prints.ts", id, "and scripts/translate-showcase.ts", id);
console.log("promoted", id, (readFileSync(`data/showcase/${id}.json`).length / 1024).toFixed(0) + " KB");

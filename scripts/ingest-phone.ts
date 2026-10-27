// usage: tsx --conditions=react-server scripts/ingest-phone.ts <clip> <showcase-id> --phone "Redmi Note 12" [--fps 30]
//          [--ruler "A4 sheet=0.297"] [--narration "the string is 50 cm"] [--language Hindi] [--slow 4]
//          [--truth "L=0.50 m" --truth "g=9.81 m/s²"] [--title "Pendulum, 50 cm"]
// Runs a clip filmed on a phone through the full pipeline, publishes it as a showcase with a "tape says / Ansatz
// says" table, renders its print and translates it. Every truth is what the person measured with a tape or a scale.
import "./env";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const args = process.argv.slice(2);
const [clip, id] = args;
const all = (k: string) => args.flatMap((a, i) => (a === k ? [args[i + 1]] : []));
const opt = (k: string) => all(k)[0];
if (!clip || !id || !opt("--phone")) {
  console.error("usage: ingest-phone.ts <clip> <showcase-id> --phone <model> [--ruler noun=metres] [--narration text] [--truth name=value unit]");
  process.exit(1);
}
const run = (cmd: string[]) => execFileSync("npx", ["tsx", ...cmd], { stdio: "inherit", shell: true, env: { ...process.env, RUN_BUDGET_MS: "250000", EYEBALL_GRACE_MS: "25000" } });
const out = `.probe/runs/${id}.json`;
const runArgs = ["scripts/run.ts", clip, "--out", out];
for (const k of ["--ruler", "--narration", "--slow", "--noun", "--window"]) if (opt(k)) runArgs.push(k, JSON.stringify(opt(k)));
run(runArgs);

const prepared = `.probe/runs/${basename(clip).replace(/\.\w+$/, "")}.mp4`;
run(["scripts/promote.ts", `.probe/runs/${id}`, id, "--credit", JSON.stringify(`Filmed on a phone (${opt("--phone")}${opt("--fps") ? `, ${opt("--fps")} fps` : ""}); truth measured with a tape`), "--clip", prepared, "--force"]);

const f = `data/showcase/${id}.json`;
const e = JSON.parse(readFileSync(f, "utf8"));
e.source.phone = opt("--phone");
if (opt("--title")) e.title = opt("--title");
// tape values against the measurement: name=value [unit], matched to the winning law's parameter or the comparison
const win = e.candidates.find((c: { law: { id: string } }) => c.law.id === e.winner) ?? e.candidates[0];
const rows = all("--truth").flatMap((t) => {
  const m = /^(\w+)\s*=\s*([\d.]+)\s*(.*)$/.exec(t);
  if (!m) return [];
  const [, name, v, unit] = m;
  const cmp = e.comparisons.find((c: { param: string }) => c.param === name);
  const measured = win.fit.theta[name] ?? cmp?.measured, sigma = win.fit.sigma[name] ?? cmp?.sigma;
  return measured === undefined ? [] : [{ label: `${name} (tape)`, param: name, measured, sigma, truth: Number(v), unit: unit || "" }];
});
if (rows.length) e.extras = { ...(e.extras ?? {}), truth: { note: `Measured by the person filming, with a tape, before the run; Ansatz never saw these numbers.`, rows } };
writeFileSync(f, JSON.stringify(e));
run(["scripts/prints.ts", id]);
execFileSync("npx", ["tsx", "--conditions=react-server", "scripts/translate-showcase.ts", id], { stdio: "inherit", shell: true });
console.log(`published ${id}: put it first in data/showcase/order.json, then deploy`);

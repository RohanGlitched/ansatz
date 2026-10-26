// Runs every benchmark clip through the full pipeline, fully automatic (no hints), and saves each record.
// usage: tsx scripts/bench.ts [--suite synth] [--only prefix,prefix] [--concurrency 3] [--force]
import "./env";
process.env.EYEBALL_GRACE_MS ??= "180000";
process.env.RUN_BUDGET_MS ??= "600000";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runExperiment } from "../lib/experiment";

const args = process.argv.slice(2);
const opt = (k: string, d?: string) => {
  const i = args.indexOf(k);
  return i >= 0 ? args[i + 1] : d;
};
const suite = opt("--suite", "synth")!;
const root = path.join("bench", suite);
const clipsDir = path.join(root, "clips");
const outDir = path.join("bench", "runs", suite);
mkdirSync(outDir, { recursive: true });
const only = opt("--only")?.split(",");
const conc = Number(opt("--concurrency", "3"));
const force = args.includes("--force");

const cases = readdirSync(clipsDir)
  .filter((f) => f.endsWith(".mp4"))
  .map((f) => f.replace(/\.mp4$/, ""))
  .filter((c) => !only || only.some((p) => c.startsWith(p)))
  .filter((c) => force || !existsSync(path.join(outDir, `${c}.json`)));

console.log(`${cases.length} cases to run (${suite}), concurrency ${conc}`);
let i = 0;
let spent = 0;
async function worker() {
  while (i < cases.length) {
    const c = cases[i++];
    const t = Date.now();
    try {
      const exp = await runExperiment({
        id: c.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 30),
        video: readFileSync(path.join(clipsDir, `${c}.mp4`)),
        filename: `${c}.mp4`,
        onPrepared: async (v) => {
          writeFileSync(path.join(outDir, `${c}.mp4`), v);
        },
      });
      writeFileSync(path.join(outDir, `${c}.json`), JSON.stringify(exp));
      spent += exp.ledger.usd;
      const w = exp.candidates[0];
      console.log(`OK  ${c}  ${((Date.now() - t) / 1000).toFixed(0)}s  $${exp.ledger.usd.toFixed(3)}  winner=${w.law.id}  ${Object.entries(w.fit.theta).filter(([k]) => !k.includes("@") && k !== "cal").map(([k, v]) => `${k}=${(+v).toPrecision(4)}`).join(" ")}  | total $${spent.toFixed(2)}`);
    } catch (e) {
      writeFileSync(path.join(outDir, `${c}.error.json`), JSON.stringify({ message: (e as Error).message, step: (e as { step?: string }).step }));
      console.log(`ERR ${c}  ${(e as Error).message.slice(0, 200)}`);
    }
  }
}
await Promise.all(Array.from({ length: conc }, worker));
console.log(`done, spent $${spent.toFixed(2)}`);

// usage: tsx scripts/run.ts <video.mp4> [--narration "text"] [--slow 10] [--noun "ball"] [--out file.json] [--no-eye]
import "./env";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { runExperiment } from "../lib/experiment";
const args = process.argv.slice(2);
const file = args[0];
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const t = Date.now();
const exp = await runExperiment(
  { video: readFileSync(file), filename: basename(file), narrationText: opt("--narration"), hints: { slowMotion: opt("--slow") ? +opt("--slow")! : undefined, noun: opt("--noun") }, skipEyeball: args.includes("--no-eye") },
  (p) => console.log(`[${(p.at / 1000).toFixed(1)}s] ${p.step} ${p.state}${p.detail ? ": " + p.detail : ""}`),
);
mkdirSync(".probe/runs", { recursive: true });
const out = opt("--out") ?? `.probe/runs/${basename(file).replace(/\.\w+$/, "")}.json`;
writeFileSync(out, JSON.stringify(exp));
console.log("\nFINDING:", exp.finding);
for (const c of exp.candidates) console.log(` #${c.rank} ${c.origin.padEnd(8)} ${c.law.id.padEnd(28)} unseen ${c.fit.testRms.toExponential(2)} train ${c.fit.trainRms.toExponential(2)} bic ${c.fit.bic.toFixed(0)} ${Object.entries(c.fit.theta).filter(([k]) => !k.includes("@")).map(([k, v]) => `${k}=${v.toPrecision(4)}±${(c.fit.sigma[k] ?? 0).toPrecision(2)}`).join(" ")} ${c.fit.why ?? ""}`);
console.log("comparisons", exp.comparisons);
console.log("eyeball", exp.eyeball?.estimates);
console.log("cost $", exp.ledger.usd.toFixed(4), "tokens", exp.ledger.tokens, "time", ((Date.now() - t) / 1000).toFixed(1), "s");
for (const c of exp.ledger.calls) console.log("  ", c.model, c.purpose, c.ms + "ms", "$" + c.usd.toFixed(4), c.inputTokens ?? "", c.outputTokens ?? "", c.reasoningTokens ?? "");

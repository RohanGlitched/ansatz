// usage: tsx scripts/run.ts <video.mp4> [--narration "text"] [--slow 10] [--noun "ball"] [--out file.json] [--no-eye]
//                            [--sealed] [--allow-dirty] [--lite pendulum] [--listen] [--language Hindi]
// --lite <type> runs the clip as a class link does (lib/lite.ts; the same RunInput app/api/run/route.ts builds): no Muse
// Spark or Muse Wonder; --listen transcribes the narration (Muse Voice Transcribe) so code can read a spoken length;
// --language is the narration's language, as the form sends it.
// Every record stores the code that made it: code.commit (git rev-parse HEAD) and code.dirty (tracked files differ from
// it; the paths are listed). A sealed-law run (--sealed, or a clip under sealed/) refuses to start on a dirty tree
// unless --allow-dirty is given, so its record can be tied to one pushed commit.
import "./env";
process.env.EYEBALL_GRACE_MS ??= "180000";
process.env.RUN_BUDGET_MS ??= "600000";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename } from "node:path";
import { spawnSync } from "node:child_process";
import { runExperiment, type Progress } from "../lib/experiment";
import { LITE_TYPES, type LiteType } from "../lib/lite";
const args = process.argv.slice(2);
const file = args[0];
const opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const git = (...a: string[]) => { const r = spawnSync("git", a, { encoding: "utf8" }); return r.status === 0 ? r.stdout.trimEnd() : null; };
/** HEAD, and the tracked files that differ from it (untracked files are not code the run loads from git) */
function codeState(): { commit: string; dirty: boolean; changed?: string[] } | undefined {
  const commit = git("rev-parse", "HEAD");
  const status = git("status", "--porcelain", "--untracked-files=no");
  if (!commit || status === null) return undefined;
  const changed = status.split("\n").map((l) => l.slice(3).trim()).filter(Boolean);
  return { commit, dirty: changed.length > 0, ...(changed.length ? { changed } : {}) };
}
const code = codeState();
if (opt("--lite") && !(LITE_TYPES as readonly string[]).includes(opt("--lite")!)) { console.error(`--lite takes one of ${LITE_TYPES.join(", ")}`); process.exit(2); }
if (opt("--lite") && !opt("--noun")) { console.error("lite mode needs --noun (the name of the moving thing), as the class form does"); process.exit(2); }
const sealed = args.includes("--sealed") || /(^|[\\/])sealed[\\/]/.test(file);
if (sealed && (!code || code.dirty) && !args.includes("--allow-dirty")) {
  console.error(code ? `refusing a sealed run on a dirty tree at ${code.commit}: ${code.changed!.join(", ")} (commit them, or pass --allow-dirty)` : "refusing a sealed run: git state unreadable (pass --allow-dirty to run anyway)");
  process.exit(2);
}
console.log(`code ${code ? `${code.commit}${code.dirty ? ` DIRTY (${code.changed!.join(", ")})` : " (clean tree)"}` : "unknown (no git)"}`);
const t = Date.now();
const log: Progress[] = [];
const exp = await runExperiment(
  { video: readFileSync(file), filename: basename(file), onPrepared: async (v) => { mkdirSync(".probe/runs", { recursive: true }); writeFileSync(`.probe/runs/${basename(file).replace(/\.\w+$/, "")}.mp4`, v); return `${basename(file).replace(/\.\w+$/, "")}.mp4`; }, narrationText: opt("--narration"), hints: { slowMotion: opt("--slow") ? +opt("--slow")! : undefined, noun: opt("--noun"), window: opt("--window") ? { start_s: +opt("--window")!.split("-")[0], end_s: +opt("--window")!.split("-")[1] } : undefined, ruler: opt("--ruler") ? { noun: opt("--ruler")!.split("=")[0], metres: +opt("--ruler")!.split("=")[1].split("~")[0], relUncertainty: opt("--ruler")!.includes("~") ? +opt("--ruler")!.split("~")[1] : undefined } : undefined }, skipEyeball: args.includes("--no-eye"), code, language: opt("--language"), lite: opt("--lite") ? { type: opt("--lite") as LiteType, listen: args.includes("--listen") } : undefined },
  (p) => {
    log.push(p);
    console.log(`[${(p.at / 1000).toFixed(1)}s] ${p.step} ${p.state}${p.detail ? ": " + p.detail : ""}`);
  },
);
mkdirSync(".probe/runs", { recursive: true });
const out = opt("--out") ?? `.probe/runs/${basename(file).replace(/\.\w+$/, "")}.json`;
writeFileSync(out, JSON.stringify(exp));
writeFileSync(out.replace(/\.json$/, ".progress.json"), JSON.stringify(log));
console.log("\nFINDING:", exp.finding);
for (const c of exp.candidates) console.log(` #${c.rank} ${c.origin.padEnd(8)} ${c.law.id.padEnd(28)} unseen ${c.fit.testRms.toExponential(2)} train ${c.fit.trainRms.toExponential(2)} bic ${c.fit.bic.toFixed(0)} ${Object.entries(c.fit.theta).filter(([k]) => !k.includes("@")).map(([k, v]) => `${k}=${v.toPrecision(4)}±${(c.fit.sigma[k] ?? 0).toPrecision(2)}`).join(" ")} ${c.fit.why ?? ""}`);
console.log("comparisons", exp.comparisons);
console.log("eyeball", exp.eyeball?.estimates);
console.log("cost $", exp.ledger.usd.toFixed(4), "tokens", exp.ledger.tokens, "time", ((Date.now() - t) / 1000).toFixed(1), "s");
for (const c of exp.ledger.calls) console.log("  ", c.model, c.purpose, c.ms + "ms", "$" + c.usd.toFixed(4), c.inputTokens ?? "", c.outputTokens ?? "", c.reasoningTokens ?? "");

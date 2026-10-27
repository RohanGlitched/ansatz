// usage: tsx scripts/wonder-bench.ts [srcDir=.probe/bench_r7] [budgetUsd=3.5]
// Muse Wonder as a standing challenger on every benchmark clip. It reads the same fitted-frames table a run gives it,
// with a brief that says the law code chose may already be right; it gets the fit_law tool and up to three turns, and
// its submitted law is fitted and ranked against the stored laws on the held-out frames it never saw. The measurements
// are the stored ones (no new SAM or observe calls), so only Muse Wonder is billed. Writes data/bench/wonder.json.
import "./env";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fitWithRoom, rankCandidates, refereeBoard, residualPattern, withScaleCorrection, atBound, type Experiment } from "../lib/experiment";
import { fitLaw, compileLaw, type Law } from "../lib/physics/law";
import { localGravity } from "../lib/measure";
import { reviseAgentic } from "../lib/scientist";
import { Ledger } from "../lib/meta/client";

process.env.FIT_STARTS ??= "4";
const [src = ".probe/bench_r7", budgetArg = "3.5"] = process.argv.slice(2);
const budget = Number(budgetArg);
const TRAIN = 0.7;
const ledger = new Ledger();
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? +v.toPrecision(d) : v);
// resume: clips already scored in data/bench/wonder.json (or the log of a run that stopped) are kept, not re-billed
const prev = (() => {
  try {
    return JSON.parse(readFileSync("data/bench/wonder.json", "utf8")).rows as { file: string }[];
  } catch {
    return [];
  }
})();
const rows: unknown[] = [...prev];
// JSON stores NaN as null; the fitting and table code expect numbers
const nanify = (o: unknown): unknown => (o === null ? NaN : Array.isArray(o) ? o.map(nanify) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, nanify(v)])) : o);
const save = () => {
  const count = (v: string) => rows.filter((r) => (r as { verdict: string }).verdict === v).length;
  const usd = rows.reduce((t: number, r) => t + ((r as { usd?: number }).usd ?? 0), 0);
  const out = {
    generatedAt: new Date().toISOString(),
    note: "Muse Wonder as a standing challenger on each benchmark clip: the fitted-frames table a run would give it, a brief that the chosen law may already be right, the fit_law tool and up to three turns. Its submitted law is fitted and ranked against the stored laws on the held-out 30%, which it never saw. beat: it leads with an unseen miss at least 10% smaller; tie: the same law, or within 10%; worse: a larger unseen miss; none: nothing usable submitted.",
    summary: { clips: rows.length, beat: count("beat"), tie: count("tie"), worse: count("worse"), none: count("none"), usd: +usd.toFixed(3) },
    rows,
  };
  writeFileSync("data/bench/wonder.json", JSON.stringify(out, null, 1));
  return out;
};

for (const f of readdirSync(src).filter((x) => x.endsWith(".json")).sort()) {
  if (ledger.usd >= budget) {
    console.log("budget reached; stopping before", f);
    break;
  }
  if (prev.some((r) => r.file === f)) continue;
  const raw = JSON.parse(readFileSync(`${src}/${f}`, "utf8")) as Experiment;
  const e = { ...raw, candidates: raw.candidates.map((c) => ({ ...c, fit: nanify(c.fit) as typeof c.fit })), measured: { ...raw.measured, noise: nanify(raw.measured.noise) as typeof raw.measured.noise } } as Experiment;
  const m = e.measured;
  const gUsed = m.calibration.kind === "gravity" ? localGravity(e.observation.body, e.observation.location?.latitude_deg ?? undefined) : null;
  const cands = e.candidates;
  rankCandidates(cands, 0);
  const before = cands[0];
  const board = { given: e.given, ...refereeBoard(cands, m, TRAIN) };
  const idea =
    "Challenge round. The law code chose may already be the right one. Look for a physical effect it leaves out; if no law you try fits the fitted frames clearly better with a physical reason, submit the law code chose unchanged.";
  const tryLaw = (law: Law) => {
    const l2 = { ...law, params: law.params.filter((p) => p.name !== "cal") };
    if (gUsed !== null) for (const p of l2.params) if (p.name === "g") { p.guess = gUsed; p.fixed = true; }
    const fit = fitLaw(gUsed !== null ? withScaleCorrection(l2) : l2, m.series, { trainFrac: TRAIN });
    return {
      ok: fit.ok,
      error: fit.why,
      train_rms: fit.trainRms,
      fitted: Object.fromEntries(Object.keys(fit.theta).filter((k) => !k.endsWith("@0") && k !== "cal").map((k) => [k, `${fmt(fit.theta[k], 4)} ± ${fmt(fit.sigma[k], 2)}${atBound(l2, k, fit.theta[k]) ? " (stuck at its bound)" : ""}`])),
      residual_by_time_bin_on_fitted_frames: residualPattern(fit, m, TRAIN),
    };
  };
  const usd0 = ledger.usd;
  let row: Record<string, unknown> = { id: e.id ?? f.replace(/\.json$/, ""), file: f, before: before.law.title, beforeUnseen: before.fit.testRms, beforeZ: before.fit.testZ };
  try {
    const { law, attempts, auto } = await reviseAgentic(e.observation, board, idea, tryLaw, ledger, undefined, 3);
    row = { ...row, attempts: attempts.map((a) => a.title), auto: !!auto };
    if (!law) throw new Error("no law submitted");
    compileLaw(law);
    if (gUsed !== null) for (const p of law.params) if (p.name === "g") { p.guess = gUsed; p.fixed = true; }
    const inner = { ...law, id: `${law.id}-challenger`, params: law.params.filter((p) => p.name !== "cal") };
    const r = fitWithRoom(inner, m.series, gUsed !== null ? withScaleCorrection : undefined);
    cands.push({ law: r.law, fitted: r.fitted, fit: r.fit, origin: "revision", rank: 0 });
    rankCandidates(cands, 0);
    const mine = cands.find((c) => c.law.id === r.law.id)!;
    const sameAsLeader = law.title.trim().toLowerCase() === before.law.title.trim().toLowerCase();
    // beat: it now leads; tie: within 10% of the old leader's unseen miss or the same law; worse: otherwise
    const ratio = mine.fit.testRms / before.fit.testRms;
    const verdict = cands[0] === mine && !sameAsLeader && ratio < 0.9 ? "beat" : sameAsLeader || Math.abs(ratio - 1) <= 0.1 ? "tie" : ratio < 1 ? "beat" : "worse";
    row = { ...row, submitted: law.title, sameAsLeader, unseen: mine.fit.testRms, z: mine.fit.testZ, rank: mine.rank, of: cands.length, ratio: fmt(ratio), verdict };
  } catch (err) {
    row = { ...row, verdict: "none", error: (err as Error).message.slice(0, 160) };
  }
  row.usd = +(ledger.usd - usd0).toFixed(4);
  rows.push(row);
  save();
  console.log(`${f}: ${row.verdict} ${row.submitted ?? ""} (ratio ${row.ratio ?? "-"}) $${row.usd}  total $${ledger.usd.toFixed(3)}`);
}

console.log(save().summary);

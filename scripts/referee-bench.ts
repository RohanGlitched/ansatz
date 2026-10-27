// usage: tsx scripts/referee-bench.ts [budgetUsd=0.9]
// The referee, as a run now calls it (fitted frames only, residual tests, the residual plot), over every benchmark
// clip and the two renders built to need a law outside the textbook. Counts how often it asks for a new law, and
// whether that matches clips where the leading law really leaves physics out. Writes data/bench/referee.json.
import "./env";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { rankCandidates, refereeBoard, refereePlotSeries, type Experiment } from "../lib/experiment";
import { residualPlot } from "../lib/plot";
import { critique } from "../lib/scientist";
import { Ledger } from "../lib/meta/client";

const budget = Number(process.argv[2] ?? 0.9);
const ledger = new Ledger();
const nanify = (o: unknown): unknown => (o === null ? NaN : Array.isArray(o) ? o.map(nanify) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, nanify(v)])) : o);
// the bench's own judgement of whether the winning law had the right physics
const synth = JSON.parse(readFileSync("data/bench/synth.json", "utf8")) as { rows: { id: string; family: { ok: boolean | null; expect: string } }[] };
const files = [
  ...readdirSync(".probe/bench_r7").filter((f) => f.endsWith(".json")).map((f) => ({ path: `.probe/bench_r7/${f}`, id: f.replace(/\.json$/, ""), needsNew: false })),
  // before Muse Wonder: these two renders hide a law (cubic stiffness, dry friction) that no proposed law had
  ...["hardening-spring", "dry-friction-spring"].map((id) => ({ path: `data/showcase/${id}.json`, id, needsNew: true })),
];
const rows: Record<string, unknown>[] = [];
for (const f of files) {
  if (ledger.usd >= budget) break;
  const raw = JSON.parse(readFileSync(f.path, "utf8")) as Experiment;
  // for the two renders, referee the board as it stood before Muse Wonder's law joined
  const cands = raw.candidates.filter((c) => !(f.needsNew && c.origin === "revision")).map((c) => ({ ...c, fit: nanify(c.fit) as typeof c.fit }));
  const m = { ...raw.measured, noise: nanify(raw.measured.noise) as typeof raw.measured.noise };
  rankCandidates(cands, 0);
  const plot = await residualPlot(refereePlotSeries(cands, m, 0.7), 1).catch(() => undefined);
  const usd0 = ledger.usd;
  const c = await critique(raw.observation, { given: raw.given, ...refereeBoard(cands, m, 0.7) }, ledger, undefined, plot).catch((e) => ({ error: String(e).slice(0, 120) }) as never);
  const fam = synth.rows.find((r) => r.id === f.id)?.family;
  const row = { id: f.id, needsNew: f.needsNew, rightPhysics: f.needsNew ? false : fam?.ok ?? null, verdict: (c as { verdict?: string }).verdict ?? "error", feature: (c as { residual_feature?: string }).residual_feature, strength: (c as { strength?: number }).strength, idea: (c as { revision_idea?: string }).revision_idea, usd: +(ledger.usd - usd0).toFixed(4) };
  rows.push(row);
  console.log(f.id, row.verdict, row.feature, row.strength, `$${ledger.usd.toFixed(3)}`);
}
const judged = rows.filter((r) => r.verdict !== "error");
const out = {
  generatedAt: new Date().toISOString(),
  note: "The referee as a run calls it: the fitted-frames table and residual plot only, no ranks and no held-out errors. A revise verdict asks for one more law. needsNew marks the two renders whose law no proposed law had; rightPhysics is the benchmark's own judgement of the leading law.",
  summary: {
    clips: judged.length,
    revise: judged.filter((r) => r.verdict === "revise").length,
    reviseWhenNeeded: judged.filter((r) => r.needsNew && r.verdict === "revise").length,
    needed: judged.filter((r) => r.needsNew).length,
    reviseWhenRight: judged.filter((r) => !r.needsNew && r.rightPhysics === true && r.verdict === "revise").length,
    right: judged.filter((r) => !r.needsNew && r.rightPhysics === true).length,
    usd: +ledger.usd.toFixed(3),
  },
  rows,
};
writeFileSync("data/bench/referee.json", JSON.stringify(out, null, 1));
console.log(out.summary);

// Lite mode, measured at zero model cost: the student says what kind of experiment it is, SAM 3.1 measures it, and code
// fits the textbook library (lib/physics/library-full.ts) and ranks it the way the full pipeline does (rankCandidates).
// No Muse Spark, no Muse Wonder. Run offline over the stored benchmark runs' measured series, scored by scripts/score.ts
// exactly as the full pipeline is, then over the two showcases where Muse Wonder won.
// usage: tsx scripts/lite.ts [--runs bench/runs/synth] [--out data/bench/lite.json]
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fitWithRoom, rankCandidates, withScaleCorrection, noiseFloorOf, type Candidate, type Experiment } from "../lib/experiment";
import { localGravity } from "../lib/measure";
import { median } from "../lib/median";
import { fullLibrary } from "../lib/physics/library-full";
import type { Law } from "../lib/physics/law";

process.env.FIT_STARTS ??= "4";
const args = process.argv.slice(2);
const opt = (k: string, d: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const runsDir = opt("--runs", "bench/runs/synth");
const out = opt("--out", "data/bench/lite.json");

/** With no ruler, lengths are pixels: say so in the units, so no pixel number is ever scored as metres. */
const PX: Record<string, string> = { m: "px", "m/s": "px/s", "m/s²": "px/s²", "1/m": "1/px", "1/(m²·s²)": "1/(px²·s²)" };
function inPixels(l: Law): Law {
  return { ...l, params: l.params.map((p) => (p.unit && PX[p.unit] ? { ...p, unit: PX[p.unit] } : p)) };
}

/** The lite pipeline on one stored measurement: every library law fitted, ranked as the full pipeline ranks. */
export function lite(e: Pick<Experiment, "measured" | "observation">, type?: "flight" | "spring" | "path" | "pendulum"): Candidate[] {
  const m = e.measured;
  const gUsed = m.calibration.kind === "gravity" ? m.calibration.g : null;
  // a swing with no ruler: Earth's g is known, so the law measures the pendulum's length (as the full pipeline does)
  const pendulumG = m.calibration.kind === "none" && m.series.ch.theta ? localGravity(e.observation.body, e.observation.location?.latitude_deg ?? undefined) : undefined;
  const cands: Candidate[] = fullLibrary(m.series, { g: gUsed ?? 9.81, gFixed: gUsed !== null, pendulumG, type }).map((l0) => {
    const l = m.calibration.kind === "none" && !m.series.ch.theta ? inPixels(l0) : l0;
    const r = fitWithRoom(l, m.series, gUsed !== null ? withScaleCorrection : undefined);
    return { law: r.law, fitted: r.fitted, fit: r.fit, origin: "control", rank: 0 };
  });
  rankCandidates(cands, noiseFloorOf(m.noise));
  return cands;
}

const score = (c: Candidate) => Math.max(c.fit.testZ ?? Infinity, c.fit.trainZ ?? 0);
const samUsd = (e: Experiment) => e.ledger.calls.filter((c) => c.model.startsWith("sam")).reduce((s, c) => s + c.usd, 0);

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/lite.ts")) {
  // 1. the benchmark: lite records written where score.ts can read them, then scored by score.ts itself
  const tmp = path.join(os.tmpdir(), `ansatz-lite-${process.pid}`);
  mkdirSync(tmp, { recursive: true });
  const files = readdirSync(runsDir).filter((f) => f.endsWith(".json") && !f.endsWith(".error.json")).sort();
  const sam: Record<string, number> = {};
  for (const f of files) {
    const e = JSON.parse(readFileSync(path.join(runsDir, f), "utf8")) as Experiment;
    // the student's pick: what kind of experiment this is (here from the render's description, which a student knows)
    const ph = (JSON.parse(readFileSync(path.join("bench/synth/clips", f), "utf8")) as { phenomenon: string }).phenomenon;
    const type = ph === "pendulum" ? "pendulum" : ph === "spring_mass" ? "spring" : ph === "incline_rolling" || ph === "collision_2d" ? "path" : "flight";
    const cands = lite(e, type);
    sam[f.replace(/\.json$/, "")] = samUsd(e);
    const rec: Experiment = { ...e, candidates: cands, winner: cands[0].law.id, eyeball: null, clock: null, wonder: null, critique: null, ledger: { calls: e.ledger.calls.filter((c) => c.model.startsWith("sam")), usd: samUsd(e), tokens: 0, ms: e.ledger.ms } };
    writeFileSync(path.join(tmp, f), JSON.stringify(rec));
    console.log(f.padEnd(40), cands[0].law.title.padEnd(48), score(cands[0]).toFixed(2));
  }
  const scored = path.join(tmp, "score.json");
  execFileSync(process.execPath, [path.join("node_modules", "tsx", "dist", "cli.mjs"), "scripts/score.ts", "--runs", tmp, "--out", scored], { stdio: ["ignore", "ignore", "inherit"] });
  type Check = { quantity: string; truth: number; measured: number; sigma: number; errPct: number };
  type Row = { id: string; phenomenon: string; winner: { id: string; title: string }; family: { ok: boolean | null; expect: string }; checks: Check[] };
  const S = JSON.parse(readFileSync(scored, "utf8")) as { rows: Row[] };
  rmSync(tmp, { recursive: true, force: true });
  // the full pipeline's published scores on the same clips, side by side
  const full = JSON.parse(readFileSync("data/bench/synth.json", "utf8")) as { rows: Row[] };
  const fullRow = (id: string) => full.rows.find((r) => r.id === id);
  const phys = (c: Check) => !c.quantity.startsWith("scale");
  const rows = S.rows.map((r) => ({
    id: r.id,
    phenomenon: r.phenomenon,
    law: r.winner.title,
    lawId: r.winner.id,
    lawOk: r.family.ok,
    expect: r.family.expect,
    checks: r.checks.filter(phys).map((c) => ({ quantity: c.quantity, truth: c.truth, measured: c.measured, sigma: c.sigma, errPct: +c.errPct.toFixed(3), full: fullRow(r.id)?.checks.find((d) => d.quantity === c.quantity)?.errPct ?? null })),
    scale: r.checks.find((c) => !phys(c))?.errPct ?? null,
    fullLaw: fullRow(r.id)?.winner.title ?? null,
    fullLawOk: fullRow(r.id)?.family.ok ?? null,
    samUsd: +sam[r.id].toFixed(4),
  }));
  const checks = rows.flatMap((r) => r.checks);
  const fullChecks = full.rows.flatMap((r) => r.checks.filter(phys));
  const summary = {
    clips: rows.length,
    constantsWithin5: checks.filter((c) => Math.abs(c.errPct) <= 5).length,
    constantsChecked: checks.length,
    medianPhysErrPct: +median(checks.map((c) => Math.abs(c.errPct))).toFixed(3),
    lawCorrect: rows.filter((r) => r.lawOk === true).length,
    lawJudged: rows.filter((r) => r.lawOk !== null).length,
    full: { constantsWithin5: fullChecks.filter((c) => Math.abs(c.errPct) <= 5).length, constantsChecked: fullChecks.length, medianPhysErrPct: +median(fullChecks.map((c) => Math.abs(c.errPct))).toFixed(3), lawCorrect: full.rows.filter((r) => r.family.ok === true).length },
    medianSamUsd: +median(rows.map((r) => r.samUsd)).toFixed(4),
    modelUsd: 0,
  };
  console.log(summary);

  // 2. the two showcases Muse Wonder won: does the textbook library, now with Duffing and Coulomb, match it?
  const tie = (fa: number, fb: number) => Math.max(fa, fb) < 1.5 || Math.abs(fa - fb) < Math.max(0.1 * Math.max(fa, fb), 0.5);
  const wonder = ["hardening-spring", "dry-friction-spring"].map((id) => {
    const e = JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;
    const cands = lite(e, "spring"), w = e.candidates[0], b = cands[0];
    const truth = e.extras?.truth?.rows ?? [];
    // the library's constants against the render's truth, matched by meaning (names differ: omega/w0, mu/f)
    const pick = (re: RegExp) => b.law.params.find((p) => !p.fixed && re.test(`${p.name} ${p.meaning}`));
    const constants = truth.map((t) => {
      const p = /frequency/.test(t.label) ? pick(/angular frequency/) : /damping/.test(t.label) ? pick(/damping/) : /hardening|k₃/.test(t.label) ? pick(/cubic/) : /friction/.test(t.label) ? pick(/dry friction/) : undefined;
      const v = p ? b.fit.theta[p.name] : NaN;
      return { label: t.label, unit: t.unit, truth: t.truth, wonder: t.measured, wonderErrPct: +(((t.measured - t.truth) / t.truth) * 100).toFixed(2), library: p ? v : null, libraryParam: p?.name ?? null, librarySigma: p ? b.fit.sigma[p.name] : null, libraryErrPct: p ? +(((v - t.truth) / t.truth) * 100).toFixed(2) : null };
    });
    const sw = score(w), sb = score(b);
    const verdict = tie(sw, sb) ? "tie" : sb < sw ? "library" : "wonder";
    console.log(id, "wonder", w.law.title, sw.toFixed(2), "| library", b.law.title, sb.toFixed(2), verdict);
    return { id, wonderLaw: w.law.title, wonderScore: +sw.toFixed(2), libraryLaw: b.law.title, libraryLawId: b.law.id, libraryScore: +sb.toFixed(2), verdict, constants, board: cands.slice(0, 5).map((c) => ({ law: c.law.title, score: +score(c).toFixed(2) })) };
  });

  writeFileSync(
    out,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        summary,
        rows,
        wonder,
        note: "Lite mode, the school plan's no-Spark tier, measured offline: the experiment type (which channels SAM's track is turned into) is taken as given, as a student would pick it; the measured series are the stored benchmark runs' (the same SAM 3.1 tracks the full pipeline used); code fits every law of the textbook library (lib/physics/library-full.ts, now with Duffing and Coulomb springs), ranks them with the full pipeline's own rule (rankCandidates: prediction of the unseen 30% in noise units, ties to the simpler law), and scripts/score.ts scores the winner against the renders' truth exactly as it scores the full pipeline. A swing with no ruler holds Earth's g and measures L, as the full pipeline does. Physical constants only; the camera scale is listed per row. Model cost: none. SAM cost: the stored runs' SAM calls. The two showcases are where Muse Wonder's law won; the library is fitted to the same measured series and scored by the same noise-unit miss.",
      },
      null,
      1,
    ),
  );
  console.log("wrote", out);
}

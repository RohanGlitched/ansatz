// usage: tsx scripts/wonder-ab.ts [budgetUsd=1.2]
// Muse Wonder, old setting against new: low effort with no residual plot, and medium effort with a residual plot
// after each fitting-tool call. Two kinds of clip: the two renders whose law the proposed laws missed (does it find
// it?) and the four benchmark clips where it once overreached (does it hold back?). Same stored measurements, same
// fitted-frames table and brief as a run would give; its law is then fitted and ranked on the held-out 30%.
// Writes data/bench/wonder-ab.json.
import "./env";
import { readFileSync, writeFileSync } from "node:fs";
import { atBound, fitWithRoom, fittedResiduals, rankCandidates, refereeBoard, residualPattern, withScaleCorrection, type Experiment } from "../lib/experiment";
import { compileLaw, fitLaw, type Law } from "../lib/physics/law";
import { localGravity } from "../lib/measure";
import { residualPlot } from "../lib/plot";
import { reviseAgentic, WONDER_PLOT } from "../lib/scientist";
import { Ledger } from "../lib/meta/client";

process.env.FIT_STARTS ??= "4";
const budget = Number(process.argv[2] ?? 1.2);
const TRAIN = 0.7;
const ledger = new Ledger();
const fmt = (v: number, d = 3) => (Number.isFinite(v) ? +v.toPrecision(d) : v);
const nanify = (o: unknown): unknown => (o === null ? NaN : Array.isArray(o) ? o.map(nanify) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, nanify(v)])) : o);
const CHALLENGE = "Challenge round. The law code chose may already be the right one. Look for a physical effect it leaves out; if no law you try fits the fitted frames clearly better with a physical reason, submit the law code chose unchanged.";

const clips = [
  { id: "hardening-spring", path: "data/showcase/hardening-spring.json", needsNew: true },
  { id: "dry-friction-spring", path: "data/showcase/dry-friction-spring.json", needsNew: true },
  ...["sp01_k25_m0.20_b0.35", "bb03_e0.60_purple_240fps", "pd03_earth_orange_balloon_k0.15", "pr02_earth_red_ball_room"].map((id) => ({ id, path: `.probe/bench_r7/${id}.json`, needsNew: false })),
];
const arms = [
  { name: "old: low effort, no plot", effort: "low", plot: false },
  { name: "new: medium effort, residual plot", effort: "medium", plot: true },
];
const rows: Record<string, unknown>[] = [];

outer: for (const clip of clips) {
  for (const arm of arms) {
    if (ledger.usd >= budget) {
      console.log("budget reached before", clip.id, arm.name);
      break outer;
    }
    const raw = JSON.parse(readFileSync(clip.path, "utf8")) as Experiment;
    const m = { ...raw.measured, noise: nanify(raw.measured.noise) as typeof raw.measured.noise };
    // the renders are judged as they stood before Muse Wonder's law joined
    const cands = raw.candidates.filter((c) => c.origin !== "revision").map((c) => ({ ...c, fit: nanify(c.fit) as typeof c.fit }));
    rankCandidates(cands, 0);
    const before = cands[0];
    const gUsed = m.calibration.kind === "gravity" ? localGravity(raw.observation.body, raw.observation.location?.latitude_deg ?? undefined) : null;
    const idea = clip.needsNew ? raw.wonder?.idea ?? "The winner misses even the frames it was fitted to; some effect is missing." : CHALLENGE;
    const tryLaw = async (law: Law) => {
      const l2 = { ...law, params: law.params.filter((p) => p.name !== "cal") };
      if (gUsed !== null) for (const p of l2.params) if (p.name === "g") { p.guess = gUsed; p.fixed = true; }
      const f = fitLaw(gUsed !== null ? withScaleCorrection(l2) : l2, m.series, { trainFrac: TRAIN });
      const per = arm.plot && f.ok ? Object.values(fittedResiduals(f, m, TRAIN)) : [];
      const plot = per.length ? await residualPlot([{ title: law.title, t: per.flatMap((p) => p.t), r: per.flatMap((p) => p.r) }], 1).catch(() => undefined) : undefined;
      return {
        ok: f.ok,
        error: f.why,
        train_rms: f.trainRms,
        fitted: Object.fromEntries(Object.keys(f.theta).filter((k) => !k.endsWith("@0") && k !== "cal").map((k) => [k, `${fmt(f.theta[k], 4)} ± ${fmt(f.sigma[k], 2)}${atBound(l2, k, f.theta[k]) ? " (stuck at its bound)" : ""}`])),
        residual_by_time_bin_on_fitted_frames: residualPattern(f, m, TRAIN),
        ...(plot ? { [WONDER_PLOT]: plot } : {}),
      };
    };
    process.env.WONDER_EFFORT = arm.effort;
    const usd0 = ledger.usd;
    let row: Record<string, unknown> = { clip: clip.id, needsNew: clip.needsNew, arm: arm.name, before: before.law.title, beforeUnseen: before.fit.testRms };
    try {
      const { law, attempts } = await reviseAgentic(raw.observation, { given: raw.given, ...refereeBoard(cands, m, TRAIN) }, idea, tryLaw, ledger, undefined, 3);
      row.attempts = attempts.map((a) => a.title);
      if (!law) throw new Error("no law submitted");
      compileLaw(law);
      if (gUsed !== null) for (const p of law.params) if (p.name === "g") { p.guess = gUsed; p.fixed = true; }
      const inner = { ...law, id: `${law.id}-ab`, params: law.params.filter((p) => p.name !== "cal") };
      const r = fitWithRoom(inner, m.series, gUsed !== null ? withScaleCorrection : undefined);
      cands.push({ law: r.law, fitted: r.fitted, fit: r.fit, origin: "revision", rank: 0 });
      rankCandidates(cands, 0);
      const mine = cands.find((c) => c.law.id === r.law.id)!;
      const ratio = mine.fit.testRms / before.fit.testRms;
      const same = law.title.trim().toLowerCase() === before.law.title.trim().toLowerCase();
      // a render needs a new law that leads and cuts the unseen miss at least in half; a textbook clip needs restraint
      const verdict = clip.needsNew ? (cands[0] === mine && ratio < 0.5 ? "found it" : "missed it") : same || Math.abs(ratio - 1) <= 0.1 ? "held back" : ratio < 0.9 && cands[0] === mine ? "improved" : "overreached";
      row = { ...row, submitted: law.title, rank: mine.rank, of: cands.length, ratio: fmt(ratio), verdict };
    } catch (err) {
      row = { ...row, verdict: "nothing usable", error: (err as Error).message.slice(0, 160) };
    }
    row.usd = +(ledger.usd - usd0).toFixed(4);
    rows.push(row);
    console.log(`${clip.id} | ${arm.name}: ${row.verdict} ${row.submitted ?? ""} (ratio ${row.ratio ?? "-"}) $${row.usd}  total $${ledger.usd.toFixed(3)}`);
    writeFileSync("data/bench/wonder-ab.json", JSON.stringify({ generatedAt: new Date().toISOString(), note: "Muse Wonder, old setting against new, on the two renders whose law the proposed laws missed and the four benchmark clips where it once overreached. found it: its law leads and cuts the unseen miss at least in half; held back: it kept the leading law or matched it within 10%; overreached: its law missed the unseen frames by more. Up to three turns each; the same stored measurements and fitted-frames table a run would give.", arms: arms.map((a) => a.name), rows, usd: +ledger.usd.toFixed(3) }, null, 1));
  }
}
console.log("spent", ledger.usd.toFixed(3));

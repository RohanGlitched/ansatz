// Re-measures every cached synth benchmark run with the held-out 30% sealed, refits it, and re-applies the ruler's share
// of the error (the current inflate), all offline from the stored tracks (no model calls). Writes one record per run to
// <dst>/ for scripts/score.ts. With --unsealed the scale, pivot, line and noise are read from every frame, as before.
// usage: tsx scripts/seal-bench.ts [src=.probe/bench_r7] [dst=.probe/bench_sealed] [--unsealed]
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fitWithRoom, inflateForRuler, noiseFloorOf, rankCandidates, rulerShare, withScaleCorrection, type Experiment } from "../lib/experiment";
import { fitCircle, fitLine, pixelGravity } from "../lib/measure";
import { noiseScale, splitIndex } from "../lib/physics/law";
import { toMetres } from "../lib/units";

process.env.FIT_STARTS ??= "4";
const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const [src = ".probe/bench_r7", dst = ".probe/bench_sealed"] = args;
const sealed = !process.argv.includes("--unsealed");
mkdirSync(dst, { recursive: true });

const log: string[] = [];
for (const f of readdirSync(src).filter((x) => x.endsWith(".json")).sort()) {
  const e = JSON.parse(readFileSync(`${src}/${f}`, "utf8")) as Experiment;
  const m = e.measured;
  const t = m.series.t, N = t.length;
  const S = sealed ? splitIndex(N, e.trainFrac ?? 0.7) : N;
  const px = m.px, xs = px.map((p) => p.x), ys = px.map((p) => p.y);
  const before = { mpp: m.calibration.metresPerPixel, r: m.pivot?.r, noise: { ...m.noise } };
  // the scale from the fall: the fitted frames only
  if (m.calibration.kind === "gravity") {
    const pg = pixelGravity(t.slice(0, S), ys.slice(0, S));
    if (pg && pg.aPx > 0) m.calibration = { ...m.calibration, metresPerPixel: m.calibration.g / pg.aPx, note: `${m.calibration.note.replace(/^scale from the fall itself[^:]*:/, "scale from the fall itself (fitted frames only):")}` };
  }
  const k = m.calibration.metresPerPixel;
  const ch = m.series.ch;
  if (ch.x) ch.x = xs.map((x) => (x - m.origin.x) * k);
  if (ch.y) ch.y = ys.map((y) => -(y - m.origin.y) * k);
  if (ch.theta && m.pivot) {
    const pc = fitCircle(px.slice(0, S).map((p) => ({ x: p.x, y: p.y })));
    if (pc) {
      m.pivot = pc;
      ch.theta = px.map((p) => Math.atan2(p.x - pc.x, p.y - pc.y));
      if (ch.r) ch.r = px.map((p) => Math.hypot(p.x - pc.x, p.y - pc.y) * k);
    }
  }
  if (ch.s && m.line) {
    const line = fitLine(px.slice(0, S).map((p) => ({ x: p.x, y: p.y })));
    m.line = { x0: line.x0, y0: line.y0, ux: line.ux, uy: line.uy };
    ch.s = px.map((p) => ((p.x - line.x0) * line.ux + (p.y - line.y0) * line.uy) * k);
  }
  m.noise = Object.fromEntries(Object.entries(ch).map(([c, v]) => [c, noiseScale(v.slice(0, S), t.slice(0, S))]));
  m.split = splitIndex(N, e.trainFrac ?? 0.7);

  // refit every candidate as the run did (g held at the fall's value when the fall set the scale)
  const gUsed = m.calibration.kind === "gravity" ? m.calibration.g : null;
  for (const c of e.candidates) {
    const inner = { ...c.law, params: c.law.params.filter((p) => p.name !== "cal") };
    const r = fitWithRoom(inner, m.series, gUsed !== null ? withScaleCorrection : undefined);
    c.law = r.law;
    c.fitted = r.fitted;
    c.fit = r.fit;
  }
  rankCandidates(e.candidates, noiseFloorOf(m.noise));
  // the ruler's share of each length-carrying constant, as the run applies it now
  const stated = e.observation.stated_facts.some((s) => /length|string|rope|thread|dhaga|dhaage/.test(s.quantity.toLowerCase()) && (toMetres(s.value, s.unit) ?? 0) > 0.02);
  const arcRel = ch.theta && m.pivot && m.pivot.lengthOk !== false && m.calibration.kind === "reference" && !stated ? (m.pivot.sigmaR ?? 0) / m.pivot.r : 0;
  const share = rulerShare(e.observation, m.calibration, gUsed);
  for (const c of e.candidates) inflateForRuler(c, share, e.observation.body, arcRel);
  const old = e.winner;
  e.winner = e.candidates[0].law.id;
  e.pipeline = sealed ? "2026-10-27c sealed re-score" : "2026-10-27c re-score (unsealed)";
  writeFileSync(`${dst}/${f}`, JSON.stringify(e));
  log.push(`${f.padEnd(40)} ${old === e.winner ? "" : `winner ${old} -> ${e.winner} `}scale ${(((k - before.mpp) / before.mpp) * 100).toFixed(3)}%${before.r && m.pivot ? ` pivot r ${(((m.pivot.r - before.r) / before.r) * 100).toFixed(3)}%` : ""} noise ${Object.keys(m.noise).map((c) => `${c} ${(((m.noise[c] - before.noise[c]) / before.noise[c]) * 100).toFixed(1)}%`).join(" ")}`);
}
console.log(log.join("\n"));

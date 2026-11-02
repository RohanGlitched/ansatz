// usage: npx tsx scripts/combine-retro.ts [record.json ...]
//
// The code-combination step (lib/combine.ts) applied after the fact to stored runs: no model is called. For each record
// it reads the pool as the run left it, labels the residual spectrum of the best law without a drive, adds the drive
// candidate when that spectrum has an unexplained peak, refits it exactly as the pipeline does, and re-ranks the pool.
// A diagnostic only: the pool is the one the old code produced (Muse Wonder never saw the spectrum tool), and the
// sealed verdicts stand as published. When a record carries the run's own labelled spectrum, it is printed relabelled
// by the current classifyPeaks next to the labels the run gave it (the drive-and-mixing rule after set 4).
import { readFileSync } from "node:fs";
import { baseCandidate, driveCandidate, fitWithRoom, rankCandidates, recombinations, spectrumOf, type Candidate } from "../lib/experiment";
import { compileLaw, type Law } from "../lib/physics/law";
import { classifyPeaks, spectrumSummary } from "../lib/spectrum";

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : [6604796, 6604797, 6604798, 6604980, 6604981, 6604982, 6605123, 6605124, 6605125].map((r) => `data/showcase/sealed-law-${r}.json`);
for (const f of files) {
  const e = JSON.parse(readFileSync(f, "utf8"));
  const m = { series: e.measured.series, noise: e.measured.noise };
  const noiseFloor = Math.min(...Object.values(e.measured.noise as Record<string, number>).filter((v) => v > 0));
  const cands: Candidate[] = e.candidates.map((c: Candidate) => ({ ...c }));
  const t0 = Date.now();
  const unitFor = (ch: string) => (ch === "theta" ? "rad" : e.measured.calibration.kind === "none" ? "px" : "m");
  const fitOne = (l: Law) => fitWithRoom(l, m.series);
  if (e.residualSpectrum?.peaks?.length) {
    const rs = e.residualSpectrum;
    const n = Math.round((e.measured.series.t.length as number) * 0.7);
    const again = classifyPeaks({ law: rs.law, peaks: rs.peaks }, rs.motionOmega, { spanS: rs.spanS, n, channels: Object.keys(e.measured.series.ch).length });
    console.log(`  stored spectrum of “${rs.law}” (motion ${rs.motionOmega?.toFixed(2)}): ${rs.peaks.map((p: { omega: number; ampNoise: number; label?: string }, i: number) => `${p.omega.toFixed(2)} ${p.ampNoise.toFixed(0)}× ${p.label} → ${again.peaks[i].label}`).join("; ")}`);
  }
  const base = baseCandidate(cands, m);
  const spec = base ? spectrumOf(base, m) : null;
  const dc = base ? driveCandidate(base, spec, unitFor, fitOne) : null;
  if (dc?.cand.fit.ok) cands.push(dc.cand);
  const rev = cands.find((c) => c.origin === "revision");
  const recs = rev ? recombinations(rev, cands, m) : [];
  for (const r of recs) {
    compileLaw(r.law);
    const x = fitOne(r.law);
    if (x.fit.ok) cands.push({ law: x.law, fitted: x.fitted, fit: x.fit, origin: "combined", combined: "stiffness+damping", rank: 0 });
  }
  rankCandidates(cands, noiseFloor);
  const s = e.extras?.sealed;
  console.log(`\n${f}  drawn: ${s ? `${s.drawn.stiffness}/${s.drawn.damping}${s.drawn.drive ? `/drive wd=${s.constants.wd.value}` : ""}` : "?"}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  console.log("  base:", base?.law.id, "|", spectrumSummary(spec, { s: "px", x: "px", y: "px" }));
  if (dc) console.log(`  drive candidate: ${dc.cand.law.id} ok=${dc.cand.fit.ok} peak ${dc.peak.omega.toFixed(3)} start ${dc.phaseStart}; w_drive ${dc.cand.fit.theta.w_drive?.toFixed(3)} ± ${dc.cand.fit.sigma.w_drive?.toPrecision(2)}, F ${dc.cand.fit.theta.F_drive?.toPrecision(4)} ± ${dc.cand.fit.sigma.F_drive?.toPrecision(2)}; train ${dc.cand.fit.trainRms.toFixed(3)} test ${dc.cand.fit.testRms.toFixed(3)} (testZ ${dc.cand.fit.testZ?.toFixed(1)})`);
  for (const r of recs) console.log(`  recombination: ${r.law.id}: ${r.law.derivatives[Object.keys(r.law.derivatives)[1]]}`);
  for (const c of cands.slice(0, 4)) console.log(`   #${c.rank} ${c.origin.padEnd(9)} ${c.law.id.padEnd(40)} test ${c.fit.testRms.toFixed(3)} z ${c.fit.testZ?.toFixed(1)} train z ${c.fit.trainZ?.toFixed(1)} k ${c.fit.k}`);
}

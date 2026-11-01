// Restates a showcase's pixel-unit truth rows in metres, using the render's own scale (metres_per_pixel in its truth
// file), so a no-ruler run's constants can be read against the truth in the same units. Writes each row's `si`
// (TruthInMetres). No model calls.
// usage: tsx scripts/truth-in-metres.ts [id=dry-friction-spring] [clip=sx02_coulomb_k20_mu0.45]
import { readFileSync, writeFileSync } from "node:fs";
import type { Experiment } from "../lib/experiment";
import { pixelsToMetres, prettyUnit } from "../lib/units";

const [id = "dry-friction-spring", clip = "sx02_coulomb_k20_mu0.45"] = process.argv.slice(2);
const file = `data/showcase/${id}.json`;
const e = JSON.parse(readFileSync(file, "utf8")) as Experiment;
const truthFile = `bench/synth/clips/${clip}.json`;
const mpp = (JSON.parse(readFileSync(truthFile, "utf8")) as { metres_per_pixel: number }).metres_per_pixel;
if (e.measured.calibration.kind !== "none") throw new Error(`${id} has a scale of its own (${e.measured.calibration.kind}); nothing to restate`);
let n = 0;
for (const r of e.extras?.truth?.rows ?? []) {
  const unit = r.unit.replace(/²/g, "^2");
  const m = pixelsToMetres(r.measured, r.sigma, unit, mpp);
  const t = pixelsToMetres(r.truth, 0, unit, mpp);
  if (!m || !t) continue;
  r.si = { measured: m.value, sigma: m.sigma, truth: t.value, unit: prettyUnit(m.unit), metresPerPixel: mpp, scale: `the render's own scale, ${mpp} m per pixel (${truthFile})` };
  n++;
  console.log(`${r.param}: ${r.measured.toPrecision(4)} ± ${r.sigma.toPrecision(2)} ${r.unit} = ${m.value.toFixed(3)} ± ${m.sigma.toFixed(3)} ${prettyUnit(m.unit)} (truth ${t.value.toFixed(3)}, ${(((m.value - t.value) / t.value) * 100).toFixed(1)}%, ${(Math.abs(m.value - t.value) / m.sigma).toFixed(1)}σ)`);
}
const text = readFileSync(file, "utf8");
writeFileSync(file, JSON.stringify(e, null, /\n  "/.test(text.slice(0, 200)) ? 2 : undefined) + (text.endsWith("\n") ? "\n" : ""));
console.log(`${n} row${n === 1 ? "" : "s"} restated in ${file}`);

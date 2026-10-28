// Per-frame data for the demo video's overlays, from a stored record and no model calls: where SAM 3.1 saw the
// body, and where the winning law (fitted on the first 70%) says it is, on every frame including the unseen 30%.
// npx tsx --conditions=react-server scripts/overlay-data.ts data/showcase/big-swing.json out.json
import { readFileSync, writeFileSync } from "node:fs";
import { compileLaw } from "../lib/physics/law";
import { toPixels } from "../lib/pixels";
import type { Experiment } from "../lib/experiment";

const [src, dst] = process.argv.slice(2);
const e = JSON.parse(readFileSync(src, "utf8")) as Experiment;
const m = e.measured;
const N = m.series.t.length;
const split = m.split ?? Math.floor(N * 0.7);

function path(c: Experiment["candidates"][number]) {
  const law = c.fitted ?? c.law;
  const cl = compileLaw(law);
  const theta = Float64Array.from(cl.free.map((n) => c.fit.theta[n] ?? law.params.find((p) => p.name === n)?.guess ?? 0));
  const out = cl.run(theta, m.series.t);
  return toPixels(out.obs, m).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
}

const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
const losers = e.candidates.filter((c) => c !== win && c.fit?.ok && c.origin !== "control").slice(0, 3);
const eqs = (c: Experiment["candidates"][number]) => Object.entries((c.fitted ?? c.law).derivatives).filter(([k, v]) => v !== k.replace(/^v/, "") && !/^[a-z]$/.test(v)).map(([k, v]) => `${k}' = ${v}`);
writeFileSync(
  dst,
  JSON.stringify({
    id: e.id,
    video: e.video,
    f0: m.window.f0,
    t0: m.window.t0,
    split,
    t: m.series.t,
    seen: m.px.map((p) => [p.f, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
    pivot: m.pivot ? { x: m.pivot.x, y: m.pivot.y } : null,
    mpp: m.calibration.kind === "none" ? null : m.calibration.metresPerPixel,
    winner: { id: win.law.id, title: win.law.title, origin: win.origin, eqs: eqs(win), theta: win.fit.theta, sigma: win.fit.sigma, testRms: win.fit.testRms, path: path(win) },
    wonder: e.wonder ?? null,
    finding: e.finding,
    comparisons: e.comparisons,
    losers: losers.map((c) => ({ id: c.law.id, title: c.law.title, origin: c.origin, eqs: eqs(c), testRms: c.fit.testRms, path: path(c) })),
    strobe: e.strobe.map((s) => ({ f: s.f, box: s.box, rle: s.rle })),
  }),
);
console.log(e.id, "frames", N, "split", split, "winner", win.law.id, "losers", losers.map((c) => c.law.id).join(","));

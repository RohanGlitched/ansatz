// Jump for jump, offline from cached SAM tracks (data/sam): both Moon jumps measured the same way in the broadcast, in the
// copy slowed 1.5× in secret, and in two controls (scripts/moon-controls.ts): a speed ramp (1.5× through jump 1, 1.0×
// through jump 2, same length as the broadcast) and a real-time copy at 23.976 fps. No model calls.
// usage: tsx scripts/samejump.ts            prints the results
//        tsx scripts/samejump.ts --write    also stores them in data/showcase/moon-jump.json (sameJump and controls only)
import { readFileSync, writeFileSync } from "node:fs";
import { combine, measureAll, pairRatio, stored, type ClipId } from "../lib/samejump";
import { CONTROLS } from "./moon-controls";

const { fits, hang } = await measureAll();
const r3 = (x: number) => +x.toFixed(4);
const pairs = (other: ClipId) =>
  [0, 1].map((j) => {
    const a = fits.broadcast[j], b = fits[other][j];
    const p = pairRatio(a, b);
    return { jump: j + 1, real: stored(a), [other === "slowed" ? "slowed" : "copy"]: stored(b), ratio: p.ratio, sigma: p.sigma, sigmaOls: p.sigmaOls, hangRatio: r3(hang[other][j].s / hang.broadcast[j].s) };
  });

for (const id of Object.keys(fits) as ClipId[])
  fits[id].forEach((j, k) => console.log(`${id.padEnd(9)} jump ${k + 1}: frames ${j.f0}-${j.f1} (${j.n} pts, block ${j.block}${j.dropped.length ? `, dropped ${j.dropped.join(",")}` : ""}) |a| ${j.g.toFixed(4)} ± ${j.sigma.toFixed(4)} (OLS ${j.sigmaOls.toFixed(4)}, bootstrap ${j.sigmaBoot.toFixed(4)})`));

const same = pairs("slowed");
const combined = combine(same);
// the white-noise σ alone and the bootstrap alone, for the record
const sOls = combine(same.map((j) => ({ ratio: j.ratio, sigma: j.sigmaOls })));
const sBoot = combine(same.map((j, k) => ({ ratio: j.ratio, sigma: 0.5 * j.ratio * Math.hypot(fits.broadcast[k].sigmaBoot / fits.broadcast[k].g, fits.slowed[k].sigmaBoot / fits.slowed[k].g) })));
console.log("slowed:", same.map((j) => `jump ${j.jump} ${j.ratio.toFixed(3)} ± ${j.sigma.toFixed(3)}`).join("; "), `combined ${combined.ratio.toFixed(3)} ± ${combined.sigma.toFixed(3)} (OLS ±${sOls.sigma.toFixed(4)}, bootstrap ±${sBoot.sigma.toFixed(4)})`);

// a ramp shows a different factor per jump: they are not combined
const controls = (["ramp", "realtime"] as const).map((id) => {
  const js = pairs(id).map((j, k) => ({ ...j, truth: CONTROLS[id].truth[k], pull: +((j.ratio - CONTROLS[id].truth[k]) / j.sigma).toFixed(2) }));
  console.log(`${id}:`, js.map((j) => `jump ${j.jump} ${j.ratio.toFixed(3)} ± ${j.sigma.toFixed(3)} (truth ${j.truth}, ${j.pull}σ; hang-time count ${j.hangRatio})`).join("; "));
  return { id, file: CONTROLS[id].file, made: CONTROLS[id].note, jumps: js };
});
// frames dropped by the glitch rule, anywhere
const dropped = (Object.keys(fits) as ClipId[]).flatMap((id) => fits[id].flatMap((j, k) => j.dropped.map((f) => `${id} jump ${k + 1} frame ${f}`)));
console.log("dropped:", dropped.join("; ") || "none");

if (process.argv.includes("--write")) {
  const f = "data/showcase/moon-jump.json";
  // read just before writing: other fields of this record are edited by hand elsewhere
  const e = JSON.parse(readFileSync(f, "utf8"));
  const prev = e.extras.memoryTest.sameJump ?? {};
  e.extras.memoryTest.sameJump = {
    ...prev,
    note: "Each published run picked its own jump: the broadcast run measured Young’s second jump, the slowed run his first. So here both jumps are measured in both clips by the same code: the helmet top over every airborne frame (found by code from where his feet leave the ground), the same ruler, and a quadratic over the whole flight. Errors are statistical only (least squares, checked by a moving-block bootstrap of the fit’s residuals, which comes out slightly smaller); the ruler cancels in the ratio. Both clips are one piece of footage, so this checks the frame clock rather than physics: the controls below test what a duration can’t.",
    method: "scripts/samejump.ts on the SAM 3.1 tracks cached in data/sam; windows from lib/samejump.ts airborneRuns(), the rule measure() uses",
    jumps: same.map((j) => ({ jump: j.jump, real: j.real, slowed: (j as Record<string, unknown>).slowed, ratio: j.ratio, sigma: j.sigma, sigmaOls: j.sigmaOls, hangRatio: j.hangRatio })),
    combined: { ratio: combined.ratio, sigma: combined.sigma },
    sigmaCheck: { ols: sOls.sigma, bootstrap: sBoot.sigma, note: `The white-noise least-squares σ gives ±${sOls.sigma.toFixed(4)}; a moving-block bootstrap of the residuals (block about n^⅓ samples in the broadcast, the same stretch of each jump in the slowed copy, 2000 draws) gives ±${sBoot.sigma.toFixed(4)}. Fit by fit the two agree to about 10%, and blocks of 1 to 8 samples move the bootstrap σ by about as much; combined, the bootstrap is the smaller, so we quote the least-squares σ.` },
  };
  e.extras.memoryTest.controls = {
    note: `Two copies made from the broadcast with ffmpeg (scripts/moon-controls.ts), each tracked once by SAM 3.1 ($${(0.0476 + 0.0344).toFixed(3)} for both) and measured jump for jump against the broadcast by the same code. The speed ramp lasts ${(7.94).toFixed(2)} s against the broadcast’s 8.01 s, so its length says “real speed”; only the falls can say that jump 1 runs slow and jump 2 doesn’t. The 23.976 fps copy is a false-positive control: a different trim and frame clock at real speed. Frames where SAM’s mask top jumps away from the flight are dropped by one fixed rule (over 6 robust σ, and 3 px, off the parabola) applied to every clip: ${dropped.length ? `${dropped.join("; ")}, the only ${dropped.length === 1 ? "one" : "ones"}` : "none were"}. Counting airborne frames per jump (the naive answer) gives the hang-time ratio, cruder because take-off and landing blur.`,
    clips: controls,
    sam: { calls: 2, usd: 0.082, frames: [238, 172], note: "estimated by the ledger at $0.0002 a frame (the stream carried no usage)" },
  };
  writeFileSync(f, JSON.stringify(e, null, 1));
  console.log("stored");
}

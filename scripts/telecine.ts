// The Moon jump's clock and rulers, offline from the cached SAM 3.1 tracks (data/sam) and the broadcast's own frames.
// No model calls. Four checks on the published g:
//  1. inverse telecine: this copy carries a film cadence (24 frames a second inside 30 fps video, one frame in five shown twice);
//     the repeats are found from the frames themselves, dropped, and the unique frames retimed to k/24 s, then refitted
//  2. a sub-pixel helmet top: the apex of a parabola through the top edge of SAM's mask, instead of the box's whole pixel
//  3. g against the ruler's percentile: Young's height read at p50, p75 (the published choice), p90 or his tallest frame
//  4. a second ruler nobody tuned: the flag at its documented size (data/sam/flag-broadcast.txt, tracked once by SAM 3.1)
// usage: tsx scripts/telecine.ts [--write]   (--write stores extras.telecine, rulerPercentiles and flagRuler in
//        data/showcase/moon-jump.json, read just before writing; the headline is left alone)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import ffmpeg from "ffmpeg-static";
import { parseSam, type Sample, type Track } from "../lib/meta/sam";
import { mainTrack, rulerExtent } from "../lib/measure";
import { median } from "../lib/median";
import { rleDecode } from "../lib/rle";
import { baseBlock, combine, measureJumps, MOON_MPP } from "../lib/samejump";
import { readVideoInfo } from "../lib/video";

const CLIP = "public/showcase/moon-jump.mp4";
const RULER_REL = 0.05; // Young's suited height, 1.88 m ± 5% (data/showcase/moon-jump.json extras.ruler)
const HEIGHT_M = 1.88;
const r4 = (x: number) => +x.toFixed(4);

const track = mainTrack(parseSam(readFileSync("data/sam/astronaut-broadcast.txt", "utf8"), "astronaut", true).tracks)!;
const vi = readVideoInfo(readFileSync(CLIP));

/* 1. the cadence, from the frames themselves: the mean absolute difference from the previous frame, by frame index mod 5 */
const H = vi.height;
const raw = execFileSync(ffmpeg as unknown as string, ["-v", "error", "-i", CLIP, "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { maxBuffer: 1 << 28 });
const frameBytes = raw.length / vi.times.length;
// the stored (coded) width: old broadcast TV has non-square pixels, and SAM's x lives in this width
const W = Math.round(frameBytes / H);
const diff = [NaN];
for (let f = 1; f < vi.times.length; f++) {
  let s = 0;
  for (let i = 0; i < frameBytes; i++) s += Math.abs(raw[f * frameBytes + i] - raw[(f - 1) * frameBytes + i]);
  diff.push(s / frameBytes);
}
const byPhase = [0, 1, 2, 3, 4].map((p) => median(diff.filter((d, f) => f > 0 && f % 5 === p)));
const phase = byPhase.indexOf(Math.min(...byPhase));
const others = median(byPhase.filter((_, p) => p !== phase));
const repeats = diff.map((d, f) => (f % 5 === phase && d < others ? f : -1)).filter((f) => f >= 0);
const share = repeats.length / diff.filter((_, f) => f > 0 && f % 5 === phase).length;
console.log(`cadence: frames ≡ ${phase} (mod 5) repeat the frame before (median difference ${byPhase[phase].toFixed(2)} grey levels against ${others.toFixed(2)}); ${repeats.length} of ${vi.times.length} frames, ${(share * 100).toFixed(0)}% of that phase`);

// every frame of the repeating phase is dropped (one rule for the whole clip), and each unique frame k sits at k/24 s
const isRepeat = (f: number) => f > 0 && f % 5 === phase;
const filmTimes = (fps: number) => {
  let k = -1;
  return vi.times.map((_, f) => (isRepeat(f) ? NaN : ++k / fps));
};
const unique = (t: Track): Track => ({ ...t, samples: t.samples.filter((s) => !isRepeat(s.f)) });

/* 2. the helmet top to a fraction of a pixel: the apex of a parabola fitted to the mask's top edge near its highest point */
function apexTop(s: Sample): number | null {
  if (!s.rle) return null;
  const [h, w] = s.rle.size;
  const m = rleDecode(s.rle.counts, h, w);
  const sx = (s.box[2] - s.box[0]) / w, sy = (s.box[3] - s.box[1]) / h;
  const top: number[] = [];
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h && !m[y * w + x]) y++;
    top.push(y < h ? y : Infinity);
  }
  const best = Math.min(...top);
  if (!Number.isFinite(best)) return null;
  // the dome: the columns whose top edge lies within 4 rows of the highest, around the highest column
  const at = top.indexOf(best);
  let a = at, b = at;
  while (a > 0 && top[a - 1] <= best + 4) a--;
  while (b < w - 1 && top[b + 1] <= best + 4) b++;
  if (b - a + 1 < 5) return s.box[1];
  const xs: number[] = [], ys: number[] = [];
  for (let x = a; x <= b; x++) { xs.push((x + 0.5) * sx); ys.push(top[x] * sy); }
  const xm = xs.reduce((p, q) => p + q, 0) / xs.length;
  const S = [0, 0, 0, 0, 0], Y = [0, 0, 0];
  xs.forEach((x, i) => { const u = x - xm; const p = [1, u, u * u, u ** 3, u ** 4]; for (let j = 0; j < 5; j++) S[j] += p[j]; for (let j = 0; j < 3; j++) Y[j] += p[j] * ys[i]; });
  const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const det = (q: number[][]) => q[0][0] * (q[1][1] * q[2][2] - q[1][2] * q[2][1]) - q[0][1] * (q[1][0] * q[2][2] - q[1][2] * q[2][0]) + q[0][2] * (q[1][0] * q[2][1] - q[1][1] * q[2][0]);
  const D = det(M);
  if (Math.abs(D) < 1e-12) return s.box[1];
  const c = [0, 1, 2].map((k) => det(M.map((row, i) => row.map((v, j) => (j === k ? Y[i] : v)))) / D);
  // a dome opens downward in the picture (y grows away from the apex): c2 > 0; its apex is c0 − c1²/(4 c2)
  if (!(c[2] > 0)) return s.box[1];
  const apex = c[0] - (c[1] * c[1]) / (4 * c[2]);
  // the apex can't sit above the highest row by more than a row, or below it
  return s.box[1] + Math.min(best * sy, Math.max(best * sy - sy, apex));
}
const subpixel = (t: Track): Track => ({ ...t, samples: t.samples.map((s) => { const y = apexTop(s); return y === null ? s : { ...s, box: [s.box[0], y, s.box[2], s.box[3]] as Sample["box"] }; }) });

/* the fits: every jump, the helmet top over every airborne frame, a quadratic over the whole flight (lib/samejump.ts) */
const fitAll = (t: Track, times: number[], mpp = MOON_MPP) => {
  const js = measureJumps(t, times, mpp, (n) => baseBlock(n));
  const comb = combine(js.map((j) => ({ ratio: j.g, sigma: j.sigma })));
  return { jumps: js.map((j, i) => ({ jump: i + 1, g: r4(j.g), sigma: r4(j.sigma), n: j.n })), g: comb.ratio, stat: comb.sigma };
};
const withRuler = (g: number, stat: number) => Math.hypot(stat, RULER_REL * g);

const video = fitAll(track, vi.times);
const film = fitAll(unique(track), filmTimes(24));
const film23976 = fitAll(unique(track), filmTimes(24000 / 1001));
const sub = fitAll(subpixel(unique(track)), filmTimes(24));
const subVideo = fitAll(subpixel(track), vi.times);
for (const [name, r] of [["30 fps clock (as published)", video], ["inverse telecine, k/24 s", film], ["inverse telecine, k/23.976 s", film23976], ["inverse telecine + sub-pixel helmet top", sub], ["30 fps clock + sub-pixel helmet top", subVideo]] as const)
  console.log(`${name.padEnd(42)} g ${r.g.toFixed(4)} ± ${r.stat.toFixed(4)} stat, ± ${withRuler(r.g, r.stat).toFixed(4)} with the ruler | ${r.jumps.map((j) => `jump ${j.jump} ${j.g} ± ${j.sigma} (${j.n} pts)`).join("; ")}`);

/* 3. the ruler's percentile: g scales as metres per pixel, so as 1 / (Young's height in px) */
const heights = track.samples.map((s) => s.box[3] - s.box[1]);
const p75 = rulerExtent(heights, 0.75).px;
const pct = [["p50", 0.5], ["p75", 0.75], ["p90", 0.9], ["tallest frame", 1]] as const;
const rulerRows = pct.map(([at, q]) => {
  const px = q === 1 ? Math.max(...heights) : rulerExtent(heights, q).px;
  const g = film.g * (p75 / px);
  return { at, px, g: r4(g), sigma: r4(withRuler(g, film.stat * (p75 / px))), ...(at === "p75" ? { chosen: true } : {}) };
});
console.log("ruler percentile:", rulerRows.map((r) => `${r.at} ${r.px} px → g ${r.g} ± ${r.sigma}`).join("; "));

/* 4. the flag: 3 ft × 5 ft (0.914 × 1.524 m), hung from a horizontal rod; its height in the picture is its short side */
const FLAG = { width: 1.524, height: 0.9144, rel: 0.08 };
let flagRuler: Record<string, unknown> | null = null;
if (existsSync("data/sam/flag-broadcast.txt")) {
  const ft = parseSam(readFileSync("data/sam/flag-broadcast.txt", "utf8"), "flag", false).tracks.sort((a, b) => b.samples.length - a.samples.length)[0];
  if (ft) {
    // SAM's x is in the stored (coded) width; display pixels are 321/352 as wide, so the width is put on the height's scale
    const aspect = vi.width / W;
    const hExt = rulerExtent(ft.samples.map((s) => s.box[3] - s.box[1]));
    const wExt = rulerExtent(ft.samples.map((s) => (s.box[2] - s.box[0]) * aspect));
    // metres per source pixel (vertical) from the flag's height, against Young's height
    const mppFlag = FLAG.height / hExt.px;
    const gFlag = film.g * (mppFlag / MOON_MPP);
    const gHeight = film.g;
    const relFlag = Math.hypot(FLAG.rel, hExt.sigmaPx / hExt.px);
    const depth = mppFlag / MOON_MPP;
    flagRuler = {
      note: `A second ruler nobody tuned: the flag, tracked once by SAM 3.1. Its cloth is ${hExt.px.toFixed(1)} ± ${hExt.sigmaPx.toFixed(1)} px tall (median over ${hExt.n} frames) and ${wExt.px.toFixed(1)} px wide on the same scale (SAM's x converted from the stored ${W}-pixel width to the displayed ${vi.width}). A 3 × 5 ft flag is 0.914 m tall, which makes ${(mppFlag * 1000).toFixed(1)} mm a pixel at the flag against ${(MOON_MPP * 1000).toFixed(1)} mm at Young from his height: ${depth.toFixed(2)} times as many. Read on the flag's scale, the same fit would give g = ${gFlag.toFixed(2)} m/s², against ${gHeight.toFixed(2)} ± ${withRuler(gHeight, film.stat).toFixed(2)} on Young's. That is not a second measurement of g: the flag stands behind Young, beside the far astronaut, about ${depth.toFixed(1)} times as far from the camera, and its cloth hangs crumpled (its width in the picture is ${(wExt.px / hExt.px).toFixed(2)} times its height, against 1.67 for a flat flag). A ruler must be in the plane of the motion; this one is not, so it checks nothing about the jump without a depth. We report it as a ruler that failed, not as a scale.`,
      source: "Apollo Lunar Surface Journal (ALSJ, history.nasa.gov/alsj): the Apollo lunar flags were 3 ft × 5 ft nylon, hung from a horizontal crossbar; ±8% assumed here for sag, wrinkles and depth",
      sizeM: { width: FLAG.width, height: FLAG.height, rel: FLAG.rel },
      px: { width: r4(wExt.px), height: r4(hExt.px), sigma: r4(hExt.sigmaPx), frames: hExt.n },
      g: r4(gFlag),
      sigma: r4(gFlag * Math.hypot(relFlag, film.stat / film.g)),
      gHeightRuler: r4(gHeight),
      sam: { usd: 0.048, frames: vi.times.length },
    };
    console.log(`flag: ${hExt.px.toFixed(1)} ± ${hExt.sigmaPx.toFixed(1)} px tall, ${wExt.px.toFixed(1)} px wide (display); g on the flag's scale ${gFlag.toFixed(3)} against ${gHeight.toFixed(3)} on Young's height`);
  }
}

if (process.argv.includes("--write")) {
  const f = "data/showcase/moon-jump.json";
  // read just before writing: other fields of this record are edited elsewhere
  const text = readFileSync(f, "utf8");
  const e = JSON.parse(text);
  e.extras.telecine = {
    g: r4(film.g),
    sigma: r4(withRuler(film.g, film.stat)),
    note: `This copy carries a film cadence inside its 30 fps video: 24 pictures a second, one in five shown twice (a film stage somewhere in its history, such as 16 mm film or a kinescope transferred to video). The repeats are found from the frames themselves (every frame whose index is ${phase} mod 5 differs from the one before by a median ${byPhase[phase].toFixed(2)} grey levels, against ${others.toFixed(2)} for the rest), all ${diff.filter((_, i) => i > 0 && i % 5 === phase).length} of them are dropped, and each unique frame k is put at k/24 s. Refitted the same way (the helmet top over every airborne frame of both jumps, a quadratic over each flight, combined by inverse variance), g is ${film.g.toFixed(3)} ± ${film.stat.toFixed(3)} (statistical) ± ${(RULER_REL * film.g).toFixed(3)} (the ruler) = ${film.g.toFixed(2)} ± ${withRuler(film.g, film.stat).toFixed(2)} m/s²; the 30 fps clock as published gives ${video.g.toFixed(3)} ± ${video.stat.toFixed(3)} on the same frames. Film run at 23.976 (the NTSC rate) instead of 24 gives ${film23976.g.toFixed(3)}.`,
    method: "scripts/telecine.ts: frame differences from the broadcast decoded by ffmpeg, cached SAM 3.1 track data/sam/astronaut-broadcast.txt, lib/samejump.ts measureJumps() with the retimed clock",
    cadence: { period: 5, phase, repeats: repeats.length, frames: vi.times.length },
    jumps: film.jumps,
    subpixel: { g: r4(sub.g), sigma: r4(withRuler(sub.g, sub.stat)), note: `The helmet top to a fraction of a pixel: the apex of a parabola through the top edge of SAM's mask over the dome (the columns within 4 rows of the highest), instead of the box's whole-pixel top. With the film clock, g is ${sub.g.toFixed(3)} ± ${sub.stat.toFixed(3)} (statistical); on the 30 fps clock ${subVideo.g.toFixed(3)} ± ${subVideo.stat.toFixed(3)}.` },
  };
  e.extras.rulerPercentiles = {
    note: `Young's suited height (${HEIGHT_M} m) is read from his tallest frames: the 75th percentile of the box's height over the clip (${p75} px), since a crouch or tucked legs only shorten it. Any other choice moves g in proportion. All rows use the film clock (inverse telecine); the error bars include the ±5% on his height.`,
    method: "scripts/telecine.ts: box heights of the cached SAM 3.1 track, g scaled by 136 px / height",
    rows: rulerRows,
  };
  if (flagRuler) e.extras.flagRuler = flagRuler;
  // the file's own line endings and final newline are kept, so a diff shows only what changed
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  writeFileSync(f, JSON.stringify(e, null, 1).replace(/\n/g, eol) + (/\r?\n$/.test(text) ? eol : ""));
  console.log("stored extras.telecine, extras.rulerPercentiles", flagRuler ? "and extras.flagRuler" : "");
}

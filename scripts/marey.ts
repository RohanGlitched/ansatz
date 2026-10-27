// usage: tsx scripts/marey.ts [id ...]  renders public/prints/marey/<id>.webp and components/marey.json
// A chronophotograph in the manner of Étienne-Jules Marey for every showcase whose motion is mostly vertical (a fall,
// a jump in place, a spring): the object's own pixels, cut out by SAM 3.1's masks at each strobe instant, each shifted
// to the right by its timestamp, on a dark plate. A vertical motion that piles into one smeared figure in the true
// print spreads into a time sequence that traces its own graph (a parabola, a decaying sine). The overlay (law, dots,
// split) is drawn by StrobePlate with the same shift, read from components/marey.json.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ffmpegStatic from "ffmpeg-static";
import { rleDecode } from "../lib/rle";
import type { Experiment } from "../lib/experiment";

const bin = process.env.FFMPEG_PATH || (ffmpegStatic as unknown as string);

function ff(args: string[], input?: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    const out: Buffer[] = [];
    let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(err.split("\n").slice(-3).join(" ")))));
    if (input) p.stdin.end(input);
  });
}

const frame = (video: string, t: number, W: number, H: number) =>
  ff(["-v", "error", "-i", video, "-ss", String(Math.max(0, t + 0.002)), "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);

const clamp = (v: number) => Math.max(0, Math.min(255, v));
const median = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1];
// the plate: #0e1012
const PLATE = [14, 16, 18];

export type Marey = {
  /** the chronophotograph's size, in the frame's own pixels (height unchanged; width grows when the clip is narrow) */
  W: number;
  H: number;
  src: string;
  /** a point at time fraction f (0 at the first measured frame, 1 at the last) moves right by left + f·span − cx */
  left: number;
  span: number;
  cx: number;
  /** seconds from the first measured frame to the last */
  dur: number;
  /** each strobe's time fraction, in strobe order */
  strobe: number[];
};

const ids: string[] = process.argv.slice(2).length ? process.argv.slice(2) : JSON.parse(readFileSync("data/showcase/order.json", "utf8"));
mkdirSync("public/prints/marey", { recursive: true });
const outFile = "components/marey.json";
const out: Record<string, Marey> = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : {};
for (const id of ids) {
  const e = JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;
  const video = `public${e.source.video}`;
  const m = e.measured;
  const strobe = e.strobe.filter((s) => s.rle);
  if (!existsSync(video) || strobe.length < 3 || m.px.length < 3) {
    console.log(id, "skipped: no clip or too few masks");
    delete out[id];
    continue;
  }
  // mostly vertical: the measured point drifts sideways by less than half the object's width, and rises and falls by
  // more than twice that drift. Only then do the true-position cut-outs pile into one figure.
  const xs = m.px.map((p) => p.x), ys = m.px.map((p) => p.y);
  const rx = Math.max(...xs) - Math.min(...xs), ry = Math.max(...ys) - Math.min(...ys);
  const bw = median(strobe.map((s) => s.box[2] - s.box[0]));
  if (!(rx < bw * 0.5 && ry > rx * 2)) {
    console.log(id, `not 1-D vertical (drift ${rx.toFixed(0)} px, rise ${ry.toFixed(0)} px, width ${bw.toFixed(0)} px)`);
    delete out[id];
    continue;
  }
  const fw = e.video.codedWidth ?? e.video.width, H = e.video.height;
  const pad = Math.round(bw * 0.15);
  const W = Math.max(fw, Math.round(strobe.length * bw * 0.72 + bw + 2 * pad));
  const left = Math.round(bw / 2 + pad), span = W - 2 * left;
  const cx = median(xs);
  const T0 = m.window.t0 + m.series.t[0], T1 = m.window.t0 + m.series.t[m.series.t.length - 1];
  const frac = (t: number) => Math.min(1, Math.max(0, (t - T0) / (T1 - T0 || 1)));
  const img = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) for (let c = 0; c < 3; c++) img[i * 3 + c] = PLATE[c];
  for (const s of strobe) {
    const f = await frame(video, s.t, fw, H);
    const [l, t, r, b] = s.box.map(Math.round) as [number, number, number, number];
    const x0 = Math.max(0, l), y0 = Math.max(0, t), w = Math.max(1, Math.min(fw, r) - x0), h = Math.max(1, Math.min(H, b) - y0);
    const [mh, mw] = s.rle!.size;
    const mask = rleDecode(s.rle!.counts, mh, mw);
    const dx = Math.round(left + frac(s.t) * span - cx);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const mx = Math.min(mw - 1, Math.floor((x / w) * mw)), my = Math.min(mh - 1, Math.floor((y / h) * mh));
        if (!mask[my * mw + mx]) continue;
        const X = x0 + x + dx;
        if (X < 0 || X >= W) continue;
        const k = ((y0 + y) * fw + x0 + x) * 3, o = ((y0 + y) * W + X) * 3;
        for (let c = 0; c < 3; c++) img[o + c] = clamp(f[k + c] * 1.12);
      }
  }
  const src = `/prints/marey/${id}.webp`;
  await ff(["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "pipe:0", "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", `public${src}`], img);
  out[id] = { W, H, src, left, span, cx: +cx.toFixed(1), dur: +(T1 - T0).toFixed(4), strobe: strobe.map((s) => +frac(s.t).toFixed(4)) };
  console.log(id, "marey", W, "x", H, strobe.length, "exposures");
}
writeFileSync(outFile, JSON.stringify(out, null, 1) + "\n");

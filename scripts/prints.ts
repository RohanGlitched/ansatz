// usage: tsx scripts/prints.ts [id ...]  renders public/prints/<id>.webp, the stroboscopic print of each showcase
// The same composite the browser draws (a darkened frame, the object's own pixels cut out by SAM's masks at each
// strobe instant), made once with ffmpeg so listing pages can show it at once instead of decoding the clip.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
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

/** One frame at time t, scaled to W×H, as raw RGB. */
const frame = (video: string, t: number, W: number, H: number) =>
  ff(["-v", "error", "-i", video, "-ss", String(Math.max(0, t + 0.002)), "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]);

const clamp = (v: number) => Math.max(0, Math.min(255, v));

const ids = process.argv.slice(2).length ? process.argv.slice(2) : JSON.parse(readFileSync("data/showcase/order.json", "utf8"));
mkdirSync("public/prints", { recursive: true });
for (const id of ids as string[]) {
  const e = JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;
  const video = `public${e.source.video}`;
  if (!existsSync(video)) {
    console.log(id, "no clip");
    continue;
  }
  const W = e.video.width, H = e.video.height;
  const strobe = e.strobe.filter((s) => s.rle);
  const base = await frame(video, strobe[0]?.t ?? 0, W, H);
  const img = Buffer.alloc(W * H * 3);
  // the plate: grayscale(0.9) brightness(0.38) contrast(1.08), as the browser draws it
  for (let i = 0; i < W * H; i++) {
    const r = base[i * 3], g = base[i * 3 + 1], b = base[i * 3 + 2];
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    for (let c = 0; c < 3; c++) {
      const v = (0.1 * base[i * 3 + c] + 0.9 * y) * 0.38;
      img[i * 3 + c] = clamp(((v / 255 - 0.5) * 1.08 + 0.5) * 255);
    }
  }
  for (const s of strobe) {
    const f = await frame(video, s.t, W, H);
    const [l, t, r, b] = s.box.map(Math.round) as [number, number, number, number];
    const x0 = Math.max(0, l), y0 = Math.max(0, t), bw = Math.max(1, Math.min(W, r) - x0), bh = Math.max(1, Math.min(H, b) - y0);
    const [mh, mw] = s.rle!.size;
    const mask = rleDecode(s.rle!.counts, mh, mw);
    for (let y = 0; y < bh; y++)
      for (let x = 0; x < bw; x++) {
        const mx = Math.min(mw - 1, Math.floor((x / bw) * mw)), my = Math.min(mh - 1, Math.floor((y / bh) * mh));
        if (!mask[my * mw + mx]) continue;
        const k = ((y0 + y) * W + x0 + x) * 3;
        for (let c = 0; c < 3; c++) img[k + c] = clamp(f[k + c] * 1.12);
      }
  }
  await ff(["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "pipe:0", "-frames:v", "1", "-c:v", "libwebp", "-quality", "82", `public/prints/${id}.webp`], img);
  console.log(id, "print", strobe.length, "masks");
}

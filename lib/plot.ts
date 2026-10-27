/**
 * A residual plot as a PNG, drawn pixel by pixel and encoded by the bundled ffmpeg: the referee sees the misses of
 * each leading law against time over the fitted frames, the way a physicist would look at them, not only as numbers.
 */
import { spawn } from "node:child_process";

async function ffmpegPath(): Promise<string> {
  const mod = (await import("ffmpeg-static")) as unknown as { default: string | null };
  const p = process.env.FFMPEG_PATH || mod.default;
  if (!p) throw new Error("ffmpeg is not available");
  return p;
}

function encodePng(rgb: Uint8Array, w: number, h: number): Promise<Uint8Array> {
  return ffmpegPath().then(
    (bin) =>
      new Promise((resolve, reject) => {
        const p = spawn(bin, ["-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${w}x${h}`, "-i", "pipe:0", "-frames:v", "1", "-f", "image2", "-c:v", "png", "pipe:1"], { windowsHide: true });
        const out: Buffer[] = [];
        p.stdout.on("data", (d) => out.push(d));
        p.on("close", (code) => (code === 0 ? resolve(new Uint8Array(Buffer.concat(out))) : reject(new Error("png encode failed"))));
        p.stdin.end(Buffer.from(rgb));
      }),
  );
}

const COLOURS: [number, number, number][] = [
  [45, 75, 255],
  [255, 90, 31],
  [31, 122, 77],
];

/** Residuals (law − measurement) against time for up to three laws, one panel, fitted frames only. */
export async function residualPlot(laws: { title: string; t: number[]; r: number[] }[], noise: number): Promise<Uint8Array> {
  const W = 600, H = 300, M = 24;
  const img = new Uint8Array(W * H * 3).fill(250);
  const all = laws.flatMap((l) => l.r.filter(Number.isFinite));
  const lim = Math.max(3 * noise, ...all.map(Math.abs)) * 1.1 || 1;
  const t0 = Math.min(...laws.flatMap((l) => l.t)), t1 = Math.max(...laws.flatMap((l) => l.t));
  const X = (t: number) => Math.round(M + ((t - t0) / Math.max(1e-9, t1 - t0)) * (W - 2 * M));
  const Y = (r: number) => Math.round(H / 2 - (r / lim) * (H / 2 - M));
  const dot = (x: number, y: number, c: [number, number, number], rad = 2) => {
    for (let dy = -rad; dy <= rad; dy++)
      for (let dx = -rad; dx <= rad; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H || dx * dx + dy * dy > rad * rad) continue;
        img.set(c, (yy * W + xx) * 3);
      }
  };
  // zero line and the ±noise band
  for (let x = M; x < W - M; x++) {
    img.set([120, 120, 120], (Y(0) * W + x) * 3);
    for (const y of [Y(noise), Y(-noise)]) if (x % 6 < 3) img.set([180, 180, 180], (y * W + x) * 3);
  }
  laws.slice(0, 3).forEach((l, k) => l.t.forEach((t, i) => Number.isFinite(l.r[i]) && dot(X(t), Y(l.r[i]), COLOURS[k])));
  return encodePng(img, W, H);
}

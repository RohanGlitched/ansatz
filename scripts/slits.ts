// usage: tsx scripts/slits.ts [id ...]  renders public/slits/<id>.webp: a slit-scan (photo-finish) of each showcase. One thin
// slice through the object per frame, laid side by side, so the motion draws its own graph against time in real pixels.
// Three kinds of slice, recorded as `axis` in data/slits.json:
//   y       motion up and down one line: a fixed 4-px column through it (cut and tiled by ffmpeg alone)
//   follow  a throw or a bounce that also moves sideways: a 4-px column that sits on SAM's x in each frame, so the
//           object's height draws against time
//   arc     a pendulum: a 4-px band bent along the bob's circle about the pivot, unrolled, so the swing angle draws
//           against time (up in the strip is a swing to the right)
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import ffmpeg from "ffmpeg-static";

const SLICE = 4;
const FF = ffmpeg as unknown as string;
mkdirSync("public/slits", { recursive: true });
const metaFile = "data/slits.json";
const meta: Record<string, unknown> = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
const ids = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync("data/showcase").filter((f) => f.endsWith(".json") && f !== "order.json").map((f) => f.replace(/\.json$/, ""));

// clips whose strip would mislead
// clips that can't make a readable strip, with the reason (none at present)
const SKIP: Record<string, string> = {};

type Px = { f: number; x: number; y: number };
type Pivot = { x: number; y: number; r: number };

/** Streams the clip's frames as raw RGB, one callback per frame. */
function eachFrame(file: string, W: number, H: number, cb: (rgb: Buffer, f: number) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(FF, ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);
    const size = W * H * 3;
    let buf: Buffer = Buffer.alloc(0), f = 0;
    p.stdout.on("data", (chunk: Buffer) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
      while (buf.length >= size) {
        cb(buf.subarray(0, size), f++);
        buf = buf.subarray(size);
      }
    });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(f) : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

/** Encodes a raw RGB image to webp. */
function writeWebp(rgb: Buffer, W: number, H: number, out: string) {
  execFileSync(FF, ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-i", "-", "-frames:v", "1", "-c:v", "libwebp", "-quality", "84", out], { input: rgb, maxBuffer: 1 << 26 });
}

function bilinear(rgb: Buffer, W: number, H: number, x: number, y: number, out: Buffer, o: number) {
  const x0 = Math.max(0, Math.min(W - 2, Math.floor(x))), y0 = Math.max(0, Math.min(H - 2, Math.floor(y)));
  const fx = Math.max(0, Math.min(1, x - x0)), fy = Math.max(0, Math.min(1, y - y0));
  for (let c = 0; c < 3; c++) {
    const a = rgb[(y0 * W + x0) * 3 + c], b = rgb[(y0 * W + x0 + 1) * 3 + c];
    const d = rgb[((y0 + 1) * W + x0) * 3 + c], e = rgb[((y0 + 1) * W + x0 + 1) * 3 + c];
    out[o + c] = Math.round((a * (1 - fx) + b * fx) * (1 - fy) + (d * (1 - fx) + e * fx) * fy);
  }
}

/** SAM's x at every frame: linear between tracked frames, held flat before the first and after the last. */
function xPerFrame(px: Px[], frames: number) {
  const s = [...px].sort((a, b) => a.f - b.f);
  return Array.from({ length: frames }, (_, f) => {
    if (f <= s[0].f) return s[0].x;
    if (f >= s.at(-1)!.f) return s.at(-1)!.x;
    let i = 1;
    while (s[i].f < f) i++;
    const a = s[i - 1], b = s[i];
    return a.x + ((b.x - a.x) * (f - a.f)) / (b.f - a.f);
  });
}

for (const id of ids) {
  if (SKIP[id]) {
    console.log(id, `skipped (${SKIP[id]})`);
    delete meta[id];
    continue;
  }
  const e = JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8"));
  const file = `public/showcase/${id}.mp4`;
  const px = e.measured.px as Px[];
  const pivot = e.measured.pivot as Pivot | undefined;
  if (!existsSync(file) || px.length < 8) {
    console.log(id, "skipped (no clip or too few tracked frames)");
    continue;
  }
  const xs = px.map((p) => p.x), ys = px.map((p) => p.y);
  const spreadX = Math.max(...xs) - Math.min(...xs), spreadY = Math.max(...ys) - Math.min(...ys);
  const frames: number = e.video.frames, W: number = e.video.width, H: number = e.video.height;
  const base = { slice: SLICE, frames, fps: e.video.fps, duration: e.video.duration };
  const out = `public/slits/${id}.webp`;

  // a pendulum whose bob stays on its fitted circle: unroll that circle
  const onCircle = pivot && px.every((p) => Math.abs(Math.hypot(p.x - pivot.x, p.y - pivot.y) - pivot.r) < 0.1 * pivot.r);
  if (pivot && onCircle && spreadX > 20) {
    const th = px.map((p) => Math.atan2(p.x - pivot.x, p.y - pivot.y));
    const step = 1 / pivot.r; // one strip row per pixel of arc
    const margin = 60 * step;
    const top = Math.max(...th) + margin, bottom = Math.min(...th) - margin;
    const rows = Math.round((top - bottom) / step);
    const img = Buffer.alloc(frames * SLICE * rows * 3);
    const OW = frames * SLICE;
    const n = await eachFrame(file, W, H, (rgb, f) => {
      if (f >= frames) return;
      for (let j = 0; j < rows; j++) {
        const t = top - j * step;
        // the slice's 4 columns are 4 radii straddling the bob's circle, as the y slice is 4 columns straddling a line
        for (let k = 0; k < SLICE; k++) {
          const r = pivot.r + k - (SLICE - 1) / 2;
          bilinear(rgb, W, H, pivot.x + r * Math.sin(t), pivot.y + r * Math.cos(t), img, (j * OW + f * SLICE + k) * 3);
        }
      }
    });
    writeWebp(img, OW, rows, out);
    meta[id] = { ...base, axis: "arc", x: Math.round(xs.reduce((s, v) => s + v, 0) / xs.length), height: rows, top, step };
    console.log(id, "arc slice r =", pivot.r.toFixed(0), "rows =", rows, n, "frames decoded");
    continue;
  }

  // motion along one vertical line: a fixed column through it
  if (spreadY > 20 && spreadX < 0.35 * spreadY) {
    const x = Math.round(xs.reduce((s, v) => s + v, 0) / xs.length - SLICE / 2);
    const scaleY = H < 400 ? 2 : 1;
    execFileSync(FF, ["-v", "error", "-y", "-i", file, "-vf", `crop=${SLICE}:${H}:${x}:0,tile=layout=${frames}x1,scale=iw:ih*${scaleY}:flags=lanczos`, "-frames:v", "1", "-c:v", "libwebp", "-quality", "84", out]);
    meta[id] = { ...base, x, height: H };
    console.log(id, "slice at x =", x, frames, "frames");
    continue;
  }

  // moving both ways: a column that rides along on SAM's x
  if (spreadY > 20) {
    const at = xPerFrame(px, frames);
    const OW = frames * SLICE;
    const img = Buffer.alloc(OW * H * 3);
    const n = await eachFrame(file, W, H, (rgb, f) => {
      if (f >= frames) return;
      const x0 = Math.max(0, Math.min(W - SLICE, Math.round(at[f] - SLICE / 2)));
      for (let y = 0; y < H; y++) rgb.copy(img, (y * OW + f * SLICE) * 3, (y * W + x0) * 3, (y * W + x0 + SLICE) * 3);
    });
    writeWebp(img, OW, H, out);
    meta[id] = { ...base, axis: "follow", x: Math.round(xs.reduce((s, v) => s + v, 0) / xs.length), height: H };
    console.log(id, "follow slice", frames, "frames,", n, "decoded");
    continue;
  }
  console.log(id, "skipped (no motion a slice can follow)");
}
writeFileSync(metaFile, JSON.stringify(meta, null, 1));

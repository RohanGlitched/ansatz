// usage: tsx scripts/slits.ts [id ...]  renders public/slits/<id>.webp: a slit-scan (photo-finish) of each showcase whose
// motion runs up and down one line. One thin vertical slice through the object per frame, laid side by side, so the
// motion draws its own graph against time in real pixels.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import ffmpeg from "ffmpeg-static";

const SLICE = 4;
mkdirSync("public/slits", { recursive: true });
const metaFile = "data/slits.json";
const meta: Record<string, unknown> = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, "utf8")) : {};
const ids = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync("data/showcase").filter((f) => f.endsWith(".json") && f !== "order.json").map((f) => f.replace(/\.json$/, ""));
for (const id of ids) {
  const e = JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8"));
  const px = e.measured.px as { x: number; y: number }[];
  const xs = px.map((p) => p.x), ys = px.map((p) => p.y);
  const spreadX = Math.max(...xs) - Math.min(...xs), spreadY = Math.max(...ys) - Math.min(...ys);
  // only motion along one vertical line makes a readable streak (a slice must stay on the object)
  if (!(spreadY > 20 && spreadX < 0.35 * spreadY) || !existsSync(`public/showcase/${id}.mp4`)) {
    console.log(id, "skipped (not up-and-down motion)");
    continue;
  }
  const x = Math.round(xs.reduce((s, v) => s + v, 0) / xs.length - SLICE / 2);
  const frames = e.video.frames, H = e.video.height;
  const scaleY = H < 400 ? 2 : 1;
  execFileSync(ffmpeg as unknown as string, ["-v", "error", "-y", "-i", `public/showcase/${id}.mp4`, "-vf", `crop=${SLICE}:${H}:${x}:0,tile=layout=${frames}x1,scale=iw:ih*${scaleY}:flags=lanczos`, "-frames:v", "1", "-c:v", "libwebp", "-quality", "84", `public/slits/${id}.webp`]);
  meta[id] = { slice: SLICE, x, frames, height: H, fps: e.video.fps, duration: e.video.duration };
  console.log(id, "slice at x =", x, frames, "frames");
}
writeFileSync(metaFile, JSON.stringify(meta, null, 1));

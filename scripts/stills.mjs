// usage: node scripts/stills.mjs [thumbs] [frame] [hero]   (no argument: all three)
// The still pictures that give pages a first paint before any script runs:
//   thumbs  public/slits/thumb/<id>.webp   a small copy of each photo-finish strip, painted behind the full one, so a
//                                           gallery card shows its strip before the lazy full-size image arrives
//   frame   public/how/moon-frame.webp     one frame of the Moon clip at the apex of jump 2 (the frame of a stored
//                                           SAM mask), for the pipeline band on /how
//   hero    public/hero-final.webp         the finished A/B Moon hero (both strips, connectors, badge), captured
//                                           from the running site with reduced motion (strips only). Needs the dev server
//                                           (BASE, default http://localhost:3900) and Playwright (PLAYWRIGHT=<path
//                                           to the playwright package> if it isn't installed here).
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import sharp from "sharp";
import ffmpegStatic from "ffmpeg-static";

const want = new Set(process.argv.slice(2));
const all = want.size === 0;
const require = createRequire(import.meta.url);

if (all || want.has("thumbs")) {
  mkdirSync("public/slits/thumb", { recursive: true });
  for (const f of readdirSync("public/slits").filter((f) => f.endsWith(".webp") && !f.endsWith("-still.webp"))) {
    const out = `public/slits/thumb/${f}`;
    await sharp(`public/slits/${f}`).resize({ width: 480, height: 120, fit: "fill" }).webp({ quality: 55 }).toFile(out);
    console.log("thumb", out);
  }
}

if (all || want.has("frame")) {
  const e = JSON.parse(readFileSync("data/showcase/moon-jump.json", "utf8"));
  // the apex of the measured jump: the stored mask nearest the highest helmet
  const top = e.measured.px.reduce((p, q) => (q.y < p.y ? q : p));
  const s = e.strobe.filter((x) => x.rle).reduce((p, q) => (Math.abs(q.f - top.f) < Math.abs(p.f - top.f) ? q : p));
  const W = e.video.codedWidth ?? e.video.width, H = e.video.height;
  mkdirSync("public/how", { recursive: true });
  const bin = process.env.FFMPEG_PATH || ffmpegStatic;
  await new Promise((res, rej) => {
    const p = spawn(bin, ["-v", "error", "-y", "-i", `public${e.source.video}`, "-ss", String(s.t + 0.002), "-frames:v", "1", "-vf", `scale=${W}:${H}`, "-c:v", "libwebp", "-quality", "80", "public/how/moon-frame.webp"], { windowsHide: true });
    p.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg " + c))));
  });
  console.log("frame", "public/how/moon-frame.webp", `t=${s.t.toFixed(3)} s, frame ${s.f}`);
}

if (all || want.has("hero")) {
  const { chromium } = require(process.env.PLAYWRIGHT || "playwright");
  const base = process.env.BASE || "http://localhost:3900";
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce", deviceScaleFactor: 2 });
  await p.goto(base + "/", { waitUntil: "networkidle", timeout: 90000 });
  await p.waitForTimeout(1200);
  // the two strips, their connectors, the badge and the shared clock: with reduced motion the scan shows its finished
  // state. The clips beside the strips and the captions are left out, so the still stays legible when small.
  const box = await p.locator("[class*=MoonHero_stack]").first().boundingBox();
  const png = await p.screenshot({ fullPage: true, clip: { x: box.x - 14, y: box.y - 6, width: box.width + 28, height: box.height + 12 } });
  await b.close();
  await sharp(png).resize({ width: 1600 }).webp({ quality: 82 }).toFile("public/hero-final.webp");
  const meta = await sharp("public/hero-final.webp").metadata();
  writeFileSync("components/hero-final.json", JSON.stringify({ width: meta.width, height: meta.height }) + "\n");
  console.log("hero", "public/hero-final.webp", meta.width, "x", meta.height);
}

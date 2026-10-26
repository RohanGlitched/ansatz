/**
 * Every clip is normalised before anything measures it: H.264 at most 1280 px wide, every original frame
 * kept with its original timestamp (no frame-rate conversion), audio split off as 16 kHz mono WAV for
 * Muse Voice Transcribe. iPhone HEVC .mov files become playable in any browser, and SAM gets fewer pixels
 * to segment. A second pass cuts the window where the motion happens, so SAM bills only those frames.
 */
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let ffmpegPath: string | null = null;
async function ffmpeg(): Promise<string> {
  if (ffmpegPath) return ffmpegPath;
  const mod = (await import("ffmpeg-static")) as unknown as { default: string | null };
  const p = process.env.FFMPEG_PATH || mod.default;
  if (!p) throw new Error("ffmpeg is not available on this server");
  ffmpegPath = p;
  return p;
}

function run(bin: string, args: string[], timeoutMs = 120_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, windowsHide: true }, (err, _out, errOut) => {
      if (err) reject(new Error(`ffmpeg: ${String(errOut || err.message).split("\n").filter(Boolean).slice(-3).join(" ")}`));
      else resolve(String(errOut));
    });
  });
}

export type Prepared = { video: Uint8Array; wav: Uint8Array | null; hadAudio: boolean };

/** Normalise a whole clip (≤ maxSeconds): H.264 ≤ 1280 wide, original frame timing, WAV narration. */
export async function prepare(input: Uint8Array, opts: { maxSeconds?: number; maxWidth?: number } = {}): Promise<Prepared> {
  const bin = await ffmpeg();
  const dir = await mkdtemp(path.join(tmpdir(), "ansatz-"));
  try {
    const src = path.join(dir, "in");
    const out = path.join(dir, "out.mp4");
    const wav = path.join(dir, "narration.wav");
    await writeFile(src, input);
    const W = opts.maxWidth ?? 1280;
    const args = [
      "-hide_banner", "-y", "-i", src,
      "-t", String(opts.maxSeconds ?? 60),
      "-map", "0:v:0", "-an",
      "-vf", `scale='if(gt(iw,ih),min(${W},iw),-2)':'if(gt(iw,ih),-2,min(${W},ih))'`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-fps_mode", "passthrough", "-movflags", "+faststart", out,
      "-map", "0:a:0?", "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", "-t", String(opts.maxSeconds ?? 60), wav,
    ];
    await run(bin, args, 180_000);
    const video = new Uint8Array(await readFile(out));
    let w: Uint8Array | null = null;
    try {
      const s = await stat(wav);
      if (s.size > 4000) w = new Uint8Array(await readFile(wav));
    } catch {
      w = null;
    }
    return { video, wav: w, hadAudio: !!w };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Cuts [t0, t1] (video seconds) out of a prepared clip, re-encoding so the cut is frame-exact. */
export async function cut(input: Uint8Array, t0: number, t1: number): Promise<Uint8Array> {
  const bin = await ffmpeg();
  const dir = await mkdtemp(path.join(tmpdir(), "ansatz-cut-"));
  try {
    const src = path.join(dir, "in.mp4");
    const out = path.join(dir, "cut.mp4");
    await writeFile(src, input);
    await run(bin, ["-hide_banner", "-y", "-ss", t0.toFixed(4), "-i", src, "-t", (t1 - t0).toFixed(4), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough", "-movflags", "+faststart", out]);
    return new Uint8Array(await readFile(out));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

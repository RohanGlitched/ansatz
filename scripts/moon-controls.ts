// Two controls for the jump-for-jump Moon test, made from the broadcast with ffmpeg so their truth is known exactly:
//   ramp      1.5× slow (motion-interpolated) through jump 1, real speed through jump 2, trimmed to the broadcast's length,
//             so neither the clip's duration nor a whole-clip frame count can give the answer: each jump has its own factor
//   realtime  real speed, re-encoded at 23.976 fps from a different trim: a false-positive control (expect 1.0 and 1.0)
// usage: tsx scripts/moon-controls.ts            builds the clips (no model calls)
//        tsx scripts/moon-controls.ts --track    also tracks each clip once with SAM 3.1 (about $0.04 each), unless its
//                                                track is already in data/sam
// Then tsx scripts/samejump.ts measures them against the broadcast.
import "./env";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ffmpegPath from "ffmpeg-static";
import { readVideoInfo } from "../lib/video";

const SRC = "public/showcase/moon-jump.mp4";
const DIR = "data/sam/controls";
// broadcast: jump 1 airborne 2.03-3.17 s, jump 2 4.97-6.17 s (from the SAM track; scripts/samejump.ts finds them again)
export const CONTROLS = {
  ramp: {
    file: `${DIR}/moon-jump-ramp.mp4`,
    // [0, 1.6) real, [1.6, 3.7) slowed 1.5× (2.1 s becomes 3.15 s), [3.7, 6.95) real: 1.6 + 3.15 + 3.25 = 8.0 s, the broadcast's length
    filter: "[0:v]trim=0:1.6,setpts=PTS-STARTPTS,fps=30000/1001[a];[0:v]trim=1.6:3.7,setpts=1.5*(PTS-STARTPTS),minterpolate=fps=30000/1001[b];[0:v]trim=3.7:6.95,setpts=PTS-STARTPTS,fps=30000/1001[c];[a][b][c]concat=n=3:v=1:a=0,crop=346:236:3:2,setsar=200/219[out]",
    truth: [1.5, 1.0],
    note: "1.5× slow (motion-interpolated to 29.97 fps) from 1.6 to 3.7 s of the broadcast, which holds jump 1; real speed before and after, through jump 2; the end trimmed so the copy lasts 8.0 s like the broadcast; cropped 3 px so SAM tracks fresh pixels",
  },
  realtime: {
    file: `${DIR}/moon-jump-23976.mp4`,
    // a different trim (0.43 to 7.6 s) and a different clock (23.976 fps, so every frame time differs from the broadcast's)
    filter: "[0:v]trim=0.43:7.6,setpts=PTS-STARTPTS,fps=24000/1001,crop=348:238:1:1,setsar=200/219[out]",
    truth: [1.0, 1.0],
    note: "real speed, trimmed to 0.43-7.6 s of the broadcast and re-encoded at 23.976 fps (frames dropped, never interpolated); cropped 1 px",
  },
} as const;

function build(name: keyof typeof CONTROLS) {
  const c = CONTROLS[name];
  if (existsSync(c.file)) return;
  mkdirSync(DIR, { recursive: true });
  execFileSync(ffmpegPath as unknown as string, ["-hide_banner", "-loglevel", "error", "-y", "-i", SRC, "-filter_complex", c.filter, "-map", "[out]", "-an", "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-threads", "1", "-movflags", "+faststart", c.file]);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/moon-controls.ts")) {
  for (const name of Object.keys(CONTROLS) as (keyof typeof CONTROLS)[]) {
    build(name);
    const vi = readVideoInfo(readFileSync(CONTROLS[name].file));
    console.log(name, `${vi.times.length} frames, ${vi.duration.toFixed(2)} s at ${vi.fps.toFixed(3)} fps, ${vi.width}×${vi.height}`);
  }
  if (process.argv.includes("--track")) {
    const { Ledger, uploadFile, deleteFile } = await import("../lib/meta/client");
    const { trackNoun } = await import("../lib/meta/sam");
    // the raw stream is also dumped as it arrives, so a crash after the call never costs a second one
    process.env.SAM_DUMP_DIR = ".probe/sam-controls";
    const ledger = new Ledger();
    for (const name of Object.keys(CONTROLS) as (keyof typeof CONTROLS)[]) {
      const out = `data/sam/astronaut-${name}.txt`;
      if (existsSync(out)) { console.log(name, "already tracked:", out); continue; }
      const b = readFileSync(CONTROLS[name].file);
      const frames = readVideoInfo(b).times.length;
      const id = await uploadFile(b, CONTROLS[name].file.split("/").pop()!, "video/mp4");
      const r = await trackNoun(id, "astronaut", ledger, frames);
      await deleteFile(id);
      writeFileSync(out, r.raw);
      console.log(name, "frames", r.frames, "tracks", r.tracks.map((t) => [t.id, t.samples.length]), "usd so far", ledger.usd.toFixed(4));
    }
    console.log("SAM spend this run", ledger.usd.toFixed(4), JSON.stringify(ledger.calls.map((c) => ({ purpose: c.purpose, frames: c.frames, usd: c.usd }))));
  }
}

// The Moon plate on the home page: the astronaut's helmet height in every frame of both clips (the broadcast and the
// copy slowed in secret), from SAM 3.1's stored masks. No model calls.
// npx tsx --conditions=react-server scripts/moon-traces.ts -> public/book/moon-traces.json
import { readFileSync, writeFileSync } from "node:fs";
import { parseSam } from "../lib/meta/sam";
const clip = (name: string, fps: number) => {
  const r = parseSam(readFileSync(`data/sam/astronaut-${name}.txt`, "utf8"), "astronaut", false);
  // the astronaut is the larger of the two tracked objects
  const area = (t: (typeof r.tracks)[number]) => t.samples.reduce((s, x) => s + (x.box[2] - x.box[0]) * (x.box[3] - x.box[1]), 0);
  const t = [...r.tracks].sort((a, b) => area(b) - area(a))[0];
  const top = new Map(t.samples.map((s) => [s.f, s.box[1]]));
  const ys = Array.from({ length: r.frames }, (_, f) => top.get(f) ?? null);
  return { width: r.width, height: r.height, frames: r.frames, fps, helmetTop: ys.map((v) => (v === null ? null : Math.round(v * 10) / 10)) };
};
const out = { broadcast: clip("broadcast", 30000 / 1001), slowed: clip("slowed", 30000 / 1001) };
writeFileSync("public/book/moon-traces.json", JSON.stringify(out));
console.log(out.broadcast.frames, out.slowed.frames, (out.broadcast.frames / out.broadcast.fps).toFixed(2), (out.slowed.frames / out.slowed.fps).toFixed(2));

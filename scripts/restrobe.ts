// Recomputes a showcase experiment's strobe frames from a saved SAM dump (no model calls).
// usage: tsx scripts/restrobe.ts <showcase-id> <sam-dump.txt> <video.mp4> [trackId]
import { readFileSync, writeFileSync } from "node:fs";
import { parseSam } from "../lib/meta/sam";
import { pickStrobe } from "../lib/experiment";
import { readVideoInfo } from "../lib/video";
const [id, dump, video, trackId] = process.argv.slice(2);
const f = `data/showcase/${id}.json`;
const e = JSON.parse(readFileSync(f, "utf8"));
const r = parseSam(readFileSync(dump, "utf8"), e.tracking.noun);
const tr = trackId ? r.tracks.find((t) => t.id === trackId)! : r.tracks.sort((a, b) => b.samples.length - a.samples.length)[0];
const vi = readVideoInfo(readFileSync(video));
e.strobe = pickStrobe(tr.samples, e.measured.window.f0, e.measured.window.f1, vi.times);
writeFileSync(f, JSON.stringify(e));
console.log(id, "strobe frames:", e.strobe.length, e.strobe.map((s: { f: number }) => s.f).join(","));

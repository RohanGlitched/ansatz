// usage: tsx --conditions=react-server scripts/speed-repeats.ts [n=5]
// The one-clip speed question asked n times per clip, so "Muse Spark called the broadcast slowed" is a rate, not one
// answer. Same prompt as scripts/speed-test.ts (it names no world, only the ruler). Results: extras.speedTest.repeats.
import "./env";
import { readFileSync, writeFileSync } from "node:fs";
import { Ledger, respondJson, uploadFile } from "../lib/meta/client";
import { videoPart } from "../lib/scientist";
import { readVideoInfo } from "../lib/video";

const n = Number(process.argv[2] ?? 5);
const ledger = new Ledger();
const ruler = "For scale, the jumping astronaut (John Young in his suit) is about 1.88 m tall.";
const clips = [
  { label: "A", file: "public/showcase/moon-jump.mp4", truth: "real speed" },
  { label: "B", file: "public/showcase/moon-jump-slowed.mp4", truth: "slowed 1.5×" },
];
type Ans = { playback_accel: number; real_speed: boolean; factor: number };
const out: Record<string, Ans[]> = {};
for (const c of clips) {
  const b = readFileSync(c.file), vi = readVideoInfo(b);
  const part = videoPart(await uploadFile(b, `${c.label}.mp4`, "video/mp4"), vi.fps, vi.duration).part;
  out[c.label] = [];
  for (let i = 0; i < n; i++) {
    const { value } = await respondJson<Ans & { reasoning: string }>(
      {
        model: "muse-spark-1.3",
        effort: "medium",
        input: [{ role: "user", content: [part, { type: "input_text", text: `${ruler} Watch the jump. (1) As the video plays, what downward acceleration does the astronaut's fall show, in metres per second squared of playback time? (2) Does this clip play at real speed? If not, by what factor is it slowed or sped up?` }] }],
        name: "speed",
        schema: { type: "object", additionalProperties: false, required: ["playback_accel", "real_speed", "factor", "reasoning"], properties: { playback_accel: { type: "number" }, real_speed: { type: "boolean" }, factor: { type: "number", description: "1 for real speed; 2 if it plays twice as slow" }, reasoning: { type: "string" } } },
        maxOutput: 6000,
      },
      ledger,
      `by eye, clip ${c.label} alone, repeat ${i + 1}`,
    );
    out[c.label].push({ playback_accel: value.playback_accel, real_speed: value.real_speed, factor: value.factor });
    console.log(c.label, i + 1, value.playback_accel, value.real_speed, value.factor, `$${ledger.usd.toFixed(3)}`);
  }
}
const f = "data/showcase/moon-jump.json";
const e = JSON.parse(readFileSync(f, "utf8"));
e.extras.speedTest.repeats = {
  n,
  note: `The one-clip question asked ${n} times per clip with the same prompt (it names no world, only the ruler).`,
  clips: clips.map((c) => ({ clip: c.label, truth: c.truth, answers: out[c.label], calledSlowed: out[c.label].filter((a) => !a.real_speed).length })),
  usd: +ledger.usd.toFixed(3),
};
writeFileSync(f, JSON.stringify(e, null, 1));
console.log(JSON.stringify(e.extras.speedTest.repeats.clips.map((c: { clip: string; calledSlowed: number }) => [c.clip, c.calledSlowed])), "usd", ledger.usd.toFixed(3));

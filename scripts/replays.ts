// Keeps data/replays/*.json down to what a run recorded that no record holds: each step's start and end time and SAM
// 3.1's points as they streamed (plus the observer's own noun when a typed one replaced it). Every line of text is
// filled in from the showcase record when /new is drawn (data/replays/derive.ts).
// Also rebuilds the hardening-spring replay from its stored record: model-call times from its ledger, SAM's points
// from its measured pixels, the remaining step times estimated so the whole adds up to the recorded run time.
// usage: tsx scripts/replays.ts
import { readFileSync, writeFileSync } from "node:fs";
import type { Experiment } from "../lib/experiment";
import type { StoredReplay } from "../data/replays/derive";

type Old = Omit<StoredReplay, "events"> & { events: { step: string; state: string; at: number; detail?: string; data?: unknown }[] };

const RECORD: Record<string, string> = { "moon-jump": "moon-jump", "sample-pendulum": "sample-pendulum" };

for (const f of ["moon-jump", "pendulum"]) {
  const p = `data/replays/${f}.json`;
  const r = JSON.parse(readFileSync(p, "utf8")) as Old;
  // the observer's own noun, from the run's log line ("jumping: tracking “white backpack”")
  const said = /tracking “([^”]+)”/.exec(r.events.find((e) => e.step === "observe" && e.state === "done")?.detail ?? "")?.[1];
  const out: StoredReplay = {
    id: r.id,
    record: r.record ?? RECORD[r.id],
    label: r.label,
    clip: r.clip,
    recorded: r.recorded,
    cut: r.cut,
    observerNoun: r.observerNoun ?? said,
    events: r.events.map((e) => (e.state === "update" ? { step: e.step, state: e.state, at: e.at, data: e.data } : { step: e.step, state: e.state, at: e.at })),
  };
  writeFileSync(p, JSON.stringify(out));
  console.log("stripped", p, out.events.length, "events, observer said", out.observerNoun);
}

// the hardening spring: rebuilt from its record
{
  const e = JSON.parse(readFileSync("data/showcase/hardening-spring.json", "utf8")) as Experiment;
  const ms = (re: RegExp) => e.ledger.calls.filter((c) => re.test(c.purpose)).reduce((s, c) => s + c.ms, 0);
  const observe = ms(/^observe/), point = ms(/^point at/), propose = ms(/^propose/), referee = ms(/^referee/), wonder = ms(/^theorist/);
  // estimates for what the ledger doesn't time: reading and storing the clip, each SAM 3.1 call (420 frames at
  // 1280×720), fitting six laws, and the fits Muse Wonder's tool ran for it; scaled so the steps add up to e.ledger.ms
  const UPLOAD = 5200, SAM = 14000, SAM_FIRST = 2500, MEASURE = 40, REPORT = 600;
  const track = SAM + point + SAM; // the ruler by name (not found), Muse Spark points at it, SAM follows the box
  const left = e.ledger.ms - (UPLOAD + observe + track + MEASURE + propose + referee + wonder + REPORT);
  const fit = Math.round(left * 0.32), toolFits = left - fit;
  const t = { upload: UPLOAD, observe: UPLOAD + observe };
  const trackEnd = t.observe + track;
  const hypEnd = trackEnd + MEASURE + propose;
  const fitEnd = hypEnd + fit;
  const refEnd = fitEnd + referee + wonder + toolFits;
  const events: StoredReplay["events"] = [
    { step: "upload", state: "start", at: 0 },
    { step: "upload", state: "done", at: t.upload },
    { step: "listen", state: "done", at: t.upload },
    { step: "observe", state: "start", at: t.upload },
    { step: "observe", state: "done", at: t.observe },
    { step: "track", state: "start", at: t.observe },
  ];
  // SAM's points as they would stream: the measured centroids, a few times a second over the subject's SAM call
  const px = e.measured.px;
  const s0 = t.observe + SAM_FIRST, s1 = t.observe + SAM;
  const BATCH = 550;
  let buf: [number, number, number][] = [], next = s0;
  px.forEach((p, i) => {
    const at = s0 + ((s1 - s0) * i) / Math.max(1, px.length - 1);
    buf.push([p.f, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
    if (at >= next || i === px.length - 1) {
      events.push({ step: "track", state: "update", at: Math.round(at), data: { width: e.video.width, height: e.video.height, frames: e.video.frames, pts: buf } });
      buf = [];
      next = at + BATCH;
    }
  });
  events.push(
    { step: "track", state: "done", at: trackEnd },
    { step: "measure", state: "start", at: trackEnd },
    { step: "measure", state: "done", at: trackEnd + MEASURE },
    { step: "hypothesise", state: "start", at: trackEnd + MEASURE },
    { step: "hypothesise", state: "done", at: hypEnd },
    { step: "fit", state: "start", at: hypEnd },
    { step: "fit", state: "done", at: fitEnd },
    { step: "referee", state: "start", at: fitEnd },
    { step: "referee", state: "done", at: refEnd },
    { step: "report", state: "start", at: refEnd },
    { step: "report", state: "done", at: e.ledger.ms },
  );
  const line = e.measured.line;
  const out: StoredReplay = {
    id: "hardening-spring",
    record: "hardening-spring",
    label: "the hardening spring",
    clip: "/showcase/hardening-spring.mp4",
    recorded: new Date(e.createdAt).toUTCString().slice(5, 16).replace(/^0/, ""),
    // the block moves straight up and down: cut every frame at the same column
    cut: line && Math.abs(line.uy) > 0.95 ? { axis: "y", x: Math.round(line.x0) } : { axis: "follow" },
    observerNoun: e.observation.subjects[0]?.noun_phrase,
    rebuilt: `Rebuilt from the stored record: the model calls’ times come from its ledger and the points are SAM 3.1’s measurements; the other step times are estimates that add up to the run’s recorded ${Math.round(e.ledger.ms / 1000)} s.`,
    events,
  };
  writeFileSync("data/replays/hardening-spring.json", JSON.stringify(out));
  console.log("built data/replays/hardening-spring.json", events.length, "events; fit", fit, "ms, tool fits", toolFits, "ms");
}

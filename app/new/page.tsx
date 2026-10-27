import type { Metadata } from "next";
import { getClass } from "@/lib/classes";
import { getSeries } from "@/lib/series";
import NewExperiment, { type Replay, type Sample } from "@/components/NewExperiment";
import pendulumReplay from "@/data/replays/pendulum.json";
import moonReplay from "@/data/replays/moon-jump.json";
import { costText, headline, timeText } from "@/lib/headline";

export const metadata: Metadata = { title: "Run an experiment" };

const SAMPLES: Sample[] = [
  { file: "/samples/pendulum.mp4", label: "A pendulum: is it real time?", hint: "MikeRun, Wikimedia Commons, CC BY-SA 4.0", noun: "yellow tennis ball" },
  { file: "/samples/paper-bag.mp4", label: "A paper bag, thrown", hint: "air drag, filmed at 20× slow motion", noun: "white paper bag", slowMotion: 20 },
];

// /new?replay=moon-jump (or pendulum) opens on that recorded run, playing: a link a judge can follow, with no model called
const REPLAY_ALIASES: Record<string, string> = { moon: "moon-jump", "moon-jump": "moon-jump", pendulum: "sample-pendulum", "sample-pendulum": "sample-pendulum" };

export default async function NewPage({ searchParams }: { searchParams: Promise<{ class?: string; series?: string; replay?: string }> }) {
  const sp = await searchParams;
  const autoReplay = sp.replay ? REPLAY_ALIASES[sp.replay.toLowerCase()] : undefined;
  const code = sp.class?.toLowerCase();
  const ser = sp.series ? await getSeries(sp.series).catch(() => null) : null;
  const cls = code ? await getClass(code).catch(() => null) : null;
  const hl = await headline();
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(32px, 5vw, 64px)" }}>
      <h1 style={{ fontSize: "clamp(30px, 4vw, 46px)", maxWidth: "20ch" }}>Run an experiment</h1>
      <p className="lede" style={{ marginTop: 14, marginBottom: 32 }}>
        Film something move with the phone held still: a drop, a throw, a swing, a bounce, a roll. Ansatz measures it frame by frame, proposes laws of motion, and keeps the one that predicts the part of your clip it never saw.
      </p>
      {cls && (
        <p className="small" style={{ marginBottom: 20 }}>
          Running for <strong>{cls.name}</strong>: {Math.max(0, cls.quota - cls.used)} of the class’s {cls.quota} runs left. Results appear on the <a href={`/class/${cls.code}`}>class page</a>.
        </p>
      )}
      {ser && (
        <p className="small" style={{ marginBottom: 20 }}>
          Adding to <strong>{ser.title}</strong>: {ser.ids.length} length{ser.ids.length === 1 ? "" : "s"} so far. Film the same pendulum at a new string length, with the same paper sheet on the wall; the <a href={`/series/${ser.id}`}>series page</a> fits them together.
        </p>
      )}
      <NewExperiment samples={SAMPLES} replays={[moonReplay as Replay, pendulumReplay as Replay]} classCode={cls?.code} seriesId={ser?.id} autoReplay={autoReplay} runNote={`Published runs took ${timeText(hl)}, longer when Muse Wonder steps in, and cost ${costText(hl)}, which we pay.`} />
    </div>
  );
}

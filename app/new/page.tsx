import type { Metadata } from "next";
import { getClass } from "@/lib/classes";
import NewExperiment, { type Replay, type Sample } from "@/components/NewExperiment";
import pendulumReplay from "@/data/replays/pendulum.json";
import moonReplay from "@/data/replays/moon-jump.json";

export const metadata: Metadata = { title: "Run an experiment" };

const SAMPLES: Sample[] = [
  { file: "/samples/pendulum.mp4", label: "A pendulum: is it real time?", hint: "MikeRun, Wikimedia Commons, CC BY-SA 4.0", noun: "yellow tennis ball" },
  { file: "/samples/paper-bag.mp4", label: "A paper bag, thrown", hint: "air drag, filmed at 20× slow motion", noun: "white paper bag", slowMotion: 20 },
];

export default async function NewPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const code = (await searchParams).class?.toLowerCase();
  const cls = code ? await getClass(code).catch(() => null) : null;
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
      <NewExperiment samples={SAMPLES} replays={[moonReplay as Replay, pendulumReplay as Replay]} classCode={cls?.code} />
    </div>
  );
}

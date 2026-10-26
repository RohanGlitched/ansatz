import type { Metadata } from "next";
import NewExperiment, { type Replay, type Sample } from "@/components/NewExperiment";
import pendulumReplay from "@/data/replays/pendulum.json";

export const metadata: Metadata = { title: "Run an experiment" };

const SAMPLES: Sample[] = [
  { file: "/samples/pendulum.mp4", label: "A pendulum", hint: "tennis ball on a string, 8 s. Is it real time? Ansatz checks", noun: "yellow tennis ball" },
  { file: "/samples/paper-bag.mp4", label: "A paper bag, thrown", hint: "air drag, filmed at 20× slow motion", noun: "white paper bag", slowMotion: 20 },
];

export default function NewPage() {
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(32px, 5vw, 64px)" }}>
      <h1 style={{ fontSize: "clamp(30px, 4vw, 46px)", maxWidth: "20ch" }}>Run an experiment</h1>
      <p className="lede" style={{ marginTop: 14, marginBottom: 32 }}>
        Film something move with the phone held still: a drop, a throw, a swing, a bounce, a roll. Ansatz measures it frame by frame, proposes laws of motion, and keeps the one that predicts the part of your clip it never saw.
      </p>
      <NewExperiment samples={SAMPLES} replay={pendulumReplay as Replay} />
    </div>
  );
}

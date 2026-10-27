import type { Metadata } from "next";
import { getClass, JUDGES_CODE } from "@/lib/classes";
import { getSeries } from "@/lib/series";
import { getExperiment } from "@/lib/experiments";
import NewExperiment, { type Sample } from "@/components/NewExperiment";
import { buildReplay, type Replay, type StoredReplay } from "@/data/replays/derive";
import springReplay from "@/data/replays/hardening-spring.json";
import moonReplay from "@/data/replays/moon-jump.json";
import pendulumReplay from "@/data/replays/pendulum.json";
import observerBench from "@/data/bench/observer.json";
import liteBench from "@/data/bench/lite.json";
import { costText, headline, timeText } from "@/lib/headline";

export const metadata: Metadata = {
  title: "Run an experiment",
  description: "Upload a clip of something that falls, swings, bounces or rolls, say what you know, and get its law of motion with every constant measured. Or watch a recorded run, which calls no model.",
  alternates: { canonical: "/new" },
};

const SAMPLES: Sample[] = [
  { file: "/samples/pendulum.mp4", label: "A pendulum: is it real time?", hint: "MikeRun, Wikimedia Commons, CC BY-SA 4.0", noun: "yellow tennis ball", type: "pendulum" },
  // (a paper-bag sample was removed: its source and licence could not be verified)
];

// the first replay is the race someone visibly wins (Muse Wonder's law on the hardening spring); the Moon is second
const STORED = [springReplay, moonReplay, pendulumReplay] as StoredReplay[];

// /new?replay=hardening-spring (or moon-jump, pendulum) opens on that recorded run, playing: a link a judge can
// follow, with no model called
const REPLAY_ALIASES: Record<string, string> = { "hardening-spring": "hardening-spring", hardening: "hardening-spring", moon: "moon-jump", "moon-jump": "moon-jump", pendulum: "sample-pendulum", "sample-pendulum": "sample-pendulum" };

/** rupees per US dollar, for the costs on this page */
const INR = 84;
const rs = (usd: number) => `₹${Math.max(1, Math.round(usd * INR)).toLocaleString("en-IN")}`;

export default async function NewPage({ searchParams }: { searchParams: Promise<{ class?: string; series?: string; replay?: string; k?: string }> }) {
  const sp = await searchParams;
  const autoReplay = sp.replay ? REPLAY_ALIASES[sp.replay.toLowerCase()] : undefined;
  const code = sp.class?.toLowerCase();
  const ser = sp.series ? await getSeries(sp.series).catch(() => null) : null;
  const cls = code ? await getClass(code).catch(() => null) : null;
  const hl = await headline();
  // each replay's words and numbers come from its showcase record as it stands today
  const replays = (await Promise.all(STORED.map(async (s) => {
    const e = await getExperiment(s.record).catch(() => null);
    return e ? buildReplay(s, e) : null;
  }))).filter((r): r is Replay => r !== null);

  // lite mode's cost and where its defaults fail, from the benchmarks
  const lite = liteBench.summary;
  const ob = observerBench.summary;
  const by = Object.entries(ob.naiveWouldFailBy as Record<string, number>);
  const worlds = by.filter(([k]) => /world/.test(k)).reduce((s, [, n]) => s + n, 0);
  const slowed = by.filter(([k]) => /slow/.test(k)).reduce((s, [, n]) => s + n, 0);
  const liteNote =
    `About ${Math.round(lite.medianSamUsd * 100)} cents (${rs(lite.medianSamUsd)}) a run for SAM 3.1 alone, the median over ${lite.clips} benchmark clips run this way, or ${rs(lite.medianSamUsd * 40)} for a class of 40. ` +
    `It assumes Earth, real time and the whole clip, so it goes wrong where only Muse Spark’s observer knows better: on ${ob.naiveWouldFail} of the ${ob.runs} clips in our observer test, ${worlds} on the Moon or Mars (every one) and ${slowed} in undeclared slow motion.`;
  // class links start in lite mode; the judges' class link shows the full run, Meta's models included
  const liteDefault = !!cls && cls.code !== JUDGES_CODE;

  return (
    <div className="wrap" style={{ paddingBlock: "clamp(32px, 5vw, 64px)" }}>
      <NewExperiment
        title="Run an experiment"
        lede="Film something move with the phone held still: a drop, a throw, a swing, a bounce, a roll. Ansatz measures it frame by frame, proposes laws of motion, and keeps the one that predicts the part of your clip it never saw."
        notes={
          <>
            {cls && (
              <p className="small" style={{ marginBottom: 20 }}>
                Running for <strong>{cls.name}</strong>: {Math.max(0, cls.quota - cls.used)} of the class’s {cls.quota} runs left. Results appear on the <a href={`/class/${cls.code}`}>class page</a>.
              </p>
            )}
            {cls?.code === JUDGES_CODE && !sp.k && (
              <p className="small" style={{ marginBottom: 20, color: "var(--warn)" }}>
                This lane needs the key in its link (the full judges’ link ends in &amp;k=…). Without it, run your clip in the visitors’ lane on <a href="/new">Run an experiment</a>, or <a href="/new?replay=hardening-spring">watch a recorded run</a>.
              </p>
            )}
            {ser && (
              <p className="small" style={{ marginBottom: 20 }}>
                Adding to <strong>{ser.title}</strong>: {ser.ids.length} length{ser.ids.length === 1 ? "" : "s"} so far. Film the same pendulum at a new string length, with the same paper sheet on the wall; the <a href={`/series/${ser.id}`}>series page</a> fits them together.
              </p>
            )}
          </>
        }
        samples={SAMPLES}
        replays={replays}
        classCode={cls?.code}
        seriesId={ser?.id}
        autoReplay={autoReplay}
        liteDefault={liteDefault}
        liteNote={liteNote}
        runNote={`Published runs took ${timeText(hl)}, longer when Muse Wonder steps in, and cost ${costText(hl)}, about ${rs(hl.usd.median)} (${rs(hl.usd.min)} to ${rs(hl.usd.max)}), which we pay.`}
      />
    </div>
  );
}

/**
 * A replay on /new is a stored run's timings and SAM 3.1's streamed points (data/replays/<id>.json), with every
 * line of text and every number filled in here from the current showcase record (data/showcase/<record>.json). So
 * a replay can't drift from the page it links to: when a record is re-derived, its replay says the same thing.
 */
import type { Experiment } from "../../lib/experiment";
import type { Law } from "../../lib/physics/law";
import { lawLatex } from "../../lib/latex";
import { toPixels } from "../../lib/pixels";
import { noiseScore, readoutOf, type Readout } from "../../components/liveStripMath";

/** What is stored: when each step started and ended, and SAM's points as they streamed. No text. */
export type StoredReplay = {
  id: string;
  /** the showcase record the text and numbers come from */
  record: string;
  label: string;
  clip: string;
  recorded: string;
  cut?: { axis: "y" | "follow"; x?: number };
  /** the observer's own name for the moving thing in that run, before the noun typed with the clip replaced it */
  observerNoun?: string;
  /** set when the step times were rebuilt from the record's ledger rather than logged live */
  rebuilt?: string;
  events: { step: string; state: string; at: number; data?: unknown }[];
};

export type ReplayEvent = { step: string; state: string; detail?: string; at: number; data?: unknown };
export type Replay = { id: string; label: string; clip: string; recorded: string; events: ReplayEvent[]; cut?: StoredReplay["cut"]; rebuilt?: string; readout: Readout; record: string };

type Cand = Experiment["candidates"][number];

/** at most this many points go to the page, as a live run sends (lib/experiment.ts thins to 160) */
const MAX_PTS = 160;

function fmtErr(v: number, e: Experiment, angle: boolean) {
  if (!Number.isFinite(v)) return "—";
  if (angle) return `${((v * 180) / Math.PI).toFixed(2)}°`;
  if (e.measured.calibration.kind === "none") return `${v.toFixed(1)} px`;
  return v < 0.01 ? `${(v * 1000).toFixed(1)} mm` : `${(v * 100).toFixed(1)} cm`;
}

function safeLatex(l: Law) {
  try {
    return lawLatex(l);
  } catch {
    return [];
  }
}

const worldOf = (b: string) => (b === "moon" ? "the Moon" : b === "mars" ? "Mars" : b === "earth" ? "Earth" : b);

/** The run's own frame clock: which tracked frame each full-clip frame became when the run cut the motion window. */
function trackClock(e: Experiment, framesSent: number) {
  const dur = e.video.duration;
  const w = e.observation.window;
  const w0 = Math.max(0, Math.min(w.start_s, dur) - 0.4);
  const w1 = Math.min(dur, (w.end_s > w.start_s ? w.end_s : dur) + 0.4);
  const cut = framesSent < e.video.frames;
  const every = cut ? Math.max(1, Math.round(((w1 - w0) * e.video.fps) / framesSent)) : 1;
  const j0 = cut ? Math.max(0, Math.ceil(w0 * e.video.fps - 1e-3)) : 0;
  return { cut, w0, w1, k: (f: number) => Math.round((f - j0) / every) };
}

export function buildReplay(s: StoredReplay, e: Experiment): Replay {
  const angle = !e.measured.series.ch.x && !!e.measured.series.ch.theta;
  const framesSent = (s.events.find((x) => x.step === "track" && x.state === "update")?.data as { frames?: number } | undefined)?.frames ?? e.video.frames;
  const clk = trackClock(e, framesSent);
  const px = e.measured.px;
  const thin = Math.max(1, Math.ceil(px.length / MAX_PTS));
  const keep = <T,>(a: T[]) => a.filter((_, i) => i % thin === 0);
  const toBoard = (cs: Cand[]) =>
    cs.map((c, i) => ({
      id: c.law.id,
      title: c.law.title,
      origin: c.origin,
      rank: i + 1,
      miss: fmtErr(c.fit.testRms, e, angle),
      rel: c.fit.testRms,
      // the ranking's score in noise units, so the race can say how far apart two laws are
      z: noiseScore(c.fit),
      latex: safeLatex(c.law),
      path: keep(toPixels(c.fit.predicted, e.measured)).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]),
    }));
  const ranked = [...e.candidates].sort((a, b) => a.rank - b.rank);
  // the board as the fit step left it: Muse Wonder's law joins only after the referee step
  const beforeWonder = ranked.filter((c) => c.origin !== "revision");
  const revised = ranked.length !== beforeWonder.length;
  const obs = e.observation;
  const ref = obs.reference;
  const typed = obs.subjects[0]?.description === "given with the clip";
  const observerNoun = s.observerNoun ?? obs.subjects[0]?.noun_phrase ?? e.tracking.noun;
  const pointed = e.ledger.calls.find((c) => /^point at "/.test(c.purpose));
  const muse = ranked.filter((c) => c.origin === "muse");
  const T = e.measured.series.t[e.measured.series.t.length - 1] ?? 0;
  const fps = e.video.fps;

  const detail = (step: string): { detail?: string; data?: unknown } => {
    switch (step) {
      case "upload":
        return { detail: `${e.video.frames} frames at ${fps.toFixed(Math.abs(fps - Math.round(fps)) > 0.01 ? 2 : 0)} fps (${e.video.codec}, ${e.video.width}×${e.video.height}), clock read from the file` };
      case "listen":
        return { detail: e.narration?.transcript ? `“${e.narration.transcript.slice(0, 120)}${e.narration.transcript.length > 120 ? "…" : ""}”` : "the clip has no sound" };
      case "observe":
        return {
          detail: `${obs.phenomenon}, on ${worldOf(obs.body)}${ref.present ? `; ruler “${ref.noun_phrase}” (${ref.real_length_m} m, ${ref.basis})` : ""}${obs.slow_motion.factor > 1 ? `; slowed ${obs.slow_motion.factor}×` : ""}\nobserver: “${observerNoun}” → SAM prompt “${e.tracking.noun}”${typed && observerNoun !== e.tracking.noun ? " (typed with the clip)" : ""}`,
          data: obs,
        };
      case "track":
        return {
          detail: `${e.tracking.tracks} object${e.tracking.tracks > 1 ? "s" : ""} named “${e.tracking.noun}”, ${e.tracking.framesSeen} of ${framesSent} frames with a mask${clk.cut ? ` (window ${clk.w0.toFixed(1)}–${clk.w1.toFixed(1)} s)` : ""}${pointed ? `; SAM 3.1 didn’t find the ${pointed.purpose.slice(10, -1)} by name, so Muse Spark pointed at it` : ""}`,
        };
      case "measure":
        return {
          detail: `${px.length} points over ${T.toFixed(2)} s; ${e.measured.calibration.note}${e.measured.pivot ? "; swings about a pivot" : ""}`,
          data: { width: e.video.width, height: e.video.height, px: keep(px).map((p) => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]), pivot: e.measured.pivot ? [e.measured.pivot.x, e.measured.pivot.y] : null, k: keep(px).map((p) => clk.k(p.f)) },
        };
      case "hypothesise":
        return { detail: muse.map((c) => c.law.title).join("; "), data: { reasoning: e.reasoning, laws: muse.map((c) => ({ id: c.law.id, title: c.law.title, summary: c.law.summary, latex: safeLatex(c.law) })) } };
      case "fit":
        return {
          detail: `${beforeWonder.length} laws fitted; the best predicts the unseen ${Math.round((1 - e.trainFrac) * 100)}% to within ${fmtErr(beforeWonder[0].fit.testRms, e, angle)}`,
          data: { board: toBoard(beforeWonder), trainFrac: e.trainFrac },
        };
      case "referee": {
        const w = e.wonder;
        if (!w) return { detail: e.critique ? "accepted the result" : "referee unavailable; ranking stands" };
        const why = w.trigger === "code" && w.missZ ? `The best law missed even its fitted frames by ${w.missZ}× the noise, so code called in Muse Wonder. ` : "";
        return { detail: `${why}Muse Wonder tried ${w.attempts.length} law${w.attempts.length === 1 ? "" : "s"} on the fitted frames and submitted “${w.submitted ?? "none"}”`, data: revised ? { board: toBoard(ranked), trainFrac: e.trainFrac } : undefined };
      }
      case "report":
        return { detail: e.finding };
    }
    return {};
  };

  const events: ReplayEvent[] = s.events.map((ev) => (ev.state === "done" ? { step: ev.step, state: ev.state, at: ev.at, ...detail(ev.step) } : { step: ev.step, state: ev.state, at: ev.at, data: ev.data }));
  return { id: s.id, label: s.label, clip: s.clip, recorded: s.recorded, cut: s.cut, rebuilt: s.rebuilt, events, readout: readoutOf(e), record: s.record };
}

/** The finding a replay ends on (the test checks it is the record's own). */
export const finalSummary = (r: Replay) => r.events.find((x) => x.step === "report" && x.state === "done")?.detail;

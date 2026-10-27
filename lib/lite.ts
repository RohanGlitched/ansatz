/**
 * Lite mode: the person filming says what kind of experiment it is and names the moving thing, so no model has to
 * watch the clip. SAM 3.1 measures it, code fits the textbook library (lib/physics/library-full.ts) and ranks it
 * the way the full pipeline does. No Muse Spark, no Muse Wonder, no referee, no by-eye baseline.
 * What it gives up: the world (Earth is assumed), the clock (real time is assumed), the motion window (the whole
 * clip) and anything said in the clip. data/bench/observer.json counts the clips where those defaults fail.
 */
import type { Law } from "./physics/law";
import { fullLibrary } from "./physics/library-full";
import type { Observation } from "./scientist";

export const LITE_TYPES = ["pendulum", "drop", "throw", "bounce", "spring"] as const;
export type LiteType = (typeof LITE_TYPES)[number];

const KIND: Record<LiteType, { phenomenon: string; motion_kind: Observation["motion_kind"]; library: "pendulum" | "flight" | "spring" }> = {
  pendulum: { phenomenon: "pendulum", motion_kind: "swing", library: "pendulum" },
  drop: { phenomenon: "free fall", motion_kind: "flight", library: "flight" },
  throw: { phenomenon: "projectile", motion_kind: "flight", library: "flight" },
  bounce: { phenomenon: "bouncing ball", motion_kind: "flight", library: "flight" },
  spring: { phenomenon: "spring-mass oscillation", motion_kind: "oscillation", library: "spring" },
};

export const NO_SPARK = "lite mode: no Muse Spark call";

/** The observation a lite run starts from: what the person said, and the defaults for everything else. */
export function liteObservation(type: LiteType, noun: string, duration: number, ruler?: { noun: string; metres: number; dimension?: "longest side" | "shortest side"; relUncertainty?: number }, slowMotion?: number): Observation {
  const k = KIND[type];
  return {
    phenomenon: k.phenomenon,
    motion_kind: k.motion_kind,
    what_happens: `Given with the clip: a ${k.phenomenon}, the moving thing a ${noun}.`,
    subjects: [{ noun_phrase: noun, alternatives: [], description: "given with the clip" }],
    reference: ruler
      ? { present: true, noun_phrase: ruler.noun, real_length_m: ruler.metres, dimension: ruler.dimension ?? "longest side", basis: "given with the clip", relative_uncertainty: ruler.relUncertainty ?? 0.03 }
      : { present: false, noun_phrase: "", real_length_m: 0, dimension: "longest side", basis: "", relative_uncertainty: 0 },
    stated_facts: [],
    window: { start_s: 0, end_s: duration },
    slow_motion: slowMotion && slowMotion > 1 ? { factor: slowMotion, evidence: "given with the clip" } : { factor: 1, evidence: "lite mode: real time assumed, not checked" },
    body: "earth",
    location: { place: "", latitude_deg: null },
    camera_static: true,
    caveats: ["lite mode: Earth, real time and the whole clip were assumed; no model watched the clip"],
  };
}

/** With no ruler, lengths are pixels: say so in the units (as scripts/lite.ts does), so no pixel is read as a metre. */
const PX: Record<string, string> = { m: "px", "m/s": "px/s", "m/s²": "px/s²", "1/m": "1/px", "1/(m²·s²)": "1/(px²·s²)" };

/** The textbook laws a lite run fits, for the type the person picked. */
export function liteLaws(type: LiteType, series: Parameters<typeof fullLibrary>[0], o: { g: number; gFixed: boolean; pendulumG?: number; pixels: boolean }): Law[] {
  return fullLibrary(series, { g: o.g, gFixed: o.gFixed, pendulumG: o.pendulumG, type: KIND[type].library })
    // the summary opens the code-written finding ("Large-angle pendulum. Measured: …"), so it ends as a sentence
    .map((l) => ({ ...l, summary: /[.!?]$/.test(l.summary) ? l.summary : `${l.summary}.` }))
    .map((l) => (o.pixels && !series.ch.theta ? { ...l, params: l.params.map((p) => (p.unit && PX[p.unit] ? { ...p, unit: PX[p.unit] } : p)) } : l));
}

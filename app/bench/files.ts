/**
 * The benchmark files served read-only at /bench/<name>.json: an allow-list, never a path from the request. Every
 * file in data/bench that a page quotes is here, with the exact section that shows it; /bench, /x and /llms.txt list
 * the files from this array.
 */
export const BENCH_FILES: Record<string, { script?: string; what: string; shownOn: string }> = {
  "synth.json": { script: "scripts/bench.ts, scored by scripts/score.ts", what: "The rendered clips with known physics run through the full pipeline: the law each run chose, every constant against its truth (checks[]; quantities starting with \"scale\" are camera scales, the rest are physical constants), Muse Spark's by-eye reading, cost and time.", shownOn: "/proof#benchmark" },
  "observer.json": { script: "scripts/observer-score.ts", what: "Muse Spark as observer, scored on every stored run: whether it named the moving object, the world, the kind of experiment and the ruler right, how well its free-motion window matched, and where a lite default with no observer would have failed.", shownOn: "/proof#models" },
  "wonder.json": { script: "scripts/wonder-bench.ts", what: "Muse Wonder as a standing challenger on every benchmark clip: what it tried with its fitting tool, what it submitted, and whether the held-out test kept or rejected it.", shownOn: "/proof#models" },
  "referee.json": { script: "scripts/referee-bench.ts", what: "Muse Spark as referee: whether it asked for a new law on the renders that needed one, and on the clips that did not.", shownOn: "/proof#models" },
  "voice.json": { script: "scripts/voice-table.ts", what: "Muse Voice Transcribe in each of the seven languages, on synthetic voices: whether a spoken string length was heard and parsed, and whether the let-go word was heard.", shownOn: "/proof#models" },
  "sealing.json": { script: "scripts/seal-bench.ts", what: "The benchmark re-scored with the held-out 30% kept out of every measurement step (scale, circle, noise), before and after.", shownOn: "/proof#checks" },
  "lite.json": { script: "scripts/lite.ts", what: "Lite mode without a language model, measured offline on the stored runs, against the full pipeline.", shownOn: "/proof#checks" },
  "clock-controls.json": { what: "Clock-check controls: real-time renders with a ruler in view (a flag would be a false alarm) and small slowdowns.", shownOn: "/proof#slow-motion" },
  "coverage.json": { script: "scripts/coverage.ts", what: "Error-bar calibration: how often the fitter's ±1σ and ±2σ intervals hold the truth over many synthetic fits.", shownOn: "/proof#checks" },
  "ablation.json": { script: "scripts/ablation.ts", what: "Muse Spark's proposed laws against a fixed library of textbook laws on the same clips, and Muse Wonder's laws where the library ran out.", shownOn: "/proof#library" },
  "pendulum-stopwatch.json": { script: "scripts/series-tape.ts", what: "The pendulum series with tape-measured lengths, and Ansatz's periods against a hand stopwatch's.", shownOn: "/series/pendulum-lengths#stopwatch" },
};

/** "synth, observer, wonder, … and pendulum-stopwatch": the file names in words, for a sentence. */
export function benchNames(ext = false): string {
  const n = Object.keys(BENCH_FILES).map((f) => (ext ? f : f.replace(/\.json$/, "")));
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n.at(-1)}` : n.join("");
}

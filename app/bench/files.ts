/** The benchmark files served read-only at /bench/<name>.json: an allow-list, never a path from the request. */
export const BENCH_FILES: Record<string, { script?: string; what: string; shownOn: string }> = {
  "synth.json": { script: "scripts/bench.ts, scored by scripts/score.ts", what: "28 rendered clips with known physics run through the full pipeline: the law each run chose, every constant against its truth (checks[]; quantities starting with \"scale\" are camera scales, the rest are physical constants), Muse Spark's by-eye reading, cost and time.", shownOn: "/proof" },
  "wonder.json": { script: "scripts/wonder-bench.ts", what: "Muse Wonder as a standing challenger on every benchmark clip: what it tried with its fitting tool, what it submitted, and whether the held-out test kept or rejected it.", shownOn: "/proof#models" },
  "referee.json": { script: "scripts/referee-bench.ts", what: "Muse Spark as referee: whether it asked for a new law on the renders that needed one, and on the clips that did not.", shownOn: "/proof#models" },
  "lite.json": { script: "scripts/lite.ts", what: "Lite mode without a language model, measured offline on the stored runs, against the full pipeline.", shownOn: "/proof#checks" },
  "clock-controls.json": { what: "Clock-check controls: real-time renders with a ruler in view (a flag would be a false alarm) and small slowdowns (1.25×, 1.5×).", shownOn: "/proof" },
  "coverage.json": { script: "scripts/coverage.ts", what: "Error-bar calibration: how often the fitter's ±1σ and ±2σ intervals hold the truth over many synthetic fits.", shownOn: "/proof" },
  "ablation.json": { script: "scripts/ablation.ts", what: "Muse Spark's proposed laws against a fixed library of 12 textbook laws on the same clips.", shownOn: "/proof" },
  "pendulum-stopwatch.json": { script: "scripts/series-tape.ts", what: "The pendulum series with tape-measured lengths, and Ansatz's periods against a hand stopwatch's.", shownOn: "/series/pendulum-lengths" },
};

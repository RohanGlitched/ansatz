/**
 * How long a run takes, as the site quotes it: the median of the published runs and the middle half of them (from the
 * 25th to the 75th percentile), read from each run's own ledger. The slowest runs (the two Foucault films, which ran
 * past the site's 5-minute limit offline) stay in the count but don't set the range a visitor reads.
 */
export type RunTime = { n: number; median: number; lo: number; hi: number };

export function runTime(exps: { ledger: { ms: number } }[]): RunTime {
  const s = exps.map((e) => e.ledger.ms / 1000).filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p: number) => {
    if (!s.length) return NaN;
    const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  };
  return { n: s.length, median: q(0.5), lo: q(0.25), hi: q(0.75) };
}

/** "about 2 minutes" */
export function runMinutes(r: RunTime) {
  const m = Math.round((r.median / 60) * 2) / 2;
  return r.median < 100 ? `about ${Math.round(r.median / 10) * 10} seconds` : `about ${m} minute${m === 1 ? "" : "s"}`;
}

/** "about 2 minutes (median 123 s; the middle half of the 12 published runs took 87 to 181 s)" */
export function runTimeText(r: RunTime) {
  return `${runMinutes(r)} (median ${Math.round(r.median)} s; the middle half of the ${r.n} published runs took ${Math.round(r.lo)} to ${Math.round(r.hi)} s)`;
}

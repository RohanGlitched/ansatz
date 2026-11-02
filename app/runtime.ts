/**
 * How long a run takes, as the site quotes it: the median of the published runs and the middle half of them (from the
 * 25th to the 75th percentile), read from each run's own ledger. The slowest runs (the two Foucault films, run
 * offline; the real-time one ran past the site's 5-minute limit) stay in the count but don't set the range a visitor reads.
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

/** The longest a run on the site may take (app/api/run/route.ts maxDuration). */
export const RUN_LIMIT_S = 300;

/** Which published runs took longer than a run on the site may, and that the Foucault films were run offline, from
 * the ledgers: "One published run, …, took 561 s, past the site's 5-minute limit; both Foucault films were run offline." */
export function offlineText(exps: { id: string; title: string; ledger: { ms: number } }[]) {
  const over = exps.filter((e) => e.ledger.ms / 1000 > RUN_LIMIT_S);
  const fou = exps.filter((e) => e.id.startsWith("foucault-pendulum"));
  const lim = `${RUN_LIMIT_S / 60}-minute limit`;
  const first = over.length === 0 ? `No published run took longer than the site’s ${lim}` : over.length === 1 ? `One published run, ${over[0].title}, took ${Math.round(over[0].ledger.ms / 1000)} s, past the site’s ${lim}` : `${over.length} published runs took longer than the site’s ${lim} (${over.map((e) => `${Math.round(e.ledger.ms / 1000)} s`).join(", ")})`;
  return `${first}${fou.length ? `; ${fou.length === 2 ? "both Foucault films were" : "the Foucault film was"} run offline, not through the site` : ""}.`;
}

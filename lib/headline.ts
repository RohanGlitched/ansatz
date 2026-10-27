import "server-only";
import { getExperiment, showcaseIds } from "./experiments";
import type { Experiment } from "./experiment";
import { median } from "./median";

/**
 * The figures quoted across the site, each derived from the stored runs in one place, so the home page, the judges'
 * page and the run page can't drift apart.
 */
export type Headline = {
  runs: number;
  usd: { median: number; min: number; max: number };
  seconds: { median: number; min: number; max: number };
  moon?: { g: number; sigma: number; reference: number };
  /** the slowed copy against the broadcast, jump for jump: needs no reference value */
  jumpForJump?: { ratio: number; sigma: number };
  /** the slowed copy against the Moon's known gravity: a different question, which assumes the world */
  moonClock?: { factor: number; sigma: number };
};


export async function headline(): Promise<Headline> {
  const exps = (await Promise.all((await showcaseIds()).map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => e != null);
  const usd = exps.map((e) => e.ledger.usd), secs = exps.map((e) => e.ledger.ms / 1000);
  const moon = exps.find((e) => e.id === "moon-jump");
  const slowed = exps.find((e) => e.id === "moon-jump-slowed");
  const g = moon?.comparisons.find((c) => c.param === "g");
  const sj = moon?.extras?.memoryTest?.sameJump?.combined;
  return {
    runs: exps.length,
    usd: { median: median(usd), min: Math.min(...usd), max: Math.max(...usd) },
    seconds: { median: median(secs), min: Math.min(...secs), max: Math.max(...secs) },
    moon: g ? { g: g.measured, sigma: g.sigma, reference: g.reference } : undefined,
    jumpForJump: sj ? { ratio: sj.ratio, sigma: sj.sigma } : undefined,
    moonClock: slowed?.clock ? { factor: slowed.clock.factor, sigma: slowed.clock.sigma ?? NaN } : undefined,
  };
}

/** "a median of 14 cents of model calls (from 10 to 43)" and "about 2 minutes (72 to 191 s)" */
export function costText(h: Headline) {
  return `a median of ${Math.round(h.usd.median * 100)} cents of model calls (from ${Math.round(h.usd.min * 100)} to ${Math.round(h.usd.max * 100)})`;
}

export function timeText(h: Headline) {
  const m = h.seconds.median;
  const span = m < 100 ? `${Math.round(m / 10) * 10} seconds` : `${Math.round((m / 60) * 2) / 2} minutes`;
  return `about ${span} (${Math.round(h.seconds.min)} to ${Math.round(h.seconds.max)} s)`;
}

import { isRoughFit, type Experiment } from "./experiment";

/**
 * A flagged clock's figure, printed the same way on the run page, the /x index and llms.txt: how much faster (gravity too
 * strong; the filmmaker's own label is the truth where there is one) or slower than life the clip plays. The rough-fit
 * rule applies here as everywhere: when the winning law misses its unseen frames by more than five times the noise, no
 * ± is printed (a slowdown then reads "about 2.3"; a speed-up keeps two decimals, its value being a frequency ratio,
 * with its uncertainty said in words where it is quoted). Null for no clock, or one a re-run withdrew.
 */
export type ClockFigure = { kind: "faster" | "slower"; value: number; sigma: number | undefined; rough: boolean; v: string; pm: string | undefined; text: string };

export function clockFigure(e: Pick<Experiment, "clock" | "candidates" | "winner" | "extras">): ClockFigure | null {
  const c = e.clock as (NonNullable<Experiment["clock"]> & { withdrawn?: boolean }) | null;
  if (!c || c.withdrawn) return null;
  const win = e.candidates.find((x) => x.law.id === e.winner) ?? e.candidates[0];
  const rough = !!win && isRoughFit(win.fit);
  if (c.factor < 1) {
    const sp = e.extras?.truth?.rows.find((r) => r.param === "speedup");
    const value = sp ? sp.measured : 1 / c.factor;
    const sigma = sp ? sp.sigma : c.sigma ? c.sigma / (c.factor * c.factor) : undefined;
    const v = value.toFixed(2), pm = !rough && sigma ? sigma.toFixed(2) : undefined;
    return { kind: "faster", value, sigma, rough, v, pm, text: pm ? `${v} ± ${pm}` : v };
  }
  const sigma = c.sigma ?? undefined;
  const v = rough ? `about ${c.factor.toFixed(1)}` : c.factor.toFixed(2);
  const pm = !rough && sigma ? sigma.toFixed(2) : undefined;
  return { kind: "slower", value: c.factor, sigma, rough, v, pm, text: pm ? `${v} ± ${pm}` : v };
}

import { isRoughFit, type Experiment } from "../../lib/experiment";
import { clockFigure } from "../../lib/clockfig";
import { fmtAbout, fmtPair } from "../../lib/format";
import { pipelineName } from "../pipelineWords";
import { prettyUnit } from "../../lib/units";

// the winner as lib/experiments has it (that module is server-only; this one is also read by tests)
const winnerOf = (e: Experiment) => e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];

/**
 * One experiment's headline number for an index: the constant it measured (or, when its clock was flagged, how slow
 * the clip plays), the known value where the record holds one, and how far off it is. Shared by /x and /llms.txt.
 */
export type Summary = {
  /** what the number is, in words: "surface gravity of the Moon" */
  what: string;
  symbol: string;
  /** "1.72 ± 0.11" or "about 0.53" when the winning law misses its unseen frames by far more than the noise */
  value: string;
  unit: string;
  known?: { value: string; source: string };
  /** signed, in percent */
  offPct?: number;
  /** how many of its own error bars the value sits from the known one */
  sigmas?: number;
  /** a second figure worth reading beside the first (the slowed copy's jump-for-jump ratio) */
  also?: string;
  note?: string;
};

// positions and smoothing scales are fitted, but nobody reads them as the result
const NOT_A_RESULT = /^(s_?eq|seq|y_?floor|x_?0|y_?0|vsm|cal|phi\d*|phase|theta0|t0)$/i;
// the symbol a render's credit line uses for a law's parameter ("quadratic drag k = 0.25 /m", "ω₀ = 11.18 rad/s")
const CREDIT_SYMBOL: Record<string, string> = { k: "k", e: "e", L: "L", omega0: "ω₀", omega: "ω₀" };

const num = (v: number) => String(+v.toPrecision(4));

/**
 * "about 11.12" beside "−4.2%": a rough value printed next to its % off keeps the digits that % implies, so the two
 * never disagree ("about 11" beside 11.61 would read −5.3%). Without a known value it is fmtAbout as before.
 */
export function aboutOff(v: number, known?: number): string {
  const base = fmtAbout(v, known);
  if (known === undefined || !Number.isFinite(known) || known === 0 || !Number.isFinite(v)) return base;
  const want = fmtOff((v / known - 1) * 100);
  for (let sig = Math.max(2, base.replace(/^-?0\.0*|[-.]/g, "").length); sig <= 6; sig++) {
    const t = +v.toPrecision(sig);
    if (fmtOff((t / known - 1) * 100) === want) return String(t);
  }
  return base;
}

export function summarise(e: Experiment): Summary | null {
  const w = winnerOf(e);
  // the run page's rule (isRoughFit): a winning law that misses its unseen frames by more than five times the noise gets no ±
  const rough = isRoughFit(w.fit);
  // no error bar, by the one rule the experiment page uses (lib/format.ts fmtAbout: "about 9.7", "about 242")
  const pair = (v: number, s: number, known?: number) => (rough || !Number.isFinite(s) || s <= 0 ? `about ${aboutOff(v, known)}` : fmtPair(v, s));
  const sj = e.extras?.memoryTest?.sameJump?.combined;
  const also = sj ? `the copy we slowed 1.5× in secret, timed against this clip jump for jump: ${sj.ratio.toFixed(3)} ± ${sj.sigma.toFixed(3)}× slower` : undefined;

  // a clip whose gravity says its clock is wrong: the speed of the clip is the result, not the wrong acceleration
  if (e.clock) {
    const f = e.clock.factor;
    // the figure as the run page prints it (lib/clockfig.ts), with or without a ± by the same rough-fit rule
    const fig = clockFigure(e);
    // gravity came out too strong: the clip plays faster than life (the filmmaker's own label is the truth, where there is one)
    if (f < 1 && fig) {
      const sp = e.extras?.truth?.rows.find((r) => r.param === "speedup");
      const v = fig.value;
      return {
        what: "how much faster than real time the clip plays, from its gravity",
        symbol: "speedup",
        value: fig.text,
        unit: "×",
        known: sp ? { value: `${+sp.truth.toPrecision(3)}×`, source: "the filmmaker’s on-screen label" } : undefined,
        offPct: sp ? (v / sp.truth - 1) * 100 : undefined,
        note: sp
          ? `Gravity came out too strong, so the clip runs faster than life. The filmmaker labelled this stretch ${+sp.truth.toPrecision(3)}× on screen; we cropped the label out before the run.`
          : "Gravity came out too strong, so the clip runs faster than life.",
      };
    }
    // a later re-run that withdrew the factor: no number is claimed
    const rerunNote = (e as Experiment & { rerun?: { note: string } }).rerun?.note ?? "";
    if (/no factor is claimed|claims no factor/i.test(rerunNote)) {
      return {
        what: "how much slower than real time the clip plays",
        symbol: "slowdown",
        value: "no factor claimed",
        unit: "",
        note: `A re-run with ${pipelineName(e.pipeline, true)} does not measure the string’s length, so no slowdown is claimed.`,
      };
    }
    const truth = /slowed (\d+(?:\.\d+)?)×/.exec(e.title)?.[1];
    return {
      what: "how much slower than real time the clip plays, from its gravity",
      symbol: "slowdown",
      // two decimals with a ±, as every page quotes it (1.50 ± 0.05×), or "about 2.3" on a rough fit
      value: fig ? fig.text : `about ${f.toFixed(1)}`,
      unit: "×",
      known: truth ? { value: `${truth}×`, source: "we slowed it ourselves" } : undefined,
      offPct: truth ? (f / Number(truth) - 1) * 100 : undefined,
      note: truth ? "Against the Moon’s known gravity, so it assumes the world." : "Unconfirmed: the uploader’s slow-motion factor isn’t known.",
    };
  }
  const c = e.comparisons[0];
  if (c) {
    const p = w.law.params.find((q) => q.name === c.param);
    return {
      what: c.label.replace(/\s*\(.*\)$/, ""),
      symbol: c.param,
      value: pair(c.measured, c.sigma, c.reference),
      unit: prettyUnit(p?.unit ?? (c.param === "g" ? "m/s^2" : "")),
      known: { value: num(c.reference), source: c.label },
      offPct: c.errorPct,
      sigmas: rough ? undefined : c.withinSigma,
      also,
    };
  }
  const t = e.extras?.truth?.rows[0];
  if (t) {
    return { what: t.label, symbol: t.param, value: pair(t.measured, t.sigma, t.truth), unit: prettyUnit(t.unit), known: { value: num(t.truth), source: "the render’s settings" }, offPct: (t.measured / t.truth - 1) * 100 };
  }
  const p = w.law.params.find((q) => !q.fixed && !NOT_A_RESULT.test(q.name) && !/pix/i.test(q.unit ?? ""));
  if (!p) return null;
  const v = w.fit.theta[p.name];
  const out: Summary = { what: p.meaning ?? p.name, symbol: p.name, value: pair(v, w.fit.sigma[p.name] ?? NaN), unit: prettyUnit(p.unit === "1" ? "" : p.unit) };
  // a render states its settings in its credit line; read the one for this constant, if it's there
  const sym = CREDIT_SYMBOL[p.name];
  const m = sym && e.source.kind === "showcase" && /^Rendered/.test(e.source.credit ?? "") ? new RegExp(`(?:^|[\\s(])${sym}\\s*=\\s*(\\d+(?:\\.\\d+)?)`).exec(e.source.credit ?? "") : null;
  if (m) {
    const truth = Number(m[1]);
    out.known = { value: m[1], source: "the render’s settings" };
    out.offPct = (v / truth - 1) * 100;
  }
  return out;
}

/** "+0.5%", "−4.1%", "0.06%" */
export function fmtOff(p: number | undefined) {
  if (p === undefined || !Number.isFinite(p)) return "";
  const a = Math.abs(p);
  const d = a < 0.1 ? 3 : a < 1 ? 2 : 1;
  return `${p < 0 ? "−" : p > 0 ? "+" : ""}${a.toFixed(d)}%`;
}

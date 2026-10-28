import "server-only";
import type { ClassRecord } from "./classes";
import { getExperiment, winnerOf } from "./experiments";
import { fmtPair, fmtSig } from "./format";
import { seriesPoint } from "./seriesfit";
import { dampingTie } from "./tie";
import { prettyUnit } from "./units";

export type ClassRow = {
  id: string;
  student: string;
  experiment: string;
  law: string;
  /** set when the top two laws are the two damping forms and the clip can't tell them apart */
  damping?: string;
  /** the run's own headline measurement, scored against its own known value */
  symbol?: string;
  label?: string;
  value?: number;
  sigma?: number;
  unit?: string;
  reference?: number;
  offPct?: number;
  /** g, when that is what the run measured (the class chart plots these) */
  g?: number;
  /** where the length behind g came from, and the A4 sheet's value kept beside it when a tape length leads */
  lengthFrom?: string;
  lengthM?: number;
  gSheet?: number;
  sigmaSheet?: number;
  /** the world the run assumed (earth, moon, …): the class chart plots Earth runs only */
  world?: string;
  /** set when g was given and the run measured the string length instead */
  gGiven?: boolean;
  /** why the row has no value */
  dash?: string;
  warn?: string;
  at: string;
};

/**
 * One row per run, the way a teacher marks them: who, what, the measured value with its error, how far it is from that
 * experiment's own known value, where the length came from, and anything to check.
 */
export async function classRows(cls: ClassRecord): Promise<ClassRow[]> {
  const runs = (await Promise.all(cls.runs.map((id) => getExperiment(id).catch(() => null)))).filter((e) => !!e);
  return runs.map((e, i) => {
    const w = winnerOf(e);
    const free = w.law.params.filter((p) => !p.fixed && p.name !== "cal");
    const isG = (c: (typeof e.comparisons)[number]) => c.param === "g" || /accelerates at g|gravity/i.test(c.label);
    const c = e.comparisons.find(isG) ?? e.comparisons.find((x) => free.some((p) => p.name === x.param));
    const warn = e.clock ? `clock: plays about ${e.clock.factor.toFixed(1)}× ${e.clock.factor > 1 ? "slower" : "faster"} than life` : (w.fit.testZ ?? 0) > 5 ? "the law misses the unseen frames: check the clip" : undefined;
    const row: ClassRow = {
      id: e.id,
      student: cls.students?.[e.id] ?? e.student ?? `Run ${i + 1}`,
      experiment: e.title,
      law: w.law.title,
      damping: dampingTie(e) ?? undefined,
      warn,
      world: e.observation.body,
      at: e.createdAt,
    };
    if (!c) {
      // nothing with a known value: say why there's no number
      const heldG = w.law.params.find((p) => p.fixed && p.name === "g");
      const L = free.find((p) => p.name === "L");
      row.dash = heldG
        ? `g was given (${fmtSig(w.fit.theta.g, 4)} m/s²), not measured: this run measures the string length${L ? `, L = ${fmtPair(w.fit.theta.L, w.fit.sigma.L)} m` : ""}`
        : "no known value to compare this run with";
      if (heldG) row.gGiven = true;
      return row;
    }
    const unit = free.find((p) => p.name === c.param)?.unit;
    const v = isG(c) ? Math.abs(c.measured) : c.measured;
    Object.assign(row, { symbol: isG(c) ? "g" : c.param, label: c.label, value: v, sigma: c.sigma, unit: unit && unit !== "1" ? prettyUnit(unit) : "", reference: c.reference });
    if (isG(c)) {
      // a tape length, when the class gave one: g from Ansatz's period and that length, the sheet's value kept beside it
      const tape = cls.tape?.[e.id];
      const pt = tape ? seriesPoint(e, w, tape) : null;
      if (pt) {
        Object.assign(row, { value: pt.g, sigma: pt.sg, lengthFrom: "tape", lengthM: pt.L, gSheet: v, sigmaSheet: c.sigma });
      } else {
        const said = e.given.some((g) => /“|\(stated\)/.test(g));
        const sheet = /paper|sheet|a4/i.test(e.observation.reference?.noun_phrase ?? "");
        row.lengthFrom = said ? "spoken" : e.measured.calibration.kind === "reference" ? (sheet ? "A4 sheet" : `ruler: ${e.observation.reference.noun_phrase}`) : undefined;
        row.lengthM = said || e.measured.calibration.kind === "reference" ? w.fit.theta.L : undefined;
      }
      row.g = row.value;
    }
    row.offPct = Number.isFinite(c.reference) && c.reference !== 0 ? ((row.value! - Math.abs(c.reference)) / Math.abs(c.reference)) * 100 : undefined;
    return row;
  });
}

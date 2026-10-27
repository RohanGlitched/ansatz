import "server-only";
import type { ClassRecord } from "./classes";
import { getExperiment, winnerOf } from "./experiments";

export type ClassRow = { id: string; student: string; experiment: string; law: string; g?: number; sigma?: number; offPct?: number; warn?: string; at: string };

/** One row per run, the way a teacher marks them: who, what, g with its error, how far from Earth's, and anything to check. */
export async function classRows(cls: ClassRecord): Promise<ClassRow[]> {
  const runs = (await Promise.all(cls.runs.map((id) => getExperiment(id).catch(() => null)))).filter((e) => !!e);
  return runs.map((e, i) => {
    const w = winnerOf(e);
    const c = e.comparisons.find((x) => x.param === "g" || /accelerates at g|gravity/i.test(x.label));
    const warn = e.clock ? `clock: plays about ${e.clock.factor.toFixed(1)}× ${e.clock.factor > 1 ? "slower" : "faster"} than life` : (w.fit.testZ ?? 0) > 5 ? "the law misses the unseen frames: check the clip" : undefined;
    return {
      id: e.id,
      student: cls.students?.[e.id] ?? e.student ?? `Run ${i + 1}`,
      experiment: e.title,
      law: w.law.title,
      g: c?.measured,
      sigma: c?.sigma,
      offPct: c && e.observation.body === "earth" ? ((c.measured - 9.81) / 9.81) * 100 : undefined,
      warn,
      at: e.createdAt,
    };
  });
}

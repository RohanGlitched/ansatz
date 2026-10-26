import "server-only";
import { getObject, putObject } from "./store";

/**
 * Spend guards. Each run costs about $0.10–0.30 of model calls and the hackathon gives $150, so runs are
 * capped per visitor per day and in total per day. Counters live next to the experiments.
 */
export const PER_VISITOR = Number(process.env.RUNS_PER_VISITOR ?? 6);
export const PER_DAY = Number(process.env.RUNS_PER_DAY ?? 90);

type Day = { total: number; byVisitor: Record<string, number> };

const today = () => new Date().toISOString().slice(0, 10);

async function read(): Promise<Day> {
  const raw = await getObject(`usage/${today()}.json`).catch(() => null);
  return raw ? (JSON.parse(new TextDecoder().decode(raw)) as Day) : { total: 0, byVisitor: {} };
}

export async function checkAndCount(visitor: string, admin: boolean): Promise<{ ok: true } | { ok: false; why: string }> {
  const d = await read();
  if (!admin) {
    if ((d.byVisitor[visitor] ?? 0) >= PER_VISITOR)
      return { ok: false, why: `You have run ${PER_VISITOR} experiments today, the most one visitor can. The showcase experiments are always open, and the limit resets at midnight UTC.` };
    if (d.total >= PER_DAY)
      return { ok: false, why: `Ansatz has run its ${PER_DAY} experiments for today (each one calls Meta's models). The limit resets at midnight UTC; the showcase experiments are always open.` };
  }
  d.total++;
  d.byVisitor[visitor] = (d.byVisitor[visitor] ?? 0) + 1;
  await putObject(`usage/${today()}.json`, JSON.stringify(d), "application/json").catch(() => {});
  return { ok: true };
}

export async function usageToday() {
  const d = await read();
  return { total: d.total, cap: PER_DAY };
}

export function visitorOf(req: Request) {
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xf || req.headers.get("x-real-ip") || "local";
}

import "server-only";
import { getObject, updateJson } from "./store";

/**
 * Spend guards. Each run costs about $0.10–0.30 of model calls and the hackathon gives $150, so runs are
 * capped per visitor per day and in total per day. Counters live next to the experiments.
 */
export const PER_VISITOR = Number(process.env.RUNS_PER_VISITOR ?? 6);
export const PER_DAY = Number(process.env.RUNS_PER_DAY ?? 90);
export const UPLOADS_PER_VISITOR = Number(process.env.UPLOADS_PER_VISITOR ?? 12);
/** Dollars of Meta calls a day may spend, whatever the run counts say */
export const DAILY_USD = Number(process.env.DAILY_USD ?? 12);

type Day = { total: number; byVisitor: Record<string, number> };

const today = () => new Date().toISOString().slice(0, 10);

async function read(): Promise<Day> {
  const raw = await getObject(`usage/${today()}.json`).catch(() => null);
  return raw ? (JSON.parse(new TextDecoder().decode(raw)) as Day) : { total: 0, byVisitor: {} };
}

export async function checkAndCount(visitor: string, admin: boolean): Promise<{ ok: true } | { ok: false; why: string }> {
  let why = "";
  // counted in one conditional write: two runs starting together can't both take the last slot; if the count can't
  // be written, the run doesn't start (a counter that fails open is no limit at all)
  const done = await updateJson<Day>(`usage/${today()}.json`, { total: 0, byVisitor: {} }, (d) => {
    if (!admin && (d.byVisitor[visitor] ?? 0) >= PER_VISITOR) {
      why = `You have run ${PER_VISITOR} experiments today, the most one visitor can. The showcase experiments are always open, and the limit resets at midnight UTC.`;
      return null;
    }
    if (!admin && d.total >= PER_DAY) {
      why = `Ansatz has run its ${PER_DAY} experiments for today (each one calls Meta's models). The limit resets at midnight UTC; the showcase experiments are always open.`;
      return null;
    }
    return { total: d.total + 1, byVisitor: { ...d.byVisitor, [visitor]: (d.byVisitor[visitor] ?? 0) + 1 } };
  }).catch(() => {
    why = "Ansatz couldn't record this run just now, so it didn't start. Try again in a minute.";
    return null;
  });
  return done ? { ok: true } : { ok: false, why };
}

/** Uploads per visitor per day: a clip is uploaded before it runs, and storage costs too. */
export async function countUpload(visitor: string): Promise<boolean> {
  const r = await updateJson<{ byVisitor: Record<string, number> }>(`usage/uploads-${today()}.json`, { byVisitor: {} }, (d) =>
    (d.byVisitor[visitor] ?? 0) >= UPLOADS_PER_VISITOR ? null : { byVisitor: { ...d.byVisitor, [visitor]: (d.byVisitor[visitor] ?? 0) + 1 } },
  ).catch(() => null);
  return !!r;
}

export async function usageToday() {
  const d = await read();
  return { total: d.total, cap: PER_DAY };
}

export function visitorOf(req: Request) {
  const xf = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xf || req.headers.get("x-real-ip") || "local";
}

export async function spentToday(): Promise<number> {
  const raw = await getObject(`usage/usd-${today()}.json`).catch(() => null);
  return raw ? (JSON.parse(new TextDecoder().decode(raw)) as { usd: number }).usd : 0;
}

export async function addSpend(usd: number) {
  if (!(usd > 0)) return;
  await updateJson<{ usd: number }>(`usage/usd-${today()}.json`, { usd: 0 }, (d) => ({ usd: d.usd + usd }));
}

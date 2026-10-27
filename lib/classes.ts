import "server-only";
import { getObject, putObject } from "./store";

/**
 * Class links: a teacher makes a code, and every run made with it counts against the class's own quota instead of
 * the school's one shared IP address. The class page gathers every student's result in one place.
 */
export type ClassRecord = { code: string; name: string; createdAt: string; expiresAt: string; quota: number; used: number; runs: string[] };

const QUOTA = Number(process.env.CLASS_QUOTA ?? 45);
const DAYS = 7;
const CLASSES_PER_DAY = Number(process.env.CLASSES_PER_DAY ?? 10);
const CLASSES_PER_VISITOR = 3;

const key = (code: string) => `classes/${code}.json`;
const today = () => new Date().toISOString().slice(0, 10);

export async function getClass(code: string): Promise<ClassRecord | null> {
  if (!/^[a-z2-9]{6}$/.test(code)) return null;
  const raw = await getObject(key(code)).catch(() => null);
  return raw ? (JSON.parse(new TextDecoder().decode(raw)) as ClassRecord) : null;
}

export async function createClass(name: string, visitor: string): Promise<{ ok: true; cls: ClassRecord } | { ok: false; why: string }> {
  const dayKey = `classes/made-${today()}.json`;
  const raw = await getObject(dayKey).catch(() => null);
  const made = raw ? (JSON.parse(new TextDecoder().decode(raw)) as { total: number; byVisitor: Record<string, number> }) : { total: 0, byVisitor: {} };
  if (made.total >= CLASSES_PER_DAY) return { ok: false, why: `${CLASSES_PER_DAY} classes were made today, the most Ansatz can pay for. Try again tomorrow, or write to the builder.` };
  if ((made.byVisitor[visitor] ?? 0) >= CLASSES_PER_VISITOR) return { ok: false, why: "You have made three classes today. Use one of those links." };
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += a[Math.floor(Math.random() * a.length)];
  const now = new Date();
  const cls: ClassRecord = { code, name: name.trim().slice(0, 80) || "A physics class", createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + DAYS * 864e5).toISOString(), quota: QUOTA, used: 0, runs: [] };
  await putObject(key(code), JSON.stringify(cls), "application/json");
  made.total++;
  made.byVisitor[visitor] = (made.byVisitor[visitor] ?? 0) + 1;
  await putObject(dayKey, JSON.stringify(made), "application/json").catch(() => {});
  return { ok: true, cls };
}

/** Counts one run against the class, if it still has runs left. */
export async function useClassRun(code: string): Promise<{ ok: true; cls: ClassRecord } | { ok: false; why: string }> {
  const cls = await getClass(code);
  if (!cls) return { ok: false, why: "That class link isn't valid. Ask your teacher for the link again." };
  if (Date.now() > Date.parse(cls.expiresAt)) return { ok: false, why: "That class link has expired (they last a week). Ask your teacher for a new one." };
  if (cls.used >= cls.quota) return { ok: false, why: `Your class has used all ${cls.quota} of its runs.` };
  cls.used++;
  await putObject(key(code), JSON.stringify(cls), "application/json");
  return { ok: true, cls };
}

export async function addClassRun(code: string, id: string) {
  const cls = await getClass(code);
  if (!cls || cls.runs.includes(id)) return;
  cls.runs.push(id);
  await putObject(key(code), JSON.stringify(cls), "application/json").catch(() => {});
}

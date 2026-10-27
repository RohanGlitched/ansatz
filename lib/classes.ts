import "server-only";
import { getObject, putObject, updateJson } from "./store";

/**
 * Class links: a teacher makes a code, and every run made with it counts against the class's own quota instead of
 * the school's one shared IP address. The class page gathers every student's result in one place.
 */
export type ClassRecord = { code: string; name: string; createdAt: string; expiresAt: string; quota: number; used: number; runs: string[]; demo?: boolean; students?: Record<string, string> };

/** The demo class ships with the app: what a teacher's page looks like, filled with the showcase experiments. */
const DEMO: ClassRecord = {
  code: "demo23",
  name: "Demo: Class 11 Physics",
  createdAt: "2026-10-27T00:00:00Z",
  expiresAt: "2026-12-31T00:00:00Z",
  quota: 0,
  used: 0,
  demo: true,
  // every row measures g on Earth, so the grading columns are filled for each
  runs: ["pendulum-40cm", "pendulum-60cm", "pendulum-80cm", "pendulum-100cm", "hindi-pendulum", "big-swing"],
  students: { "pendulum-40cm": "Student A", "pendulum-60cm": "Student B", "pendulum-80cm": "Student C", "pendulum-100cm": "Student D", "hindi-pendulum": "Student E", "big-swing": "Student F" },
};

const QUOTA = Number(process.env.CLASS_QUOTA ?? 45);
const DAYS = 7;
const CLASSES_PER_DAY = Number(process.env.CLASSES_PER_DAY ?? 3);
// every class's runs together, per day: class links can't spend more than this whatever their quotas say
const CLASS_RUNS_PER_DAY = Number(process.env.CLASS_RUNS_PER_DAY ?? 40);
const CLASSES_PER_VISITOR = 3;

const key = (code: string) => `classes/${code}.json`;
const today = () => new Date().toISOString().slice(0, 10);

export async function getClass(code: string): Promise<ClassRecord | null> {
  if (!/^[a-z2-9]{6}$/.test(code)) return null;
  if (code === DEMO.code) return DEMO;
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

/** Counts one run against the class, if it still has runs left and class links haven't spent today's allowance. */
export async function useClassRun(code: string): Promise<{ ok: true; cls: ClassRecord } | { ok: false; why: string }> {
  const cls = await getClass(code);
  if (!cls) return { ok: false, why: "That class link isn't valid. Ask your teacher for the link again." };
  if (cls.demo) return { ok: false, why: "That's the demo class page; it doesn't run experiments. Make your own class link at /class/new." };
  if (Date.now() > Date.parse(cls.expiresAt)) return { ok: false, why: "That class link has expired (they last a week). Ask your teacher for a new one." };
  const day = await updateJson<{ total: number }>(`classes/runs-${today()}.json`, { total: 0 }, (d) => (d.total >= CLASS_RUNS_PER_DAY ? null : { total: d.total + 1 })).catch(() => null);
  if (!day) return { ok: false, why: `Class links have used today's ${CLASS_RUNS_PER_DAY} runs. The limit resets at midnight UTC.` };
  let full = false;
  const next = await updateJson<ClassRecord>(key(code), cls, (c) => {
    if (c.used >= c.quota) {
      full = true;
      return null;
    }
    return { ...c, used: c.used + 1 };
  }).catch(() => null);
  if (!next) return { ok: false, why: full ? `Your class has used all ${cls.quota} of its runs.` : "The run couldn't be recorded just now. Try again in a minute." };
  return { ok: true, cls: next };
}

export async function addClassRun(code: string, id: string) {
  await updateJson<ClassRecord | null>(key(code), null, (c) => (c && !c.runs.includes(id) ? { ...c, runs: [...c.runs, id] } : null)).catch(() => {});
}

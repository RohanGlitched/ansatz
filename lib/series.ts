import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getObject, putObject, updateJson } from "./store";

/** A series: one experiment repeated at several lengths (the school pendulum practical), fitted together on /series/<id>. */
export type SeriesRecord = {
  id: string;
  title: string;
  note: string;
  truth?: { g: number; lengths: number[] };
  /** string lengths measured with a tape, in metres, by run id: the classroom default (the sheet in view is the fallback) */
  tape?: Record<string, number>;
  tapeNote?: string;
  ids: string[];
  createdAt?: string;
};

export async function getSeries(id: string): Promise<SeriesRecord | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(id)) return null;
  const shipped = await readFile(path.join(process.cwd(), "data", "series", `${id}.json`), "utf8").then((s) => JSON.parse(s) as SeriesRecord, () => null);
  if (shipped) return shipped;
  const raw = await getObject(`series/${id}.json`).catch(() => null);
  return raw ? (JSON.parse(new TextDecoder().decode(raw)) as SeriesRecord) : null;
}

export async function createSeries(title: string): Promise<SeriesRecord> {
  const a = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "s-";
  for (let i = 0; i < 8; i++) id += a[Math.floor(Math.random() * a.length)];
  const s: SeriesRecord = { id, title: title.trim().slice(0, 80) || "My pendulum series", note: "One pendulum filmed at several string lengths, each clip measured on its own; the slope of L against T² gives g.", ids: [], createdAt: new Date().toISOString() };
  await putObject(`series/${id}.json`, JSON.stringify(s), "application/json");
  return s;
}

/** Records the tape length of one run of a visitor's series (shipped examples are read-only). */
export async function setTapeLength(id: string, run: string, metres: number | null) {
  if (!/^s-[a-z2-9]{8}$/.test(id) || !/^[a-z0-9-]{3,40}$/.test(run)) return;
  if (metres !== null && !(metres > 0.02 && metres < 30)) return;
  await updateJson<SeriesRecord | null>(`series/${id}.json`, null, (s) => {
    if (!s || !s.ids.includes(run)) return null;
    const tape = { ...(s.tape ?? {}) };
    if (metres === null) delete tape[run];
    else tape[run] = Math.round(metres * 10000) / 10000;
    return { ...s, tape };
  });
}

export async function addSeriesRun(id: string, run: string) {
  if (!/^s-[a-z2-9]{8}$/.test(id)) return;
  await updateJson<SeriesRecord | null>(`series/${id}.json`, null, (s) => (s && !s.ids.includes(run) && s.ids.length < 12 ? { ...s, ids: [...s.ids, run] } : null)).catch(() => {});
}

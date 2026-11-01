/**
 * Which visitors' runs the home page may list. A run is shown only when its id is in data/recent-allow.json (an
 * allow-list someone edits by hand after opening the run), so no stranger's clip or words reach the home page on their
 * own; its headline is still checked again here (no digits, under 110 characters), since it is model prose.
 */
import type { Experiment } from "./experiment";

export type RecentItem = { id: string; title: string; headline: string; createdAt: string };

/** Model prose fit for the home page: no digits (no number a model typed) and short; otherwise null. */
export function safeLine(s: string | undefined | null, max = 110): string | null {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t && !/\d/.test(t) && t.length < max ? t : null;
}

/** The allow-listed runs of the current method, newest first, with headlines that pass safeLine (else the title, else nothing). */
export function visibleRecent(runs: (Experiment | null)[], allow: readonly string[], pipeline: string, limit = 6): RecentItem[] {
  const ok = new Set(allow.filter((x) => typeof x === "string"));
  return runs
    .filter((e): e is Experiment => !!e && ok.has(e.id) && e.source?.kind === "upload" && !e.sample && e.pipeline === pipeline)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .flatMap((e) => {
      const title = safeLine(e.title, 80);
      const headline = safeLine(e.headline) ?? title;
      return title && headline ? [{ id: e.id, title, headline, createdAt: e.createdAt }] : [];
    });
}

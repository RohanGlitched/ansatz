/**
 * Small pure checks the routes share, kept free of storage and server-only imports so tests can run them: HTTP byte
 * ranges, per-visitor daily caps, and how long a remembered refusal stands.
 */

/**
 * One HTTP byte range against a body of `size` bytes: "bytes=a-b", "bytes=a-" (to the end) and the suffix form
 * "bytes=-n" (the last n bytes). Null when the header asks for nothing satisfiable (answer 416); "all" when there is
 * no usable range (serve the whole body).
 */
export function byteRange(header: string | null, size: number): { start: number; end: number } | null | "all" {
  if (!header) return "all";
  // several ranges ("bytes=0-1,5-9"): the first is served, which browsers seeking a video accept
  const m = /^\s*bytes=(\d*)-(\d*)\s*$/.exec(header.split(",")[0]);
  if (!m || (!m[1] && !m[2])) return "all";
  if (!m[1]) {
    // suffix: the last n bytes (all of them when n is larger than the body)
    const n = Number(m[2]);
    if (!(n > 0) || size === 0) return null;
    return { start: Math.max(0, size - n), end: size - 1 };
  }
  const start = Number(m[1]);
  const end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
  if (start >= size || start > end) return null;
  return { start, end };
}

/** A per-visitor count for one day: the next count, or null when the visitor has used `cap` already. */
export function underCap(counts: Record<string, number>, visitor: string, cap: number): Record<string, number> | null {
  const n = counts[visitor] ?? 0;
  return n >= cap ? null : { ...counts, [visitor]: n + 1 };
}

/** How long a refused translation is remembered: a day, after which it may be tried once more. */
export const REFUSAL_TTL_MS = 24 * 3600 * 1000;

/** Whether a cached refusal still stands (refusals stored before they carried a time are treated as expired). */
export function refusalStands(v: { refused?: boolean; at?: string }, now = Date.now()): boolean {
  if (!v.refused) return false;
  const at = v.at ? Date.parse(v.at) : NaN;
  return Number.isFinite(at) && now - at < REFUSAL_TTL_MS;
}

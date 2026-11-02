/**
 * A run's pipeline named by its tag, never as "today's": records keep the tag they were made with (lib/experiment.ts
 * PIPELINE; data/bench/pipelines.json), and "today's" goes stale the day the method changes.
 */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10-27c" → "the 27 October pipeline (2026-10-27c)" */
export function pipelineName(tag: string | undefined, stricter = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(tag ?? "");
  if (!m) return stricter ? "a stricter pipeline" : "a later pipeline";
  return `the ${stricter ? "stricter " : ""}${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} pipeline (${tag})`;
}

/** rewrites "today's pipeline" and "today's stricter pipeline" in a stored note as the pipeline its tag names */
export function datedPipeline(text: string, tag: string | undefined): string {
  return text.replace(/today[’']s (stricter )?pipeline/g, (_all, stricter?: string) => pipelineName(tag, !!stricter));
}

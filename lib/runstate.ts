/** /api/run's function is stopped at 300 s; a progress log untouched for longer than this belongs to no live run. */
export const STALE_MS = 6 * 60_000;

export type Log = { step: string; state: string }[];

/**
 * What a run's stored traces say about it, with no record and no error stored: "gone" when the run's artefacts were
 * deleted (its log reached "report done", or the clip it stored after the upload step is missing), "failed" when its
 * log has not moved for longer than any run can take (the function was stopped between steps), else "running".
 */
export function runState(log: Log, ageMs: number | null, clipStored: boolean): "running" | "gone" | "failed" {
  const did = (step: string) => log.some((p) => p.step === step && p.state === "done");
  if (did("report")) return "gone";
  // the clip is written as the upload step finishes (onPrepared): a log past that step with no clip was deleted
  if (did("upload") && !clipStored) return "gone";
  if (ageMs !== null && ageMs > STALE_MS) return "failed";
  return "running";
}

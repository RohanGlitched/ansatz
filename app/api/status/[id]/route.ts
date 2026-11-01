import { getObject, objectSize, objectUpdated } from "@/lib/store";
import { runState, type Log } from "@/lib/runstate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lets a page whose live feed dropped find out whether its experiment finished. An id that never ran is a 404, and so
 * is a run whose record is gone: a progress log is not proof of a running experiment. A log that reached "report done"
 * with no record left, or whose stored clip is missing, means the run was deleted; a log that stopped moving beyond the
 * function's time limit means the run died between steps, and is reported as failed rather than running forever.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{6,40}$/.test(id)) return Response.json({ state: "unknown" }, { status: 404 });
  if (await getObject(`experiments/${id}.json`).catch(() => null)) return Response.json({ state: "done" });
  const err = await getObject(`errors/${id}.json`).catch(() => null);
  if (err) return Response.json({ state: "failed", ...JSON.parse(new TextDecoder().decode(err)) });
  // /api/run writes the progress log (empty) as soon as a run starts: no log, no error and no record means no such run
  const prog = await getObject(`progress/${id}.json`).catch(() => null);
  if (!prog) return Response.json({ state: "unknown" }, { status: 404 });
  const parsed = JSON.parse(new TextDecoder().decode(prog)) as unknown;
  const log: Log = Array.isArray(parsed) ? (parsed as Log) : [];
  const [updated, clip] = await Promise.all([objectUpdated(`progress/${id}.json`).catch(() => null), objectSize(`clips/${id}.mp4`).catch(() => null)]);
  let state = runState(log, updated === null ? null : Date.now() - updated, clip !== null);
  if (state === "gone" && log.some((p) => p.step === "report" && p.state === "done")) {
    // the record is written just after the report step: give a run that is finishing a moment before calling it gone
    await new Promise((r) => setTimeout(r, 1500));
    if (await getObject(`experiments/${id}.json`).catch(() => null)) return Response.json({ state: "done" });
  }
  if (state === "gone") return Response.json({ state: "gone", message: "This experiment’s record is no longer stored." }, { status: 404 });
  if (state === "failed") return Response.json({ state: "failed", message: "This experiment stopped before it finished (its server function ran out of time between steps). Try again, or try a shorter clip.", step: log.at(-1)?.step });
  return Response.json({ state, progress: log });
}

import { getObject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Lets a page whose live feed dropped find out whether its experiment finished. An id that never ran is a 404, and so
 * is a run whose record is gone: a progress log that reached "report done" with no record left means the record was
 * deleted (the log is not proof of a running experiment).
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
  const log = JSON.parse(new TextDecoder().decode(prog)) as { step: string; state: string }[];
  if (Array.isArray(log) && log.some((p) => p.step === "report" && p.state === "done")) {
    // the record is written just after the report step: give a run that is finishing a moment before calling it gone
    await new Promise((r) => setTimeout(r, 1500));
    if (await getObject(`experiments/${id}.json`).catch(() => null)) return Response.json({ state: "done" });
    return Response.json({ state: "gone" }, { status: 404 });
  }
  return Response.json({ state: "running", progress: log });
}

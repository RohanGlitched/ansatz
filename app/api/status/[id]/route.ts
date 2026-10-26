import { getObject } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lets a page whose live feed dropped find out whether its experiment finished. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{6,40}$/.test(id)) return Response.json({ state: "unknown" }, { status: 404 });
  if (await getObject(`experiments/${id}.json`).catch(() => null)) return Response.json({ state: "done" });
  const err = await getObject(`errors/${id}.json`).catch(() => null);
  if (err) return Response.json({ state: "failed", ...JSON.parse(new TextDecoder().decode(err)) });
  return Response.json({ state: "running" });
}

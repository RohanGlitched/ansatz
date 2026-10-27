import { getExperiment, strobeOf } from "@/lib/experiments";

export const runtime = "nodejs";

/** A print's strobe masks, fetched by listing pages when the print scrolls into view. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await getExperiment(id);
  if (!e) return Response.json([], { status: 404 });
  return Response.json(strobeOf(e), { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
}

import { crossOrigin, sameOrigin } from "@/lib/origin";
import { createSeries } from "@/lib/series";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts a series: a link that gathers several runs of one pendulum at different lengths. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossOrigin();
  const { title = "" } = (await req.json().catch(() => ({}))) as { title?: string };
  const s = await createSeries(String(title));
  return Response.json({ id: s.id });
}

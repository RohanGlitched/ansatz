import { underCap } from "@/lib/guards";
import { visitorOf } from "@/lib/limits";
import { crossOrigin, sameOrigin } from "@/lib/origin";
import { createSeries } from "@/lib/series";
import { updateJson } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Series one visitor may start in a day: each is a stored record, and a link is all a class needs. */
const SERIES_PER_VISITOR = Number(process.env.SERIES_PER_VISITOR ?? 10);

/** Starts a series: a link that gathers several runs of one pendulum at different lengths. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossOrigin();
  // counted per visitor per day in one conditional write; a count that can't be written doesn't start a series
  const visitor = visitorOf(req);
  const day = new Date().toISOString().slice(0, 10);
  const counted = await updateJson<{ byVisitor: Record<string, number> }>(`usage/series-${day}.json`, { byVisitor: {} }, (d) => {
    const next = underCap(d.byVisitor, visitor, SERIES_PER_VISITOR);
    return next ? { byVisitor: next } : null;
  }).catch(() => null);
  if (!counted) return Response.json({ error: `You have started ${SERIES_PER_VISITOR} series today, the most one visitor can. The limit resets at midnight UTC.` }, { status: 429 });
  const { title = "" } = (await req.json().catch(() => ({}))) as { title?: string };
  const s = await createSeries(String(title));
  return Response.json({ id: s.id });
}

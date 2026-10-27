import { createSeries } from "@/lib/series";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Starts a series: a link that gathers several runs of one pendulum at different lengths. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return Response.json({ error: "Cross-origin requests are not accepted." }, { status: 403 });
  const { title = "" } = (await req.json().catch(() => ({}))) as { title?: string };
  const s = await createSeries(String(title));
  return Response.json({ id: s.id });
}

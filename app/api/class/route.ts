import { createClass } from "@/lib/classes";
import { visitorOf } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Makes a class link: its own quota of runs for a week. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return Response.json({ error: "Cross-origin requests are not accepted." }, { status: 403 });
  const { name = "" } = (await req.json().catch(() => ({}))) as { name?: string };
  const r = await createClass(String(name), visitorOf(req));
  if (!r.ok) return Response.json({ error: r.why }, { status: 429 });
  return Response.json({ code: r.cls.code, name: r.cls.name, quota: r.cls.quota, expiresAt: r.cls.expiresAt });
}

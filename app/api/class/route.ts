import { crossOrigin, sameOrigin } from "@/lib/origin";
import { createClass } from "@/lib/classes";
import { visitorOf } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Makes a class link: its own quota of runs for a week. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return crossOrigin();
  const { name = "" } = (await req.json().catch(() => ({}))) as { name?: string };
  const r = await createClass(String(name), visitorOf(req));
  if (!r.ok) return Response.json({ error: r.why }, { status: 429 });
  return Response.json({ code: r.cls.code, name: r.cls.name, quota: r.cls.quota, expiresAt: r.cls.expiresAt });
}

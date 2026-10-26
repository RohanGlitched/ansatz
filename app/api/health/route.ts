import { META_BASE } from "@/lib/meta/client";
import { usageToday } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** What this deployment can reach right now: Meta's model list, storage, ffmpeg, today's usage. */
export async function GET() {
  const out: Record<string, unknown> = { at: new Date().toISOString(), region: process.env.VERCEL_REGION ?? "local" };
  try {
    const r = await fetch(`${META_BASE}/models`, { headers: { authorization: `Bearer ${(process.env.META_API_KEY ?? "").trim()}` }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    const j = (await r.json().catch(() => ({}))) as { data?: { id: string }[]; error?: { message?: string } };
    out.models = r.ok ? (j.data ?? []).map((m) => m.id) : { status: r.status, error: j.error?.message };
  } catch (e) {
    out.models = { error: (e as Error).message };
  }
  try {
    out.usage = await usageToday();
    out.storage = "ok";
  } catch (e) {
    out.storage = (e as Error).message;
  }
  try {
    const mod = (await import("ffmpeg-static")) as unknown as { default: string | null };
    const { existsSync } = await import("node:fs");
    out.ffmpeg = mod.default && existsSync(mod.default) ? "ok" : "missing";
  } catch (e) {
    out.ffmpeg = (e as Error).message;
  }
  return Response.json(out, { headers: { "cache-control": "no-store" } });
}

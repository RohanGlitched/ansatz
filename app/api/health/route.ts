import { META_BASE } from "@/lib/meta/client";
import { usageToday } from "@/lib/limits";
import { sameSecret } from "@/lib/secret";
import { getExperiment, recentIds, showcaseIds } from "@/lib/experiments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USED = ["sam-3.1", "muse-spark-1.3", "muse-wonder-1.0", "muse-voice-transcribe-1.0"];
let cached: { at: number; value: Record<string, string> } | null = null;

/**
 * Whether each model Ansatz uses is reachable. Meta's model list is asked first; it has come back empty under load,
 * so a model it leaves out is reported by the last experiment that called it instead. Cached 5 minutes.
 */
async function modelStatus() {
  if (cached && Date.now() - cached.at < 300_000) return cached.value;
  const key = (process.env.META_API_KEY ?? "").trim();
  const value: Record<string, string> = {};
  let listed = new Set<string>();
  for (let i = 0; i < 2 && !listed.size; i++) {
    const r = await fetch(`${META_BASE}/models`, { headers: { authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (r?.ok) listed = new Set((((await r.json().catch(() => ({}))) as { data?: { id: string }[] }).data ?? []).map((m) => m.id));
  }
  for (const id of USED) if (listed.has(id)) value[id] = "listed by the Meta API just now";
  const missing = USED.filter((id) => !value[id]);
  if (missing.length) {
    for (const eid of await recentIds(8)) {
      const e = await getExperiment(eid).catch(() => null);
      for (const id of missing) {
        if (value[id] || !e?.ledger.calls.some((c) => c.model.startsWith(id))) continue;
        value[id] = `answered an experiment at ${e.createdAt}`;
      }
      if (missing.every((id) => value[id])) break;
    }
    // then the published showcases, which record every call they made
    for (const sid of await showcaseIds()) {
      if (missing.every((id) => value[id])) break;
      const e = await getExperiment(sid).catch(() => null);
      for (const id of missing) if (!value[id] && e?.ledger.calls.some((c) => c.model.startsWith(id))) value[id] = `answered the ${e.title} showcase at ${e.createdAt}`;
    }
    for (const id of missing) value[id] ??= "not listed just now, and no recorded experiment called it";
  }
  cached = { at: Date.now(), value };
  return value;
}

/** What this deployment can reach right now: Meta's model list, storage, ffmpeg, today's usage. */
export async function GET(req: Request) {
  const out: Record<string, unknown> = { at: new Date().toISOString(), region: process.env.VERCEL_REGION ?? "local" };
  out.models = await modelStatus();
  try {
    // usage is the builder's business: shown only with the admin token
    const u = await usageToday();
    if (sameSecret(req.headers.get("x-admin-token"), process.env.ADMIN_TOKEN)) out.usage = u;
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

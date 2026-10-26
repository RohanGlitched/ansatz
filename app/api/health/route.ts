import { META_BASE } from "@/lib/meta/client";
import { usageToday } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const USED = ["sam-3.1", "muse-spark-1.3", "muse-wonder-1.0", "muse-voice-transcribe-1.0"];
let cached: { at: number; value: Record<string, string> } | null = null;

/** Each model Ansatz uses, looked up one by one (the list endpoint has come back empty under load); cached 5 minutes. */
async function modelStatus() {
  if (cached && Date.now() - cached.at < 300_000) return cached.value;
  const key = (process.env.META_API_KEY ?? "").trim();
  const value: Record<string, string> = {};
  await Promise.all(
    USED.map(async (id) => {
      for (let i = 0; i < 2; i++) {
        const r = await fetch(`${META_BASE}/models/${id}`, { headers: { authorization: `Bearer ${key}` }, cache: "no-store", signal: AbortSignal.timeout(8000) }).catch(() => null);
        if (r?.ok) {
          value[id] = "available";
          return;
        }
        value[id] = r ? `HTTP ${r.status}` : "unreachable";
      }
    }),
  );
  cached = { at: Date.now(), value };
  return value;
}

/** What this deployment can reach right now: Meta's model list, storage, ffmpeg, today's usage. */
export async function GET() {
  const out: Record<string, unknown> = { at: new Date().toISOString(), region: process.env.VERCEL_REGION ?? "local" };
  out.models = await modelStatus();
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

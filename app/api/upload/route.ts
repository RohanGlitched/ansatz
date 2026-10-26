import { startResumableUpload } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hands the browser a place to upload its clip: a GCS resumable session in production, a local route in dev. */
export async function POST(req: Request) {
  const { type = "video/mp4", size = 0 } = (await req.json().catch(() => ({}))) as { type?: string; size?: number };
  if (size > 200 * 1024 * 1024) return Response.json({ error: "That clip is over 200 MB. Trim it to the motion and try again." }, { status: 413 });
  const ext = /quicktime/.test(type) ? "mov" : /webm/.test(type) ? "webm" : /mp4|m4v/.test(type) ? "mp4" : "bin";
  const key = `uploads/${crypto.randomUUID()}.${ext}`;
  const origin = req.headers.get("origin") ?? new URL(req.url).origin;
  const url = await startResumableUpload(key, type, origin);
  return Response.json({ key, url: url ?? `/api/upload/local?key=${encodeURIComponent(key)}` });
}

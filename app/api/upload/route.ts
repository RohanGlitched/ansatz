import { countUpload, visitorOf } from "@/lib/limits";
import { crossOrigin, sameOrigin } from "@/lib/origin";
import { startResumableUpload } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Hands the browser a place to upload its clip: a GCS resumable session in production, a local route in dev. */
export async function POST(req: Request) {
  // only this site's pages may open an upload session (as /api/run): another site can't make its visitors fill the bucket
  if (!sameOrigin(req)) return crossOrigin();
  const { type = "video/mp4", size = 0 } = (await req.json().catch(() => ({}))) as { type?: string; size?: number };
  if (!(Number(size) > 0)) return Response.json({ error: "Send the clip's size in bytes." }, { status: 400 });
  if (size > 200 * 1024 * 1024) return Response.json({ error: "That clip is over 200 MB. Trim it to the motion and try again." }, { status: 413 });
  // counted once the request is valid, so malformed calls don't use up a shared connection's day
  if (!(await countUpload(visitorOf(req)))) return Response.json({ error: "That is a lot of uploads for one day. The limit resets at midnight UTC." }, { status: 429 });
  const ext = /quicktime/.test(type) ? "mov" : /webm/.test(type) ? "webm" : /mp4|m4v/.test(type) ? "mp4" : "bin";
  const key = `uploads/${crypto.randomUUID()}.${ext}`;
  // the storage session answers browser preflights for this origin only: the site's own (an Origin header has just been
  // checked to name this host), never one a caller made up
  const origin = siteOrigin(req);
  // the session is pinned to the stated size, so it can't be used to store anything bigger
  const url = await startResumableUpload(key, type, origin, Number(size));
  return Response.json({ key, url: url ?? `/api/upload/local?key=${encodeURIComponent(key)}` });
}

/** This site's origin: the request's Origin header once sameOrigin has passed (it names this host), else the URL's own. */
function siteOrigin(req: Request) {
  const self = new URL(req.url);
  const o = req.headers.get("origin");
  try {
    if (o && new URL(o).host === self.host) return new URL(o).origin;
  } catch {
    /* unparsable: fall through */
  }
  return self.origin;
}

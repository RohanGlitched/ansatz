import { byteRange } from "@/lib/guards";
import { getObject } from "@/lib/store";

export const runtime = "nodejs";

const cache = new Map<string, Uint8Array>();

/** Serves an experiment's normalised clip with byte ranges, so browsers can seek frame by frame. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{6,40}$/.test(id)) return new Response("Not found", { status: 404 });
  let buf = cache.get(id);
  if (!buf) {
    const got = await getObject(`clips/${id}.mp4`);
    if (!got) return new Response("Not found", { status: 404 });
    buf = got;
    if (cache.size > 12) cache.delete(cache.keys().next().value!);
    cache.set(id, buf);
  }
  const size = buf.byteLength;
  const range = req.headers.get("range");
  const headers: Record<string, string> = { "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "public, max-age=31536000, immutable" };
  // "bytes=a-b", "bytes=a-" and the suffix "bytes=-n" (the last n bytes), parsed in lib/guards.ts
  const r = byteRange(range, size);
  if (r === null) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
  if (r !== "all") return new Response(buf.slice(r.start, r.end + 1) as BodyInit, { status: 206, headers: { ...headers, "content-range": `bytes ${r.start}-${r.end}/${size}`, "content-length": String(r.end - r.start + 1) } });
  return new Response(buf as BodyInit, { headers: { ...headers, "content-length": String(size) } });
}

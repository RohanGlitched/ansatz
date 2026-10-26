import { putObject } from "@/lib/store";

export const runtime = "nodejs";

/** Development only: stores the clip in .data when no bucket is configured. */
export async function PUT(req: Request) {
  if (process.env.GCS_BUCKET) return Response.json({ error: "Not available." }, { status: 404 });
  const key = new URL(req.url).searchParams.get("key") ?? "";
  if (!/^uploads\/[a-z0-9-]{8,60}\.\w+$/.test(key)) return Response.json({ error: "Bad key." }, { status: 400 });
  const buf = new Uint8Array(await req.arrayBuffer());
  await putObject(key, buf, req.headers.get("content-type") ?? "video/mp4");
  return Response.json({ ok: true, bytes: buf.byteLength });
}

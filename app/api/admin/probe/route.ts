import { sameSecret } from "@/lib/secret";
import { META_BASE } from "@/lib/meta/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin-only: tries small Responses calls from this region, one feature at a time. */
export async function POST(req: Request) {
  if (!sameSecret(req.headers.get("x-admin-token"), process.env.ADMIN_TOKEN)) return new Response("Not found", { status: 404 });
  const key = (process.env.META_API_KEY ?? "").trim();
  const base = { model: "muse-spark-1.3", reasoning: { effort: "minimal" }, max_output_tokens: 400, input: [{ role: "user", content: [{ type: "input_text", text: "Say ok." }] }] };
  const variants: Record<string, unknown> = {
    plain: base,
    search: { ...base, tools: [{ type: "web_search" }] },
    schema: { ...base, text: { format: { type: "json_schema", name: "x", schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] } } } },
    searchSchema: { ...base, tools: [{ type: "web_search" }], text: { format: { type: "json_schema", name: "x", schema: { type: "object", properties: { a: { type: "string" } }, required: ["a"] } } } },
    wonder: { ...base, model: "muse-wonder-1.0" },
  };
  const out: Record<string, unknown> = { region: process.env.VERCEL_REGION };
  if (new URL(req.url).searchParams.get("video")) {
    const clip = new Uint8Array(await (await fetch(new URL("/samples/pendulum.mp4", req.url))).arrayBuffer());
    const form = new FormData();
    form.append("file", new Blob([clip], { type: "video/mp4" }), "clip.mp4");
    form.append("purpose", "user_data");
    const up = await fetch(`${META_BASE}/files`, { method: "POST", headers: { authorization: `Bearer ${key}` }, body: form });
    const upText = await up.text();
    out.upload = `${up.status} ${upText.slice(0, 200)}`;
    const fid = (() => { try { return JSON.parse(upText).id as string; } catch { return ""; } })();
    for (const [k, part] of Object.entries({ inputFile: { type: "input_file", file_id: fid }, inputVideo: { type: "input_video", file_id: fid } })) {
      const body = { ...base, input: [{ role: "user", content: [part, { type: "input_text", text: "What moves? One line." }] }] };
      const r = await fetch(`${META_BASE}/responses`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) });
      out[k] = `${r.status} ${(await r.text()).slice(0, 200)}`;
    }
    return Response.json(out);
  }
  for (const [k, body] of Object.entries(variants)) {
    const r = await fetch(`${META_BASE}/responses`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) }).catch((e) => e as Error);
    out[k] = r instanceof Error ? r.message : `${r.status} ${(await r.text()).slice(0, 160)}`;
  }
  return Response.json(out);
}

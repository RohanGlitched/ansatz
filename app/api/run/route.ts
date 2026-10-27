import { newId, runExperiment, type Progress } from "@/lib/experiment";
import { checkAndCount, visitorOf } from "@/lib/limits";
import { getObject, putObject } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

type Body = { key?: string; narration?: string; noun?: string; slowMotion?: number; ruler?: { noun?: string; metres?: number }; sample?: boolean };

/** Runs one experiment and streams its progress as server-sent events; the last event carries the id. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return Response.json({ error: "Cross-origin requests are not accepted." }, { status: 403 });
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }
  if (!body.key || !/^uploads\/[a-z0-9-]{8,60}\.(mp4|mov|webm|m4v|bin)$/.test(body.key)) return Response.json({ error: "Upload the clip first." }, { status: 400 });
  const admin = !!process.env.ADMIN_TOKEN && req.headers.get("x-admin-token") === process.env.ADMIN_TOKEN;
  const gate = await checkAndCount(visitorOf(req), admin);
  if (!gate.ok) return Response.json({ error: gate.why }, { status: 429 });

  const video = await getObject(body.key);
  if (!video) return Response.json({ error: "The upload didn't arrive. Try again." }, { status: 404 });
  if (video.byteLength > 200 * 1024 * 1024) return Response.json({ error: "That clip is over 200 MB. Trim it to the motion." }, { status: 413 });

  const id = newId();
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(ctrl) {
      // writes after the stream closed (the watchdog, or a dropped client) are ignored: the run carries on and is saved
      const write = (chunk: string) => {
        try {
          ctrl.enqueue(enc.encode(chunk));
        } catch {
          /* closed */
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      const ping = setInterval(() => write(": keep-alive\n\n"), 10_000);
      send("started", { id });
      // the function is stopped at 300 s; record a readable failure first so a waiting page can say what happened
      let finished = false;
      const watchdog = setTimeout(async () => {
        if (finished) return;
        const failure = { message: "This experiment ran out of time on the server (5 minutes). Try a shorter clip, or name the moving object yourself.", step: "report" };
        await putObject(`errors/${id}.json`, JSON.stringify(failure), "application/json").catch(() => {});
        try {
          send("error", failure);
          ctrl.close();
        } catch {
          /* already closed */
        }
      }, 285_000);
      const log: Progress[] = [];
      try {
        const exp = await runExperiment(
          {
            id,
            video,
            filename: body.key!.split("/").pop()!,
            narrationText: body.narration?.slice(0, 2000) || undefined,
            sample: body.sample === true,
            hints: {
              noun: body.noun?.trim().slice(0, 60) || undefined,
              slowMotion: body.slowMotion && body.slowMotion > 1 && body.slowMotion <= 64 ? body.slowMotion : undefined,
              ruler: body.ruler?.noun && Number(body.ruler.metres) > 0.005 && Number(body.ruler.metres) < 20 ? { noun: String(body.ruler.noun).slice(0, 60), metres: Number(body.ruler.metres) } : undefined,
            },
            onPrepared: async (v) => {
              await putObject(`clips/${id}.mp4`, v, "video/mp4");
              return `/api/clip/${id}`;
            },
          },
          (p: Progress) => {
            send("progress", p);
            // keep the progress server-side too, so a page whose live feed drops can pick it up again
            log.push(p);
            if (p.state !== "start") void putObject(`progress/${id}.json`, JSON.stringify(log), "application/json").catch(() => {});
          },
        );
        await putObject(`experiments/${id}.json`, JSON.stringify(exp), "application/json");
        send("done", { id });
      } catch (e) {
        const failure = { message: (e as Error).message, step: (e as { step?: string }).step };
        await putObject(`errors/${id}.json`, JSON.stringify(failure), "application/json").catch(() => {});
        send("error", failure);
      } finally {
        finished = true;
        clearTimeout(watchdog);
        clearInterval(ping);
        try {
          ctrl.close();
        } catch {
          /* closed by the watchdog */
        }
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream", "cache-control": "no-store", "x-accel-buffering": "no" } });
}

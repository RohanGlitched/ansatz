import { getClass } from "@/lib/classes";
import { getExperiment } from "@/lib/experiments";
import { getSeries } from "@/lib/series";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Whether a run, class or series exists, for the middleware: a wrong address on a page rendered per request is sent to
 * the site's 404 page before rendering, so the 404 arrives as server-rendered HTML (a notFound() thrown while a
 * dynamic page renders reaches the browser as an empty shell). 204 when it exists, 404 when it doesn't.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind"), id = q.get("id") ?? "";
  const found =
    kind === "x" ? !!(await getExperiment(id).catch(() => null)) : kind === "class" ? !!(await getClass(id).catch(() => null)) : kind === "series" ? !!(await getSeries(id).catch(() => null)) : false;
  // a record, once written, stays; a missing one may be written a moment later, so only a hit is cached
  return new Response(null, { status: found ? 204 : 404, headers: { "cache-control": found ? "public, max-age=300, s-maxage=86400" : "no-store" } });
}

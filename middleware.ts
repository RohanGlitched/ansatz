import { NextResponse, type NextRequest } from "next/server";

const LANGS = new Set(["hi", "ta", "bn", "mr", "te", "es"]);
// a visitor's run id (lib/experiment.ts newId): ten letters and digits, no hyphen; every shipped run's id differs
const RUN = /^[a-hj-km-np-z2-9]{10}$/;

/** Asks /api/exists; true unless the answer is a clear 404 (a failed check lets the page decide). */
async function exists(req: NextRequest, kind: "x" | "class" | "series", id: string) {
  const r = await fetch(new URL(`/api/exists?kind=${kind}&id=${encodeURIComponent(id)}`, req.url)).catch(() => null);
  return r?.status !== 404;
}

// an address no route matches: the site's 404 page, rendered on the server with a 404 status
const missing = (req: NextRequest) => NextResponse.rewrite(new URL("/_missing", req.url));

/**
 * Experiment pages: the shipped runs are built ahead (/x/[id], /x/[id]/[lang]; any other id there is a 404); a
 * visitor's run is rewritten to the page rendered on each request (/x/[id]/live), keeping its address. ?lang= on an
 * experiment page redirects to its language address. Pages rendered per request (a visitor's run, a lab report, a
 * class, a series) check first that what they show exists, so a wrong address gets the real 404 page.
 */
export async function middleware(req: NextRequest) {
  const url = req.nextUrl;
  const parts = url.pathname.split("/").filter(Boolean);
  const q = url.searchParams.get("lang");
  const lang = q && LANGS.has(q) ? q : null;
  if (parts[0] === "class" && parts.length === 2 && parts[1] !== "new") return (await exists(req, "class", parts[1])) ? NextResponse.next() : missing(req);
  if (parts[0] === "series" && parts.length === 2) return (await exists(req, "series", parts[1])) ? NextResponse.next() : missing(req);
  if (parts[0] !== "x") return NextResponse.next();
  if (parts.length === 2 && lang) {
    const to = url.clone();
    to.pathname = `/x/${parts[1]}/${lang}`;
    to.searchParams.delete("lang");
    return NextResponse.redirect(to, 308);
  }
  if (RUN.test(parts[1] ?? "") && (parts.length === 2 || (parts.length === 3 && LANGS.has(parts[2])))) {
    if (!(await exists(req, "x", parts[1]))) return missing(req);
    const to = url.clone();
    to.pathname = `/x/${parts[1]}/live`;
    if (parts[2]) to.searchParams.set("lang", parts[2]);
    return NextResponse.rewrite(to);
  }
  if (parts.length === 3 && parts[2] === "report" && !(await exists(req, "x", parts[1]))) return missing(req);
  if (!lang) return NextResponse.next();
  // the lab report keeps ?lang=, passed on to the root layout
  const headers = new Headers(req.headers);
  headers.set("x-lang", lang);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/x/:path*", "/class/:path*", "/series/:path*"] };

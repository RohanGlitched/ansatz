import { NextResponse, type NextRequest } from "next/server";

const LANGS = new Set(["hi", "ta", "bn", "mr", "te", "es"]);

/** Passes ?lang= to the root layout, so a page read in Hindi says so in <html lang>. */
export function middleware(req: NextRequest) {
  const lang = req.nextUrl.searchParams.get("lang");
  if (!lang || !LANGS.has(lang)) return NextResponse.next();
  const headers = new Headers(req.headers);
  headers.set("x-lang", lang);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/x/:path*"] };

import { readFile } from "node:fs/promises";
import path from "node:path";
import { BENCH_FILES } from "../files";

// the files ship with the app and change only with a deploy: each is read once at build and served from the cache
export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(BENCH_FILES).map((file) => ({ file }));
}

/** A benchmark file from data/bench, byte for byte, read-only. Only names on the allow-list are served. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  if (!Object.hasOwn(BENCH_FILES, file)) return Response.json({ error: "No such benchmark file.", files: Object.keys(BENCH_FILES).map((f) => `/bench/${f}`) }, { status: 404 });
  const body = await readFile(path.join(process.cwd(), "data", "bench", file), "utf8");
  return new Response(body, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" },
  });
}

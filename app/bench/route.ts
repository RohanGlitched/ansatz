import { BENCH_FILES } from "./files";

export const dynamic = "force-static";

const SITE = "https://ansatz-lab.vercel.app";
const REPO = "https://github.com/RohanGlitched/ansatz/blob/main";

/** The index of the benchmark files: what each holds, the script that wrote it, and the page that shows it. */
export function GET() {
  const files = Object.entries(BENCH_FILES).map(([name, f]) => ({
    url: `${SITE}/bench/${name}`,
    source: `${REPO}/data/bench/${name}`,
    what: f.what,
    script: f.script ?? null,
    shownOn: `${SITE}${f.shownOn}`,
  }));
  const body = {
    about: "Ansatz's benchmark results, read-only, exactly as stored in the repository's data/bench folder. Each page that quotes a number computes it from these files. Read the guide at /llms.txt for which figure is which.",
    guide: `${SITE}/llms.txt`,
    files,
  };
  return new Response(JSON.stringify(body, null, 2) + "\n", { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=3600", "access-control-allow-origin": "*" } });
}

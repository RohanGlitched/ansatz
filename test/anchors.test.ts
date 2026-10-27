import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BENCH_FILES } from "../app/bench/files";

// Every "#fragment" link in the agents' guide (/llms.txt) and on /judges must land on an element with that id. Read from
// the source files only: nothing is fetched or rendered.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f: string) => readFileSync(path.join(root, f), "utf8");

/** The source files that render each page (a page's id can sit in a component it renders). */
function sourcesOf(page: string): string[] {
  if (page === "/") return ["app/page.tsx", "components/MoonHero.tsx"];
  if (page === "/judges") return ["app/judges/page.tsx"];
  if (page === "/proof") return ["app/proof/page.tsx"];
  if (page === "/how") return ["app/how/page.tsx"];
  if (page === "/x") return ["app/x/page.tsx"];
  if (page === "/new") return ["app/new/page.tsx", "components/NewExperiment.tsx"];
  if (/^\/x\/[a-z0-9-]+$/.test(page)) return ["app/x/[id]/page.tsx", "app/x/[id]/view.tsx"].filter((f) => { try { read(f); return true; } catch { return false; } });
  if (/^\/series\/[a-z0-9-]+$/.test(page)) return ["app/series/[id]/page.tsx"];
  if (/^\/class\/[a-z0-9]+$/.test(page)) return ["app/class/[code]/page.tsx"];
  throw new Error(`no source files known for ${page}: add it to sourcesOf in test/anchors.test.ts`);
}

/** Literal ids in a page's source: id="x", id={"x"} or id={`x`}. */
function idsOf(page: string): Set<string> {
  const ids = new Set<string>();
  for (const f of sourcesOf(page)) for (const m of read(f).matchAll(/\bid=\{?["'`]([a-z][a-z0-9-]*)["'`]\}?/g)) ids.add(m[1]);
  return ids;
}

type Link = { from: string; page: string; frag: string };

function linksIn(file: string, self: string): Link[] {
  const src = read(file);
  const out: Link[] = [];
  // `${SITE}/proof#models` in a template, or "/proof#models" / `/x/moon-jump#same-jump` as a string
  for (const m of src.matchAll(/(?:\$\{SITE\}|["'`])(\/[A-Za-z0-9/-]*)#([a-z][a-z0-9-]*)/g)) out.push({ from: file, page: m[1], frag: m[2] });
  // a link within the same page: href="#bring-a-clip"
  for (const m of src.matchAll(/href=["'`{]+#([a-z][a-z0-9-]*)/g)) out.push({ from: file, page: self, frag: m[1] });
  // the guide's "Sections: #a (…), #b" lists after a page address
  for (const line of src.split("\n")) {
    const at = /\$\{SITE\}(\/[A-Za-z0-9/-]*) : .*Sections: (.*)$/.exec(line);
    if (at) for (const m of at[2].matchAll(/#([a-z][a-z0-9-]*)/g)) out.push({ from: file, page: at[1], frag: m[1] });
  }
  return out;
}

test("every #fragment in llms.txt and on /judges is an id on its page", () => {
  const links = [...linksIn("app/llms.txt/route.ts", "/llms.txt"), ...linksIn("app/judges/page.tsx", "/judges")];
  assert.ok(links.length >= 10, `expected the guide and /judges to carry anchored links, found ${links.length}`);
  const missing = links.filter((l) => !idsOf(l.page).has(l.frag)).map((l) => `${l.from}: ${l.page}#${l.frag}`);
  assert.deepEqual(missing, []);
});

test("every benchmark file names the section that shows it, and that section exists", () => {
  const missing = Object.entries(BENCH_FILES)
    .map(([name, f]) => {
      const [page, frag] = f.shownOn.split("#");
      return !frag ? `${name}: ${f.shownOn} has no #section` : idsOf(page).has(frag) ? null : `${name}: ${f.shownOn}`;
    })
    .filter(Boolean);
  assert.deepEqual(missing, []);
});

test("every file in data/bench that a page reads is served at /bench", () => {
  const pages = ["app/proof/page.tsx", "app/judges/page.tsx", "app/llms.txt/route.ts", "app/proof/slow.ts", "app/series/[id]/page.tsx", "app/how/page.tsx"];
  const cited = new Set<string>();
  for (const f of pages) {
    let src = "";
    try {
      src = read(f);
    } catch {
      continue;
    }
    // "data", "bench", "x.json" in a path.join, or read("x.json") / read<…>("x.json") through a helper
    for (const m of src.matchAll(/"bench",\s*"([a-z0-9-]+\.json)"|\bread(?:<[^>]*>)?\("([a-z0-9-]+\.json)"\)|@\/data\/bench\/([a-z0-9-]+\.json)/g)) cited.add(m[1] ?? m[2] ?? m[3]);
  }
  assert.ok(cited.size > 0);
  assert.deepEqual([...cited].filter((f) => !Object.hasOwn(BENCH_FILES, f)), []);
});

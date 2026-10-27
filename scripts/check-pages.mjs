// usage: node scripts/check-pages.mjs [baseUrl=http://localhost:3900] [--layout]
// Fetches every public page and fails on:
// - a page that doesn't return 200, or takes more than 3 s (only warned on a local dev server, which compiles on demand)
// - a number that rendered wrong (NaN, Infinity, "undefined" in text, ±0%, ± 0.000)
// - wording the judges caught overreaching: "no model saw / was given", "when the referee asks" with no "or" (the code
//   also calls Muse Wonder in on a poor fit), "The language model", and a 1.55 not labelled as the whole-run ratio
// - a wrong address that doesn't serve the 404 page's own heading in its HTML
// With --layout it also opens the key pages at 390 px wide and fails if any scrolls sideways. Run before each deploy.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const layout = args.includes("--layout");
const base = (args.find((a) => !a.startsWith("--")) ?? "http://localhost:3900").replace(/\/$/, "");
const enforceTime = base.startsWith("https://");
const BUDGET_MS = 3000;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const order = ["moon-jump", "moon-jump-slowed", "beach-ball-drag", "hardening-spring", "dry-friction-spring", "hindi-pendulum", "sample-pendulum", "big-swing", "bouncing-ball", "spring"];
const pages = ["/", "/judges", "/proof", "/how", "/new", "/x", "/class/new", "/class/demo23", "/class/jdgs26", "/series/pendulum-lengths", "/llms.txt", "/robots.txt", "/sitemap.xml", "/bench", "/bench/observer.json", "/icon.svg",
  ...order.flatMap((id) => [`/x/${id}`, `/x/${id}/report`, `/x/${id}/data.csv`, `/x/${id}/hi`])];
const broken = [/\bNaN\b/, /\bInfinity\b/, /±\s?0(\.0+)?%/, /±\s?0\.000(?!\d)/];

/** Wording that overreaches: each rule returns what it caught in the reader's text. */
const wording = [
  (t) => [...t.matchAll(/no model (?:ever )?(?:saw|was given)/gi)].map((m) => m[0]),
  // the clause must go on to the second trigger ("for one or the leading law misses its fitted frames…")
  (t) => [...t.matchAll(/when the referee asks/gi)].filter((m) => !/\bor\b/.test(t.slice(m.index, m.index + 160).split(/[.;)\n]/)[0])).map((m) => clip(t, m.index)),
  (t) => [...t.matchAll(/The language model/g)].map((m) => clip(t, m.index)),
  // 1.55 is the whole-run ratio of the two accelerations; the headline is the jump-for-jump 1.494, so 1.55 must say which it is
  (t) => [...t.matchAll(/(?<![\d.])1\.55(?!\d)(?!\s?(s|ms|m|cm|mm|kg|rad)\b)/g)].filter((m) => !/whole-run|ratio/i.test(t.slice(Math.max(0, m.index - 40), m.index + 44))).map((m) => clip(t, m.index)),
];
const clip = (t, i) => `“…${t.slice(Math.max(0, i - 50), i + 60).trim()}…”`;

/** Only the text a reader sees: scripts (the RSC payload carries "$undefined" markers), styles and tags dropped. */
function readerText(body, type) {
  if (!/html/.test(type)) return body;
  return body
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/<!-- -->/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

let fails = 0;
const fail = (msg) => {
  fails++;
  console.log(`FAIL ${msg}`);
};

for (const p of pages) {
  const t0 = performance.now();
  const r = await fetch(base + p).catch((e) => ({ status: 0, headers: new Headers(), text: async () => String(e) }));
  const body = await r.text();
  const ms = performance.now() - t0;
  const text = readerText(body, r.headers.get("content-type") ?? "text/html");
  const hits = broken.map((re) => text.match(re)?.[0]).filter(Boolean);
  if (/\bundefined\b/.test(text)) hits.push("undefined");
  // the wording rules read prose (pages and the plain-text guide), not data files whose numbers are times and positions
  if (/html|text\/plain/.test(r.headers.get("content-type") ?? "text/html")) for (const rule of wording) hits.push(...rule(text));
  if (r.status !== 200 || hits.length) fail(`${p} ${r.status} ${hits.join(" | ")}`);
  if (ms > BUDGET_MS) {
    if (enforceTime) fail(`${p} took ${(ms / 1000).toFixed(1)} s (budget ${BUDGET_MS / 1000} s)`);
    else console.log(`warn ${p} took ${(ms / 1000).toFixed(1)} s (a dev server compiles on first load; enforced only for https)`);
  }
}

// a wrong address must serve the real 404 page, in the HTML itself (not a blank shell filled in by the browser)
const heading = /<h1[^>]*>([^<]+)<\/h1>/.exec(readFileSync(path.join(root, "app", "not-found.tsx"), "utf8"))?.[1].trim();
for (const p of ["/x/does-not-exist", "/x/does-not-exist/report", "/no-such-page"]) {
  const r = await fetch(base + p).catch(() => null);
  const html = r ? readerText(await r.text(), "text/html") : "";
  if (!r || r.status !== 404 || !heading || !html.includes(heading)) fail(`${p} should be a 404 with “${heading ?? "the not-found heading"}” in its HTML (got ${r?.status ?? "no answer"})`);
}

if (layout) {
  // the Playwright install shared across this machine's projects (override with PLAYWRIGHT_PATH)
  const pw = process.env.PLAYWRIGHT_PATH ?? "I:/Programs/ListofHackathon/hackathons/01-arbitrum-open-house/submission/video/node_modules/playwright/index.mjs";
  const { chromium } = await import(pathToFileURL(pw).href);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  for (const p of ["/", "/judges", "/proof", "/x", "/x/moon-jump"]) {
    await page.goto(base + p, { waitUntil: "load", timeout: 120_000 });
    const { sw, cw, wide } = await page.evaluate(() => {
      const d = document.documentElement;
      // name the widest element, so a failure says where to look
      let wide = "";
      let max = d.clientWidth;
      for (const el of document.body.querySelectorAll("*")) {
        const r = el.getBoundingClientRect();
        if (r.right > max + 0.5) {
          max = r.right;
          wide = `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""} (${Math.round(r.right)} px)`;
        }
      }
      return { sw: d.scrollWidth, cw: d.clientWidth, wide };
    });
    if (sw > cw) fail(`${p} scrolls sideways at 390 px: ${sw} px wide in ${cw} px${wide ? `; widest: ${wide}` : ""}`);
    else console.log(`layout ${p} ok at 390 px`);
  }
  await browser.close();
}

console.log(fails ? `${fails} check(s) failed` : `all ${pages.length} pages ok${layout ? ", layout ok" : ""}`);
process.exit(fails ? 1 : 0);

// usage: node scripts/check-pages.mjs [baseUrl=http://localhost:3900]
// Fetches every public page and fails on a number that rendered wrong (NaN, Infinity, "undefined" in text, ±0%,
// ± 0.000) or a page that doesn't return 200. Run before each deploy.
const base = process.argv[2] ?? "http://localhost:3900";
const order = ["moon-jump", "moon-jump-slowed", "beach-ball-drag", "hardening-spring", "dry-friction-spring", "hindi-pendulum", "sample-pendulum", "big-swing", "bouncing-ball", "spring"];
const pages = ["/", "/judges", "/proof", "/how", "/new", "/x", "/class/new", "/class/demo23", "/class/jdgs26", "/series/pendulum-lengths", "/llms.txt", "/robots.txt", "/sitemap.xml",
  ...order.flatMap((id) => [`/x/${id}`, `/x/${id}/report`, `/x/${id}/data.csv`, `/x/${id}?lang=hi`])];
const bad = [/\bNaN\b/, /\bInfinity\b/, /±\s?0(\.0+)?%/, /±\s?0\.000(?!\d)/];
let fails = 0;
for (const p of pages) {
  const r = await fetch(base + p).catch((e) => ({ status: 0, text: async () => String(e) }));
  const html = await r.text();
  // only the text a reader sees: drop scripts (the RSC payload carries "$undefined" markers) and tags
  const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/<!-- -->/g, "");
  const hits = bad.map((re) => text.match(re)?.[0]).filter(Boolean);
  if (/\bundefined\b/.test(text)) hits.push("undefined");
  if (r.status !== 200 || hits.length) {
    fails++;
    console.log(`FAIL ${p} ${r.status} ${hits.join(", ")}`);
  }
}
console.log(fails ? `${fails} page(s) failed` : `all ${pages.length} pages ok`);
process.exit(fails ? 1 : 0);

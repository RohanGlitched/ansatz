// Full-page screenshots of local pages for design review (not part of the app).
// node scripts/shot.cjs <url> <out.png> [width=1440] [height=900] [--reduce]
const { chromium } = require("C:/Users/rohan/AppData/Roaming/npm/node_modules/@playwright/mcp/node_modules/playwright");
(async () => {
  const [url, out, w = "1440", h = "900"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  const b = await chromium.launch({ channel: "chrome" });
  const p = await b.newPage({ viewport: { width: +w, height: +h }, reducedMotion: process.argv.includes("--reduce") ? "reduce" : "no-preference" });
  const errors = [];
  p.on("pageerror", (e) => errors.push(String(e)));
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await p.goto(url, { waitUntil: "load", timeout: 180000 });
  await p.waitForTimeout(3500);
  await p.screenshot({ path: out, fullPage: !process.argv.includes("--viewport") });
  console.log(out, errors.length ? "ERRORS:\n" + errors.join("\n") : "no console errors");
  await b.close();
})();

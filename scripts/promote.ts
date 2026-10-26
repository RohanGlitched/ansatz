// usage: tsx scripts/promote.ts <run-name> <showcase-id> [--credit "..."] [--license "..."] [--page url]
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
const [name, id] = process.argv.slice(2);
const opt = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const e = JSON.parse(readFileSync(`.probe/runs/${name}.json`, "utf8"));
e.id = id;
e.source = { kind: "showcase", video: `/showcase/${id}.mp4`, credit: opt("--credit"), license: opt("--license"), page: opt("--page") };
mkdirSync("data/showcase", { recursive: true });
mkdirSync("public/showcase", { recursive: true });
writeFileSync(`data/showcase/${id}.json`, JSON.stringify(e));
copyFileSync(`.probe/runs/${name}.mp4`, `public/showcase/${id}.mp4`);
const orderF = "data/showcase/order.json";
const order: string[] = existsSync(orderF) ? JSON.parse(readFileSync(orderF, "utf8")) : [];
if (!order.includes(id)) order.push(id);
writeFileSync(orderF, JSON.stringify(order, null, 1));
console.log("promoted", id, (readFileSync(`data/showcase/${id}.json`).length / 1024).toFixed(0) + " KB");

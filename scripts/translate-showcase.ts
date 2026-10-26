// usage: tsx scripts/translate-showcase.ts [id ...]  writes data/showcase/translations/<id>.<lang>.json
import "./env";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { LANGUAGES, translate } from "../lib/translate";

const ids: string[] = process.argv.slice(2).length ? process.argv.slice(2) : [...JSON.parse(readFileSync("data/showcase/order.json", "utf8")), "moon-jump-slowed"];
mkdirSync("data/showcase/translations", { recursive: true });
for (const id of ids) {
  const e = JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8"));
  await Promise.all(
    Object.keys(LANGUAGES).map(async (lang) => {
      let t = null;
      for (let i = 0; i < 2 && !t; i++) t = await translate(e, lang).catch(() => null);
      writeFileSync(`data/showcase/translations/${id}.${lang}.json`, JSON.stringify(t ?? { refused: true }));
      console.log(id, lang, t ? "ok" : "REFUSED");
    }),
  );
}

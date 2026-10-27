// usage: tsx scripts/translate-ui.ts  writes data/i18n/<lang>.json from en.json with Muse Spark; refuses a lost {placeholder}
import "./env";
import { readFileSync, writeFileSync } from "node:fs";
import { Ledger, respondJson } from "../lib/meta/client";

const NAMES: Record<string, string> = { hi: "Hindi", ta: "Tamil", bn: "Bengali", mr: "Marathi", te: "Telugu", es: "Spanish" };
const en = JSON.parse(readFileSync("data/i18n/en.json", "utf8")) as Record<string, string>;
const ledger = new Ledger();
const ph = (s: string) => [...s.matchAll(/\{\w+\}/g)].map((m) => m[0]).sort().join(",");
await Promise.all(
  Object.entries(NAMES).map(async ([code, name]) => {
    const schema = { type: "object", additionalProperties: false, required: Object.keys(en), properties: Object.fromEntries(Object.keys(en).map((k) => [k, { type: "string" }])) };
    for (let attempt = 0; attempt < 2; attempt++) {
      const { value } = await respondJson<Record<string, string>>(
        {
          model: "muse-spark-1.3",
          effort: "low",
          input: `Translate the values of this JSON, the fixed text of a school physics lab report, into ${name} as a ${name}-medium physics textbook would write it. Keep every {placeholder} exactly as written, keep "SAM 3.1", "Meta" and "Ansatz" in Latin script, and keep the keys.\n\n${JSON.stringify(en, null, 1)}`,
          schema,
          name: "report_strings",
          maxOutput: 8000,
        },
        ledger,
        `report strings in ${name}`,
      );
      const bad = Object.keys(en).filter((k) => ph(en[k]) !== ph(value[k] ?? ""));
      if (bad.length && attempt === 0) continue;
      for (const k of bad) value[k] = en[k];
      writeFileSync(`data/i18n/${code}.json`, JSON.stringify(value, null, 1));
      console.log(code, bad.length ? `kept English for ${bad.join(", ")}` : "ok");
      return;
    }
  }),
);
console.log("$", ledger.usd.toFixed(4));

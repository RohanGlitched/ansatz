import en from "@/data/i18n/en.json";
import hi from "@/data/i18n/hi.json";
import ta from "@/data/i18n/ta.json";
import bn from "@/data/i18n/bn.json";
import mr from "@/data/i18n/mr.json";
import te from "@/data/i18n/te.json";
import es from "@/data/i18n/es.json";

/** The lab report's fixed words, translated once (scripts/translate-ui.ts) and checked so no {placeholder} is lost. */
const DICTS: Record<string, Record<string, string>> = { en, hi, ta, bn, mr, te, es };

export type Key = keyof typeof en;

export function tr(lang: string | undefined) {
  const d = DICTS[lang ?? "en"] ?? en;
  return (k: Key, vars: Record<string, string | number> = {}) => (d[k] ?? en[k]).replace(/\{(\w+)\}/g, (m, v) => (v in vars ? String(vars[v]) : m));
}

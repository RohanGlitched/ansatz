/**
 * Checks an answer's numbers against the record it was written from. The model gives its text and, for every number
 * in it, a quote: the number as written and the JSON path in the record where it comes from. Code reads that exact
 * path; a number with no verified quote is replaced in the text, so nothing numeric survives that the record doesn't hold.
 */

export type Quote = { path: string; value: string | number };

export const NOT_IN_RECORD = "[not in the record]";

type Parsed = { value: number; /** one unit in the last written digit */ unit: number; pct: boolean };

const SUPER: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-", "⁺": "+" };

/** Reads "9.79", "-0.5", "3.7e-4", "3.7×10^-4", "3.7 × 10⁻⁴", "1,234.5" and "70%"; null for anything else. */
export function parseNumber(raw: string | number): Parsed | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? { value: raw, unit: 0, pct: false } : null;
  let s = String(raw).trim().replace(/−/g, "-").replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]/g, (c) => SUPER[c]);
  const pct = s.endsWith("%");
  if (pct) s = s.slice(0, -1).trim();
  const m = /^([-+]?\d+(?:,\d{3})*(?:\.\d+)?)\s*(?:[eE]\s*([-+]?\d+)|[×x*]\s*10\s*\^?\s*([-+]?\d+))?$/.exec(s);
  if (!m) return null;
  const mant = m[1].replace(/,/g, "");
  const exp = Number(m[2] ?? m[3] ?? 0);
  const decimals = (mant.split(".")[1] ?? "").length;
  const value = Number(mant) * 10 ** exp;
  return Number.isFinite(value) ? { value, unit: 10 ** (exp - decimals), pct } : null;
}

/** The value at a path like `winning_law.constants.g.value` or `trial[0].unseen_miss`; undefined when the path leads nowhere. */
export function resolvePath(record: unknown, path: string): unknown {
  let cur: unknown = record;
  const parts = [...String(path).trim().replace(/^\$\.?/, "").matchAll(/([^.[\]]+)|\[(\d+)\]/g)];
  if (!parts.length) return undefined;
  for (const [, key, idx] of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    if (idx !== undefined) {
      if (!Array.isArray(cur)) return undefined;
      cur = cur[Number(idx)];
    } else {
      if (Array.isArray(cur) || !Object.hasOwn(cur as object, key)) return undefined;
      cur = (cur as Record<string, unknown>)[key];
    }
  }
  return cur;
}

/** The quoted number matches the record's: within 0.5% (relative), or within half a unit of its last written digit (it was rounded). */
export function matchesRecord(quoted: Parsed, actual: number, relTol = 0.005): boolean {
  const close = (q: number) => Math.abs(q - actual) <= Math.max(relTol * Math.abs(actual), 0.5 * quoted.unit * (1 + 1e-9));
  return close(quoted.value) || (quoted.pct && Math.abs(actual) <= 1 && close(quoted.value / 100));
}

/** Numbers in a sentence: signed, decimal, with scientific notation (1e-3, 3.7 × 10^-4, 3.7 × 10⁻⁴) and a trailing %. */
const NUMBER = /(?<![\w.])(?:[-−+](?=\d))?\d+(?:,\d{3})*(?:\.\d+)?(?:\s?[eE][-−+]?\d+|\s?[×x]\s?10\s?\^?\s?[-−+]?\d+|\s?×\s?10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺]+)?%?/g;
/** Names of the models, not measurements: "SAM 3.1", "Muse Spark 1.3". */
const NAMES = /\b(?:SAM|Spark|Wonder)\W{0,2}\d+(?:\.\d+)?/gi;

/** A number the record can't be asked about: a small count or rank, or a year. */
function exempt(token: string, p: Parsed) {
  if (/[.eE×%]/.test(token)) return false;
  const v = Math.abs(p.value);
  return Number.isInteger(p.value) && (v <= 10 || (v >= 1900 && v <= 2100));
}

export type Checked = { answer: string; verified: number; replaced: number };

/** Keeps the quotes that read true at their path, then replaces every number in `text` that none of them covers. */
export function checkAnswer(text: string, quotes: Quote[], record: unknown): Checked {
  const good: Parsed[] = [];
  for (const q of Array.isArray(quotes) ? quotes : []) {
    if (!q || typeof q.path !== "string") continue;
    const quoted = parseNumber(q.value);
    const actual = resolvePath(record, q.path);
    if (quoted && typeof actual === "number" && Number.isFinite(actual) && matchesRecord(quoted, actual)) good.push(quoted);
  }
  const protectedSpans = [...text.matchAll(NAMES)].map((m) => [m.index!, m.index! + m[0].length] as const);
  let replaced = 0;
  const answer = text.replace(NUMBER, (token, offset: number) => {
    if (protectedSpans.some(([a, b]) => offset >= a && offset < b)) return token;
    const p = parseNumber(token);
    if (!p || exempt(token, p)) return token;
    if (good.some((g) => Math.abs(g.value - p.value) <= 1e-6 * Math.max(1e-12, Math.abs(g.value)))) return token;
    replaced++;
    return NOT_IN_RECORD;
  });
  return { answer, verified: good.length, replaced };
}

/** The schema Muse Spark answers in (strict): the text, and a quote for each number in it. */
export const ASK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text", "quotes"],
  properties: {
    text: { type: "string", description: "The answer: at most 120 words, plain sentences." },
    quotes: {
      type: "array",
      description: "One entry for every number in `text` (except counts of ten or fewer and years): where in the record it comes from.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "value"],
        properties: {
          path: { type: "string", description: "JSON path into the record from its root, e.g. winning_law.constants.g.value or trial[0].unseen_miss." },
          value: { type: "string", description: "The number exactly as you wrote it in `text`." },
        },
      },
    },
  },
};

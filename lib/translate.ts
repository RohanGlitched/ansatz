import { Ledger, respondJson } from "./meta/client";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getObject, putObject } from "./store";
import type { Experiment } from "./experiment";

export const LANGUAGES: Record<string, string> = {
  hi: "हिन्दी",
  ta: "தமிழ்",
  bn: "বাংলা",
  mr: "मराठी",
  te: "తెలుగు",
  es: "Español",
};

const NAMES: Record<string, string> = { hi: "Hindi", ta: "Tamil", bn: "Bengali", mr: "Marathi", te: "Telugu", es: "Spanish" };

export type Translation = { headline: string; finding: string; what_happens: string; summary: string };

// Devanagari, Bengali, Tamil and Telugu digits count as the same numbers as 0–9
const DIGITS = ["०१२३४५६७८९", "০১২৩৪৫৬৭৮৯", "௦௧௨௩௪௫௬௭௮௯", "౦౧౨౩౪౫౬౭౮౯"];
const ascii = (s: string) => s.replace(/[०-९০-৯௦-௯౦-౯]/g, (d) => String(DIGITS.find((set) => set.includes(d))!.indexOf(d)));
const numbers = (s: string): string[] => [...(ascii(s).match(/\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? [])].sort();
const inflight = new Map<string, Promise<Translation | null>>();

/**
 * The experiment's words in another language, written by Muse Spark and checked by code: every number in the
 * English must appear unchanged in the translation, or the translation is refused. Cached next to the record.
 */
export async function translation(e: Experiment, lang: string): Promise<Translation | null> {
  if (!NAMES[lang]) return null;
  // showcases ship with their translations, so reading them costs nothing
  if (e.source?.kind === "showcase") {
    const raw = await readFile(join(process.cwd(), "data", "showcase", "translations", `${e.id}.${lang}.json`), "utf8").catch(() => null);
    if (raw) return (JSON.parse(raw) as { refused?: boolean } & Translation).refused ? null : (JSON.parse(raw) as Translation);
  }
  const key = `translations/${e.id}.${lang}.json`;
  const cached = await getObject(key).catch(() => null);
  // a refusal is remembered too, so a page view never pays for the same translation twice
  if (cached) {
    const v = JSON.parse(new TextDecoder().decode(cached)) as { refused?: boolean } & Translation;
    return v.refused ? null : v;
  }
  if (!inflight.has(key)) inflight.set(key, translate(e, lang, key).finally(() => inflight.delete(key)));
  return inflight.get(key)!;
}

export async function translate(e: Experiment, lang: string, key?: string): Promise<Translation | null> {
  const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  const source: Translation = { headline: e.headline ?? e.finding, finding: e.finding, what_happens: e.observation.what_happens, summary: win.law.summary };
  const ledger = new Ledger();
  const { value } = await respondJson<Translation>(
    {
      model: process.env.ANSATZ_TRANSLATE_MODEL ?? "muse-spark-1.3",
      effort: "low",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: `Translate these four texts from a physics experiment into ${NAMES[lang]} for a school student. Keep every number, unit and symbol exactly as written (digits, ±, m/s², g, L). Plain, natural ${NAMES[lang]}; physics terms as a ${NAMES[lang]} textbook would write them.\n\n${JSON.stringify(source, null, 1)}`,
            },
          ],
        },
      ],
      name: "translation",
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["headline", "finding", "what_happens", "summary"],
        properties: { headline: { type: "string" }, finding: { type: "string" }, what_happens: { type: "string" }, summary: { type: "string" } },
      },
      maxOutput: 6000,
    },
    ledger,
    `translate to ${NAMES[lang]}`,
  );
  for (const k of Object.keys(source) as (keyof Translation)[]) {
    const want = numbers(source[k]), got = numbers(value[k] ?? "");
    if (want.some((n) => !got.includes(n))) {
      if (key) await putObject(key, JSON.stringify({ refused: true }), "application/json").catch(() => {});
      return null;
    }
  }
  if (key) await putObject(key, JSON.stringify(value), "application/json").catch(() => {});
  return value;
}

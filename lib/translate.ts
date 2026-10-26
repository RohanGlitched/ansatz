import "server-only";
import { Ledger, respondJson } from "./meta/client";
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

const numbers = (s: string): string[] => [...(s.match(/\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? [])].sort();

/**
 * The experiment's words in another language, written by Muse Spark and checked by code: every number in the
 * English must appear unchanged in the translation, or the translation is refused. Cached next to the record.
 */
export async function translation(e: Experiment, lang: string): Promise<Translation | null> {
  if (!NAMES[lang]) return null;
  const key = `translations/${e.id}.${lang}.json`;
  const cached = await getObject(key).catch(() => null);
  if (cached) return JSON.parse(new TextDecoder().decode(cached)) as Translation;
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
    if (want.some((n) => !got.includes(n))) return null;
  }
  await putObject(key, JSON.stringify(value), "application/json").catch(() => {});
  return value;
}

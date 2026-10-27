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

/* ───────────────── the spoken side: what Muse Voice Transcribe listens for, in each language ───────────────── */

/** The seven languages a narrator may speak, by the name the run takes (input.language). */
export const VOICE_LANGUAGES = ["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu", "Spanish"] as const;
export type VoiceLanguage = (typeof VOICE_LANGUAGES)[number];

type Speech = {
  /** keywords biased into the recogniser: the experiment's words (thread, length, centimetre, let go), native and romanised */
  keywords: string[];
  /** a word for letting go: the moment the motion starts */
  release: RegExp;
  /** unit words, centimetres before metres (सेंटीमीटर contains मीटर) */
  cm: RegExp;
  m: RegExp;
  /** round numbers in words, as a recogniser may write a spoken length instead of digits */
  numbers: Record<string, number>;
};

const SPEECH: Record<VoiceLanguage, Speech> = {
  English: {
    keywords: ["pendulum", "string", "length", "metre", "centimetre", "centimetres", "release", "let go", "slow motion", "fps", "drop", "bounce"],
    release: /\b(releas(e|ing)|let(ting)? (it )?go|dropping|drop it)\b/i,
    cm: /^(cm|centimet(re|er)s?)$/i,
    m: /^(m|met(re|er)s?)$/i,
    numbers: { ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 },
  },
  Hindi: {
    keywords: ["धागा", "धागे", "लंबाई", "सेंटीमीटर", "मीटर", "छोड़", "छोड़ा", "छोड़ रहा", "लोलक", "chhod", "chhodo", "lambai", "dhaga", "centimeter"],
    release: /(छोड़|छोड|chh?od)/i,
    cm: /^(सेंटीमीटर|सेंटिमीटर|सेमी|cm|centimet(re|er)s?)$/i,
    m: /^(मीटर|m|met(re|er)s?)$/i,
    numbers: { दस: 10, बीस: 20, तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90, सौ: 100 },
  },
  Tamil: {
    keywords: ["நூல்", "நீளம்", "சென்டிமீட்டர்", "மீட்டர்", "விடுகிறேன்", "விடு", "ஊசல்", "centimeter"],
    release: /(விடு|விட்ட|விடுகி)/,
    cm: /^(சென்டிமீட்டர்|செ\.?மீ|cm|centimet(re|er)s?)$/i,
    m: /^(மீட்டர்|m|met(re|er)s?)$/i,
    numbers: { பத்து: 10, இருபது: 20, முப்பது: 30, நாற்பது: 40, ஐம்பது: 50, அறுபது: 60, எழுபது: 70, எண்பது: 80, தொண்ணூறு: 90, நூறு: 100 },
  },
  Bengali: {
    keywords: ["সুতো", "সুতোর", "দৈর্ঘ্য", "সেন্টিমিটার", "মিটার", "ছাড়ছি", "ছেড়ে", "দোলক", "centimeter"],
    release: /(ছাড|ছেড)/,
    cm: /^(সেন্টিমিটার|সেমি|cm|centimet(re|er)s?)$/i,
    m: /^(মিটার|m|met(re|er)s?)$/i,
    numbers: { দশ: 10, বিশ: 20, কুড়ি: 20, ত্রিশ: 30, তিরিশ: 30, চল্লিশ: 40, পঞ্চাশ: 50, ষাট: 60, সত্তর: 70, আশি: 80, নব্বই: 90, একশো: 100 },
  },
  Marathi: {
    keywords: ["दोरा", "दोऱ्याची", "लांबी", "सेंटीमीटर", "मीटर", "सोडतो", "सोडते", "सोड", "लंबक", "centimeter"],
    release: /(सोड)/,
    cm: /^(सेंटीमीटर|सेंटिमीटर|सेमी|cm|centimet(re|er)s?)$/i,
    m: /^(मीटर|m|met(re|er)s?)$/i,
    numbers: { दहा: 10, वीस: 20, तीस: 30, चाळीस: 40, पन्नास: 50, साठ: 60, सत्तर: 70, ऐंशी: 80, नव्वद: 90, शंभर: 100 },
  },
  Telugu: {
    keywords: ["దారం", "పొడవు", "సెంటీమీటర్లు", "సెంటీమీటర్", "మీటర్", "వదులుతున్నాను", "వదిలేస్తున్నాను", "లోలకం", "centimeter"],
    release: /(వదు|వది|వదల)/,
    cm: /^(సెంటీమీటర్లు|సెంటీమీటర్|సెం\.?మీ|cm|centimet(re|er)s?)$/i,
    m: /^(మీటర్లు|మీటర్|m|met(re|er)s?)$/i,
    numbers: { పది: 10, ఇరవై: 20, ముప్పై: 30, నలభై: 40, యాభై: 50, అరవై: 60, డెబ్బై: 70, ఎనభై: 80, తొంభై: 90, వంద: 100 },
  },
  Spanish: {
    keywords: ["péndulo", "cuerda", "hilo", "longitud", "centímetros", "metros", "suelto", "soltar", "cámara lenta"],
    release: /\b(suelto|soltar|soltando|lo suelto)\b/i,
    cm: /^(cm|cent[ií]metros?)$/i,
    m: /^(m|metros?)$/i,
    numbers: { diez: 10, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100 },
  },
};

const speechOf = (language?: string): Speech | null => (language && language in SPEECH ? SPEECH[language as VoiceLanguage] : null);

/** The recogniser's keywords for the narrator's language, English's after them (narrators mix it in); at most 50. */
export function asrKeywords(language?: string): string[] {
  const own = speechOf(language);
  return [...new Set([...(own?.keywords ?? []), ...SPEECH.English.keywords])].slice(0, 50);
}

/** The transcript as timed lines, "[2.3 s] …", one per turn, so the observer can place what was said in the clip. */
export function timedTurns(turns: { startMs: number; transcript: string }[]): string {
  return turns.map((t) => `[${(t.startMs / 1000).toFixed(1)} s] ${t.transcript.trim()}`).join("\n");
}

/** The first turn with a word for letting go (in the narrator's language or English): when the motion started. */
export function releaseTurn(turns: { startMs: number; transcript: string }[], language?: string): { at: number; word: string; turn: string } | null {
  const sets = [speechOf(language), SPEECH.English].filter((s): s is Speech => !!s);
  for (const t of turns)
    for (const s of sets) {
      const m = s.release.exec(t.transcript);
      if (m) return { at: t.startMs / 1000, word: m[0], turn: t.transcript.trim().slice(0, 160) };
    }
  return null;
}

// Devanagari, Bengali, Tamil and Telugu digits read as 0–9
const NATIVE_DIGITS = ["०१२३४५६७८९", "০১২৩৪৫৬৭৮৯", "௦௧௨௩௪௫௬௭௮௯", "౦౧౨౩౪౫౬౭౮౯"];
const asciiDigits = (s: string) => s.replace(/[०-९০-৯௦-௯౦-౯]/g, (d) => String(NATIVE_DIGITS.find((set) => set.includes(d))!.indexOf(d)));

/**
 * A spoken length in metres, read by code from a transcript: a number (digits in any of the scripts, or a round number
 * in words) followed by a centimetre or metre word in the narrator's language or English. Null when there is none.
 */
export function spokenLength(text: string, language?: string): { metres: number; said: string } | null {
  const sets = [speechOf(language), SPEECH.English].filter((s): s is Speech => !!s);
  const words = asciiDigits(text).replace(/(\d)\s*(cm|m)\b/gi, "$1 $2").split(/[\s,;:!?।]+/).filter(Boolean);
  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i].replace(/[.)]+$/, "");
    let v = /^\d+(?:[.,]\d+)?$/.test(w) ? Number(w.replace(",", ".")) : NaN;
    if (!Number.isFinite(v)) for (const s of sets) if (w.toLowerCase() in s.numbers) v = s.numbers[w.toLowerCase()];
    if (!Number.isFinite(v)) continue;
    const unit = words[i + 1].replace(/[.)]+$/, "");
    for (const s of sets) {
      if (s.cm.test(unit)) return { metres: v / 100, said: `${words[i]} ${words[i + 1]}` };
      if (s.m.test(unit)) return { metres: v, said: `${words[i]} ${words[i + 1]}` };
    }
  }
  return null;
}

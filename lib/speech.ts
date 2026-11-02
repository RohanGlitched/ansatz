/**
 * The spoken (and typed) side of a run, kept apart from the report's translations (lib/i18n.ts) so the form on /new can
 * read a length the way the server does without shipping every language's dictionary.
 */

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
    numbers: {
      one: 1, a: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
    },
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
    numbers: {
      un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
      once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, "dieciséis": 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
      veintiuno: 21, "veintidós": 22, "veintitrés": 23, veinticuatro: 24, veinticinco: 25, "veintiséis": 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
      veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100,
    },
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
 * The word sets a length is read with: the narrator's language and English, or, when no language was chosen ("Muse
 * Voice Transcribe should work it out"), all seven (their unit words and number words never disagree: साठ is 60 in
 * Hindi and Marathi alike), so a Hindi or Tamil length is not dropped for want of a menu choice.
 */
const setsFor = (language?: string): Speech[] => {
  const own = speechOf(language);
  return own ? [own, SPEECH.English] : VOICE_LANGUAGES.map((l) => SPEECH[l]);
};

/** Millimetre words in the seven languages (none contains another language's centimetre or metre word). */
const MM = /^(mm|millimet(re|er)s?|मिलीमीटर|मिलिमीटर|मिमी|மில்லிமீட்டர்|মিলিমিটার|మిల్లీమీటర్లు|మిల్లీమీటర్|mil[ií]metros?)$/i;

/** A length's number word index (word) and the index just past its last word (end: the unit, or a trailing "twenty"). */
type Hit = { metres: number; said: string; word: number; end: number };

const tidy = (w: string | undefined) => (w ?? "").replace(/[.)]+$/, "");

/**
 * The number starting at words[i]: digits (a decimal point or comma), a number word, or a compound of words, "sixty-five",
 * "sixty five", "sesenta y cinco" (a round ten and a digit). Null when there is none.
 */
function numberAt(words: string[], i: number, sets: Speech[]): { v: number; end: number; word: boolean } | null {
  const w = tidy(words[i]);
  if (/^\d+(?:[.,]\d+)?$/.test(w)) return { v: Number(w.replace(",", ".")), end: i + 1, word: false };
  const look = (t: string | undefined) => {
    const k = tidy(t).toLowerCase();
    for (const s of sets) if (Object.prototype.hasOwnProperty.call(s.numbers, k)) return s.numbers[k];
    return undefined;
  };
  const isTen = (n: number | undefined): n is number => n !== undefined && n >= 20 && n < 100 && n % 10 === 0;
  const isDigit = (n: number | undefined): n is number => n !== undefined && n >= 1 && n <= 9;
  const [a, b, ...more] = w.split("-");
  if (b !== undefined && !more.length) {
    const ta = look(a), tb = look(b);
    return isTen(ta) && isDigit(tb) ? { v: ta + tb, end: i + 1, word: true } : null;
  }
  const t = look(w);
  if (t === undefined) return null;
  // "a" counts as one only before a unit ("a metre"), never as an article before a number word
  if (w.toLowerCase() === "a" && look(words[i + 1]) !== undefined) return null;
  if (isTen(t) && w === words[i]) {
    const next = look(words[i + 1]);
    if (isDigit(next)) return { v: t + next, end: i + 2, word: true };
    const after = look(words[i + 2]);
    if (/^(y|and)$/i.test(words[i + 1] ?? "") && isDigit(after)) return { v: t + after, end: i + 3, word: true };
  }
  return { v: t, end: i + 1, word: true };
}

/**
 * Every number-then-unit in a run of words (millimetres, centimetres or metres), with "one metre twenty", "1 m 20 cm"
 * and "un metro veinte" read whole. A trailing number with no unit is taken only in words, and never across a full stop.
 */
function lengthsIn(words: string[], sets: Speech[]): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const n = numberAt(words, i, sets);
    if (!n || n.end >= words.length) continue;
    const unit = tidy(words[n.end]);
    let metres: number;
    let end = n.end + 1;
    if (MM.test(unit)) metres = n.v / 1000;
    else if (sets.some((s) => s.cm.test(unit))) metres = n.v / 100;
    else if (sets.some((s) => s.m.test(unit))) {
      metres = n.v;
      // "one metre twenty", "1 m 20 cm": the centimetres after the metres, unless the unit ended a sentence
      const more = unit === words[n.end] ? numberAt(words, end, sets) : null;
      if (more && more.v < 100) {
        const u2 = tidy(words[more.end]);
        if (sets.some((s) => s.cm.test(u2))) {
          metres += more.v / 100;
          end = more.end + 1;
        } else if (more.word && !MM.test(u2) && !sets.some((s) => s.m.test(u2))) {
          metres += more.v / 100;
          end = more.end;
        }
      }
    } else continue;
    hits.push({ metres: +metres.toPrecision(12), said: words.slice(i, end).join(" "), word: i, end });
    i = end - 1;
  }
  return hits;
}

/**
 * Words as the readers split them: native digits made ASCII, "60cm" / "60सेमी" parted, punctuation dropped, a decimal
 * comma ("0,6") kept, and any other comma kept as a word of its own so "1 m, 3 cm" is never read as one length.
 */
const wordsOf = (text: string) =>
  asciiDigits(text).replace(/(\d)(?=\p{L})/gu, "$1 ").replace(/(?<!\d),|,(?!\d)/g, " , ").split(/[\s;:!?।]+/).filter(Boolean);

/**
 * A spoken length in metres, read by code from a transcript: a number (digits in any of the scripts, or a round number
 * in words, "sixty-five" too) followed by a millimetre, centimetre or metre word in the narrator's language or English (in any of the seven when no
 * language is given). The first in the text; null when there is none.
 */
export function spokenLength(text: string, language?: string): { metres: number; said: string } | null {
  const [hit] = lengthsIn(wordsOf(text), setsFor(language));
  return hit ? { metres: hit.metres, said: hit.said } : null;
}

/** Words next to a length that say it is the scale in view, not the thing measured ("A4 sheet 29.7 cm"). */
const SCALE_WORDS = /^(a4|sheet|paper|card|ruler|scale|stick|kagaz|कागज़?|पन्ना|शीट|पैमाना)$/i;

/** Words that name the thing measured: the string (in the seven languages) or, for a drop, its height. Matched as stems. */
const STRING_STEMS = [
  "string", "thread", "rope", "cord", "length", "long", "pendulum", "dhaga", "dhaage", "lambai",
  "धागा", "धागे", "डोरी", "लंबाई", "लम्बाई", "लंबा", "लोलक",
  "நூல்", "நூலின்", "நீளம்", "ஊசல்",
  "সুতো", "সুতোর", "দৈর্ঘ্য", "দোলক",
  "दोरा", "दोऱ्या", "लांबी", "लंबक",
  "దారం", "దారము", "పొడవు", "లోలకం",
  "cuerda", "hilo", "longitud", "largo", "péndulo", "pendulo",
];
const HEIGHT_STEMS = ["height", "high", "drop", "fell", "fall", "ऊँचाई", "ऊंचाई", "altura"];
/**
 * Words that say a length is a size across, the pendulum's bob, or how far it was pulled aside ("released 10 cm to the
 * side", "amplitude"): never the string. A ball is one when the text names a string.
 */
const SIZE_STEMS = [
  "wide", "width", "diameter", "radius", "across", "thick", "size",
  "व्यास", "चौड़", "चौड", "त्रिज्या", "விட்டம்", "ব্যাস", "रुंद", "వ్యాసం", "ancho", "diámetro", "diametro", "radio",
  "bob", "गोलक", "குண்டு", "গোলক", "గుండు",
  // how far it was pulled aside: the swing's offset, not its length
  "releas", "pull", "side", "amplitude", "swing", "displace", "offset", "aside", "खींच", "आयाम", "amplitud", "desplaz", "apart",
];
const BODY_STEMS = ["ball", "sphere", "गोला", "गेंद", "பந்து", "বল", "चेंडू", "బంతి", "bola", "pelota"];

const bare = (w: string) => w.toLowerCase().replace(/^[("“'‘]+|[.,()”"'’]+$/g, "");
const hasStem = (w: string, stems: string[]) => {
  const b = bare(w);
  return b === "l" || stems.some((s) => b.startsWith(s));
};
const stemOf = (w: string, stems: string[]) => stems.some((s) => bare(w).startsWith(s));

/**
 * The length a person stated (typed or said) for the experiment, read by code. Every number-then-unit in the text is a
 * candidate, the scale in view left out (a length with "A4", "sheet", "card" or "ruler" in the three words before it or the
 * two after its unit, "30 cm ruler", unless a string word sits nearer: "a 30 cm ruler beside the 60 cm string").
 * Each is tied to the nearest naming word in its clause (four words before it, three after its unit): a string or
 * height word makes it the length measured, a size or offset word ("3 cm wide", "diameter", the bob, "released 10 cm to
 * the side") or, when the text names a
 * string, a ball makes it a size, never the string. The first length tied to the string wins; failing that, of the lengths
 * tied to nothing, the larger when the text names a string (a bob is smaller than its string), else the first. A size
 * alone gives null. "L = 60cm", "string: 0.6 m", a decimal comma ("0,6 m"), millimetres ("L = 600 mm") and
 * compound number words ("sixty-five centimetres", "one metre twenty", "un metro veinte") read too. With no language, the seven languages' words all count.
 */
export function statedLength(text: string, language?: string): { metres: number; said: string } | null {
  const sets = setsFor(language);
  const clean = text.replace(/[=:~≈]/g, " ");
  const namesString = wordsOf(clean).some((w) => stemOf(w, STRING_STEMS) || bare(w) === "l");
  const clauses = clean.split(/(?<=[.;।])\s+|[\r\n]+|(?<!\d),\s*|,(?!\d)\s*/).map((t) => t.trim()).filter(Boolean);
  const tied: Hit[] = [];
  const loose: Hit[] = [];
  for (const clause of clauses) {
    const words = wordsOf(clause);
    for (const hit of lengthsIn(words, sets)) {
      if (!(hit.metres > 0)) continue;
      // the nearest naming word, before (up to four words) or after the unit (up to three): a scale word (three before,
      // two after) drops the length, then a string word ties it, then a size or offset word marks it a size
      let kind: "scale" | "string" | "size" | null = null;
      for (let d = 1; d <= 4 && !kind; d++) {
        const near = [words[hit.word - d], d <= 3 ? words[hit.end - 1 + d] : undefined].filter((w): w is string => !!w);
        const scale = [d <= 3 ? words[hit.word - d] : undefined, d <= 2 ? words[hit.end - 1 + d] : undefined];
        if (scale.some((w) => w && SCALE_WORDS.test(bare(w)))) kind = "scale";
        else if (near.some((w) => hasStem(w, STRING_STEMS) || stemOf(w, HEIGHT_STEMS))) kind = "string";
        else if (near.some((w) => stemOf(w, SIZE_STEMS) || (namesString && stemOf(w, BODY_STEMS)))) kind = "size";
      }
      if (kind === "string") tied.push(hit);
      else if (!kind) loose.push(hit);
    }
  }
  const pick = tied[0] ?? (namesString && loose.length > 1 ? loose.reduce((a, b) => (b.metres > a.metres ? b : a)) : loose[0]);
  return pick ? { metres: pick.metres, said: pick.said } : null;
}

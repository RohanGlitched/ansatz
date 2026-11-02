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
 * The word sets a length is read with: the narrator's language and English, or, when no language was chosen ("Muse
 * Voice Transcribe should work it out"), all seven (their unit words and number words never disagree: साठ is 60 in
 * Hindi and Marathi alike), so a Hindi or Tamil length is not dropped for want of a menu choice.
 */
const setsFor = (language?: string): Speech[] => {
  const own = speechOf(language);
  return own ? [own, SPEECH.English] : VOICE_LANGUAGES.map((l) => SPEECH[l]);
};

type Hit = { metres: number; said: string; word: number };

/** Every number-then-unit in a run of words, with the index of its number word. */
function lengthsIn(words: string[], sets: Speech[]): Hit[] {
  const hits: Hit[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const w = words[i].replace(/[.)]+$/, "");
    let v = /^\d+(?:[.,]\d+)?$/.test(w) ? Number(w.replace(",", ".")) : NaN;
    if (!Number.isFinite(v)) for (const s of sets) if (w.toLowerCase() in s.numbers) v = s.numbers[w.toLowerCase()];
    if (!Number.isFinite(v)) continue;
    const unit = words[i + 1].replace(/[.)]+$/, "");
    const said = `${words[i]} ${words[i + 1]}`;
    if (sets.some((s) => s.cm.test(unit))) hits.push({ metres: v / 100, said, word: i });
    else if (sets.some((s) => s.m.test(unit))) hits.push({ metres: v, said, word: i });
  }
  return hits;
}

/** Words as the readers split them: native digits made ASCII, "60cm" / "60सेमी" parted, punctuation dropped, a decimal comma ("0,6") kept. */
const wordsOf = (text: string) =>
  asciiDigits(text).replace(/(\d)(?=\p{L})/gu, "$1 ").split(/[\s;:!?।]+|(?<!\d),|,(?!\d)/).filter(Boolean);

/**
 * A spoken length in metres, read by code from a transcript: a number (digits in any of the scripts, or a round number
 * in words) followed by a centimetre or metre word in the narrator's language or English (in any of the seven when no
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
 * alone gives null. "L = 60cm", "string: 0.6 m" and a decimal comma ("0,6 m") read too. With no language, the seven languages' words all count.
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
        const near = [words[hit.word - d], d <= 3 ? words[hit.word + 1 + d] : undefined].filter((w): w is string => !!w);
        const scale = [d <= 3 ? words[hit.word - d] : undefined, d <= 2 ? words[hit.word + 1 + d] : undefined];
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

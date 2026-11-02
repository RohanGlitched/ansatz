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
    numbers: { एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10, बीस: 20, तीस: 30, चालीस: 40, पचास: 50, साठ: 60, सत्तर: 70, अस्सी: 80, नब्बे: 90, सौ: 100 },
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
    numbers: { এক: 1, দুই: 2, তিন: 3, চার: 4, পাঁচ: 5, ছয়: 6, সাত: 7, আট: 8, নয়: 9, দশ: 10, বিশ: 20, কুড়ি: 20, ত্রিশ: 30, তিরিশ: 30, চল্লিশ: 40, পঞ্চাশ: 50, ষাট: 60, সত্তর: 70, আশি: 80, নব্বই: 90, একশো: 100 },
  },
  Marathi: {
    keywords: ["दोरा", "दोऱ्याची", "लांबी", "सेंटीमीटर", "मीटर", "सोडतो", "सोडते", "सोड", "लंबक", "centimeter"],
    release: /(सोड)/,
    cm: /^(सेंटीमीटर|सेंटिमीटर|सेमी|cm|centimet(re|er)s?)$/i,
    m: /^(मीटर|m|met(re|er)s?)$/i,
    numbers: { एक: 1, दोन: 2, तीन: 3, चार: 4, पाच: 5, सहा: 6, सात: 7, आठ: 8, नऊ: 9, दहा: 10, वीस: 20, तीस: 30, चाळीस: 40, पन्नास: 50, साठ: 60, सत्तर: 70, ऐंशी: 80, नव्वद: 90, शंभर: 100 },
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
      ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500, seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
    },
  },
};

// number words compared in NFC (ढ़, ড় and the like have two spellings in Unicode; input is normalised the same way)
for (const sp of Object.values(SPEECH)) sp.numbers = Object.fromEntries(Object.entries(sp.numbers).map(([k, v]) => [k.normalize("NFC"), v]));
const nfc = (stems: string[]) => stems.map((x) => x.normalize("NFC"));
const nfcKeys = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k.normalize("NFC"), v]));

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

/** Feet and inches, in any language (a prime and a double prime too: 3'6"). "in" alone is read only where it ends a phrase. */
const FT = /^(ft|feet|foot|'|′|’|फुट|फ़ुट|फीट|फूट|ফুট|pies)$/i;
const INCH = /^(inch|inches|"|″|”|''|इंच|ইঞ্চি|pulgadas?)$/i;
const FOOT = 0.3048, INCH_M = 0.0254;

/** Fractions of a unit: "half a metre", "three quarters of a metre", "a metre and a half". */
const FRAC: Record<string, number> = { half: 0.5, quarter: 0.25, quarters: 0.25, medio: 0.5, media: 0.5 };
/** A hundred as a multiplier: "two hundred centimetres", "साढ़े चार सौ मिलीमीटर" (450). */
const HUNDRED = /^(hundred|सौ)$/i;
/**
 * Hindi, Marathi and Bengali fraction words: डेढ़ / दीड / দেড় 1.5, ढाई / अडीच / আড়াই 2.5, आधा / अर्धा / আধা 0.5 on their own;
 * सवा / सव्वा / সোয়া (+¼), साढ़े / साडे / সাড়ে (+½) and पौने / पावणे / পৌনে (−¼) before a number ("पौने दो मीटर" 1.75), or
 * before the unit itself ("सवा मीटर" 1.25).
 */
const FIXED = nfcKeys({ "डेढ़": 1.5, "डेढ": 1.5, "ढाई": 2.5, "आधा": 0.5, "आधे": 0.5, "दीड": 1.5, "दिड": 1.5, "अडीच": 2.5, "अर्धा": 0.5, "দেড়": 1.5, "আড়াই": 2.5, "আধা": 0.5 });
const PLUS = nfcKeys({ "सवा": 0.25, "साढ़े": 0.5, "साढे": 0.5, "पौने": -0.25, "पौन": -0.25, "सव्वा": 0.25, "साडे": 0.5, "पावणे": -0.25, "সোয়া": 0.25, "সাড়ে": 0.5, "পৌনে": -0.25 });

/** A length's number word index (word) and the index just past its last word (end: the unit, or a trailing "twenty"). */
type Hit = { metres: number; said: string; word: number; end: number };

const tidy = (w: string | undefined) => (w ?? "").replace(/[.)]+$/, "");

/**
 * The number starting at words[i]: digits (a decimal point or comma), a number word, or a compound of words, "sixty-five",
 * "sixty five", "sesenta y cinco" (a round ten and a digit). Null when there is none.
 */
function numberAt(words: string[], i: number, sets: Speech[]): { v: number; end: number; word: boolean } | null {
  const r = baseNumber(words, i, sets);
  if (!r) return null;
  const sum = (x: { v: number; end: number; word: boolean }) => {
    // "two hundred and fifty", "ciento veinte", "doscientos cincuenta": a number under a hundred added on
    const j = /^(and|y)$/i.test(words[x.end] ?? "") ? x.end + 1 : x.end;
    const more = baseNumber(words, j, sets);
    return more && more.word && more.v >= 1 && more.v < 100 && Number.isInteger(more.v) ? { v: x.v + more.v, end: more.end, word: true } : x;
  };
  if (r.v > 0 && r.v < 10 && HUNDRED.test(tidy(words[r.end]))) return sum({ v: +(r.v * 100).toPrecision(12), end: r.end + 1, word: true });
  if (r.word && r.v >= 100 && r.v < 1000 && r.v % 100 === 0) return sum(r);
  return r;
}

function baseNumber(words: string[], i: number, sets: Speech[]): { v: number; end: number; word: boolean } | null {
  const w = tidy(words[i]);
  const wl = w.toLowerCase();
  // "and a half" / "and a quarter" after a number: "one and a half metres"
  const andFrac = (r: { v: number; end: number; word: boolean }) => {
    const f = FRAC[tidy(words[r.end + 2]).toLowerCase()];
    return /^and$/i.test(words[r.end] ?? "") && /^an?$/i.test(words[r.end + 1] ?? "") && f !== undefined ? { ...r, v: r.v + f, end: r.end + 3 } : r;
  };
  // "of a" after a fraction: "half a metre", "a quarter of a metre"
  const ofA = (j: number) => {
    if (/^of$/i.test(words[j] ?? "")) j++;
    if (/^(a|an|one|the)$/i.test(words[j] ?? "")) j++;
    return j;
  };
  // a comma before exactly three digits is a thousands separator ("1,200 mm"), any other a decimal comma ("0,6 m")
  if (/^[1-9]\d{0,2},\d{3}$/.test(w)) return andFrac({ v: Number(w.replace(",", "")), end: i + 1, word: false });
  if (/^\d+(?:[.,]\d+)?$/.test(w)) return andFrac({ v: Number(w.replace(",", ".")), end: i + 1, word: false });
  if (FRAC[wl] !== undefined && wl !== "quarters" && wl !== "media") return { v: FRAC[wl], end: ofA(i + 1), word: true };
  if (FIXED[wl] !== undefined) return { v: FIXED[wl], end: i + 1, word: true };
  if (PLUS[wl] !== undefined) {
    // the hundred comes after: "साढ़े चार सौ" is 4.5 hundred
    const n = baseNumber(words, i + 1, sets);
    return n && n.v >= 1 ? { v: n.v + PLUS[wl], end: n.end, word: true } : { v: 1 + PLUS[wl], end: i + 1, word: true };
  }
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
  // "three quarters of a metre"
  const f = FRAC[tidy(words[i + 1]).toLowerCase()];
  if (isDigit(t) && f !== undefined && w === words[i]) return { v: t * f, end: ofA(i + 2), word: true };
  return andFrac({ v: t, end: i + 1, word: true });
}

/**
 * Every number-then-unit in a run of words (millimetres, centimetres or metres), with "one metre twenty", "1 m 20 cm"
 * and "un metro veinte" read whole. A trailing number with no unit is taken only in words, and never across a full stop.
 */
function lengthsIn(words: string[], sets: Speech[]): Hit[] {
  const hits: Hit[] = [];
  const isCm = (u: string) => /^(cms|c\.m)$/i.test(u) || sets.some((s) => s.cm.test(u));
  const isM = (u: string) => /^(mtrs?|mts)$/i.test(u) || sets.some((s) => s.m.test(u));
  // "in" as inches only where it ends the phrase: "27 in", "27 in.", "27 in long", never "3 in the frame"
  const isIn = (j: number) =>
    /^in$/i.test(tidy(words[j])) && (j + 1 >= words.length || words[j] !== tidy(words[j]) || /^(long|tall|high|length|of|string|thread|rope|cord|,)/i.test(words[j + 1]));
  const isUnit = (j: number) => {
    const u = tidy(words[j]);
    return !!u && (MM.test(u) || isCm(u) || isM(u) || FT.test(u) || INCH.test(u) || isIn(j));
  };
  // "a metre and a half", "a foot and a half", "un metro y medio" (returns the fraction and the words it took)
  const andHalf = (end: number): [number, number] => {
    const f = FRAC[tidy(words[end + 2]).toLowerCase()];
    if (/^and$/i.test(words[end] ?? "") && /^an?$/i.test(words[end + 1] ?? "") && f !== undefined) return [f, 3];
    const g = FRAC[tidy(words[end + 1]).toLowerCase()];
    if (/^y$/i.test(words[end] ?? "") && /^medi[oa]$/i.test(tidy(words[end + 1])) && g !== undefined) return [g, 2];
    return [0, 0];
  };
  for (let i = 0; i < words.length - 1; i++) {
    const n = numberAt(words, i, sets);
    if (!n || n.end >= words.length) continue;
    const unit = tidy(words[n.end]);
    let metres: number;
    let end = n.end + 1;
    if (MM.test(unit)) metres = n.v / 1000;
    else if (isCm(unit)) metres = n.v / 100;
    else if (isM(unit)) {
      metres = n.v;
      const [half, took] = unit === words[n.end] ? andHalf(end) : [0, 0];
      if (half) {
        metres += half;
        end += took;
      }
      // "one metre twenty", "1 m 20 cm", "एक मीटर बीस सेंटीमीटर": the centimetres after the metres, unless the unit ended a
      // sentence; a trailing number word with no unit counts from ten up ("one metre twenty", never "एक मीटर दो")
      const more = unit === words[n.end] && !half ? numberAt(words, end, sets) : null;
      if (more && more.v < 100) {
        const u2 = tidy(words[more.end]);
        if (isCm(u2)) {
          metres += more.v / 100;
          end = more.end + 1;
        } else if ((more.word ? more.v >= 10 : more.end >= words.length && Number.isInteger(more.v)) && !isUnit(more.end)) {
          // a number word from ten up ("one metre twenty"), or digits that end the clause ("string 1 m 20")
          metres += more.v / 100;
          end = more.end;
        }
      }
    } else if (FT.test(unit)) {
      metres = n.v * FOOT;
      const [half, took] = unit === words[n.end] ? andHalf(end) : [0, 0];
      if (half) {
        metres += half * FOOT;
        end += took;
      }
      // "2 feet 3 inches", "3'6\"", and "3'6" with the inch mark left off
      const more = unit === words[n.end] && !half ? numberAt(words, end, sets) : null;
      if (more && more.v < 12) {
        if (INCH.test(tidy(words[more.end])) || isIn(more.end)) {
          metres += more.v * INCH_M;
          end = more.end + 1;
        } else if (/^['′’]$/.test(unit) && !more.word && !isUnit(more.end)) {
          metres += more.v * INCH_M;
          end = more.end;
        }
      }
    } else if (INCH.test(unit) || isIn(n.end)) metres = n.v * INCH_M;
    else continue;
    const said = words.slice(i, end).join(" ").replace(/ (''|['′’"″”])(?= |$)/g, "$1").replace(/(['′’]) (?=\d)/g, "$1");
    hits.push({ metres: +metres.toPrecision(12), said, word: i, end });
    i = end - 1;
  }
  return hits;
}

/**
 * Words as the readers split them: native digits made ASCII, "60cm" / "60सेमी" parted, punctuation dropped, a decimal
 * comma ("0,6") kept, and any other comma kept as a word of its own so "1 m, 3 cm" is never read as one length.
 */
const wordsOf = (text: string) =>
  asciiDigits(text.normalize("NFC")).replace(/(\d)(''|['′’"″”])(?!\p{L})/gu, "$1 $2 ").replace(/(\d)-(?=\p{L})/gu, "$1 ").replace(/(\d)(?=\p{L})/gu, "$1 ").replace(/(?<!\d),|,(?!\d)/g, " , ").split(/[\s;:!?।]+/).filter(Boolean);

/**
 * A spoken length in metres, read by code from a transcript: a number (digits in any of the scripts, or a round number
 * in words, "sixty-five" too) followed by a millimetre, centimetre or metre word in the narrator's language or English (in any of the seven when no
 * language is given). The first in the text; null when there is none.
 */
export function spokenLength(text: string, language?: string): { metres: number; said: string } | null {
  const [hit] = lengthsIn(wordsOf(text), setsFor(language));
  return hit ? { metres: hit.metres, said: hit.said } : null;
}

/**
 * Words next to a length that say it is the scale in view, not the thing measured ("A4 sheet 29.7 cm", "regla de 30 cm"),
 * in the seven languages, matched as stems so case endings count (స్కేలు, স্কেলের, पट्टीवर).
 */
const SCALE_STEMS = [
  "a4", "sheet", "paper", "card", "ruler", "scale", "stick", "kagaz", "tape",
  "कागज", "कागज़", "पन्ना", "शीट", "पैमाना", "स्केल", "रूलर", "रुलर", "पट्टी",
  "স্কেল", "রুলার", "কাগজ", "পাতা", "শিট",
  "फूटपट्टी", "कागद",
  "அளவுகோல்", "ஸ்கேல்", "தாள்", "காகித",
  "స్కేలు", "స్కేల్", "రూలర్", "కాగిత", "షీట్",
  "regla", "hoja", "papel", "tarjeta", "folio", "cinta",
];
SCALE_STEMS.splice(0, SCALE_STEMS.length, ...nfc(SCALE_STEMS));
const isScale = (w: string) => SCALE_STEMS.some((s) => bare(w).startsWith(s));

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
 * Where the pendulum hangs or how high something is (a stand, a ceiling, the floor, a person's height): the length of a
 * drop, but beside a pendulum's string only context, never L.
 */
const PLACE_STEMS = ["height", "high", "tall", "stand", "ceiling", "floor", "ऊँचाई", "ऊंचाई", "ऊँचा", "ऊंचा", "छत", "altura", "alto", "techo", "suelo"];
/** How far away something stood (the camera, the person): never a length of the experiment. */
const AWAY_STEMS = ["away", "distance", "camera", "stood", "दूर", "दूरी", "कैमरा", "distancia", "cámara", "lejos"];
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
/** The bob's own words, among the size words: in a clause that names the point of suspension or the bob's centre, not a size. */
const BOB_STEMS = ["bob", "गोलक", "குண்டு", "গোলক", "గుండు"];
/**
 * Words for the ends of L as the worksheet defines it, "point of suspension to centre of bob": the suspension, pivot or
 * hook and the bob's centre. Each ties a length to the string, and in their clause the bob or ball names an end, not a size.
 */
const SPAN_STEMS = [
  "suspension", "suspend", "pivot", "hook", "centre", "center",
  "निलंबन", "केंद्र", "केन्द्र", "धुरी", "कील", "কেন্দ্র", "மைய", "కేంద్ర", "centro", "suspensión", "pivote", "gancho",
];
for (const stems of [STRING_STEMS, HEIGHT_STEMS, PLACE_STEMS, AWAY_STEMS, SIZE_STEMS, BODY_STEMS, BOB_STEMS, SPAN_STEMS]) stems.splice(0, stems.length, ...nfc(stems));

const bare = (w: string) => w.toLowerCase().replace(/^[("“'‘]+|[.,()”"'’]+$/g, "");
const hasStem = (w: string, stems: string[]) => {
  const b = bare(w);
  return b === "l" || stems.some((s) => b.startsWith(s));
};
const stemOf = (w: string, stems: string[]) => stems.some((s) => bare(w).startsWith(s));

/**
 * The length a person stated (typed or said) for the experiment, read by code. Every number-then-unit in the text is a
 * candidate, the scale in view left out (a length with "A4", "sheet", "ruler", "regla", "पैमाना" or the like in the three words before it or the
 * two after its unit, "30 cm ruler", unless a string word sits nearer: "a 30 cm ruler beside the 60 cm string").
 * Each is tied to the nearest naming word in its clause (four words before it, three after its unit): a string or
 * height word makes it the length measured, a size or offset word ("3 cm wide", "diameter", the bob, "released 10 cm to
 * the side") or, when the text names a
 * string, a ball makes it a size, never the string. The first length tied to the string wins; failing that, of the lengths
 * tied to nothing, the larger when the text names a string (a bob is smaller than its string), else the first. A size
 * alone gives null. "L = 60cm", "string: 0.6 m", a decimal comma ("0,6 m"), millimetres ("L = 600 mm") and
 * compound number words ("sixty-five centimetres", "one metre twenty", "un metro veinte") read too. With no language, the seven languages' words all count.
 * So do the worksheet's own definition ("point of suspension to centre of bob = 60 cm": a length after "=" or ":" is defined
 * by the words before it, and beside the suspension or the bob's centre the bob is an end of L, not a size), fractions ("half a
 * metre", "a metre and a half", डेढ़ / सवा / आधा / पौने दो मीटर, दीड / सव्वा / अर्धा, দেড় / সোয়া / আধা), "एक मीटर बीस सेंटीमीटर", and feet and
 * inches ("2 feet 3 inches", "27 inches", "2 ft", 3'6"), hundreds ("two hundred centimetres", "साढ़े चार सौ मिलीमीटर"), "60-cm", "cms",
 * "mtr", "c.m." and "1,200 mm". With the run's type: a height is the length of a drop or a bounce, and for a pendulum only
 * where it hangs ("hung from a height of 2 m, the string is 60 cm" is 0.6 m); "2 m away" is never a length.
 */
export function statedLength(text: string, language?: string, type?: string): { metres: number; said: string } | null {
  const sets = setsFor(language);
  // "=" and ":" kept as a word of their own, so "centre of bob = 60 cm" reads as a definition
  const clean = text.replace(/[~≈]/g, " ").replace(/[=:]/g, " = ");
  const namesString = wordsOf(clean).some((w) => stemOf(w, STRING_STEMS) || stemOf(w, SPAN_STEMS) || bare(w) === "l");
  // a height is the length for a drop or a bounce; for a pendulum (or any text that names a string) it is only where it hangs
  const heightIsLength = type === "drop" || type === "bounce" || (!type && !namesString);
  const clauses = clean.split(/(?<=[.;।])\s+|[\r\n]+|(?<!\d),\s*|,(?!\d)\s*/).map((t) => t.trim()).filter(Boolean);
  const tied: Hit[] = [];
  const loose: Hit[] = [];
  for (const clause of clauses) {
    // a length straight after "=" or ":" with words before it is defined by them ("string: 0.6 m", "L = 60 cm")
    const words: string[] = [];
    const defined = new Set<number>();
    for (const w of wordsOf(clause)) if (w === "=") defined.add(words.length);
    else words.push(w);
    const span = words.some((w) => stemOf(w, SPAN_STEMS));
    for (const hit of lengthsIn(words, sets)) {
      if (!(hit.metres > 0)) continue;
      // the nearest naming word, before (up to four words) or after the unit (up to three): a scale word (three before,
      // two after) drops the length, then a string word ties it, then a size or offset word marks it a size
      let kind: "scale" | "string" | "size" | null = null;
      for (let d = 1; d <= 4 && !kind; d++) {
        const near = [words[hit.word - d], d <= 3 ? words[hit.end - 1 + d] : undefined].filter((w): w is string => !!w);
        const scale = [d <= 3 ? words[hit.word - d] : undefined, d <= 2 ? words[hit.end - 1 + d] : undefined];
        if (scale.some((w) => w && isScale(w))) kind = "scale";
        else if (near.some((w) => stemOf(w, AWAY_STEMS) || (!heightIsLength && stemOf(w, PLACE_STEMS)))) kind = "size";
        else if (near.some((w) => hasStem(w, STRING_STEMS) || (heightIsLength && stemOf(w, HEIGHT_STEMS)) || stemOf(w, SPAN_STEMS))) kind = "string";
        // in a clause naming the point of suspension or the bob's centre, the bob is an end of L, not a size
        else if (near.some((w) => (span && (stemOf(w, BOB_STEMS) || stemOf(w, BODY_STEMS)) ? false : stemOf(w, SIZE_STEMS) || (namesString && stemOf(w, BODY_STEMS))))) kind = "size";
      }
      if (!kind && hit.word > 0 && defined.has(hit.word)) kind = "string";
      if (kind === "string") tied.push(hit);
      else if (!kind) loose.push(hit);
    }
  }
  const pick = tied[0] ?? (namesString && loose.length > 1 ? loose.reduce((a, b) => (b.metres > a.metres ? b : a)) : loose[0]);
  return pick ? { metres: pick.metres, said: pick.said } : null;
}

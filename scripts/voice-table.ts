// "Heard in each language": one spoken pendulum length per language, run through Muse Voice Transcribe (with the
// language's keywords and bias, as a run sends them) and read back by code (lib/i18n.ts spokenLength, releaseTurn).
// The speech is synthetic: Microsoft Edge neural voices via edge-tts (../media/voice/tts.py), labelled TTS throughout,
// since no real speaker of each language recorded one. Costs about $0.0002 a clip. No full runs.
// usage: tsx scripts/voice-table.ts            (makes any missing clip, transcribes all seven, writes data/bench/voice.json)
import "./env";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import ffmpeg from "ffmpeg-static";
import { Ledger, transcribe } from "../lib/meta/client";
import { asrKeywords, releaseTurn, spokenLength, VOICE_LANGUAGES, type VoiceLanguage } from "../lib/i18n";
import { PIPELINE } from "../lib/experiment";

const DIR = "../media/voice/table";
const LINES: Record<VoiceLanguage, { voice: string; text: string; metres: number }> = {
  English: { voice: "en-IN-NeerjaNeural", text: "The string is fifty centimetres long. Now I let go.", metres: 0.5 },
  Hindi: { voice: "hi-IN-SwaraNeural", text: "धागे की लंबाई साठ सेंटीमीटर है। अब मैं छोड़ रहा हूँ।", metres: 0.6 },
  Tamil: { voice: "ta-IN-PallaviNeural", text: "நூலின் நீளம் நாற்பது சென்டிமீட்டர். இப்போது விடுகிறேன்.", metres: 0.4 },
  Bengali: { voice: "bn-IN-TanishaaNeural", text: "সুতোর দৈর্ঘ্য সত্তর সেন্টিমিটার। এবার ছেড়ে দিচ্ছি।", metres: 0.7 },
  Marathi: { voice: "mr-IN-AarohiNeural", text: "दोऱ्याची लांबी ऐंशी सेंटीमीटर आहे. आता मी सोडतो.", metres: 0.8 },
  Telugu: { voice: "te-IN-ShrutiNeural", text: "దారం పొడవు ముప్పై సెంటీమీటర్లు. ఇప్పుడు వదులుతున్నాను.", metres: 0.3 },
  Spanish: { voice: "es-ES-ElviraNeural", text: "La cuerda mide noventa centímetros. Ahora la suelto.", metres: 0.9 },
};

// --reparse: read the stored transcripts again with the current parser, no calls (after a parser fix)
if (process.argv.includes("--reparse")) {
  const v = JSON.parse(readFileSync("data/bench/voice.json", "utf8"));
  for (const r of v.rows) {
    const len = spokenLength(r.heard, r.language);
    const rel = releaseTurn(r.turns, r.language);
    r.length = len ? { metres: len.metres, said: len.said } : null;
    r.lengthOk = !!len && Math.abs(len.metres - r.truth_m) < 1e-9;
    r.release = rel ? { at: rel.at, word: rel.word } : null;
  }
  const checked = v.rows.filter((r: { lengthOk: boolean }) => r.lengthOk).length, released = v.rows.filter((r: { release: unknown }) => r.release).length;
  v.summary = { ...v.summary, lengthChecked: checked, releaseHeard: released, label: `heard and checked in ${checked} of 7 (TTS)` };
  v.note = v.note.replace(/Heard and checked in \d of 7\./, `Heard and checked in ${checked} of 7.`);
  v.reparsedAt = new Date().toISOString();
  writeFileSync("data/bench/voice.json", JSON.stringify(v, null, 1) + "\n");
  console.log(`re-read: heard and checked in ${checked} of 7; release word heard in ${released} of 7`);
  process.exit(0);
}

mkdirSync(DIR, { recursive: true });
const ledger = new Ledger();
const rows = [];
for (const lang of VOICE_LANGUAGES) {
  const { voice, text, metres } = LINES[lang];
  const mp3 = `${DIR}/${lang.toLowerCase()}.mp3`;
  if (!existsSync(mp3)) execFileSync("python", ["../media/voice/tts.py", text, voice, mp3]);
  // a run hears the clip's audio as a mono WAV; 1 s of silence first, as a clip usually opens before anyone speaks
  const wav = execFileSync(ffmpeg as unknown as string, ["-v", "error", "-f", "lavfi", "-t", "1", "-i", "anullsrc=r=16000:cl=mono", "-i", mp3, "-filter_complex", "[0:a][1:a]concat=n=2:v=0:a=1,aresample=16000", "-ac", "1", "-f", "wav", "pipe:1"], { maxBuffer: 1 << 26 });
  const before = ledger.usd;
  let tr: Awaited<ReturnType<typeof transcribe>> | null = null, error: string | undefined;
  try {
    tr = await transcribe(new Uint8Array(wav), ledger, { keywords: asrKeywords(lang), languages: [lang] });
  } catch (e) {
    error = (e as Error).message.slice(0, 200);
  }
  const heard = tr?.transcript ?? "";
  const len = spokenLength(heard, lang);
  const rel = tr ? releaseTurn(tr.turns, lang) : null;
  const ok = !!len && Math.abs(len.metres - metres) < 1e-9;
  rows.push({
    language: lang,
    speech: "TTS",
    voice: `${voice} (edge-tts)`,
    said: text,
    truth_m: metres,
    heard,
    turns: tr?.turns.map((t) => ({ startMs: t.startMs, endMs: t.endMs, transcript: t.transcript })) ?? [],
    length: len ? { metres: len.metres, said: len.said } : null,
    lengthOk: ok,
    release: rel ? { at: rel.at, word: rel.word } : null,
    usd: +(ledger.usd - before).toFixed(6),
    ...(error ? { error } : {}),
  });
  console.log(`${lang.padEnd(8)} ${ok ? "ok  " : "MISS"} heard “${heard}” → ${len ? `${len.metres} m (“${len.said}”)` : "no length"}${rel ? `; let go heard at ${rel.at.toFixed(1)} s (“${rel.word}”)` : "; no release word"}${error ? ` ERROR ${error}` : ""}`);
}
const checked = rows.filter((r) => r.lengthOk).length;
const released = rows.filter((r) => r.release).length;
const out = {
  generatedAt: new Date().toISOString(),
  pipeline: PIPELINE,
  note: `One spoken pendulum length per language, each a synthetic voice (TTS: Microsoft Edge neural voices via edge-tts, not a real speaker), with one second of silence before it. Muse Voice Transcribe heard each with that language's keywords and language bias, as a run sends them; code then read the length (a number in digits or words, then a centimetre or metre word: lib/i18n.ts spokenLength) and the word for letting go (releaseTurn, which sets a run's window start). Heard and checked in ${checked} of 7.`,
  summary: { languages: rows.length, lengthChecked: checked, releaseHeard: released, usd: +ledger.usd.toFixed(6), label: `heard and checked in ${checked} of 7 (TTS)` },
  rows,
};
writeFileSync("data/bench/voice.json", JSON.stringify(out, null, 1) + "\n");
console.log(`heard and checked in ${checked} of 7; release word heard in ${released} of 7; USD ${ledger.usd.toFixed(5)}`);

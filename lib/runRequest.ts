/**
 * The body /new sends to /api/run, built from the form. Kept apart from the component so it can be tested: lite mode
 * (where class links start) caps what is called, never what the person states. The typed "What do you know?" text
 * travels in both modes, and so does the narration's language; only the slow-motion factor is a full-run field (lite
 * assumes real time).
 */
export type LiteKind = "pendulum" | "drop" | "throw" | "bounce" | "spring";

export type RunForm = {
  key: string;
  /** the judges' lane passphrase, from the page's address */
  k?: string | null;
  noun: string;
  /** the typed "What do you know?" text */
  narration: string;
  slow: string;
  ruler: string;
  rulerLen: string;
  fromSample: boolean;
  language: string;
  classCode?: string | null;
  seriesId?: string | null;
  student: string;
  lite: boolean;
  liteType: LiteKind | "";
  /** lite mode only: transcribe the narration so a length said aloud is kept (Muse Voice Transcribe) */
  listen: boolean;
};

export type RunBody = {
  key: string;
  k?: string;
  noun?: string;
  narration?: string;
  slowMotion?: number;
  ruler?: { noun: string; metres: number };
  sample?: true;
  language?: string;
  class?: string;
  series?: string;
  student?: string;
  lite?: { type: LiteKind; listen: boolean };
};

export function runRequestBody(f: RunForm): RunBody {
  const narration = f.narration.trim().slice(0, 2000);
  return {
    key: f.key,
    k: f.k ?? undefined,
    noun: f.noun.trim() || undefined,
    // what the person knows reaches the run in lite mode too: code reads a stated length from it there
    narration: narration || undefined,
    slowMotion: !f.lite && Number(f.slow) > 1 ? Number(f.slow) : undefined,
    ruler: f.ruler && Number(f.rulerLen) > 0 ? { noun: f.ruler, metres: Number(f.rulerLen) } : undefined,
    sample: f.fromSample || undefined,
    // the language helps the transcription and the reading of a length typed in it ("साठ सेंटीमीटर")
    language: f.language || undefined,
    class: f.classCode || undefined,
    series: f.seriesId || undefined,
    student: f.classCode && f.student ? f.student : undefined,
    lite: f.lite && f.liteType ? { type: f.liteType, listen: f.listen } : undefined,
  };
}

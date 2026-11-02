import "server-only";
import { getExperiment } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiment";
import { fmtNoise } from "@/lib/format";

/**
 * The two published lite runs where Muse Voice Transcribe set the length (synthetic voices, labelled; ../VOICE-NOTES.md):
 * a class-link run with nothing typed, so the length could only come from the transcript. Every figure is read from the
 * records (data/showcase/voice-lite-*.json) and from the full runs on the same clips, never typed.
 */
const RUNS = [
  { id: "voice-lite-aachen-50cm-hindi", language: "Hindi", clip: "the Aachen pendulum", full: "aachen-pendulum-50cm", fullHow: "the length typed" },
  { id: "voice-lite-pendulum-40cm-english", language: "English", clip: "the 40 cm render", full: "pendulum-40cm", fullHow: "the A4 sheet as the ruler" },
] as const;

/** the rule the run pages use: a law that misses the unseen frames by more than this many times the noise gets no error bar */
const ROUGH_Z = 5;

export type VoiceRun = {
  id: string;
  href: string;
  language: string;
  clip: string;
  heard: string;
  /** "50 cm" */
  length: string;
  /** "g = 9.806 ± 0.098 m/s², 0.01% low", or for a law that misses the unseen frames, the value and why it is shown rounded */
  g: string;
  /** the full run on the same clip: "closer than its full run with the A4 sheet as the ruler: 9.86 ± 0.59 m/s²" */
  full: string;
  usd: number;
  rough: boolean;
};
export type VoiceLite = { runs: VoiceRun[]; usdText: string; sentence: string; short: string };

const signed = (x: number, d: number) => `${x < 0 ? "−" : ""}${Math.abs(x).toFixed(d)}%`;

function runOf(r: (typeof RUNS)[number], e: Experiment, full: Experiment | null): VoiceRun | null {
  const g = e.comparisons.find((c) => c.param === "g");
  const heard = e.narration?.transcript?.trim();
  const len = (e as Experiment & { given?: string[] }).given?.find((t) => /length = /.test(t))?.match(/= ([\d.]+ ?c?m)/)?.[1];
  if (!g || !heard || !len) return null;
  const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  const z = win.fit.testZ ?? 0;
  const rough = (g as { rough?: boolean }).rough ?? z > ROUGH_Z;
  const off = `${Math.abs(g.errorPct).toFixed(Math.abs(g.errorPct) < 0.1 ? 2 : 2)}% ${g.errorPct < 0 ? "low" : "high"}`;
  const gText = rough
    ? `g = ${g.measured.toFixed(3)} ± ${g.sigma.toFixed(3)} m/s² (${off}), shown as about ${g.measured.toFixed(1)} with no error bar, as its law misses the unseen frames by ${fmtNoise(z)}× the noise`
    : `g = ${g.measured.toFixed(3)} ± ${g.sigma.toFixed(3)} m/s², ${off}`;
  const fg = full?.comparisons.find((c) => c.param === "g");
  const closer = fg && Math.abs(g.errorPct) < Math.abs(fg.errorPct);
  const fullText = fg ? `${closer ? "closer than its full run" : "its full run"} with ${r.fullHow}: ${fg.measured.toFixed(2)} ± ${fg.sigma.toFixed(2)} m/s²` : "";
  return {
    id: r.id,
    href: `/x/${r.id}`,
    language: r.language,
    clip: r.clip,
    heard,
    length: len.replace(/(\d)(cm|m)$/, "$1 $2"),
    g: gText,
    full: fullText,
    usd: e.ledger.usd,
    rough,
  };
}

export async function voiceLite(): Promise<VoiceLite | null> {
  const got = await Promise.all(RUNS.map(async (r) => [r, await getExperiment(r.id).catch(() => null), await getExperiment(r.full).catch(() => null)] as const));
  const runs = got.flatMap(([r, e, f]) => (e ? [runOf(r, e, f)] : [])).filter((x): x is VoiceRun => !!x);
  if (runs.length !== RUNS.length) return null;
  const usdText = runs.map((x) => `$${x.usd.toFixed(3)}`).join(" and ");
  const sentence = `Muse Voice Transcribe set the length in two published lite runs (synthetic voices, labelled), with nothing typed, so the length could only come from the transcript: ${runs
    .map((x) => `${x.language} over ${x.clip}, heard “${x.heard.replace(/\.$/, "")}”, read as ${x.length}, ${x.g}${x.full ? `; ${x.full}` : ""}`)
    .join("; ")}. ${usdText} a run.`;
  const short = `Muse Voice Transcribe set the length in two published lite runs, synthetic voices, labelled: ${runs.map((x) => `${x.language} over ${x.clip}, read as ${x.length}, ${x.g.replace(/, shown as about ([\d.]+) with no error bar, as its law misses the unseen frames by ([\d.]+)× the noise/, ", shown as about $1 with no error bar ($2× the noise)")}`).join("; ")}`;
  return { runs, usdText, sentence, short };
}

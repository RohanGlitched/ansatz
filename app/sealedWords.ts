import type { Candidate, Experiment } from "../lib/experiment";
import { fmtNoise } from "../lib/format";

/**
 * The words for a law drawn by drand, shared by every page that names one (the gallery cards, /proof, the run pages,
 * /judges and llms.txt), so a drawn law is described the same way everywhere. Pure: no storage, safe in tests.
 */
export type Drawn = { stiffness: string; damping: string; drive: boolean; equation?: string };
export type SealedRecord = {
  round: number;
  url: string;
  sha256: string;
  sealCommit: string;
  revealCommit: string;
  drawn: Drawn;
  constants: Record<string, { value: number; unit: string }>;
  verdict: "hit" | "miss";
  narration: string;
};

export const sealedOf = (e: Experiment) => (e.extras as { sealed?: SealedRecord } | undefined)?.sealed;

/** a residual peak as the run's code labelled it (extras.sealed.spectrumAtScoring) */
export type Peak = { omega: number; ampNoise: number; label?: string };
/** the residual peak at a drawn drive's frequency (within 2%), if the record kept the run's spectrum */
export const drivePeak = (s: SealedRecord): Peak | undefined => {
  const wd = s.constants.wd?.value;
  const peaks = (s as SealedRecord & { spectrumAtScoring?: { peaks?: Peak[] } }).spectrumAtScoring?.peaks ?? [];
  return wd ? peaks.find((p) => Math.abs(p.omega / wd - 1) < 0.02) : undefined;
};

export const stiffWord = (s: string) => (s === "cubic" ? "a cubic hardening spring" : s === "asymmetric" ? "a lopsided spring" : "a linear spring");
export const dampWord = (d: string) => (d === "quadratic" ? "quadratic damping" : d === "coulomb" || d === "dry" ? "dry friction" : "viscous damping");
/** "a linear spring with dry friction and a periodic drive" */
export const drawnText = (d: Drawn) => `${stiffWord(d.stiffness)} with ${dampWord(d.damping)}${d.drive ? " and a periodic drive" : ""}`;

const winnerOf = (e: Experiment) => e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
/** a law with a periodic term (a drive) in its equations */
export const writesDrive = (c: Candidate) => /\b(cos|sin)\s*\(/.test(JSON.stringify((c.law as { derivatives?: unknown }).derivatives ?? ""));
export const driveProposed = (e: Experiment) => e.candidates.some(writesDrive);
/** who wrote the winning law (code, when it combined terms the models wrote: a drive added at an unexplained residual
 * frequency, or Muse Wonder's stiffness with Muse Spark's damping) */
export const authorOf = (e: Experiment) => {
  const o = winnerOf(e).origin;
  return o === "revision" ? "Muse Wonder" : o === "combined" ? "code" : "Muse Spark";
};
/** whether code started the winning law's drive frequency at the strongest residual frequency (and that start stood) */
export const driveSeeded = (e: Experiment) => {
  const log = (e as Experiment & { residualSpectrum?: { seeded?: { law: string; kept: boolean }[] } }).residualSpectrum?.seeded ?? [];
  return log.some((x) => x.law === winnerOf(e).law.id && x.kept);
};
/** who wrote the winning law's drive: the record's own word (from set 5 on), else code for a drive code added, else the law's author */
export const driveAuthor = (e: Experiment): string => {
  const by = (sealedOf(e) as (SealedRecord & { driveBy?: string | null }) | undefined)?.driveBy;
  return by ?? (winnerOf(e).combined === "drive" ? "code" : authorOf(e));
};
/** the credit for a drive that was found: who wrote it, and who started its frequency */
export const driveCredit = (e: Experiment) =>
  winnerOf(e).combined === "drive"
    ? `code added the drive to the best law without one, its frequency started at the unexplained peak in that law’s misses, and the held-out frames kept it${(sealedOf(e) as (SealedRecord & { driveBy?: string | null }) | undefined)?.driveBy === "code" && !e.wonder ? " (Muse Wonder was never called on this run)" : ""}`
    : driveAuthor(e) === "Muse Wonder" && (e.wonder?.turns ?? []).some((t) => (t as { tool?: string }).tool === "residual_spectrum")
      ? `Muse Wonder read the residual spectrum and wrote the drive itself, at the unexplained peak; ${driveSeeded(e) ? "code started its frequency at the strongest residual frequency" : "the starting value was its own"}`
      : `${driveAuthor(e)} chose to add the drive; ${driveSeeded(e) ? "code started its frequency at the strongest residual frequency" : "its frequency started where the law wrote it"}`;

/** "103×": a miss in units of the noise, by the one rule every page uses */
export const noiseTimes = fmtNoise;

/**
 * The gallery card's caption for a sealed run: the drawn law in the same words as /proof, then found or missed, read
 * from the record. Null for any other run.
 */
export function sealedCaption(e: Experiment): string | null {
  const s = sealedOf(e);
  if (!s) return null;
  const w = winnerOf(e);
  const lead = `A law drawn by public randomness, sealed before the run: ${drawnText(s.drawn)}.`;
  if (s.verdict === "miss") {
    const why = s.drawn.drive ? (writesDrive(w) ? `the winning law carries the drive (${driveAuthor(e) === "code" ? "added by code" : `written by ${driveAuthor(e)}`}), but its stiffness or damping is not the drawn one` : driveProposed(e) ? "a drive was proposed but did not win" : drivePeak(s)?.label === "sideband" ? "the drive’s residual line was labelled a sideband of the motion, so no drive was added" : "no model proposed the drive") : `Ansatz wrote “${w.law.title}”`;
    return `${lead} Missed: ${why}; the best law misses by ${noiseTimes(w.fit.testZ)}× the noise.`;
  }
  const rows = (e.extras?.truth?.rows ?? []) as { measured: number; sigma: number; truth: number }[];
  const worst = rows.length ? Math.max(...rows.map((r) => Math.abs(r.measured - r.truth) / r.sigma)) : NaN;
  const bound = worst <= 1 ? 1 : worst <= 2 ? 2 : Math.ceil(worst);
  const by = w.origin === "revision" ? "Muse Wonder" : w.origin === "combined" ? "a law code combined from the models’ terms" : "Muse Spark’s own law";
  return `${lead} Found by ${by}${Number.isFinite(worst) ? `, every constant within ${bound}σ of the drawn value` : ""}.${s.drawn.drive ? ` ${driveCredit(e).charAt(0).toUpperCase()}${driveCredit(e).slice(1)}.` : ""}`;
}

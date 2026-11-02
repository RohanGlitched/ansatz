import "server-only";
import { getExperiment } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiment";

/**
 * The sealed-law test, as the pages quote it: three spring laws drawn from drand rounds by scripts/sealed-law.ts, their
 * hashes pushed before the clips were rendered, revealed after Ansatz's runs. Every figure is read from the three
 * showcase records (extras.sealed holds the draw, the commits and the verdict; extras.truth the drawn values).
 */
export const SEALED_ROUNDS = [6604796, 6604797, 6604798];
const REPO = "https://github.com/RohanGlitched/ansatz";

type Sealed = {
  round: number;
  url: string;
  sha256: string;
  sealCommit: string;
  revealCommit: string;
  drawn: { stiffness: string; damping: string; drive: boolean; equation: string };
  constants: Record<string, { value: number; unit: string }>;
  verdict: "hit" | "miss";
  narration: string;
};
type Row = { label: string; param: string; measured: number; sigma: number; truth: number; unit: string; si?: { measured: number; sigma: number; truth: number; unit: string } };

export type SealedDraw = { round: number; url: string; href: string; verdict: "hit" | "miss"; line: string };
export type SealedTest = { n: number; found: number; draws: SealedDraw[]; sealCommit: string; revealCommit: string; sealUrl: string; revealUrl: string; narration: string; usd: number; summary: string };

/** "3408 ± 28" with the error bar's own precision */
const pm = (v: number, s: number) => {
  const d = Math.max(0, -Math.floor(Math.log10(s)) + (s / 10 ** Math.floor(Math.log10(s)) < 2 ? 1 : 0));
  return `${v.toFixed(d)} ± ${s.toFixed(d)}`;
};
const stiffWord = (s: string) => (s === "cubic" ? "a cubic hardening spring" : s === "asymmetric" ? "a lopsided spring" : "a linear spring");
const dampWord = (d: string) => (d === "quadratic" ? "quadratic damping" : d === "coulomb" || d === "dry" ? "dry friction" : "viscous damping");
export const drawnText = (d: Sealed["drawn"]) => `${stiffWord(d.stiffness)} with ${dampWord(d.damping)}${d.drive ? " and a periodic drive" : ""}`;

/** a constant against its drawn value, in metres where the record converts it, the drawn value to the same decimals */
const rowText = (r: Row) => {
  const v = r.si ?? r;
  const name = r.label.replace(/ \(√\(k\/m\)\)$/, "").replace(/^natural angular frequency /, "");
  const m = pm(v.measured, v.sigma);
  const d = (m.split(" ± ")[0].split(".")[1] ?? "").length;
  const z = Math.abs(r.measured - r.truth) / r.sigma;
  const off = z > 1 ? ` (${z.toFixed(1)}σ off, ${(Math.abs(r.measured / r.truth - 1) * 100).toFixed(3)}%, inside the 10% rule)` : "";
  return `${name} ${m} against ${v.truth.toFixed(d)} ${v.unit}${off}`;
};

function drawLine(e: Experiment, s: Sealed): string {
  const rows = (e.extras?.truth?.rows ?? []) as Row[];
  const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  const next = e.candidates.filter((c) => c.fit.ok && c.law.id !== win.law.id).sort((a, b) => a.rank - b.rank)[0];
  const head = `Round ${s.round}: ${drawnText(s.drawn)}.`;
  const miss = `It misses the unseen frames by ${win.fit.testRms.toFixed(2)} px${next ? `, against ${next.fit.testRms.toFixed(2)} px for the next law` : ""}`;
  if (s.verdict === "hit") {
    const within1 = rows.every((r) => Math.abs(r.measured - r.truth) <= r.sigma);
    const who = win.origin === "revision" ? `Found: Muse Wonder wrote the law${e.wonder?.trigger === "referee" ? " after the referee read the residuals" : ""}` : "Found: Muse Spark’s own law";
    const tie = next && Math.abs(next.fit.testRms - win.fit.testRms) < 0.01 * win.fit.testRms ? ` (the next law is the same one with an extra term, which ties and ranks second)` : "";
    return `${head} ${who}, ${rows.map(rowText).join(", ")}${within1 ? ", every constant within 1σ" : ""}. ${miss}${tie}.`;
  }
  // a miss: what was written instead, and whether any model proposed the missing term
  const driveProposed = e.candidates.some((c) => /\b(cos|sin)\s*\(/.test(JSON.stringify((c.law as { derivatives?: unknown }).derivatives ?? "")));
  const ws = win.fit.theta.omega_s, w0 = rows.find((r) => r.param === "omega")?.truth, wd = s.constants.wd?.value;
  const beat = ws && w0 && wd ? ` Its hidden second oscillator runs at ${ws.toFixed(2)} rad/s, the sum of the swing’s and the drive’s frequencies (${(w0 + wd).toFixed(2)}) to ${(Math.abs(ws / (w0 + wd) - 1) * 100).toFixed(1)}%: it fitted the beat, not the drive.` : "";
  return `${head} Missed: Ansatz wrote “${win.law.title}”.${beat}${s.drawn.drive && !driveProposed ? " No model proposed a drive." : ""} The best law still misses the unseen frames by ${win.fit.testRms.toFixed(2)} px, ${Math.round(win.fit.testZ ?? NaN)}× the noise${next ? ` (the next law: ${next.fit.testRms.toFixed(2)} px)` : ""}.`;
}

export async function sealedTest(): Promise<SealedTest | null> {
  const es = await Promise.all(SEALED_ROUNDS.map((r) => getExperiment(`sealed-law-${r}`).catch(() => null)));
  if (es.some((e) => !e || !(e.extras as { sealed?: Sealed } | undefined)?.sealed)) return null;
  const draws = es.map((e) => {
    const s = (e!.extras as { sealed: Sealed }).sealed;
    return { round: s.round, url: s.url, href: `/x/${e!.id}`, verdict: s.verdict, line: drawLine(e!, s) };
  });
  const s0 = (es[0]!.extras as { sealed: Sealed }).sealed;
  const found = draws.filter((d) => d.verdict === "hit").length;
  const usd = es.reduce((t, e) => t + e!.ledger.usd, 0);
  const miss = draws.filter((d) => d.verdict === "miss");
  const summary = `${found} of ${draws.length} laws drawn by drand, sealed before the run: ${["no", "one", "two", "three", "four", "five"][draws.length] ?? draws.length} spring laws were drawn from public randomness (drand rounds ${SEALED_ROUNDS[0]}–${SEALED_ROUNDS.at(-1)}) and their hashes pushed to GitHub before the clips were rendered; told only “${s0.narration}”, Ansatz found ${draws
    .filter((d) => d.verdict === "hit")
    .map((d) => drawnText((es.find((e) => e!.id === d.href.slice(3))!.extras as { sealed: Sealed }).sealed.drawn))
    .join(" and ")}${miss.length ? `, and missed ${miss.map((d) => drawnText((es.find((e) => e!.id === d.href.slice(3))!.extras as { sealed: Sealed }).sealed.drawn)).join(" and ")}` : ""}.`;
  return { n: draws.length, found, draws, sealCommit: s0.sealCommit, revealCommit: s0.revealCommit, sealUrl: `${REPO}/commit/${s0.sealCommit}`, revealUrl: `${REPO}/commit/${s0.revealCommit}`, narration: s0.narration, usd, summary };
}

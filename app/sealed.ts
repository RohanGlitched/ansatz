import "server-only";
import { getExperiment } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiment";

/**
 * The sealed-law test, as the pages quote it: three spring laws drawn from drand rounds by scripts/sealed-law.ts, their
 * hashes pushed before the clips were rendered, revealed after Ansatz's runs. Every figure is read from the three
 * showcase records (extras.sealed holds the draw, the commits and the verdict; extras.truth the drawn values).
 */
/** the first set (seal 2752b74, reveal b66261e); its three runs are required */
export const FIRST_SET = [6604796, 6604797, 6604798];
/** the second set (seal 4b94c8b, reveal 9997e76); counted when its three records ship */
export const SECOND_SET = [6604980, 6604981, 6604982];
/** every sealed round whose run page opens on the sealed result */
export const SEALED_ROUNDS = [...FIRST_SET, ...SECOND_SET];
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
export type SealedTest = {
  n: number;
  found: number;
  draws: SealedDraw[];
  sealCommit: string;
  revealCommit: string;
  sealUrl: string;
  revealUrl: string;
  narration: string;
  usd: number;
  summary: string;
  /** "all five constants of the two found laws within 2σ of the drawn values (the worst 1.97σ)" */
  within: string;
  /** what counts as found, and when that rule was written */
  rule: string;
  /** GitHub's own push times beside the drand rounds, the renders and the runs, and what they do not prove */
  timing: string;
  /** the one law Muse Wonder wrote, step by step from its record, with its reasoning summary annotated */
  wonderStory: string | null;
  /** the miss, and the line in Muse Wonder's prompt that warned against a drive */
  driveNote: string | null;
  /** the section's headline: laws without a drive against laws with one, over every run, the replicate failure named */
  pattern: string;
  /** what the seal proves and what it does not */
  proves: string;
  /** an outside check: draws and a replicate run by a reviewer from the same scripts, not stored in this repository */
  independent: { round: number; line: string }[];
  /** found laws whose winning law Muse Wonder wrote */
  wonderFound: number;
  /** the seal and reveal commits of each set, in order */
  sets: { seal: string; reveal: string; rounds: number[] }[];
};

/**
 * An independent check on 2 November: a reviewer drew two more laws with the repo's grammar (drand rounds 6604982 and
 * 6604983) and re-ran round 6604797 on the identical clip, with scripts/run.ts and the same narration ($0.94). Its records
 * are kept with the hackathon's review notes, not in this repository; the figures are quoted from them.
 */
const INDEPENDENT: { round: number; drive: boolean; found: boolean; replicate?: boolean; short?: string; line: string }[] = [
  { round: 6604983, drive: false, found: true, short: "a dry-friction spring, found within 1σ", line: "Round 6604983, a linear spring with dry friction: found on its first run. Muse Wonder wrote viscous damping plus dry friction, and the viscous term fitted to 0.000 ± 0.010; ω₀ 7.5527 ± 0.0007 against 7.5531 rad/s (0.6σ), friction 258.2 ± 4.2 against 258.0 px/s² (0.05σ). It misses the unseen frames by 0.18 px, against 9.4 px for the next law." },
  { round: 6604982, drive: true, found: false, line: "Round 6604982, run again: missed. This time Muse Wonder did propose a drive, but the fit left its frequency at 10.3 ± 3.7 rad/s against 15.2, and that law ranked third." },
  { round: 6604797, drive: false, found: false, replicate: true, line: "Round 6604797, re-run on the identical clip: not reproduced. Muse Wonder wrote a cubic spring with viscous damping, the wrong damping form, and the winner misses the unseen frames by 3.55 px against the published 0.18 px." },
];

/**
 * Push times as GitHub recorded them (https://api.github.com/repos/RohanGlitched/ansatz/activity, checked 2 November
 * 2026): commit times are set by the author, push times by GitHub. The renders' end is the mtime of sealed/clips/render-*.log.
 */
const SEAL_PUSHED = "2026-11-01T23:16:15Z";
const REVEAL_PUSHED = "2026-11-01T23:34:45Z";
const RENDERED = "2026-11-01T23:17:32Z";
const SEAL2_PUSHED = "2026-11-02T00:48:11Z";
const REVEAL2_PUSHED = "2026-11-02T01:04:54Z";
/** drand's default chain: genesis 1595431050, a round every 30 s */
const drandTime = (round: number) => new Date((1595431050 + (round - 1) * 30) * 1000);
/** the warning in Muse Wonder's prompt when these runs were made (lib/scientist.ts:404 at 1811071) */
const DRIVE_WARNING = "a law that only lowers the residuals by adding knobs (a driving force, extra harmonics) will lose on the held-out frames";

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
  const off = z > 1 ? ` (${z.toFixed(1)}σ off, ${(Math.abs(r.measured / r.truth - 1) * 100).toFixed(3)}%)` : "";
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
  return `${head} Missed: Ansatz wrote “${win.law.title}”.${beat}${s.drawn.drive && !driveProposed ? " No model proposed a drive, and Muse Wonder’s prompt at the time warned it against one." : ""} The best law still misses the unseen frames by ${win.fit.testRms.toFixed(2)} px, ${Math.round(win.fit.testZ ?? NaN)}× the noise${next ? ` (the next law: ${next.fit.testRms.toFixed(2)} px)` : ""}.`;
}

export async function sealedTest(): Promise<SealedTest | null> {
  const load = (rounds: number[]) => Promise.all(rounds.map((r) => getExperiment(`sealed-law-${r}`).catch(() => null)));
  const first = await load(FIRST_SET);
  if (first.some((e) => !e || !(e.extras as { sealed?: Sealed } | undefined)?.sealed)) return null;
  const second = await load(SECOND_SET);
  const es = [...first, ...(second.every((e) => e && (e.extras as { sealed?: Sealed } | undefined)?.sealed) ? second : [])] as Experiment[];
  const sealedOfE = (e: Experiment) => (e.extras as { sealed: Sealed }).sealed;
  const draws = es.map((e) => ({ round: sealedOfE(e).round, url: sealedOfE(e).url, href: `/x/${e.id}`, verdict: sealedOfE(e).verdict, line: drawLine(e, sealedOfE(e)) }));
  const s0 = sealedOfE(es[0]);
  const found = draws.filter((d) => d.verdict === "hit").length;
  const usd = es.reduce((t, e) => t + e.ledger.usd, 0);
  const miss = draws.filter((d) => d.verdict === "miss");
  const sealedOf = (d: SealedDraw) => sealedOfE(es.find((e) => e.id === d.href.slice(3))!);
  const hits = draws.filter((d) => d.verdict === "hit");
  const W = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const w = (k: number) => W[k] ?? String(k);
  const roundsText = (rs: number[]) => (rs.length > 1 ? `${rs.slice(0, -1).join(", ")} and ${rs.at(-1)}` : String(rs[0]));
  // the found laws' constants against the drawn values, in σ
  const zs = es.filter((e) => sealedOfE(e).verdict === "hit").flatMap((e) => ((e.extras?.truth?.rows ?? []) as Row[]).map((r) => Math.abs(r.measured - r.truth) / r.sigma));
  const worst = zs.length ? Math.max(...zs) : NaN;
  const bound = worst <= 1 ? 1 : worst <= 2 ? 2 : Math.ceil(worst);
  const within = zs.length ? `all ${w(zs.length)} constants of the ${w(hits.length)} found laws within ${bound}σ of the drawn values (worst ${worst.toFixed(2)}σ)` : "";
  const allRounds = draws.map((d) => d.round);
  const summary = `${found} of ${draws.length} laws drawn by drand, sealed before the run: ${w(draws.length)} spring laws were drawn from public randomness (drand rounds ${roundsText(allRounds)}) and their hashes pushed to GitHub before the clips were rendered; told only “${s0.narration}”, Ansatz found ${hits.map((d) => drawnText(sealedOf(d).drawn)).join(" and ")}${within ? `, with ${within}` : ""}${miss.length ? `, and missed ${miss.map((d) => drawnText(sealedOf(d).drawn)).join("; ")}` : ""}.`;
  const rule = `A draw counts as found when the winning law has the drawn law’s terms and no others. The rule we wrote down before the first reveal (in our notes; it is not in the seal commit) also let each constant pass within its error bar or within 10%; that second arm was never needed: ${within || "see each draw"}.`;

  // the pattern over every run, ours and the independent check's: laws without a drive against laws with one
  const ownNoDrive = draws.filter((d) => !sealedOf(d).drawn.drive);
  const ownDrive = draws.filter((d) => sealedOf(d).drawn.drive);
  const indFirst = INDEPENDENT.filter((x) => !x.replicate && !draws.some((d) => d.round === x.round));
  const indRepeat = INDEPENDENT.filter((x) => !x.replicate && draws.some((d) => d.round === x.round));
  const replicate = INDEPENDENT.find((x) => x.replicate);
  const noDriveRounds = [...ownNoDrive.map((d) => ({ round: d.round, found: d.verdict === "hit" })), ...indFirst.filter((x) => !x.drive)];
  const driveRounds = [...ownDrive.map((d) => ({ round: d.round, found: d.verdict === "hit" })), ...indFirst.filter((x) => x.drive)];
  const driveRuns = driveRounds.length + indRepeat.filter((x) => x.drive).length;
  const nd = noDriveRounds.filter((x) => x.found).length, dr = driveRounds.filter((x) => x.found).length;
  // ours counted apart from the judge's: the judge's draw has no record here, so it is "plus one independent judge's draw"
  const ownND = ownNoDrive.filter((d) => d.verdict === "hit").length;
  const ownDR = ownDrive.filter((d) => d.verdict === "hit").length;
  const indND = indFirst.filter((x) => !x.drive);
  const driveTwice = indRepeat.filter((x) => x.drive);
  const anyDriveWritten = es.some((e) => sealedOfE(e).drawn.drive && e.candidates.some((c) => /\b(cos|sin)\s*\(/.test(JSON.stringify((c.law as { derivatives?: unknown }).derivatives ?? ""))));
  const undriven = ownND === ownNoDrive.length ? `Every law without a drive was found on its first run (${ownND} of ${ownNoDrive.length} here${indND.length ? `, plus ${indND.length === 1 ? "one independent judge’s draw" : `${w(indND.length)} independent judge’s draws`}: ${indND.map((x) => x.short ?? (x.found ? "found" : "missed")).join("; ")}` : ""})` : `${w(ownND)} of the ${w(ownNoDrive.length)} laws without a drive were found on their first run`;
  const driven = ownDR === 0 ? `every law with a periodic drive was missed (0 of ${ownDrive.length}${driveTwice.length ? `; 0 of ${ownDrive.length + driveTwice.length} runs, counting the judge’s re-run of ${driveTwice.map((x) => x.round).join(" and ")}` : ""})` : `${w(ownDR)} of the ${w(ownDrive.length)} laws with a drive were found`;
  const why = !anyDriveWritten ? ` Why: in our ${w(draws.length)} runs no model wrote a drive term, and Muse Wonder’s prompt warned it off “a driving force” (lib/scientist.ts:404).` : "";
  const unstable = replicate ? ` The hits are not yet stable: the judge’s re-run of round ${replicate.round} on the identical clip did not reproduce (${replicate.line.split(": not reproduced. ")[1]?.replace(/\.$/, "") ?? "a different law won"}).` : "";
  const pattern = `${undriven}, and ${driven}.${why}${unstable} A third batch, with that warning fixed and the round numbers committed before the rounds exist, is next.`;

  // what the seal proves: the laws were not chosen, and the order of draw, run and reveal; not a frozen pipeline
  const proves = `Each law is a public function of its drand value, so the hash adds nothing beyond drand itself: anyone, us included, could compute the law once the round was out. Neither set committed its round numbers before those rounds existed; the hashes were pushed 15 s and 11 s after the last round, which fixes each law before any clip was rendered but does not rule out a draw that was thrown away. And no run can be tied to a clean committed tree: the first set ran with uncommitted edits to lib/experiment.ts, later committed as 56b2e88 (the closest match, not proven identical), and the last run of the second set probably with uncommitted lite-mode edits. So the seal proves that the laws were not picked by hand, and the order of draw, run and reveal. It does not prove that the code was frozen.`;

  // the timeline: GitHub's push records, drand's round times and the runs' own createdAt
  const hm = (d: Date) => d.toISOString().slice(11, 19);
  const runsAt = first.map((e) => new Date(e!.createdAt)).sort((x, y) => +x - +y);
  const lastRound = drandTime(FIRST_SET.at(-1)!);
  const pushLag = Math.round((+new Date(SEAL_PUSHED) - +lastRound) / 1000);
  const set2 = es.length > first.length ? ` The second set: rounds ${SECOND_SET[0]}–${SECOND_SET.at(-1)} published from ${hm(drandTime(SECOND_SET[0]))} to ${hm(drandTime(SECOND_SET.at(-1)!))}, the seal ${sealedOfE(es[first.length]).sealCommit} pushed at ${hm(new Date(SEAL2_PUSHED))}, the runs made from ${hm(new Date(es[first.length].createdAt)).slice(0, 5)} to ${hm(new Date(es.at(-1)!.createdAt)).slice(0, 5)}, the reveal ${sealedOfE(es[first.length]).revealCommit} pushed at ${hm(new Date(REVEAL2_PUSHED))}.` : "";
  const timing = `drand published round ${FIRST_SET.at(-1)} at ${hm(lastRound)} UTC on 1 November; GitHub recorded the push of the seal commit ${s0.sealCommit} at ${hm(new Date(SEAL_PUSHED))} UTC, ${pushLag} s later (${REPO}/activity). The clips finished rendering at ${hm(new Date(RENDERED))}, the runs were made from ${hm(runsAt[0]).slice(0, 5)} to ${hm(runsAt.at(-1)!).slice(0, 5)}, and the reveal ${s0.revealCommit} was pushed at ${hm(new Date(REVEAL_PUSHED))}.${set2} The script could have been run on earlier rounds and the result thrown away, and the grammar was committed with the first hashes, not before them. What protects the test is that the models never see the repository, and that the prompts and the physics code (lib/scientist.ts, lib/physics) were last changed at 1811071, 3¾ hours before the first draw.`;

  // the law Muse Wonder wrote: what the referee asked for, what Muse Wonder tried and what it submitted, read from the record
  const wonderRun = es.find((e) => sealedOfE(e).verdict === "hit" && e.candidates.find((c) => c.law.id === e.winner)?.origin === "revision");
  const wonderStory = (() => {
    const e = wonderRun;
    const turns = (e?.wonder as { turns?: { turn: number; reasoning?: string; tool: string; law?: string }[] } | undefined)?.turns ?? [];
    const idea = e?.critique?.preRevision?.revision_idea ?? "";
    if (!e || turns.length < 2) return null;
    const lead = e.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((x, y) => x.rank - y.rank)[0];
    const tried = turns.filter((t) => t.tool === "fit_law" && t.law).map((t) => `“${t.law}”`);
    const sub = turns.find((t) => t.tool === "submit_law")?.law ?? e.wonder?.submitted ?? "";
    const named = (idea.split(/(?<=\.)\s/)[0] ?? idea).replace(/\.$/, "");
    // the referee named the stiffening only; the quadratic drag, and dropping the viscous term, were Muse Wonder's own
    const own = !/quadratic/i.test(idea) && /viscous/i.test(lead?.law.title ?? "") && /quadratic/i.test(sub) && !/viscous/i.test(sub);
    const held = turns.some((t) => /held.?out|unseen|last 30/i.test(t.reasoning ?? ""));
    const rd = sealedOfE(e).round;
    const rep = INDEPENDENT.find((x) => x.replicate && x.round === rd);
    return `On round ${rd} the referee asked only to “${named.charAt(0).toLowerCase()}${named.slice(1)}”, and Muse Spark’s leading law had ${/viscous/i.test(lead?.law.title ?? "") ? "viscous drag" : "a different damping"}. Muse Wonder fitted ${tried.join(", then ")}${own ? " (the quadratic drag was its own idea)" : ""}, then submitted “${sub}”${own ? ", dropping the viscous term, which had fitted near zero" : ""}. That is the drawn law, and every constant lands within 1σ.${held ? " Its last reasoning summary gives “better held-out performance” as a reason; Muse Wonder never sees those frames (its tool returns misses on the fitted frames only), so that phrase is its own wording, not something it was shown." : ""}${rep ? ` It did not reproduce: re-run on the identical clip in an independent check, Muse Wonder chose viscous damping instead, and the winner missed the unseen frames by 3.55 px.` : ""}`;
  })();
  const driveMisses = miss.filter((d) => sealedOf(d).drawn.drive);
  const indDrive = INDEPENDENT.find((x) => x.drive && !x.found);
  const driveNote = driveMisses.length
    ? `The misses are the ${driveMisses.length === 1 ? "one driven spring" : `${w(driveMisses.length)} driven springs`}. Muse Wonder’s prompt at the time warned against exactly that term: “${DRIVE_WARNING}” (lib/scientist.ts:404). The line was written to stop overfitting; these clips show it can also hide a real drive.${indDrive ? " It is not the whole story: in the independent re-run of round 6604982 Muse Wonder did propose a drive, and the fit still missed its frequency, because a sinusoid’s frequency needs a starting guess, for example from the residuals’ spectrum, which the fit does not take yet." : ""} Both sets ran with the same prompt; a changed prompt or fit needs fresh draws to test.`
    : null;
  return {
    n: draws.length,
    found,
    draws,
    sealCommit: s0.sealCommit,
    revealCommit: s0.revealCommit,
    sealUrl: `${REPO}/commit/${s0.sealCommit}`,
    revealUrl: `${REPO}/commit/${s0.revealCommit}`,
    narration: s0.narration,
    usd,
    summary,
    within,
    rule,
    timing,
    wonderStory,
    driveNote,
    pattern,
    proves,
    independent: INDEPENDENT.map(({ round, line }) => ({ round, line })),
    wonderFound: es.filter((e) => sealedOfE(e).verdict === "hit" && e.candidates.find((c) => c.law.id === e.winner)?.origin === "revision").length,
    sets: [...new Set(es.map((e) => sealedOfE(e).sealCommit))].map((seal) => {
      const of = es.filter((e) => sealedOfE(e).sealCommit === seal);
      return { seal, reveal: sealedOfE(of[0]).revealCommit, rounds: of.map((e) => sealedOfE(e).round) };
    }),
  };
}

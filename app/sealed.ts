import "server-only";
import { getExperiment } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiment";
import { authorOf, driveCredit, drawnText, drivePeak, sealedOf as sealedOfRecord, writesDrive, type Peak, type SealedRecord as Sealed } from "./sealedWords";

export { drawnText } from "./sealedWords";

/**
 * The sealed-law test, as the pages quote it: spring laws drawn from drand rounds by scripts/sealed-law.ts, their hashes
 * pushed before the clips were rendered, revealed after Ansatz's runs. Every figure is read from the showcase records
 * (extras.sealed holds the draw, the commits and the verdict; extras.truth the drawn values); the table below holds only
 * what the records cannot: GitHub's push times, and whether Muse Wonder's prompt warned against a drive at the time.
 *
 * A new batch is one more row: its records are sealed-law-<round>.json, read with their own seal and reveal commits,
 * and the batch counts on every page once all its records ship (and are listed in order.json for the gallery).
 */
export type Batch = {
  set: number;
  rounds: number[];
  /** the commits as the records will carry them (each record's extras.sealed wins) */
  seal?: string;
  reveal?: string;
  /** GitHub's push times (https://api.github.com/repos/RohanGlitched/ansatz/activity): commit times are the author's */
  sealPushed?: string;
  revealPushed?: string;
  /** when the clips finished rendering (mtime of sealed/clips/render-*.log), where it was read */
  rendered?: string;
  /** a commit that named the rounds before drand published them, its commit time, and the code commit it froze */
  precommit?: { commit: string; at: string; code: string };
  /** Muse Wonder's prompt warned against a drive when these runs were made (lib/scientist.ts:404 at 1811071) */
  warned: boolean;
  /** what the code that ran the set gave the models: the drive warning (sets 1–2), the prompt fix (set 3: the warning
   * made conditional, the two strongest residual frequencies shown), or the spectrum tool (set 4: Muse Wonder's
   * residual_spectrum tool, and code adding a drive at an unexplained residual peak). Sets are counted per stage, never
   * lumped as "after the fix". */
  stage: Stage;
};
export type Stage = "warning" | "prompt" | "tool";
/** each stage's name, as the pages print it, and what changed in it */
const STAGE: Record<Stage, { name: string; change: string }> = {
  warning: { name: "while Muse Wonder’s prompt warned off a drive", change: "Muse Wonder’s prompt warned it off “a driving force”" },
  prompt: { name: "after the prompt fix", change: "the warning made conditional, and Muse Wonder shown the two strongest frequencies in the misses" },
  tool: { name: "after the spectrum tool", change: "Muse Wonder given a residual-spectrum tool that labels each peak in a law’s misses, and code adding a drive at an unexplained peak" },
};

/**
 * Re-runs of one found law on the identical clip, made after its reveal (so not sealed draws), at a named code commit:
 * the first law Muse Wonder found, round 6604797, re-run three times at 0b852c8 (.probe/sealed/NOTES.md, "Replicate
 * study"). Their records are kept with the notes, not published as runs, so this table holds what they showed; the
 * first run counts as one of the runs. The review run's earlier re-run (old code) is quoted apart and counted nowhere.
 */
const REPLICATE = {
  round: 6604797,
  code: "0b852c8",
  runs: [
    { found: true, note: "the drawn terms, every constant within 0.9σ" },
    { found: true, note: "the drawn terms (a viscous term at 0.3σ, absent), every constant within 0.8σ" },
    { found: false, note: "a false drive: after the referee asked for “a gentle periodic push”, Muse Wonder wrote one at 8.52 ± 0.08 rad/s (6.5σ), inside the motion’s own band (8.72), and it won; code’s own drive is barred from that band, a model’s is not yet" },
  ],
};

export const BATCHES: Batch[] = [
  { set: 1, rounds: [6604796, 6604797, 6604798], seal: "2752b74", reveal: "b66261e", sealPushed: "2026-11-01T23:16:15Z", revealPushed: "2026-11-01T23:34:45Z", rendered: "2026-11-01T23:17:32Z", warned: true, stage: "warning" },
  { set: 2, rounds: [6604980, 6604981, 6604982], seal: "4b94c8b", reveal: "9997e76", sealPushed: "2026-11-02T00:48:11Z", revealPushed: "2026-11-02T01:04:54Z", warned: true, stage: "warning" },
  // named before they existed (sealed/precommit-3.json, pushed 01:54:47 UTC; the first round published 01:58:30), on
  // the code that made Muse Wonder's drive warning conditional and starts a drive's frequency at the strongest residual peak
  { set: 3, rounds: [6605123, 6605124, 6605125], seal: "8337791", reveal: "3636e41", sealPushed: "2026-11-02T01:59:33Z", revealPushed: "2026-11-02T02:23:36Z", precommit: { commit: "493e869", at: "2026-11-02T01:54:47Z", code: "edb5c02" }, warned: false, stage: "prompt" },
  // named before they existed (sealed/precommit-4.json, pushed 06:07:45 UTC; the first round published 06:11:30), on the
  // code that gives Muse Wonder a residual_spectrum tool and lets code add a drive at an unexplained residual peak and
  // recombine Muse Wonder's stiffness with Muse Spark's damping (0b852c8, pushed 06:06:56)
  { set: 4, rounds: [6605629, 6605630, 6605631], seal: "d846c66", reveal: "b1902a4", sealPushed: "2026-11-02T06:12:51Z", revealPushed: "2026-11-02T07:14:45Z", rendered: "2026-11-02T06:15:11Z", precommit: { commit: "3bc0190", at: "2026-11-02T06:07:45Z", code: "0b852c8" }, warned: false, stage: "tool" },
];
/** every sealed round whose run page opens on the sealed result (a round without a record is simply never matched) */
export const SEALED_ROUNDS = BATCHES.flatMap((b) => b.rounds);
const REPO = "https://github.com/RohanGlitched/ansatz";
const commitUrl = (c: string) => `${REPO}/commit/${c}`;

type Row = { label: string; param: string; measured: number; sigma: number; truth: number; unit: string; si?: { measured: number; sigma: number; truth: number; unit: string } };

export type SealedDraw = {
  round: number;
  url: string;
  href: string;
  /** the verdict under the rule the pages state (see `rule`) */
  verdict: "hit" | "miss";
  line: string;
  /** who wrote the winning law: Muse Spark, Muse Wonder or code */
  author: string;
  set: number;
  seal: string;
  reveal: string;
  sealUrl: string;
  revealUrl: string;
};
export type SealedSet = { set: number; seal: string; reveal: string; sealUrl: string; revealUrl: string; rounds: number[]; n: number; found: number; driven: number; drivenFound: number; driveHit: number; warned: boolean; stage: Stage };
export type SealedTest = {
  n: number;
  found: number;
  draws: SealedDraw[];
  /** "Found 3 of 12: 2 of 6 in sets 1–2 (drive warning), 1 of 3 in set 3 (prompt fix), 0 of 3 in set 4 (spectrum tool)" */
  foundText: string;
  /** the one sentence every page leads with: what was found, the driven laws, what the spectrum tool changed, the replicate */
  headline: string;
  /** the replicate of the first law Muse Wonder found, the first run counted as one run (null if that run is not a hit) */
  replicate: { round: number; code: string; k: number; n: number; text: string; detail: string } | null;
  /** the section's title: found without a drive, missed in full with one, the drive found after the spectrum tool */
  title: string;
  narration: string;
  usd: number;
  summary: string;
  /** "all five constants of the two found laws within 2σ of the drawn values (the worst 1.97σ)" */
  within: string;
  /** what counts as found, and any verdict that rule changes */
  rule: string;
  /** GitHub's own push times beside the drand rounds, the renders and the runs, and what they do not prove */
  timing: string;
  /** the one law Muse Wonder wrote, step by step from its record, with its reasoning summary annotated */
  wonderStory: string | null;
  /** the driven misses, and the line in Muse Wonder's prompt that warned against a drive */
  driveNote: string | null;
  /** each stage in its own sentence (the drive warning, the prompt fix, the spectrum tool), then the false drives */
  pattern: string;
  /** what the seal proves and what it does not */
  proves: string;
  /** one sentence on the review run made outside this repository; never counted */
  review: string;
  /** found laws whose winning law Muse Wonder wrote */
  wonderFound: number;
  /** each set's commits and counts, in order */
  sets: SealedSet[];
  /** the commit and line of the drive warning, pinned (the line has since been rewritten) */
  warningUrl: string;
};

/**
 * A review run on 2 November, outside this repository, with the same scripts and narration (its records are kept with
 * the hackathon's review notes): it drew round 6604983 (a dry-friction spring, found), re-ran round 6604982 (driven,
 * missed) and re-ran round 6604797 on the identical clip (not reproduced). Its records are not published here, so it is
 * quoted in one sentence and counted nowhere.
 */
const REVIEW = "A separate review run with the same scripts, outside this repository (its records are kept with the review notes, not published here, so it is counted nowhere), found a dry-friction spring (round 6604983), missed a driven one (a re-run of round 6604982, where Muse Wonder did propose a drive but the fit left its frequency at 10.3 ± 3.7 rad/s against 15.2), and did not reproduce round 6604797 (on the identical clip Muse Wonder chose viscous damping, and the winner missed the unseen frames by 3.55 px against the published 0.18 px).";

/** drand's default chain: genesis 1595431050, a round every 30 s */
const drandTime = (round: number) => new Date((1595431050 + (round - 1) * 30) * 1000);
/** the warning in Muse Wonder's prompt when the first two sets ran (lib/scientist.ts:404 at 1811071) */
const DRIVE_WARNING = "a law that only lowers the residuals by adding knobs (a driving force, extra harmonics) will lose on the held-out frames";
const WARNING_AT = "lib/scientist.ts:404 at commit 1811071";
const WARNING_URL = `${REPO}/blob/1811071/lib/scientist.ts#L404`;
/** the rule every page states, and the bound it uses */
const SIGMA_BOUND = 2;

/** "3408 ± 28" with the error bar's own precision */
const pm = (v: number, s: number) => {
  const d = Math.max(0, -Math.floor(Math.log10(s)) + (s / 10 ** Math.floor(Math.log10(s)) < 2 ? 1 : 0));
  return `${v.toFixed(d)} ± ${s.toFixed(d)}`;
};
const rowsOf = (e: Experiment) => (e.extras?.truth?.rows ?? []) as Row[];
const zOf = (r: Row) => Math.abs(r.measured - r.truth) / r.sigma;

/** a constant against its drawn value, in metres where the record converts it, the drawn value to the same decimals */
const rowText = (r: Row) => {
  const v = r.si ?? r;
  const name = r.label.replace(/ \(√\(k\/m\)\)$/, "").replace(/^natural angular frequency /, "");
  const m = pm(v.measured, v.sigma);
  const d = (m.split(" ± ")[0].split(".")[1] ?? "").length;
  const z = zOf(r);
  const off = z > 1 ? ` (${z.toFixed(1)}σ off, ${(Math.abs(r.measured / r.truth - 1) * 100).toFixed(3)}%)` : "";
  return `${name} ${m} against ${v.truth.toFixed(d)} ${v.unit}${off}`;
};

/**
 * The verdict under the stated rule: the record's verdict says whether the winning law has the drawn law's terms and no
 * others (scored at the reveal); on top of it every constant must land within 2σ of its drawn value.
 */
const ruleVerdict = (e: Experiment, s: Sealed): "hit" | "miss" => (s.verdict === "hit" && rowsOf(e).every((r) => zOf(r) <= SIGMA_BOUND) ? "hit" : "miss");

/** a driven draw whose drive line the sideband rule took for the motion's own modulation, so code added no drive */
const masked = (s: Sealed) => {
  const p = drivePeak(s);
  return p?.label === "sideband" ? `The residual line at the drive’s frequency (${p.omega.toFixed(2)} rad/s against ${s.constants.wd.value.toFixed(2)}, ${Math.round(p.ampNoise)}× the noise) was labelled a sideband of the motion, so code added no drive, and no model wrote one.` : "";
};

function drawLine(e: Experiment, s: Sealed, b: Batch, verdict: "hit" | "miss"): string {
  const rows = rowsOf(e);
  const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  const next = e.candidates.filter((c) => c.fit.ok && c.law.id !== win.law.id).sort((a, b) => a.rank - b.rank)[0];
  const head = `Round ${s.round}: ${drawnText(s.drawn)}.`;
  const miss = `It misses the unseen frames by ${win.fit.testRms.toFixed(2)} px${next ? `, against ${next.fit.testRms.toFixed(2)} px for the next-ranked law` : ""}`;
  if (verdict === "hit") {
    const within1 = rows.every((r) => zOf(r) <= 1);
    const who = win.origin === "revision" ? `Found: Muse Wonder wrote the law${e.wonder?.trigger === "referee" ? " after the referee read the residuals" : ""}` : win.origin === "combined" ? (win.combined === "drive" ? "Found: code added the drive to the best law without one, at the unexplained frequency in its misses" : "Found: code combined Muse Wonder’s stiffness with Muse Spark’s damping") : "Found: Muse Spark’s own law";
    const tie = next && Math.abs(next.fit.testRms - win.fit.testRms) < 0.01 * win.fit.testRms ? ` (the next law is the same one with an extra term, which ties and ranks second)` : "";
    return `${head} ${who}, ${rows.map(rowText).join(", ")}${within1 ? ", every constant within 1σ" : ""}.${s.drawn.drive ? ` ${driveCredit(e).charAt(0).toUpperCase()}${driveCredit(e).slice(1)}.` : ""} ${miss}${tie}.`;
  }
  if (s.verdict === "hit") return `${head} Missed under the stated rule: the winning law has the drawn terms, but ${rows.filter((r) => zOf(r) > SIGMA_BOUND).map(rowText).join(", ")}. ${miss}.`;
  // a miss: what was written instead, and whether any model proposed the missing term
  const driveProposed = e.candidates.some(writesDrive);
  const ws = win.fit.theta.omega_s, w0 = rows.find((r) => r.param === "omega")?.truth, wd = s.constants.wd?.value;
  const beat = ws && w0 && wd ? ` Its hidden second oscillator runs at ${ws.toFixed(2)} rad/s, the sum of the swing’s and the drive’s frequencies (${(w0 + wd).toFixed(2)}) to ${(Math.abs(ws / (w0 + wd) - 1) * 100).toFixed(1)}%: it fitted the beat, not the drive.` : "";
  const wdRow = rows.find((r) => r.param === "w_drive");
  const driveWon = s.drawn.drive && writesDrive(win);
  const noDrive = driveWon
    ? ` The drive itself was found: ${driveCredit(e)}${wdRow ? `, its frequency ${pm(wdRow.measured, wdRow.sigma)} against ${wdRow.truth.toFixed(2)} rad/s` : ""}; the miss is in the stiffness or the damping.`
    : s.drawn.drive && !driveProposed ? (b.warned ? " No model proposed a drive, and Muse Wonder’s prompt at the time warned it against one." : masked(s) ? ` ${masked(s)}` : " No model proposed a drive.") : s.drawn.drive ? " A drive was proposed, but that law did not win." : "";
  return `${head} Missed: Ansatz wrote “${win.law.title}”.${beat}${noDrive} The best law still misses the unseen frames by ${win.fit.testRms.toFixed(2)} px, ${Math.round(win.fit.testZ ?? NaN)}× the noise${next ? ` (the next-ranked law: ${next.fit.testRms.toFixed(2)} px)` : ""}.`;
}

export async function sealedTest(): Promise<SealedTest | null> {
  const load = (rounds: number[]) => Promise.all(rounds.map((r) => getExperiment(`sealed-law-${r}`).catch(() => null)));
  const loaded = await Promise.all(BATCHES.map((b) => load(b.rounds)));
  const complete = (es: (Experiment | null)[]) => es.every((e) => e && sealedOfRecord(e));
  // the first set is required; a later set counts once all its records ship
  if (!complete(loaded[0])) return null;
  const used = BATCHES.map((b, i) => ({ b, es: loaded[i] as Experiment[] })).filter((x, i) => i === 0 || complete(x.es));
  const es = used.flatMap((x) => x.es);
  const sealedOfE = (e: Experiment) => sealedOfRecord(e)!;
  const batchOf = (e: Experiment) => used.find((x) => x.es.includes(e))!.b;
  const verdictOf = (e: Experiment) => ruleVerdict(e, sealedOfE(e));
  const draws: SealedDraw[] = es.map((e) => {
    const s = sealedOfE(e), b = batchOf(e);
    const seal = s.sealCommit ?? b.seal, reveal = s.revealCommit ?? b.reveal;
    return { round: s.round, url: s.url, href: `/x/${e.id}`, verdict: verdictOf(e), line: drawLine(e, s, b, verdictOf(e)), author: authorOf(e), set: b.set, seal, reveal, sealUrl: commitUrl(seal), revealUrl: commitUrl(reveal) };
  });
  const s0 = sealedOfE(es[0]);
  const found = draws.filter((d) => d.verdict === "hit").length;
  const usd = es.reduce((t, e) => t + e.ledger.usd, 0);
  const W = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen"];
  const w = (k: number) => W[k] ?? String(k);
  const Wc = (k: number) => w(k).charAt(0).toUpperCase() + w(k).slice(1);
  const ORD = ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"];
  const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const roundsText = (rs: number[]) => (rs.length > 1 ? `${rs.slice(0, -1).join(", ")} and ${rs.at(-1)}` : String(rs[0]));
  const span = (rs: number[]) => `${rs[0]}–${rs.at(-1)}`;
  const hm = (d: Date) => d.toISOString().slice(11, 19);
  const winOf = (e: Experiment) => e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  const wdRow = (e: Experiment) => rowsOf(e).find((r) => r.param === "w_drive");
  /** a driven draw whose winning law carries the drive at the drawn frequency (within 2σ), whatever its other terms */
  const driveHit = (e: Experiment) => {
    const s = sealedOfE(e);
    if (!s.drawn.drive || !writesDrive(winOf(e))) return false;
    const r = wdRow(e);
    return r ? zOf(r) <= SIGMA_BOUND : !!(s as Sealed & { driveFound?: boolean }).driveFound;
  };

  // counted per stage (the drive warning, the prompt fix, the spectrum tool), never merged into "after the fix"
  const pre = es.filter((e) => batchOf(e).warned), post = es.filter((e) => !batchOf(e).warned);
  const postSets = used.filter((x) => !x.b.warned).map((x) => x.b);
  const count = (xs: Experiment[]) => {
    const driven = xs.filter((e) => sealedOfE(e).drawn.drive);
    const undriven = xs.filter((e) => !sealedOfE(e).drawn.drive);
    return {
      n: xs.length,
      found: xs.filter((e) => verdictOf(e) === "hit").length,
      driven: driven.length,
      drivenFound: driven.filter((e) => verdictOf(e) === "hit").length,
      undriven: undriven.length,
      undrivenFound: undriven.filter((e) => verdictOf(e) === "hit").length,
      driveHit: driven.filter(driveHit).length,
      falseDrive: undriven.filter((e) => writesDrive(winOf(e))).length,
    };
  };
  const cAll = count(es);
  const ORDER: Stage[] = ["warning", "prompt", "tool"];
  const setsWord = (bs: Batch[]) => (bs.length === 1 ? `set ${bs[0].set}` : `sets ${bs[0].set}–${bs.at(-1)!.set}`);
  const stages = ORDER.map((k) => ({ k, sets: used.filter((x) => x.b.stage === k).map((x) => x.b), es: es.filter((e) => batchOf(e).stage === k) }))
    .filter((x) => x.es.length)
    .map((x) => ({ ...x, c: count(x.es) }));
  const SHORT: Record<Stage, string> = { warning: "drive warning", prompt: "prompt fix", tool: "spectrum tool" };
  const perStage = stages.map((x) => `${x.c.found} of ${x.c.n} in ${setsWord(x.sets)} (${SHORT[x.k]})`).join(", ");
  const foundText = stages.length > 1 ? `Found ${found} of ${draws.length}: ${perStage}` : `Found ${found} of ${draws.length}`;

  // the found laws' constants against the drawn values, in σ
  const hitsE = es.filter((e) => verdictOf(e) === "hit");
  const zs = hitsE.flatMap((e) => rowsOf(e).map(zOf));
  const worst = zs.length ? Math.max(...zs) : NaN;
  const bound = worst <= 1 ? 1 : worst <= 2 ? 2 : Math.ceil(worst);
  const within = zs.length ? `all ${w(zs.length)} constants of the ${w(hitsE.length)} found laws within ${bound}σ of the drawn values (worst ${worst.toFixed(2)}σ)` : "";
  const missE = es.filter((e) => verdictOf(e) === "miss");
  const summary = `${found} of ${draws.length} laws drawn by drand, sealed before the run: ${w(draws.length)} spring laws were drawn from public randomness (drand rounds ${roundsText(draws.map((d) => d.round))}) and their hashes pushed to GitHub before the clips were rendered; told only “${s0.narration}”, Ansatz found ${hitsE.length ? hitsE.map((e) => `${drawnText(sealedOfE(e).drawn)} (round ${sealedOfE(e).round})`).join(", ") : "none of them"}${within ? `, with ${within}` : ""}${missE.length ? `, and missed the other ${w(missE.length)}` : ""}.`;

  // the stated rule, applied to every record; any verdict it changes is named
  const flipped = es.filter((e) => sealedOfE(e).verdict === "hit" && verdictOf(e) === "miss");
  const rule = `A draw counts as found when the winning law’s terms are the drawn law’s terms (a constant consistent with zero counts as absent) and every constant lands within ${SIGMA_BOUND}σ of its drawn value. ${flipped.length ? `That rule changes ${flipped.length === 1 ? "one verdict" : `${w(flipped.length)} verdicts`}: ${flipped.map((e) => `round ${sealedOfE(e).round} had the drawn terms, but ${rowsOf(e).filter((r) => zOf(r) > SIGMA_BOUND).map(rowText).join(", ")}, so it is counted as missed here`).join("; ")}.` : `It changes no verdict: ${within || "no law was found"}.`} We stated it after the reveals; it is stricter than the note we wrote before the first one, and it is not in the seal commits.`;

  // the replicate of the first law Muse Wonder found: the first run counts as one run (only when that run is a hit)
  const repFirst = es.find((e) => sealedOfE(e).round === REPLICATE.round);
  const replicate =
    repFirst && verdictOf(repFirst) === "hit"
      ? (() => {
          const n = REPLICATE.runs.length + 1;
          const k = 1 + REPLICATE.runs.filter((r) => r.found).length;
          const failed = REPLICATE.runs.map((r, i) => ({ ...r, i: i + 2 })).filter((r) => !r.found);
          const tail = failed.length === 1 && /^a false drive/.test(failed[0].note) ? ` (the ${ORD[failed[0].i] ?? `run ${failed[0].i}`} wrote a false drive)` : failed.length ? ` (the others missed)` : "";
          const by = authorOf(repFirst) === "Muse Wonder" ? "the first law Muse Wonder found" : "the first law found";
          const text = `a replicate of ${by} (round ${REPLICATE.round}) reproduced it ${k} times in ${n} runs${tail}`;
          const detail = `Re-run ${w(REPLICATE.runs.length)} times on the identical clip at code ${REPLICATE.code}, after its reveal (so these are replicates, not sealed draws; their records are kept with the notes, not published as runs): ${REPLICATE.runs.map((r, i) => `run ${i + 2}, ${r.found ? "found again" : "missed"}: ${r.note}`).join("; ")}. That is ${w(k)} of ${w(n)} runs, the first included.`;
          return { round: REPLICATE.round, code: REPLICATE.code, k, n, text, detail };
        })()
      : null;

  // the headline, in three clauses: what was found, the driven laws, what the spectrum tool changed; then the replicate
  const tool = stages.find((x) => x.k === "tool");
  const toolDriveE = tool ? tool.es.filter(driveHit) : [];
  const byCode = toolDriveE.filter((e) => winOf(e).combined === "drive").length;
  const foundClause =
    cAll.found === cAll.undrivenFound
      ? `${found} found (${found ? `every one without a drive, on its first run, ${cAll.undrivenFound} of ${cAll.undriven}` : `none of the ${cAll.undriven} without a drive`})`
      : `${found} found (${cAll.undrivenFound} of the ${cAll.undriven} without a drive, ${cAll.drivenFound} of the ${cAll.driven} with one)`;
  const drivenClause = cAll.drivenFound === 0 ? `none of the ${cAll.driven} driven laws found in full` : `${cAll.drivenFound} of the ${cAll.driven} driven laws found in full`;
  const codeWords = byCode === toolDriveE.length ? (byCode === 1 ? "added by code" : byCode === 2 ? "both added by code" : "all added by code") : `${byCode} added by code`;
  const toolClause =
    tool && tool.c.driven
      ? `after Muse Wonder got a residual-spectrum tool (${setsWord(tool.sets)}), the winning law carried the drive at the right frequency in ${tool.c.driveHit} of ${tool.c.driven} driven draws${tool.c.driveHit ? ` (${byCode ? codeWords : "written by the models"})${tool.c.driveHit > tool.c.drivenFound ? " and missed on stiffness or damping" : ""}` : ""}`
      : "";
  const headline = `${Wc(draws.length)} laws drawn by public randomness, hashes pushed before any clip: ${[foundClause, drivenClause, toolClause, replicate?.text].filter(Boolean).join("; ")}.`;

  // each stage in its own words: what changed, what was found, and where the drive went
  const driveWord = (e: Experiment) => {
    const r = wdRow(e);
    return r ? `${pm(r.measured, r.sigma)} against ${r.truth.toFixed(2)} rad/s` : "";
  };
  const stageText = (x: (typeof stages)[number]) => {
    const c = x.c;
    const named = x.sets.flatMap((b) => (b.precommit ? [`rounds named in advance in ${b.precommit.commit}, code ${b.precommit.code}`] : []));
    const what = x.k === "warning" ? WARNING_AT : `${STAGE[x.k].change}${named.length ? `; ${named.join("; ")}` : ""}`;
    const undrMissed = x.es.filter((e) => !sealedOfE(e).drawn.drive && verdictOf(e) === "miss").map((e) => `${drawnText(sealedOfE(e).drawn)} missed`);
    const undr = !c.undriven ? "" : (c.undrivenFound === c.undriven ? `every law without a drive (${c.undrivenFound} of ${c.undriven})` : `${c.undrivenFound} of the ${c.undriven} without a drive (${undrMissed.join(", ")})`);
    const dr = !c.driven ? "" : !c.undriven ? (c.drivenFound === c.driven ? `all ${w(c.driven)}, every one driven` : `all ${w(c.driven)} driven`) : (c.drivenFound === c.driven ? `every driven law (${c.driven})` : c.drivenFound ? `${c.drivenFound} of the ${c.driven} driven` : c.driven === 1 ? "not the one driven law" : `none of the ${c.driven} driven`);
    const drivenMiss = x.es.filter((e) => sealedOfE(e).drawn.drive && verdictOf(e) === "miss");
    const carried = drivenMiss.filter(driveHit);
    const maskedE = drivenMiss.filter((e) => !driveHit(e) && masked(sealedOfE(e)));
    const proposed = drivenMiss.filter((e) => !driveHit(e) && !masked(sealedOfE(e)) && e.candidates.some(writesDrive));
    const none = drivenMiss.filter((e) => !driveHit(e) && !masked(sealedOfE(e)) && !e.candidates.some(writesDrive));
    const drive: string[] = [];
    if (carried.length) {
      const code = carried.every((e) => winOf(e).combined === "drive");
      drive.push(`on ${carried.length === 1 ? "round" : "rounds"} ${roundsText(carried.map((e) => sealedOfE(e).round))} the winning law carried the drive${code ? ", added by code at the unexplained residual frequency" : ""} (${carried.map(driveWord).join("; ")}), and missed on its stiffness or damping`);
    }
    for (const e of maskedE) {
      const p = drivePeak(sealedOfE(e))!;
      drive.push(`on round ${sealedOfE(e).round} the drive’s residual line (${p.omega.toFixed(2)} rad/s against ${sealedOfE(e).constants.wd.value.toFixed(2)}) was labelled a sideband, and no drive was added`);
    }
    if (proposed.length) drive.push(`on ${proposed.length === 1 ? "round" : "rounds"} ${roundsText(proposed.map((e) => sealedOfE(e).round))} a drive was proposed and lost`);
    if (none.length) drive.push(none.length === drivenMiss.length ? (none.length === 1 ? "no model wrote a drive on it" : "no model wrote a drive term on any of them") : `on ${roundsText(none.map((e) => sealedOfE(e).round))} no model wrote one`);
    return `${cap(setsWord(x.sets))}, ${STAGE[x.k].name} (${what}): ${c.found} of ${c.n} found, ${[undr, dr].filter(Boolean).join(" and ")}${drive.length ? `; ${drive.join("; ")}` : ""}.`;
  };
  const falseDrive = cAll.undriven ? ` No sealed law without a drive gained a false one (${cAll.falseDrive} of ${cAll.undriven} first runs)${replicate && REPLICATE.runs.some((r) => /^a false drive/.test(r.note)) ? "; one replicate run did" : ""}.` : "";
  const pattern = `${stages.map(stageText).join(" ")}${falseDrive}`;
  // the section's title: found without a drive, missed in full with one, and what the spectrum tool found
  const title = `${cAll.found && cAll.found === cAll.undrivenFound ? "found without a drive" : `${cAll.found} found`}, ${cAll.drivenFound ? `${cAll.drivenFound} of ${cAll.driven} with one` : "missed in full with one"}${tool && tool.c.driveHit ? `; after the spectrum tool, the drive itself in ${tool.c.driveHit} of ${tool.c.driven}` : ""}`;

  // what the seal proves: the laws were not chosen, and the order of draw, run and reveal; not a frozen pipeline
  const postCode = post.map((e) => (e as Experiment & { code?: { commit: string; dirty: boolean } }).code).filter((c): c is { commit: string; dirty: boolean } => !!c);
  const postProves = post.length
    ? ` The ${postSets.length === 1 ? "third set" : "later sets"} named ${postSets.length === 1 ? "its" : "their"} rounds before drand published them${postSets.some((b) => b.precommit) ? ` (${postSets.length === 1 ? "commit" : "commits"} ${postSets.flatMap((b) => (b.precommit ? [b.precommit.commit] : [])).join(" and ")})` : ""}${postCode.length === post.length ? `, and every run records its code: ${[...new Set(postCode.map((c) => c.commit.slice(0, 7)))].join(", ")}${postCode.some((c) => c.dirty) ? ", with uncommitted changes on at least one run" : " on a clean tree"}` : ""}.`
    : "";
  const proves = `Each law is a public function of its drand value, so the hash adds nothing beyond drand itself: anyone, us included, could compute the law once the round was out. Neither of the first two sets committed its round numbers before those rounds existed; the hashes were pushed 15 s and 11 s after the last round, which fixes each law before any clip was rendered but does not rule out a draw that was thrown away. And none of their runs can be tied to a clean committed tree: the first set ran with uncommitted edits to lib/experiment.ts, later committed as 56b2e88 (the closest match, not proven identical), and the last run of the second set probably with uncommitted lite-mode edits. So for those sets the seal proves that the laws were not picked by hand, and the order of draw, run and reveal. It does not prove that the code was frozen.${postProves}`;

  // the timeline per set: drand's round times, GitHub's push records, the runs' start (createdAt less the run's own ms) and end
  const runSpan = (xs: Experiment[]) => {
    const ends = xs.map((e) => new Date(e.createdAt));
    const starts = xs.map((e) => new Date(+new Date(e.createdAt) - (e.ledger.ms ?? 0)));
    return `the runs started at ${hm(new Date(Math.min(...starts.map(Number)))).slice(0, 5)} and finished by ${hm(new Date(Math.max(...ends.map(Number)))).slice(0, 5)}`;
  };
  const setTiming = (x: { b: Batch; es: Experiment[] }, i: number) => {
    const b = x.b, s = sealedOfE(x.es[0]);
    const seal = s.sealCommit ?? b.seal, reveal = s.revealCommit ?? b.reveal;
    const last = drandTime(b.rounds.at(-1)!);
    if (i === 0) {
      const lag = b.sealPushed ? Math.round((+new Date(b.sealPushed) - +last) / 1000) : NaN;
      return `drand published round ${b.rounds.at(-1)} at ${hm(last)} UTC on 1 November; GitHub recorded the push of the seal commit ${seal}${b.sealPushed ? ` at ${hm(new Date(b.sealPushed))} UTC, ${lag} s later (in the repository’s activity feed on GitHub)` : ""}.${b.rendered ? ` The clips finished rendering at ${hm(new Date(b.rendered))}, ` : " "}${runSpan(x.es)}, and the reveal ${reveal} was pushed${b.revealPushed ? ` at ${hm(new Date(b.revealPushed))}` : ""}.`;
    }
    const named = b.precommit ? `, named in advance in commit ${b.precommit.commit} (committed ${hm(new Date(b.precommit.at))})` : "";
    return `The ${["first", "second", "third", "fourth", "fifth"][i] ?? `set ${b.set}`} set: rounds ${span(b.rounds)}${named}, published from ${hm(drandTime(b.rounds[0]))} to ${hm(last)}, the seal ${seal}${b.sealPushed ? ` pushed at ${hm(new Date(b.sealPushed))}` : ""}, ${runSpan(x.es)}, the reveal ${reveal}${b.revealPushed ? ` pushed at ${hm(new Date(b.revealPushed))}` : ""}.`;
  };
  const timing = `${used.map(setTiming).join(" ")} The script could have been run on earlier rounds and the result thrown away${post.length ? " (for the first two sets)" : ""}, and the grammar was committed with the first hashes, not before them. What protects the test is that the models never see the repository, and that for the first two sets the prompts and the physics code (lib/scientist.ts, lib/physics) were last changed at 1811071, 3¾ hours before the first draw${postSets.some((b) => b.precommit) ? `; for each later set, at the code commit its pre-commitment named before its rounds existed (${postSets.flatMap((b) => (b.precommit ? [`set ${b.set}: ${b.precommit.code}`] : [])).join(", ")})` : ""}.`;

  // the law Muse Wonder wrote: what the referee asked for, what Muse Wonder tried and what it submitted, read from the record
  const wonderRun = es.find((e) => verdictOf(e) === "hit" && e.candidates.find((c) => c.law.id === e.winner)?.origin === "revision" && !sealedOfE(e).drawn.drive);
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
    return `On round ${rd} the referee asked only to “${named.charAt(0).toLowerCase()}${named.slice(1)}”, and Muse Spark’s leading law had ${/viscous/i.test(lead?.law.title ?? "") ? "viscous drag" : "a different damping"}. Muse Wonder fitted ${tried.join(", then ")}${own ? " (the quadratic drag was its own idea)" : ""}, then submitted “${sub}”${own ? ", dropping the viscous term, which had fitted near zero" : ""}. That is the drawn law, and every constant lands within 1σ.${held ? " Its last reasoning summary gives “better held-out performance” as a reason; Muse Wonder never sees those frames (its tool returns misses on the fitted frames only), so that phrase is its own wording, not something it was shown." : ""}${replicate && rd === replicate.round ? ` ${replicate.detail}` : ""}`;
  })();

  // the driven misses, stage by stage: the warning (sets 1–2), the prompt fix (set 3), the spectrum tool (set 4)
  const driveMisses = pre.filter((e) => sealedOfE(e).drawn.drive && verdictOf(e) === "miss");
  const warnSets = stages.find((x) => x.k === "warning")?.sets ?? [];
  const promptStage = stages.find((x) => x.k === "prompt");
  const promptNote = (() => {
    const e = promptStage?.es.find((x) => sealedOfE(x).drawn.drive && verdictOf(x) === "miss" && !x.candidates.some(writesDrive));
    if (!promptStage || !e) return "";
    const s = sealedOfE(e);
    const top = (s as Sealed & { spectrumAtScoring?: { peaks?: Peak[] } }).spectrumAtScoring?.peaks?.[0];
    const wd = s.constants.wd?.value;
    return ` ${cap(setsWord(promptStage.sets))}, the prompt fix, made the warning conditional and showed Muse Wonder the two strongest frequencies in the misses${top && wd ? `: on its driven clip (round ${s.round}) the strongest sat at ${top.omega.toFixed(2)} rad/s against the drive’s ${wd.toFixed(2)}, Muse Wonder read it as the spring’s own frequency, and no model wrote a drive` : ""}. Showing the frequency was not enough.`;
  })();
  const toolNote = (() => {
    if (!tool || !tool.c.driven) return "";
    const carried = tool.es.filter((e) => verdictOf(e) === "miss" && driveHit(e)).map((e) => sealedOfE(e).round);
    const maskedR = tool.es.filter((e) => !driveHit(e) && masked(sealedOfE(e))).map((e) => sealedOfE(e).round);
    return ` ${cap(setsWord(tool.sets))}, the spectrum tool, gave Muse Wonder a tool that labels each peak in a law’s misses and let code add a drive at an unexplained one: the winning law carried the drive on ${w(tool.c.driveHit)} of the ${w(tool.c.driven)} driven clips${carried.length ? ` (${carried.length === 1 ? "round" : "rounds"} ${roundsText(carried)}${byCode === toolDriveE.length ? `, ${byCode === 1 ? "added" : "both added"} by code` : ""})` : ""}, so ${carried.length === 1 ? "that miss is" : "those misses are"} in the stiffness or the damping, not the drive${maskedR.length ? `; on round ${roundsText(maskedR)} the sideband label, added to stop false drives on undriven springs, hid the drive’s line` : ""}.`;
  })();
  const driveNote = driveMisses.length
    ? `The misses in ${setsWord(warnSets)} include all ${w(driveMisses.length)} driven springs. Muse Wonder’s prompt at the time warned against exactly that term: “${DRIVE_WARNING}” (${WARNING_AT}). The line was written to stop overfitting; these clips show it can also hide a real drive. It is not the whole story: in the review run’s re-run of round 6604982 Muse Wonder did propose a drive, and the fit still missed its frequency, because a sinusoid’s frequency needs a starting guess, for example from the residuals’ spectrum, which the fit did not take then (it does from code edb5c02 on).${promptNote}${toolNote}`
    : null;

  const sets: SealedSet[] = used.map(({ b, es: xs }) => {
    const s = sealedOfE(xs[0]);
    const seal = s.sealCommit ?? b.seal!, reveal = s.revealCommit ?? b.reveal!;
    const c = count(xs);
    return { set: b.set, seal, reveal, sealUrl: commitUrl(seal), revealUrl: commitUrl(reveal), rounds: xs.map((e) => sealedOfE(e).round), n: c.n, found: c.found, driven: c.driven, drivenFound: c.drivenFound, driveHit: c.driveHit, warned: b.warned, stage: b.stage };
  });

  return {
    n: draws.length,
    found,
    draws,
    foundText,
    headline,
    replicate,
    title,
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
    review: REVIEW,
    wonderFound: hitsE.filter((e) => authorOf(e) === "Muse Wonder").length,
    sets,
    warningUrl: WARNING_URL,
  };
}

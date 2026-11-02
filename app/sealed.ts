import "server-only";
import { getExperiment } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiment";
import { authorOf, driveCredit, drawnText, sealedOf as sealedOfRecord, writesDrive, type SealedRecord as Sealed } from "./sealedWords";

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
};

export const BATCHES: Batch[] = [
  { set: 1, rounds: [6604796, 6604797, 6604798], seal: "2752b74", reveal: "b66261e", sealPushed: "2026-11-01T23:16:15Z", revealPushed: "2026-11-01T23:34:45Z", rendered: "2026-11-01T23:17:32Z", warned: true },
  { set: 2, rounds: [6604980, 6604981, 6604982], seal: "4b94c8b", reveal: "9997e76", sealPushed: "2026-11-02T00:48:11Z", revealPushed: "2026-11-02T01:04:54Z", warned: true },
  // named before they existed (sealed/precommit-3.json, pushed 01:54:47 UTC; the first round published 01:58:30), on
  // the code that made Muse Wonder's drive warning conditional and starts a drive's frequency at the strongest residual peak
  { set: 3, rounds: [6605123, 6605124, 6605125], seal: "8337791", reveal: "3636e41", sealPushed: "2026-11-02T01:59:33Z", revealPushed: "2026-11-02T02:23:36Z", precommit: { commit: "493e869", at: "2026-11-02T01:54:47Z", code: "edb5c02" }, warned: false },
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
  set: number;
  seal: string;
  reveal: string;
  sealUrl: string;
  revealUrl: string;
};
export type SealedSet = { set: number; seal: string; reveal: string; sealUrl: string; revealUrl: string; rounds: number[]; n: number; found: number; driven: number; drivenFound: number; warned: boolean };
export type SealedTest = {
  n: number;
  found: number;
  draws: SealedDraw[];
  /** "Found 2 of 6", or per stage once a batch ran after the prompt fix ("Found 2 of 6 before the fix, 1 of 3 after") */
  foundText: string;
  /** the section's title: found without a drive, missed with one (or what the batch after the fix changed) */
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
  /** the section's headline: laws without a drive against laws with one, and the batch after the fix once it ships */
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
  const noDrive = s.drawn.drive && !driveProposed ? (b.warned ? " No model proposed a drive, and Muse Wonder’s prompt at the time warned it against one." : " No model proposed a drive.") : s.drawn.drive ? " A drive was proposed, but that law did not win." : "";
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
    return { round: s.round, url: s.url, href: `/x/${e.id}`, verdict: verdictOf(e), line: drawLine(e, s, b, verdictOf(e)), set: b.set, seal, reveal, sealUrl: commitUrl(seal), revealUrl: commitUrl(reveal) };
  });
  const s0 = sealedOfE(es[0]);
  const found = draws.filter((d) => d.verdict === "hit").length;
  const usd = es.reduce((t, e) => t + e.ledger.usd, 0);
  const W = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
  const w = (k: number) => W[k] ?? String(k);
  const Wc = (k: number) => w(k).charAt(0).toUpperCase() + w(k).slice(1);
  const roundsText = (rs: number[]) => (rs.length > 1 ? `${rs.slice(0, -1).join(", ")} and ${rs.at(-1)}` : String(rs[0]));
  const span = (rs: number[]) => `${rs[0]}–${rs.at(-1)}`;
  const hm = (d: Date) => d.toISOString().slice(11, 19);

  // before the prompt fix (the warning in place) and after it, never merged into one k-of-n
  const pre = es.filter((e) => batchOf(e).warned), post = es.filter((e) => !batchOf(e).warned);
  const count = (xs: Experiment[]) => {
    const driven = xs.filter((e) => sealedOfE(e).drawn.drive);
    return { n: xs.length, found: xs.filter((e) => verdictOf(e) === "hit").length, driven: driven.length, drivenFound: driven.filter((e) => verdictOf(e) === "hit").length, undriven: xs.length - driven.length, undrivenFound: xs.filter((e) => !sealedOfE(e).drawn.drive && verdictOf(e) === "hit").length };
  };
  const cPre = count(pre), cPost = count(post);
  const foundText = post.length ? `Found ${cPre.found} of ${cPre.n} before the fix, ${cPost.found} of ${cPost.n} after it` : `Found ${found} of ${draws.length}`;

  // the found laws' constants against the drawn values, in σ
  const hitsE = es.filter((e) => verdictOf(e) === "hit");
  const zs = hitsE.flatMap((e) => rowsOf(e).map(zOf));
  const worst = zs.length ? Math.max(...zs) : NaN;
  const bound = worst <= 1 ? 1 : worst <= 2 ? 2 : Math.ceil(worst);
  const within = zs.length ? `all ${w(zs.length)} constants of the ${w(hitsE.length)} found laws within ${bound}σ of the drawn values (worst ${worst.toFixed(2)}σ)` : "";
  const missE = es.filter((e) => verdictOf(e) === "miss");
  const stage = post.length ? `${cPre.found} of ${cPre.n} laws drawn by drand before Muse Wonder’s prompt was fixed, ${cPost.found} of ${cPost.n} after it` : `${found} of ${draws.length} laws drawn by drand`;
  const summary = `${stage}, sealed before the run: ${w(draws.length)} spring laws were drawn from public randomness (drand rounds ${roundsText(draws.map((d) => d.round))}) and their hashes pushed to GitHub before the clips were rendered; told only “${s0.narration}”, Ansatz found ${hitsE.length ? hitsE.map((e) => drawnText(sealedOfE(e).drawn)).join(" and ") : "none of them"}${within ? `, with ${within}` : ""}${missE.length ? `, and missed ${missE.map((e) => drawnText(sealedOfE(e).drawn)).join("; ")}` : ""}.`;

  // the stated rule, applied to every record; any verdict it changes is named
  const flipped = es.filter((e) => sealedOfE(e).verdict === "hit" && verdictOf(e) === "miss");
  const rule = `A draw counts as found when the winning law’s terms are the drawn law’s terms (a constant consistent with zero counts as absent) and every constant lands within ${SIGMA_BOUND}σ of its drawn value. ${flipped.length ? `That rule changes ${flipped.length === 1 ? "one verdict" : `${w(flipped.length)} verdicts`}: ${flipped.map((e) => `round ${sealedOfE(e).round} had the drawn terms, but ${rowsOf(e).filter((r) => zOf(r) > SIGMA_BOUND).map(rowText).join(", ")}, so it is counted as missed here`).join("; ")}.` : `It changes no verdict: ${within || "no law was found"}.`} We stated it after the reveals; it is stricter than the note we wrote before the first one, and it is not in the seal commits.`;

  // the headline: laws without a drive against laws with one, before the fix; then the batch after the fix, both ways
  const undriven = cPre.undrivenFound === cPre.undriven ? `Every law without a drive was found on its first run (${cPre.undrivenFound} of ${cPre.undriven})` : `${Wc(cPre.undrivenFound)} of the ${w(cPre.undriven)} laws without a drive ${cPre.undrivenFound === 1 ? "was" : "were"} found on their first run`;
  const driven = cPre.drivenFound === 0 ? `every law with a periodic drive was missed (0 of ${cPre.driven})` : `${w(cPre.drivenFound)} of the ${w(cPre.driven)} laws with a drive ${cPre.drivenFound === 1 ? "was" : "were"} found`;
  const anyDriveWritten = pre.some((e) => sealedOfE(e).drawn.drive && e.candidates.some(writesDrive));
  const why = !anyDriveWritten && cPre.driven ? ` Why: in those ${w(pre.length)} runs no model wrote a drive term, and Muse Wonder’s prompt warned it off “a driving force” (${WARNING_AT}).` : "";
  const unstable = ` The hits are not yet stable: in a separate review run, round 6604797 re-run on the identical clip did not reproduce.`;
  const b3 = BATCHES.find((b) => !b.warned);
  const postSets = used.filter((x) => !x.b.warned).map((x) => x.b);
  const postWords = postSets.map((b) => `set ${b.set}${b.precommit ? `: rounds named in advance in commit ${b.precommit.commit}, code ${b.precommit.code}` : ""}`).join("; ");
  let after: string;
  if (post.length) {
    const drivenHits = post.filter((e) => sealedOfE(e).drawn.drive && verdictOf(e) === "hit");
    const drivenMisses = post.filter((e) => sealedOfE(e).drawn.drive && verdictOf(e) === "miss");
    const falseDrive = post.filter((e) => !sealedOfE(e).drawn.drive && writesDrive(e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0]));
    const proposed = drivenMisses.filter((e) => e.candidates.some(writesDrive)).map((e) => sealedOfE(e).round);
    const head = `After the fix (${postWords}), Ansatz found ${cPost.found} of ${cPost.n}`;
    if (drivenHits.length) {
      // the version for a driven law found: who wrote the drive, and who started its frequency
      after = `${head}, including ${w(cPost.drivenFound)} of the ${w(cPost.driven)} driven laws, the first ${drivenHits.length === 1 ? "drive" : "drives"} it found: ${drivenHits.map((e) => `on round ${sealedOfE(e).round} ${driveCredit(e)}`).join("; ")}.`;
    } else if (cPost.driven) {
      // the version for no driven law found
      after = `${head}; the driven laws were missed again (0 of ${cPost.driven})${proposed.length ? `, though a drive was proposed on round ${roundsText(proposed)}` : ", and no model proposed a drive"}.`;
    } else after = `${head}; no law in it had a drive, so the fix is not yet tested on one.`;
    if (cPost.undriven) after += ` Without a drive: ${cPost.undrivenFound} of ${cPost.undriven} found${falseDrive.length ? `, but a drive term won on round ${roundsText(falseDrive.map((e) => sealedOfE(e).round))}, where none was drawn` : ", and no drive term won where none was drawn"}.`;
    after = ` ${after}`;
  } else if (b3?.precommit) {
    after = ` A third set is pre-committed: drand rounds ${span(b3.rounds)}, named in commit ${b3.precommit.commit} (committed ${hm(new Date(b3.precommit.at)).slice(0, 5)} UTC; the first of them published at ${hm(drandTime(b3.rounds[0])).slice(0, 5)}), on code ${b3.precommit.code} with Muse Wonder’s drive warning made conditional; its result is published here whatever it is.`;
  } else after = "";
  const pattern = `${post.length ? `Before the fix: ${undriven.charAt(0).toLowerCase()}${undriven.slice(1)}` : undriven}, and ${driven}.${why}${unstable}${after}`;
  // before the fix in its own words; after it, its own count, never merged into one k-of-n
  const preTitle = `${cPre.undrivenFound === cPre.undriven ? "found without a drive on the first run" : "not all found without a drive"}, ${cPre.drivenFound ? "some found with one" : "missed with one"}`;
  const title = post.length
    ? `${preTitle}; after the fix, ${cPost.found} of ${cPost.n}${cPost.driven ? (cPost.drivenFound ? `, ${cPost.drivenFound === 1 ? "a driven law" : `${w(cPost.drivenFound)} driven laws`} found` : `, the driven ${cPost.driven === 1 ? "law" : "laws"} missed again`) : ""}`
    : preTitle;

  // what the seal proves: the laws were not chosen, and the order of draw, run and reveal; not a frozen pipeline
  const postCode = post.map((e) => (e as Experiment & { code?: { commit: string; dirty: boolean } }).code).filter((c): c is { commit: string; dirty: boolean } => !!c);
  const postProves = post.length
    ? ` The ${postSets.length === 1 ? "third set" : "later sets"} named ${postSets.length === 1 ? "its" : "their"} rounds before drand published them${postSets[0]?.precommit ? ` (commit ${postSets[0].precommit.commit})` : ""}${postCode.length === post.length ? `, and every run records its code: ${[...new Set(postCode.map((c) => c.commit.slice(0, 7)))].join(", ")}${postCode.some((c) => c.dirty) ? ", with uncommitted changes on at least one run" : " on a clean tree"}` : ""}.`
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
  const timing = `${used.map(setTiming).join(" ")} The script could have been run on earlier rounds and the result thrown away${post.length ? " (for the first two sets)" : ""}, and the grammar was committed with the first hashes, not before them. What protects the test is that the models never see the repository, and that for the first two sets the prompts and the physics code (lib/scientist.ts, lib/physics) were last changed at 1811071, 3¾ hours before the first draw${b3?.precommit ? `; for the third, at ${b3.precommit.code}, before its rounds were named` : ""}.`;

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
    return `On round ${rd} the referee asked only to “${named.charAt(0).toLowerCase()}${named.slice(1)}”, and Muse Spark’s leading law had ${/viscous/i.test(lead?.law.title ?? "") ? "viscous drag" : "a different damping"}. Muse Wonder fitted ${tried.join(", then ")}${own ? " (the quadratic drag was its own idea)" : ""}, then submitted “${sub}”${own ? ", dropping the viscous term, which had fitted near zero" : ""}. That is the drawn law, and every constant lands within 1σ.${held ? " Its last reasoning summary gives “better held-out performance” as a reason; Muse Wonder never sees those frames (its tool returns misses on the fitted frames only), so that phrase is its own wording, not something it was shown." : ""}${rd === 6604797 ? " It did not reproduce: re-run on the identical clip in the separate review run, Muse Wonder chose viscous damping instead, and the winner missed the unseen frames by 3.55 px." : ""}`;
  })();

  // the driven misses made while the warning stood
  const driveMisses = pre.filter((e) => sealedOfE(e).drawn.drive && verdictOf(e) === "miss");
  const fixNote = post.length ? ` The ${postSets.length === 1 ? "third set" : "later sets"} ran with the warning made conditional and a drive’s frequency started at the strongest residual frequency; ${postSets.length === 1 ? "its" : "their"} result is above.` : ` The first two sets ran with the same prompt; the third set${b3?.precommit ? `, pre-committed on code ${b3.precommit.code},` : ""} tests the changed prompt and fit on fresh draws.`;
  const driveNote = driveMisses.length
    ? `The misses before the fix are the ${driveMisses.length === 1 ? "one driven spring" : `${w(driveMisses.length)} driven springs`}. Muse Wonder’s prompt at the time warned against exactly that term: “${DRIVE_WARNING}” (${WARNING_AT}). The line was written to stop overfitting; these clips show it can also hide a real drive. It is not the whole story: in the review run’s re-run of round 6604982 Muse Wonder did propose a drive, and the fit still missed its frequency, because a sinusoid’s frequency needs a starting guess, for example from the residuals’ spectrum, which the fit did not take then (it does from code edb5c02 on).${fixNote}`
    : null;

  const sets: SealedSet[] = used.map(({ b, es: xs }) => {
    const s = sealedOfE(xs[0]);
    const seal = s.sealCommit ?? b.seal!, reveal = s.revealCommit ?? b.reveal!;
    const c = count(xs);
    return { set: b.set, seal, reveal, sealUrl: commitUrl(seal), revealUrl: commitUrl(reveal), rounds: xs.map((e) => sealedOfE(e).round), n: c.n, found: c.found, driven: c.driven, drivenFound: c.drivenFound, warned: b.warned };
  });

  return {
    n: draws.length,
    found,
    draws,
    foundText,
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

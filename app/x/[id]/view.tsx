import { access, readdir } from "node:fs/promises";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AskRun from "@/components/AskRun";
import ExperimentVisual from "@/components/ExperimentVisual";
import Tex from "@/components/Tex";
import Plate, { Note, Page, Reading, Section } from "@/components/book/Plate";
import FalsifyPlate from "@/components/book/FalsifyPlate";
import MoonPlate from "@/components/book/MoonPlate";
import { clipData, getExperiment, plateData, showcaseIds, videoUrl, winnerOf } from "@/lib/experiments";
import { lawLatex, paramLatex } from "@/lib/latex";
import { atBound, type Experiment } from "@/lib/experiment";
import { plateLaws } from "@/lib/plateLaws";
import { prettyUnit, secondPower } from "@/lib/units";
import { fmtDate, fmtPair, fmtProse } from "@/lib/format";
import { dampingTie, noiseScore, tied } from "@/lib/tie";
import { LANGUAGES, translation } from "@/lib/translate";
import { CountUp, Reveal } from "./Reveal";
import SeriesFigure from "./SeriesFigure";
import styles from "./page.module.css";

/**
 * One experiment's page, a paper in the lab book, shared by three routes: /x/[id] (built ahead for the shipped runs
 * and cached an hour), /x/[id]/[lang] (the same, translated), and /x/[id]/live (a visitor's run, rendered on each
 * request; the middleware sends visitors' run ids there).
 */

/** A title cut at a word boundary, so that with the layout's " · Ansatz" the whole <title> stays under 70 characters. */
function shortTitle(s: string, max = 59) {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return cut.slice(0, Math.max(cut.lastIndexOf(" "), 20)).replace(/[\s,:;.–—-]+$/, "") + "…";
}

/**
 * The languages a run can be read in. A shipped run offers the translations that ship with it, so no visit (a crawler's
 * included) can start a paid translation; a visitor's run offers every language, translated on first request as before.
 */
async function languagesOf(e: Experiment): Promise<string[]> {
  if (e.source.kind !== "showcase") return Object.keys(LANGUAGES);
  const files = await readdir(path.join(process.cwd(), "data", "showcase", "translations")).catch(() => [] as string[]);
  return Object.keys(LANGUAGES).filter((code) => files.includes(`${e.id}.${code}.json`));
}

/** Whether the Falsification Plate's grid (scripts/falsify-grid.ts) was made for this run; visitors' runs have none. */
async function hasFalsifyGrid(id: string) {
  if (!/^[a-z0-9-]+$/i.test(id)) return false;
  return access(path.join(process.cwd(), "public", "falsify", `${id}.json`)).then(
    () => true,
    () => false,
  );
}

export async function experimentMetadata(id: string, lang?: string): Promise<Metadata> {
  const e = await getExperiment(id);
  // a missing record is a real 404, rendered on the server with the not-found page
  if (!e) notFound();
  const langs = await languagesOf(e);
  if (lang && !langs.includes(lang)) notFound();
  const win = winnerOf(e);
  const params = Object.fromEntries(win.law.params.map((p) => [p.name, { v: win.fit.theta[p.name], s: win.fit.sigma[p.name] }]));
  const lede = fmtProse(strip(e.finding), params);
  const languages = Object.fromEntries([["en", `/x/${e.id}`], ...langs.map((code) => [code, `/x/${e.id}/${code}`])]);
  return {
    title: shortTitle(`${e.title}: ${fmtProse(strip(e.headline ?? e.finding), params)}`),
    description: lede.length > 300 ? `${lede.slice(0, lede.lastIndexOf(" ", 297))}…` : lede,
    alternates: { canonical: lang ? `/x/${e.id}/${lang}` : `/x/${e.id}`, languages },
  };
}

/**
 * Muse Spark's own pick of subject, kept in the record when a subject given with the clip replaced it (read from the
 * run's progress log, where the observe step's line was written before the replacement).
 */
type OwnPick = { noun: string; ruler: string | null; window: { start_s: number; end_s: number } | null; source: string };
const ownPick = (e: Experiment) => (e as Experiment & { ownPick?: OwnPick }).ownPick ?? null;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

export default async function ExperimentView({ id, lang: langIn }: { id: string; lang?: string }) {
  const e = await getExperiment(id);
  if (!e) notFound();
  const langs = await languagesOf(e);
  // a language this run isn't offered in is a wrong address
  if (langIn && !langs.includes(langIn)) notFound();
  const lang = langIn;
  const tr = lang ? await translation(e, lang).catch(() => null) : null;
  const trLang = tr ? lang : undefined;
  const falsify = await hasFalsifyGrid(e.id);
  // the Moon page sets its slowdown figures beside the slowed copy's own clock check
  const slowedClock = e.extras?.memoryTest?.sameJump ? (await getExperiment("moon-jump-slowed").catch(() => null))?.clock ?? null : null;
  const win = winnerOf(e);
  // numbers in the model-written sentences, rewritten to the fit's own value and error bar ("0.7999 ± 0.0021 m")
  const pv = Object.fromEntries(win.law.params.map((p) => [p.name, { v: win.fit.theta[p.name], s: win.fit.sigma[p.name] }]));
  const prose = (t: string) => fmtProse(t, pv);
  const damping = dampingTie(e);
  const pick = ownPick(e);
  // previous and next entries, in the order the experiments index lists them
  const order = await showcaseIds();
  const at = order.indexOf(e.id);
  const prevId = at > 0 ? order[at - 1] : null, nextId = at >= 0 && at < order.length - 1 ? order[at + 1] : null;
  const [prevE, nextE] = await Promise.all([prevId ? getExperiment(prevId).catch(() => null) : null, nextId ? getExperiment(nextId).catch(() => null) : null]);
  const reasonFor = (c: (typeof e.candidates)[number]) => {
    if (!c.fit.ok || c.rank === 1) return null;
    const above = e.candidates.filter((x) => x.rank < c.rank && x.fit.ok);
    if (!above.some((x) => x.fit.testRms > c.fit.testRms)) return null;
    if (c.law.params.some((p) => !p.fixed && p.name !== "cal" && atBound(c.law, p.name, c.fit.theta[p.name]))) return "A parameter is pressed against its limit, so it ranks after laws whose values settled freely.";
    if (Number.isFinite(c.fit.trainZ) && Number.isFinite(c.fit.testZ) && c.fit.trainZ! > c.fit.testZ!) return `Its unseen miss is small, but it misses the frames it was fitted to by ${fmt(c.fit.trainZ!, 2)}× the noise.`;
    return "Tied within the noise with a law above it; the simpler law ranks first.";
  };
  // the referee's words are shown only while the law it wrote about still leads
  const ref = e.critique && (!e.critique.winnerId || e.critique.winnerId === e.winner) ? e.critique : null;
  const plate = plateData(e);
  const lengthUnit = e.measured.calibration.kind === "none" ? "px" : "m";
  const unseenFrames = e.measured.px.length - plate.split;
  const tAll = e.measured.series.t;
  const unseenSeconds = tAll[tAll.length - 1] - tAll[plate.split];
  const fitPct = Math.round(e.trainFrac * 100);
  const futurePct = 100 - fitPct;
  const runnerUp = e.candidates.find((c) => c.law.id !== win.law.id && c.fit.ok);
  // a miss in noise units, to one decimal below 10 ("1.0×"), whole above
  const zFmt = (z: number) => (z < 10 ? z.toFixed(1) : String(Math.round(z)));
  const zOf = (c: (typeof e.candidates)[number]) => (Number.isFinite(c.fit.testZ) ? zFmt(c.fit.testZ!) : null);
  const freeParams = win.law.params.filter((p) => !p.fixed && p.name !== "cal");
  const fixedParams = win.law.params.filter((p) => p.fixed);
  const channels = Object.keys(win.fit.predicted).filter((c) => e.measured.series.ch[c]);
  // when even the winner misses the unseen frames by far more than the noise, a precise ± would overclaim
  const rough = Number.isFinite(win.fit.testZ) && win.fit.testZ! > 5;
  // a systematic listed outside the quoted ± (the Moon's choice of tracked point) is named next to the headline value
  const point = e.extras?.errorBudget?.rows.find((r) => !r.included && /point of the body/.test(r.source));
  // the reading leads with what was measured against what it should be; the prediction test follows
  const lead = (() => {
    if (e.clock) {
      return {
        label: "How much slower than life the clip plays",
        v: rough ? `about ${e.clock.factor.toFixed(1)}` : e.clock.factor.toFixed(2),
        pm: !rough && e.clock.sigma ? e.clock.sigma.toFixed(2) : undefined,
        unit: "×",
        against: rough
          ? `Unconfirmed: found from gravity coming out too weak against the world’s known value, and the winning law misses the unseen frames by ${fmt(win.fit.testZ!, 2)}× the noise, so something it leaves out matters.`
          : "Found from gravity coming out too weak against the world’s known value, so it assumes the world.",
      };
    }
    const cmp = e.comparisons.find((c) => freeParams.some((p) => p.name === c.param));
    if (!cmp) return null;
    const p = freeParams.find((q) => q.name === cmp.param)!;
    const v = /accelerates at g|gravity/i.test(cmp.label) ? Math.abs(cmp.measured) : cmp.measured;
    const unit = p.unit && p.unit !== "1" ? prettyUnit(p.unit) : undefined;
    const [pv0, ps0] = fmtPair(v, cmp.sigma).split(" ± ");
    return {
      label: cmp.label.charAt(0).toUpperCase() + cmp.label.slice(1),
      v: rough ? `about ${fmt(v, 2)}` : pv0,
      pm: rough ? undefined : ps0,
      unit,
      against: `Known value ${+cmp.reference.toPrecision(4)}${unit ? ` ${unit}` : ""}: off by ${fmt(Math.abs(cmp.errorPct), 2)}%${Number.isFinite(cmp.withinSigma) && cmp.withinSigma < 20 ? `, ${fmt(cmp.withinSigma, 2)}σ` : ""}.${point ? ` The ± is statistical and ruler; which point of the body is followed adds a further ± ${point.value.toFixed(2)} (see the error budget below).` : ""}`,
    };
  })();

  // a law the unseen frames refuted: the same rule the Falsification Plate strikes by, at the run's own sealed line
  // (it misses by more than 3× the noise and more than twice the winner, and does not tie it)
  const winScore = noiseScore(win.fit);
  const refuted = (c: (typeof e.candidates)[number]) => {
    if (!c.fit.ok) return true;
    if (c.law.id === win.law.id) return false;
    if (Number.isFinite(winScore)) {
      const s = noiseScore(c.fit);
      return !tied(win.fit, c.fit) && (!Number.isFinite(s) || (s > 3 && s > 2 * winScore));
    }
    return c.fit.testRms > 3 * win.fit.testRms;
  };
  const ranked = [...e.candidates].sort((a, b) => a.rank - b.rank);
  const nRefuted = ranked.filter(refuted).length;
  const byOrigin = (o: string) => e.candidates.filter((c) => c.origin === o).length;

  // plates and sections are numbered in page order
  let plateN = 0, secN = 0;
  const nextPlate = () => ROMAN[plateN++] ?? String(plateN);
  const sec = () => ++secN;

  const credit = e.source.kind === "showcase" ? e.source.credit : undefined;
  const rendered = !!credit && /^Rendered\b/.test(credit);
  const video = videoUrl(e);
  const phenomenon = e.observation.phenomenon.charAt(0).toUpperCase() + e.observation.phenomenon.slice(1);
  const rerun = (e as Experiment & { rerun?: { note: string } }).rerun;
  const mt = e.extras?.memoryTest;
  const st = e.extras?.speedTest;
  const sj = mt?.sameJump;
  const moonG = e.comparisons.find((c) => c.param === "g");
  const sparkWrongB = st?.repeats?.clips.find((c) => c.clip === "B")?.answers.filter((x) => x.real_speed).length;
  const plateCaption = `SAM 3.1’s masks cut the ${e.tracking.noun} out of ${e.strobe.length} frames and lay them on one frame of the clip. The law was fitted to the filled dots only. The rings are the ${unseenFrames} frames it was not fitted to (${fmtS(unseenSeconds)} of motion), and its line had to find them.`;

  return (
    <article className={styles.article}>
      {/* ---- the title block ---- */}
      <header className={styles.title}>
        <p className={styles.crumb}>
          <Link href="/x">The book of experiments</Link>
          {at >= 0 ? <span>, entry {at + 1} of {order.length}</span> : <span>, a visitor&rsquo;s run</span>}
        </p>
        <h1 className={styles.h1}>{e.title}</h1>
        <div className={styles.titleGrid}>
          <div className={styles.abstract}>
            {lang && !tr && <p className={styles.untranslated}>That translation would have changed a number, so it isn’t shown. Here is the English.</p>}
            <p className={styles.lede} lang={trLang}>
              {prose(tr?.headline ?? e.headline ?? e.finding)}
            </p>
            {(tr || e.headline) && (
              <p className={styles.finding} lang={trLang}>
                {prose(tr?.finding ?? e.finding)}
              </p>
            )}
            {rerun && <p className={styles.rerun}>{rerun.note}</p>}
          </div>
          <dl className={styles.colophon}>
            <div>
              <dt>What it is</dt>
              <dd>{phenomenon}</dd>
            </div>
            <div>
              <dt>{e.source.kind === "showcase" ? (rendered ? "Rendered, not filmed" : "Filmed") : "Filmed by a visitor"}</dt>
              <dd>
                {e.source.kind === "showcase" && credit ? (
                  <>
                    {e.source.page ? <a href={e.source.page}>{credit}</a> : credit}
                    {e.source.license ? `. Licence: ${e.source.license}` : ""}. Trimmed and re-encoded for measurement.
                  </>
                ) : (
                  <>Uploaded and run on {fmtDate(e.createdAt)}.</>
                )}
              </dd>
            </div>
            <div>
              <dt>The clip</dt>
              <dd className="num">
                {e.video.frames} frames at {e.video.fps.toFixed(2)} fps, {e.video.width}×{e.video.height}
              </dd>
            </div>
            {langs.length > 0 && (
              <div>
                <dt id="read-in">Read in</dt>
                <dd>
                  <nav className={styles.langs} aria-labelledby="read-in">
                    <a href={`/x/${e.id}`} hrefLang="en" aria-current={!lang ? "page" : undefined}>
                      English
                    </a>
                    {langs.map((code) => (
                      <a key={code} href={`/x/${e.id}/${code}`} lang={code} hrefLang={code} rel={e.source.kind === "showcase" ? undefined : "nofollow"} aria-current={lang === code ? "page" : undefined}>
                        {LANGUAGES[code]}
                      </a>
                    ))}
                  </nav>
                </dd>
              </div>
            )}
          </dl>
        </div>
      </header>

      {/* ---- Plate I: the Falsification Plate, or the clip itself for a run with no grid ---- */}
      {falsify ? (
        <Plate
          n={nextPlate()}
          title={<>Drag the line: every law sees only the motion to its left and must predict the rest.</>}
          caption={
            <>
              Each position of the line is a full refit by the same code a run uses. The run itself sealed its line at {fitPct}%: every law was fitted to the first {fitPct}% and scored on the last {futurePct}%, which no law was fitted to.
            </>
          }
        >
          <FalsifyPlate id={e.id} video={video} t0={e.measured.window.t0} laws={plateLaws(e)} start={e.trainFrac} />
        </Plate>
      ) : (
        <Plate n={nextPlate()} title="The clip, measured in every frame." caption={plateCaption}>
          <ExperimentVisual plate={plate} clip={clipData(e)} start="clip" />
        </Plate>
      )}

      {/* ---- the finding ---- */}
      <Page>
        <Section n={sec()} title="The finding" id="finding">
          <div className={styles.readings}>
            {lead ? (
              <div className={styles.leadReading}>
                <Reading value={<CountUp text={lead.v} />} pm={lead.pm} unit={lead.unit} label={lead.label} />
              </div>
            ) : (
              <div className={styles.leadReading}>
                <Reading value={<CountUp text={fmtLen(win.fit.testRms, lengthUnit, channels)} />} label={`Average miss on the last ${futurePct}% (${unseenFrames} frames), which no law was fitted to${Number.isFinite(win.fit.testZ) ? `: ${zFmt(win.fit.testZ!)}× the measurement noise` : ""}`} />
              </div>
            )}
            {lead && (
              <Reading
                value={<CountUp text={fmtLen(win.fit.testRms, lengthUnit, channels)} />}
                label={`Average miss on the last ${futurePct}% (${unseenFrames} frames)${Number.isFinite(win.fit.testZ) ? `, ${zFmt(win.fit.testZ!)}× the measurement noise` : ""}`}
              />
            )}
            {runnerUp && (
              <Reading
                value={<CountUp text={fmtLen(runnerUp.fit.testRms, lengthUnit, channels)} />}
                label={`The runner-up’s miss${zOf(runnerUp) ? `, ${zOf(runnerUp)}× the noise` : ""}${tied(win.fit, runnerUp.fit) ? " (a tie within the measurement noise)" : ""}`}
              />
            )}
            <Reading value={<CountUp text={String(e.candidates.length)} />} label={`Laws tried, ${nRefuted} refuted by the frames no law was fitted to`} />
          </div>
        </Section>
        <Note who="SAM 3.1, then code">
          SAM 3.1 measured the {e.tracking.noun} in {e.tracking.framesSeen} frames. Code fitted every law to the first {fitPct}% and scored it on the last {futurePct}%.
        </Note>
        {lead && <p className={styles.para}>{lead.against}</p>}
        <p className={styles.para}>
          The law that {damping ? "ranked first" : "won"}: <b>{win.law.title}</b>
          {damping ? `; ${damping}` : ""}. It missed the {unseenFrames} unseen frames by {fmtLen(win.fit.testRms, lengthUnit, channels)} on average
          {Number.isFinite(win.fit.testZ) ? `, ${zFmt(win.fit.testZ!)}× the measurement noise` : ""}
          {runnerUp ? `; the runner-up, ${runnerUp.law.title.charAt(0).toLowerCase() + runnerUp.law.title.slice(1)}, by ${fmtLen(runnerUp.fit.testRms, lengthUnit, channels)}${zOf(runnerUp) && zOf(win) ? `, ${zOf(runnerUp)}× the noise against the winner’s ${zOf(win)}×` : ""}${tied(win.fit, runnerUp.fit) ? " (a tie within the measurement noise; see the trial)" : ""}` : ""}.
        </p>
        <blockquote className={styles.watched} lang={trLang}>
          &ldquo;{tr?.what_happens ?? e.observation.what_happens}&rdquo;
        </blockquote>
        <Note who="Muse Spark 1.3, watching">Its account of the clip, written before anything was measured.</Note>
        {pick && (
          <p className={styles.para}>
            Muse Spark’s own pick of what to follow: “{pick.noun}”{pick.ruler ? `, with “${pick.ruler}” as the ruler` : ", with no ruler named"}
            {pick.window ? `, window ${pick.window.start_s}–${pick.window.end_s} s` : ""}. We gave it “{e.tracking.noun}” with the clip, so the body SAM 3.1 follows is the one whose height ({e.observation.reference.real_length_m} m) is the ruler; SAM 3.1 was not asked to find “{pick.noun}”.
            {pick.window ? "" : ` Its own window was not logged apart from the one stored (${e.observation.window.start_s}–${e.observation.window.end_s} s${e.observation.window.start_s <= 0 && e.observation.window.end_s >= e.video.duration - 0.1 ? ", the whole clip" : ""}).`}
          </p>
        )}

        {/* ---- the law ---- */}
        <Section n={sec()} title={damping ? "The law that ranked first" : "The law that won"} id="law">
          <p className={styles.lawTitle}>{win.law.title}</p>
        </Section>
        <div className={`eqn ${styles.eqns}`}>
          {lawLatex(win.law).map((l, i) => (
            <Tex key={i} display>
              {l}
            </Tex>
          ))}
        </div>
        <Note who={win.origin === "revision" ? "Muse Wonder 1.0" : win.origin === "muse" ? "Muse Spark 1.3" : "A textbook control"}>
          {win.origin === "revision" ? "Wrote this law with a fitting tool, on the fitted frames only." : win.origin === "muse" ? "Proposed this law after watching the clip." : "Entered by code to compete with the proposed laws."} Code compiled it and integrated it.
        </Note>
        <p className={styles.para} lang={tr?.summary ? trLang : undefined}>
          {tr?.summary ?? win.law.summary}
        </p>
        {damping && <p className={styles.caution}>{damping.charAt(0).toUpperCase() + damping.slice(1)}: it ranks first only because a tie goes to the simpler law.</p>}
        {Number.isFinite(win.fit.testZ) && win.fit.testZ! > 10 && <p className={styles.caution}>Misses the unseen frames by {fmt(win.fit.testZ!, 2)}× the noise: read this as a description, not a law.</p>}

        <h3 className={styles.h3} id="constants">
          Measured
        </h3>
        <div className={styles.tableWrap}>
          <table className={`journal ${styles.stack}`}>
            <thead>
              <tr>
                <th>Constant</th>
                <th className="r">Measured</th>
                <th>Against the known value</th>
              </tr>
            </thead>
            <tbody>
              {freeParams.map((p) => {
                const v = win.fit.theta[p.name], s = win.fit.sigma[p.name];
                const cmp = e.comparisons.find((c) => c.param === p.name);
                const unit = p.unit && p.unit !== "1" ? prettyUnit(p.unit) : "";
                return (
                  <tr key={p.name}>
                    <td data-h="Constant">
                      <Tex>{paramLatex(p.name)}</Tex> <span className={styles.meaning}>{p.meaning}</span>
                    </td>
                    <td data-h="Measured" className={`r ${styles.value}`}>
                      {rough ? (
                        <>
                          about {fmt(v, 2)} <span className={styles.unitS}>{unit}</span>
                          <span className={styles.nd}>no error bar: the law misses the unseen frames by {fmt(win.fit.testZ!, 2)}× the noise</span>
                        </>
                      ) : Number.isFinite(s) && s > 0 ? (
                        <>
                          {fmtPair(v, s).split(" ± ")[0]}
                          <span className={styles.pmS}> ± {fmtPair(v, s).split(" ± ")[1]}</span> <span className={styles.unitS}>{unit}</span>
                        </>
                      ) : (
                        <>
                          {fmt(v)} <span className={styles.unitS}>{unit}</span>
                          <span className={styles.nd}>about this, fitted; not determined by these frames</span>
                        </>
                      )}
                    </td>
                    <td data-h="Against the known value" className={styles.against}>
                      {cmp && e.clock && (cmp.param === "g" || /accelerates at g|gravity/i.test(cmp.label)) ? (
                        // a clock problem explains the miss: say so first, and what the value is at the detected speed
                        <>
                          Clock check: the clip plays about {e.clock.sigma ? fmtPair(e.clock.factor, e.clock.sigma) : e.clock.factor.toFixed(2)}× slower than life. At that speed {cmp.param === "g" ? "g" : `|${p.name}|`} = {fmt(Math.abs(v) * Math.pow(e.clock.factor, -secondPower(p.unit)))} {prettyUnit(p.unit)}; {cmp.label}: {fmt(cmp.reference)}. As filmed it is {fmt(Math.abs(cmp.errorPct), 2)}% off.
                        </>
                      ) : cmp ? (
                        <>
                          {cmp.label}: {fmt(cmp.reference)} {prettyUnit(p.unit)}. Off by {fmt(Math.abs(cmp.errorPct), 2)}%
                          {Number.isFinite(cmp.withinSigma) ? (cmp.withinSigma > 20 ? ", far outside the error bar: check the clock or the ruler" : `, ${fmt(cmp.withinSigma, 2)}σ`) : ""}.
                        </>
                      ) : (
                        <span className={styles.muted}>no known value to compare with</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Note who="Code">Every value and its ± come from the winning law&rsquo;s fit to the first {fitPct}% of the motion; the ± is one standard error.</Note>

        {(e.given.length > 0 || fixedParams.length > 0) && (
          <>
            <h3 className={styles.h3}>Given, not measured</h3>
            <ul className={styles.given}>
              {e.given.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
              {fixedParams
                .filter((p) => !e.given.some((g) => g.includes(`${p.name} =`)))
                .map((p) => (
                  <li key={p.name}>
                    {p.name} = {fmt(win.fit.theta[p.name], 4)} {p.unit && p.unit !== "1" ? prettyUnit(p.unit) : ""} (given{p.meaning ? `: ${p.meaning}` : ""})
                  </li>
                ))}
            </ul>
            <Note who="The rule">What was assumed is kept apart from what was measured, so no assumed number can pass as a result.</Note>
          </>
        )}

        {e.clock && (
          <>
            <h3 className={styles.h3} id="clock">
              Clock check
            </h3>
            <p>{e.clock.note}</p>
            <p className={styles.para}>Time rescales every constant by its power of seconds, so no new run is needed to see what a slow-motion clip would mean:</p>
            <div className={styles.tableWrap}>
              <table className={`journal ${styles.stack}`}>
                <thead>
                  <tr>
                    <th>If the clip plays</th>
                    <th>The constants would be</th>
                  </tr>
                </thead>
                <tbody>
                  {[e.clock.factor, ...[2, 4, 8].filter((f) => Math.abs(Math.log(f / e.clock!.factor)) < 0.9)].map((f, i) => (
                    <tr key={f}>
                      <td data-h="If the clip plays">{i === 0 ? `${f.toFixed(2)}× slower (detected)` : `${f}× slower`}</td>
                      <td data-h="The constants would be" className="num">
                        {freeParams.map((p) => `${p.name} = ${fmt(win.fit.theta[p.name] * Math.pow(f, -secondPower(p.unit)))} ${prettyUnit(p.unit)}`).join(", ")}
                        {i === 0 && <span className={styles.nd}>gravity matches by construction: that is how the factor was found</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note who="Code">Frame times come from the video file&rsquo;s own timestamps; a gravity wrong by a square says the clock is not real time.</Note>
          </>
        )}
      </Page>

      {falsify && (
        <Plate n={nextPlate()} title="The law drawn on the clip: a stroboscopic print, and the clip itself." caption={plateCaption}>
          <ExperimentVisual plate={plate} clip={clipData(e)} />
        </Plate>
      )}

      {/* ---- the trial ---- */}
      <Page>
        <Section n={sec()} title="The trial" id="trial">
          <p>
            Every candidate law was fitted to the first {fitPct}% of the motion, then asked to predict the last {futurePct}%, which no law was fitted to. Each is ranked by the worse of the two misses, in units of the measurement noise (1 means it misses by no more than the noise). When two laws are equally good, the simpler one wins. A law that misses by more than three times the noise and twice the winner is struck out.
          </p>
        </Section>
        <Note who="Who proposed">
          {byOrigin("muse")} {byOrigin("muse") === 1 ? "law" : "laws"} from Muse Spark, {byOrigin("control")} textbook {byOrigin("control") === 1 ? "control" : "controls"}
          {byOrigin("revision") ? `, ${byOrigin("revision")} from Muse Wonder` : ""}. Code ranks them; no model picks the winner.
        </Note>
        {Number.isFinite(win.fit.testZ) && win.fit.testZ! > 5 && (
          <p className={styles.caution}>
            Even the winner misses the unseen frames by {fmt(win.fit.testZ!, 2)}× the measurement noise, so something none of these laws include matters there
            {e.observation.caveats[0] ? ` (the observer noted: ${e.observation.caveats[0]})` : ""}.{win.fit.testZ! > 10 ? "" : " Read its constants as the best available description, not a closed case."}
          </p>
        )}
        <Reveal className={`${styles.span} ${styles.strikes}`}>
          <table className={`journal ${styles.stack} ${styles.trialTable}`}>
            <thead>
              <tr>
                <th className="r">Rank</th>
                <th>Law</th>
                <th>Proposed by</th>
                <th className="r">Miss, fitted {fitPct}%</th>
                <th className="r">Miss, last {futurePct}%</th>
                <th>Verdict</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((c, idx) => {
                const struck = refuted(c);
                const isWin = c.law.id === win.law.id;
                const reason = reasonFor(c);
                return (
                  <tr key={c.law.id} className={isWin ? styles.winRow : undefined} style={{ "--i": idx } as React.CSSProperties}>
                    <td data-h="Rank" className={`r ${styles.rank}`}>
                      {c.rank}
                    </td>
                    <td data-h="Law" className={styles.lawCell}>
                      <span className={`${styles.candTitle} ${struck ? "struck" : ""}`}>{c.law.title}</span>
                      <span className={`${styles.candEq} ${struck ? styles.eqStruck : ""}`}>
                        {lawLatex(c.law).map((l, i) => (
                          <Tex key={i}>{l}</Tex>
                        ))}
                      </span>
                      {c.ifItWins && <span className={styles.ifWins}>{c.ifItWins}</span>}
                      {reason && <span className={styles.reason}>{reason}</span>}
                      {!c.fit.ok && c.fit.why && <span className={styles.reason}>{c.fit.why}</span>}
                    </td>
                    <td data-h="Proposed by" className={styles.origin}>
                      {c.origin === "muse" ? "Muse Spark" : c.origin === "revision" ? `Muse Wonder${e.wonder?.trigger === "code" ? ", called in by the fit check" : e.wonder?.trigger === "referee" ? ", called in by the referee" : ""}` : "textbook control"}
                    </td>
                    <td data-h={`Miss on the fitted ${fitPct}%`} className={`r num ${styles.miss}`}>
                      {c.fit.ok ? (
                        <>
                          {fmtLen(c.fit.trainRms, lengthUnit, channels)}
                          {Number.isFinite(c.fit.trainZ) && <span className={styles.z}>{fmt(c.fit.trainZ!, 2)}× noise</span>}
                        </>
                      ) : (
                        "failed"
                      )}
                    </td>
                    <td data-h={`Miss on the last ${futurePct}%`} className={`r num ${styles.miss} ${styles.missFuture}`}>
                      {c.fit.ok ? (
                        <>
                          {fmtLen(c.fit.testRms, lengthUnit, channels)}
                          {Number.isFinite(c.fit.testZ) && <span className={styles.z}>{fmt(c.fit.testZ!, 2)}× noise</span>}
                        </>
                      ) : (
                        "failed"
                      )}
                    </td>
                    <td data-h="Verdict" className={`${styles.verdict} ${struck ? styles.vStruck : isWin ? styles.vHeld : ""}`}>
                      {!c.fit.ok ? "could not be fitted" : isWin ? (damping ? "ranks first (a tie)" : "survived; wins") : struck ? "refuted" : tied(win.fit, c.fit) ? "tied with the winner" : "still standing"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Reveal>

        {e.wonder && (
          <>
            <h3 className={styles.h3} id="wonder">
              Muse Wonder&rsquo;s notebook
            </h3>
            <p>
              Asked for one more law ({e.wonder.idea.replace(/\.$/, "")}), it tried {e.wonder.attempts.length} on the fitted frames before submitting one. No number from the held-out frames reached it.
            </p>
            <Note who="Muse Wonder 1.0">
              {e.wonder.trigger === "referee"
                ? "Called in by the referee."
                : e.wonder.trigger === "code"
                  ? `Called in by code: the winner missed the fitted frames${e.wonder.missZ !== undefined ? ` by ${fmt(e.wonder.missZ, 1)}× the noise` : ""}.`
                  : "Called in when every law missed."}{" "}
              It works as an agent with one tool, a fit on the seen frames.
            </Note>
            <Reveal as="ol" className={styles.attempts}>
              {e.wonder.attempts.map((a, i) => (
                <li key={i} className={e.wonder?.submitted?.startsWith(a.title) ? styles.picked : undefined} style={{ "--i": i } as React.CSSProperties}>
                  <span>{a.title}</span>
                  <span className={styles.attemptMiss}>{a.ok && a.trainRms !== undefined ? `misses the fitted frames by ${fmtLen(a.trainRms, lengthUnit, channels)}` : a.error ?? "could not be fitted"}</span>
                </li>
              ))}
            </Reveal>
            <p className={styles.para}>
              Submitted: {e.wonder.submitted ?? "nothing"}
              {(() => {
                const c = e.candidates.find((x) => x.origin === "revision");
                return c ? `, which ranked ${c.rank} of ${e.candidates.length} on the unseen frames.` : ".";
              })()}
            </p>
          </>
        )}

        {ref?.why_it_won ? (
          <>
            <p className={`${styles.para} ${styles.referee}`}>
              <span className={styles.refLabel}>The referee&rsquo;s reading.</span> {ref.why_it_won}
              {ref.verdict === "revise" && ref.revision_idea && (
                <>
                  {" "}
                  It asked for one more law ({ref.revision_idea}), which {e.ledger.calls.find((c) => c.purpose.startsWith("write a revised law"))?.model ?? "Muse Wonder"} wrote and which competed above.
                </>
              )}
            </p>
            <Note who={`Referee: ${modelName(e.ledger.calls.find((c) => c.purpose.startsWith("referee"))?.model ?? e.models.critique)}`}>It reads the scoreboard and the residuals on the fitted frames. It does not change the ranking.</Note>
          </>
        ) : e.critique ? (
          <p className={styles.para}>The ranking changed after the referee wrote its comment, so the comment is withheld.</p>
        ) : null}

        {/* ---- measured against predicted ---- */}
        <Section n={sec()} title="Measured against predicted" id="predicted">
          <p>
            Dots are SAM 3.1&rsquo;s measurements, filled where the laws were fitted and open over the last {futurePct}%, which no law was fitted to. The line is the winning law{runnerUp ? "; the dashed line is the runner-up" : ""}.
          </p>
        </Section>
        <figure className={`${styles.span} ${styles.figures}`}>
          <div className={styles.charts}>
            {channels.map((ch) => (
              <SeriesFigure
                key={ch}
                t={tAll}
                measured={e.measured.series.ch[ch]}
                law={win.fit.predicted[ch]}
                runnerUp={runnerUp?.fit.predicted[ch]}
                split={plate.split}
                label={ch === "theta" ? "θ" : ch}
                unit={ch === "theta" ? "rad" : lengthUnit}
                futurePct={futurePct}
              />
            ))}
          </div>
          <figcaption className={styles.figcap}>
            <span className={styles.figNo}>Fig. 1.</span> Dots: {e.measured.point === "top" ? "the top of SAM 3.1’s mask (the helmet)" : "SAM 3.1 mask centroids"}, {e.measured.px.length} frames, times read from the video file
            {e.measured.slowMotion > 1 ? ` and divided by the ${e.measured.slowMotion}× slow motion` : ""}. Prussian line: the winning law. Dashes: the runner-up.
          </figcaption>
        </figure>

        {/* ---- against the known answer ---- */}
        {e.extras?.truth && (
          <>
            <Section n={sec()} title="Against the known answer" id="truth">
              <p>{e.extras.truth.note}</p>
            </Section>
            <div className={styles.tableWrap}>
              <table className={`journal ${styles.stack}`}>
                <thead>
                  <tr>
                    <th>Constant</th>
                    <th className="r">Measured</th>
                    <th className="r">True value</th>
                    <th className="r">Off by</th>
                  </tr>
                </thead>
                <tbody>
                  {e.extras.truth.rows.map((r) => (
                    <tr key={r.label}>
                      <td data-h="Constant">{r.label}</td>
                      <td data-h="Measured" className={`r ${styles.value}`}>
                        {fmtPair(r.measured, r.sigma).split(" ± ")[0]}
                        <span className={styles.pmS}> ± {fmtPair(r.measured, r.sigma).split(" ± ")[1]}</span> <span className={styles.unitS}>{r.unit}</span>
                      </td>
                      <td data-h="True value" className="r num">
                        {fmt(r.truth)} {r.unit}
                      </td>
                      <td data-h="Off by" className="r num">
                        {fmt(Math.abs((r.measured - r.truth) / r.truth) * 100, 2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Note who="Code">The true values were set when the clip was rendered and were kept out of the run.</Note>
          </>
        )}

        {/* ---- the Moon: how sensitive is the headline ---- */}
        {e.extras?.robustness && (
          <>
            <Section n={sec()} title="How sensitive is this?" id="robustness">
              <p>{e.extras.robustness.note}</p>
            </Section>
            <details className={styles.more}>
              <summary>Every reading of g, the error budget and three more checks</summary>
            <div className={styles.tableWrap}>
              <table className={`journal ${styles.stack}`}>
                <thead>
                  <tr>
                    <th>Reading</th>
                    <th className="r">g (m/s²)</th>
                  </tr>
                </thead>
                <tbody>
                  {e.extras.robustness.rows.map((r) => (
                    <tr key={r.label}>
                      <td data-h="Reading">{r.label}</td>
                      <td data-h="g (m/s²)" className={`r ${styles.value}`}>
                        {r.g.toFixed(2)}
                        <span className={styles.pmS}> ± {r.sigma.toFixed(2)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {e.extras.errorBudget && (
              <>
                <h3 className={styles.h3} id="error-budget">
                  Error budget
                </h3>
                <p>{e.extras.errorBudget.note}</p>
                <div className={styles.tableWrap}>
                  <table className={`journal ${styles.stack}`}>
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th className="r">Size in g (m/s²)</th>
                        <th>In the quoted ±</th>
                      </tr>
                    </thead>
                    <tbody>
                      {e.extras.errorBudget.rows.map((r) => (
                        <tr key={r.source}>
                          <td data-h="Source">{r.source}</td>
                          <td data-h="Size in g (m/s²)" className="r num">
                            {r.signed ?? "±"}
                            {r.value.toFixed(r.value < 0.1 ? 3 : 2)}
                          </td>
                          <td data-h="In the quoted ±">{r.included ? "yes" : "no, listed separately"}</td>
                        </tr>
                      ))}
                      <tr className={styles.totalRow}>
                        <td data-h="Source">{e.extras.errorBudget.total.label}</td>
                        <td data-h="Size in g (m/s²)" className="r num">
                          ±{e.extras.errorBudget.total.value.toFixed(3)}
                        </td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {(() => {
              // checks on the headline added after the run: the film's own clock, the ruler's percentile, a second ruler
              const x = e.extras as unknown as {
                telecine?: { g: number; sigma: number; note: string };
                rulerPercentiles?: { note: string; rows: { at: string; px: number; g: number; sigma: number; chosen?: boolean }[] };
                flagRuler?: { note: string };
              };
              if (!x.telecine && !x.rulerPercentiles && !x.flagRuler) return null;
              return (
                <>
                  <h3 className={styles.h3} id="checks">
                    Three more checks on the headline
                  </h3>
                  {x.telecine && (
                    <p>
                      <b>
                        On the film’s own clock: {x.telecine.g.toFixed(2)} ± {x.telecine.sigma.toFixed(2)} m/s².
                      </b>{" "}
                      {x.telecine.note}
                    </p>
                  )}
                  {x.rulerPercentiles && (
                    <>
                      <p className={styles.para}>{x.rulerPercentiles.note}</p>
                      <div className={styles.tableWrap}>
                        <table className={`journal ${styles.stack}`}>
                          <thead>
                            <tr>
                              <th>His height read from</th>
                              <th className="r">Pixels</th>
                              <th className="r">g (m/s²)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {x.rulerPercentiles.rows.map((r) => (
                              <tr key={r.at}>
                                <td data-h="His height read from">
                                  {r.at === "max" || /tallest/.test(r.at) ? "his tallest frame" : `the ${r.at.replace("p", "")}th percentile of his frames`}
                                  {r.chosen && <span className={styles.sub}>the published choice</span>}
                                </td>
                                <td data-h="Pixels" className="r num">
                                  {r.px}
                                </td>
                                <td data-h="g (m/s²)" className={`r ${styles.value}`}>
                                  {r.g.toFixed(2)}
                                  <span className={styles.pmS}> ± {r.sigma.toFixed(2)}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                  {x.flagRuler && (
                    <p className={styles.para}>
                      <b>A second ruler that failed.</b> {x.flagRuler.note}
                    </p>
                  )}
                  <Note who="SAM 3.1, then code">Each check reuses SAM 3.1&rsquo;s track of the whole clip; code refits the jump each way.</Note>
                </>
              );
            })()}
            {e.extras.crossCheck && <p className={styles.para}>{e.extras.crossCheck}</p>}
            {e.extras.ruler && (
              <p className={`${styles.para} ${styles.small}`}>
                Ruler: {e.extras.ruler}
              </p>
            )}
            </details>
          </>
        )}

        {/* ---- the Moon: memory or measurement ---- */}
        {mt && (
          <>
            <Section n={sec()} title="Memory or measurement?" id="memory">
              <p>{mt.note}</p>
            </Section>
            <div className={styles.span}>
              <table className={`journal ${styles.stack}`}>
                <thead>
                  <tr>
                    <th>Clip</th>
                    <th className="r">Muse Spark by eye</th>
                    <th className="r">Ansatz measured</th>
                    <th>Ansatz’s clock check</th>
                  </tr>
                </thead>
                <tbody>
                  {mt.rows.map((r) => (
                    <tr key={r.clip}>
                      <td data-h="Clip">{r.href && r.href !== `/x/${e.id}` ? <Link href={r.href}>{r.clip}</Link> : r.clip}</td>
                      <td data-h="Muse Spark by eye" className="r num">
                        {r.eye != null ? `${fmt(r.eye)} m/s²` : "—"}
                      </td>
                      <td data-h="Ansatz measured" className={`r ${styles.value}`}>
                        {r.g.toFixed(2)}
                        <span className={styles.pmS}> ± {r.sigma.toFixed(2)}</span> <span className={styles.unitS}>m/s²</span>
                      </td>
                      <td data-h="Ansatz’s clock check">{r.clock}</td>
                    </tr>
                  ))}
                  {mt.renders && (
                    <tr>
                      <td data-h="Clip">
                        <Link href="/proof">{mt.renders.note}</Link>
                      </td>
                      <td data-h="Muse Spark by eye" className="r num">
                        {mt.renders.eye.map((v) => `${+v.toPrecision(2)} m/s²`).join(", ")}
                      </td>
                      <td data-h="Ansatz measured" className="r num">
                        measured as filmed (see /proof)
                      </td>
                      <td data-h="Ansatz’s clock check">
                        flags all {mt.renders.slows.length}: {mt.renders.clocks.map((v, i) => `${v.toFixed(1)}× (truth ${mt.renders!.slows[i]}×)`).join(", ")}; the 8× clip’s 15 cm ruler was read as a metre stick
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {(() => {
              const [a, b] = mt.rows;
              // gravity scales with 1/time², so the two runs give the slowdown with no reference value; the ruler is the
              // same astronaut's assumed height in both, so its ±5% cancels and only the statistical errors remain
              const f = Math.sqrt(a.g / b.g);
              const sf = 0.5 * f * Math.hypot((a.sigmaStat ?? a.sigma) / a.g, (b.sigmaStat ?? b.sigma) / b.g);
              return (
                <p className={styles.para}>
                  {(() => {
                    const rp = st?.repeats;
                    const A = rp?.clips.find((c) => c.clip === "A"), B = rp?.clips.find((c) => c.clip === "B");
                    if (!rp || !A || !B) return "Muse Spark recognises the footage and recalls the textbook value, so its answer does not move with the clip’s speed.";
                    const by = new Map<number, number>();
                    B.answers.forEach((x) => by.set(+x.playback_accel, (by.get(+x.playback_accel) ?? 0) + 1));
                    const top = [...by].sort((p, q) => q[1] - p[1])[0][0];
                    return `Shown one clip at a time, Muse Spark answers the textbook ${top} m/s² for the slowed copy, calling it real speed ${B.answers.length - B.calledSlowed} of ${B.answers.length} times, and wavers on the real broadcast (called slowed ${A.calledSlowed} of ${A.answers.length}): it recognises the footage and recalls the textbook.`;
                  })()}{" "}
                  Ansatz’s answer moves with the pixels. Taken together, the ratio of the two whole runs says the second clip plays {fmtPair(f, sf)}× slower than the first; we slowed it {st?.truth ?? 1.5}×. That needs no textbook value and no ruler, since gravity scales as one over time squared and the same astronaut is the ruler in both. On its own, each run’s clock check can only compare against the Moon value it assumes, so it says “slow motion, or a weaker world”.
                </p>
              );
            })()}
            <Note who="Muse Spark 1.3, by eye">It recognises the footage and answers from memory; its numbers do not move with the clip&rsquo;s speed.</Note>
          </>
        )}
      </Page>

      {e.id === "moon-jump" && sj && (
        <Plate n={nextPlate()} title="The broadcast (A) and the copy slowed in secret (B), on one clock." caption="The orange line is the helmet's height in every frame, as SAM 3.1 measured it. B's jumps come out wider by the slowdown.">
          <MoonPlate
            ratio={sj.combined.ratio}
            sigma={sj.combined.sigma}
            truth={st?.truth ?? 1.5}
            sparkWrong={sparkWrongB ?? 5}
            sparkN={st?.repeats?.n ?? 5}
            g={moonG ? { v: moonG.measured, s: moonG.sigma, ref: moonG.reference } : undefined}
          />
        </Plate>
      )}

      <Page>
        {sj && mt && (
          <>
            <h3 className={styles.h3} id="same-jump">
              The same jump in both clips
            </h3>
            <p>{sj.note}</p>
            <div className={styles.span}>
              <table className={`journal ${styles.stack}`}>
                <thead>
                  <tr>
                    <th>Jump</th>
                    <th className="r">Broadcast</th>
                    <th className="r">Slowed copy</th>
                    <th className="r">Slowdown, from the ratio</th>
                  </tr>
                </thead>
                <tbody>
                  {sj.jumps.map((j) => (
                    <tr key={j.jump}>
                      <td data-h="Jump">
                        {j.jump === 1 ? "First" : "Second"} jump
                        <span className={styles.sub}>
                          {j.real.n} and {j.slowed.n} airborne frames
                        </span>
                      </td>
                      <td data-h="Broadcast" className="r num">
                        {j.real.g.toFixed(2)} ± {j.real.sigma.toFixed(2)} m/s²
                        <span className={styles.sub}>
                          {j.real.t0.toFixed(2)}–{j.real.t1.toFixed(2)} s
                        </span>
                      </td>
                      <td data-h="Slowed copy" className="r num">
                        {j.slowed.g.toFixed(2)} ± {j.slowed.sigma.toFixed(2)} m/s²
                        <span className={styles.sub}>
                          {j.slowed.t0.toFixed(2)}–{j.slowed.t1.toFixed(2)} s
                        </span>
                      </td>
                      <td data-h="Slowdown, from the ratio" className={`r ${styles.value}`}>
                        {j.ratio.toFixed(2)}
                        <span className={styles.pmS}> ± {j.sigma.toFixed(2)}</span>
                        <span className={styles.unitS}>×</span>
                      </td>
                    </tr>
                  ))}
                  <tr className={styles.totalRow}>
                    <td data-h="Jump">Both jumps, weighted</td>
                    <td className={styles.blank} />
                    <td className={styles.blank} />
                    <td data-h="Slowdown, from the ratio" className={`r ${styles.value} ${styles.headlineValue}`}>
                      {sj.combined.ratio.toFixed(3)}
                      <span className={styles.pmS}> ± {sj.combined.sigma.toFixed(3)}</span>
                      <span className={styles.unitS}>×</span>
                      <span className={styles.sub}>we slowed it 1.5×</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Note who="SAM 3.1, then code">Each jump timed in both clips from the helmet&rsquo;s path; the ratio of every matching pair, combined.</Note>
            <details className={styles.more}>
              <summary>Controls the clip&rsquo;s length can&rsquo;t answer, and which slowdown number is which</summary>
            {mt.controls && (
              <>
                <h3 className={styles.h3} id="controls">
                  Controls the clip’s length can’t answer
                </h3>
                <p>{mt.controls.note}</p>
                <div className={styles.span}>
                  <table className={`journal ${styles.stack}`}>
                    <thead>
                      <tr>
                        <th>Copy</th>
                        <th>Jump</th>
                        <th className="r">Ansatz, against the broadcast</th>
                        <th className="r">Truth</th>
                        <th className="r">Counting airborne frames</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mt.controls.clips.flatMap((c) =>
                        c.jumps.map((j, i) => (
                          <tr key={`${c.id}-${j.jump}`}>
                            <td data-h="Copy" className={i === 0 ? undefined : styles.blank}>
                              {i === 0 ? (
                                <>
                                  {c.id === "ramp" ? "Speed ramp" : "Real time, 23.976 fps"}
                                  <span className={styles.sub}>{c.made}</span>
                                </>
                              ) : (
                                ""
                              )}
                            </td>
                            <td data-h="Jump">{j.jump === 1 ? "First" : "Second"}</td>
                            <td data-h="Ansatz, against the broadcast" className={`r ${styles.value}`}>
                              {j.ratio.toFixed(3)}
                              <span className={styles.pmS}> ± {j.sigma.toFixed(3)}</span>
                              <span className={styles.unitS}>×</span>
                            </td>
                            <td data-h="Truth" className="r num">
                              {j.truth}×
                            </td>
                            <td data-h="Counting airborne frames" className="r num">
                              {j.hangRatio !== undefined ? `${j.hangRatio.toFixed(2)}×` : "—"}
                            </td>
                          </tr>
                        )),
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {(() => {
              const [a, b] = mt.rows;
              const two = Math.sqrt(a.g / b.g);
              const sTwo = 0.5 * two * Math.hypot((a.sigmaStat ?? a.sigma) / a.g, (b.sigmaStat ?? b.sigma) / b.g);
              return (
                <>
                  <h3 className={styles.h3} id="which">
                    Which slowdown number is which
                  </h3>
                  <dl className={styles.which}>
                    <div>
                      <dt>
                        {sj.combined.ratio.toFixed(3)} <small>± {sj.combined.sigma.toFixed(3)}</small>×
                      </dt>
                      <dd>The headline: the same two jumps measured in both clips by the same code. Needs no reference value and no world.</dd>
                    </div>
                    <div>
                      <dt>
                        {two.toFixed(2)} <small>± {sTwo.toFixed(2)}</small>×
                      </dt>
                      <dd>The ratio of the two published runs, which each picked a different jump (second in the broadcast, first in the copy). It is also what Muse Spark answered when given Ansatz’s measurements as tools.</dd>
                    </div>
                    {slowedClock && (
                      <div>
                        <dt>
                          {slowedClock.factor.toFixed(2)} <small>± {(slowedClock.sigma ?? 0).toFixed(2)}</small>×
                        </dt>
                        <dd>
                          The slowed copy on its own, against the Moon’s known gravity (<Link href="/x/moon-jump-slowed">its page</Link>). A different question: it assumes the clip was filmed on the Moon.
                        </dd>
                      </div>
                    )}
                  </dl>
                </>
              );
            })()}
            </details>
            <p className={`${styles.para} ${styles.small}`}>
              Measured offline from one SAM 3.1 track of each whole clip, with the jump windows set by us (they bracket each jump with a margin; the airborne frames inside are found by the same rule as in a run). The quadratic over the whole flight is a different estimator from a run’s, which fits 70% and predicts the rest, so these values differ slightly from the runs above.
            </p>
            <Note who="Us, not a model">The jump windows were set by hand; everything inside them is found by code.</Note>
          </>
        )}

        {/* ---- the Moon: can it tell the speed ---- */}
        {st && (
          <>
            <Section n={sec()} title="Can it tell the speed?" id="speed-test">
              <p>The fair version of the test: we asked Muse Spark about the playback itself, not the Moon. It saw up to 300 frames of each clip and was told the astronaut’s height. Clip B is clip A slowed 1.5× with interpolated frames.</p>
            </Section>
            <div className={styles.span}>
              <table className={`journal ${styles.stack}`}>
                <thead>
                  <tr>
                    <th>Asked</th>
                    <th>Muse Spark answered</th>
                    <th>Ansatz measured</th>
                  </tr>
                </thead>
                <tbody>
                  {(st.repeats?.clips ?? st.single.map((x) => ({ clip: x.clip, truth: "", answers: [x], calledSlowed: x.real_speed ? 0 : 1 }))).map((c, i) => {
                    const n = c.answers.length;
                    return (
                      <tr key={c.clip}>
                        <td data-h="Asked">
                          Clip {c.clip} alone{c.truth ? ` (${c.truth})` : ""}: the acceleration as it plays, and is it real speed?
                        </td>
                        <td data-h="Muse Spark answered">
                          <b>{n > 1 ? `called it ${c.calledSlowed === 0 ? "real speed" : "slowed"} ${c.calledSlowed === 0 ? n : c.calledSlowed} of ${n} times` : c.calledSlowed ? "slowed" : "real speed"}</b>
                          <span className={styles.sub}>its answers, as played: {c.answers.map((a) => `${a.playback_accel} m/s²${a.real_speed ? "" : ` (“slowed ${a.factor}×”)`}`).join("; ")}</span>
                        </td>
                        <td data-h="Ansatz measured" className="num">
                          {i === 0 ? (mt ? `${mt.rows[0].g.toFixed(2)} ± ${mt.rows[0].sigma.toFixed(2)} m/s²: real speed, if this is the Moon` : "—") : sj ? `slower than A by ${sj.combined.ratio.toFixed(3)} ± ${sj.combined.sigma.toFixed(3)}×, jump for jump` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                  <tr>
                    <td data-h="Asked">Both clips side by side: is either slower, and by what factor?</td>
                    <td data-h="Muse Spark answered">
                      {st.pair.slower === "neither" ? "neither" : `${st.pair.slower} is slower, by ${st.pair.factor}×`} (asked once)
                      <span className={styles.sub}>{st.pair.reasoning}</span>
                    </td>
                    <td data-h="Ansatz measured" className="num">
                      {sj ? `B by ${sj.combined.ratio.toFixed(3)} ± ${sj.combined.sigma.toFixed(3)}×, jump for jump` : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={styles.para}>
              {st.repeats
                ? `One clip at a time, the model called the slowed copy real speed ${st.repeats.clips[1].answers.length - st.repeats.clips[1].calledSlowed} of ${st.repeats.n} times, answering with the Moon’s textbook gravity, and called the real broadcast slowed ${st.repeats.clips[0].calledSlowed} of ${st.repeats.n} times.`
                : "One clip at a time, the model gives the same answer for both."}{" "}
              Side by side it can count frames and see that B is slower, which is impressive. Ansatz needs no second clip to measure each one’s fall; comparing the two, jump for jump, gives the slowdown with no reference value.
            </p>
            {st.repeats && (
              <details className={styles.details}>
                <summary>The first single answers, with Muse Spark’s reasoning (asked once each, before the five repeats)</summary>
                {st.single.map((x) => (
                  <p key={x.clip}>
                    <b>
                      Clip {x.clip}: {x.playback_accel} m/s², {x.real_speed ? "real speed" : `slowed ${x.factor}×`}.
                    </b>{" "}
                    {x.reasoning}
                  </p>
                ))}
              </details>
            )}
            <h3 className={styles.h3} id="with-tools">
              With Ansatz’s measurements as tools
            </h3>
            <p>Muse Spark was given measure_motion for each clip, and compare_clips, a ratio that needs no reference value. It made these calls:</p>
            <pre className={styles.calls}>{st.withTools.calls.map((c) => `${c.name}${/compare_clips/.test(c.name) ? " [the whole-run ratio]" : ""} → ${JSON.stringify(c.result)}`).join("\n")}</pre>
            <Note who="Muse Spark 1.3, with tools">The tools run Ansatz&rsquo;s own measurement; the arithmetic on their results is the model&rsquo;s.</Note>
            <p className={styles.para}>
              <b>Its answer</b> (square brackets are ours: its slowdown is the whole-run ratio of the two runs, not the jump-for-jump {sj ? `${fmtPair(sj.combined.ratio, sj.combined.sigma)}×` : "value"}):
            </p>
            <div className={styles.answer}>{mathText(wholeRun(st.withTools.answer, st.withTools.calls))}</div>
          </>
        )}

        {e.extras?.toolTest && (
          <>
            <Section n={sec()} title="The same model, with Ansatz as its tool" id="tool-test">
              <p>We asked Muse Spark the same question with one function it could call, measure_motion, which runs this whole pipeline on the clip. It called it, and its answer changed.</p>
            </Section>
            <dl className={styles.exchange}>
              <dt>Question</dt>
              <dd>{e.extras.toolTest.question}</dd>
              <dt>Muse Spark called</dt>
              <dd>
                measure_motion({e.extras.toolTest.calledWith})
                <pre className={styles.calls}>{JSON.stringify(e.extras.toolTest.toolResult, null, 1)}</pre>
              </dd>
              <dt>Its answer</dt>
              <dd>{e.extras.toolTest.answer}</dd>
            </dl>
          </>
        )}

        {/* ---- the by-eye baseline ---- */}
        {e.eyeball && (
          <>
            <Section n={sec()} title="The same model, by eye" id="by-eye">
              <p>
                We showed {modelName(e.eyeball.model)} the same clip and narration and asked for the same numbers, by eye, with no SAM 3.1 measurements. This is what SAM 3.1&rsquo;s measurements add.
              </p>
            </Section>
            <div className={styles.tableWrap}>
              <table className={`journal ${styles.stack}`}>
                <thead>
                  <tr>
                    <th>Quantity</th>
                    <th className="r">By eye (Muse Spark alone)</th>
                    <th className="r">Measured (Ansatz)</th>
                    {e.comparisons.length > 0 && <th className="r">Reference</th>}
                  </tr>
                </thead>
                <tbody>
                  {freeParams.map((p) => {
                    const eye = e.eyeball!.estimates.find((x) => x.quantity.toLowerCase() === p.name.toLowerCase());
                    const cmp = e.comparisons.find((c) => c.param === p.name);
                    const gLike = !!cmp && /accelerates at g/.test(cmp.label);
                    const mv = gLike ? Math.abs(win.fit.theta[p.name]) : win.fit.theta[p.name];
                    return (
                      <tr key={p.name}>
                        <td data-h="Quantity">
                          <Tex>{paramLatex(p.name)}</Tex> <span className={styles.meaning}>{gLike ? `g, the size of ${p.name}` : p.meaning}</span>
                        </td>
                        <td data-h="By eye (Muse Spark alone)" className={`r num ${styles.eye}`}>
                          {eye ? `${fmt(eye.value)} ${prettyUnit(eye.unit)}` : "—"}
                        </td>
                        <td data-h="Measured (Ansatz)" className={`r ${styles.value}`}>
                          {rough ? (
                            `about ${fmt(mv, 2)}`
                          ) : (
                            <>
                              {fmtPair(mv, win.fit.sigma[p.name]).split(" ± ")[0]}
                              {fmtPair(mv, win.fit.sigma[p.name]).includes(" ± ") && <span className={styles.pmS}> ± {fmtPair(mv, win.fit.sigma[p.name]).split(" ± ")[1]}</span>}
                            </>
                          )}{" "}
                          <span className={styles.unitS}>{prettyUnit(p.unit)}</span>
                        </td>
                        {e.comparisons.length > 0 && (
                          <td data-h="Reference" className="r num">
                            {cmp ? `${fmt(cmp.reference)} ${prettyUnit(p.unit)}` : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className={`${styles.para} ${styles.small}`}>Its account of the law: “{e.eyeball.law_in_words}”</p>
            <Note who={`${modelName(e.eyeball.model)}, by eye`}>The same model that proposes the laws, asked to guess the numbers without measuring.</Note>
            {e.extras?.eyeballNote && <p className={styles.para}>{e.extras.eyeballNote}</p>}
          </>
        )}

        {/* ---- ask ---- */}
        <Section n={sec()} title="Ask Muse Spark about this run" id="ask">
          <p>It answers from this experiment’s record (the laws, the trial, every constant), and code checks every number it quotes against that record.</p>
        </Section>
        <Note who="Muse Spark 1.3, then code">A number whose quote is not in the record is removed before you see the answer.</Note>
        <div className={styles.askBox}>
          <AskRun id={e.id} examples={["Why did this law win?", "How sure is this measurement?", e.clock ? "Is this clip in slow motion?" : "What would change on the Moon?"]} />
        </div>

        {/* ---- the model ledger ---- */}
        <Section n={sec()} title="Lab notebook" id="notebook">
          <p>Every model call this experiment made, what it was for, how long it took and what it cost.</p>
        </Section>
        {(() => {
          // SAM 3.1's timing for the subject's track (records from before it was measured have none)
          const sams = e.ledger.calls.filter((c) => c.model === "sam-3.1" && c.firstMaskMs !== undefined && c.totalMs !== undefined);
          const sam = sams.find((c) => c.purpose.startsWith(`track "${e.tracking.noun}"`)) ?? sams[0];
          return sam ? (
            <Note who="SAM 3.1">
              First mask in {(sam.firstMaskMs! / 1000).toFixed(1)} s; {sam.frames ?? e.tracking.framesSeen} frames in {(sam.totalMs! / 1000).toFixed(1)} s.
            </Note>
          ) : null;
        })()}
        <div className={styles.span}>
          <table className={`journal ${styles.stack} ${styles.ledger}`}>
            <thead>
              <tr>
                <th>Model</th>
                <th>What it was for</th>
                <th className="r">Time</th>
                <th className="r">Work</th>
                <th className="r">Cost</th>
              </tr>
            </thead>
            <tbody>
              {e.ledger.calls.map((c, i) => (
                <tr key={i}>
                  <td data-h="Model" className={styles.model}>
                    {modelName(c.model)}
                  </td>
                  <td data-h="What it was for">{c.purpose}</td>
                  <td data-h="Time" className="r num">
                    {c.ms ? `${(c.ms / 1000).toFixed(1)} s` : "—"}
                  </td>
                  <td data-h="Work" className="r num">
                    {[c.frames ? `${c.frames} frames` : "", c.outputTokens ? `${c.outputTokens.toLocaleString("en")} tokens out` : ""].filter(Boolean).join(", ") || "—"}
                    {c.frames && !c.ms ? <span className={styles.sub}>time not recorded; cost estimated from frames</span> : null}
                  </td>
                  <td data-h="Cost" className="r num">
                    ${c.usd.toFixed(4)}
                  </td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td data-h="Model">Total</td>
                <td data-h="What it was for">
                  {e.ledger.calls.length} calls{e.ledger.tokens ? `, ${e.ledger.tokens.toLocaleString("en")} tokens` : ""}
                </td>
                <td data-h="Time" className="r num">
                  {(e.ledger.ms / 1000).toFixed(0)} s
                </td>
                <td className={styles.blank} />
                <td data-h="Cost" className="r num">
                  ${e.ledger.usd.toFixed(3)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <Note who="Who did what">SAM 3.1 measured. Muse Spark watched, proposed and refereed. Muse Wonder proposed when every law missed. Code fitted, predicted and ranked; no model picks the winner.</Note>

        <h3 className={styles.h3} id="observed">
          What Muse Spark saw
        </h3>
        <dl className={styles.obs}>
          <dt>Tracked</dt>
          <dd>
            “{e.tracking.noun}” in {e.tracking.framesSeen} frames (mean confidence {(e.tracking.meanConfidence * 100).toFixed(0)}%)
          </dd>
          <dt>Ruler</dt>
          <dd>{e.measured.calibration.note}</dd>
          <dt>Clock</dt>
          <dd>
            {e.video.frames} frames at {e.video.fps.toFixed(2)} fps from the file’s own timestamps{e.measured.slowMotion > 1 ? `, slowed ${e.measured.slowMotion}× (${e.observation.slow_motion.evidence})` : ""}
          </dd>
          {e.narration?.transcript && (
            <>
              <dt>Narration</dt>
              <dd>“{e.narration.transcript}”</dd>
            </>
          )}
          {e.observation.stated_facts.length > 0 && (
            <>
              <dt>Read from the clip</dt>
              <dd>
                {e.observation.stated_facts.map((f, i) => (
                  <span key={i} className={styles.fact}>
                    {f.quantity}: {f.value} {f.unit} <q>{f.said}</q>
                  </span>
                ))}
              </dd>
            </>
          )}
          {e.observation.caveats.length > 0 && (
            <>
              <dt>Caveats</dt>
              <dd>
                <ul>
                  {[...e.observation.caveats, ...(ref?.caveats ?? [])].slice(0, 6).map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </dd>
            </>
          )}
        </dl>
        {e.narration?.transcript && <Note who="Muse Voice Transcribe">Heard the narration; Muse Spark read the facts out of it.</Note>}
        {e.reasoning && (
          <>
            <h3 className={styles.h3}>Why these candidates</h3>
            <p>{e.reasoning}</p>
            <Note who="Muse Spark 1.3">Its reasoning, written when it proposed the laws.</Note>
          </>
        )}

        {/* ---- the record ---- */}
        <Section n={sec()} title="The record" id="record">
          <p>Everything above, in forms you can keep: a lab report to print or hand in, the measured positions frame by frame, and the full record this page is built from.</p>
        </Section>
        <ul className={styles.records}>
          <li>
            <a href={`/x/${e.id}/report${lang ? `?lang=${lang}` : ""}`}>Lab report (print or PDF)</a>
            <span>aim, method, observations, result and errors, with spaces for a student&rsquo;s name</span>
          </li>
          <li>
            <a href={`/x/${e.id}/data.csv`} download>
              The data (CSV)
            </a>
            <span>time and position in every measured frame, with each law&rsquo;s prediction</span>
          </li>
          <li>
            <a href={`/x/${e.id}/record.json`}>The full record (JSON)</a>
            <span>every model call, every fit and every number on this page</span>
          </li>
        </ul>
      </Page>

      {/* ---- the end of the entry ---- */}
      <footer className={styles.end}>
        {(prevE || nextE) && (
          <nav className={styles.pager} aria-label="Other experiments">
            {prevE ? (
              <Link href={`/x/${prevE.id}`} rel="prev">
                <span>Previous entry</span>
                {prevE.title}
              </Link>
            ) : (
              <span />
            )}
            <Link href="/x" className={styles.pagerAll}>
              <span>The book</span>
              All experiments
            </Link>
            {nextE ? (
              <Link href={`/x/${nextE.id}`} rel="next" className={styles.pagerNext}>
                <span>Next entry</span>
                {nextE.title}
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
        <div className={styles.own}>
          <div>
            <h2 className={styles.ownH}>Film your own</h2>
            <p>Prop your phone up, drop something, swing something, throw something. Say what you know while you film.</p>
          </div>
          <div className={styles.ownCta}>
            <Link className="btn" href="/new">
              Run an experiment
            </Link>
            <Link className="btn ghost" href="/x">
              Every experiment
            </Link>
          </div>
        </div>
      </footer>
    </article>
  );
}

/** The models by the names Meta gives them. */
function modelName(id: string) {
  const known: Record<string, string> = {
    "sam-3.1": "SAM 3.1",
    "muse-spark-1.3": "Muse Spark 1.3",
    "muse-wonder-1.0": "Muse Wonder 1.0",
    "muse-voice-transcribe": "Muse Voice Transcribe",
  };
  if (known[id]) return known[id];
  if (/^sam/i.test(id)) return id.replace(/^sam-?/i, "SAM ");
  if (/^muse-/i.test(id)) return id.replace(/-/g, " ").replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/ (\d)/, " $1");
  return id;
}

function strip(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function fmt(v: number | undefined, sig = 3) {
  if (v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-6)) return v.toExponential(sig - 1);
  return String(+v.toPrecision(sig));
}

function fmtS(s: number) {
  return `${s < 1 ? s.toFixed(2) : s.toFixed(1)} s`;
}

function fmtLen(v: number, unit: string, channels: string[]) {
  if (!Number.isFinite(v)) return "—";
  if (channels.length === 1 && channels[0] === "theta") return `${((v * 180) / Math.PI).toFixed(2)}°`;
  if (unit === "px") return `${v.toFixed(1)} px`;
  return v < 0.01 ? `${(v * 1000).toFixed(1)} mm` : `${(v * 100).toFixed(1)} cm`;
}

/**
 * Marks the whole-run ratio wherever the model's answer quotes compare_clips' value, so it can't be read as the
 * jump-for-jump one: "[whole-run ratio]" after the display equation and after the inline mention.
 */
function wholeRun(text: string, calls: { name: string; result: unknown }[]) {
  const v = (calls.find((c) => /compare_clips/.test(c.name))?.result as { b_slower_than_a_by?: number } | undefined)?.b_slower_than_a_by;
  if (v === undefined) return text;
  const n = String(v);
  return text
    .split("$$")
    .map((part, i) => (i % 2 === 1 && part.includes(n) ? `${part}\\ \\text{[whole-run ratio]}` : part))
    .join("$$")
    .split(`$${n}\\times$`)
    .join(`$${n}\\times$ [whole-run ratio]`);
}

/** A model's answer with its inline ($…$) and display ($$…$$) LaTeX typeset. */
function mathText(text: string) {
  const out: React.ReactNode[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0,
    k = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index).replace(/^> ?/gm, ""));
    out.push(
      m[1] ? (
        <Tex key={k++} display>
          {m[1]}
        </Tex>
      ) : (
        <Tex key={k++}>{m[2]}</Tex>
      ),
    );
    last = m.index + m[0].length;
  }
  out.push(text.slice(last).replace(/^> ?/gm, ""));
  return out;
}

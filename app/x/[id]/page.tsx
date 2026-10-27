import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import AskRun from "@/components/AskRun";
import PhotoFinish from "@/components/PhotoFinish";
import slits from "@/data/slits.json";
import ExperimentVisual from "@/components/ExperimentVisual";
import SeriesChart from "@/components/SeriesChart";
import Tex from "@/components/Tex";
import { clipData, getExperiment, plateData, winnerOf } from "@/lib/experiments";
import { lawLatex, paramLatex } from "@/lib/latex";
import { atBound, type Experiment } from "@/lib/experiment";
import { prettyUnit, secondPower } from "@/lib/units";
import { fmtPair } from "@/lib/format";
import { LANGUAGES, translation } from "@/lib/translate";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }>; searchParams?: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const e = await getExperiment(id);
  if (!e) return { title: "Experiment not found" };
  return { title: `${e.title}: ${strip(e.headline ?? e.finding).slice(0, 80)}`, description: strip(e.finding) };
}

export default async function ExperimentPage({ params, searchParams }: Params) {
  const { id } = await params;
  const lang = (await searchParams)?.lang;
  const e = await getExperiment(id);
  if (!e) notFound();
  const tr = lang && LANGUAGES[lang] ? await translation(e, lang).catch(() => null) : null;
  const win = winnerOf(e);
  const hasSlit = e.id in slits;
  // the ranking's own score (the worse of the fitted and unseen misses, in noise units), and why a law sits where it does
  const scoreOf = (c: (typeof e.candidates)[number]) => (Number.isFinite(c.fit.testZ) ? Math.max(c.fit.testZ!, Number.isFinite(c.fit.trainZ) ? c.fit.trainZ! : 0) : c.fit.testRms);
  const maxScore = Math.max(1e-9, ...e.candidates.filter((c) => c.fit.ok && Number.isFinite(scoreOf(c))).map(scoreOf));
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
  const runnerUp = e.candidates.find((c) => c.law.id !== win.law.id && c.fit.ok);
  const freeParams = win.law.params.filter((p) => !p.fixed && p.name !== "cal");
  const fixedParams = win.law.params.filter((p) => p.fixed);
  const channels = Object.keys(win.fit.predicted).filter((c) => e.measured.series.ch[c]);
  // the readout leads with what was measured against what it should be; the prediction test follows
  // when even the winner misses the unseen frames by far more than the noise, a precise ± would overclaim
  const rough = Number.isFinite(win.fit.testZ) && win.fit.testZ! > 5;
  const lead = (() => {
    if (e.clock) {
      return {
        label: "How much slower than life the clip plays",
        value: rough ? `about ${e.clock.factor.toFixed(1)}×` : `${e.clock.factor.toFixed(2)}${e.clock.sigma ? ` ± ${e.clock.sigma.toFixed(2)}` : ""}×`,
        against: rough
          ? `Unconfirmed: found from gravity coming out too weak against the world’s known value, and the winning law misses the unseen frames by ${fmt(win.fit.testZ!, 2)}× the noise, so something it leaves out matters.`
          : "Found from gravity coming out too weak against the world’s known value, so it assumes the world.",
      };
    }
    const cmp = e.comparisons.find((c) => freeParams.some((p) => p.name === c.param));
    if (!cmp) return null;
    const p = freeParams.find((q) => q.name === cmp.param)!;
    const v = /accelerates at g|gravity/i.test(cmp.label) ? Math.abs(cmp.measured) : cmp.measured;
    const unit = p.unit && p.unit !== "1" ? ` ${prettyUnit(p.unit)}` : "";
    return {
      label: cmp.label.charAt(0).toUpperCase() + cmp.label.slice(1),
      value: rough ? `about ${fmt(v, 2)}${unit}` : `${fmtPair(v, cmp.sigma)}${unit}`,
      against: `Known value ${+cmp.reference.toPrecision(4)}${unit}: off by ${fmt(Math.abs(cmp.errorPct), 2)}%${Number.isFinite(cmp.withinSigma) && cmp.withinSigma < 20 ? `, ${fmt(cmp.withinSigma, 2)}σ` : ""}.`,
    };
  })();

  return (
    <article>
      <header className={styles.top}>
       <div className={`wrap ${styles.head}`}>
        <div className={styles.headText}>
        <p className={styles.kicker}>
          {e.observation.phenomenon.charAt(0).toUpperCase() + e.observation.phenomenon.slice(1)}
          {e.source.kind === "showcase" && e.source.credit ? `, ${e.source.credit.split(" (")[0].split(",")[0]}` : `, run ${new Date(e.createdAt).toUTCString().slice(5, 16)}`}
        </p>
        <nav className={styles.langs} aria-label="Language">
          <a href={`/x/${e.id}`} aria-current={!tr ? "page" : undefined}>English</a>
          {Object.entries(LANGUAGES).map(([code, name]) => (
            <a key={code} href={`/x/${e.id}?lang=${code}`} lang={code} rel="nofollow" aria-current={tr && lang === code ? "page" : undefined}>
              {name}
            </a>
          ))}
        </nav>
        {lang && LANGUAGES[lang] && !tr && <p className="small">That translation would have changed a number, so it isn’t shown. Here is the English.</p>}
        <h1 className={styles.finding} lang={tr ? lang : undefined}>{tr?.headline ?? e.headline ?? e.finding}</h1>
        {(tr || e.headline) && <p className={styles.detailFinding} lang={tr ? lang : undefined}>{tr?.finding ?? e.finding}</p>}
        </div>
        <div className={styles.readout}>
          {lead ? (
            <>
              <p className={styles.readLabel}>{lead.label}</p>
              <p className={styles.bigNum}>{lead.value}</p>
              <p className={styles.readSub}>{lead.against}</p>
            </>
          ) : (
            <>
              <p className={styles.readLabel}>Average miss on the {unseenFrames} frames no law saw</p>
              <p className={styles.bigNum}>{fmtLen(win.fit.testRms, lengthUnit, channels)}</p>
            </>
          )}
          <dl className={styles.readRows}>
            <div>
              <dt>Winner</dt>
              <dd>{win.law.title}</dd>
            </div>
            <div>
              <dt>Unseen frames</dt>
              <dd>
                {unseenFrames} frames missed by {fmtLen(win.fit.testRms, lengthUnit, channels)} on average
                {Number.isFinite(win.fit.testZ) ? `, ${fmt(win.fit.testZ!, 2)}× the measurement noise` : ""}
              </dd>
            </div>
            {runnerUp && (
              <div>
                <dt>Runner-up</dt>
                <dd>
                  {fmtLen(runnerUp.fit.testRms, lengthUnit, channels)}
                  {runnerUp.fit.testRms <= win.fit.testRms && " (a tie within the measurement noise; see the trial)"}
                </dd>
              </div>
            )}
            <div>
              <dt>Laws tried</dt>
              <dd>{e.candidates.length}</dd>
            </div>
          </dl>
        </div>
       </div>
       {hasSlit && (
         <div className={`wrap ${styles.bandFinish}`}>
           <PhotoFinish e={e} />
         </div>
       )}
       <div className="wrap">
         <blockquote className={styles.watched} lang={tr ? lang : undefined}>
           <span>Muse Spark, watching the clip:</span> “{tr?.what_happens ?? e.observation.what_happens}”
         </blockquote>
       </div>
      </header>

      <section className={`wrap ${styles.main}`}>
        <div className={styles.plateCol}>
          <ExperimentVisual plate={plate} clip={clipData(e)} />
          <p className={styles.plateNote}>
            A stroboscopic print made from the clip: SAM 3.1’s masks cut the {e.tracking.noun} out of {e.strobe.length} frames and lay them on one darkened frame. The law was fitted to the filled dots only. The rings are the {unseenFrames} frames it never saw ({fmtS(unseenSeconds)} of motion), and its line had to find them.
          </p>
        </div>

        <aside className={styles.lawCol}>
          <h2 className={styles.h2}>The law that won</h2>
          <p className={styles.lawTitle}>{win.law.title}</p>
          <div className={`eqn ${styles.eqns}`}>
            {lawLatex(win.law).map((l, i) => (
              <Tex key={i} display>
                {l}
              </Tex>
            ))}
          </div>
          <p className={styles.summary}>{win.law.summary}</p>

          <h3 className={styles.h3}>Measured</h3>
          <dl className={styles.consts}>
            {freeParams.map((p) => {
              const v = win.fit.theta[p.name], s = win.fit.sigma[p.name];
              const cmp = e.comparisons.find((c) => c.param === p.name);
              return (
                <div key={p.name} className={styles.const}>
                  <dt>
                    <Tex>{paramLatex(p.name)}</Tex>
                    <span>{p.meaning}</span>
                  </dt>
                  <dd className="num">
                    {Number.isFinite(s) && s > 0 ? (
                      <>
                        <strong>{fmtPair(v, s).split(" ± ")[0]}</strong>
                        <span> ± {fmtPair(v, s).split(" ± ")[1]}</span>
                      </>
                    ) : (
                      <>
                        <strong>{fmt(v)}</strong>
                        <span className={styles.nd}> (not pinned down)</span>
                      </>
                    )} {p.unit && p.unit !== "1" ? prettyUnit(p.unit) : ""}
                    {cmp && e.clock && (cmp.param === "g" || /accelerates at g|gravity/i.test(cmp.label)) ? (
                      // a clock problem explains the miss: say so first, and what the value is at the detected speed
                      <span className={styles.ref}>
                        Clock check: the clip plays about {e.clock.sigma ? fmtPair(e.clock.factor, e.clock.sigma) : e.clock.factor.toFixed(2)}× slower than life. At that speed {cmp.param === "g" ? "g" : `|${p.name}|`} = {fmt(Math.abs(v) * Math.pow(e.clock.factor, -secondPower(p.unit)))} {prettyUnit(p.unit)}; {cmp.label}: {fmt(cmp.reference)}. As filmed it is {fmt(Math.abs(cmp.errorPct), 2)}% off.
                      </span>
                    ) : (
                      cmp && (
                        <span className={styles.ref}>
                          {cmp.label}: {fmt(cmp.reference)} {prettyUnit(p.unit)}. Off by {fmt(Math.abs(cmp.errorPct), 2)}%{Number.isFinite(cmp.withinSigma) ? (cmp.withinSigma > 20 ? ", far outside the error bar: check the clock or the ruler" : `, ${fmt(cmp.withinSigma, 2)}σ`) : ""}.
                        </span>
                      )
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>


          {(e.given.length > 0 || fixedParams.length > 0) && (
            <>
              <h3 className={styles.h3}>Given, not measured</h3>
              <ul className={styles.given}>
                {e.given.map((g, i) => (
                  <li key={i}>{g}</li>
                ))}
              </ul>
            </>
          )}
          <p style={{ marginTop: 18 }}>
            <a className="btn ghost" href={`/x/${e.id}/report${tr && lang ? `?lang=${lang}` : ""}`}>
              Lab report (print or PDF)
            </a>{" "}
            <a className="btn ghost" href={`/x/${e.id}/data.csv`} download>
              Download the data (CSV)
            </a>
          </p>
          {e.clock && (
            <div className={styles.clock}>
              <p>{e.clock.note}</p>
              <p style={{ marginTop: 8 }}>
                Time rescales every constant by its power of seconds, so no new run is needed to see what a slow-motion clip would mean:
              </p>
              <ul>
                {[e.clock.factor, ...[2, 4, 8].filter((f) => Math.abs(Math.log(f / e.clock!.factor)) < 0.9)].map((f, i) => (
                  <li key={f}>
                    {i === 0 ? `At the detected ${f.toFixed(2)}×:` : `At ${f}× slow motion:`}{" "}
                    {freeParams.map((p) => `${p.name} = ${fmt(win.fit.theta[p.name] * Math.pow(f, -secondPower(p.unit)))} ${prettyUnit(p.unit)}`).join(", ")}
                    {i === 0 && " (gravity matches by construction: that is how the factor was found)"}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </section>


      <section className={`section ${styles.band}`}>
        <div className="wrap">
          <h2>The trial</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Every candidate law was fitted to the first {Math.round(e.trainFrac * 100)}% of the motion, then asked to predict the rest. Each is ranked by the worse of the two, in units of the measurement noise (1 means it misses by no more than the noise). When two laws are equally good, the simpler one wins.
          </p>
          {Number.isFinite(win.fit.testZ) && win.fit.testZ! > 5 && (
            <p className={styles.caution}>
              Even the winner misses the unseen frames by {fmt(win.fit.testZ!, 2)}× the measurement noise, so something none of these laws include matters there
              {e.observation.caveats[0] ? ` (the observer noted: ${e.observation.caveats[0]})` : ""}. Read its constants as the best available description, not a closed case.
            </p>
          )}
          <ol className={styles.trial}>
            {e.candidates.map((c) => (
              <li key={c.law.id} className={c.law.id === win.law.id ? styles.winner : ""}>
                <div className={styles.rank}>{c.rank}</div>
                <div className={styles.cand}>
                  <p className={styles.candTitle}>
                    {c.law.title} <span className={styles.origin}>{c.origin === "muse" ? "proposed by Muse Spark" : c.origin === "revision" ? "written by Muse Wonder at the referee’s request" : "textbook control"}</span>
                  </p>
                  <div className={styles.candEq}>
                    {lawLatex(c.law).map((l, i) => (
                      <Tex key={i}>{l}</Tex>
                    ))}
                  </div>
                  {c.ifItWins && <p className="small">{c.ifItWins}</p>}
                </div>
                <div className={styles.err}>
                  <div className={styles.bar} aria-hidden="true">
                    <span style={{ width: `${c.fit.ok ? Math.max(2, (Math.log1p(scoreOf(c)) / Math.log1p(maxScore)) * 100) : 100}%` }} />
                  </div>
                  {c.fit.ok ? (
                    <p className="num small">
                      seen {fmtLen(c.fit.trainRms, lengthUnit, channels)}
                      {Number.isFinite(c.fit.trainZ) ? ` (${fmt(c.fit.trainZ!, 2)}×)` : ""} · unseen <strong>{fmtLen(c.fit.testRms, lengthUnit, channels)}</strong>
                      {Number.isFinite(c.fit.testZ) ? ` (${fmt(c.fit.testZ!, 2)}×)` : ""}
                    </p>
                  ) : (
                    <p className="num">failed</p>
                  )}
                  {reasonFor(c) && <p className={styles.reason}>{reasonFor(c)}</p>}
                  {!c.fit.ok && c.fit.why && <p className="small">{c.fit.why}</p>}
                </div>
              </li>
            ))}
          </ol>
          {e.wonder && (
            <div className={styles.wonder}>
              <p>
                <strong>Muse Wonder’s notebook.</strong> Asked for one more law ({e.wonder.idea.replace(/\.$/, "")}), it tried {e.wonder.attempts.length} on the fitted frames before submitting one. It never saw the held-out frames.
              </p>
              <ol>
                {e.wonder.attempts.map((a, i) => (
                  <li key={i}>
                    {a.title} <span className="small num">{a.ok && a.trainRms !== undefined ? `misses the fitted frames by ${fmtLen(a.trainRms, lengthUnit, channels)}` : a.error ?? "could not be fitted"}</span>
                  </li>
                ))}
              </ol>
              <p className="small">Submitted: {e.wonder.submitted ?? "nothing"}{(() => { const c = e.candidates.find((x) => x.origin === "revision"); return c ? `, which ranked ${c.rank} of ${e.candidates.length} on the unseen frames.` : "."; })()}</p>
            </div>
          )}
          {ref?.why_it_won ? (
            <p className={styles.referee}>
              <strong>Referee ({e.ledger.calls.find((c) => c.purpose.startsWith("referee"))?.model ?? e.models.critique}):</strong> {ref.why_it_won}
              {ref.verdict === "revise" && ref.revision_idea && (
                <>
                  {" "}
                  It asked for one more law ({ref.revision_idea}), which {e.ledger.calls.find((c) => c.purpose.startsWith("write a revised law"))?.model ?? "Muse Wonder"} wrote and which competed above.
                </>
              )}
            </p>
          ) : e.critique ? (
            <p className={styles.referee}>The ranking changed after the referee wrote its comment, so the comment is withheld.</p>
          ) : null}
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>Measured against predicted</h2>
          <div className={styles.charts}>
            {channels.map((ch) => (
              <SeriesChart
                key={ch}
                t={tAll}
                measured={e.measured.series.ch[ch]}
                law={win.fit.predicted[ch]}
                runnerUp={runnerUp?.fit.predicted[ch]}
                split={plate.split}
                label={ch === "theta" ? "angle" : ch}
                unit={ch === "theta" ? "rad" : lengthUnit}
              />
            ))}
          </div>
          <p className="small" style={{ marginTop: 10 }}>
            Dots: {e.measured.point === "top" ? "the top of SAM 3.1’s mask (the helmet)" : "SAM 3.1 mask centroids"}, {e.measured.px.length} frames, times read from the video file{e.measured.slowMotion > 1 ? ` and divided by the ${e.measured.slowMotion}× slow motion` : ""}. Blue: the winning law. Grey dashes: the runner-up.
          </p>
        </div>
      </section>

      {e.extras?.truth && (
        <section className={`section ${styles.band}`}>
          <div className="wrap">
            <h2>Against the known answer</h2>
            <p className="lede" style={{ marginTop: 12 }}>{e.extras.truth.note}</p>
            <table className={styles.vs}>
              <thead>
                <tr>
                  <th>Constant</th>
                  <th>Measured</th>
                  <th>True value</th>
                  <th>Off by</th>
                </tr>
              </thead>
              <tbody>
                {e.extras.truth.rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="num">
                      <strong>{fmtPair(r.measured, r.sigma)}</strong> {r.unit}
                    </td>
                    <td className="num">
                      {fmt(r.truth)} {r.unit}
                    </td>
                    <td className="num">{fmt(Math.abs((r.measured - r.truth) / r.truth) * 100, 2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {e.extras?.robustness && (
        <section className={`section ${styles.band}`}>
          <div className="wrap">
            <h2>How sensitive is this?</h2>
            <p className="lede" style={{ marginTop: 12 }}>{e.extras.robustness.note}</p>
            <table className={styles.vs}>
              <thead>
                <tr>
                  <th>Reading</th>
                  <th>g (m/s²)</th>
                </tr>
              </thead>
              <tbody>
                {e.extras.robustness.rows.map((r) => (
                  <tr key={r.label}>
                    <td>{r.label}</td>
                    <td className="num">
                      <strong>{r.g.toFixed(2)}</strong> ± {r.sigma.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {e.extras.crossCheck && <p style={{ marginTop: 16, maxWidth: "75ch" }}>{e.extras.crossCheck}</p>}
            {e.extras.ruler && <p className="small" style={{ marginTop: 8 }}>Ruler: {e.extras.ruler}</p>}
          </div>
        </section>
      )}

      {e.extras?.memoryTest && (
        <section className={`section ${styles.band}`}>
          <div className="wrap">
            <h2>Memory or measurement?</h2>
            <p className="lede" style={{ marginTop: 12 }}>{e.extras.memoryTest.note}</p>
            <table className={styles.vs}>
              <thead>
                <tr>
                  <th>Clip</th>
                  <th>Muse Spark by eye</th>
                  <th>Ansatz measured</th>
                  <th>Ansatz’s clock check</th>
                </tr>
              </thead>
              <tbody>
                {e.extras.memoryTest.rows.map((r) => (
                  <tr key={r.clip}>
                    <td>{r.href && r.href !== `/x/${e.id}` ? <Link href={r.href}>{r.clip}</Link> : r.clip}</td>
                    <td className="num">{r.eye != null ? `${fmt(r.eye)} m/s²` : "—"}</td>
                    <td className="num">
                      <strong>{r.g.toFixed(2)}</strong> ± {r.sigma.toFixed(2)} m/s²
                    </td>
                    <td>{r.clock}</td>
                  </tr>
                ))}
                {e.extras.memoryTest.renders && (
                  <tr>
                    <td>
                      <Link href="/proof">{e.extras.memoryTest.renders.note}</Link>
                    </td>
                    <td className="num">{e.extras.memoryTest.renders.eye.map((v) => `${+v.toPrecision(2)} m/s²`).join(", ")}</td>
                    <td className="num">measured as filmed (see /proof)</td>
                    <td>
                      flags all {e.extras.memoryTest.renders.slows.length}: {e.extras.memoryTest.renders.clocks.map((v, i) => `${v.toFixed(1)}× (truth ${e.extras!.memoryTest!.renders!.slows[i]}×)`).join(", ")}; the 8× clip’s 15 cm ruler was read as a metre stick
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {(() => {
              const [a, b] = e.extras!.memoryTest!.rows;
              // gravity scales with 1/time², so the two runs give the slowdown with no reference value; the ruler is the
              // same astronaut's assumed height in both, so its ±5% cancels and only the statistical errors remain
              const f = Math.sqrt(a.g / b.g);
              const sf = 0.5 * f * Math.hypot((a.sigmaStat ?? a.sigma) / a.g, (b.sigmaStat ?? b.sigma) / b.g);
              return (
                <p style={{ marginTop: 16, maxWidth: "75ch" }}>
                  The language model gives the same answer to both, because it recognises the footage and recalls the textbook; on the real clip that recalled value is closer to the truth than our measurement, and on the slowed clip it is simply wrong. Ansatz’s answer moves with the pixels. Taken together, the two runs say the second clip plays {f.toFixed(2)} ± {sf.toFixed(2)}× slower than the first; we slowed it 1.5×. That needs no textbook value and no ruler, since gravity scales as one over time squared and the same astronaut is the ruler in both. On its own, each run’s clock check can only compare against the Moon value it assumes, so it says “slow motion, or a weaker world”.
                </p>
              );
            })()}
            {e.extras.memoryTest.sameJump && (
              <div className={styles.sameJump} id="same-jump">
                <h3 className={styles.h3}>The same jump in both clips</h3>
                <p style={{ maxWidth: "75ch" }}>{e.extras.memoryTest.sameJump.note}</p>
                <table className={styles.vs}>
                  <thead>
                    <tr>
                      <th>Jump</th>
                      <th>Broadcast</th>
                      <th>Slowed copy</th>
                      <th>Slowdown, from the ratio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.extras.memoryTest.sameJump.jumps.map((j) => (
                      <tr key={j.jump}>
                        <td>
                          {j.jump === 1 ? "First" : "Second"} jump
                          <span className="small" style={{ display: "block" }}>
                            {j.real.n} and {j.slowed.n} airborne frames
                          </span>
                        </td>
                        <td className="num">
                          {j.real.g.toFixed(2)} ± {j.real.sigma.toFixed(2)} m/s²
                          <span className="small" style={{ display: "block" }}>
                            {j.real.t0.toFixed(2)}–{j.real.t1.toFixed(2)} s
                          </span>
                        </td>
                        <td className="num">
                          {j.slowed.g.toFixed(2)} ± {j.slowed.sigma.toFixed(2)} m/s²
                          <span className="small" style={{ display: "block" }}>
                            {j.slowed.t0.toFixed(2)}–{j.slowed.t1.toFixed(2)} s
                          </span>
                        </td>
                        <td className="num">
                          <strong>{j.ratio.toFixed(2)}</strong> ± {j.sigma.toFixed(2)}×
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td>Both jumps, weighted</td>
                      <td />
                      <td />
                      <td className="num">
                        <strong>{e.extras.memoryTest.sameJump.combined.ratio.toFixed(3)}</strong> ± {e.extras.memoryTest.sameJump.combined.sigma.toFixed(3)}× (we slowed it 1.5×)
                      </td>
                    </tr>
                  </tbody>
                </table>
                <p className="small" style={{ marginTop: 8, maxWidth: "90ch" }}>
                  Measured offline from one SAM 3.1 track of each whole clip, with the jump windows set by us (they bracket each jump with a margin; the airborne frames inside are found by the same rule as in a run). The quadratic over the whole flight is a different estimator from a run’s, which fits 70% and predicts the rest, so these values differ slightly from the runs above.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {e.extras?.speedTest && (
        <section className={`section ${styles.band}`} id="speed-test">
          <div className="wrap">
            <h2>Can it tell the speed?</h2>
            <p className="lede" style={{ marginTop: 12, maxWidth: "75ch" }}>
              The fair version of the test: we asked Muse Spark about the playback itself, not the Moon. It saw up to 300 frames of each clip and was told the astronaut’s height. Clip B is clip A slowed 1.5× with interpolated frames.
            </p>
            <table className={styles.vs}>
              <thead>
                <tr>
                  <th>Asked</th>
                  <th>Muse Spark answered</th>
                  <th>Ansatz measured</th>
                </tr>
              </thead>
              <tbody>
                {e.extras.speedTest.single.map((x, i) => (
                  <tr key={x.clip}>
                    <td>Clip {x.clip} alone: the acceleration as it plays, and is it real speed?</td>
                    <td>
                      {x.playback_accel} m/s²; {x.real_speed ? "real speed" : `slowed ${x.factor}×`}
                      <p className="small">{x.reasoning}</p>
                    </td>
                    <td className="num">
                      {e.extras!.memoryTest ? `${e.extras!.memoryTest.rows[i].g.toFixed(2)} ± ${e.extras!.memoryTest.rows[i].sigma.toFixed(2)} m/s²` : "—"}; {i === 0 ? "real speed" : "slowed about 1.5×"}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>Both clips side by side: is either slower, and by what factor?</td>
                  <td>
                    {e.extras.speedTest.pair.slower === "neither" ? "neither" : `${e.extras.speedTest.pair.slower} is slower, by ${e.extras.speedTest.pair.factor}×`}
                    <p className="small">{e.extras.speedTest.pair.reasoning}</p>
                  </td>
                  <td className="num">B by {e.extras.memoryTest ? fmtPair(Math.sqrt(e.extras.memoryTest.rows[0].g / e.extras.memoryTest.rows[1].g), 0.5 * Math.sqrt(e.extras.memoryTest.rows[0].g / e.extras.memoryTest.rows[1].g) * Math.hypot((e.extras.memoryTest.rows[0].sigmaStat ?? e.extras.memoryTest.rows[0].sigma) / e.extras.memoryTest.rows[0].g, (e.extras.memoryTest.rows[1].sigmaStat ?? e.extras.memoryTest.rows[1].sigma) / e.extras.memoryTest.rows[1].g)) : "—"}×</td>
                </tr>
              </tbody>
            </table>
            <p style={{ marginTop: 16, maxWidth: "75ch" }}>
              One clip at a time, the model gives both clips the same answer, and calls the real-speed one slowed too. Side by side it can count frames and see that B is slower, which is impressive. Ansatz needs no second clip: each one’s measured fall says how fast it plays.
            </p>
            <div className={styles.toolTest}>
              <p>
                <strong>With Ansatz’s measurements as tools</strong> (measure_motion for each clip, and compare_clips, a ratio that needs no reference value), Muse Spark made these calls:
              </p>
              <pre>{e.extras.speedTest.withTools.calls.map((c) => `${c.name} → ${JSON.stringify(c.result)}`).join("\n")}</pre>
              <p>
                <strong>Its answer:</strong>
              </p>
              <div style={{ whiteSpace: "pre-line" }}>{mathText(e.extras.speedTest.withTools.answer)}</div>
              <p hidden></p>
            </div>
          </div>
        </section>
      )}

      {e.extras?.toolTest && (
        <section className={`section ${styles.band}`}>
          <div className="wrap">
            <h2>The same model, with Ansatz as its tool</h2>
            <p className="lede" style={{ marginTop: 12, maxWidth: "75ch" }}>
              We asked Muse Spark the same question with one function it could call, measure_motion, which runs this whole pipeline on the clip. It called it, and its answer changed.
            </p>
            <div className={styles.toolTest}>
              <p>
                <strong>Question:</strong> {e.extras.toolTest.question}
              </p>
              <p>
                <strong>Muse Spark called</strong> measure_motion({e.extras.toolTest.calledWith})
              </p>
              <pre>{JSON.stringify(e.extras.toolTest.toolResult, null, 1)}</pre>
              <p>
                <strong>Its answer:</strong> {e.extras.toolTest.answer}
              </p>
            </div>
          </div>
        </section>
      )}

      {e.eyeball && (
        <section className={`section ${styles.band}`}>
          <div className="wrap">
            <h2>The same model, by eye (no SAM measurements)</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              We showed {e.eyeball.model} the same clip and narration and asked for the same numbers, by eye. This is what SAM’s measurements add.
            </p>
            <table className={styles.vs}>
              <thead>
                <tr>
                  <th>Quantity</th>
                  <th>By eye (Muse Spark alone)</th>
                  <th>Measured (Ansatz)</th>
                  {e.comparisons.length > 0 && <th>Reference</th>}
                </tr>
              </thead>
              <tbody>
                {freeParams.map((p) => {
                  const eye = e.eyeball!.estimates.find((x) => x.quantity.toLowerCase() === p.name.toLowerCase());
                  const cmp = e.comparisons.find((c) => c.param === p.name);
                  return (
                    <tr key={p.name}>
                      <td>
                        <Tex>{paramLatex(p.name)}</Tex> <span className="small">{cmp && /accelerates at g/.test(cmp.label) ? `g, the size of ${p.name}` : p.meaning}</span>
                      </td>
                      <td className="num">{eye ? `${fmt(eye.value)} ${prettyUnit(eye.unit)}` : "—"}</td>
                      <td className="num">
                        <strong>{fmtPair(cmp && /accelerates at g/.test(cmp.label) ? Math.abs(win.fit.theta[p.name]) : win.fit.theta[p.name], win.fit.sigma[p.name])}</strong> {prettyUnit(p.unit)}
                      </td>
                      {e.comparisons.length > 0 && <td className="num">{cmp ? `${fmt(cmp.reference)} ${prettyUnit(p.unit)}` : "—"}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="small" style={{ marginTop: 10 }}>Its account of the law: “{e.eyeball.law_in_words}”</p>
            {e.extras?.eyeballNote && <p style={{ marginTop: 12, maxWidth: "75ch" }}>{e.extras.eyeballNote}</p>}
          </div>
        </section>
      )}

      <section className={`section ${styles.band}`}>
        <div className="wrap">
          <h2>Ask Muse Spark about this run</h2>
          <p className="lede" style={{ marginTop: 12, marginBottom: 18, maxWidth: "75ch" }}>
            It answers from this experiment’s record (the laws, the trial, every constant), and code checks every number it quotes against that record.
          </p>
          <AskRun id={e.id} examples={["Why did this law win?", "How sure is this measurement?", e.clock ? "Is this clip in slow motion?" : "What would change on the Moon?"]} />
        </div>
      </section>

      <section className="section">
        <div className={`wrap ${styles.notebook}`}>
          <div>
            <h2>Lab notebook</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              Every model call this experiment made, what it was for, how long it took and what it cost.
            </p>
            <ol className={styles.calls}>
              {e.ledger.calls.map((c, i) => (
                <li key={i}>
                  <span className={styles.callModel}>{c.model}</span>
                  <span>{c.purpose}</span>
                  <span className="num small">
                    {c.ms ? `${(c.ms / 1000).toFixed(1)} s` : ""}
                    {c.frames ? `${c.frames} frames` : ""}
                    {c.outputTokens ? `, ${c.outputTokens.toLocaleString()} tokens out` : ""}
                  </span>
                  <span className="num">${c.usd.toFixed(4)}</span>
                </li>
              ))}
            </ol>
            <p className={styles.total}>
              <span>Total</span>
              <span className="num">{(e.ledger.ms / 1000).toFixed(0)} s</span>
              <span className="num">${e.ledger.usd.toFixed(3)}</span>
            </p>
          </div>
          <div>
            <h3 className={styles.h3}>What Muse Spark saw</h3>
            <dl className={styles.obs}>
              <dt>Tracked</dt>
              <dd>“{e.tracking.noun}” in {e.tracking.framesSeen} frames (mean confidence {(e.tracking.meanConfidence * 100).toFixed(0)}%)</dd>
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
            {e.reasoning && (
              <>
                <h3 className={styles.h3}>Why these candidates</h3>
                <p className="small">{e.reasoning}</p>
              </>
            )}
            <SourceCredit e={e} />
          </div>
        </div>
      </section>

      <section className={`section ${styles.cta}`}>
        <div className="wrap">
          <h2>Film your own</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Prop your phone up, drop something, swing something, throw something. Say what you know while you film.
          </p>
          <p style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/new">
              Run an experiment
            </Link>
            <Link className="btn ghost" href="/#experiments">
              More experiments
            </Link>
          </p>
        </div>
      </section>
    </article>
  );
}

function SourceCredit({ e }: { e: Experiment }) {
  if (e.source.kind !== "showcase" || !e.source.credit) return null;
  return (
    <p className="small" style={{ marginTop: 20 }}>
      Clip: {e.source.page ? <a href={e.source.page}>{e.source.credit}</a> : e.source.credit}
      {e.source.license ? `, ${e.source.license}` : ""}. Trimmed and re-encoded for measurement.
    </p>
  );
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

/** A model's answer with its inline ($…$) and display ($$…$$) LaTeX typeset. */
function mathText(text: string) {
  const out: React.ReactNode[] = [];
  const re = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  let last = 0, k = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index).replace(/^> ?/gm, ""));
    out.push(m[1] ? <Tex key={k++} display>{m[1]}</Tex> : <Tex key={k++}>{m[2]}</Tex>);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last).replace(/^> ?/gm, ""));
  return out;
}

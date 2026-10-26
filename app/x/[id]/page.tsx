import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import PlateWithControls from "@/components/PlateWithControls";
import SeriesChart from "@/components/SeriesChart";
import Tex from "@/components/Tex";
import { getExperiment, plateData, winnerOf } from "@/lib/experiments";
import { lawLatex, paramLatex } from "@/lib/latex";
import type { Experiment } from "@/lib/experiment";
import { prettyUnit, secondPower } from "@/lib/units";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const e = await getExperiment(id);
  if (!e) return { title: "Experiment not found" };
  return { title: `${e.title}: ${strip(e.headline ?? e.finding).slice(0, 80)}`, description: strip(e.finding) };
}

export default async function ExperimentPage({ params }: Params) {
  const { id } = await params;
  const e = await getExperiment(id);
  if (!e) notFound();
  const win = winnerOf(e);
  const plate = plateData(e);
  const lengthUnit = e.measured.calibration.kind === "none" ? "px" : "m";
  const unseenFrames = e.measured.px.length - plate.split;
  const tAll = e.measured.series.t;
  const unseenSeconds = tAll[tAll.length - 1] - tAll[plate.split];
  const runnerUp = e.candidates.find((c) => c.law.id !== win.law.id && c.fit.ok);
  const freeParams = win.law.params.filter((p) => !p.fixed && p.name !== "cal");
  const fixedParams = win.law.params.filter((p) => p.fixed);
  const maxErr = Math.max(...e.candidates.filter((c) => Number.isFinite(c.fit.testRms)).map((c) => c.fit.testRms), 1e-9);
  const channels = Object.keys(win.fit.predicted).filter((c) => e.measured.series.ch[c]);

  return (
    <article>
      <header className={`wrap ${styles.head}`}>
        <p className={styles.kicker}>
          {e.observation.phenomenon.charAt(0).toUpperCase() + e.observation.phenomenon.slice(1)}
          {e.source.kind === "showcase" && e.source.credit ? `, ${e.source.credit.split(" (")[0].split(",")[0]}` : `, run ${new Date(e.createdAt).toUTCString().slice(5, 16)}`}
        </p>
        <h1 className={styles.finding}>{e.headline ?? e.finding}</h1>
        {e.headline && <p className={styles.detailFinding}>{e.finding}</p>}
        <p className="lede">{e.observation.what_happens}</p>
      </header>

      <section className={`wrap ${styles.main}`}>
        <div className={styles.plateCol}>
          <PlateWithControls data={plate} priority />
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
                    <strong>{fmt(v)}</strong>
                    {Number.isFinite(s) && s > 0 ? <span> ± {fmt(s, 2)}</span> : <span className={styles.nd}> (not pinned down)</span>} {p.unit && p.unit !== "1" ? prettyUnit(p.unit) : ""}
                    {cmp && (
                      <span className={styles.ref}>
                        {cmp.label}: {fmt(cmp.reference)} {prettyUnit(p.unit)}. Off by {fmt(Math.abs(cmp.errorPct), 2)}%{Number.isFinite(cmp.withinSigma) ? `, ${fmt(cmp.withinSigma, 2)}σ` : ""}.
                      </span>
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className={styles.predict}>
            <p className={styles.bigNum}>
              {fmtLen(win.fit.testRms, lengthUnit, channels)}
            </p>
            <p className="small">
              average miss on the {unseenFrames} frames the law never saw (worst {fmtLen(win.fit.testMax, lengthUnit, channels)}). The runner-up missed by {runnerUp ? fmtLen(runnerUp.fit.testRms, lengthUnit, channels) : "—"}.
            </p>
          </div>

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
          {e.clock && (
            <div className={styles.clock}>
              <p>{e.clock.note}</p>
              <p style={{ marginTop: 8 }}>
                Time rescales every constant by its power of seconds, so no new run is needed to see what a slow-motion clip would mean:
              </p>
              <ul>
                {[2, 4, 8].filter((f) => Math.abs(Math.log(f / e.clock!.factor)) < 0.9).map((f) => (
                  <li key={f}>
                    At {f}× slow motion:{" "}
                    {freeParams.map((p) => `${p.name} = ${fmt(win.fit.theta[p.name] * Math.pow(f, -secondPower(p.unit)))} ${prettyUnit(p.unit)}`).join(", ")}
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
            Every candidate law was fitted to the first {Math.round(e.trainFrac * 100)}% of the motion, then asked to predict the rest. Lower is better. When two laws miss by less than the measurement noise, the simpler one wins.
          </p>
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
                    <span style={{ width: `${Number.isFinite(c.fit.testRms) ? Math.max(2, (c.fit.testRms / maxErr) * 100) : 100}%` }} />
                  </div>
                  <p className="num">{c.fit.ok ? fmtLen(c.fit.testRms, lengthUnit, channels) : "failed"}</p>
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
          {e.critique?.why_it_won && (
            <p className={styles.referee}>
              <strong>Referee ({e.ledger.calls.find((c) => c.purpose.startsWith("referee"))?.model ?? e.models.critique}):</strong> {e.critique.why_it_won}
              {e.critique.verdict === "revise" && e.critique.revision_idea && (
                <>
                  {" "}
                  It asked for one more law ({e.critique.revision_idea}), which {e.ledger.calls.find((c) => c.purpose.startsWith("write a revised law"))?.model ?? "Muse Wonder"} wrote and which competed above.
                </>
              )}
            </p>
          )}
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
            Dots: SAM 3.1 mask centroids, {e.measured.px.length} frames, times read from the video file{e.measured.slowMotion > 1 ? ` and divided by the ${e.measured.slowMotion}× slow motion` : ""}. Blue: the winning law. Grey dashes: the runner-up.
          </p>
        </div>
      </section>

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

      {e.eyeball && (
        <section className={`section ${styles.band}`}>
          <div className="wrap">
            <h2>The same model, without a ruler</h2>
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
                        <Tex>{paramLatex(p.name)}</Tex> <span className="small">{p.meaning}</span>
                      </td>
                      <td className="num">{eye ? `${fmt(eye.value)} ${prettyUnit(eye.unit)}` : "—"}</td>
                      <td className="num">
                        <strong>{fmt(win.fit.theta[p.name])}</strong> ± {fmt(win.fit.sigma[p.name], 2)} {prettyUnit(p.unit)}
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
                      {[...e.observation.caveats, ...(e.critique?.caveats ?? [])].slice(0, 6).map((c, i) => (
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
  if (a !== 0 && (a >= 1e5 || a < 1e-3)) return v.toExponential(sig - 1);
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

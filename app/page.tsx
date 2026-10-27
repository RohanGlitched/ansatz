import Link from "next/link";
import PlateWithControls from "@/components/PlateWithControls";
import StrobePlate from "@/components/StrobePlate";
import Tex from "@/components/Tex";
import MoonHero from "@/components/MoonHero";
import { getExperiment, plateData, recentExperiments, showcaseIds, winnerOf } from "@/lib/experiments";
import { lawLatex } from "@/lib/latex";
import { costText, headline, timeText } from "@/lib/headline";
import type { Experiment } from "@/lib/experiment";
import styles from "./home.module.css";

export const dynamic = "force-dynamic";

export default async function Home() {
  const ids = await showcaseIds();
  const exps = (await Promise.all(ids.map(getExperiment))).filter((e): e is Experiment => !!e);
  const hl = await headline();
  const hero = exps.find((e) => e.id === (process.env.HERO_ID ?? "beach-ball-drag")) ?? exps[0];
  const heroWin = hero ? winnerOf(hero) : null;
  const moon = exps.find((e) => e.id === "moon-jump");
  const recent = await recentExperiments().catch(() => []);
  const moonG = moon?.comparisons.find((c) => c.param === "g");
  // one real run, shown step by step in the method section
  const spec = exps.find((e) => e.id === "hardening-spring");
  const specTrack = (() => {
    const s = spec?.measured.series.ch.s, t = spec?.measured.series.t;
    if (!s || !t) return "";
    const lo = Math.min(...s), hi = Math.max(...s), T = t.at(-1) || 1;
    return s.map((v, i) => `${i ? "L" : "M"}${((t[i] / T) * 200).toFixed(1)} ${(58 - ((v - lo) / (hi - lo || 1)) * 56).toFixed(1)}`).join("");
  })();
  const maxMiss = Math.max(1e-5, ...(spec?.candidates.filter((c) => c.fit.ok).slice(0, 4).map((c) => c.fit.testRms) ?? []));

  return (
    <>
      {moon ? (
        <MoonHero e={moon} slowed={await getExperiment("moon-jump-slowed").catch(() => null)} />
      ) : (
      <section className={`wrap ${styles.hero}`}>
        <div className={styles.heroText}>
          <h1>Film anything that moves. Ansatz finds the law that moves it.</h1>
          <p className="lede">
            A phone clip becomes a physics experiment. SAM 3.1 measures the object in every frame, Muse Spark proposes laws of motion, and each law has to predict the part of the clip it never saw. The one that does is the answer.
          </p>
          <div className={styles.ctaRow}>
            <Link className="btn" href="/new">
              Run an experiment
            </Link>
            <Link className="btn ghost" href={hero ? `/x/${hero.id}` : "/proof"}>
              Open this experiment
            </Link>
          </div>
        </div>
        {hero && heroWin && (
          <div className={styles.heroPlate}>
            <PlateWithControls data={plateData(hero, { lazyStrobe: true })} priority />
            <div className={styles.heroLaw}>
              <div className="eqn">
                {lawLatex(heroWin.law).slice(0, 2).map((l, i) => (
                  <Tex key={i}>{l}</Tex>
                ))}
              </div>
              <p>{hero.finding}</p>
            </div>
          </div>
        )}
      </section>
      )}

      <section className="section">
        <div className="wrap">
          <h2 className={styles.h2}>Four Meta models, one scientific method</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Ansatz doesn’t ask a model what the answer is. It asks models to look, measure and guess, then lets the data decide. Under each step, what it produced on one real run: {spec ? <Link href={`/x/${spec.id}`}>a spring that stiffens as it stretches</Link> : "a spring"}.
          </p>
          <ol className={styles.method}>
            <li>
              <span className={styles.step}>Observe</span>
              <h3>Watch and listen</h3>
              <p>Muse Voice Transcribe hears what you said while filming, in English, Hindi or both; Muse Spark watches the clip, reads its captions and that transcript. Out comes what moves, when, what is known, and whether the clip is slowed down.</p>
              <p className={styles.model}>Muse Spark 1.3 and Muse Voice Transcribe</p>
              {spec && <blockquote className={styles.specimen}>“{spec.observation.what_happens.split(". ")[0]}.”</blockquote>}
            </li>
            <li>
              <span className={styles.step}>Measure</span>
              <h3>Track every frame</h3>
              <p>SAM 3.1 follows the object through every frame. Each mask becomes a sub-pixel centroid, timed by the video file’s own clock, and scaled by a ruler in view or by gravity itself.</p>
              <p className={styles.model}>SAM 3.1</p>
              {spec && specTrack && (
                <figure className={styles.specimen}>
                  <svg viewBox="0 0 200 60" preserveAspectRatio="none" aria-label="The measured track of the spring, position against time">
                    <path d={specTrack} fill="none" stroke="var(--measured)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
                  </svg>
                  <figcaption>{spec.measured.px.length} positions over {spec.measured.series.t.at(-1)?.toFixed(1)} s</figcaption>
                </figure>
              )}
            </li>
            <li>
              <span className={styles.step}>Hypothesise</span>
              <h3>Propose laws</h3>
              <p>Muse Spark writes two to four candidate laws as equations of motion: vacuum or drag, small swings or large, a bounce that loses energy. Textbook laws compete too.</p>
              <p className={styles.model}>Muse Spark 1.3</p>
              {spec && (
                <div className={styles.specimen}>
                  {spec.candidates.filter((c) => c.origin === "muse").slice(0, 2).map((c) => (
                    <div key={c.law.id} className={styles.specLaw}>
                      <Tex>{lawLatex(c.law).at(-1) ?? ""}</Tex>
                    </div>
                  ))}
                </div>
              )}
            </li>
            <li>
              <span className={styles.step}>Falsify</span>
              <h3>Predict the unseen</h3>
              <p>Code integrates every law, fits it to the first 70% of the motion, and makes it predict the last 30%. The model never picks the winner, and every measured number in the report comes from the fit.</p>
              <p className={styles.model}>Code: RK4 integration and Levenberg–Marquardt fitting</p>
              {spec && (
                <div className={styles.specimen}>
                  {spec.candidates.filter((c) => c.fit.ok).slice(0, 4).map((c, i) => (
                    <div key={c.law.id} className={styles.bar}>
                      <span style={{ width: `${Math.max(3, (Math.log10(c.fit.testRms * 1e5) / Math.log10(maxMiss * 1e5)) * 100)}%` }} className={i === 0 ? styles.barWin : undefined} />
                      <em>{c.fit.testRms < 0.01 ? `${(c.fit.testRms * 1000).toFixed(1)} mm` : `${(c.fit.testRms * 100).toFixed(1)} cm`}</em>
                    </div>
                  ))}
                  <p className={styles.specNote}>each law’s miss on the unseen 30%</p>
                </div>
              )}
            </li>
            <li>
              <span className={styles.step}>Referee</span>
              <h3>Explain or revise</h3>
              <p>Muse Spark reads the scoreboard and the residuals on the fitted frames. If every law misses, Muse Wonder, an agent with a fitting tool, tries laws on the seen frames and submits one, which has to earn its place the same way.</p>
              <p className={styles.model}>Muse Spark 1.3 and Muse Wonder 1.0</p>
              {spec?.wonder && (
                <ol className={styles.specimen}>
                  {spec.wonder.attempts.map((a) => (
                    <li key={a.title} className={spec.wonder?.submitted?.startsWith(a.title) ? styles.specPick : undefined}>
                      {a.title}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          </ol>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2 className={styles.h2}>Who it’s for</h2>
          <div className={styles.who}>
            <div>
              <h3>A student with a phone</h3>
              <p>The simple pendulum, free fall and projectile experiments in a school physics practical need a stopwatch you can’t start fast enough. Film the swing, say the string’s length in any of seven languages, and get g, the law, the error against the textbook value and a lab report to hand in, in seven languages. Film it at four lengths and the <Link href="/series/pendulum-lengths">slope of L against T²</Link> gives g, as the practical asks.</p>
            </div>
            <div>
              <h3>A teacher with a class of forty</h3>
              <p>
                One clip of a throw becomes a lesson in method: three candidate laws on the board, each predicting what happens next, and the class watching which one the data keeps. A <Link href="/class/new">class link</Link> gives the class its own 45 runs for a week and one page with every student’s result and every measurement of g (<Link href="/class/demo23">see a demo</Link>). A run costs {costText(hl)} and takes {timeText(hl)}.
              </p>
            </div>
            <div>
              <h3>Anyone who needs a number from a video</h3>
              <p>A coach measuring a jump, a maker measuring a drag coefficient, a researcher digitising footage that used to take an hour of clicking frame by frame in tracking software. Ansatz gives the constants with error bars and keeps the model honest: it proposes, the data decides.</p>
            </div>
            <div>
              <h3>Anyone asking whether a clip is real time</h3>
              <p>
                Gravity is a clock. With anything of known size in view, a fall or a swing says how fast the footage really runs: Ansatz caught the <Link href="/x/moon-jump-slowed">Apollo clip we slowed in secret</Link> ({hl.jumpForJump ? `jump for jump ${hl.jumpForJump.ratio.toFixed(3)} ± ${hl.jumpForJump.sigma.toFixed(3)}×` : "1.5×"}, truth 1.5×) and a <Link href="/x/sample-pendulum">pendulum posted as slow motion</Link> (about 4 to 4.5×, unconfirmed), where a language model watching the same frames answered from memory.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={`section ${styles.band}`} id="experiments">
        <div className="wrap">
          <h2 className={styles.h2}>Experiments</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Real clips and clips with known answers, each one measured, theorised and tested end to end. Open one to see every candidate law, the frames it never saw, and what each model call cost.
          </p>
          <div className={styles.gallery}>
            {exps.map((e) => {
              const w = winnerOf(e);
              return (
                <Link key={e.id} href={`/x/${e.id}`} className={styles.card}>
                  <StrobePlate data={plateData(e, { lazyStrobe: true, compact: true })} compact />
                  <div className={styles.cardBody}>
                    <p className={styles.cardTitle}>{e.title}</p>
                    <div className={styles.cardEq}>
                      <Tex>{lawLatex(w.law)[lawLatex(w.law).length > 1 ? 1 : 0] ?? ""}</Tex>
                    </div>
                    <p className={styles.cardFinding}>{e.headline ?? e.finding}</p>
                    <p className="small">{e.source.credit}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {recent.length > 0 && (
        <section className="section">
          <div className="wrap">
            <h2 className={styles.h2}>Run by visitors</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              The latest experiments people ran on this site, each with its full record.
            </p>
            <ul className={styles.recent}>
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/x/${r.id}`}>
                    <strong>{r.title}</strong>
                    <span>{r.headline}</span>
                    <em className="small">{new Date(r.createdAt).toUTCString().slice(5, 22)} UTC</em>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <section className="section">
        <div className={`wrap ${styles.two}`}>
          <div>
            <h2 className={styles.h2}>Why predict, not just fit</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              Any law with enough knobs can fit a curve it has already seen. A law earns trust by predicting what it hasn’t. So every candidate sees only the start of the motion and is graded on the rest.
            </p>
          </div>
          <ul className={styles.points}>
            <li>
              <strong>The model proposes; the data disposes.</strong> Muse’s laws are compiled into a small, safe equation language and integrated numerically. A law that can’t be integrated, or names a symbol it never defined, is rejected before it runs.
            </li>
            <li>
              <strong>Simpler wins ties.</strong> When two laws predict the unseen frames equally well, within the measurement’s own noise, the one with fewer parameters wins.
            </li>
            <li>
              <strong>Given is kept apart from measured.</strong> Every report lists what was assumed (a ruler, a stated length, Earth’s gravity) separately from what was measured, with an uncertainty on every number.
            </li>
            <li>
              <strong>The clock is checked.</strong> Frame times come from the video file itself. If gravity comes out wrong by a square, Ansatz says the clip is probably slow motion.
            </li>
          </ul>
        </div>
      </section>

      <section className={`section ${styles.dark}`}>
        <div className="wrap">
          <h2 className={styles.h2}>A physics lab in every pocket</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Motion experiments need a stopwatch you can’t start fast enough, or a light gate, a ticker timer and a lab. Ansatz needs a phone propped on some books. A student films a ball, says “the string is fifty centimetres” in any of seven languages, and gets back the law, the constants and how far off the textbook value they are.
          </p>
          <div className={styles.ctaRow} style={{ marginTop: 28 }}>
            <Link className="btn" href="/new">
              Run an experiment
            </Link>
            <Link className="btn ghost" href="/how">
              How it works
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

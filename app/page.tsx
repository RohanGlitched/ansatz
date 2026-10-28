import Link from "next/link";
import Tex from "@/components/Tex";
import Plate, { Note, Page, Section } from "@/components/book/Plate";
import FalsifyPlate from "@/components/book/FalsifyPlate";
import MoonPlate from "@/components/book/MoonPlate";
import { getExperiment, recentExperiments, showcaseIds, winnerOf } from "@/lib/experiments";
import { lawLatex } from "@/lib/latex";
import { plateLaws } from "@/lib/plateLaws";
import { costText, headline, timeText } from "@/lib/headline";
import type { Experiment } from "@/lib/experiment";
import styles from "./home.module.css";

// cached and rebuilt at most once a minute: it reads shipped runs, plus the visitors' latest runs from storage (force-static keeps
// that uncached storage read from turning the page back into a per-request render)
export const dynamic = "force-static";
export const revalidate = 60;

const HERO = "hardening-spring";

export default async function Home() {
  const ids = await showcaseIds();
  const exps = (await Promise.all(ids.map(getExperiment))).filter((e): e is Experiment => !!e);
  const hl = await headline();
  const hero = exps.find((e) => e.id === HERO) ?? (await getExperiment(HERO).catch(() => null));
  const moon = exps.find((e) => e.id === "moon-jump");
  const st = moon?.extras?.speedTest;
  const rp = st?.repeats;
  const clipB = rp?.clips.find((c) => c.clip === "B");
  const sparkWrongB = clipB ? clipB.answers.filter((x) => x.real_speed).length : 5;
  const moonG = moon?.comparisons.find((c) => c.param === "g");
  const recent = await recentExperiments().catch(() => []);
  const spec = hero;
  const specMuse = spec?.candidates.filter((c) => c.origin === "muse").slice(0, 2) ?? [];
  const sparkBest = spec?.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0];
  const wonderLaw = spec?.candidates.find((c) => c.origin === "revision");
  const k3 = spec?.extras?.truth?.rows.find((r) => r.param === "beta");
  const catalogue = exps.filter((e) => e.id !== "moon-jump-slowed");

  return (
    <>
      <header className={styles.title}>
        <div className={styles.titleIn}>
          <h1>
            Film anything that moves.
            <br />
            Get the law that moves it.
          </h1>
          <div className={styles.abstract}>
            <p>
              A phone clip becomes a physics experiment. SAM 3.1 measures the object in every frame. Muse Spark writes candidate laws of motion. Each law sees only the start of the motion and has to predict the rest. Laws that miss are struck out; the one that predicts survives.
            </p>
            <div className={styles.cta}>
              <Link href="/new" className="btn">
                Run an experiment
              </Link>
              <Link href="/judges" className="btn ghost">
                For judges: the case in one page
              </Link>
            </div>
          </div>
        </div>
      </header>

      {hero && (
        <Plate
          n="I"
          title={
            <>
              A spring that stiffens as it stretches. Drag the line: every law sees only the motion to its left and must predict the rest.
            </>
          }
          caption={
            <>
              Muse Spark&rsquo;s laws were refuted by the future; Muse Wonder&rsquo;s held. Each position of the line is a full refit by the same code a run uses. <Link href={`/x/${hero.id}`}>Open this experiment</Link>.
            </>
          }
        >
          <FalsifyPlate id={hero.id} video={hero.source.video} t0={hero.measured.window.t0} laws={plateLaws(hero)} />
        </Plate>
      )}

      <Page>
        <Section n={1} title="The Moon, slowed in secret" id="moon">
          <p>
            In 1972 John Young jumped on the Moon in front of a television camera. We took that broadcast, slowed a copy by half again, and told no one. Then we asked Meta&rsquo;s Muse Spark, five separate times, whether the copy plays at real speed.
          </p>
        </Section>
        <Note who="Muse Spark 1.3, by eye">Shown the slowed copy alone, five times with the same question, it answered &ldquo;real speed&rdquo; {sparkWrongB} of 5 times.</Note>
        <p className={styles.para}>
          A model that watches can be fooled by a clip that looks right. Measuring is harder to fool: SAM 3.1 found the astronaut in every frame of both clips, and code compared the jumps one by one.
        </p>
        <Note who="SAM 3.1, then code">Each jump timed in both clips from the helmet&rsquo;s path; the ratio of every matching pair, combined.</Note>
      </Page>

      {moon && hl.jumpForJump && (
        <Plate n="II" title="The broadcast (A) and the copy slowed in secret (B), on one clock." caption="The orange line is the helmet's height in every frame, as SAM 3.1 measured it. B's jumps come out wider by the slowdown.">
          <MoonPlate
            ratio={hl.jumpForJump.ratio}
            sigma={hl.jumpForJump.sigma}
            truth={st?.truth ?? 1.5}
            sparkWrong={sparkWrongB}
            sparkN={rp?.n ?? 5}
            g={moonG ? { v: moonG.measured, s: moonG.sigma, ref: moonG.reference } : undefined}
          />
        </Plate>
      )}

      <Page>
        <Section n={2} title="How a law wins" id="method">
          <p>
            Ansatz doesn&rsquo;t ask a model for the answer. It asks models to look, measure and guess, and lets the data decide. Under each step, what it produced on the spring in Plate I.
          </p>
        </Section>
        <ol className={styles.steps}>
          <li>
            <h3>Watch and listen</h3>
            <p>Muse Voice Transcribe hears what was said while filming, in any of seven languages. Muse Spark watches the clip at its own frame rate and names what moves, when, what is known, and whether the clip is slowed down.</p>
            {spec && <blockquote className={styles.specimen}>&ldquo;{spec.observation.what_happens.split(". ")[0]}.&rdquo;</blockquote>}
          </li>
          <li>
            <h3>Measure every frame</h3>
            <p>SAM 3.1 follows the object through every frame. Each mask becomes a sub-pixel position, timed by the video file&rsquo;s own clock and scaled by a ruler in view.</p>
            {spec && <p className={styles.specimen}>{spec.measured.px.length} positions over {spec.measured.series.t.at(-1)?.toFixed(1)} s, scaled by {spec.measured.calibration.note}.</p>}
          </li>
          <li>
            <h3>Propose laws</h3>
            <p>Muse Spark writes two to four candidate laws as equations of motion, in a small equation language Ansatz compiles itself. Textbook laws compete too.</p>
            {specMuse.length > 0 && (
              <div className={styles.specimen}>
                {specMuse.map((c) => (
                  <div key={c.law.id} className={styles.law}>
                    <Tex>{lawLatex(c.law).at(-1) ?? ""}</Tex>
                  </div>
                ))}
              </div>
            )}
          </li>
          <li>
            <h3>Predict what was never seen</h3>
            <p>Code integrates every law, fits it to the first 70% of the motion, and makes it predict the last 30%, which no law was fitted to. The law that misses the unseen frames least wins, and every measured number comes from its fit.</p>
            {sparkBest && <p className={styles.specimen}>Muse Spark&rsquo;s best law missed the unseen motion by {(sparkBest.fit.testRms * 1000).toFixed(1)} mm.</p>}
          </li>
          <li>
            <h3>Referee, and revise</h3>
            <p>Muse Spark reads the scoreboard and the residuals on the fitted frames. When every law misses, Muse Wonder works as an agent with a fitting tool, tries laws on the seen frames, and submits one, which has to win the same way.</p>
            {spec?.wonder && wonderLaw && (
              <div className={styles.specimen}>
                <ol className={styles.tries}>
                  {spec.wonder.attempts.map((a) => (
                    <li key={a.title} className={spec.wonder?.submitted?.startsWith(a.title) ? styles.pick : undefined}>
                      {a.title}
                    </li>
                  ))}
                </ol>
                <p>
                  Submitted law missed the unseen motion by {(wonderLaw.fit.testRms * 1000).toFixed(1)} mm{k3 ? `; its stiffening k₃/m came out ${k3.measured.toFixed(0)} ± ${(k3.sigma ?? 0).toFixed(0)} against a true ${k3.truth}` : ""}.
                </p>
              </div>
            )}
          </li>
        </ol>
        <Note who="Who did what">SAM 3.1 measured. Muse Spark watched, proposed and refereed. Muse Wonder proposed when every law missed. Code fitted, predicted and ranked; no model picks the winner.</Note>
      </Page>

      <Plate n="III" title="Every experiment in this book." caption="Each print is a clip's frames laid over one another, as Marey photographed motion. Open one for its laws, its numbers and every model call it made.">
        <ul className={styles.catalogue}>
          {catalogue.map((e, i) => {
            const w = winnerOf(e);
            const tex = lawLatex(w.law);
            return (
              <li key={e.id}>
                <Link href={`/x/${e.id}`} className={styles.specimenLink}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/prints/${e.id}.webp`} alt="" className={styles.print} loading="lazy" />
                  <span className={styles.fig}>Fig. {String.fromCharCode(97 + i)}</span>
                  <span className={styles.ctitle}>{e.title}</span>
                  <span className={styles.ceq}>
                    <Tex>{tex[tex.length > 1 ? 1 : 0] ?? ""}</Tex>
                  </span>
                  <span className={styles.cfind}>{e.headline ?? e.finding}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Plate>

      <Page>
        <Section n={3} title="Who it is for" id="who">
          <p>
            <b>A student with a phone.</b> The pendulum, free-fall and projectile practicals need a stopwatch you can&rsquo;t start fast enough. Film the swing, say the string&rsquo;s length in your own language, and get g, the law, the error against the textbook and a lab report to hand in. Film four lengths and the <Link href="/series/pendulum-lengths">slope of L against T²</Link> gives g, as the practical asks.
          </p>
          <p className={styles.para}>
            <b>A teacher with forty students.</b> One clip of a throw becomes a lesson in method: three laws on the board, each predicting what happens next, and the class watching which one the data keeps. A <Link href="/class/new">class link</Link> gives the class its own runs for a week and one page with every result (<Link href="/class/demo23">a demo class</Link>).
          </p>
          <p className={styles.para}>
            <b>Anyone who needs a number from a video.</b> A coach timing a jump, a maker measuring drag, a researcher who used to click through footage frame by frame. Every constant comes with its error bar, and what was given is kept apart from what was measured.
          </p>
          <p className={styles.para}>
            <b>Anyone asking whether a clip runs at real time.</b> Gravity is a clock. With something of known size in view, a fall or a swing says how fast the footage really runs.
          </p>
        </Section>
        <Note who="Cost, measured">A run costs {costText(hl)} and takes {timeText(hl)}.</Note>

        <Section n={4} title="Why predict, and not only fit" id="why">
          <p>Any law with enough knobs can fit a curve it has already seen. A law earns trust by predicting what it hasn&rsquo;t, so every candidate sees only the start of the motion and is graded on the rest.</p>
          <dl className={styles.rules}>
            <dt>The model proposes; the data decides.</dt>
            <dd>Laws are compiled into a small, safe equation language and integrated numerically. A law that can&rsquo;t be integrated, or names a symbol it never defined, is rejected before it runs.</dd>
            <dt>Simpler wins ties.</dt>
            <dd>When two laws predict the unseen frames equally well, within the measurement&rsquo;s own noise, the one with fewer parameters wins.</dd>
            <dt>Given is kept apart from measured.</dt>
            <dd>Every report lists what was assumed (a ruler, a stated length, Earth&rsquo;s gravity) separately from what was measured, with an uncertainty on every number.</dd>
            <dt>The clock is checked.</dt>
            <dd>Frame times come from the video file itself. If gravity comes out wrong by a square, Ansatz says the clip is probably slow motion.</dd>
          </dl>
        </Section>

        {recent.length > 0 && (
          <Section n={5} title="Run by visitors" id="recent">
            <ul className={styles.recent}>
              {recent.map((r) => (
                <li key={r.id}>
                  <Link href={`/x/${r.id}`}>{r.title}</Link>
                  <span>{r.headline}</span>
                  <span className="small">{new Date(r.createdAt).toUTCString().slice(5, 22)} UTC</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </Page>

      <Plate n={recent.length > 0 ? "IV" : "IV"} title="A physics lab in every pocket." wide>
        <div className={styles.close}>
          <p>
            Motion experiments need a light gate, a ticker timer and a lab most schools don&rsquo;t have. Ansatz needs a phone propped on some books. Film a ball, say what you know, and get back the law, the constants, and how far you are from the textbook.
          </p>
          <div className={styles.cta}>
            <Link href="/new" className="btn">
              Run an experiment
            </Link>
            <Link href="/proof" className="btn ghost">
              See the benchmark
            </Link>
          </div>
        </div>
      </Plate>
    </>
  );
}

import Link from "next/link";
import Tex from "@/components/Tex";
import Plate, { Note, Page, Section } from "@/components/book/Plate";
import FalsifyPlate from "@/components/book/FalsifyPlate";
import MoonPlate from "@/components/book/MoonPlate";
import Footage from "@/components/book/Footage";
import CanYouTell from "@/components/book/CanYouTell";
import { getExperiment, recentExperiments, showcaseIds, winnerOf } from "@/lib/experiments";
import { lawTex } from "./x/lawTex";
import { printOf } from "./x/prints";
import { offlineText, runTime, runTimeText } from "./runtime";
import { plateLaws } from "@/lib/plateLaws";
import { costText, headline } from "@/lib/headline";
import { canYouTell, quizSaid } from "./cyt";
import { strangersTally, strangersWord } from "./proof/strangers";
import { fou5Long, fou5Of, fou5SameFilmLawFree, fou5Short } from "@/lib/fou5";
import { isRoughFit } from "@/lib/experiment";
import { fmtAbout, fmtNoise } from "@/lib/format";
import { sealedCaption } from "./sealedWords";
import { sealedTest } from "./sealed";
import { datedPipeline } from "./pipelineWords";
import { firstScreen } from "./firstScreen";
import BuiltBy from "@/components/book/BuiltBy";
import type { Experiment } from "@/lib/experiment";
import styles from "./home.module.css";

// cached and rebuilt at most once every ten minutes: it reads shipped runs, plus the visitors' latest runs from storage (force-static keeps
// that uncached storage read from turning the page back into a per-request render)
export const dynamic = "force-static";
export const revalidate = 600;

const HERO = "hardening-spring";

/** Small counts in words, as the hook says them ("five times out of five"). */
const WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const inWords = (n: number) => WORDS[n] ?? String(n);

/**
 * The gallery's caption for a run whose stored headline is the referee's own wording, which is written before the
 * truth is known (the sealed laws), or says less than the run measured. Figures are read from the record.
 */
function cardCaption(e: Experiment): string {
  const w = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  const g = e.comparisons.find((c) => c.param === "g");
  if (e.id === "aachen-pendulum-50cm" && g)
    return `A stranger’s teaching-workshop film, told only “about 50 cm”: g = ${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s², ${Math.abs(g.errorPct).toFixed(2)}% from Earth’s.`;
  if (e.id === "aachen-pendulum-60cm" && g)
    return isRoughFit(w.fit)
      ? `The same workshop’s 60 cm pendulum: g about ${fmtAbout(g.measured)} m/s², no error bar (the law misses the unseen swing by ${fmtNoise(w.fit.testZ)}× the noise); the clock check reads real time, which is right.`
      : `The same workshop’s 60 cm pendulum: g = ${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s²; the clock check reads real time.`;
  // the two lite runs where a spoken length set the scale (synthetic voices): who heard it, what code held, and g, from the record
  if (e.id.startsWith("voice-lite-") && g) {
    const langName = /hindi/.test(e.id) ? "Hindi" : /english/.test(e.id) ? "English" : "its own language";
    const len = (e as Experiment & { given?: string[] }).given?.find((t) => /length = /.test(t))?.match(/= ([\d.]+ ?c?m)/)?.[1]?.replace(/(\d)(c?m)$/, "$1 $2");
    const renderG = /^Rendered\b/.test(e.source.credit ?? "") ? Number(e.source.credit?.match(/g = ([\d.]+) m\/s²/)?.[1]) : NaN;
    const ref = Number.isFinite(renderG) ? renderG : g.reference;
    const off = Math.abs((g.measured / ref - 1) * 100);
    return isRoughFit(w.fit)
      ? `Muse Voice Transcribe heard the length in ${langName} (a synthetic voice); code held ${len ?? "it"} as given: g about ${g.measured.toFixed(1)} m/s², no error bar (the law misses the unseen frames by ${fmtNoise(w.fit.testZ)}× the noise).`
      : `The length said in ${langName} (a synthetic voice), heard by Muse Voice Transcribe, set the scale${len ? ` at ${len}` : ""}: g = ${g.measured.toFixed(3)} ± ${g.sigma.toFixed(3)} m/s²${Number.isFinite(renderG) ? ` on a render, ${off.toFixed(2)}% from its ${renderG}` : `, ${off.toFixed(2)}% off`}.`;
  }
  // a sealed law: the drawn law in the words /proof uses (app/sealedWords.ts), found or missed, from the record
  const sealed = sealedCaption(e);
  if (sealed) return sealed;
  return e.headline ?? e.finding;
}

/** The first sentence of a later re-run's note, where the published run has one. */
const rerunOf = (e: Experiment) => {
  const r = (e as Experiment & { rerun?: { note: string; pipeline?: string } }).rerun;
  return r ? datedPipeline(r.note, r.pipeline).split(/(?<=\.)\s/)[0] : undefined;
};

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
  const fou5 = exps.find((e) => e.id === "foucault-pendulum-5x");
  const fou5Row = fou5?.extras?.truth?.rows.find((r) => r.param === "speedup");
  const fou5x = fou5Of(fou5, exps.find((e) => e.id === "foucault-pendulum"));
  // the first single asks about each Moon clip, before the five repeats (the hook counts the repeats)
  const single = st?.single ?? [];
  const aachenG = exps.find((e) => e.id === "aachen-pendulum-50cm")?.comparisons.find((c) => c.param === "g");
  const recent = await recentExperiments().catch(() => []);
  const spec = hero;
  const specMuse = spec?.candidates.filter((c) => c.origin === "muse").slice(0, 2) ?? [];
  const sparkBest = spec?.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0];
  const wonderLaw = spec?.candidates.find((c) => c.origin === "revision");
  const k3 = spec?.extras?.truth?.rows.find((r) => r.param === "beta");
  const catalogue = exps.filter((e) => e.id !== "moon-jump-slowed");
  const slowedCopy = exps.find((e) => e.id === "moon-jump-slowed");
  const rt = runTime(exps);
  const cyt = await canYouTell().catch(() => null);
  const fou5Quiz = quizSaid("foucault-pendulum-5x");
  const singleA = single.find((s) => s.clip === "A"), singleB = single.find((s) => s.clip === "B");
  const sealed = await sealedTest().catch(() => null);
  const fs = await firstScreen();

  return (
    <>
      <header className={styles.title}>
        {/* the first screen: what it does in one line, three results with their truths, the blind test and the sealed laws */}
        <div className={styles.top}>
          <h1 className={styles.topLine}>
            Film anything that moves. Ansatz finds the law that moves it, <span>and tests the law on frames it was never fitted to.</span>
          </h1>
          {fs.tiles.length > 0 && (
            <ul className={styles.tiles} aria-label="Three results, each with the true value">
              {fs.tiles.map((t) => (
                <li key={t.key}>
                  <Link href={t.href} className={styles.tile}>
                    <span className={styles.tileK}>{t.kicker}</span>
                    <span className={styles.tileV}>
                      {t.value}
                      {t.pm && <span className={styles.tilePm}> ± {t.pm}</span>}
                      {t.unit && <span className={styles.tileU}>{t.unit === "×" ? "×" : ` ${t.unit}`}</span>}
                    </span>
                    <span className={styles.tileW}>{t.what}</span>
                    <span className={styles.tileB}>{t.brief}</span>
                    <span className={styles.tileSide}>
                      <span className={styles.tileT}>
                        <b>Truth</b> {t.truth}
                      </span>
                      {t.extra && <span className={styles.tileX}>{t.extra}</span>}
                      <span className={styles.tileGo}>{t.go} →</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className={styles.topAct}>
            <a href="#cyt-quiz" className="btn">
              Try the blind test ↓
            </a>
            <div className={styles.topNotes}>
              {fs.sealed && (
                <p className={styles.sealLine}>
                  <b>Laws nobody chose.</b> {fs.sealed.short} <Link href="/proof#sealed">Every draw</Link>
                </p>
              )}
              <p className={styles.sealLine}>
                <b>For teachers:</b> <Link href="/lab">/lab maps the Class 11 practicals to runs</Link>
              </p>
            </div>
          </div>
        </div>
        <div className={styles.titleIn}>
          <div className={styles.lead}>
            {hl.jumpForJump && clipB && (
              <p className={styles.hook}>
                Shown the slowed Apollo 16 copy on its own, Muse Spark called it real speed {inWords(sparkWrongB)} times out of {inWords(rp?.n ?? 5)}.<a href="#five-of-five" className={styles.fnRef} aria-label="How the five are counted">*</a> Timing it jump for jump against the broadcast, Ansatz measured {hl.jumpForJump.ratio.toFixed(3)} ± {hl.jumpForJump.sigma.toFixed(3)}× slower; the truth was {st?.truth ?? 1.5}×.
              </p>
            )}
          </div>
          {moon && slowedCopy && (
            <figure className={`${styles.footage} ${styles.footSheet}`}>
              <p className={styles.pairQ}>One of these is slowed. Which?</p>
              <div className={styles.clipsWrap}>
                <Footage
                  className={styles.clips}
                  clipClassName={styles.clip}
                  labelClassName={styles.clipLabel}
                  clips={[
                    { src: moon.source.video, label: "A" },
                    { src: slowedCopy.source.video, label: "B" },
                  ]}
                />
                {clipB && (
                  <p className={styles.stamp}>
                    <span className={styles.stampWho}>Muse Spark on the slowed copy, by eye</span>
                    &ldquo;Real speed&rdquo; {sparkWrongB} of {rp?.n ?? 5}
                  </p>
                )}
              </div>
              <figcaption>
                Apollo 16, 1972 (NASA), in its original colour. One is the broadcast; the other we slowed {st?.truth ?? 1.5}× and told no one. Ansatz timed each jump in one against the same jump in the other. <a href="#moon">Which is which, and how</a>.
                {single.length > 0 && (
                  <span id="five-of-five" className={styles.fn}>
                    {" "}* The {inWords(rp?.n ?? 5)} of {inWords(rp?.n ?? 5)} counts the {inWords(rp?.n ?? 5)} repeats of the same question. Asked once before those {inWords(rp?.n ?? 5)}, in a separate call, it called {singleA && singleB && singleA.factor === singleB.factor ? `both clips slowed ${singleB.factor}×` : `the slowed copy slowed ${singleB?.factor ?? 2}× and the broadcast slowed ${singleA?.factor ?? 2}×`}: by eye it could not tell them apart either way.
                  </span>
                )}
              </figcaption>
            </figure>
          )}
          <div className={styles.abstract}>
            <p>
              A video clip becomes a physics experiment, one object at a time. SAM 3.1 measures that object frame by frame. Muse Spark writes candidate laws of motion. Each law is fitted to the start of the motion only and has to predict the rest. Laws the future refutes are struck out; the one that predicts survives.
            </p>
            <p className={styles.who}>
              For students, teachers and anyone with a phone. <a href="#who">Who it is for</a>.
            </p>
            <div className={styles.cta}>
              <Link href="/new" className="btn">
                Run an experiment
              </Link>
              <Link href="/judges" className="btn ghost">
                For judges: the case in one page
              </Link>
              <a href="#cyt-quiz" className="btn ghost">
                Try the blind test
              </a>
            </div>
          </div>
        </div>
        {hl.moonClock && fou5Row && (
          <p className={styles.clockLine}>
            <b>Gravity is a clock.</b> One known length turns gravity into a clock: if g comes out wrong by a square, the footage is not playing at life speed. On a museum film its maker sped up {+fou5Row.truth.toPrecision(3)}×, Ansatz read <Link href="/x/foucault-pendulum-5x">{fou5x ? fou5Short(fou5x) : `${fou5Row.measured.toFixed(2)}×`} faster</Link>.
          </p>
        )}
      </header>

      <Page>
        <Section n={1} title="The Moon, slowed in secret" id="moon">
          <p>
            In 1972 John Young jumped on the Moon in front of a television camera. We took that broadcast, made a copy that plays 1.5 times slower, and told no one. Then we asked Meta&rsquo;s Muse Spark, five separate times, whether the copy plays at real speed.
          </p>
        </Section>
        <Note who="Muse Spark 1.3, by eye">Shown the slowed copy alone, five times with the same question, it answered &ldquo;real speed&rdquo; {sparkWrongB} of 5 times.</Note>
        <p className={styles.para}>
          A model that watches can be fooled by a clip that looks right. Measuring is harder to fool: SAM 3.1 found the astronaut in every frame of both clips, and code compared the jumps one by one.
        </p>
        <Note who="SAM 3.1, then code">Each jump timed in both clips from the helmet&rsquo;s path, in jump windows we set by hand; the ratio of every matching pair, combined.</Note>
      </Page>

      {moon && hl.jumpForJump && (
        <Plate n="I" title="The broadcast (A) and the copy slowed in secret (B), on one clock." caption="The orange line is the helmet's height in every frame, as SAM 3.1 measured it. B's jumps come out wider by the slowdown.">
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

      {cyt && (
        <Plate id="can-you-tell" className={styles.cytPlate} caption="Six real clips, each cut to a few seconds without retiming a frame. Every answer is read from stored runs, and loads only when you ask for it; nothing here calls a model.">
          <div className={styles.cytHead}>
            <p className={styles.cytBridge}>This is one thing a law can tell. The rest of the page is how Ansatz finds the law.</p>
            <h2 className={styles.cytH} id="cyt-quiz">
              Can you tell?
            </h2>
            <p>Real time, slowed or sped up? Say it for each clip, then see what Muse Spark answered to the same question, {inWords(cyt.pub.n)} times a clip, and what Ansatz measured.</p>
            <details className={styles.cytFair}>
              <summary>How this test is fair</summary>
              <p>
                Muse Spark was shown the same six files, each on its own{cyt.answers.parityMedium ? "" : ", at low reasoning effort"}: &ldquo;{cyt.pub.question}&rdquo; Two pairs of clips come from the same film; you see them together, so you have an edge.{cyt.answers.parity ? ` Ansatz’s runs of ${inWords(cyt.answers.parity.asked)} of the clips were told a length this page does not give; Muse Spark was asked again with those lengths${cyt.answers.parityMedium ? "." : ", and both of its scores are shown with the answers."}` : ""}{cyt.answers.parityMedium ? ` Those two asks were at low reasoning effort, and Ansatz’s own observer runs at medium, so the baseline was re-asked at medium effort, on all six clips with the same lengths and footage Ansatz’s runs had. All ${inWords(cyt.answers.sets.length)} of its scores are shown with the answers.` : ""}
              </p>
            </details>
          </div>
          <CanYouTell data={cyt.pub} />
        </Plate>
      )}

      <Page>
        {hl.moonClock && fou5Row && (
          <p className={styles.after}>
            Gravity as a clock, worked twice, with no original to compare. From gravity alone against the Moon&rsquo;s known gravity, Ansatz read {hl.moonClock.factor.toFixed(2)} ± {hl.moonClock.sigma.toFixed(2)}× slower on the Apollo copy we slowed {st?.truth ?? 1.5}×. On footage nobody made for us, a museum&rsquo;s Foucault pendulum filmed by Zátonyi Sándor (ifj.) of FizFilm (CC BY 4.0), with a stretch he sped up {+fou5Row.truth.toPrecision(3)}× and labelled on screen (we cropped the label out), it read {fou5x ? fou5Long(fou5x) : `${fou5Row.measured.toFixed(2)}× faster than life`}
            {fou5x && fou5SameFilmLawFree(fou5x) ? `, and, against the same film’s real-time stretch with no reference value at all, ${fou5SameFilmLawFree(fou5x)}` : ""}. During that run Muse Spark described the swing as playing at real time{fou5Quiz ? `; ${fou5Quiz.said}` : ""}. <Link href="/x/foucault-pendulum-5x">Open the run</Link>.
          </p>
        )}
        {fou5Row && <Note who="code">Gravity came out 25 times too strong: 5 times too fast, since gravity scales with the square of time.</Note>}
        {aachenG && (
          <p className={styles.para}>
            Then {strangersWord(strangersTally().n)} clips strangers filmed and published. A 50 cm pendulum on black, filmed in Aachen: told only &ldquo;the string is about fifty centimetres long&rdquo;, Ansatz measured g = {aachenG.measured.toFixed(2)} ± {aachenG.sigma.toFixed(2)} m/s² against 9.81 (<Link href="/x/aachen-pendulum-50cm">open the run</Link>). All {strangersWord(strangersTally().n)}, misses included, are in <Link href="/proof#strangers">one table</Link>: {strangersTally().text.replace(/^\S+ clips strangers filmed: /, "")}.
          </p>
        )}
        <Section n={2} title="How a law wins" id="method">
          <p>
            Ansatz doesn&rsquo;t ask a model for the answer. It asks models to look, measure and guess, and lets the data decide. Plate II is a run you can test yourself; under each step below, what it produced on that spring.
          </p>
        </Section>
      </Page>

      {hero && (
        <Plate
          n="II"
          title={
            <>
              A spring that stiffens as it stretches. Drag the line: every law sees only the motion to its left and must predict the rest.
            </>
          }
          caption={
            <>
              On this published run, Muse Spark&rsquo;s laws were refuted by the future and Muse Wonder&rsquo;s held (on a later re-run with an updated prompt, Muse Spark proposed the cubic law itself). Each position of the line is a full refit by the same code a run uses. <Link href={`/x/${hero.id}`}>Open this experiment</Link>.
            </>
          }
        >
          <FalsifyPlate id={hero.id} video={hero.source.video} t0={hero.measured.window.t0} laws={plateLaws(hero)} />
        </Plate>
      )}

      <Page>
        <ol className={styles.steps}>
          <li>
            <h3>Watch and listen</h3>
            <p>Muse Voice Transcribe hears what was said while filming, in seven languages, tested on synthetic speech; in lite mode a length said aloud sets the scale (two published lite runs, synthetic voices: <Link href="/x/voice-lite-aachen-50cm-hindi">Hindi</Link>, <Link href="/x/voice-lite-pendulum-40cm-english">English</Link>). Muse Spark watches the whole clip at its own frame rate, up to 300 frames, only to say what to track and when, which world it is on and how long the ruler in view is (both listed as given, not measured). The call that writes the laws never sees the video: it gets that description in words and the measurements of the first 70% only, and code fits every constant on the first 70% alone, so the last 30% stays a true test.</p>
            {spec && <blockquote className={styles.specimen}>&ldquo;{spec.observation.what_happens.split(". ")[0]}.&rdquo;</blockquote>}
          </li>
          <li>
            <h3>Measure every frame</h3>
            <p>SAM 3.1 follows the object through every frame of the motion, up to 450 (a longer clip keeps one frame in a few). Each mask becomes a sub-pixel position, timed by the video file&rsquo;s own clock and scaled by a ruler in view.</p>
            {spec && <p className={styles.specimen}>{spec.measured.px.length} positions over {spec.measured.series.t.at(-1)?.toFixed(1)} s, scaled by {spec.measured.calibration.note}.</p>}
          </li>
          <li>
            <h3>Propose laws</h3>
            <p>Muse Spark writes two to four candidate laws as equations of motion, in a small equation language Ansatz compiles itself. Textbook laws compete too.</p>
            {specMuse.length > 0 && (
              <div className={styles.specimen}>
                {specMuse.map((c) => (
                  <div key={c.law.id} className={styles.law}>
                    <Tex>{lawTex(c.law).at(-1) ?? ""}</Tex>
                  </div>
                ))}
              </div>
            )}
          </li>
          <li>
            <h3>Predict the part no law was fitted to</h3>
            <p>Code integrates every law, fits it to the first 70% of the motion, and makes it predict the last 30%, which no law was fitted to. The law that misses the unseen frames least wins; within the noise, the simpler law wins. Every measured number comes from the winner&rsquo;s fit.</p>
            {sparkBest && <p className={styles.specimen}>Muse Spark&rsquo;s best law missed the unseen motion by {(sparkBest.fit.testRms * 1000).toFixed(1)} mm.</p>}
          </li>
          <li>
            <h3>Referee, and revise</h3>
            <p>Muse Spark reads the scoreboard and the residuals on the fitted frames. When every law misses, Muse Wonder works as an agent with two tools on the seen frames (fit_law, residual_spectrum), tries laws, and submits one, which has to win the same way; code also proposes laws built from the models&rsquo; terms. On this published run it found the cubic stiffening; on a <Link href="/x/dry-friction-spring">spring slowed by dry friction</Link>, re-run on the benchmarked pipeline (2026-10-27c), the two hand off: Muse Spark&rsquo;s laws used air drag, Muse Spark as referee named dry friction from their residual plot, and Muse Wonder turned it into a law that wins.</p>
            {spec?.wonder && wonderLaw && (
              <div className={styles.specimen}>
                <ol className={styles.tries}>
                  {spec.wonder.attempts.map((a) => (
                    <li key={a.title} className={spec.wonder?.submitted?.startsWith(a.title) ? styles.pick : undefined}>
                      {a.title}
                    </li>
                  ))}
                </ol>
                <p>Four tries on this run, made with an earlier setting; production allows two.</p>
                <p>
                  Submitted law missed the unseen motion by {(wonderLaw.fit.testRms * 1000).toFixed(1)} mm{k3 ? `; its stiffening k₃/m came out ${k3.measured.toFixed(0)} ± ${(k3.sigma ?? 0).toFixed(0)} against a true ${k3.truth}` : ""}.
                </p>
              </div>
            )}
          </li>
        </ol>
        <Note who="Who did what">SAM 3.1 measured. Muse Spark watched, proposed and refereed. Muse Wonder proposed when every law missed. Code fitted, predicted and ranked; no model picks the winner.</Note>
        {sealed && (
          <p className={styles.para}>
            <b>Laws nobody chose.</b> Public randomness (drand) drew {inWords(sealed.n)} spring laws for the gallery below, each hash pushed to GitHub before its clip was rendered, and Ansatz was told only &ldquo;{sealed.narration}&rdquo;. {sealed.foundText}; {sealed.title}. Every draw, the rule for &ldquo;found&rdquo; and what the seal does not prove: <Link href="/proof#sealed">Proof, laws nobody chose</Link>.
          </p>
        )}
      </Page>

      <Plate n="III" title="Every experiment in this book." caption="Each print is a clip's frames laid over one another, as Marey photographed motion. Open one for its laws, its numbers and every model call it made.">
        <ul className={styles.catalogue}>
          {catalogue.map((e, i) => {
            const w = winnerOf(e);
            const tex = lawTex(w.law);
            return (
              <li key={e.id}>
                <Link href={`/x/${e.id}`} className={styles.specimenLink}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={printOf(e.id)} alt="" className={styles.print} loading="lazy" />
                  <span className={styles.fig}>Fig. {String.fromCharCode(97 + i)}</span>
                  <span className={styles.ctitle}>{e.title}</span>
                  <span className={styles.ceq}>
                    <Tex>{tex[tex.length > 1 ? 1 : 0] ?? ""}</Tex>
                  </span>
                  <span className={styles.cfind}>{cardCaption(e)}</span>
                  {/* the card shows the published run; a later re-run that changed the story says so under it */}
                  {rerunOf(e) && <span className="small">{rerunOf(e)}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </Plate>

      <Page>
        <Section n={3} title="Who it is for" id="who">
          <p>
            <b>A student with a phone.</b> The pendulum practical (and, in part, the projectile and spring ones) needs a stopwatch you can&rsquo;t start fast enough. Film the swing, say the string&rsquo;s length in your own language, and get g, the law, the error against the textbook and a lab report to hand in. Film four lengths and the <Link href="/series/pendulum-lengths">slope of L against T²</Link> gives g, as the practical asks.
          </p>
          <p className={styles.para}>
            <b>A teacher with forty students.</b> One clip of a throw becomes a lesson in method: three laws on the board, each predicting what happens next, and the class watching which one the data keeps. A <Link href="/class/new">class link</Link> gives the class its own runs for a week and one page with every result (<Link href="/class/demo23">a demo class</Link>, filled with our rendered clips, not real students).{" "}For tomorrow&rsquo;s class: <Link href="/lab">the Class XI motion practicals mapped to runs, with a worksheet in English and Hindi and a 40-minute lesson</Link>.
          </p>
          <p className={styles.para}>
            <b>Anyone who needs a number from a video.</b> A coach timing a jump, a maker measuring drag, a researcher who used to click through footage frame by frame. Every constant comes with its error bar, and what was given is kept apart from what was measured.
          </p>
          <p className={styles.para}>
            <b>Anyone asking whether a clip runs at real time.</b> Gravity is a clock. With something of known size in view, a fall or a swing says how fast the footage really runs.
          </p>
        </Section>
        <Note who="Cost, measured">A run costs {costText(hl)} and takes {runTimeText(rt)}. {offlineText(exps)}</Note>

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
            <dd>Frame times come from the video file itself. With a ruler it can trust, a gravity wrong by a square says the clip runs slower or faster than life. But a ruler read wrong and a slowed clock look alike. With no ruler and no stated length, the clock cannot be checked at all.</dd>
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
            Motion experiments need a light gate, a ticker timer and a lab most schools don&rsquo;t have. Ansatz is built for a phone propped on some books. Film a ball, say what you know, and get back the law, the constants, and how far you are from the textbook.{exps.some((e) => e.source.phone) ? "" : " The clips in this book so far were rendered by us or found online; none was filmed on a phone yet."}
          </p>
          <div className={styles.cta}>
            <Link href="/new" className="btn">
              Run an experiment
            </Link>
            <Link href="/proof" className="btn ghost">
              See the benchmark
            </Link>
          </div>
          <BuiltBy className={styles.builtBy} />
        </div>
      </Plate>
    </>
  );
}

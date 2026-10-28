import type { Metadata } from "next";
import Link from "next/link";
import Tex from "@/components/Tex";
import Plate, { Note, Page, Reading, Section } from "@/components/book/Plate";
import FalsifyPlate from "@/components/book/FalsifyPlate";
import { getExperiment } from "@/lib/experiments";
import { lawLatex } from "@/lib/latex";
import { plateLaws } from "@/lib/plateLaws";
import styles from "./how.module.css";

export const metadata: Metadata = {
  title: "How it works",
  description: "How Ansatz turns a phone clip into a tested law of motion: four Meta models, a clock read from the file, a safe equation language, and a prediction test.",
};

// reads only the runs and benchmark files that ship with the site: cached, rebuilt at most every 5 minutes
export const revalidate = 300;

const STEPS = [
  { id: "clip", title: "The clip and its clock" },
  { id: "watch", title: "Watch and listen" },
  { id: "measure", title: "Measure every frame" },
  { id: "propose", title: "Propose laws" },
  { id: "fit", title: "Fit, then predict what was never seen" },
  { id: "referee", title: "Referee, and a theorist with a tool" },
  { id: "clock-check", title: "The clock check" },
];

export default async function HowPage() {
  // every step is shown with what it produced on one real run: John Young's jump on the Moon
  const moon = await getExperiment("moon-jump").catch(() => null);
  const mt = moon?.extras?.memoryTest;
  const ok = moon?.candidates.filter((c) => c.fit.ok).slice(0, 4) ?? [];
  const maxMiss = Math.max(1e-6, ...ok.map((c) => c.fit.testRms));
  const cm = (v: number) => (v < 0.1 ? `${(v * 1000).toFixed(1)} mm` : `${(v * 100).toFixed(1)} cm`);
  const muse = moon?.candidates.filter((c) => c.origin === "muse").slice(0, 3) ?? [];

  return (
    <article>
      <header className={styles.title}>
        <h1>How it works</h1>
        <div className={styles.abstract}>
          <p>
            An <em>ansatz</em> is a physicist&rsquo;s educated guess at the form of a law, made before the data decides. Ansatz automates the whole loop: look, measure, guess, test, and say honestly what was given and what was found. Under each step, what it produced on one real run: <Link href="/x/moon-jump">John Young&rsquo;s jump on the Moon</Link>.
          </p>
          <nav className={styles.toc} aria-label="The seven steps">
            <ol>
              {STEPS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </header>

      <Page>
        <Section n={1} title="The method, in seven steps" id="method">
          <p>
            Four Meta models and some careful code, in a fixed order. The models look, listen, measure and guess; code fits, predicts and ranks. In the margin, who does each step.
          </p>
        </Section>

        <Step n={1} id="clip" title="The clip and its clock" />
        <Note who="code: ffmpeg, the MP4 sample table">No model in this step. It hands every later step a frame and the true time it was taken.</Note>
        <div className={styles.body}>
          <p>
            Every clip is re-encoded once to H.264 at most 1280 pixels wide, keeping every original frame and its timestamp. Phones record at variable frame rates, so &ldquo;frame <Tex>{"i"}</Tex> happened at <Tex>{"i/30"}</Tex> s&rdquo; can be off by whole frames. Ansatz reads each frame&rsquo;s presentation time from the file&rsquo;s own sample table (<code>stts</code> and <code>ctts</code>). The soundtrack is split off as 16 kHz WAV for Muse Voice Transcribe.
          </p>
          {moon && (
            <figure className={styles.specimen}>
              <figcaption className={styles.specLab}>On the Moon run</figcaption>
              <div className={styles.specRow}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/how/moon-frame.webp" alt="One frame of the Apollo 16 broadcast: John Young mid-jump beside the flag" className={styles.frame} width={352} height={240} />
                <div>
                  <Reading value={moon.video.frames} unit="frames" />
                  <p className={styles.specText}>
                    over {moon.video.duration.toFixed(2)} s at {moon.video.fps.toFixed(2)} fps, each with its own time from the file; {moon.measured.px.length} of them are the jump that was measured
                  </p>
                </div>
              </div>
            </figure>
          )}
        </div>

        <Step n={2} id="watch" title="Watch and listen" />
        <Note who="Muse Spark 1.3, Muse Voice Transcribe">Voice Transcribe turns what was said into text. Muse Spark returns the observation as JSON, under a schema.</Note>
        <div className={styles.body}>
          <p>
            Muse Spark watches the whole clip, with Voice Transcribe&rsquo;s transcript of the narration alongside, and returns a structured observation: what moves, named so a segmentation model can find it; when the free motion starts and ends; whether it flies, swings, oscillates or runs along a path; any object of known size in the plane of the motion (an A4 sheet, a tennis ball, a person); facts said aloud or printed on screen; whether the clip is slowed down; and where it happens (Earth, or the Moon). Structured output constrains the decoder to a JSON schema, so every field arrives where code expects it.
          </p>
          {moon && (
            <figure className={styles.specimen}>
              <figcaption className={styles.specLab}>On the Moon run, Muse Spark wrote</figcaption>
              <blockquote className={styles.quote}>&ldquo;{moon.observation.what_happens.split(". ")[0].replace(/\.$/, "")}.&rdquo;</blockquote>
            </figure>
          )}
        </div>

        <Step n={3} id="measure" title="Measure every frame" />
        <Note who="SAM 3.1">Tracks the object step 2 named, through every frame. Code turns each mask into a position.</Note>
        <div className={styles.body}>
          <p>
            SAM 3.1 tracks the named object through every frame of the motion window (at most 450 frames per call; faster clips keep one frame in <Tex>{"k"}</Tex>, with true timestamps). Each mask is reduced to the numbers physics needs: its centroid from first moments, to a fraction of a pixel; its orientation and axes from second moments; and its true extent along those axes. On rendered clips with known positions the median centroid error is about half a pixel. For a person in flight Ansatz follows the top of the mask (the head), which a waving arm can&rsquo;t drag around.
          </p>
          <p className={styles.para}>
            The scale comes from a ruler in view (its mask&rsquo;s length), from the narration, or, for a body flying freely on Earth, from gravity itself: a parabola fitted to the fall in pixels per second squared, set equal to <Tex>{"9.81\\,\\mathrm{m/s^2}"}</Tex>. A pendulum needs no ruler: its angle is measured about a pivot found by fitting a circle to the path.
          </p>
        </div>
        <Note who="code">Centroid from first moments, axes from second moments, scale from a ruler, the narration or gravity.</Note>
      </Page>

      {moon && (
        <Plate n="I" title="Every frame of the broadcast cut to one slice through the astronaut: his two jumps draw their own arches." caption="Read left to right as time. This is the motion SAM 3.1 measured, before any law is proposed.">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/slits/moon-jump.webp" alt="Photo-finish of the Moon clip: one slice through the astronaut from each frame" className={styles.slit} width={960} height={480} />
        </Plate>
      )}

      <Page>
        <Step n={4} id="propose" title="Propose laws" />
        <Note who="Muse Spark 1.3">Writes the laws from the first 70% of the measurement. Ansatz&rsquo;s own parser compiles them; nothing is run as code.</Note>
        <div className={styles.body}>
          <p>
            Muse Spark reads a digest of the first 70% of the measurement (a table of positions, noise levels, whether the path is a circle or a line, what is given; no number from the last 30% reaches any model; the observer in step 2 watches the whole clip to describe it, but never sees a measurement) and writes two to four candidate laws as initial-value problems in a small equation language:
          </p>
          <div className={styles.eq}>
            <Tex display>{"\\begin{aligned} \\ddot{x} &= -k\\,\\dot{x}\\sqrt{\\dot{x}^2+\\dot{y}^2} \\\\ \\ddot{y} &= -g - k\\,\\dot{y}\\sqrt{\\dot{x}^2+\\dot{y}^2} \\end{aligned}"}</Tex>
          </div>
          <p>
            Each law names its state, its derivatives, its parameters with units and bounds, the measured channels it predicts, and any instantaneous events (a bounce: when <Tex>{"y = y_\\text{floor}"}</Tex>, <Tex>{"\\dot{y} \\to -e\\,\\dot{y}"}</Tex>). The language is parsed and compiled by Ansatz, never evaluated as code: a law that names a symbol it didn&rsquo;t define is rejected before it runs. Textbook laws (a vacuum projectile, a small-angle pendulum) always compete as controls.
          </p>
          {muse.length > 0 && (
            <figure className={styles.specimen}>
              <figcaption className={styles.specLab}>On the Moon run, Muse Spark proposed</figcaption>
              <ol className={styles.laws}>
                {muse.map((c) => (
                  <li key={c.law.id}>
                    <span className={styles.lawName}>{c.law.title}</span>
                    <span className={styles.lawEq}>
                      <Tex>{lawLatex(c.law).at(-1) ?? ""}</Tex>
                    </span>
                  </li>
                ))}
              </ol>
            </figure>
          )}
        </div>

        <Step n={5} id="fit" title="Fit, then predict what was never seen" />
        <Note who="code: RK4, Levenberg–Marquardt">No model in this step. Every measured number in a report comes from here.</Note>
        <div className={styles.body}>
          <p>
            Each law is integrated with fourth-order Runge&ndash;Kutta, with impact events located inside the step, and fitted by Levenberg&ndash;Marquardt from several starting points to the first 70% of the motion, residuals weighted by each channel&rsquo;s measured noise (from third differences of the track). Then it predicts the last 30%. Each law is ranked by the worse of its two misses, the seen frames and the unseen ones, in units of the noise: predicting the future is the test, but a law that can&rsquo;t describe the frames it was fitted to hasn&rsquo;t explained the motion.
          </p>
          <p className={styles.para}>
            Laws that both stay within the noise, or within 10% of each other, tie, and the one with fewer parameters wins; the order doesn&rsquo;t depend on the order the laws arrived in. A law whose fitted parameter is pressed against its bound ranks after every law that measured all of its parameters. Uncertainties come from the fit&rsquo;s covariance plus the ruler&rsquo;s own uncertainty, carried by each parameter&rsquo;s power of metres.
          </p>
          {ok.length > 0 && (
            <figure className={styles.specimen}>
              <figcaption className={styles.specLab}>On the Moon run: each law&rsquo;s miss on the frames it never saw</figcaption>
              <table className={styles.misses}>
                <tbody>
                  {ok.map((c, i) => (
                    <tr key={c.law.id}>
                      <th scope="row">{c.law.title}</th>
                      <td className={styles.barCell} aria-hidden="true">
                        <i style={{ width: `${Math.max(3, (c.fit.testRms / maxMiss) * 100)}%` }} className={i === 0 ? styles.win : undefined} />
                      </td>
                      <td className={styles.missNum}>{cm(c.fit.testRms)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className={styles.specText}>The top two both stay within the measurement noise, so they tie. Plate II lets you move the line between seen and unseen.</p>
            </figure>
          )}
        </div>
      </Page>

      {moon && (
        <Plate
          n="II"
          title="The Moon run, with the line between the past and the future in your hands."
          caption={
            <>
              Every law is refitted on the frames left of the line by the same code a run uses, and must predict the frames to its right. <Link href="/x/moon-jump">Open this experiment</Link>.
            </>
          }
        >
          <FalsifyPlate id={moon.id} video={moon.source.video} t0={moon.measured.window.t0} laws={plateLaws(moon)} />
        </Plate>
      )}

      <Page>
        <Step n={6} id="referee" title="Referee, and a theorist with a tool" />
        <Note who="Muse Spark 1.3, Muse Wonder 1.0">Spark referees from the fitted frames only. Wonder gets a fitting tool on the seen frames, and its law must win the same way.</Note>
        <div className={styles.body}>
          <p>
            Muse Spark reads the ranking, the residuals binned in time and a plot of the leading laws&rsquo; misses, all over the fitted frames (never the held-out errors, so a revision can&rsquo;t be tuned to the test). If the winner drifts in a way that points to a missing effect, or misses even the frames it was fitted to by more than six times the noise, Muse Wonder steps in as an agent with a fitting tool: it tries laws on the seen frames, reads their residuals, and submits one, which is fitted and must win the same way. The referee writes the headline and the finding, but never a number: fitted values enter the text as placeholders that code fills in, and a finding that types its own digits is replaced.
          </p>
          {moon?.critique?.why_it_won && (
            <figure className={styles.specimen}>
              <figcaption className={styles.specLab}>On the Moon run, the referee wrote</figcaption>
              <blockquote className={styles.quote}>&ldquo;{moon.critique.why_it_won}&rdquo;</blockquote>
            </figure>
          )}
        </div>

        <Step n={7} id="clock-check" title="The clock check" />
        <Note who="code">Arithmetic on the fitted gravity. It needs one length it can trust.</Note>
        <div className={styles.body}>
          <p>
            When a ruler makes gravity a measurement rather than an assumption, a result far from the planet&rsquo;s gravity says the clip&rsquo;s clock isn&rsquo;t real time. Gravity scales with the square of time, so a <Tex>{"g"}</Tex> eighteen times too weak means the clip plays about <Tex>{"\\sqrt{18} \\approx 4.2"}</Tex> times slower than life.
          </p>
          {moon && mt && (
            <figure className={styles.specimen}>
              <figcaption className={styles.specLab}>On the Moon run</figcaption>
              {mt.sameJump ? (
                <Reading value={mt.sameJump.combined.ratio.toFixed(3)} pm={`${mt.sameJump.combined.sigma.toFixed(3)}×`} unit="slow" />
              ) : (
                <Reading value={`${Math.sqrt(mt.rows[0].g / mt.rows[1].g).toFixed(2)}×`} unit="slow" />
              )}
              <p className={styles.specText}>
                The same clip slowed {moon.extras?.speedTest?.truth ?? 1.5}× in secret{mt.sameJump ? ", measured jump for jump: each fall in the copy against the same fall in the broadcast" : ""}. Gravity as played came out {mt.rows[1].g.toFixed(2)} m/s² against {mt.rows[0].g.toFixed(2)}; the square root of that ratio, {Math.sqrt(mt.rows[0].g / mt.rows[1].g).toFixed(2)}×, is the whole-run ratio.
              </p>
            </figure>
          )}
        </div>

        <Section n={2} title="Why it can be trusted" id="trust">
          <ul className={styles.list}>
            <li>The model never decides the winner, and every measured number in a report comes from the fit. The two things Muse Spark supplies, the size of the ruler it picked and which world the clip is on, are listed under &ldquo;Given, not measured&rdquo;.</li>
            <li>Every report separates what was given (a ruler, a stated length, Earth&rsquo;s gravity) from what was measured, with an uncertainty on every measured value.</li>
            <li>Every model call is listed on the experiment with its purpose, time and cost.</li>
            <li>
              The method is measured on clips with known answers and against Muse Spark guessing by eye: see <Link href="/proof">Proof</Link>.
            </li>
          </ul>
        </Section>

        <Section n={3} title="What it can’t do" id="limits">
          <ul className={styles.list}>
            <li>
              Measure what it can&rsquo;t see. We tried the most famous experiment ever filmed on the Moon, David Scott&rsquo;s hammer and feather on Apollo 15. In every surviving copy the hammer is a rod 3 to 4 pixels wide that vanishes against his white suit, and SAM 3.1 settled on the suit instead. Ansatz reported a man standing still, which is what it could measure. A dark pendulum bob against a dark chalkboard failed the same way: <Link href="/proof#fails">Proof, where it fails</Link>.
            </li>
            <li>Find a scale from nothing. Without a ruler, a stated length or a fall it can trust, lengths stay in pixels and the report says so.</li>
            <li>Tell slow motion from another planet. If gravity comes out wrong, it says both are possible and names the speed-up that would fix it.</li>
            <li>Follow motion toward the camera. Depth isn&rsquo;t measured; the motion should cross the frame.</li>
          </ul>
        </Section>

        <Section n={4} title="Film it well" id="film">
          <ol className={styles.film}>
            <li>Keep the phone still: lean it on books or a wall.</li>
            <li>Film the motion side-on, across the frame, not toward the camera.</li>
            <li>Put something of known size in the same plane: an A4 sheet taped to the wall, a ruler, a tennis ball.</li>
            <li>Choose an object that stands out from what is behind it: a light ball against a plain wall.</li>
            <li>Say what you know: &ldquo;the string is fifty centimetres&rdquo;, &ldquo;dropped from one metre&rdquo;. Hindi, English or both.</li>
            <li>Start just before the motion and stop just after; 3 to 20 seconds is plenty.</li>
          </ol>
        </Section>
        <Note who="Why each one">A still phone keeps the background still; a ruler in the plane sets the scale; an object that stands out lets SAM 3.1 find it; a spoken length becomes a given in the report.</Note>
      </Page>

      <Plate>
        <div className={styles.close}>
          <p>Film something that falls, swings, bounces or rolls, and watch the laws compete for it. Or watch a recorded run first: it replays from the start and calls no model.</p>
          <div className={styles.cta}>
            <Link href="/new" className="btn">
              Run an experiment
            </Link>
            <Link href="/new?replay=hardening-spring" className="btn ghost">
              Watch a recorded run
            </Link>
          </div>
        </div>
      </Plate>
    </article>
  );
}

/** A step of the method: a real sequence, so it carries its number. */
function Step({ n, id, title }: { n: number; id: string; title: string }) {
  return (
    <header className={styles.step} id={id}>
      <span className={styles.n} aria-hidden="true">
        {n}
      </span>
      <h3>
        <span className="visually-hidden">Step {n}: </span>
        {title}
      </h3>
    </header>
  );
}

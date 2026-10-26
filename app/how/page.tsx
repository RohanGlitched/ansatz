import type { Metadata } from "next";
import Link from "next/link";
import Tex from "@/components/Tex";
import styles from "./how.module.css";

export const metadata: Metadata = {
  title: "How it works",
  description: "How Ansatz turns a phone clip into a tested law of motion: five Meta models, a clock read from the file, a safe equation language, and a prediction test.",
};

export default function HowPage() {
  return (
    <article>
      <header className={`wrap ${styles.head}`}>
        <h1>How it works</h1>
        <p className="lede" style={{ marginTop: 16 }}>
          An <em>ansatz</em> is a physicist’s educated guess at the form of a law, made before the data decides. Ansatz automates the whole loop: look, measure, guess, test, and say honestly what was given and what was found.
        </p>
      </header>

      <section className={`wrap ${styles.steps}`}>
        <Step n="1" title="The clip and its clock" who="ffmpeg, the MP4 sample table">
          <p>
            Every clip is re-encoded once to H.264 at most 1280 pixels wide, keeping every original frame and its timestamp. Phones record at variable frame rates, so “frame <Tex>{"i"}</Tex> happened at <Tex>{"i/30"}</Tex> s” can be off by whole frames. Ansatz reads each frame’s presentation time from the file’s own sample table (<code>stts</code> and <code>ctts</code>). The soundtrack is split off as 16 kHz WAV for Muse Voice Transcribe.
          </p>
        </Step>
        <Step n="2" title="Watch and listen" who="Muse Spark 1.3, Muse Voice Transcribe">
          <p>
            Muse Spark watches the whole clip with its soundtrack and narration and returns a structured observation: what moves, named so a segmentation model can find it; when the free motion starts and ends; whether it flies, swings, oscillates or runs along a path; any object of known size in the plane of the motion (an A4 sheet, a tennis ball, a person); facts said aloud or printed on screen; whether the clip is slowed down; and where it happens (Earth, or the Moon). Structured output constrains the decoder to a JSON schema; search grounding is available for the size of an object it recognises.
          </p>
        </Step>
        <Step n="3" title="Measure every frame" who="SAM 3.1">
          <p>
            SAM 3.1 tracks the named object through every frame of the motion window (at most 450 frames per call; faster clips keep one frame in <Tex>{"k"}</Tex>, with true timestamps). Each mask is reduced to the numbers physics needs: its centroid from first moments, to a fraction of a pixel; its orientation and axes from second moments; and its true extent along those axes. On rendered clips with known positions the median centroid error is about half a pixel. For a person in flight Ansatz follows the top of the mask (the head), which a waving arm can’t drag around.
          </p>
          <p>
            The scale comes from a ruler in view (its mask’s length), from the narration, or, for a body flying freely on Earth, from gravity itself: a parabola fitted to the fall in pixels per second squared, set equal to <Tex>{"9.81\\,\\mathrm{m/s^2}"}</Tex>. A pendulum needs no ruler: its angle is measured about a pivot found by fitting a circle to the path.
          </p>
        </Step>
        <Step n="4" title="Propose laws" who="Muse Spark 1.3">
          <p>
            Muse Spark reads a digest of the measurement (a table of positions, noise levels, whether the path is a circle or a line, what is given) and writes two to four candidate laws as initial-value problems in a small equation language:
          </p>
          <div className={styles.code}>
            <Tex display>{"\\ddot{x} = -k\\,\\dot{x}\\sqrt{\\dot{x}^2+\\dot{y}^2}, \\qquad \\ddot{y} = -g - k\\,\\dot{y}\\sqrt{\\dot{x}^2+\\dot{y}^2}"}</Tex>
          </div>
          <p>
            Each law names its state, its derivatives, its parameters with units and bounds, the measured channels it predicts, and any instantaneous events (a bounce: when <Tex>{"y = y_\\text{floor}"}</Tex>, <Tex>{"\\dot{y} \\to -e\\,\\dot{y}"}</Tex>). The language is parsed and compiled by Ansatz, never evaluated as code: a law that names a symbol it didn’t define is rejected before it runs. Textbook laws (a vacuum projectile, a small-angle pendulum) always compete as controls.
          </p>
        </Step>
        <Step n="5" title="Fit, then predict what was never seen" who="code: RK4, Levenberg–Marquardt">
          <p>
            Each law is integrated with fourth-order Runge–Kutta, with impact events located inside the step, and fitted by Levenberg–Marquardt from six starting points to the first 70% of the motion, residuals weighted by each channel’s measured noise. Then it predicts the last 30%. The law that misses the unseen frames least wins; when two miss by less than the measurement noise, the one with fewer parameters wins. A law whose fitted parameter is pressed against its bound ranks after every law that measured all of its parameters. Uncertainties come from the fit’s covariance plus the ruler’s own uncertainty, carried by each parameter’s power of metres.
          </p>
        </Step>
        <Step n="6" title="Referee, and one revision" who="Muse Spark 1.3, Muse Wonder 1.0">
          <p>
            Muse Spark reads the scoreboard and the residuals binned in time. If the winner drifts in a way that points to a missing effect, it names the effect, and Muse Wonder writes one more law; that law is fitted and must win the same way. The referee writes the headline and the finding, but never a number: fitted values enter the text as placeholders that code fills in, and a finding that types its own digits is replaced.
          </p>
        </Step>
        <Step n="7" title="The clock check" who="code">
          <p>
            When a ruler makes gravity a measurement rather than an assumption, a result far from the planet’s gravity says the clip’s clock isn’t real time. Gravity scales with the square of time, so a <Tex>{"g"}</Tex> eighteen times too weak means the clip plays about <Tex>{"\\sqrt{18} \\approx 4.2"}</Tex> times slower than life.
          </p>
        </Step>
      </section>

      <section className={`section ${styles.band}`}>
        <div className={`wrap ${styles.two}`}>
          <div>
            <h2>Why it can be trusted</h2>
          </div>
          <ul className={styles.list}>
            <li>The model never decides the winner and never writes a number into the report.</li>
            <li>Every report separates what was given (a ruler, a stated length, Earth’s gravity) from what was measured, with an uncertainty on every measured value.</li>
            <li>Every model call is listed on the experiment with its purpose, time and cost.</li>
            <li>
              The method is measured on clips with known answers and against Muse Spark guessing by eye: see <Link href="/proof">Proof</Link>.
            </li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className={`wrap ${styles.two}`}>
          <div>
            <h2>Film it well</h2>
          </div>
          <ul className={styles.list}>
            <li>Keep the phone still: lean it on books or a wall.</li>
            <li>Film the motion side-on, across the frame, not toward the camera.</li>
            <li>Put something of known size in the same plane: an A4 sheet taped to the wall, a ruler, a tennis ball.</li>
            <li>Say what you know: “the string is fifty centimetres”, “dropped from one metre”. Hindi, English or both.</li>
            <li>Start just before the motion and stop just after; 3 to 20 seconds is plenty.</li>
          </ul>
        </div>
      </section>
    </article>
  );
}

function Step({ n, title, who, children }: { n: string; title: string; who: string; children: React.ReactNode }) {
  return (
    <section className={styles.step}>
      <p className={styles.n}>{n}</p>
      <div>
        <h2 className={styles.stepTitle}>{title}</h2>
        <p className={styles.who}>{who}</p>
        <div className={styles.body}>{children}</div>
      </div>
    </section>
  );
}

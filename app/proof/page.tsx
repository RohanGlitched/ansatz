import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getExperiment } from "@/lib/experiments";
import styles from "./proof.module.css";

export const metadata: Metadata = {
  title: "Proof",
  description: "Ansatz measured against clips with exactly known physics, against Muse Spark guessing by eye, and on real footage including the Moon.",
};

type Check = { quantity: string; truth: number; measured: number; sigma: number; errPct: number; withinSigma: number; eyeball?: number; eyeballErrPct?: number };
type Row = {
  id: string;
  phenomenon: string;
  variant?: string;
  fps: number;
  slowMotion: number;
  winner: { id: string; title: string; origin: string };
  family: { ok: boolean | null; expect: string };
  familyIfChosenByFit: boolean | null;
  trackingErrPx: number | null;
  predictionRel: number;
  predictionRelByFit: number | null;
  predictionRelControl: number | null;
  checks: Check[];
  calibration: string;
  usd: number;
  seconds: number;
};
type Bench = {
  generatedAt: string;
  summary: {
    cases: number;
    lawCorrect: number;
    lawJudged: number;
    lawCorrectIfChosenByFit: number;
    medianTrackingErrPx: number;
    medianConstErrPct: number;
    constantsWithin5pct: number;
    constantsChecked: number;
    medianEyeballErrPct: number;
    eyeballChecked: number;
    medianPredictionRel: number;
    medianPredictionRelControl: number;
    medianPredictionRelByFit: number;
    totalUsd: number;
    medianSeconds: number;
  };
  rows: Row[];
};

async function bench(): Promise<Bench | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", "bench", "synth.json"), "utf8")) as Bench;
  } catch {
    return null;
  }
}

const NAMES: Record<string, string> = {
  free_fall: "Free fall",
  projectile: "Projectile",
  projectile_drag: "Projectile with air drag",
  vertical_toss: "Vertical toss",
  pendulum: "Pendulum",
  spring_mass: "Mass on a spring",
  bouncing_ball: "Bouncing ball",
  incline_rolling: "Ball rolling down a ramp",
  collision_2d: "Two pucks colliding",
};

export default async function ProofPage() {
  const b = await bench();
  const moon = await getExperiment("moon-jump");
  const moonG = moon?.comparisons.find((c) => c.param === "g");
  const slow = await getExperiment("slowmo-pendulum");
  const s = b?.summary;
  const pct = (v: number, d = 1) => `${v.toFixed(d)}%`;
  return (
    <article>
      <header className={`wrap ${styles.head}`}>
        <h1>Proof</h1>
        <p className="lede" style={{ marginTop: 16 }}>
          A tool that claims to find laws must be checked against laws we already know. We rendered {s?.cases ?? "a set of"} clips with exactly known physics, ran each through Ansatz with no hints, and compared every number it reported with the truth. We also asked Muse Spark to read the same numbers off the same clips by eye.
        </p>
      </header>

      {s && (
        <section className={`wrap ${styles.stats}`}>
          <div>
            <p className={styles.big}>{pct(s.medianConstErrPct, 2)}</p>
            <p>median error on the {s.constantsChecked} physical constants Ansatz measured (g, string length, drag, restitution, damping, frequency); {s.constantsWithin5pct} within 5%</p>
          </div>
          <div>
            <p className={styles.big}>{pct(s.medianEyeballErrPct, 0)}</p>
            <p>median error when Muse Spark estimated the same constants by watching the clip, without SAM 3.1 or the fit ({s.eyeballChecked} estimates)</p>
          </div>
          <div>
            <p className={styles.big}>
              {s.lawCorrect}/{s.lawJudged}
            </p>
            <p>clips where the winning law had the right physics: drag where there was air drag, none where there wasn’t, sin θ for big swings, an impact for bounces</p>
          </div>
          <div>
            <p className={styles.big}>{s.medianTrackingErrPx.toFixed(2)} px</p>
            <p>median distance between SAM 3.1’s mask centroid and the object’s true centre, over every measured frame</p>
          </div>
        </section>
      )}

      <section className={`section ${styles.band}`}>
        <div className="wrap">
          <h2>Real footage</h2>
          <div className={styles.real}>
            {moon && moonG && (
              <Link href="/x/moon-jump" className={styles.realCard}>
                <p className={styles.realBig}>
                  {moonG.measured.toFixed(2)} ± {moonG.sigma.toFixed(2)} m/s²
                </p>
                <p>
                  <strong>The Moon’s gravity from 1972 television.</strong> John Young’s jump salute, Apollo 16, tracked by SAM 3.1 and fitted with a law Muse Spark wrote (a brief leg push, then free fall). The Moon’s surface gravity is {moonG.reference} m/s². The error bar is mostly the ruler: Young’s suited height, known to about ±5%.
                </p>
              </Link>
            )}
            {slow?.clock && (
              <Link href="/x/slowmo-pendulum" className={styles.realCard}>
                <p className={styles.realBig}>{slow.clock.factor.toFixed(1)}× slow motion</p>
                <p>
                  <strong>A clip that lies about time, caught.</strong> A pendulum filmed in slow motion. With the tennis ball as the ruler, the swing implied a gravity of {slow.comparisons.find((c) => c.param === "g")?.measured.toFixed(2)} m/s². Ansatz flagged it: either the experiment was done somewhere with a twentieth of Earth’s gravity, or the clip plays about {slow.clock.factor.toFixed(1)}× slower than life. Nothing in the video says so; its uploader titled it “slow motion”.
                </p>
              </Link>
            )}
          </div>
        </div>
      </section>

      {b && (
        <section className="section">
          <div className="wrap">
            <h2>Every clip with a known answer</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              Rendered with the true physics integrated at 10 kHz, then blurred over half a frame, given sensor noise and compressed to H.264: 24 to 240 fps, 720p to 1080p, plain walls, tiled walls, a cluttered room, a blackboard.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Clip</th>
                    <th>Winning law</th>
                    <th>Measured against truth</th>
                    <th>By eye (Muse Spark alone)</th>
                    <th>Misses unseen frames by</th>
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong>{NAMES[r.phenomenon] ?? r.phenomenon}</strong>
                        <span className="small">
                          {r.variant ? `${r.variant.replace(/_/g, " ")}, ` : ""}
                          {r.fps} fps{r.slowMotion > 1 ? `, ${r.slowMotion}× slow motion` : ""}
                        </span>
                      </td>
                      <td>
                        {r.winner.title}
                        <span className={`small ${r.family.ok === false ? styles.bad : r.family.ok ? styles.good : ""}`}>
                          {r.family.ok === null ? "not judged" : r.family.ok ? `right physics (${r.family.expect})` : `wrong: expected ${r.family.expect}`}
                        </span>
                      </td>
                      <td className="num">
                        {r.checks.filter((c) => !c.quantity.startsWith("scale")).length === 0 && <span className="small">no constant to compare</span>}
                        {r.checks.map((c) => (
                          <span key={c.quantity} className={styles.check}>
                            {c.quantity}: {fmt(c.measured)} vs {fmt(c.truth)} <em className={Math.abs(c.errPct) <= 5 ? styles.good : styles.bad}>{c.errPct >= 0 ? "+" : ""}{c.errPct.toFixed(Math.abs(c.errPct) < 1 ? 2 : 1)}%</em>
                          </span>
                        ))}
                      </td>
                      <td className="num">
                        {r.checks.filter((c) => c.eyeballErrPct !== undefined).map((c) => (
                          <span key={c.quantity} className={styles.check}>
                            {c.quantity}: {fmt(c.eyeball!)} <em className={Math.abs(c.eyeballErrPct!) <= 5 ? styles.good : styles.bad}>{c.eyeballErrPct! >= 0 ? "+" : ""}{c.eyeballErrPct!.toFixed(0)}%</em>
                          </span>
                        ))}
                      </td>
                      <td className="num">{(r.predictionRel * 100).toFixed(2)}% of the motion</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {s && (
        <section className={`section ${styles.band}`}>
          <div className={`wrap ${styles.two}`}>
            <div>
              <h2>What each part adds</h2>
              <p className="lede" style={{ marginTop: 12 }}>
                The same records, re-scored with one part of the method taken away. No new model calls.
              </p>
            </div>
            <ul className={styles.ablation}>
              <li>
                <strong>Without SAM 3.1 and the fit</strong> (Muse Spark reading numbers off the video): median error {pct(s.medianEyeballErrPct, 0)} instead of {pct(s.medianConstErrPct, 2)}.
              </li>
              <li>
                <strong>Without Muse’s hypotheses</strong> (textbook laws only): the best textbook law misses the unseen frames by {(s.medianPredictionRelControl * 100).toFixed(2)}% of the motion (median), against {(s.medianPredictionRel * 100).toFixed(2)}% for the winner.
              </li>
              <li>
                <strong>Without the prediction test</strong> (picking the law that fits the seen frames best): the right physics in {s.lawCorrectIfChosenByFit} of {s.lawJudged} clips instead of {s.lawCorrect}.
              </li>
              <li>
                <strong>Cost and time</strong>: ${s.totalUsd.toFixed(2)} for all {s.cases} clips, a median of {s.medianSeconds.toFixed(0)} s each.
              </li>
            </ul>
          </div>
        </section>
      )}

      <section className="section">
        <div className="wrap">
          <h2>What this doesn’t show</h2>
          <ul className={styles.limits}>
            <li>The rendered clips are filmed straight on, with no perspective and no lens distortion. A phone at an angle, or motion toward the camera, adds error a ruler in the same plane can only partly remove.</li>
            <li>Many rendered clips have an unlabelled striped bar as a ruler; Muse Spark declined to assume its length, so those runs used gravity as the ruler and measured the camera’s scale instead of g.</li>
            <li>Two-body collisions aren’t supported yet: Ansatz follows one object at a time.</li>
            <li>A clip in slow motion with no ruler and no caption can’t be caught: the clock check needs one length it can trust.</li>
            <li>The real-footage results are a handful of clips, not a benchmark.</li>
          </ul>
          <p className="small" style={{ marginTop: 18 }}>
            Reproduce: <code>scripts/bench.ts</code> runs every clip, <code>scripts/score.ts</code> scores the stored records. Clips and truth files are in the repository. Scored {b ? new Date(b.generatedAt).toUTCString() : "—"}.
          </p>
        </div>
      </section>
    </article>
  );
}

function fmt(v: number) {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e4)) return v.toExponential(2);
  return String(+v.toPrecision(4));
}

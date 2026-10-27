import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getExperiment, showcaseIds, winnerOf } from "@/lib/experiments";
import slits from "@/data/slits.json";
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
    slowClips?: number;
    slowFlagged?: number;
    slowFactorErrPct?: number[];
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
  const ab = await readFile(path.join(process.cwd(), "data", "bench", "ablation.json"), "utf8").then(
    (t) => JSON.parse(t) as { summary: { clips: number; sparkBetter: number; tied: number; libraryBetter: number }; extra?: { id: string; title: string; libraryLaw: string; libraryMissMm: number; modelMissMm: number; unit?: string }[] },
    () => null,
  );
  // clips filmed on a phone, each with the person's own tape-measured truth
  const phone = (await Promise.all((await showcaseIds()).map((id) => getExperiment(id).catch(() => null)))).filter((e) => e?.source.phone && e.extras?.truth?.rows.length);
  const phoneErr = phone.flatMap((e) => e!.extras!.truth!.rows.map((r) => Math.abs((r.measured - r.truth) / r.truth) * 100)).sort((a, b) => a - b);
  const moon = await getExperiment("moon-jump");
  const moonG = moon?.comparisons.find((c) => c.param === "g");
  const slow = await getExperiment("sample-pendulum");
  const s = b?.summary;
  // physical constants and camera scales are different claims, so they are counted apart
  const all = b?.rows.flatMap((r) => r.checks) ?? [];
  const group = (cs: typeof all) => {
    const e = cs.map((c) => Math.abs(c.errPct)).sort((x, y) => x - y);
    return { n: cs.length, within: e.filter((x) => x <= 5).length, median: e.length ? e[(e.length - 1) >> 1] * 0.5 + e[e.length >> 1] * 0.5 : NaN };
  };
  const split = { phys: group(all.filter((c) => !c.quantity.startsWith("scale"))), scale: group(all.filter((c) => c.quantity.startsWith("scale"))) };
  // how much each kind of constant leans on a length scale: times and ratios need none; drag and string length need
  // the scale that assuming g gives; g itself needs a ruler in view, which is the hardest case
  const kind = (q: string) => (/^(restitution|damping|omega)/.test(q) ? "free" : /^g/.test(q) ? "ruler" : "assumed");
  const byKind = { free: group(all.filter((c) => !c.quantity.startsWith("scale") && kind(c.quantity) === "free")), assumed: group(all.filter((c) => !c.quantity.startsWith("scale") && kind(c.quantity) === "assumed")), ruler: group(all.filter((c) => !c.quantity.startsWith("scale") && kind(c.quantity) === "ruler")) };
  const pct = (v: number, d = 1) => `${v.toFixed(d)}%`;
  // the winner's miss on the unseen frames as a share of how far the object moved (same units, so no scale is needed)
  const relMiss = (e: NonNullable<Awaited<ReturnType<typeof getExperiment>>>) => {
    const w = winnerOf(e);
    const ch = Object.keys(w.fit.predicted).find((c) => e.measured.series.ch[c]);
    const v = ch ? e.measured.series.ch[ch] : [];
    const range = v.length ? Math.max(...v) - Math.min(...v) : NaN;
    const r = (w.fit.testRms / range) * 100;
    return Number.isFinite(r) ? r.toFixed(r < 1 ? 2 : 1) : "—";
  };
  // a contact sheet of the rendered clips that move along one line: each as a photo-finish, every frame one slice
  const sheet = (await Promise.all(["spring", "hardening-spring", "dry-friction-spring"].filter((id) => id in slits).map((id) => getExperiment(id).catch(() => null)))).filter((e) => e != null);
  return (
    <article>
     <div className={styles.top}>
      <header className={`wrap ${styles.head}`}>
        <div>
          <h1>Proof</h1>
          <p className="lede" style={{ marginTop: 16 }}>
            A tool that claims to find laws must be checked against laws we already know. We rendered {s?.cases ?? "a set of"} clips with exactly known physics, ran each through Ansatz with no hints, and compared every number it reported with the truth. We also asked Muse Spark to read the same numbers off the same clips by eye.
          </p>
        </div>
        {sheet.length > 0 && (
          <figure className={styles.sheet}>
            {sheet.map((e) => (
              <Link key={e.id} href={`/x/${e.id}`} className={styles.sheetRow}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/slits/${e.id}.webp`} alt="" />
                <span>
                  {e.title}: the frames no law saw, predicted to {relMiss(e)}% of the motion
                </span>
              </Link>
            ))}
            <figcaption>Three of the rendered clips, every frame cut to one slice and laid side by side.</figcaption>
          </figure>
        )}
      </header>

      {phone.length > 0 && (
        <section className={`wrap ${styles.stats}`}>
          <div>
            <p className={styles.big}>{phone.length}</p>
            <p>
              clips filmed on a phone, each with the truth measured by tape before the run: median error {phoneErr[phoneErr.length >> 1]?.toFixed(1)}% over {phoneErr.length} quantities.{" "}
              {phone.map((e) => (
                <Link key={e!.id} href={`/x/${e!.id}`} style={{ marginRight: 8 }}>
                  {e!.title}
                </Link>
              ))}
            </p>
          </div>
        </section>
      )}

      {s && (
        <section className={`wrap ${styles.stats}`}>
          <div>
            <p className={styles.big}>{pct(split.phys.median, 2)}</p>
            <p>
              median error on the {split.phys.n} physical constants Ansatz measured (g, string length, drag, restitution, damping, frequency); {split.phys.within} within 5%. By what they lean on: {byKind.free.n} that need no length scale (restitution, damping, frequency), median {pct(byKind.free.median, 2)}; {byKind.assumed.n} that use the scale from assuming g (drag, string length), median {pct(byKind.assumed.median, 2)}; and {byKind.ruler.n} values of g measured against a ruler in view, the hardest case, median {pct(byKind.ruler.median, 1)}, {byKind.ruler.within} within 5%. Separately, the {split.scale.n} camera scales it worked out (metres per pixel, from a fall or a ruler): median {pct(split.scale.median, 2)}, {split.scale.within} within 5%.
            </p>
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
          {s.slowClips ? (
            <div>
              <p className={styles.big}>
                {s.slowFlagged}/{s.slowClips}
              </p>
              <p>
                clips rendered in slow motion (2×, 4×, 8×) and not declared so, flagged by the clock check from a ruler in view; the factor came out within 2% on {(s.slowFactorErrPct ?? []).filter((x) => Math.abs(x) <= 2).length}, and off where the ruler was misread (a 15 cm ruler taken for a metre stick)
              </p>
            </div>
          ) : null}
          <div>
            <p className={styles.big}>{s.medianTrackingErrPx.toFixed(2)} px</p>
            <p>median distance between SAM 3.1’s mask centroid and the object’s true centre, over every measured frame</p>
          </div>
        </section>
      )}
     </div>

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
                  <strong>The Moon’s gravity from 1972 television, measured from the pixels.</strong> John Young’s jump salute, Apollo 16. No narration: the only inputs were the clip, the word “astronaut” for SAM 3.1 and the ruler. SAM 3.1 tracked him, the airborne frames came from his boots leaving the ground, and a plain ballistic law won. The Moon’s surface gravity is {moonG.reference} m/s². The error bar is mostly the ruler: his suited height, taken as 1.88 m ± 5%. With that ruler his boots rose 0.40 m on average; the Apollo Lunar Surface Journal says about 0.42 m.
                </p>
              </Link>
            )}
            {slow?.clock && (
              <Link href="/x/sample-pendulum" className={styles.realCard}>
                <p className={styles.realBig}>about 4 to 4.5× slow</p>
                <p>
                  <strong>A clip that may hide its slow motion, flagged.</strong> A pendulum posted online. With the tennis ball as the ruler, the swing implied a gravity of {slow.comparisons.find((c) => c.param === "g")?.measured.toFixed(2)} m/s². Ansatz flagged it: either the experiment was done somewhere with a twentieth of Earth’s gravity, or the clip plays slower than life: about 4 to 4.5×, unconfirmed, because the capture rate isn’t published and the clamp isn’t modelled. Nothing in the frames says so; only its uploader’s title says “slow motion”.
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
                        {r.checks.map((c) => {
                          // a fall sets the scale assuming real time: on a clip slowed n×, it comes out n² too big, as it must
                          const n = r.slowMotion ?? 1, ratio = c.measured / c.truth;
                          const clock = c.quantity.startsWith("scale") && n > 1 && Math.abs(ratio / (n * n) - 1) < 0.05;
                          return (
                            <span key={c.quantity} className={styles.check}>
                              {c.quantity}: {fmt(c.measured)} vs {fmt(c.truth)}{" "}
                              {clock ? (
                                <em className={styles.bad}>
                                  {ratio.toFixed(1)}× = {Math.sqrt(ratio).toFixed(2)}², as an {n}× slow clip must give when the fall sets the scale; only a ruler in view can catch it
                                </em>
                              ) : (
                                <em className={Math.abs(c.errPct) <= 5 ? styles.good : styles.bad}>{c.errPct >= 0 ? "+" : ""}{c.errPct.toFixed(Math.abs(c.errPct) < 1 ? 2 : 1)}%</em>
                              )}
                            </span>
                          );
                        })}
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
                <strong>Without Muse’s hypotheses</strong>: against the one or two fixed controls each run carries, the winner predicts the unseen frames far better ({(s.medianPredictionRel * 100).toFixed(2)}% of the motion against {(s.medianPredictionRelControl * 100).toFixed(2)}%, medians). Against a fair library of twelve textbook laws it ties on most clips: see the next section.
              </li>
              <li>
                <strong>Without the prediction test</strong> (picking the law that fits the seen frames best): on these clean renders, fit alone picks the right physics just as often ({s.lawCorrectIfChosenByFit} of {s.lawJudged} clips). The held-out test earns its keep where a law fits the seen frames and fails after them: on <Link href="/x/hardening-spring">the hardening spring</Link>, laws that fit the first 70% respectably missed the rest by over 100× the noise.
              </li>
              <li>
                <strong>Cost and time</strong>: ${s.totalUsd.toFixed(2)} for all {s.cases} clips, a median of {s.medianSeconds.toFixed(0)} s each.
              </li>
            </ul>
          </div>
        </section>
      )}

      {ab && (
        <section className={`section ${styles.band}`}>
          <div className="wrap">
            <h2>Does the model add anything a textbook doesn’t?</h2>
            <p className="lede" style={{ marginTop: 12, maxWidth: "75ch" }}>
              We fitted a library of {12} textbook laws (simple, large-angle, damped and dragged pendulums; harmonic motion with and without damping or drag; flight in vacuum, with linear or quadratic drag, and bouncing) to every clip with no model involved, and scored them exactly as Muse Spark’s laws are scored.
            </p>
            <div className={styles.stats} style={{ marginTop: 20 }}>
              <div>
                <p className={styles.big}>
                  {ab.summary.tied}/{ab.summary.clips}
                </p>
                <p>clips where Muse Spark’s best law ties the library’s best: on textbook physics it re-derives the textbook, written in the clip’s own quantities</p>
              </div>
              <div>
                <p className={styles.big}>
                  {ab.summary.sparkBetter}/{ab.summary.clips}
                </p>
                <p>where Spark’s law scores better: the two pucks colliding. Neither side truly describes two bodies (both are graded wrong in the table above), so this is no win; two-body laws are the next thing to build.</p>
              </div>
              <div>
                <p className={styles.big}>
                  {ab.summary.libraryBetter}/{ab.summary.clips}
                </p>
                <p>where the library is better: a hollow ball rolling down a ramp, whose rolling law Spark wrote less well</p>
              </div>
              {ab.extra?.map((x) => (
                <div key={x.id}>
                  <p className={styles.big}>
                    {x.libraryMissMm}→{x.modelMissMm} {x.unit ?? "mm"}
                  </p>
                  <p>
                    <Link href={`/x/${x.id}`}>{x.title}</Link>: the library’s best law ({x.libraryLaw}) misses the unseen motion by {x.libraryMissMm} {x.unit ?? "mm"}; Muse Wonder’s, found with its fitting tool, by {x.modelMissMm} {x.unit ?? "mm"}. This is where a model that writes laws earns its place.
                  </p>
                </div>
              ))}
            </div>
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
  if (a !== 0 && (a < 1e-6 || a >= 1e5)) return v.toExponential(2);
  return String(+v.toPrecision(4));
}

import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getExperiment, showcaseIds, winnerOf } from "@/lib/experiments";
import slits from "@/data/slits.json";
import styles from "./proof.module.css";

// reads only the runs and benchmark files that ship with the site: cached, rebuilt at most every 5 minutes
export const revalidate = 300;

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
  clock?: { factor: number } | null;
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
  // the referee and Muse Wonder, each run over every benchmark clip on its own (data/bench/referee.json, wonder.json)
  type Ref = { summary: { clips: number; revise: number; reviseWhenNeeded: number; needed: number; reviseWhenRight: number; right: number; usd: number } };
  type Won = { summary: { clips: number; beat: number; tie: number; worse: number; none: number; usd: number }; rows: { verdict: string; submitted?: string; ratio?: number }[] };
  const refb = await readFile(path.join(process.cwd(), "data", "bench", "referee.json"), "utf8").then((t) => JSON.parse(t) as Ref, () => null);
  const wonb = await readFile(path.join(process.cwd(), "data", "bench", "wonder.json"), "utf8").then((t) => JSON.parse(t) as Won, () => null);
  type Obs = { summary: { runs: number; subjectRight: number; subjectScored: number; firstNounFound: number; worldRight: number; motionKindRight: number; naiveWouldFail: number; rulerPicked: number; rulerNeeded: number; rulerLengthRight: number; windowMedianIoU: number; windowNaiveWholeClipMedianIoU: number; narrationFactFound: number; narrationFacts: number } };
  const obsb = await readFile(path.join(process.cwd(), "data", "bench", "observer.json"), "utf8").then((t) => JSON.parse(t) as Obs, () => null);
  const worse = wonb?.rows.filter((r) => r.verdict === "worse" && Number.isFinite(r.ratio)).map((r) => r.ratio!) ?? [];
  const lite = await readFile(path.join(process.cwd(), "data", "bench", "lite.json"), "utf8").then((t) => JSON.parse(t) as { summary: { clips: number; constantsWithin5: number; constantsChecked: number; medianPhysErrPct: number; lawCorrect: number; lawJudged: number; medianSamUsd: number } }, () => null);
  const cov = await readFile(path.join(process.cwd(), "data", "bench", "coverage.json"), "utf8").then((t) => JSON.parse(t) as { trials: number; cases: { law: string; noise: string; "coverage1σ": number; "coverage2σ": number }[] }, () => null);
  const clockc = await readFile(path.join(process.cwd(), "data", "bench", "clock-controls.json"), "utf8").then((t) => JSON.parse(t) as { note: string; rows: { id: string; slow: number; ruler: string | null; g: number | null; sigma: number | null; clock: number | null; outcome: string }[] }, () => null);
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
  const kind = (q: string) => (/^(restitution|damping|omega)/.test(q) ? "free" : (q === "g" || q.startsWith("g as")) ? "ruler" : "assumed");
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
                        {(r.slowMotion ?? 1) > 1 && (
                          // on a clip slowed in secret the test is the clock check; gravity as filmed is meant to be off
                          <span className={styles.check}>
                            clock check:{" "}
                            {r.clock ? (
                              <em className={Math.abs(r.clock.factor / r.slowMotion - 1) <= 0.1 ? styles.good : styles.bad}>
                                flagged {r.clock.factor.toFixed(2)}× slow (truth {r.slowMotion}×){Math.abs(r.clock.factor / r.slowMotion - 1) > 0.1 ? ": the ruler was misread" : ""}
                              </em>
                            ) : (
                              <em className={styles.bad}>not flagged (truth {r.slowMotion}×)</em>
                            )}
                          </span>
                        )}
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

      {refb && wonb && (
        <section className="section" id="models">
          <div className={`wrap ${styles.two}`}>
            <div>
              <h2>Do the models earn their place?</h2>
              <p className="lede" style={{ marginTop: 12 }}>
                The referee and Muse Wonder, each run on its own over every benchmark clip, from the stored measurements. ${(refb.summary.usd + wonb.summary.usd).toFixed(2)} of model calls in all.
              </p>
            </div>
            <ul className={styles.ablation}>
              {obsb && (
                <li>
                  <strong>The observer is what lets a clip nobody labelled become an experiment.</strong> Across {obsb.summary.runs} stored runs, Muse Spark named the moving object right {obsb.summary.subjectRight} of {obsb.summary.subjectScored} times (where we didn’t hand it the name), and SAM 3.1 found it on that first name every time; it read the world right {obsb.summary.worldRight} of {obsb.summary.runs} times and the kind of experiment {obsb.summary.motionKindRight} of {obsb.summary.runs}, and took the string length from Hindi narration. A lite default that assumes Earth and no ruler would have failed on {obsb.summary.naiveWouldFail} of these runs, every Moon and Mars clip among them. Its limits: it used a ruler on only {obsb.summary.rulerPicked} of {obsb.summary.rulerNeeded} clips that had one, because the rendered rulers are unmarked striped bars whose length it declined to guess (it read {obsb.summary.rulerLengthRight} of {obsb.summary.rulerPicked} right when it did; stating the ruler on the run form fixes the rest), and its free-motion window is only a little tighter than the whole clip (median overlap {obsb.summary.windowMedianIoU.toFixed(2)} against {obsb.summary.windowNaiveWholeClipMedianIoU.toFixed(2)}).
                </li>
              )}
              <li>
                <strong>The referee asks for a new law only when one is missing.</strong> Shown the fitted frames alone (no ranks, no held-out errors), Muse Spark asked for one on {refb.summary.reviseWhenNeeded} of the {refb.summary.needed} renders we built to need a law outside the textbook, at full strength, and on {refb.summary.reviseWhenRight} of the {refb.summary.right} clips whose leading law already had the right physics.
              </li>
              <li>
                <strong>Muse Wonder, challenged on every clip, rarely overreaches, and the held-out test catches it when it does.</strong> Told the leading law might already be right, it kept or matched it on {wonb.summary.tie} of {wonb.summary.clips} clips. {wonb.summary.worse} times it added an effect that wasn’t there; each such law missed the frames it never saw by more ({worse.length ? `${Math.min(...worse).toFixed(2)}× to ${Math.round(Math.max(...worse))}× the winner’s miss` : "more"}), so it lost. In a real run it is called in only when the referee asks for a new law or when the leading law misses even its own fitted frames by more than six times the noise; on these clips neither happened.
              </li>
              <li>
                <strong>Where a law really was missing</strong>, it found it: the cubic stiffening of the <Link href="/x/hardening-spring">hardening spring</Link> and the dry friction of the <Link href="/x/dry-friction-spring">spring with friction</Link>, each winning on the unseen frames. On both, the fit check called it in (the leader missed its own fitted frames by 48× and 14× the noise), and the referee, asked separately, wanted a new law too. Both are laws a physicist knows: a textbook library extended with a cubic spring and dry friction ties Muse Wonder on both, so these wins show it finding a law the base library lacked, not physics beyond the textbook.
              </li>
            </ul>
          </div>
        </section>
      )}

      {(lite || cov || clockc) && (
        <section className="section" id="checks">
          <div className={`wrap ${styles.two}`}>
            <div>
              <h2>Checks on the method itself</h2>
              <p className="lede" style={{ marginTop: 12 }}>
                Are the error bars honest, does the clock check raise false alarms, and how much of this needs a language model at all?
              </p>
            </div>
            <ul className={styles.ablation}>
              {cov && (
                <li>
                  <strong>Error bars.</strong> On {cov.cases.length} sets of {cov.trials} synthetic tracks with known answers (a projectile, a damped spring and a pendulum, each with white noise, smoothly wandering noise, and a mix of the two), the ±1σ intervals held the true value {Math.round(Math.min(...cov.cases.map((c) => c["coverage1σ"])) * 100)}–{Math.round(Math.max(...cov.cases.map((c) => c["coverage1σ"])) * 100)}% of the time and ±2σ {Math.round(Math.min(...cov.cases.map((c) => c["coverage2σ"])) * 100)}–{Math.round(Math.max(...cov.cases.map((c) => c["coverage2σ"])) * 100)}% (ideal: 68% and 95%).
                </li>
              )}
              {clockc && (
                <li>
                  <strong>Clock-check controls.</strong> {clockc.rows.filter((r) => r.slow === 1 && r.ruler).length} real-time clips with a trusted ruler: {clockc.rows.filter((r) => r.slow === 1 && r.ruler && !r.clock).length} not flagged, no false alarm. Two small slowdowns: 1.25× was missed, because Muse Spark took the striped bar for a metre stick only as a guess (±30%), so the 36% shortfall in gravity sat inside the error bar; 1.5× couldn’t be checked, because it didn’t trust the bar at all. The check catches a slowdown when the ruler’s size is known, which the run form lets you state.
                </li>
              )}
              {lite && (
                <li>
                  <strong>A lite mode with no language model</strong>, measured offline on the same stored runs: the student names the experiment, SAM 3.1 measures, and code fits a textbook library. {lite.summary.constantsWithin5} of {lite.summary.constantsChecked} constants within 5% (median {lite.summary.medianPhysErrPct.toFixed(2)}%), right law on {lite.summary.lawCorrect} of {lite.summary.lawJudged}, at a median {Math.round(lite.summary.medianSamUsd * 100)} cents of SAM 3.1 a clip. On clean textbook motion, the language models add little; they matter on footage nobody labelled, for the clock, and where the textbook runs out.
                </li>
              )}
            </ul>
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
                <strong>Without the prediction test</strong> (picking the law that fits the seen frames best): on these clean renders, fit alone picks the right physics just as often ({s.lawCorrectIfChosenByFit} of {s.lawJudged} clips). The held-out test earns its keep where a law fits the seen frames and fails after them: on <Link href="/x/beach-ball-drag">the beach ball</Link>, linear air drag fits the first 70% to within 2.1× the noise, then misses the rest by 66×; quadratic drag, the right physics, wins.
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

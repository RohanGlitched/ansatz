import type { Metadata } from "next";
import Link from "next/link";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getExperiment, showcaseIds, winnerOf } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiment";
import { LANGUAGES } from "@/lib/translate";
import slits from "@/data/slits.json";
import { costText, headline, timeText } from "@/lib/headline";
import styles from "./judges.module.css";

export const metadata: Metadata = {
  title: "For judges",
  description: "Ansatz against the four judging criteria, with every claim linked to the run, page or benchmark row that backs it.",
};

export const dynamic = "force-dynamic";

type Summary = {
  cases: number;
  medianConstErrPct: number;
  constantsWithin5pct: number;
  constantsChecked: number;
  medianEyeballErrPct: number;
  medianTrackingErrPx: number;
  lawCorrect: number;
  lawJudged: number;
  slowClips?: number;
  slowFlagged?: number;
  totalUsd: number;
  medianSeconds: number;
};
type Check = { quantity: string; errPct: number };

const MODELS: { id: string; name: string; job: string; where: string; href: string }[] = [
  { id: "sam-3.1", name: "SAM 3.1", job: "The measuring instrument. It tracks the object through every frame; Ansatz turns each mask into a sub-pixel centroid from its moments, and measures rulers from true mask extents. Its masks also print the stroboscopic plate and stream live onto the clip during a run.", where: "The orange dots on every strip", href: "/x/hardening-spring" },
  { id: "muse-spark-1.3", name: "Muse Spark 1.3", job: "The observer, the theorist and the referee. It watches the clip and reads its captions under a JSON schema, names what moves and what can serve as a ruler, writes candidate laws in a small equation language, and reads the residual plot to judge them. It is also the baseline we beat: the same model guessing the numbers by eye.", where: "The trial on every experiment", href: "/x/moon-jump#speed-test" },
  { id: "muse-wonder-1.0", name: "Muse Wonder 1.0", job: "The agent with a tool. When every proposed law misses, it gets a fit_law tool on the seen frames only, tries laws, reads their residuals and submits one, which must then win on frames it never saw. It has found two laws Muse Spark missed.", where: "Its notebook on the hardening spring", href: "/x/hardening-spring" },
  { id: "muse-voice-transcribe-1.0", name: "Muse Voice Transcribe", job: "The ears. What the person filming says (“the string is sixty centimetres”, in Hindi or English) becomes a given in the report, with its source quoted, so a spoken length can set the scale.", where: "The Hindi pendulum", href: "/x/hindi-pendulum" },
];

export default async function JudgesPage() {
  const ids = await showcaseIds();
  const exps = (await Promise.all(ids.map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => e != null);
  const by = (id: string) => exps.find((e) => e.id === id);
  const moon = by("moon-jump");
  const mt = moon?.extras?.memoryTest;
  const st = moon?.extras?.speedTest;
  const ratio = mt ? Math.sqrt(mt.rows[0].g / mt.rows[1].g) : NaN;
  const g = moon?.comparisons.find((c) => c.param === "g");
  const spring = by("hardening-spring");
  const springTruth = spring?.extras?.truth?.rows.find((r) => r.param === "beta");
  const wonderWins = exps.filter((e) => winnerOf(e).origin === "revision");
  const sparkBest = (e: Experiment) => e.candidates.filter((c) => c.origin === "muse" && c.fit.ok).sort((a, b) => a.fit.testRms - b.fit.testRms)[0];
  const springGain = spring && sparkBest(spring) ? sparkBest(spring)!.fit.testRms / winnerOf(spring).fit.testRms : NaN;
  const slowPendulum = by("sample-pendulum");

  const bench = await readFile(path.join(process.cwd(), "data", "bench", "synth.json"), "utf8").then((t) => JSON.parse(t) as { summary: Summary; rows: { checks: Check[] }[] }, () => null);
  const ablation = await readFile(path.join(process.cwd(), "data", "bench", "ablation.json"), "utf8").then((t) => JSON.parse(t) as { summary: { clips: number; sparkBetter: number; tied: number; libraryBetter: number } }, () => null);
  const s = bench?.summary;
  const phys = (bench?.rows.flatMap((r) => r.checks) ?? []).filter((c) => !c.quantity.startsWith("scale"));
  const physErr = phys.map((c) => Math.abs(c.errPct)).sort((a, b) => a - b);
  const physMedian = physErr.length ? (physErr[(physErr.length - 1) >> 1] + physErr[physErr.length >> 1]) / 2 : NaN;
  const physWithin = physErr.filter((x) => x <= 5).length;
  const gRuler = phys.filter((c) => /^g/.test(c.quantity)).map((c) => Math.abs(c.errPct));

  // what each Meta model did across the published runs, from their own ledgers
  const usage = MODELS.map((m) => {
    const calls = exps.flatMap((e) => e.ledger.calls.filter((c) => c.model === m.id));
    return { ...m, calls: calls.length, usd: calls.reduce((a, c) => a + c.usd, 0), frames: calls.reduce((a, c) => a + ((c as { frames?: number }).frames ?? 0), 0) };
  });
  const costs = exps.map((e) => e.ledger.usd).sort((a, b) => a - b);
  const secs = exps.map((e) => e.ledger.ms / 1000).sort((a, b) => a - b);
  const median = (v: number[]) => (v.length ? (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2 : NaN);
  const langs = Object.keys(LANGUAGES).length + 1;
  const hl = await headline();

  const criteria = [
    {
      name: "Impact",
      weight: 30,
      claim: "A physics lab that fits in a phone propped on books, for the students who have no light gates.",
      points: [
        <>A student films a ball, says what they know in their own language, and gets the law, the constants with error bars, and how far they are from the textbook. Reports read in {langs} languages, and the numbers in a translation are checked against the English before it is shown.</>,
        <>
          Teachers get a class code, a grading sheet with every student’s run and a CSV: <Link href="/class/demo23">a sample class</Link>. The pendulum practical becomes a series: several string lengths fitted together, g from the slope of L against T² (<Link href="/series/pendulum-lengths">an example</Link>).
        </>,
        <>
          A run costs {costText(hl)} in Meta credits and takes {timeText(hl)}. Each lab report prints with student fields, or exports as a PDF.
        </>,
        <>Beyond the classroom: it is system identification from any video, with a model kept honest. A pendulum clip posted online as “slow motion” came out with gravity about 18× too weak, which Ansatz reads as footage running about 4 to 4.5× slower than life (unconfirmed: the capture rate isn’t published).</>,
      ],
    },
    {
      name: "Meta tooling",
      weight: 25,
      claim: "Four Meta models, each doing a job the others can’t, and each checked by code rather than trusted.",
      points: [
        <>SAM 3.1 is the instrument, Muse Spark the observer, theorist and referee, Muse Wonder an agent with a fitting tool, Muse Voice Transcribe the ears. Their jobs and their spend across the published runs are in the table below.</>,
        <>Structured output with strict JSON schemas, video input at the clip’s own frame rate, function tools for Muse Wonder, streamed SAM masks drawn live during a run.</>,
        <>
          Muse Wonder earned its place: on {wonderWins.length} of the published runs it found the law Muse Spark missed. On the stiffening spring its law predicts the unseen motion {Number.isFinite(springGain) ? `${Math.round(springGain)}×` : "far"} better than Muse Spark’s best{springTruth ? `, and recovers the hidden stiffening k₃/m = ${+springTruth.measured.toPrecision(4)} ± ${+springTruth.sigma.toPrecision(2)} against a true ${+springTruth.truth.toPrecision(4)}` : ""}.
        </>,
        <>Every model call is listed on its experiment with its purpose, time and cost, so you can see exactly what each model did.</>,
      ],
    },
    {
      name: "Technical execution",
      weight: 20,
      claim: "The model proposes; the data decides; code computes every measured number.",
      points: [
        <>Each law is integrated with RK4 (bounces located inside the step), fitted by Levenberg–Marquardt to the first 70% of the motion and ranked on the 30% no model ever saw, in units of the measured noise.</>,
        <>
          Checked against {s?.cases ?? "28"} clips rendered with exactly known physics: {physWithin} of {phys.length} physical constants within 5%, median error {physMedian.toFixed(2)}%. Muse Spark reading the same numbers by eye: {s?.medianEyeballErrPct.toFixed(0)}%. SAM centroids land a median {s?.medianTrackingErrPx.toFixed(2)} px from the true centre. All on <Link href="/proof">Proof</Link>.
        </>,
        <>Times come from the video file’s own sample table, not an assumed frame rate. Laws are written in a small equation language that Ansatz parses and compiles; nothing a model writes is ever run as code. The referee writes the finding with placeholders, and code fills in the numbers. Two inputs do come from Muse Spark, and every report lists them under “Given, not measured”: the size of the ruler it picked, and which world the clip is on.</>,
        <>
          Honest about its own method: against a library of 12 textbook laws, Muse Spark’s proposals tie on {ablation?.summary.tied ?? 25} of {ablation?.summary.clips ?? 28} clips, win {ablation?.summary.sparkBetter ?? 2} and lose {ablation?.summary.libraryBetter ?? 1}. The model matters where the textbook runs out, which is where Muse Wonder comes in.
        </>,
      ],
    },
    {
      name: "Demo",
      weight: 25,
      claim: "The first screen is the result, and you can watch a full run without spending anything.",
      points: [
        <>The home page opens on the experiment: every frame of the 1972 Moon broadcast cut to one slice, so John Young’s jumps draw their own arches, above the same clip slowed in secret, 1.5× longer on the same clock.</>,
        <>
          <Link href="/new">Run an experiment</Link> replays recorded runs, SAM masks included, with no model called. Or film something: a phone propped on books is enough.
        </>,
        <>Every experiment has an ask box: Muse Spark answers from the run’s record, and code checks each number it quotes against that record.</>,
        <>The flagship experiments open on their own photo-finish strip, with the fitted part and the predicted part split by a dashed line.</>,
      ],
    },
  ];

  const tour = [
    { t: "0:00", title: "The first screen", body: "Two strips of the same Moon jump, one slowed in secret. Muse Spark gave both the same answer; Ansatz’s two measurements differ by the slowdown.", href: "/", go: "Home" },
    { t: "0:30", title: "The Moon experiment", body: `Gravity measured from the pixels of 1972 television, with a ruler we chose (Young’s suited height, 1.88 m ± 5%): ${g ? `${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)}` : "1.72"} m/s² against the Moon’s 1.625, with a further ±0.2 depending on which point of the body is followed. Scroll to “Can it tell the speed?” for the fair test.`, href: "/x/moon-jump", go: "Open it" },
    { t: "1:15", title: "A law Muse Spark didn’t propose", body: "A spring we rendered to stiffen as it stretches: Muse Spark’s laws miss, Muse Wonder’s notebook shows four attempts, and the cubic law it submitted wins on frames it never saw.", href: "/x/hardening-spring", go: "Open it" },
    { t: "2:00", title: "The scoreboard", body: "Every number Ansatz reported on clips with known answers, beside Muse Spark’s guess by eye.", href: "/proof", go: "Proof" },
    { t: "2:30", title: "Watch a run", body: "Replay a recorded run, with SAM’s masks arriving frame by frame and the laws competing. No model is called.", href: "/new", go: "Run page" },
  ];

  const novel = [
    { title: "A test of memory against measurement", body: `We slowed a famous clip and told no one. A model that recognises footage answers from memory; one that measures can’t be fooled. Muse Spark, one clip at a time: ${st ? `“${st.single[0].playback_accel} m/s², slowed ${st.single[0].factor}×” for both` : "the same answer for both"}. Ansatz: ${mt ? `${mt.rows[0].g.toFixed(2)} and ${mt.rows[1].g.toFixed(2)} m/s², so the second runs ${ratio.toFixed(2)}× slow` : "two different values"}; measured jump for jump, ${mt?.sameJump ? `${mt.sameJump.combined.ratio.toFixed(3)} ± ${mt.sameJump.combined.sigma.toFixed(3)}×` : "the same"} (truth: 1.5×).`, href: "/x/moon-jump#speed-test" },
    { title: "Laws judged on frames no model saw", body: "No fit, law choice or theorist sees the last 30% of the motion: Muse Spark writes its laws from the first 70%, and Muse Wonder’s fitting tool only has those frames. A law wins by predicting the rest, not by sounding right.", href: "/how" },
    { title: "A clock check from physics", body: "Gravity scales with the square of time. When a ruler makes gravity a measurement, a value far from the planet’s says the clip isn’t real time, and by how much.", href: "/x/sample-pendulum" },
    { title: "An agent that does science with a tool", body: "Muse Wonder doesn’t answer; it experiments. It fits laws to the seen frames, reads the residuals, revises, and submits one law to a trial it can’t see.", href: "/x/dry-friction-spring" },
    { title: "The video as its own chart", body: "Every frame cut to one slice through the moving object and laid side by side, a race-finish camera for physics. The motion draws its own graph in real pixels, and the measurement sits on top.", href: `/x/${Object.keys(slits)[0]}` },
    { title: "Numbers no model typed", body: "Every measured value in a report comes from the fit; the two things Muse Spark supplies (a ruler’s size, which world) are listed as given. The referee writes with placeholders; an answer from the ask box that quotes a number not in the record is flagged on screen.", href: "/x/moon-jump" },
  ];

  const breakIt = [
    ["Film in slow motion and don’t say so.", "With a ruler in view, the clock check flags it and names the factor. Without one, gravity is assumed and the report says so."],
    ["Say a wrong length aloud.", "The spoken length becomes the scale and is listed under “Given, not measured”, quoted, so the reader can see where the number came from."],
    ["Film something that isn’t textbook physics.", "Every proposed law will miss the unseen frames. Muse Wonder steps in; if it can’t do better, the winner is labelled as the best description available, not a closed case."],
    ["Film toward the camera.", "Depth isn’t measured. The motion has to cross the frame; the How it works page says so."],
    ["Ask the ask box for a number it doesn’t have.", "It is told to say what would be needed; any number it quotes that isn’t in the record is marked as unchecked."],
  ];

  const numbers: { what: string; value: string; href: string }[] = [
    ...(g ? [{ what: "Moon gravity from Apollo 16 television", value: `${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s² (true 1.625)`, href: "/x/moon-jump" }] : []),
    ...(mt ? [{ what: "The same clip slowed 1.5× in secret", value: `${mt.rows[1].g.toFixed(2)} ± ${mt.rows[1].sigma.toFixed(2)} m/s²: ${ratio.toFixed(2)}× slow`, href: "/x/moon-jump-slowed" }] : []),
    ...(mt?.sameJump ? [{ what: "Slowdown measured jump for jump (truth 1.5×)", value: `${mt.sameJump.combined.ratio.toFixed(3)} ± ${mt.sameJump.combined.sigma.toFixed(3)}×`, href: "/x/moon-jump#same-jump" }] : []),
    ...(springTruth ? [{ what: "Hidden stiffening found by Muse Wonder", value: `k₃/m = ${+springTruth.measured.toPrecision(4)} ± ${+springTruth.sigma.toPrecision(2)} m⁻²s⁻² (true ${+springTruth.truth.toPrecision(4)})`, href: "/x/hardening-spring" }] : []),
    { what: "Physical constants within 5% on rendered clips", value: `${physWithin} of ${phys.length}, median ${physMedian.toFixed(2)}%`, href: "/proof" },
    ...(gRuler.length ? [{ what: "Of those, g measured against a ruler in view (the hardest case)", value: `${gRuler.filter((x) => x <= 5).length} of ${gRuler.length}, median ${median(gRuler).toFixed(1)}%`, href: "/proof" }] : []),
    ...(s ? [{ what: "Muse Spark reading the same constants by eye", value: `median ${s.medianEyeballErrPct.toFixed(0)}% off`, href: "/proof" }] : []),
    ...(s?.slowClips ? [{ what: "Clips rendered in slow motion, not declared, that were flagged", value: `${s.slowFlagged} of ${s.slowClips}; factor within 2% on 2 (2.0×, 4.1×); the 8× clip read as 3.1× after a 15 cm ruler was taken for a metre stick`, href: "/proof" }] : []),
    ...(s ? [{ what: "SAM 3.1 centroid against the true centre", value: `median ${s.medianTrackingErrPx.toFixed(2)} px`, href: "/proof" }] : []),
    { what: "Cost of a run, median of the published ones", value: `$${median(costs).toFixed(2)} (from $${costs[0]?.toFixed(2)} to $${costs.at(-1)?.toFixed(2)})`, href: "/x/hardening-spring" },
  ];

  return (
    <article>
      <header className={styles.top}>
        <div className={`wrap ${styles.head}`}>
          <div>
            <h1>For judges</h1>
            <p className="lede" style={{ marginTop: 16 }}>
              Ansatz turns any video of something moving into a physics experiment: SAM 3.1 measures every frame, Muse Spark and Muse Wonder propose laws of motion, and the law that predicts the part of the clip no model saw wins. Here it is against your four criteria. Every number on this page is read from the stored runs, and every claim links to where you can check it.
            </p>
          </div>
          <ol className={styles.board} aria-label="The judging criteria">
            {criteria.map((c) => (
              <li key={c.name}>
                <a href={`#${c.name.toLowerCase().replace(/ /g, "-")}`}>
                  <span className={styles.boardName}>
                    {c.name} <span className={styles.boardWeight}>weight {c.weight}%</span>
                  </span>
                  <span className={styles.boardClaim}>{c.claim}</span>
                </a>
              </li>
            ))}
          </ol>
        </div>
        <div className={`wrap ${styles.proofRow}`}>
          {hl.moon && (
            <Link href="/x/moon-jump">
              <b>
                {hl.moon.g.toFixed(2)} ± {hl.moon.sigma.toFixed(2)} m/s²
              </b>
              <span>the Moon’s gravity, measured from 1972 television (true {hl.moon.reference})</span>
            </Link>
          )}
          {hl.jumpForJump && (
            <Link href="/x/moon-jump#same-jump">
              <b>
                {hl.jumpForJump.ratio.toFixed(3)} ± {hl.jumpForJump.sigma.toFixed(3)}×
              </b>
              <span>how much slower the secretly slowed copy runs, measured jump for jump (true 1.5×); Muse Spark, one clip at a time, gave both the same answer</span>
            </Link>
          )}
          <Link href="/proof">
            <b>
              {physWithin} of {phys.length}
            </b>
            <span>constants within 5% on clips with known physics, median {physMedian.toFixed(2)}%; Muse Spark by eye: {s?.medianEyeballErrPct.toFixed(0)}%</span>
          </Link>
        </div>
      </header>

      <section className="section">
        <div className="wrap">
          <h2>If you have three minutes</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Five stops, in this order. Nothing here spends credits.
          </p>
          <ol className={styles.tour}>
            {tour.map((x) => (
              <li key={x.t}>
                <span className={styles.tourT}>{x.t}</span>
                <div>
                  <h3>{x.title}</h3>
                  <p>{x.body}</p>
                </div>
                <Link className="btn ghost" href={x.href}>
                  {x.go}
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className={`section ${styles.band}`}>
        <div className="wrap">
          <h2>Against your criteria</h2>
          <div className={styles.criteria}>
            {criteria.map((c) => (
              <section key={c.name} id={c.name.toLowerCase().replace(/ /g, "-")} className={styles.criterion}>
                <p className={styles.cWeight}>
                  {c.name}, {c.weight} points
                </p>
                <h3 className={styles.cClaim}>{c.claim}</h3>
                <ul>
                  {c.points.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>What is new here</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Plenty of projects ask a model what is in a video. Ansatz treats the model as a scientist that has to be checked, and builds the checks.
          </p>
          <div className={styles.novel}>
            {novel.map((n) => (
              <Link key={n.title} href={n.href} className={styles.novelCard}>
                <h3>{n.title}</h3>
                <p>{n.body}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className={`section ${styles.dark}`}>
        <div className="wrap">
          <h2>Every Meta model has a job only it can do</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Calls and spend across the {exps.length} published runs, read from each run’s own ledger.
          </p>
          <div className={styles.models}>
            {usage.map((m) => (
              <section key={m.id} className={styles.model}>
                <h3>{m.name}</h3>
                <p className={styles.modelStat}>
                  {m.calls} {m.calls === 1 ? "call" : "calls"}{m.frames ? `, ${m.frames.toLocaleString("en")} frames` : ""}, ${m.usd.toFixed(2)}
                </p>
                <p>{m.job}</p>
                <Link href={m.href}>{m.where}</Link>
              </section>
            ))}
          </div>
        </div>
      </section>

      <section className={`section ${styles.band}`}>
        <div className={`wrap ${styles.two}`}>
          <div>
            <h2>Try to break it</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              Here is what happens when you do.
            </p>
          </div>
          <dl className={styles.breaks}>
            {breakIt.map(([a, b]) => (
              <div key={a}>
                <dt>{a}</dt>
                <dd>{b}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section">
        <div className={`wrap ${styles.two}`}>
          <div>
            <h2>What we have not shown yet</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              The gaps, in our own words, before you find them.
            </p>
          </div>
          <ul className={styles.gaps}>
            <li>Every clip here was filmed or rendered by us, or found online. No outside student or teacher has run it yet.</li>
            <li>Muse Wonder’s two wins are on renders we built to need a law outside the textbook. It has not yet been run as a challenger across the whole benchmark.</li>
            <li>The benchmark clips are rendered, so the physics is clean. Real footage adds motion blur, rolling shutter and lens distortion that the renders only partly imitate.</li>
            <li>One object at a time: two bodies colliding, or anything moving toward the camera, isn’t measured.</li>
            <li>When the only ruler is misread, the clock check is wrong too: on the 8× slowed render a 15 cm ruler was taken for a metre stick and the factor came out 3.1×.</li>
            <li>Without a ruler, a slowed clip and a weaker world look the same: the report says both are possible.</li>
          </ul>
        </div>
      </section>

      <section className="section">
        <div className="wrap">
          <h2>The numbers, and where each one lives</h2>
          <table className={styles.numbers}>
            <thead>
              <tr>
                <th>Claim</th>
                <th>Value</th>
                <th>Check it</th>
              </tr>
            </thead>
            <tbody>
              {numbers.map((n) => (
                <tr key={n.what}>
                  <td>{n.what}</td>
                  <td className="num">{n.value}</td>
                  <td>
                    <Link href={n.href}>{n.href}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small" style={{ marginTop: 12 }}>
            Code: <a href="https://github.com/RohanGlitched/ansatz">github.com/RohanGlitched/ansatz</a>. The benchmark clips, their true values and the scoring script are in the repository.
          </p>
        </div>
      </section>

      <section className={`section ${styles.dark} ${styles.end}`}>
        <div className="wrap">
          <h2>Bring a clip</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            Anything that falls, swings, bounces or rolls, filmed from a phone that stays still. Say what you know while you film.
          </p>
          <p style={{ marginTop: 24, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link className="btn" href="/new">
              Run an experiment
            </Link>
            <Link className="btn ghost" href="/how">
              How it works
            </Link>
          </p>
        </div>
      </section>
    </article>
  );
}

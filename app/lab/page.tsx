import type { Metadata } from "next";
import Link from "next/link";
import { Noto_Serif_Devanagari } from "next/font/google";
import Plate, { Note, Page, Reading, Section } from "@/components/book/Plate";
import FalsifyPlate from "@/components/book/FalsifyPlate";
import Tex from "@/components/Tex";
import { getExperiment, showcaseIds, winnerOf } from "@/lib/experiments";
import type { Experiment } from "@/lib/experiment";
import { plateLaws } from "@/lib/plateLaws";
import { printOf } from "@/app/x/prints";
import { runTime, runTimeText } from "@/app/runtime";
import sw from "@/data/bench/pendulum-stopwatch.json";
import synth from "@/data/bench/synth.json";
import series from "@/data/series/pendulum-lengths.json";
import { CBSE_2526_URL, CBSE_URL, NCERT_BASE, NCERT_CONTENTS, PRACTICALS, cbseLabel, statusWord, type Practical } from "./practicals";
import { SHEETS } from "./sheets";
import Worksheet from "./Worksheet";
import PrintControls from "./PrintControls";
import styles from "./lab.module.css";

export const metadata: Metadata = {
  title: "For teachers: the Class XI motion practicals",
  description:
    "The motion practicals in the CBSE Class XI syllabus and the NCERT lab manual, each mapped to the Ansatz run that already does it, with what to film, what to tape to the wall, the accuracy from the stored runs, a printable worksheet in English and Hindi, and a 40-minute lesson plan.",
  alternates: { canonical: "/lab" },
};

// reads only the runs and benchmark files that ship with the site
export const revalidate = 3600;

const deva = Noto_Serif_Devanagari({ subsets: ["devanagari"], weight: ["400", "700"], variable: "--font-deva", display: "swap" });

/** Runs whose Hindi translation ships with the site; only these get a Hindi report link (no translation is made on demand). */
const HINDI = new Set(["hindi-pendulum", "big-swing", "spring", "beach-ball-drag", "aachen-pendulum-50cm"]);

type Check = { quantity: string; truth: number; measured: number; sigma: number | null; errPct: number };
type Row = { id: string; phenomenon: string; family?: { ok: boolean | null }; checks: Check[] };

const pct = (x: number, d = 2) => `${Math.abs(x).toFixed(d)}%`;
const signed = (x: number, d = 1) => `${x < 0 ? "−" : "+"}${Math.abs(x).toFixed(d)}%`;
const anchorOf = (p: Practical) => `p-${p.cbse.section}${p.cbse.kind === "Activity" ? "act" : "exp"}${p.cbse.n}`.toLowerCase();

export default async function LabPage() {
  const ids = ["pendulum-40cm", "pendulum-60cm", "pendulum-80cm", "pendulum-100cm", "hindi-pendulum", "aachen-pendulum-50cm", "big-swing", "spring", "beach-ball-drag"];
  const exps = (await Promise.all(ids.map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => e != null);
  const by = (id: string) => exps.find((e) => e.id === id);
  const comp = (id: string, param: string) => by(id)?.comparisons.find((c) => c.param === param);
  // how long a run takes, over every published run, as the other pages quote it (not only the runs on this page)
  const allRuns = (await Promise.all((await showcaseIds()).map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => e != null);
  const rt = runTime(allRuns);

  // the pendulum practical: periods, g from L against T², and the seconds pendulum (T = 2 s, so L = g/π²)
  const tapeSigma = Math.hypot(sw.tape.sgScatter, sw.tape.sgTape);
  const secLen = sw.tape.g / Math.PI ** 2;
  const secLenSigma = tapeSigma / Math.PI ** 2;
  const secLenSheet = sw.sheet.g / Math.PI ** 2;
  const secLenTrue = series.truth.g / Math.PI ** 2;
  const relT = sw.ansatzRelTpct;
  const aachen = comp("aachen-pendulum-50cm", "g");
  const hindi = comp("hindi-pendulum", "g");
  const sheetRuns = series.ids.map((id) => ({ id, L: series.tape[id as keyof typeof series.tape], g: comp(id, "g") })).filter((r) => r.g);

  // dissipation: the damping rate γ in θ'' = −(g/L) sin θ − γθ'; energy, as amplitude², decays as e^(−γt)
  const swing = comp("big-swing", "gamma");
  const halfLife = swing ? Math.LN2 / swing.measured : NaN;
  const rows = synth.rows as unknown as Row[];
  const damp = rows.filter((r) => r.phenomenon === "pendulum").flatMap((r) => r.checks.filter((c) => c.quantity === "damping"));
  const dampWorst = Math.max(...damp.map((c) => Math.abs(c.errPct)));
  const p80 = by("pendulum-80cm");
  const p80Gamma = p80 ? winnerOf(p80).fit : null;

  // the spring: ω₀ needs no ruler
  const om = comp("spring", "omega0");
  const springT = om ? (2 * Math.PI) / om.measured : NaN;
  const omBench = rows.filter((r) => r.phenomenon === "spring_mass").flatMap((r) => r.checks.filter((c) => c.quantity === "omega0"));
  const omWorst = Math.max(...omBench.map((c) => Math.abs(c.errPct)));

  // the throw: drag measured, and the vacuum law refuted by the unseen part of the flight
  const drag = comp("beach-ball-drag", "c");
  const ball = by("beach-ball-drag");
  const vacuum = ball?.candidates.find((c) => c.law.id === "vacuum" || c.origin === "control");
  const ballWin = ball ? winnerOf(ball) : undefined;
  const throws = rows.filter((r) => r.phenomenon === "projectile");
  const throwsRight = throws.filter((r) => r.family?.ok).length;

  // the lesson's plate: the 80 cm pendulum, where the textbook law gets the period and still misses the swing
  const ideal = p80?.candidates.filter((c) => c.origin === "control" || /ideal|small/i.test(c.law.id)).sort((a, b) => (b.fit.testZ ?? 0) - (a.fit.testZ ?? 0))[0];
  const p80Win = p80 ? winnerOf(p80) : undefined;

  const counts = { covered: PRACTICALS.filter((p) => p.status === "covered"), part: PRACTICALS.filter((p) => p.status === "part"), not: PRACTICALS.filter((p) => p.status === "not") };
  const words = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  const w = (n: number) => words[n] ?? String(n);
  const anchorLine = `${w(counts.covered.length).replace(/^./, (c) => c.toUpperCase())} of the ${w(PRACTICALS.length)} Class XI practicals about motion and force, in full, today, with these runs; ${w(counts.part.length)} more in part.`;
  const ncertHref = (file: string) => `${NCERT_BASE}${file}`;

  const cards: { p: Practical; id: string; fig: string; reading: React.ReactNode; report: string }[] = [
    {
      p: PRACTICALS.find((p) => p.cbse.section === "A" && p.cbse.kind === "Experiment" && p.cbse.n === 7)!,
      id: "pendulum-80cm",
      fig: "The simple pendulum, four lengths",
      reading: <Reading value={sw.tape.g.toFixed(2)} pm={tapeSigma.toFixed(2)} unit="m/s²" tone="measured" label={`g from L against T², four rendered lengths (true ${series.truth.g}); ${pct(sw.tape.offPct)} off`} />,
      report: "pendulum-80cm",
    },
    {
      p: PRACTICALS.find((p) => p.cbse.kind === "Activity" && p.cbse.n === 7)!,
      id: "big-swing",
      fig: "Energy dissipated by a pendulum",
      reading: swing ? <Reading value={swing.measured.toFixed(4)} pm={swing.sigma.toFixed(4)} unit="1/s" tone="measured" label={`damping rate γ on a rendered swing (true ${swing.reference}); ${pct(swing.errorPct)} off`} /> : null,
      report: "big-swing",
    },
    {
      p: PRACTICALS.find((p) => p.cbse.section === "B" && p.cbse.n === 2)!,
      id: "spring",
      fig: "A spring, by oscillation",
      reading: om ? <Reading value={om.measured.toFixed(4)} pm={om.sigma.toFixed(4)} unit="rad/s" tone="measured" label={`ω₀ = √(k/m) on a rendered spring (true ${om.reference.toFixed(3)}); no ruler needed`} /> : null,
      report: "spring",
    },
    {
      p: PRACTICALS.find((p) => p.cbse.kind === "Activity" && p.cbse.n === 5)!,
      id: "beach-ball-drag",
      fig: "One throw, its law and its drag",
      reading: drag ? <Reading value={drag.measured.toFixed(3)} pm={drag.sigma.toFixed(3)} unit="1/m" tone="measured" label={`air-drag constant of a rendered throw (true ${drag.reference}); ${pct(drag.errorPct)} off`} /> : null,
      report: "beach-ball-drag",
    },
  ];

  const lesson: { t: string; title: string; body: React.ReactNode; go?: { label: string; href: string } }[] = [
    {
      t: "0–4",
      title: "Ask before anything",
      body: (
        <>
          Put Plate II on the projector with the line at 30%. Write <Tex>{"T = 2\\pi\\sqrt{L/g}"}</Tex> on the board and ask: will this law predict the rest of the swing? Every student writes yes or no, and one reason, on the back of the worksheet.
        </>
      ),
      go: { label: "Plate II", href: "#plate" },
    },
    {
      t: "4–10",
      title: "Move the line",
      body: (
        <>
          Drag the line to 70%, slowly. Each law is refitted to the swing left of the line and must predict the part to its right. The ideal pendulum keeps the period and is struck through anyway
          {ideal ? `: it misses the unseen swing by ${Math.round(ideal.fit.testZ ?? NaN)} times the measurement noise` : ""}, because the swing dies away; the damped law
          {p80Win ? ` stays within ${(p80Win.fit.testZ ?? NaN).toFixed(1)} times the noise` : " stays within the noise"}. A law can get the period right and still be wrong.
        </>
      ),
    },
    {
      t: "10–14",
      title: "Read one report",
      body: <>Open the 80 cm pendulum&rsquo;s printable report. Read aloud what was given (the A4 sheet&rsquo;s size, the length) and what was measured (g and γ, each with its ±). Ask which numbers came from the person filming.</>,
      go: { label: "The report", href: "/x/pendulum-80cm/report" },
    },
    {
      t: "14–26",
      title: "Film, four lengths",
      body: (
        <>
          Groups of four, one length each: 40, 60, 80 and 100 cm, measured with the metre scale from the point of suspension to the centre of the bob. A4 sheet on the wall, phone on books, ten swings. Upload with the class link and type the length in the box (or say it aloud while filming); class links start in lite mode: no Muse Spark or Muse Wonder, and Muse Voice Transcribe only listens for a spoken length. Fill Table 1. No phones or no network: use the four stored runs of the series instead.
        </>
      ),
      go: { label: "Make a class link", href: "/class/new" },
    },
    {
      t: "26–33",
      title: "Plot L against T²",
      body: <>Each group writes its L and T on the board. Everyone plots L against T² on page 2 of the worksheet, draws the best line, and reads g = 4π² × slope and the seconds pendulum&rsquo;s length at T² = 4 s².</>,
    },
    {
      t: "33–37",
      title: "Compare with the series",
      body: (
        <>
          Open the series page: with tape lengths it gives g = {sw.tape.g.toFixed(2)} m/s², and with only the A4 sheet for a ruler {sw.sheet.g.toFixed(2)} ({signed(sw.sheet.offPct)}). Ask why the sheet costs more than the stopwatch it replaced: a sheet&rsquo;s size is assumed, and its edge is read a few percent short.
        </>
      ),
      go: { label: "One pendulum, four lengths", href: "/series/pendulum-lengths" },
    },
    {
      t: "37–40",
      title: "Exit question, and homework",
      body: <>Question 1 on the worksheet, answered in two lines before leaving: why grade a law on the last 30% it was never fitted to? Homework: the Activity 7 extension, γ from the report and the time for the energy to halve.</>,
    },
  ];

  const notYet = counts.not;

  return (
    <article className={styles.lab}>
      {/* on paper only the worksheet (or, when chosen, the lesson plan) prints: the site's bar, footer and plates stay on screen */}
      <style>{PRINT_CSS}</style>

      <header className={styles.title}>
        <div className={styles.titleText}>
          <p className={styles.kicker}>For teachers</p>
          <h1>The Class XI motion practicals, with a phone</h1>
          <p className={styles.abstract}>
            Every practical about motion and force in the CBSE Class XI syllabus and the NCERT lab manual, checked against both documents, and for each one: whether Ansatz does it today, the run that already does it, what the student films, what to tape to the wall, how accurate the stored runs were, and the report that prints. Then a two-page worksheet in English and Hindi, and a 40-minute lesson built on the Falsification Plate.
          </p>
          <p className={styles.anchor}>{anchorLine}</p>
          <PrintControls
            className={styles.cta}
            parts={[
              { part: "both", label: "Print the worksheet", primary: true },
              { part: "plan", label: "Print the lesson plan" },
            ]}
          />
          <p className={styles.headNote}>
            Checked on 2 November 2026 against the CBSE physics curriculum for 2026-27 and the NCERT <em>Laboratory Manual: Physics, Class XI</em>; every row links to its page in §1. No teacher has used this page yet (§6).
          </p>
        </div>

        <nav className={styles.board} aria-label="The practicals, by what Ansatz does for them">
          <p className={styles.boardHead}>
            Class XI, motion and force <span>{PRACTICALS.length} practicals</span>
          </p>
          <ol>
            {PRACTICALS.map((p) => (
              <li key={anchorOf(p)} data-status={p.status}>
                <a href={`#${anchorOf(p)}`}>
                  <span className={styles.boardRef}>{cbseLabel(p)}</span>
                  <span className={styles.boardTitle}>{p.title}</span>
                  <span className={styles.boardStatus}>{statusWord[p.status]}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <Page>
        <nav className={styles.toc} aria-label="On this page">
          <ol>
            <li><a href="#syllabus">What the syllabus asks for</a></li>
            <li><a href="#steps">Each practical, step by step</a></li>
            <li><a href="#not-yet">What it does not do yet</a></li>
            <li><a href="#lesson">A 40-minute lesson</a></li>
            <li><a href="#worksheet">The worksheet, English and Hindi</a></li>
            <li><a href="#honest">What this is not yet</a></li>
          </ol>
        </nav>

        <Section n={1} title="What the syllabus asks for" id="syllabus">
          <p>
            The CBSE Class XI practical record needs at least eight experiments and six activities, from two sections. Nine of them are about motion and force. Here they are in the order CBSE lists them, with the NCERT lab manual&rsquo;s own entry for each, and what Ansatz does for it today. A practical is &ldquo;covered&rdquo; only where a published run already does what it asks and its numbers can be checked.
          </p>
        </Section>
        <Note who="The two documents">
          <a href={CBSE_URL}>CBSE, Physics (042), curriculum 2026-27</a>, Class XI practicals, PDF pp. 7–9; the same list as <a href={CBSE_2526_URL}>2025-26</a>. <a href={NCERT_CONTENTS}>NCERT lab manual, Class XI, contents</a>; each chapter is linked in its row.
        </Note>
      </Page>

      <div className={styles.tableBlock}>
        <table className={`journal ${styles.practicals}`}>
          <thead>
            <tr>
              <th scope="col">CBSE</th>
              <th scope="col">The practical</th>
              <th scope="col">NCERT lab manual</th>
              <th scope="col">Ansatz today</th>
            </tr>
          </thead>
          <tbody>
            {PRACTICALS.map((p) => (
              <tr key={anchorOf(p)} id={anchorOf(p)} data-status={p.status}>
                <td className={styles.ref} data-label="CBSE">
                  {cbseLabel(p)}
                  <a className={styles.pg} href={`${CBSE_URL}#page=${p.cbse.page}`}>
                    p. {p.cbse.page}
                  </a>
                </td>
                <td className={styles.ptitle}>{p.title}</td>
                <td className={`${styles.ref} ${styles.ncertCol}`} data-label="NCERT">
                  {p.ncert.length === 0 ? (
                    <span className={styles.sub}>not in the manual</span>
                  ) : (
                    p.ncert.map((n) => (
                      <span key={n.ref} className={styles.ncert}>
                        <a href={ncertHref(n.file)}>
                          {n.ref}, p. {n.page}
                        </a>
                        {n.note && <span className={styles.sub}>{n.note}</span>}
                      </span>
                    ))
                  )}
                </td>
                <td className={styles.today} data-label="Ansatz today">
                  <span className={styles.status} data-status={p.status}>
                    {statusWord[p.status]}
                  </span>
                  <span>{p.today}</span>
                  {p.runs.length > 0 && (
                    <span className={styles.runs}>
                      {p.runs.map((r) => (
                        <Link key={r.href} href={r.href}>
                          {r.label}
                        </Link>
                      ))}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.tableNote}>
          Titles are paraphrased; the numbers and pages are the documents&rsquo;. Free fall is not on the Class XI practical list. The rest of Section B (elasticity, heat, sound, fluids at rest) has nothing that moves across a frame, so it is left out.
        </p>
      </div>

      <Plate
        n="I"
        id="covered"
        title="The four practicals Ansatz does today, two in full and two in part, each with the run that already does it."
        caption="Each print lays a run's frames over one another, as Marey photographed motion. The number under it is that run's own, read from the stored record."
      >
        <ul className={styles.cards}>
          {cards.map((c) => (
            <li key={c.id} className={styles.card}>
              <Link href={`/x/${c.id}`} className={styles.cardPrint}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={printOf(c.id)} alt="" className={styles.print} loading="lazy" decoding="async" />
              </Link>
              <p className={styles.fig}>
                {cbseLabel(c.p)} · {statusWord[c.p.status]}
              </p>
              <h3 className={styles.cardTitle}>{c.fig}</h3>
              {c.reading}
              <p className={styles.cardGo}>
                <Link href={`/x/${c.id}`}>The run</Link>
                <a href={`/x/${c.report}/report`}>Lab report to print</a>
                {HINDI.has(c.report) && <a href={`/x/${c.report}/report?lang=hi`}>हिंदी में रिपोर्ट</a>}
              </p>
            </li>
          ))}
        </ul>
      </Plate>

      <Page>
        <Section n={2} title="Each practical, step by step" id="steps">
          <p>For each practical Ansatz covers, the run to open first, what the student films, what goes up on the wall, how accurate the stored runs were, and the page that prints. Every number below is read from a stored run or a benchmark file when this page is built.</p>
        </Section>

        <section className={styles.step} id="pendulum">
          <p className={styles.stepRef}>
            Section A, Experiment 7 · NCERT E6 · <span className={styles.statusInline} data-status="covered">{statusWord.covered}</span>
          </p>
          <h3>The simple pendulum: L against T², g, and the seconds pendulum</h3>
          <dl className={styles.facts}>
            <div>
              <dt>Open first</dt>
              <dd>
                <Link href="/series/pendulum-lengths">One pendulum, four lengths</Link>: four clips of the same pendulum, each measured on its own, then fitted together for g from the slope of L against T². Single runs: <Link href="/x/pendulum-40cm">40</Link>, <Link href="/x/pendulum-60cm">60</Link>, <Link href="/x/pendulum-80cm">80</Link> and <Link href="/x/pendulum-100cm">100 cm</Link>; <Link href="/x/hindi-pendulum">the same practical narrated in Hindi</Link>; and <Link href="/x/aachen-pendulum-50cm">a 50 cm pendulum a stranger filmed in Aachen</Link>, the real-footage check.
              </dd>
            </div>
            <div>
              <dt>The student films</dt>
              <dd>The bob swinging across the frame, side on, from a phone propped still on books 1.5 to 2 m away, for at least ten swings. A small swing: the bob pulled aside no more than a tenth of the length. Typing the length in the box when uploading sets it as a given, quoted in the report; saying it aloud while filming works too, in any of the seven languages.</dd>
            </div>
            <div>
              <dt>Tape up</dt>
              <dd>An A4 sheet, flat on the wall behind the bob, in the plane of the swing: its long side (29.7 cm) is the ruler. Better still, measure L with the metre scale, from the point of suspension to the centre of the bob, and type it in the box (or say it): the series shows why.</dd>
            </div>
            <div>
              <dt>How accurate</dt>
              <dd>
                Periods to {relT.min}–{relT.max}% on the four renders, against about {sw.stopwatch.relTpct}% for a stopwatch over {sw.stopwatch.swings} swings (a typical-reaction-time estimate of {sw.stopwatch.reactionS} s, not a measurement). With tape lengths, g = {sw.tape.g.toFixed(2)} ± {tapeSigma.toFixed(2)} m/s², {pct(sw.tape.offPct)} from the true {series.truth.g}. With only the A4 sheet for a ruler, {sw.sheet.g.toFixed(2)} m/s² ({signed(sw.sheet.offPct)}): the sheet&rsquo;s size is assumed and SAM 3.1 reads its edge a few percent short. The seconds pendulum&rsquo;s length, g/π² at T = 2 s: {secLen.toFixed(3)} ± {secLenSigma.toFixed(3)} m with tape lengths (true {secLenTrue.toFixed(3)} m), {secLenSheet.toFixed(3)} m from the sheet alone.
                {aachen ? ` On real footage, the Aachen pendulum, told only “about fifty centimetres”: g = ${aachen.measured.toFixed(2)} ± ${aachen.sigma.toFixed(2)} m/s², ${pct(aachen.errorPct)} off.` : ""}
                {hindi ? ` The Hindi-narrated render: g = ${hindi.measured.toFixed(2)} ± ${hindi.sigma.toFixed(2)} m/s².` : ""}
              </dd>
            </div>
            <div>
              <dt>Print</dt>
              <dd>
                <a href="/x/pendulum-80cm/report">The 80 cm run&rsquo;s lab report</a> (aim, method, observations, result, errors, with spaces for name, class and roll number); <a href="/x/hindi-pendulum/report?lang=hi">the Hindi run&rsquo;s report in Hindi</a>; the <a href="#worksheet">worksheet</a> for the whole practical.
              </dd>
            </div>
          </dl>
        </section>
        <Note who="From data/bench/pendulum-stopwatch.json">
          The four renders&rsquo; true lengths stand in for a student&rsquo;s tape, read to ±{sw.tape.tapeSigmaM * 1000} mm by assumption. Renders are cleaner than phone footage, so real periods will be less precise.
        </Note>

        {sheetRuns.length > 0 && (
          <table className={`journal ${styles.mini}`}>
            <caption>Each length on its own, with the A4 sheet as the only ruler</caption>
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col" className="r">True length</th>
                <th scope="col" className="r">g, sheet only (m/s²)</th>
                <th scope="col" className="r">Off 9.807</th>
              </tr>
            </thead>
            <tbody>
              {sheetRuns.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/x/${r.id}`}>{by(r.id)?.title ?? r.id}</Link>
                  </td>
                  <td className="r num">{r.L.toFixed(2)} m</td>
                  <td className="r num">
                    {r.g!.measured.toFixed(2)} ± {r.g!.sigma.toFixed(2)}
                  </td>
                  <td className="r num">{signed(r.g!.errorPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <section className={styles.step} id="dissipation">
          <p className={styles.stepRef}>
            Section A, Activity 7 · NCERT A7 · <span className={styles.statusInline} data-status="covered">{statusWord.covered}</span>
          </p>
          <h3>Energy dissipated by a pendulum: amplitude squared against time</h3>
          <dl className={styles.facts}>
            <div>
              <dt>Open first</dt>
              <dd>
                <Link href="/x/big-swing">A 70° swing whose damping is known</Link>, then <Link href="/x/pendulum-80cm">the 80 cm pendulum</Link>. Every pendulum run fits <Tex>{"\\ddot\\theta = -\\tfrac{g}{L}\\sin\\theta - \\gamma\\dot\\theta"}</Tex> when that law wins, so γ comes with its ±.
              </dd>
            </div>
            <div>
              <dt>The student films</dt>
              <dd>The same clip as the pendulum practical, kept running for 20 to 30 seconds so the swing visibly shrinks. The manual&rsquo;s amplitude-by-eye readings at every fifth swing become every frame of the clip.</dd>
            </div>
            <div>
              <dt>Tape up</dt>
              <dd>Nothing extra. γ is a rate, so it needs no ruler: the 70° swing was measured as an angle.</dd>
            </div>
            <div>
              <dt>How accurate</dt>
              <dd>
                {swing ? `On the 70° render, γ = ${swing.measured.toFixed(4)} ± ${swing.sigma.toFixed(4)} per second against a true ${swing.reference}, ${pct(swing.errorPct)} off. The energy goes as the amplitude squared and falls as exp(−γt), so it halves every ln 2/γ = ${halfLife.toFixed(1)} s. ` : ""}
                On the {damp.length} rendered pendulums of the benchmark, every damping rate came within {dampWorst.toFixed(1)}% of the truth.
                {p80Gamma ? ` The 80 cm run: γ = ${p80Gamma.theta.gamma.toFixed(4)} ± ${p80Gamma.sigma.gamma.toFixed(4)} per second.` : ""}
              </dd>
            </div>
            <div>
              <dt>Print</dt>
              <dd>
                <a href="/x/big-swing/report">The 70° swing&rsquo;s report</a>, also <a href="/x/big-swing/report?lang=hi">in Hindi</a>; the worksheet&rsquo;s extension box on page 2.
              </dd>
            </div>
          </dl>
        </section>
        <Note who="Why γ is the activity's rate">With θ&#776; = −(g/L) sin θ − γθ&#775;, the amplitude decays as <i>e</i><sup>−γt/2</sup> and its square as <i>e</i><sup>−γt</sup>: the curve the manual plots, a straight line on a log scale.</Note>

        <section className={styles.step} id="spring">
          <p className={styles.stepRef}>
            Section B, Experiment 2 · NCERT E10 · <span className={styles.statusInline} data-status="part">{statusWord.part}</span>
          </p>
          <h3>A spring&rsquo;s force constant, by the oscillation method</h3>
          <dl className={styles.facts}>
            <div>
              <dt>Open first</dt>
              <dd>
                <Link href="/x/spring">A damped spring</Link>. The CBSE list asks for load against extension, which is static; the NCERT manual&rsquo;s E10 finds the force constant from oscillations, T² against m, and that is what a clip can give.
              </dd>
            </div>
            <div>
              <dt>The student films</dt>
              <dd>A mass on a vertical spring bouncing across the frame, side on, for ten or more oscillations; one clip per mass. Weigh each mass on the balance first.</dd>
            </div>
            <div>
              <dt>Tape up</dt>
              <dd>Nothing. ω₀ is a rate: the spring run was measured in pixels, with no ruler at all. Then k = mω₀², with m from the balance.</dd>
            </div>
            <div>
              <dt>How accurate</dt>
              <dd>
                {om ? `ω₀ = ${om.measured.toFixed(4)} ± ${om.sigma.toFixed(4)} rad/s against a true ${om.reference.toFixed(4)}, ${pct(om.errorPct, 3)} off, so T = ${springT.toFixed(4)} s. ` : ""}
                On the {omBench.length} rendered springs of the benchmark, every ω₀ came within {omWorst.toFixed(3)}%. What is missing: T² against m needs one clip per mass, and the effective mass of the spring comes from that line&rsquo;s intercept. No such set has been run.
              </dd>
            </div>
            <div>
              <dt>Print</dt>
              <dd>
                <a href="/x/spring/report">The spring&rsquo;s report</a>, also <a href="/x/spring/report?lang=hi">in Hindi</a>.
              </dd>
            </div>
          </dl>
        </section>

        <section className={styles.step} id="projectile">
          <p className={styles.stepRef}>
            Section A, Activity 5 · NCERT A5 · <span className={styles.statusInline} data-status="part">{statusWord.part}</span>
          </p>
          <h3>A projectile: one throw today, range against angle not yet</h3>
          <dl className={styles.facts}>
            <div>
              <dt>Open first</dt>
              <dd>
                <Link href="/x/beach-ball-drag">A throw with air drag</Link>: the vacuum projectile of the textbook against laws with drag, all fitted to the start of the flight and graded on the rest.
              </dd>
            </div>
            <div>
              <dt>The student films</dt>
              <dd>A ball thrown across the frame, with the phone far enough back to see the whole arc. For range against angle, one clip per angle; that set has not been run. The NCERT activity uses a jet of water, which is not one object, so SAM 3.1 cannot follow it: use a ball.</dd>
            </div>
            <div>
              <dt>Tape up</dt>
              <dd>An A4 sheet or the metre scale in the plane of the throw, for a range in metres. Without one, the fall itself sets the scale, with Earth&rsquo;s g taken as given, as on this run.</dd>
            </div>
            <div>
              <dt>How accurate</dt>
              <dd>
                {drag ? `Drag constant ${drag.measured.toFixed(4)} ± ${drag.sigma.toFixed(4)} per metre against a true ${drag.reference}, ${pct(drag.errorPct)} off. ` : ""}
                {vacuum && ballWin ? `The textbook vacuum projectile missed the unseen flight by ${Math.round(vacuum.fit.testZ ?? NaN)} times the noise; the drag law, by ${(ballWin.fit.testZ ?? NaN).toFixed(1)}. ` : ""}
                On the {throws.length} drag-free throws of the benchmark, the winning law had the right physics {throwsRight === throws.length ? "both times" : `${throwsRight} times`}. No range-against-angle accuracy exists yet.
              </dd>
            </div>
            <div>
              <dt>Print</dt>
              <dd>
                <a href="/x/beach-ball-drag/report">The throw&rsquo;s report</a>, also <a href="/x/beach-ball-drag/report?lang=hi">in Hindi</a>.
              </dd>
            </div>
          </dl>
        </section>

        <Section n={3} title="What it does not do yet" id="not-yet">
          <p>
            {w(notYet.length).replace(/^./, (c) => c.toUpperCase())} of the nine are not covered. Two are static measurements Ansatz has no part in; the others could be filmed but have not been run, so there is no accuracy to promise.
          </p>
          <ul className={styles.gaps}>
            {notYet.map((p) => (
              <li key={anchorOf(p)}>
                <b>
                  {cbseLabel(p)}, {p.title.charAt(0).toLowerCase() + p.title.slice(1)}.
                </b>{" "}
                {p.today}
              </li>
            ))}
            <li>
              <b>What the two covered in part still lack.</b> Range against angle, and the spring&rsquo;s T² against m, need a set of clips each; neither set has been run.
            </li>
          </ul>
        </Section>
        <Note who="One object at a time">Ansatz follows one object crossing the frame. Two bodies colliding, or motion toward the camera, is not measured.</Note>
      </Page>

      {p80 && (
        <Plate
          n="II"
          id="plate"
          title="The lesson's centrepiece: the 80 cm pendulum. Drag the line: every law sees only the swing to its left and must predict the rest."
          caption={<>The textbook pendulum keeps the period and is still struck through, because the swing dies away; the damped law predicts that. Each position of the line is a full refit by the same code a run uses. No model is called.</>}
        >
          <FalsifyPlate id={p80.id} video={p80.source.video} t0={p80.measured.window.t0} laws={plateLaws(p80)} />
        </Plate>
      )}

      <Page>
        <Section n={4} title="A 40-minute lesson" id="lesson">
          <p>One period, one projector, phones in groups of four. Built on Plate II above; it works without phones too, from the stored runs. Minute marks are from the bell.</p>
        </Section>
        <Note who="What it needs">A projector or a large screen, the printed worksheet, a metre scale, an A4 sheet and a bob on a thread per group. A run takes {runTimeText(rt)}.</Note>
      </Page>

      <div className={styles.planWrap} data-print-part="plan">
        <p className={styles.planPrintHead}>A 40-minute lesson on the simple pendulum, built on the Falsification Plate · ansatz-lab.vercel.app/lab</p>
        <ol className={styles.plan}>
          {lesson.map((x) => (
            <li key={x.t}>
              <span className={styles.planT}>
                {x.t}
                <small>min</small>
              </span>
              <div>
                <h3>{x.title}</h3>
                <p>{x.body}</p>
              </div>
              {x.go && (
                <Link className={`btn ghost ${styles.planGo}`} href={x.go.href}>
                  {x.go.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </div>

      <Page>
        <Section n={5} title="The worksheet, two pages, in English and Hindi" id="worksheet">
          <p>
            For the pendulum practical, with the dissipation activity as an extension. It carries no numbers of ours: the student writes their own lengths and Ansatz&rsquo;s periods, plots both graphs by hand, and checks their g against the report&rsquo;s. Print it as it is, or one language at a time.
          </p>
          <PrintControls
            className={styles.cta}
            parts={[
              { part: "en", label: "Print in English", primary: true },
              { part: "hi", label: "हिंदी में प्रिंट करें" },
              { part: "both", label: "Print both" },
            ]}
          />
        </Section>
        <Note who="Hindi">Written by us in the register of the Hindi reports on the site, and not yet read by a Hindi-medium teacher.</Note>
      </Page>

      <div className={styles.wsWrap} data-print-part="ws">
        <Worksheet s={SHEETS.en} />
        <Worksheet s={SHEETS.hi} fontClass={`${deva.variable} ${styles.deva}`} />
      </div>

      <Page>
        <Section n={6} title="What this is not yet" id="honest">
          <ul className={styles.gaps}>
            <li>No teacher or student has used this page, the worksheet or the lesson plan yet. Nothing here has been tried in a classroom.</li>
            <li>
              The accuracy figures come from clips we rendered with known physics, and from strangers&rsquo; public footage (the Aachen pendulum{aachen ? `, ${pct(aachen.errorPct)} off` : ""}); none comes from a student&rsquo;s phone in a school lab. Phone footage adds blur, shake and a ruler read by eye, so expect less than the renders.
            </li>
            <li>Covered means a published run already does what the practical asks. It is not a claim that CBSE or NCERT has reviewed or accepts Ansatz for the practical record.</li>
            <li>A run needs the internet and is paid for by us, within daily limits; a class link gives a class its own runs for a week. Without a connection, the stored runs on this page still work for the lesson.</li>
            <li>
              Who it is for: an analysis of UDISE+ 2025-26 counts about 1.25 lakh of India&rsquo;s 2.96 lakh schools with secondary classes that have no integrated science lab (<a href="https://educationforallinindia.com/integrated-science-laboratories-in-secondary-schools-in-india-udise-2025-26/">Education for All in India</a>). What this page shows for them is narrower: {anchorLine.charAt(0).toLowerCase() + anchorLine.slice(1)}
            </li>
          </ul>
        </Section>
        <Note who="Where the numbers live">
          <Link href="/proof">Proof</Link> holds the benchmark; <Link href="/proof#strangers">footage from strangers</Link> the real clips, misses included.
        </Note>
      </Page>

      <Plate n="III" id="take-it" title="Take it to class.">
        <div className={styles.close}>
          <p>Print the worksheet, make a class link, and put Plate II on the projector. If the network fails, the four stored pendulum runs and their reports carry the whole lesson. <Link href="/class/demo23">The demo class page</Link> shows what a teacher gets back; its Students A to F are our rendered clips, not real students, and no class has used Ansatz yet.</p>
          <div className={styles.closeCta}>
            <Link className="btn" href="/class/new">
              Make a class link
            </Link>
            <Link className="btn ghost" href="/series/pendulum-lengths">
              One pendulum, four lengths
            </Link>
            <Link className="btn ghost" href="/new">
              Run an experiment
            </Link>
          </div>
        </div>
      </Plate>
    </article>
  );
}

/*
 * The print stylesheet. By default the worksheet prints, both languages, four A4 pages; PrintControls can narrow it to
 * one language (data-print="en" | "hi") or switch to the lesson plan (data-print="plan").
 */
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 12mm 13mm; }
  body > header, body > footer, body > a, body > nav, body > aside { display: none !important; }
  body { background: #fff !important; font-size: 10.5pt; }
  main > article > *:not([data-print-part="ws"]) { display: none !important; }
  html[data-print="plan"] main > article > [data-print-part="ws"] { display: none !important; }
  html[data-print="plan"] main > article > [data-print-part="plan"] { display: block !important; }
  html[data-print="en"] [data-print-part="ws"] [data-lang="hi"],
  html[data-print="hi"] [data-print-part="ws"] [data-lang="en"] { display: none !important; }
  html[data-print="en"] [data-lang="en"] > section:last-child { break-after: auto !important; page-break-after: auto !important; }
}
`;


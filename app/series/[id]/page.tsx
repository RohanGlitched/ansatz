import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Plate, { Note, Page, Section } from "@/components/book/Plate";
import PipelineLight from "@/components/PipelineLight";
import { getExperiment, winnerOf } from "@/lib/experiments";
import { getSeries as series } from "@/lib/series";
import { fitSeries, seriesPoint, stopwatch, STOPWATCH, TAPE_SIGMA_M, type SeriesPoint } from "@/lib/seriesfit";
import { saveTape } from "./actions";
import styles from "./series.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = await series((await params).id);
  // a missing series is a real 404, rendered on the server
  if (!s) notFound();
  return { title: s.title, description: "A pendulum at several lengths: g from the slope of L against T², the school practical done by video.", alternates: { canonical: `/series/${s.id}` } };
}

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;

/** Several runs of one experiment at different lengths, fitted together the way a school practical asks: L against T². A short paper. */
export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await series((await params).id);
  if (!s) notFound();
  const runs = (await Promise.all(s.ids.map((id) => getExperiment(id).catch(() => null)))).filter((e) => !!e);
  // each run: T from its fitted law; L from the tape when the student gave one (else a length said in the clip, else the sheet)
  const both = runs.map((e) => ({ e, tape: seriesPoint(e, winnerOf(e), s.tape?.[e.id]), sheet: seriesPoint(e, winnerOf(e)) }));
  const pts = both.map((b) => b.tape).filter((p): p is SeriesPoint => !!p);
  const sheetPts = both.map((b) => b.sheet).filter((p): p is SeriesPoint => !!p && p.lengthFrom === "sheet");
  const editable = /^s-[a-z2-9]{8}$/.test(s.id);
  if (pts.length < 2)
    return (
      <>
        <header className={styles.title}>
          <div>
            <p className={styles.kicker}>A series in progress</p>
            <h1>{s.title}</h1>
          </div>
          <div className={styles.abstract}>
            <p>
              {pts.length} pendulum length{pts.length === 1 ? "" : "s"} so far. A series needs at least two, ideally four (say 40, 60, 80 and 100 cm): film the same pendulum at each length from this link, and type the length you measured with a metre scale under each run. No tape? Keep a paper sheet on the wall and Ansatz reads the length from it, within about 6%.
            </p>
            <p className={styles.cta}>
              <Link className="btn" href={`/new?series=${s.id}`}>
                Add a length
              </Link>
              <Link href="/series/pendulum-lengths">See a finished series</Link>
            </p>
          </div>
        </header>
        {editable && runs.length > 0 && (
          <Page className={styles.page}>
            <TapeForms s={s} runs={runs.map((e) => ({ id: e.id, title: e.title }))} />
          </Page>
        )}
      </>
    );
  const fit = fitSeries(pts);
  const allTape = pts.every((p) => p.lengthFrom !== "sheet");
  const sheetFit = !allTape || sheetPts.length < 2 ? null : fitSeries(sheetPts);
  const k = fit.k;
  const dp = allTape ? 3 : 2;
  const W = 760, H = 460, ML = 64, MB = 56, MT = 24, MR = 24;
  const maxT2 = Math.max(...pts.map((p) => p.T ** 2)) * 1.12, maxL = Math.max(...pts.map((p) => p.L)) * 1.15;
  const X = (v: number) => ML + (v / maxT2) * (W - ML - MR), Y = (v: number) => H - MB - (v / maxL) * (H - MB - MT);
  const relT = pts.map((p) => p.sT / p.T);
  const sw = stopwatch(1.42);
  const mid = pts.reduce((a, p) => (Math.abs(p.T - 1.42) < Math.abs(a.T - 1.42) ? p : a), pts[0]);
  const xTicks = [0, 1, 2, 3, 4, 5].filter((v) => v <= maxT2);
  const yTicks = [0, 0.25, 0.5, 0.75, 1, 1.25].filter((v) => v <= maxL);
  const lineLen = Math.hypot(X(maxT2) - X(0), Y(k * maxT2) - Y(0));
  const offPct = s.truth ? Math.abs(((fit.g - s.truth.g) / s.truth.g) * 100) : undefined;
  const ordered = [...pts].sort((a, b) => a.L - b.L);

  return (
    <>
      <header className={styles.title}>
        <div>
          <p className={styles.kicker}>A series of {pts.length} runs</p>
          <h1>{s.title}</h1>
        </div>
        <div className={styles.abstract}>
          <p>{s.note}</p>
        </div>
      </header>

      <Plate
        n="I"
        title="String length against period squared."
        caption={`Each orange point is one run: its period from the law that won that clip, its length from ${allTape ? "a tape" : "the lengths as stated below"}, with the length’s error bar. The white line is the straight line through the origin that fits them best; its slope is g/4π².`}
      >
        <div className={styles.figure}>
          <PipelineLight className={styles.chartWrap} step={420}>
            <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img" aria-label={`String length against period squared for ${pts.length} runs, with the fitted straight line: slope ${(k * 1000).toFixed(1)} mm/s², so g = ${fit.g.toFixed(dp)} m/s²`}>
              {xTicks.map((v) => (
                <g key={`x${v}`}>
                  <line x1={X(v)} x2={X(v)} y1={MT} y2={Y(0)} className={styles.grid} />
                  <text x={X(v)} y={H - MB + 24} textAnchor="middle" className={styles.tick}>
                    {v}
                  </text>
                </g>
              ))}
              {yTicks.map((v) => (
                <g key={`y${v}`}>
                  <line x1={ML} x2={W - MR} y1={Y(v)} y2={Y(v)} className={styles.grid} />
                  <text x={ML - 12} y={Y(v) + 5} textAnchor="end" className={styles.tick}>
                    {v}
                  </text>
                </g>
              ))}
              <line x1={ML} x2={W - MR} y1={Y(0)} y2={Y(0)} className={styles.axis} />
              <line x1={ML} x2={ML} y1={Y(0)} y2={MT} className={styles.axis} />
              <text x={(ML + W - MR) / 2} y={H - 8} textAnchor="middle" className={styles.axisLab}>
                T², the period squared (s²)
              </text>
              <text x={16} y={MT + 4} className={`${styles.axisLab} ${styles.axisLabY}`} transform={`rotate(-90 16 ${MT + 4})`} textAnchor="end">
                L, the string length (m)
              </text>
              <line x1={X(0)} y1={Y(0)} x2={X(maxT2)} y2={Y(k * maxT2)} className={styles.fitLine} style={{ ["--len" as string]: lineLen }} />
              {ordered.map((p, i) => (
                <g key={p.id} className={styles.pt} data-node={i}>
                  <title>{`${p.title}: L = ${p.L.toFixed(3)} ± ${p.sL.toFixed(3)} m, T² = ${(p.T ** 2).toFixed(3)} s²`}</title>
                  <line x1={X(p.T ** 2)} x2={X(p.T ** 2)} y1={Y(p.L - p.sL)} y2={Y(p.L + p.sL)} className={styles.bar} />
                  <circle cx={X(p.T ** 2)} cy={Y(p.L)} r="7" className={styles.dot} />
                  <text x={X(p.T ** 2) - 14} y={Y(p.L) - 12} textAnchor="end" className={styles.ptLab}>
                    {p.title}
                  </text>
                </g>
              ))}
            </svg>
          </PipelineLight>
          <div className={styles.readings}>
            <div>
              <p className={styles.rl}>g, from the slope</p>
              <p className={`num ${styles.rv}`}>
                {fit.g.toFixed(dp)}
                <span className={styles.pm}>
                  {" "}
                  ± {fit.sg.toFixed(dp)} ± {(allTape ? fit.sgTape : fit.sgShared).toFixed(dp)}
                </span>
                <span className={styles.pm}> m/s²</span>
              </p>
            </div>
            <dl className={styles.facts}>
              <div>
                <dt>Slope of L against T²</dt>
                <dd className="num">{(k * 1000).toFixed(1)} mm/s²</dd>
              </div>
              {s.truth && (
                <div>
                  <dt>True value</dt>
                  <dd className="num">{s.truth.g} m/s²</dd>
                </div>
              )}
              {offPct !== undefined && (
                <div>
                  <dt>Off by</dt>
                  <dd className={`num ${styles.held}`}>{offPct.toFixed(allTape ? 2 : 1)}%</dd>
                </div>
              )}
              <div>
                <dt>The single runs gave</dt>
                <dd className="num">{pts.map((p) => p.g.toFixed(dp)).join(", ")}</dd>
              </div>
            </dl>
          </div>
        </div>
      </Plate>

      <Page className={styles.page}>
        <Section n={1} title="The measurement">
          <p>
            Each clip was measured on its own: SAM 3.1 followed the bob through every frame, and the law that won each run gives its period. The practical&rsquo;s relation, T = 2π√(L/g), says L against T² is a straight line through the origin with slope g/4π², so g = 4π² × slope.
          </p>
          {allTape ? (
            <p className={styles.para}>
              Lengths here are from a tape, periods from Ansatz. The first ± on g is the scatter between runs, which shrinks as you add lengths. The second is what the tape readings allow (±{TAPE_SIGMA_M * 1000} mm a length, pivot to the bob&rsquo;s centre, an assumed reading error), which now dominates: the periods are known far better than the lengths.{s.tapeNote ? ` ${s.tapeNote}` : ""}
            </p>
          ) : (
            <p className={styles.para}>
              The first ± on g is the scatter between runs, which shrinks as you add lengths. The second is what the runs measured against the sheet share, the sheet&rsquo;s true size ({Math.round(fit.relShared * 100)}%: a sheet&rsquo;s size is assumed, and SAM 3.1 reads its edge a few percent short), which no number of runs removes. Type each length you measured with a metre scale below a run and it goes away.
            </p>
          )}
        </Section>
        <Note who="SAM 3.1, then code">T is the small-swing period 2π/ω₀ of each run&rsquo;s fitted law, which is what g = 4π²L/T² assumes; the law itself accounts for the swing&rsquo;s size and its damping.</Note>

        <div className={styles.scroll} tabIndex={0} role="region" aria-label="The runs in this series">
          <table className={`journal num ${styles.table}`}>
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col" className="r">
                  L (m)
                </th>
                <th scope="col">from</th>
                {s.truth && (
                  <th scope="col" className="r">
                    L, true (m)
                  </th>
                )}
                <th scope="col" className="r">
                  T (s), Ansatz
                </th>
                <th scope="col" className="r">
                  T² (s²)
                </th>
                <th scope="col" className="r">
                  g, this run alone
                </th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/x/${p.id}`}>{p.title}</Link>
                  </td>
                  <td className="r">
                    {p.L.toFixed(3)} ± {p.sL.toFixed(3)}
                  </td>
                  <td>{p.lengthFrom === "sheet" ? "the sheet" : p.lengthFrom === "tape" ? "tape" : "said in the clip"}</td>
                  {s.truth && <td className="r">{s.truth.lengths[s.ids.indexOf(p.id)]?.toFixed(2)}</td>}
                  <td className="r">
                    {p.T.toFixed(4)} ± {p.sT.toFixed(4)}
                  </td>
                  <td className="r">{(p.T ** 2).toFixed(3)}</td>
                  <td className="r">
                    {p.g.toFixed(dp)} ± {p.sg.toFixed(dp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sheetFit && (
          <p className={styles.para}>
            No tape? The same {sheetPts.length} clips with each length read from the A4 sheet on the wall give g = {sheetFit.g.toFixed(2)} ± {sheetFit.sg.toFixed(2)} ± {sheetFit.sgShared.toFixed(2)} m/s²{s.truth ? `, ${Math.abs(((sheetFit.g - s.truth.g) / s.truth.g) * 100).toFixed(1)}% off` : ""}: within about 6%, the sheet&rsquo;s own uncertainty. The periods are the same; only the lengths differ.
          </p>
        )}

        <Section n={2} title="Stopwatch against Ansatz" id="stopwatch">
          <p>
            The usual practical times {STOPWATCH.swings} swings with a stopwatch. Starting and stopping it by hand costs about {STOPWATCH.reactionS} s of reaction time, spread over the {STOPWATCH.swings} swings: ±{(stopwatch(1).sT * 1000).toFixed(0)} ms a period, ±{pct(sw.relT, 1)} in T and ±{pct(sw.relG, 1)} in g for a 50 cm string (T ≈ 1.42 s). Ansatz fits the period to every frame of the swing: ±{pct(Math.min(...relT), 3)} to ±{pct(Math.max(...relT), 2)} in T on these runs, the fits&rsquo; statistical error.
          </p>
        </Section>
        <Note who="An estimate, not a measurement">We have not timed these pendulums by hand; the stopwatch column assumes a typical reaction time.</Note>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Stopwatch against Ansatz, run by run">
          <table className={`journal num ${styles.table}`}>
            <thead>
              <tr>
                <th scope="col">Run</th>
                <th scope="col" className="r">
                  T (s)
                </th>
                <th scope="col" className="r">
                  Stopwatch ±, T*
                </th>
                <th scope="col" className="r">
                  Ansatz ±, T
                </th>
                <th scope="col" className="r">
                  g ±, stopwatch* + tape
                </th>
                <th scope="col" className="r">
                  g ±, Ansatz + {allTape ? "tape" : "lengths as above"}
                </th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p) => {
                const st = stopwatch(p.T), rl = p.sL / p.L;
                return (
                  <tr key={p.id}>
                    <td>{p.title}</td>
                    <td className="r">{p.T.toFixed(3)}</td>
                    <td className={`r ${styles.worse}`}>
                      {(st.sT * 1000).toFixed(0)} ms ({pct(st.relT, 2)})
                    </td>
                    <td className={`r ${styles.better}`}>
                      {(p.sT * 1000).toFixed(2)} ms ({pct(p.sT / p.T, 3)})
                    </td>
                    <td className="r">{pct(Math.hypot(st.relG, allTape ? rl : TAPE_SIGMA_M / p.L), 1)}</td>
                    <td className="r">{pct(p.sg / p.g, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={styles.foot}>
          * The stopwatch figures are a typical-reaction-time estimate ({STOPWATCH.reactionS} s over {STOPWATCH.swings} swings), not a measurement: we have not timed these pendulums by hand. Ansatz&rsquo;s figures are the fits&rsquo; statistical errors on rendered clips, which are cleaner than phone footage, so a real clip&rsquo;s period will be less precise than these; we have not yet measured by how much on a phone clip. With both methods the tape (±{TAPE_SIGMA_M * 1000} mm, assumed) is the other half of g&rsquo;s error: at {Math.round(mid.L * 100)} cm it alone is ±{pct(TAPE_SIGMA_M / mid.L, 1)}, so with Ansatz timing, the length becomes the limit.
        </p>

        {editable && <TapeForms s={s} runs={runs.map((e) => ({ id: e.id, title: e.title }))} n={3} />}

        <p className={styles.closing}>
          <Link className="btn" href={editable ? `/new?series=${s.id}` : "/new"}>
            {editable ? "Add a length" : "Run an experiment"}
          </Link>
          <Link href="/x">Every experiment, with its numbers</Link>
        </p>
      </Page>
    </>
  );
}

/** Where a student types the length measured with a metre scale, run by run (visitor series only). */
function TapeForms({ s, runs, n }: { s: { id: string; tape?: Record<string, number> }; runs: { id: string; title: string }[]; n?: number }) {
  return (
    <Section n={n} title="Lengths from your tape" id="tape">
      <p>Measure each string with a metre scale, from the pivot to the middle of the bob, and type it here in centimetres. Ansatz then uses your length with its own period; leave a box empty to use the sheet in view (within about 6%).</p>
      <ul className={styles.tape}>
        {runs.map((r) => (
          <li key={r.id}>
            <form action={saveTape} className={styles.tapeForm}>
              <input type="hidden" name="series" value={s.id} />
              <input type="hidden" name="run" value={r.id} />
              <label className={styles.tapeLabel}>
                <span>{r.title}</span>
                <span className={styles.tapeInput}>
                  <input name="cm" inputMode="decimal" placeholder="length" defaultValue={s.tape?.[r.id] ? +(s.tape[r.id] * 100).toFixed(1) : ""} aria-label={`String length for ${r.title}, in centimetres (between 2 and 3000)`} />
                  <span aria-hidden="true">cm</span>
                </span>
              </label>
              <button className="btn ghost" type="submit">
                Save
              </button>
            </form>
          </li>
        ))}
      </ul>
    </Section>
  );
}

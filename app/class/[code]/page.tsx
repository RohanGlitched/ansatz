import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import Plate, { Note } from "@/components/book/Plate";
import { getClass, JUDGES_CODE } from "@/lib/classes";
import { classRows, type ClassRow } from "@/lib/classrows";
import { fmtDate, fmtPair, fmtSig, fmtSignedPct } from "@/lib/format";
import styles from "./class.module.css";

export const dynamic = "force-dynamic";

const pctDec = (p: number) => (Math.abs(p) < 0.1 ? 3 : Math.abs(p) < 1 ? 2 : 1);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A real class's page lists its students, so it stays out of search; the demo and the judges' lane hold no one's name. */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  // a wrong code is a real 404, rendered on the server
  if (!(await getClass(code))) notFound();
  const open = code === "demo23" || code === JUDGES_CODE;
  return {
    title: code === JUDGES_CODE ? "Judges’ lane" : code === "demo23" ? "Demo class: the pendulum practical" : "Class results",
    description:
      code === JUDGES_CODE
        ? "Runs reserved for the hackathon’s judges, each scored against its own experiment’s known value."
        : code === "demo23"
          ? "What a teacher sees: six pendulum runs, g from Ansatz’s measured period and the string length, each against the known value."
          : "A class’s experiments, one row per run, each with its error bar.",
    alternates: open ? { canonical: `/class/${code}` } : undefined,
    robots: open ? undefined : { index: false },
  };
}

/** The measured value as a teacher reads it: g alone when the column says g, else the constant's own name. */
function measured(r: ClassRow, gOnly: boolean) {
  if (r.value === undefined) return "—";
  const pair = fmtPair(r.value, r.sigma ?? NaN);
  return gOnly ? pair : `${r.symbol} = ${pair}${r.unit ? ` ${r.unit}` : ""}`;
}

/** A class's results as a teacher marks them: a grading sheet, one row per run, every measurement of g on one plate, and a CSV. */
export default async function ClassPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cls = await getClass(code);
  if (!cls) notFound();
  const judges = cls.code === JUDGES_CODE;
  const rows = await classRows(cls);
  // the class's g on Earth: runs flagged for their clock sit on a lane of their own, and don't enter the mean
  const withG = rows.filter((r) => r.g !== undefined);
  const earth = withG.filter((r) => r.world === "earth" && r.offPct !== undefined && !r.warn?.startsWith("clock"));
  const flagged = withG.filter((r) => !earth.includes(r));
  const w = earth.map((r) => 1 / Math.max(1e-6, r.sigma ?? 1) ** 2);
  const mean = earth.length ? earth.reduce((a, r, i) => a + r.g! * w[i], 0) / w.reduce((a, b) => a + b, 0) : NaN;
  const spread = earth.length > 1 ? Math.sqrt(earth.reduce((a, r) => a + (r.g! - mean) ** 2, 0) / (earth.length - 1)) : NaN;
  const meanSigma = Number.isFinite(spread) ? spread / Math.sqrt(earth.length) : NaN;
  // the number line: zoomed on the class's values and the known one, with room for the error bars
  const known = earth.find((r) => r.reference !== undefined)?.reference;
  const lo0 = Math.min(...withG.map((r) => r.g! - (r.sigma ?? 0)), known ?? Infinity);
  const hi0 = Math.max(...withG.map((r) => r.g! + (r.sigma ?? 0)), known ?? -Infinity);
  const padV = Math.max(0.1, (hi0 - lo0) * 0.12);
  const lo = Math.max(0, lo0 - padV), hi = hi0 + padV;
  const W = 1000, L = 24, R = 24;
  const X = (v: number) => L + ((v - lo) / Math.max(1e-9, hi - lo)) * (W - L - R);
  const step = niceStep((hi - lo) / 6);
  const ticks: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) ticks.push(+v.toPrecision(8));
  // each Earth run on its own line of the plate, so the error bars never overlap
  const laneH = 40, top = 48;
  const H = top + earth.length * laneH + (flagged.length ? 26 + flagged.length * laneH : 0) + 46;
  // the column says g when every row with a value measured g; a mixed lane names each constant
  const gOnly = rows.every((r) => r.value === undefined || r.symbol === "g");
  const showLength = rows.some((r) => r.lengthFrom);
  const showSheet = rows.some((r) => r.gSheet !== undefined);
  const tapeRows = rows.filter((r) => r.lengthFrom === "tape" && r.gSheet !== undefined && r.sigmaSheet !== undefined);
  const sheetPct = tapeRows.length ? Math.round((tapeRows[0].sigmaSheet! / tapeRows[0].gSheet!) * 100) : NaN;
  const tapeLetters = tapeRows.map((r) => r.student.replace(/^Student /, ""));
  // a flag is a real warning only; a run that measured the string length with g given has no g, but nothing to flag
  const flags = rows.filter((r) => r.warn).length;
  const ok = rows.length - flags;
  const gRuns = rows.filter((r) => r.g !== undefined).length;
  const lengthRuns = rows.filter((r) => r.gGiven).map((r) => r.student.replace(/^Student /, ""));

  return (
    <>
      <header className={styles.title}>
        <div>
          <p className={styles.kicker}>{judges ? "The judges’ lane" : cls.demo ? "A demo class page" : "Class page"}</p>
          <h1>{cls.name}</h1>
        </div>
        <div className={styles.abstract}>
          <p>
            {rows.length} experiment{rows.length === 1 ? "" : "s"} so far
            {cls.demo ? (
              ", marked the way a teacher marks a practical: each value with its error bar, against the value it should have found."
            ) : judges ? (
              <>
                ; up to {cls.quota - cls.used} more until {fmtDate(cls.expiresAt)}. These runs are reserved for the hackathon’s judges: they don’t share the visitors’ daily limit or the 40 runs a day that class links share, and they have their own daily budget of Meta credits. Start one with the judges’ link (it ends in &amp;k=…), or use Run an experiment in the visitors’ lane; see <Link href="/judges">the judges’ page</Link>.
              </>
            ) : (
              <>
                ; up to {cls.quota - cls.used} more until {fmtDate(cls.expiresAt)} (during the hackathon, class links share 40 runs a day between them). Students run theirs at <Link href={`/new?class=${cls.code}`}>/new?class={cls.code}</Link>.
              </>
            )}
          </p>
          {cls.demo && (
            <p className={styles.demo}>
              These rows are the site’s own experiments with student labels.{" "}
              {tapeRows.length > 0 && (
                <>
                  {tapeLetters[0]} to {tapeLetters[tapeLetters.length - 1]} are one rendered pendulum at {tapeRows.length} string lengths. Each student measured the string with a tape (here the render’s true length, stated as a given), and g comes from the period Ansatz measured with that length, as in the practical. The A4 sheet in view gives a second length, good to about {Number.isFinite(sheetPct) ? sheetPct : "—"}%, kept in its own column; <Link href="/series/pendulum-lengths">the series page</Link> fits all four together.{" "}
                </>
              )}
              E is narrated in Hindi by a synthetic voice, which says the string length, and F swings through 70°. No real class has used Ansatz yet. <Link href="/class/new">Make a class link</Link> for your class.
            </p>
          )}
        </div>
      </header>

      {earth.length > 0 && (
        <Plate
          n="I"
          title={`Every measurement of g the ${judges ? "lane" : "class"} made on Earth, in m/s², each with its error bar.`}
          caption={`The white line is the known value; the dashed line is the ${judges ? "lane’s" : "class’s"} mean, weighted by each run’s error bar.${flagged.length ? " Runs flagged for their clock or another world sit below, left out of the mean." : ""}`}
        >
          <div className={styles.gPlate}>
            <div className={styles.readings}>
              <div>
                <p className={styles.rl}>{judges ? "Lane" : "Class"} mean</p>
                <p className={`num ${styles.rv}`}>
                  {Number.isFinite(meanSigma) ? (
                    <>
                      {fmtSig(mean, 4)}
                      <span className={styles.pm}> ± {fmtSig(meanSigma, 2)}</span>
                    </>
                  ) : (
                    fmtSig(mean, 4)
                  )}
                  <span className={styles.pm}> m/s²</span>
                </p>
              </div>
              <div>
                <p className={styles.rl}>Spread between {judges ? "runs" : "students"}</p>
                <p className={`num ${styles.rv} ${styles.rvSmall}`}>±{Number.isFinite(spread) ? fmtSig(spread, 2) : "—"}</p>
              </div>
              {known !== undefined && (
                <div>
                  <p className={styles.rl}>Known, on Earth</p>
                  <p className={`num ${styles.rv} ${styles.rvSmall}`}>{fmtSig(known, 4)}</p>
                </div>
              )}
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} className={styles.line} role="img" aria-label={`Every measurement of g the class made on Earth, with error bars; class mean ${fmtPair(mean, meanSigma)}`}>
              {ticks.map((v) => (
                <g key={v}>
                  <line x1={X(v)} x2={X(v)} y1={top - 14} y2={H - 34} className={styles.grid} />
                  <text x={X(v)} y={H - 12} textAnchor="middle" className={styles.tick}>
                    {+v.toFixed(3)}
                  </text>
                </g>
              ))}
              {known !== undefined && (
                <>
                  <line x1={X(known)} x2={X(known)} y1={top - 22} y2={H - 34} className={styles.known} />
                  <text x={X(known) + 6} y={top - 12} className={styles.lab}>
                    known {fmtSig(known, 4)}
                  </text>
                </>
              )}
              {Number.isFinite(mean) && <line x1={X(mean)} x2={X(mean)} y1={top - 14} y2={top + earth.length * laneH} className={styles.mean} />}
              {earth.map((r, i) => {
                const y = top + i * laneH + laneH / 2;
                const s = r.sigma ?? 0;
                return (
                  <g key={r.id} className={styles.pt} style={{ animationDelay: `${0.25 + i * 0.14}s` }}>
                    <title>{`${r.student}: ${fmtPair(r.g!, r.sigma ?? NaN)}`}</title>
                    <line x1={X(r.g! - s)} x2={X(r.g! + s)} y1={y} y2={y} className={styles.bar} />
                    <circle cx={X(r.g!)} cy={y} r={6} className={styles.dot} />
                    {/* the name sits on whichever side of the bar has room */}
                    {X(r.g! + s) > W * 0.72 ? (
                      <text x={X(r.g! - s) - 12} y={y + 4.5} textAnchor="end" className={styles.who}>
                        {r.student}
                      </text>
                    ) : (
                      <text x={X(r.g! + s) + 12} y={y + 4.5} className={styles.who}>
                        {r.student}
                      </text>
                    )}
                  </g>
                );
              })}
              {flagged.map((r, i) => {
                const y = top + earth.length * laneH + 26 + i * laneH + laneH / 2;
                return (
                  <g key={r.id} className={styles.pt} style={{ animationDelay: `${0.25 + (earth.length + i) * 0.14}s` }}>
                    <title>{`${r.student}: ${fmtPair(r.g!, r.sigma ?? NaN)} (${r.warn ?? "not on Earth"})`}</title>
                    <circle cx={X(Math.max(lo, Math.min(hi, r.g!)))} cy={y} r={6} className={styles.flag} />
                    <text x={X(Math.max(lo, Math.min(hi, r.g!))) + (X(r.g!) > W * 0.72 ? -14 : 14)} y={y + 4.5} textAnchor={X(r.g!) > W * 0.72 ? "end" : "start"} className={styles.who}>
                      {r.student}, flagged
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </Plate>
      )}

      <section className={styles.sheet} aria-labelledby="sheet-h">
        <div className={styles.sheetHead}>
          <h2 id="sheet-h">{judges ? "Every run in the lane" : "The grading sheet"}</h2>
          {rows.length > 0 && (
            <p className={styles.sheetSum}>
              {ok} of {rows.length} run{rows.length === 1 ? "" : "s"} passed every check{flags > 0 ? `; ${flags} carr${flags === 1 ? "ies" : "y"} a flag to read before marking` : ""}
              {lengthRuns.length > 0 ? `. ${gRuns} measured g; ${lengthRuns.join(" and ")} measured the string length with g given` : ""}.
            </p>
          )}
        </div>
        {rows.length > 0 && (
          <div className={styles.scroll} tabIndex={0} role="region" aria-labelledby="sheet-h">
            <table className={`journal num ${styles.table}`}>
              <thead>
                <tr>
                  <th scope="col">{judges ? "Run" : "Student"}</th>
                  <th scope="col">Experiment</th>
                  <th scope="col" className="r">
                    {gOnly ? "g (m/s²)" : "Measured"}
                  </th>
                  {showLength && <th scope="col">Length from</th>}
                  {showSheet && (
                    <th scope="col" className="r">
                      g with the A4 sheet’s length
                    </th>
                  )}
                  <th scope="col" className="r">
                    Off its known value
                  </th>
                  <th scope="col">Law that won</th>
                  <th scope="col">Check</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id} className={r.warn ? styles.warnRow : undefined} style={{ ["--i" as string]: i }}>
                    <th scope="row" className={styles.student}>
                      {r.student}
                    </th>
                    <td>
                      <Link href={`/x/${r.id}`}>{r.experiment}</Link>
                    </td>
                    <td className={`r ${styles.value}`}>
                      {measured(r, gOnly)}
                      {r.dash && <span className={styles.sub}>{r.dash}</span>}
                    </td>
                    {showLength && (
                      <td>
                        {r.lengthFrom ?? "—"}
                        {r.lengthFrom && r.lengthM !== undefined && <span className={styles.sub}>{r.lengthM.toFixed(2)} m</span>}
                      </td>
                    )}
                    {showSheet && <td className={`r ${styles.quiet}`}>{r.gSheet !== undefined ? fmtPair(r.gSheet, r.sigmaSheet ?? NaN) : "—"}</td>}
                    <td className="r">
                      {r.offPct !== undefined ? fmtSignedPct(r.offPct, pctDec(r.offPct)) : "—"}
                      {r.reference !== undefined && (
                        <span className={styles.sub}>
                          known {fmtSig(r.reference, 4)}
                          {r.unit && !gOnly ? ` ${r.unit}` : ""}
                        </span>
                      )}
                    </td>
                    <td className={styles.law}>{r.damping ? cap(r.damping) : r.law}</td>
                    <td className={r.warn ? styles.warn : styles.ok}>
                      <span className={styles.mark}>{r.warn ?? "ok"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length === 0 &&
          (judges ? (
            <div className={styles.empty}>
              <p className={styles.emptyHead}>No judge has run a clip in this lane yet.</p>
              <p>
                Each run started from the judges’ page lands here as one row: the constant it measured, its error bar, and how far it sits from that experiment’s own known value (a pendulum against Earth’s g, a Moon jump against the Moon’s).
              </p>
              <p>
                <Link className="btn" href="/judges">
                  Run an experiment from the judges’ page
                </Link>
              </p>
            </div>
          ) : (
            <div className={styles.empty}>
              <p className={styles.emptyHead}>No experiments yet.</p>
              <p>
                Share the students’ link, <Link href={`/new?class=${cls.code}`}>/new?class={cls.code}</Link>, and each run they make appears here as one row.
              </p>
            </div>
          ))}
        {rows.length > 0 && (
          <div className={styles.after}>
            <a className="btn ghost" href={`/class/${cls.code}/data.csv`} download>
              Download the results (CSV)
            </a>
            <div className={styles.notes}>
              <Note who="SAM 3.1, then code">Each value comes from the law that won its own run, fitted to SAM 3.1&rsquo;s measurement of every frame; the ± is that fit&rsquo;s error.</Note>
              <Note who="Check">A flag says what to read before marking: a clip whose clock runs slower or faster than life, or a winning law that misses the unseen frames by more than five times the noise.</Note>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

/** a round step for an axis: 1, 2 or 5 times a power of ten */
function niceStep(raw: number) {
  const mag = 10 ** Math.floor(Math.log10(Math.max(1e-9, raw)));
  return [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
}

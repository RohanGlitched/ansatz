import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClass, JUDGES_CODE } from "@/lib/classes";
import { classRows, type ClassRow } from "@/lib/classrows";
import { fmtDate, fmtPair, fmtSig, fmtSignedPct } from "@/lib/format";

export const dynamic = "force-dynamic";

const pctDec = (p: number) => (Math.abs(p) < 0.1 ? 3 : Math.abs(p) < 1 ? 2 : 1);
const cell = { padding: 6, verticalAlign: "top" } as const;
const note = { display: "block", fontSize: 13, lineHeight: 1.4, color: "var(--ink-3)" } as const;
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

/** A class's results as a teacher marks them: one row per run, every measurement of g on one line, and a CSV. */
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
  const W = 640, L = 16, R = 16, max = Math.max(12, ...withG.map((r) => r.g! + (r.sigma ?? 0)));
  const X = (v: number) => L + (v / max) * (W - L - R);
  // the column says g when every row with a value measured g; a mixed lane names each constant
  const gOnly = rows.every((r) => r.value === undefined || r.symbol === "g");
  const showLength = rows.some((r) => r.lengthFrom);
  const showSheet = rows.some((r) => r.gSheet !== undefined);
  const tapeRows = rows.filter((r) => r.lengthFrom === "tape" && r.gSheet !== undefined && r.sigmaSheet !== undefined);
  const sheetPct = tapeRows.length ? Math.round((tapeRows[0].sigmaSheet! / tapeRows[0].gSheet!) * 100) : NaN;
  const tapeLetters = tapeRows.map((r) => r.student.replace(/^Student /, ""));
  const known = earth.find((r) => r.reference !== undefined)?.reference;
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(32px, 5vw, 64px)", display: "grid", gap: 24 }}>
      <h1 style={{ fontSize: "clamp(28px, 3.6vw, 42px)" }}>{cls.name}</h1>
      {cls.demo && (
        <p className="small" style={{ maxWidth: "85ch" }}>
          A demo of what a teacher sees once students have run their clips. These rows are the site’s own experiments with student labels.{" "}
          {tapeRows.length > 0 && (
            <>
              {tapeLetters[0]} to {tapeLetters[tapeLetters.length - 1]} are one rendered pendulum at {tapeRows.length} string lengths. Each student measured the string with a tape (here the render’s true length, stated as a given), and g comes from the period Ansatz measured with that length, as in the practical. The A4 sheet in view gives a second length, good to about {Number.isFinite(sheetPct) ? sheetPct : "—"}%, kept in its own column; <Link href="/series/pendulum-lengths">the series page</Link> fits all four together.{" "}
            </>
          )}
          E is narrated in Hindi by a synthetic voice, which says the string length, and F swings through 70°. No real class has used Ansatz yet. <Link href="/class/new">Make a class link</Link> for your class.
        </p>
      )}
      <p className="lede">
        {rows.length} experiment{rows.length === 1 ? "" : "s"} so far
        {cls.demo ? (
          "."
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
      {earth.length > 0 && (
        <figure>
          <svg viewBox={`0 0 ${W} 96`} style={{ width: "100%", maxWidth: W }} role="img" aria-label={`Every measurement of g the class made on Earth, with error bars; class mean ${fmtPair(mean, Number.isFinite(spread) ? spread / Math.sqrt(earth.length) : NaN)}`}>
            <line x1={L} x2={W - R} y1={36} y2={36} stroke="var(--rule)" strokeWidth="2" />
            {known !== undefined && (
              <>
                <line x1={X(known)} x2={X(known)} y1={18} y2={54} stroke="var(--ink-3)" />
                <text x={X(known)} y={12} fontSize="12" textAnchor="middle" fill="var(--ink-3)">
                  Earth {fmtSig(known, 4)}
                </text>
              </>
            )}
            {Number.isFinite(mean) && <line x1={X(mean)} x2={X(mean)} y1={24} y2={48} stroke="var(--law)" strokeWidth="2" strokeDasharray="3 3" />}
            {earth.map((r) => (
              <g key={r.id}>
                <title>{`${r.student}: ${fmtPair(r.g!, r.sigma ?? NaN)}`}</title>
                <rect x={X(r.g! - (r.sigma ?? 0))} y={31} width={Math.max(2, X(r.g! + (r.sigma ?? 0)) - X(r.g! - (r.sigma ?? 0)))} height={10} fill="var(--law)" opacity="0.2" />
                <circle cx={X(r.g!)} cy={36} r={4} fill="var(--law)" />
              </g>
            ))}
            {flagged.map((r) => (
              <g key={r.id}>
                <title>{`${r.student}: ${fmtPair(r.g!, r.sigma ?? NaN)} (${r.warn ?? "not on Earth"})`}</title>
                <circle cx={X(r.g!)} cy={70} r={4} fill="none" stroke="var(--warn)" strokeWidth="2" />
              </g>
            ))}
            {flagged.length > 0 && (
              <text x={L} y={90} fontSize="11" fill="var(--warn)">
                flagged runs (clock or another world), left out of the mean
              </text>
            )}
          </svg>
          <figcaption className="small">
            Every measurement of g on Earth in m/s², each with its error bar. Class mean {fmtPair(mean, Number.isFinite(spread) ? spread / Math.sqrt(earth.length) : NaN)} (dashed), spread between {judges ? "runs" : "students"} ±{Number.isFinite(spread) ? fmtSig(spread, 2) : "—"}.
          </figcaption>
        </figure>
      )}
      {rows.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="num" style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--ink)" }}>
                <th style={cell}>{judges ? "Run" : "Student"}</th>
                <th style={cell}>Experiment</th>
                <th style={cell}>{gOnly ? "g (m/s²)" : "Measured"}</th>
                {showLength && <th style={cell}>Length from</th>}
                {showSheet && <th style={cell}>g with the A4 sheet’s length</th>}
                <th style={cell}>Off its known value</th>
                <th style={cell}>Law that won</th>
                <th style={cell}>Check</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                  <td style={cell}>{r.student}</td>
                  <td style={cell}>
                    <Link href={`/x/${r.id}`}>{r.experiment}</Link>
                  </td>
                  <td style={cell}>
                    {measured(r, gOnly)}
                    {r.dash && <span style={note}>{r.dash}</span>}
                  </td>
                  {showLength && (
                    <td style={cell}>
                      {r.lengthFrom ?? "—"}
                      {r.lengthFrom && r.lengthM !== undefined && <span style={note}>{r.lengthM.toFixed(2)} m</span>}
                    </td>
                  )}
                  {showSheet && (
                    <td style={{ ...cell, color: "var(--ink-3)" }}>{r.gSheet !== undefined ? fmtPair(r.gSheet, r.sigmaSheet ?? NaN) : "—"}</td>
                  )}
                  <td style={cell}>
                    {r.offPct !== undefined ? fmtSignedPct(r.offPct, pctDec(r.offPct)) : "—"}
                    {r.reference !== undefined && <span style={note}>known {fmtSig(r.reference, 4)}{r.unit && !gOnly ? ` ${r.unit}` : ""}</span>}
                  </td>
                  <td style={cell}>{r.damping ? cap(r.damping) : r.law}</td>
                  <td style={{ ...cell, color: r.warn ? "var(--warn)" : undefined }}>{r.warn ?? "ok"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length === 0 &&
        (judges ? (
          <div style={{ display: "grid", gap: 14, maxWidth: "70ch", padding: "20px 22px", border: "1px solid var(--rule)", borderRadius: 6 }}>
            <p style={{ fontWeight: 600 }}>No judge has run a clip in this lane yet.</p>
            <p className="small">
              Each run started from the judges’ page lands here as one row: the constant it measured, its error bar, and how far it sits from that experiment’s own known value (a pendulum against Earth’s g, a Moon jump against the Moon’s).
            </p>
            <p>
              <Link className="btn" href="/judges">
                Run an experiment from the judges’ page
              </Link>
            </p>
          </div>
        ) : (
          <p>No experiments yet. Share the link above with your students.</p>
        ))}
      {rows.length > 0 && (
        <p>
          <a className="btn ghost" href={`/class/${cls.code}/data.csv`} download>
            Download the results (CSV)
          </a>
        </p>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClass, JUDGES_CODE } from "@/lib/classes";
import { classRows } from "@/lib/classrows";
import { fmtPair } from "@/lib/format";

export const dynamic = "force-dynamic";
/** A real class's page lists its students, so it stays out of search; the demo and the judges' lane hold no one's name. */
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  const open = code === "demo23" || code === JUDGES_CODE;
  return { title: code === JUDGES_CODE ? "Judges’ lane" : "Class results", robots: open ? undefined : { index: false } };
}

/** A class's results as a teacher marks them: one row per run, every measurement of g on one line, and a CSV. */
export default async function ClassPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cls = await getClass(code);
  if (!cls) notFound();
  const rows = await classRows(cls);
  // the class's g on Earth: runs flagged for their clock sit on a lane of their own, and don't enter the mean
  const earth = rows.filter((r) => r.g !== undefined && r.offPct !== undefined && !r.warn?.startsWith("clock"));
  const flagged = rows.filter((r) => r.g !== undefined && !earth.includes(r));
  const w = earth.map((r) => 1 / Math.max(1e-6, r.sigma ?? 1) ** 2);
  const mean = earth.length ? earth.reduce((a, r, i) => a + r.g! * w[i], 0) / w.reduce((a, b) => a + b, 0) : NaN;
  const spread = earth.length > 1 ? Math.sqrt(earth.reduce((a, r) => a + (r.g! - mean) ** 2, 0) / (earth.length - 1)) : NaN;
  const W = 640, L = 16, R = 16, max = Math.max(12, ...rows.filter((r) => r.g !== undefined).map((r) => r.g! + (r.sigma ?? 0)));
  const X = (v: number) => L + (v / max) * (W - L - R);
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(32px, 5vw, 64px)", display: "grid", gap: 24 }}>
      <h1 style={{ fontSize: "clamp(28px, 3.6vw, 42px)" }}>{cls.name}</h1>
      {cls.demo && (
        <p className="small">
          A demo of what a teacher sees once students have run their clips. These rows are the site’s own experiments with student labels: A to D are one rendered pendulum at four string lengths, each measured with only an A4 sheet as its ruler (so each g carries about 6%; with tape-measured lengths the same four runs give g = 9.81, as on <Link href="/series/pendulum-lengths">the series page</Link>), E is narrated in Hindi by a synthetic voice, and F swings through 70°. No real class has used Ansatz yet. <Link href="/class/new">Make a class link</Link> for your class.
        </p>
      )}
      <p className="lede">
        {rows.length} experiment{rows.length === 1 ? "" : "s"} so far
        {cls.demo ? (
          "."
        ) : (
          <>
            ; up to {cls.quota - cls.used} more until {new Date(cls.expiresAt).toDateString()}
            {cls.code === JUDGES_CODE
              ? ". These runs are reserved for the hackathon’s judges: they don’t share the visitors’ daily limit or the 40 runs a day that class links share (the site’s overall daily spending cap still applies). Run one at "
              : " (during the hackathon, class links share 40 runs a day between them). Students run theirs at "}
            <Link href={`/new?class=${cls.code}`}>/new?class={cls.code}</Link>.
          </>
        )}
      </p>
      {earth.length > 0 && (
        <figure>
          <svg viewBox={`0 0 ${W} 96`} style={{ width: "100%", maxWidth: W }} role="img" aria-label={`Every measurement of g the class made on Earth, with error bars; class mean ${mean.toFixed(2)}`}>
            <line x1={L} x2={W - R} y1={36} y2={36} stroke="var(--rule)" strokeWidth="2" />
            <line x1={X(9.81)} x2={X(9.81)} y1={18} y2={54} stroke="var(--ink-3)" />
            <text x={X(9.81)} y={12} fontSize="12" textAnchor="middle" fill="var(--ink-3)">
              Earth 9.81
            </text>
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
            Every measurement of g in m/s², each with its error bar. Class mean {fmtPair(mean, Number.isFinite(spread) ? spread / Math.sqrt(earth.length) : NaN)} (dashed), spread between students ±{Number.isFinite(spread) ? spread.toFixed(2) : "—"}.
          </figcaption>
        </figure>
      )}
      <div style={{ overflowX: "auto" }}>
        <table className="num" style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--ink)" }}>
              <th style={{ padding: 6 }}>Student</th>
              <th style={{ padding: 6 }}>Experiment</th>
              <th style={{ padding: 6 }}>g (m/s²)</th>
              <th style={{ padding: 6 }}>Off 9.81</th>
              <th style={{ padding: 6 }}>Law that won</th>
              <th style={{ padding: 6 }}>Check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                <td style={{ padding: 6 }}>{r.student}</td>
                <td style={{ padding: 6 }}>
                  <Link href={`/x/${r.id}`}>{r.experiment}</Link>
                </td>
                <td style={{ padding: 6 }}>{r.g !== undefined ? fmtPair(r.g, r.sigma ?? NaN) : "—"}</td>
                <td style={{ padding: 6 }}>{r.offPct !== undefined ? `${r.offPct >= 0 ? "+" : ""}${r.offPct.toFixed(1)}%` : "—"}</td>
                <td style={{ padding: 6 }}>{r.law}</td>
                <td style={{ padding: 6, color: r.warn ? "var(--warn)" : undefined }}>{r.warn ?? "ok"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p>No experiments yet. Share the link above with your students.</p>}
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

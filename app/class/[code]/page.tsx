import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getClass } from "@/lib/classes";
import { getExperiment } from "@/lib/experiments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Class results", robots: { index: false } };

/** Every experiment a class ran, and every measurement of g it made, side by side. */
export default async function ClassPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cls = await getClass(code);
  if (!cls) notFound();
  const runs = (await Promise.all(cls.runs.map((id) => getExperiment(id).catch(() => null)))).filter((e) => !!e);
  const gs = runs.flatMap((e) => e.comparisons.filter((c) => c.param === "g" || /accelerates at g/.test(c.label)).map((c) => ({ id: e.id, g: c.measured, s: c.sigma })));
  const W = 640, L = 16, R = 16, max = Math.max(12, ...gs.map((x) => x.g + x.s));
  const X = (v: number) => L + (v / max) * (W - L - R);
  return (
    <div className="wrap" style={{ paddingBlock: "clamp(32px, 5vw, 64px)", display: "grid", gap: 24 }}>
      <h1 style={{ fontSize: "clamp(28px, 3.6vw, 42px)" }}>{cls.name}</h1>
      {cls.demo && (
        <p className="small">
          A demo: what a teacher sees once students have run their clips (these are the site’s own experiments). <Link href="/class/new">Make a class link</Link> for your class.
        </p>
      )}
      <p className="lede">
        {runs.length} experiment{runs.length === 1 ? "" : "s"} so far
        {cls.demo ? (
          "."
        ) : (
          <>
            ; {cls.quota - cls.used} runs left until {new Date(cls.expiresAt).toDateString()}. Students run theirs at{" "}
            <Link href={`/new?class=${cls.code}`}>/new?class={cls.code}</Link>.
          </>
        )}
      </p>
      {gs.length > 0 && (
        <figure>
          <svg viewBox={`0 0 ${W} 70`} style={{ width: "100%", maxWidth: W }} role="img" aria-label="Every measurement of g the class made, with error bars, against Earth's 9.81">
            <line x1={L} x2={W - R} y1={36} y2={36} stroke="var(--rule)" strokeWidth="2" />
            <line x1={X(9.81)} x2={X(9.81)} y1={20} y2={52} stroke="var(--ink-3)" />
            <text x={X(9.81)} y={14} fontSize="12" textAnchor="middle" fill="var(--ink-3)">
              Earth 9.81
            </text>
            {gs.map((x, i) => (
              <g key={x.id + i}>
                <rect x={X(x.g - x.s)} y={31} width={Math.max(2, X(x.g + x.s) - X(x.g - x.s))} height={10} fill="var(--law)" opacity="0.2" />
                <circle cx={X(x.g)} cy={36} r={4} fill="var(--law)" />
              </g>
            ))}
            {[0, 2, 4, 6, 8, 10, 12].filter((v) => v <= max).map((v) => (
              <text key={v} x={X(v)} y={66} fontSize="11" textAnchor="middle" fill="var(--ink-3)">
                {v}
              </text>
            ))}
          </svg>
          <figcaption className="small">Every measurement of g in m/s², each with its error bar.</figcaption>
        </figure>
      )}
      <ol style={{ display: "grid", gap: 12, paddingLeft: 20 }}>
        {runs.map((e) => (
          <li key={e.id}>
            <Link href={`/x/${e.id}`}>
              <strong>{e.title}</strong>
            </Link>
            : {e.headline ?? e.finding} <span className="small">({new Date(e.createdAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })})</span>
          </li>
        ))}
      </ol>
      {runs.length === 0 && <p>No experiments yet. Share the link above with your students.</p>}
    </div>
  );
}

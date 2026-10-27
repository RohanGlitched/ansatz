import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getExperiment, winnerOf } from "@/lib/experiments";

type Series = { id: string; title: string; note: string; truth?: { g: number; lengths: number[] }; ids: string[] };

async function series(id: string): Promise<Series | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(id)) return null;
  return readFile(path.join(process.cwd(), "data", "series", `${id}.json`), "utf8").then((s) => JSON.parse(s) as Series, () => null);
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = await series((await params).id);
  return { title: s ? s.title : "Series", description: "A pendulum at several lengths: g from the slope of L against T², the school practical done by video." };
}

/** Several runs of one experiment at different lengths, fitted together the way a school practical asks: L against T². */
export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await series((await params).id);
  if (!s) notFound();
  const runs = (await Promise.all(s.ids.map((id) => getExperiment(id).catch(() => null)))).filter((e) => !!e);
  const pts = runs.flatMap((e) => {
    const w = winnerOf(e);
    const L = w.fit.theta.L, g = w.fit.theta.g;
    if (!(L > 0) || !(g > 0)) return [];
    // the period is a time measurement: its precision is g's statistical part only (the ruler's share is in L)
    const rel = e.observation.reference.relative_uncertainty ?? 0.03;
    const sgStat = Math.sqrt(Math.max(0, (w.fit.sigma.g ?? 0) ** 2 - (rel * g) ** 2));
    const T = 2 * Math.PI * Math.sqrt(L / g);
    return [{ id: e.id, title: e.title, L, sL: rel * L, T, sT: 0.5 * T * (sgStat / g), g }];
  });
  // least squares through the origin: L = k T², g = 4π² k
  const sxx = pts.reduce((a, p) => a + p.T ** 4, 0), sxy = pts.reduce((a, p) => a + p.L * p.T ** 2, 0);
  const k = sxy / sxx;
  const s2 = pts.length > 1 ? pts.reduce((a, p) => a + (p.L - k * p.T ** 2) ** 2, 0) / (pts.length - 1) : NaN;
  const g = 4 * Math.PI ** 2 * k, sg = 4 * Math.PI ** 2 * Math.sqrt(s2 / sxx);
  // what every run shares (the same kind of ruler, its true size uncertain) does not average out: a separate term
  const relShared = Math.min(...runs.map((e) => e.observation.reference.relative_uncertainty ?? 0.03));
  const sgShared = g * relShared;
  const W = 560, H = 340, M = 48;
  const maxT2 = Math.max(...pts.map((p) => p.T ** 2)) * 1.12, maxL = Math.max(...pts.map((p) => p.L)) * 1.15;
  const X = (v: number) => M + (v / maxT2) * (W - M - 16), Y = (v: number) => H - M + 12 - (v / maxL) * (H - M - 12);
  return (
    <article className="wrap" style={{ paddingBlock: "clamp(32px, 5vw, 64px)", display: "grid", gap: 28, maxWidth: 980 }}>
      <header style={{ display: "grid", gap: 12 }}>
        <p className="small">Series · {pts.length} experiments</p>
        <h1 style={{ fontSize: "clamp(28px, 3.6vw, 42px)" }}>{s.title}</h1>
        <p className="lede">{s.note}</p>
      </header>
      <section style={{ display: "grid", gap: 8 }}>
        <p style={{ fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 650 }} className="num">
          g = {g.toFixed(2)} ± {sg.toFixed(2)} ± {sgShared.toFixed(2)} m/s²
        </p>
        <p className="small">
          The first ± is the scatter between runs, which shrinks as you add lengths. The second is what every run shares, the ruler’s true size ({Math.round(relShared * 100)}%: a plain sheet could be A4 or US Letter), which no number of runs removes; measure the sheet once and it goes away.
        </p>
        <p className="small">
          From the slope of L against T² ({(k * 1000).toFixed(1)} mm/s²), g = 4π² × slope.{s.truth ? ` True value: ${s.truth.g} m/s², off by ${Math.abs(((g - s.truth.g) / s.truth.g) * 100).toFixed(1)}%.` : ""} The single runs gave {pts.map((p) => p.g.toFixed(2)).join(", ")}: each one’s ruler error is its own, and the line averages them.
        </p>
      </section>
      <figure>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W }} role="img" aria-label="String length against period squared, with the fitted straight line">
          <line x1={M} x2={W - 16} y1={Y(0)} y2={Y(0)} stroke="var(--rule)" />
          <line x1={M} x2={M} y1={Y(0)} y2={12} stroke="var(--rule)" />
          <line x1={X(0)} y1={Y(0)} x2={X(maxT2)} y2={Y(k * maxT2)} stroke="var(--law)" strokeWidth="2" />
          {pts.map((p) => (
            <g key={p.id}>
              <line x1={X(p.T ** 2)} x2={X(p.T ** 2)} y1={Y(p.L - p.sL)} y2={Y(p.L + p.sL)} stroke="var(--measured)" strokeWidth="1.5" />
              <circle cx={X(p.T ** 2)} cy={Y(p.L)} r="5" fill="var(--measured)" />
            </g>
          ))}
          {[0, 1, 2, 3, 4, 5].filter((v) => v <= maxT2).map((v) => (
            <text key={v} x={X(v)} y={H - 18} fontSize="12" textAnchor="middle" fill="var(--ink-3)">
              {v}
            </text>
          ))}
          {[0, 0.25, 0.5, 0.75, 1, 1.25].filter((v) => v <= maxL).map((v) => (
            <text key={v} x={M - 8} y={Y(v) + 4} fontSize="12" textAnchor="end" fill="var(--ink-3)">
              {v}
            </text>
          ))}
          <text x={W / 2} y={H - 2} fontSize="12" textAnchor="middle" fill="var(--ink-2)">
            T² (s²)
          </text>
          <text x={12} y={16} fontSize="12" fill="var(--ink-2)">
            L (m)
          </text>
        </svg>
      </figure>
      <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 760 }} className="num">
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--ink)" }}>
            <th style={{ padding: 6 }}>Run</th>
            <th style={{ padding: 6 }}>L, measured (m)</th>
            {s.truth && <th style={{ padding: 6 }}>L, true (m)</th>}
            <th style={{ padding: 6 }}>T (s)</th>
            <th style={{ padding: 6 }}>T² (s²)</th>
            <th style={{ padding: 6 }}>g, this run alone</th>
          </tr>
        </thead>
        <tbody>
          {pts.map((p, i) => (
            <tr key={p.id} style={{ borderBottom: "1px solid var(--rule)" }}>
              <td style={{ padding: 6 }}>
                <Link href={`/x/${p.id}`}>{p.title}</Link>
              </td>
              <td style={{ padding: 6 }}>
                {p.L.toFixed(3)} ± {p.sL.toFixed(3)}
              </td>
              {s.truth && <td style={{ padding: 6 }}>{s.truth.lengths[i]?.toFixed(2)}</td>}
              <td style={{ padding: 6 }}>
                {p.T.toFixed(3)} ± {p.sT.toFixed(3)}
              </td>
              <td style={{ padding: 6 }}>{(p.T ** 2).toFixed(3)}</td>
              <td style={{ padding: 6 }}>{p.g.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small" style={{ maxWidth: "75ch" }}>
        The period comes from the fitted law, so it uses every frame of the swing rather than a stopwatch on ten oscillations; its uncertainty is a few milliseconds. The length comes from the ruler in each clip, and the ruler is the larger error, which is why the points scatter vertically.
      </p>
    </article>
  );
}

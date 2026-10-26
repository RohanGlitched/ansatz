import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeriesChart from "@/components/SeriesChart";
import Tex from "@/components/Tex";
import PrintButton from "@/components/PrintButton";
import { getExperiment, plateData, winnerOf } from "@/lib/experiments";
import { lawLatex, paramLatex } from "@/lib/latex";
import { prettyUnit } from "@/lib/units";
import styles from "./report.module.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const e = await getExperiment(id);
  return { title: e ? `Lab report: ${e.title}` : "Lab report" };
}

/** A one-page lab report in the form a physics practical asks for: aim, method, observations, result, errors. */
export default async function ReportPage({ params }: Params) {
  const { id } = await params;
  const e = await getExperiment(id);
  if (!e) notFound();
  const win = winnerOf(e);
  const plate = plateData(e);
  const m = e.measured;
  const lengthUnit = m.calibration.kind === "none" ? "px" : "m";
  const channels = Object.keys(win.fit.predicted).filter((c) => m.series.ch[c]);
  const free = win.law.params.filter((p) => !p.fixed && p.name !== "cal");
  const step = Math.max(1, Math.ceil(m.series.t.length / 14));
  const rows = m.series.t.map((t, i) => ({ t, i })).filter((r) => r.i % step === 0);
  const fmt = (v: number, sig = 3) => (Number.isFinite(v) ? String(+v.toPrecision(sig)) : "—");
  return (
    <article className={styles.page}>
      <div className={styles.noprint}>
        <PrintButton />
        <a href={`/x/${e.id}`}>Back to the experiment</a>
      </div>
      <header>
        <p className={styles.small}>Lab report, made with Ansatz from a video clip ({new Date(e.createdAt).toDateString()})</p>
        <h1>{e.title}</h1>
      </header>

      <h2>Aim</h2>
      <p>To find the law that governs the motion in the clip, and to measure its constants with their uncertainties.</p>

      <h2>Apparatus</h2>
      <p>
        A video clip ({e.video.frames} frames at {e.video.fps.toFixed(1)} fps, {e.video.width}×{e.video.height}); for scale, {m.calibration.note}. Measurement by SAM 3.1 (Meta), one mask per frame.
      </p>

      <h2>Method</h2>
      <ol>
        <li>The object (“{e.tracking.noun}”) was located in every frame; its position was taken as the centre of its mask. Frame times were read from the video file.</li>
        <li>{e.candidates.length} candidate laws were written as equations of motion and each was fitted to the first {Math.round(e.trainFrac * 100)}% of the motion.</li>
        <li>Each fitted law predicted the remaining {Math.round((1 - e.trainFrac) * 100)}% of the motion, which it had not seen. The law with the smallest prediction error was kept.</li>
      </ol>

      <h2>Observations</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>t (s)</th>
            {Object.keys(m.series.ch).map((c) => (
              <th key={c}>{c === "theta" ? "θ (rad)" : `${c} (${lengthUnit})`}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, i }) => (
            <tr key={i}>
              <td>{t.toFixed(3)}</td>
              {Object.keys(m.series.ch).map((c) => (
                <td key={c}>{fmt(m.series.ch[c][i], 4)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.small}>Every {step === 1 ? "" : `${step}th `}measurement of {m.series.t.length}; the full series is on the experiment page.</p>
      {channels.slice(0, 2).map((ch) => (
        <SeriesChart key={ch} t={m.series.t} measured={m.series.ch[ch]} law={win.fit.predicted[ch]} split={plate.split} label={ch === "theta" ? "angle" : ch} unit={ch === "theta" ? "rad" : lengthUnit} height={200} />
      ))}

      <h2>Result</h2>
      <p>The law that best predicted the unseen motion: {win.law.title}.</p>
      <div className={styles.eq}>
        {lawLatex(win.law).map((l, i) => (
          <Tex key={i} display>
            {l}
          </Tex>
        ))}
      </div>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Quantity</th>
            <th>Measured</th>
            <th>Accepted value</th>
            <th>Difference</th>
          </tr>
        </thead>
        <tbody>
          {free.map((p) => {
            const c = e.comparisons.find((x) => x.param === p.name);
            return (
              <tr key={p.name}>
                <td>
                  <Tex>{paramLatex(p.name)}</Tex> {p.meaning}
                </td>
                <td>
                  {fmt(win.fit.theta[p.name])} ± {fmt(win.fit.sigma[p.name], 2)} {prettyUnit(p.unit)}
                </td>
                <td>{c ? `${fmt(c.reference)} ${prettyUnit(p.unit)}` : "—"}</td>
                <td>{c ? `${c.errorPct >= 0 ? "+" : ""}${c.errorPct.toFixed(1)}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>{e.finding}</p>

      <h2>Sources of error</h2>
      <ul>
        <li>Scale: {m.calibration.note}.</li>
        {[...e.observation.caveats, ...(e.critique?.caveats ?? [])].slice(0, 5).map((c, i) => (
          <li key={i}>{c}</li>
        ))}
        <li>Given rather than measured: {e.given.length ? e.given.join("; ") : "nothing"}.</li>
      </ul>
    </article>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./FalsifyPlate.module.css";

type Per = { frac: number; ok: boolean; testRms: number; testZ: number | null; trainZ: number | null; path: [number, number][] };
type LawRow = { id: string; title: string; origin: string; rank: number; per: Per[] };
type Grid = {
  id: string;
  fracs: number[];
  N: number;
  sealed: number;
  width: number;
  height: number;
  codedWidth: number | null;
  unit: "m" | "rad" | "px";
  t: number[];
  seen: ([number, number] | null)[];
  winner: string;
  laws: LawRow[];
};

export type FalsifyLaw = { id: string; who: string; html: string };

/**
 * The Falsification Plate. The reader drags the line between the past the laws may see and the future they must
 * predict; every candidate law, refitted on the past with the same code a run uses (scripts/falsify-grid.ts),
 * predicts the future, and a law whose miss is far above the measurement noise is struck through.
 */
export default function FalsifyPlate({ id, video, t0, laws: meta, start = 0.7 }: { id: string; video?: string; t0: number; laws: FalsifyLaw[]; start?: number }) {
  const [g, setG] = useState<Grid | null>(null);
  const [err, setErr] = useState(false);
  const [k, setK] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [colour, setColour] = useState(false);
  const vRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    fetch(`/falsify/${id}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Grid) => {
        setG(d);
        const i = d.fracs.reduce((b, f, j) => (Math.abs(f - start) < Math.abs(d.fracs[b] - start) ? j : b), 0);
        setK(i);
      })
      .catch(() => setErr(true));
  }, [id, start]);

  // sweep the line from the first split to the last, one step every 0.7 s
  useEffect(() => {
    if (!playing || !g) return;
    const h = setInterval(() => {
      setK((x) => {
        if (x >= g.fracs.length - 1) {
          setPlaying(false);
          return x;
        }
        return x + 1;
      });
    }, 700);
    return () => clearInterval(h);
  }, [playing, g]);

  const frac = g ? g.fracs[k] : start;
  const n = g?.t.length ?? 0;
  const cut = g ? Math.max(1, Math.min(n - 1, Math.round(frac * (n - 1)))) : 0;

  // the film shows the instant the line stands at
  useEffect(() => {
    const v = vRef.current;
    if (!v || !g) return;
    const t = t0 + g.t[cut];
    if (Number.isFinite(t) && v.readyState >= 1) v.currentTime = Math.max(0, t);
  }, [cut, g, t0]);

  const view = useMemo(() => {
    if (!g) return null;
    // the chart follows the axis the body moves along most
    const pts = g.seen.filter(Boolean) as [number, number][];
    const vx = variance(pts.map((p) => p[0]));
    const vy = variance(pts.map((p) => p[1]));
    const ax: 0 | 1 = vx >= vy ? 0 : 1;
    const flip = ax === 1; // image y grows downward; draw height growing upward
    return { ax, flip };
  }, [g]);

  if (err) return null;
  if (!g || !view) return <div className={styles.loading}>Setting the plate…</div>;

  const W = g.codedWidth ?? g.width;
  const Hh = g.height;
  const rows = g.laws
    .map((L) => {
      const p = L.per[k];
      const score = p?.ok ? Math.max(p.testZ ?? Infinity, p.trainZ ?? 0) : Infinity;
      return { L, p, score, m: meta.find((x) => x.id === L.id) };
    })
    .filter((r) => r.p);
  const best = Math.min(...rows.map((r) => r.score));
  // struck: misses the future by more than 3 times the noise and more than twice the best law
  const isStruck = (s: number) => !Number.isFinite(s) || (s > 3 && s > 2 * best);
  const order = [...rows].sort((a, b) => a.score - b.score);
  const winnerNow = order[0];

  // the time chart
  const CW = 1000, CH = 300, PAD = 28;
  const vals = g.seen.map((p) => (p ? p[view.ax] : NaN));
  const allVals = [...vals, ...rows.flatMap((r) => r.p.path.slice(cut).map((q) => q[view.ax]))].filter(Number.isFinite);
  const lo = Math.min(...vals.filter(Number.isFinite)), hi = Math.max(...vals.filter(Number.isFinite));
  const span = Math.max(1e-6, hi - lo);
  const clampV = (v: number) => Math.max(lo - span * 0.6, Math.min(hi + span * 0.6, v));
  const vlo = Math.max(lo - span * 0.6, Math.min(...allVals)), vhi = Math.min(hi + span * 0.6, Math.max(...allVals));
  const T0 = g.t[0], T1 = g.t[n - 1];
  const X = (t: number) => PAD + ((t - T0) / Math.max(1e-9, T1 - T0)) * (CW - 2 * PAD);
  const Y = (v: number) => {
    const u = (clampV(v) - vlo) / Math.max(1e-9, vhi - vlo);
    return view.flip ? PAD + u * (CH - 2 * PAD) : CH - PAD - u * (CH - 2 * PAD);
  };
  const xCut = X(g.t[cut]);
  const sealedX = X(g.t[Math.round((g.sealed / Math.max(1, g.N - 1)) * (n - 1))] ?? g.t[cut]);

  const miss = (p: Per) => {
    if (!p.ok || !Number.isFinite(p.testRms)) return "no fit";
    if (g.unit === "m") return p.testRms < 0.01 ? `${(p.testRms * 1000).toFixed(1)} mm` : `${(p.testRms * 100).toFixed(1)} cm`;
    if (g.unit === "rad") return `${((p.testRms * 180) / Math.PI).toFixed(2)}°`;
    return `${p.testRms.toFixed(1)} px`;
  };

  return (
    <div className={styles.plate}>
      <div className={styles.top}>
        <div className={styles.left}>
          <div className={styles.film} style={{ aspectRatio: `${W} / ${Hh}` }}>
            {video && (
              <video
                ref={vRef}
                src={video}
                muted
                playsInline
                preload="auto"
                className={styles.video}
                style={colour ? undefined : { filter: "url(#cyanotype)" }}
                onLoadedMetadata={(e) => {
                  e.currentTarget.currentTime = Math.max(0, t0 + g.t[cut]);
                }}
              />
            )}
            <svg viewBox={`0 0 ${W} ${Hh}`} className={styles.over} preserveAspectRatio="none" aria-hidden="true">
              {g.seen.map((p, i) =>
                p && i <= cut ? <circle key={i} cx={p[0]} cy={p[1]} r={W / 190} className={styles.dot} /> : p ? <circle key={i} cx={p[0]} cy={p[1]} r={W / 260} className={styles.ghostDot} /> : null,
              )}
              {rows.map((r) => {
                const pts = r.p.path.slice(cut).filter((q) => Number.isFinite(q[0]) && Number.isFinite(q[1]));
                if (pts.length < 2) return null;
                const struck = isStruck(r.score);
                return <polyline key={r.L.id} points={pts.map((q) => q.join(",")).join(" ")} className={struck ? styles.lawStruck : r === winnerNow ? styles.lawBest : styles.law} />;
              })}
            </svg>
            {video && (
              <button type="button" className={styles.colour} onClick={() => setColour((c) => !c)} aria-pressed={colour}>
                {colour ? "Print as cyanotype" : "Original colour"}
              </button>
            )}
          </div>


        <div className={styles.chartWrap}>
          <svg viewBox={`0 0 ${CW} ${CH}`} className={styles.chart} role="img" aria-label={`The motion against time. The laws see the first ${Math.round(frac * 100)}% and predict the rest.`}>
            <rect x={xCut} y={0} width={CW - xCut} height={CH} className={styles.future} />
            {g.seen.map((p, i) => (p ? <circle key={i} cx={X(g.t[i])} cy={Y(p[view.ax])} r={i <= cut ? 3.4 : 2.6} className={i <= cut ? styles.cDot : styles.cGhost} style={i <= cut ? { animationDelay: `${Math.min(1.6, i * 0.012)}s` } : undefined} /> : null))}
            {rows.map((r) => {
              const pts = r.p.path
                .map((q, i) => [X(g.t[i]), Y(q[view.ax])] as const)
                .slice(cut)
                .filter((q) => Number.isFinite(q[1]));
              if (pts.length < 2) return null;
              const struck = isStruck(r.score);
              return <polyline key={r.L.id} points={pts.map((q) => q.join(",")).join(" ")} className={struck ? styles.cLawStruck : r === winnerNow ? styles.cLawBest : styles.cLaw} />;
            })}
            <line x1={sealedX} x2={sealedX} y1={CH - 14} y2={CH} className={styles.sealed} />
            <line x1={xCut} x2={xCut} y1={0} y2={CH} className={styles.cut} />
            <text x={xCut - 10} y={20} textAnchor="end" className={styles.lab}>
              the past the laws may see
            </text>
            <text x={xCut + 10} y={20} className={styles.lab}>
              the future they must predict
            </text>
          </svg>
          <input
            type="range"
            min={0}
            max={g.fracs.length - 1}
            step={1}
            value={k}
            onChange={(e) => {
              setPlaying(false);
              setK(+e.target.value);
            }}
            className={styles.range}
            aria-label="How much of the motion the laws may see"
            aria-valuetext={`${Math.round(frac * 100)}% seen, ${Math.round((1 - frac) * 100)}% to predict`}
          />
        </div>

        <div className={styles.foot}>
          <p className={styles.status}>
            The laws see <b>{Math.round(frac * 100)}%</b> of the motion and predict the last <b>{Math.round((1 - frac) * 100)}%</b>.{" "}
            {rows.filter((r) => isStruck(r.score)).length} of {rows.length} refuted.
            {Math.abs(frac - 0.7) < 0.026 && " This is where the run sealed its line."}
          </p>
          <button type="button" className="btn ghost" onClick={() => (playing ? setPlaying(false) : (setK(0), setPlaying(true)))}>
            {playing ? "Stop" : "Sweep the line from 30% to 90%"}
          </button>
        </div>
        </div>

        <ol className={styles.ledger} aria-live="polite">
          {order.map((r, i) => {
            const struck = isStruck(r.score);
            return (
              <li key={r.L.id} className={`${styles.row} ${struck ? styles.rowStruck : ""} ${i === 0 ? styles.rowBest : ""}`}>
                <div className={styles.rowHead}>
                  <span className={styles.who}>{r.m?.who ?? whoOf(r.L.origin)}</span>
                  <span className={styles.verdict}>{struck ? "refuted by the future" : i === 0 ? "predicts best" : "still standing"}</span>
                </div>
                <div key={struck ? "s" : "h"} className={`${styles.eq} ${struck ? styles.eqStruck : ""}`} dangerouslySetInnerHTML={{ __html: r.m?.html ?? escapeHtml(r.L.title) }} />
                <div className={styles.miss}>
                  <span>misses the future by</span>
                  <b>{miss(r.p)}</b>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function variance(a: number[]) {
  const m = a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length);
}

function whoOf(origin: string) {
  if (origin === "muse") return "Muse Spark proposed";
  if (origin === "revision") return "Muse Wonder proposed";
  if (origin === "control") return "textbook control";
  return origin;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

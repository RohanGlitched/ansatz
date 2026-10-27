"use client";

import katex from "katex";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import LiveStrip, { SLICE, type Geo, type RaceLaw } from "./LiveStrip";
import { alignMeasure, clockOf, fmtMiss, fmtZ, linkObjects, missOf, pickSubject, samFrame, tiedScores, type Readout } from "./liveStripMath";
import styles from "./LiveRun.module.css";

export type LiveData = {
  /** SAM's measurements as they stream in: [frame, x, y] in the clip's pixels (mask centroids) */
  tracking?: { width: number; height: number; frames: number; pts: [number, number, number][] };
  /** k: each point's frame in the tracked clip, when the stream carries it (replays do; a live run aligns them) */
  measure?: { width: number; height: number; px: [number, number][]; pivot: [number, number] | null; k?: number[] };
  laws?: { id: string; title: string; summary: string; latex: string[] }[];
  /** z: the ranking's score in noise units (the worse of the fitted and unseen misses), when the stream carries it */
  board?: { id: string; title: string; origin: string; rank: number; miss: string; rel: number; z?: number; latex: string[]; path: [number, number][] }[];
  /** the clip's clock, read from the upload, observe and track steps */
  clock?: { fps?: number; window?: { start_s: number; end_s: number }; cut?: [number, number] };
  /** where the photo-finish is cut: a fixed column at x (straight-up motion), or riding on SAM's x */
  cut?: { axis: "y" | "follow"; x?: number };
  trainFrac?: number;
  /** the one-paragraph result, once the report is written */
  summary?: string;
};

type Row = { id: string; title: string; origin: string; rank: number; latex: string[] };

const RACE_MS = 2800;
const LOSER_STYLES: RaceLaw["style"][] = [
  { stroke: "#e9ebe6", dash: "7 4", width: 1.6 },
  { stroke: "#c4c9cf", dash: "2 3", width: 1.6 },
  { stroke: "#e9ebe6", dash: "10 3 2 3", width: 1.4 },
  { stroke: "#9aa0a8", dash: "1 4", width: 1.8 },
  { stroke: "#c4c9cf", dash: "4 2", width: 1.2 },
];
const styleOf = (rank: number): RaceLaw["style"] => (rank === 1 ? { stroke: "#8fa0ff", width: 3 } : LOSER_STYLES[(rank - 2) % LOSER_STYLES.length]);

function tex(s: string) {
  return katex.renderToString(s, { throwOnError: false, strict: "ignore" });
}

/**
 * What the experiment has found so far, on the dark plate: the clip with SAM's measurements on it, the photo-finish
 * strip it builds frame by frame, then the laws racing across the frames none of them saw.
 */
function LiveRun({ src, live, footer, readout }: { src: string | null; live: LiveData; footer?: ReactNode; /** the result in large type, once the run has ended */ readout?: Readout | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [vdim, setVdim] = useState<[number, number]>([0, 0]);
  const m = live.measure;
  const tr = live.tracking;
  const W = m?.width ?? tr?.width ?? 16, H = m?.height ?? tr?.height ?? 9;
  const r = Math.max(2, W / 240);
  // SAM's coordinate frame (wider than W for footage with non-square pixels)
  const [FW] = samFrame(W, H, vdim[0], vdim[1]);

  // at phone width the stage pins under the site's sticky header, whose height changes as its nav wraps
  const stage = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const head = document.querySelector("header");
    const el = stage.current;
    if (!head || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => el.style.setProperty("--pin-top", `${head.getBoundingClientRect().height}px`));
    ro.observe(head);
    return () => ro.disconnect();
  }, []);

  const objs = useMemo(() => (tr ? linkObjects(tr.pts, tr.width, tr.height) : []), [tr]);
  const subject = useMemo(() => pickSubject(objs), [objs]);
  const clk = live.clock;
  const clock = useMemo(
    () => (tr && duration ? clockOf({ duration, frames: tr.frames, fps: clk?.fps, window: clk?.window, cut: clk?.cut }) : null),
    [tr?.frames, duration, clk?.fps, clk?.window, clk?.cut], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const ks = useMemo(() => (m ? (m.k && m.k.length === m.px.length ? m.k : alignMeasure(m.px, objs)) : null), [m, objs]);

  // the measured points and each law's path in strip units, with each law's miss as it accumulates across the unseen frames
  const race = useMemo(() => {
    if (!m || !ks || !tr) return null;
    const n = m.px.length;
    const X = (k: number) => (k + 0.5) * SLICE;
    const pts = m.px.map((p, i) => [X(ks[i]), p[1]] as [number, number]);
    const split = Math.min(n - 1, Math.max(1, Math.round(n * (live.trainFrac ?? 0.7))));
    const geo: Geo = { pts, split, splitX: (pts[split][0] + pts[split - 1][0]) / 2, endX: pts[n - 1][0] + SLICE / 2, x0: pts[0][0], laws: [] };
    const miss: Record<string, { value: number; unit: string; xs: number[]; cum: number[] }> = {};
    for (const b of live.board ?? []) {
      if (!b.path?.length) continue;
      const idx = (i: number) => (b.path.length === n ? i : Math.round((i * (n - 1)) / Math.max(1, b.path.length - 1)));
      const lp = b.path.map((p, i) => [pts[idx(i)][0], p[1]] as [number, number]);
      geo.laws.push({ id: b.id, rank: b.rank, pts: lp, style: styleOf(b.rank) });
      // the miss counts up with the squared distance from the measured points, so it climbs where the law drifts off
      const xs: number[] = [], cum: number[] = [0];
      for (let i = 0; i < b.path.length; i++) {
        const j = idx(i);
        if (j < split) continue;
        const d = Math.hypot(b.path[i][0] - m.px[j][0], b.path[i][1] - m.px[j][1]);
        xs.push(lp[i][0]);
        cum.push(cum[cum.length - 1] + d * d);
      }
      miss[b.id] = { ...missOf(b.miss, b.rel), xs, cum };
    }
    return { geo, miss };
  }, [m, ks, tr, live.board, live.trainFrac]);

  // the race: starts when the fitted laws arrive, a beat after the strip has zoomed in on the motion, and runs again
  // when a new law joins the board (Muse Wonder's, after the referee)
  const [p, setP] = useState(-1);
  const [settled, setSettled] = useState(false);
  const started = useRef("");
  const boardKey = live.board?.map((b) => b.id).join("|") ?? "";
  const canRace = !!race?.geo.laws.length;
  useEffect(() => {
    if (!boardKey || started.current === boardKey) return;
    const again = !!started.current;
    started.current = boardKey;
    if (again) {
      setSettled(false);
      setP(0);
    }
    if (!canRace || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setP(1);
      setSettled(true);
      return;
    }
    let raf = 0, to = 0;
    const t0 = performance.now() + (again ? 400 : 700);
    const tick = (now: number) => {
      const q = Math.min(1, Math.max(0, (now - t0) / RACE_MS));
      setP(q);
      if (q < 1) raf = requestAnimationFrame(tick);
      else to = window.setTimeout(() => setSettled(true), 250);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(to);
    };
  }, [boardKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const counter = (id: string) => {
    const mm = race?.miss[id];
    if (!mm) return null;
    if (p >= 1) return fmtMiss(mm.value, mm.unit);
    if (p < 0 || !race) return null;
    const g = race.geo;
    const front = g.splitX + (g.endX - g.splitX) * (0.5 - Math.cos(Math.PI * p) / 2);
    const total = mm.cum[mm.cum.length - 1];
    let acc = 0;
    for (let i = 0; i < mm.xs.length; i++) {
      const x = mm.xs[i], prev = i ? mm.xs[i - 1] : g.splitX;
      const seg = mm.cum[i + 1] - mm.cum[i];
      if (front >= x) acc += seg;
      else {
        if (front > prev) acc += (seg * (front - prev)) / Math.max(1e-6, x - prev);
        break;
      }
    }
    return fmtMiss(total > 0 ? mm.value * Math.sqrt(acc / total) : mm.value * p, mm.unit);
  };

  const rows: Row[] | null = live.board ?? live.laws?.map((l, i) => ({ ...l, rank: i + 1, origin: "muse" })) ?? null;
  const texed = useMemo(() => new Map((rows ?? []).map((l) => [l.id, l.latex.slice(0, 2).map(tex)])), [live.board, live.laws]); // eslint-disable-line react-hooks/exhaustive-deps

  const path = (pts: [number, number][]) => pts.map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join("");
  const winner = live.board?.[0];
  const sub = objs[subject];
  const cutX = live.cut?.axis === "y" && live.cut.x !== undefined ? live.cut.x : sub?.[sub.length - 1]?.[1];
  const cols = tr ? new Set(sub?.map((q) => q[0])).size : 0;
  const winMiss = winner ? race?.miss[winner.id] : undefined;
  // the winner against the runner-up in units of the measurement noise: what the ranking compares
  const rival = live.board?.[1];
  const zLine =
    winner && rival && Number.isFinite(winner.z) && Number.isFinite(rival.z)
      ? `${fmtZ(winner.z!)} vs ${fmtZ(rival.z!)} the noise: ${tiedScores(winner.z!, rival.z!) ? "a tie, so the simpler law wins" : `${winner.title} wins, missing the unseen frames ${fmtRatio(rival.rel / winner.rel)} less`}`
      : null;

  return (
    <>
      <div className={styles.stage} ref={stage} data-stage="">
        <div className={styles.frame} style={{ ["--ar" as string]: `${W / H}` }}>
          {src && <video ref={video} src={src} className={styles.video} muted autoPlay loop playsInline preload="auto" onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setDuration(v.duration || 0);
                setVdim([v.videoWidth, v.videoHeight]);
              }} />}
          <svg className={styles.overlay} viewBox={`0 0 ${FW} ${H}`} preserveAspectRatio="none" aria-label={m ? "Measured positions and the laws' paths" : "SAM 3.1's measurements as they arrive"}>
            {cutX !== undefined && !m && <line x1={cutX} x2={cutX} y1={0} y2={H} className={styles.cut} vectorEffect="non-scaling-stroke" />}
            {m ? (
              <>
                {settled && live.board?.slice(1).map((b) => <path key={b.id} d={path(b.path)} fill="none" stroke="#e9ebe6" strokeOpacity="0.4" strokeWidth={r * 0.5} strokeDasharray={`${r * 1.5} ${r * 1.5}`} />)}
                {settled && winner && <path d={path(winner.path)} fill="none" stroke="#8fa0ff" strokeWidth={r * 1.1} className={styles.draw} />}
                {m.px.map((q, i) => (
                  <circle key={i} cx={q[0]} cy={q[1]} r={r * 0.7} fill="#ff5a1f" className={styles.dot} style={{ animationDelay: `${Math.min(i * 12, 1800)}ms` }} />
                ))}
                {m.pivot && <circle cx={m.pivot[0]} cy={m.pivot[1]} r={r * 1.4} fill="none" stroke="#e9ebe6" strokeWidth={r * 0.4} />}
              </>
            ) : (
              objs.map((o, j) => o.map((q) => <circle key={`${j}-${q[0]}`} cx={q[1]} cy={q[2]} r={r * (j === subject ? 0.7 : 0.5)} fill={j === subject ? "#ff5a1f" : "#9aa0a8"} fillOpacity={j === subject ? 1 : 0.6} />))
            )}
          </svg>
          <p className={styles.wait}>
            {m
              ? `SAM 3.1: ${m.px.length} measured points in the motion window`
              : tr
                ? `SAM 3.1: ${cols} of ${tr.frames} frames measured`
                : "Reading the clip…"}
          </p>
        </div>
        <LiveStrip video={video} tracking={tr} objs={objs} subject={subject} clock={clock} cut={live.cut} geo={race?.geo ?? null} race={p} settled={settled} />
      </div>
      <div className={styles.board}>
        <p className={styles.caption}>
          Photo-finish, built live: a {SLICE}-pixel column cut from each frame SAM 3.1 measured,{" "}
          {live.cut?.axis === "y" ? "always at the same place in the picture," : "where SAM placed the moving thing in that frame,"} laid side by side so the motion draws its own graph against time.{" "}
          <span className={styles.o}>Orange</span>: SAM 3.1’s measurement. <span className={styles.b}>Blue</span>: the law that wins; the other lines are the laws it beat.
        </p>
        {rows && (
          <div className={styles.laws}>
            <p className={styles.h}>{live.board ? "The trial: each law’s miss on the frames it never saw" : "Laws proposed by Muse Spark, waiting to be fitted"}</p>
            <ol>
              {rows.map((l) => {
                const style = styleOf(l.rank);
                // without the strip's geometry (no frame for each point) the miss shows as the run reported it
                const c = live.board ? (race?.miss[l.id] ? counter(l.id) : live.board.find((b) => b.id === l.id)?.miss) : null;
                return (
                  <li key={l.id} className={`${live.board && settled ? (l.rank === 1 ? styles.win : styles.lose) : ""}`}>
                    <svg className={styles.swatch} viewBox="0 0 28 8" aria-hidden="true">
                      {live.board && <line x1="1" x2="27" y1="4" y2="4" stroke={style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} strokeLinecap="round" />}
                    </svg>
                    <span className={styles.title}>
                      {l.title}
                      {l.origin === "control" && <em> textbook control</em>}
                    </span>
                    <span className={styles.eq}>
                      {(texed.get(l.id) ?? []).map((x, i) => (
                        <span key={i} dangerouslySetInnerHTML={{ __html: x }} />
                      ))}
                    </span>
                    <span className={`num ${styles.miss}`}>
                      {c}
                      {live.board && settled && Number.isFinite(live.board.find((b) => b.id === l.id)?.z) && <small className={styles.z}>{fmtZ(live.board.find((b) => b.id === l.id)!.z!)} noise</small>}
                    </span>
                  </li>
                );
              })}
            </ol>
            {live.board && settled && zLine && <p className={styles.zLine}>{zLine}</p>}
            {live.board && settled && <p className={styles.note}>“× noise” is a law’s miss in units of the measurement noise, the worse of its fitted and unseen frames: about 1× is as good as the measurement allows. Misses within the noise of each other are a tie, and a tie goes to the simpler law.</p>}
          </div>
        )}
        {settled && winner && (
          <p className={styles.verdict}>
            <strong>{winner.title}</strong> predicted the {Math.round((1 - (live.trainFrac ?? 0.7)) * 100)}% of the motion it never saw to within{" "}
            <span className="num">{winMiss ? fmtMiss(winMiss.value, winMiss.unit) : winner.miss}</span>.{live.summary ? ` ${live.summary}` : ""}
          </p>
        )}
        {readout && (
          <div className={styles.readout} role="status">
            <p className={styles.readLabel}>{readout.label}</p>
            <p className={`num ${styles.bigNum}`}>{readout.value}</p>
            {readout.against && <p className={styles.readSub}>{readout.against}</p>}
          </div>
        )}
        {footer}
      </div>
    </>
  );
}

/** "229×", "4.4×": how many times smaller the winner's miss is */
function fmtRatio(r: number) {
  return `${r >= 10 ? Math.round(r).toLocaleString("en-US") : r.toFixed(1)}×`;
}

export default memo(LiveRun);

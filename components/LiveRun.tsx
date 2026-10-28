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
// laws in white ink: the winner solid and heavy, the others in dashes of their own so each can be told apart
const LOSER_STYLES: RaceLaw["style"][] = [
  { stroke: "#eef2f4", dash: "7 4", width: 1.6 },
  { stroke: "#dbe7f3", dash: "2 3", width: 1.6 },
  { stroke: "#eef2f4", dash: "10 3 2 3", width: 1.4 },
  { stroke: "#dbe7f3", dash: "1 4", width: 1.8 },
  { stroke: "#eef2f4", dash: "4 2", width: 1.2 },
];
const styleOf = (rank: number): RaceLaw["style"] => (rank === 1 ? { stroke: "#ffffff", width: 3 } : LOSER_STYLES[(rank - 2) % LOSER_STYLES.length]);

/** who wrote a law, as the experiment pages say it */
const whoOf = (origin: string) => (origin === "muse" ? "Muse Spark proposed" : origin === "revision" ? "Muse Wonder proposed" : origin === "control" ? "textbook control" : origin);

type BoardRow = NonNullable<LiveData["board"]>[number];
/**
 * Refuted: misses the unseen frames by more than 3 times the noise and more than twice the winner (the Falsification
 * Plate's rule). Without noise units, by more than 3 times the winner's miss.
 */
function refuted(b: BoardRow, best: BoardRow | undefined) {
  if (!best || b.id === best.id) return false;
  if (Number.isFinite(best.z)) return !Number.isFinite(b.z) || (b.z! > 3 && b.z! > 2 * best.z!);
  return !Number.isFinite(b.rel) || b.rel > 3 * best.rel;
}

function tex(s: string) {
  return katex.renderToString(s, { throwOnError: false, strict: "ignore" });
}

/**
 * What the experiment has found so far, printed on the plate: the clip as a cyanotype with SAM 3.1's measurements on
 * it in orange, the photo-finish strip it builds frame by frame, then the laws in white ink racing across the frames
 * none of them saw. A law the unseen frames refute is struck through in red.
 */
function LiveRun({ src, live, footer, readout }: { src: string | null; live: LiveData; footer?: ReactNode; /** the result in large type, once the run has ended */ readout?: Readout | null }) {
  const video = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [vdim, setVdim] = useState<[number, number]>([0, 0]);
  const [colour, setColour] = useState(false);
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
  const best = live.board?.[0];

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
      geo.laws.push({ id: b.id, rank: b.rank, pts: lp, style: styleOf(b.rank), struck: refuted(b, live.board?.[0]) });
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
  const winner = best;
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
  // on the clip, SAM's points in the unseen part of the motion are drawn open: the laws were never fitted to them
  const split = m ? Math.min(m.px.length - 1, Math.max(1, Math.round(m.px.length * (live.trainFrac ?? 0.7)))) : 0;
  const unseenPct = Math.round((1 - (live.trainFrac ?? 0.7)) * 100);
  const struckN = settled && live.board ? live.board.filter((b) => refuted(b, best)).length : 0;

  return (
    <>
      <div className={styles.stage} ref={stage} data-stage="">
        <div className={styles.frame} style={{ ["--ar" as string]: `${W / H}` }}>
          {src && (
            <video
              ref={video}
              src={src}
              className={`${styles.video} ${colour ? "" : styles.print}`}
              muted
              autoPlay
              loop
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                setDuration(v.duration || 0);
                setVdim([v.videoWidth, v.videoHeight]);
              }}
            />
          )}
          <svg className={styles.overlay} viewBox={`0 0 ${FW} ${H}`} preserveAspectRatio="none" role="img" aria-label={m ? "SAM 3.1's measured positions on the clip, and the laws' paths" : "SAM 3.1's measurements as they arrive"}>
            {cutX !== undefined && !m && <line x1={cutX} x2={cutX} y1={0} y2={H} className={styles.cut} vectorEffect="non-scaling-stroke" />}
            {m ? (
              <>
                {settled &&
                  live.board?.slice(1).map((b) => {
                    const struck = refuted(b, best);
                    return <path key={b.id} d={path(b.path)} fill="none" stroke={struck ? "var(--struck)" : "#eef2f4"} strokeOpacity={struck ? 0.8 : 0.5} strokeWidth={r * 0.5} strokeDasharray={`${r * 1.5} ${r * 1.5}`} className={styles.ink} />;
                  })}
                {settled && winner && <path d={path(winner.path)} fill="none" stroke="#ffffff" strokeWidth={r * 1.1} className={`${styles.draw} ${styles.ink}`} />}
                {m.px.map((q, i) =>
                  i < split || !live.board ? (
                    <circle key={i} cx={q[0]} cy={q[1]} r={r * 0.7} className={`${styles.dot} ${styles.seen}`} style={{ animationDelay: `${Math.min(i * 12, 1800)}ms` }} />
                  ) : (
                    <circle key={i} cx={q[0]} cy={q[1]} r={r * 0.7} strokeWidth={r * 0.35} className={`${styles.dot} ${styles.unseenDot}`} style={{ animationDelay: `${Math.min(i * 12, 1800)}ms` }} />
                  ),
                )}
                {m.pivot && <circle cx={m.pivot[0]} cy={m.pivot[1]} r={r * 1.4} fill="none" stroke="#eef2f4" strokeWidth={r * 0.4} />}
              </>
            ) : (
              objs.map((o, j) => o.map((q) => <circle key={`${j}-${q[0]}`} cx={q[1]} cy={q[2]} r={r * (j === subject ? 0.7 : 0.5)} fill={j === subject ? "var(--measured)" : "#dbe7f3"} fillOpacity={j === subject ? 1 : 0.6} />))
            )}
          </svg>
          <p className={styles.wait}>
            {m ? `SAM 3.1: ${m.px.length} measured points in the motion window` : tr ? `SAM 3.1: ${cols} of ${tr.frames} frames measured` : "Reading the clip…"}
          </p>
          {src && (
            <button type="button" className={styles.colour} onClick={() => setColour((c) => !c)} aria-pressed={colour}>
              {colour ? "Print as cyanotype" : "Original colour"}
            </button>
          )}
        </div>
        <LiveStrip video={video} tracking={tr} objs={objs} subject={subject} clock={clock} cut={live.cut} geo={race?.geo ?? null} race={p} settled={settled} colour={colour} />
      </div>
      <div className={styles.board}>
        <p className={styles.caption}>
          Photo-finish, built live: a {SLICE}-pixel column cut from each frame SAM 3.1 measured,{" "}
          {live.cut?.axis === "y" ? "always at the same place in the picture," : "where SAM placed the moving thing in that frame,"} laid side by side so the motion draws its own graph against time.
        </p>
        <p className={styles.key}>
          <span>
            <i className={styles.kDot} aria-hidden="true" /> SAM 3.1&rsquo;s measurement
          </span>
          <span>
            <i className={styles.kLaw} aria-hidden="true" /> a law&rsquo;s prediction
          </span>
          <span>
            <i className={styles.kStruck} aria-hidden="true" /> refuted by the frames it never saw
          </span>
        </p>
        {rows && (
          <div className={styles.laws}>
            <p className={styles.h}>
              {live.board ? (settled ? `The trial: each law’s miss on the last ${unseenPct}%, which no law was fitted to` : `The trial: every law predicts the last ${unseenPct}%`) : "Laws proposed by Muse Spark, waiting to be fitted"}
            </p>
            <ol className={styles.ledger}>
              {rows.map((l) => {
                const style = styleOf(l.rank);
                const b = live.board?.find((x) => x.id === l.id);
                const struck = !!b && settled && refuted(b, best);
                const won = !!b && settled && l.rank === 1;
                // without the strip's geometry (no frame for each point) the miss shows as the run reported it
                const c = live.board ? (race?.miss[l.id] ? counter(l.id) : b?.miss) : null;
                const verdict = !live.board ? "waiting to be fitted" : !settled ? "predicting" : won ? "predicts best" : struck ? "refuted by the future" : "still standing";
                return (
                  <li key={l.id} className={`${styles.row} ${won ? styles.win : ""} ${struck ? styles.lose : ""} ${settled && !won && !struck ? styles.stand : ""}`}>
                    <svg className={styles.swatch} viewBox="0 0 28 8" aria-hidden="true">
                      {live.board && <line x1="1" x2="27" y1="4" y2="4" stroke={struck ? "var(--struck)" : style.stroke} strokeWidth={style.width} strokeDasharray={style.dash} strokeLinecap="round" />}
                    </svg>
                    <div className={styles.lawText}>
                      <p className={styles.rowHead}>
                        <span className={styles.who}>{whoOf(l.origin)}</span>
                        <span className={styles.verdict}>{verdict}</span>
                      </p>
                      <p className={styles.title}>{l.title}</p>
                      <div className={`${styles.eq} ${struck ? styles.eqStruck : ""}`}>
                        {(texed.get(l.id) ?? []).map((x, i) => (
                          <span key={i} dangerouslySetInnerHTML={{ __html: x }} />
                        ))}
                      </div>
                    </div>
                    <p className={`num ${styles.miss}`}>
                      {c && <span className={styles.missLabel}>misses by</span>}
                      <b>{c}</b>
                      {b && settled && Number.isFinite(b.z) && <small className={styles.z}>{fmtZ(b.z!)} the noise</small>}
                    </p>
                  </li>
                );
              })}
            </ol>
            {live.board && settled && zLine && <p className={styles.zLine}>{zLine}</p>}
            {live.board && settled && (
              <p className={styles.note}>
                &ldquo;× the noise&rdquo; is a law&rsquo;s miss in units of the measurement noise, the worse of its fitted and unseen frames: about 1× is as good as the measurement allows. Misses within the noise of each other are a tie, and a tie goes to the simpler law.
                {struckN > 0 && ` A law is struck through when it misses by more than 3× the noise and more than twice the winner.`}
              </p>
            )}
          </div>
        )}
        {settled && winner && (
          <p className={styles.verdictLine}>
            <strong>{winner.title}</strong> predicted the {unseenPct}% of the motion it never saw to within <span className="num">{winMiss ? fmtMiss(winMiss.value, winMiss.unit) : winner.miss}</span>.{live.summary ? ` ${live.summary}` : ""}
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

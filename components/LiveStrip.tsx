"use client";

import { memo, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { samFrame, type Pt, type clockOf } from "./liveStripMath";
import styles from "./LiveStrip.module.css";

/** strip pixels per frame, as in scripts/slits.ts */
export const SLICE = 4;
/** playback rate while the clip is being cut into columns (rVFC still sees every frame at 2× on a 60 Hz screen) */
const CAPTURE_RATE = 2;

export type Clock = ReturnType<typeof clockOf>;

export type RaceLaw = {
  id: string;
  rank: number;
  /** the law's path in strip units: x = column centre, y = clip pixels */
  pts: [number, number][];
  style: { stroke: string; dash?: string; width: number };
  /** the unseen frames refuted it: once the race settles it is struck through in red */
  struck?: boolean;
};

export type Geo = {
  /** measured points in strip units */
  pts: [number, number][];
  split: number;
  splitX: number;
  endX: number;
  x0: number;
  laws: RaceLaw[];
};

type Props = {
  video: RefObject<HTMLVideoElement | null>;
  tracking?: { width: number; height: number; frames: number; pts: [number, number, number][] };
  objs: Pt[][];
  subject: number;
  clock: Clock | null;
  cut?: { axis: "y" | "follow"; x?: number };
  geo: Geo | null;
  /** the race front, 0 → 1 across the unseen frames; -1 before the laws are fitted */
  race: number;
  settled: boolean;
  /** show the clip's own colours instead of printing it as a cyanotype */
  colour?: boolean;
};

const ease = (p: number) => 0.5 - Math.cos(Math.PI * p) / 2;

/**
 * The photo-finish, built while SAM 3.1 measures: each time a mask arrives, the clip's frame is cut at the subject
 * into a 4-px column and laid beside the last, and the orange dot lands on it. When the laws are fitted, their paths
 * race across the shaded 30% none of them saw.
 */
function LiveStrip({ video, tracking: tr, objs, subject, clock, cut, geo, race, settled, colour = false }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const desired = useRef(new Map<number, number>());
  const drawn = useRef(new Map<number, number>());
  const clockRef = useRef<Clock | null>(null);
  const lastData = useRef(0);
  const planRef = useRef<() => void>(() => {});
  const [ver, setVer] = useState(0);
  const bumped = useRef(false);
  const W = (tr?.frames ?? 1) * SLICE;
  const H = tr?.height ?? 9;
  clockRef.current = clock;

  // what each column should be cut from: a fixed x for straight-up motion, otherwise the subject's own x that frame
  useEffect(() => {
    if (!tr) return;
    const sub = objs[subject];
    if (!sub) return;
    const want = desired.current;
    want.clear();
    for (const p of sub) want.set(p[0], cut?.axis === "y" && cut.x !== undefined ? cut.x : Math.round(p[1]));
    lastData.current = performance.now();
    planRef.current();
  }, [tr, objs, subject, cut]);

  // the capture loop: play the clip through the frames SAM has measured and cut each one as it is shown
  useEffect(() => {
    const v = video.current;
    if (!v || !tr) return;
    const c = canvas.current;
    if (!c) return;
    if (c.width !== tr.frames * SLICE) {
      c.width = tr.frames * SLICE;
      c.height = Math.min(tr.height, 540);
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    let dead = false, busy = false, seekingPlay = false, waiting = false;
    const bump = () => {
      if (bumped.current) return;
      bumped.current = true;
      requestAnimationFrame(() => {
        bumped.current = false;
        setVer((n) => n + 1);
      });
    };
    const draw = (k: number) => {
      const x = desired.current.get(k);
      if (x === undefined || !v.videoWidth) return;
      const sc = v.videoWidth / samFrame(tr.width, tr.height, v.videoWidth, v.videoHeight)[0];
      const sw = Math.max(1, SLICE * sc);
      const sx = Math.max(0, Math.min(v.videoWidth - sw, x * sc - sw / 2));
      try {
        ctx.drawImage(v, sx, 0, sw, v.videoHeight, k * SLICE, 0, SLICE, c.height);
        drawn.current.set(k, x);
        bump();
      } catch {
        /* a frame that isn't decoded yet: the next pass gets it */
      }
    };
    const pending = () => {
      const out: number[] = [];
      for (const [k, x] of desired.current) {
        const d = drawn.current.get(k);
        if (d === undefined || Math.abs(d - x) > 1.5) out.push(k);
      }
      return out.sort((a, b) => a - b);
    };
    const seekTo = (t: number) =>
      new Promise<void>((res) => {
        const done = () => {
          v.removeEventListener("seeked", done);
          clearTimeout(to);
          res();
        };
        const to = setTimeout(done, 900);
        v.addEventListener("seeked", done);
        v.currentTime = t;
      });
    const play = (rate: number) => {
      v.playbackRate = rate;
      if (v.paused) v.play().catch(() => {});
    };
    // a few stragglers (frames a fast playback skipped, or the newest ones): fetch each by seeking, then wait on the
    // newest frame for SAM's next masks
    const drain = async (ks: number[]) => {
      const clk = clockRef.current;
      if (!clk) return;
      busy = true;
      v.pause();
      for (const k of ks) {
        if (dead) return;
        await seekTo(clk.tOf(k));
        draw(k);
      }
      busy = false;
      waiting = true;
    };
    const hasRvfc = typeof v.requestVideoFrameCallback === "function";
    const plan = () => {
      const clk = clockRef.current;
      if (dead || busy || seekingPlay || !clk || !v.videoWidth) return;
      const pend = pending();
      if (!pend.length) {
        // nothing left to cut: once SAM goes quiet, the clip loops at its own speed again
        if ((waiting || v.playbackRate !== 1) && performance.now() - lastData.current > 1500) {
          waiting = false;
          play(1);
        }
        return;
      }
      if (!hasRvfc) return void drain(pend.slice(0, 24));
      const kNow = clk.kAt(v.currentTime);
      const farBefore = kNow < pend[0] - (1.2 * clk.fps) / clk.every;
      const ahead = pend.some((k) => k >= kNow - 0.5);
      if (ahead && !farBefore && !(waiting && pend.length <= 2)) {
        waiting = false;
        play(CAPTURE_RATE);
        return;
      }
      if (pend.length <= 12) return void drain(pend);
      waiting = false;
      seekingPlay = true;
      seekTo(Math.max(0, clk.tOf(pend[0]) - 0.6 / clk.fps)).then(() => {
        seekingPlay = false;
        play(CAPTURE_RATE);
      });
    };
    planRef.current = plan;
    let handle = 0;
    const onFrame = (_now: number, md: VideoFrameCallbackMetadata) => {
      if (dead) return;
      const clk = clockRef.current;
      if (clk && !busy) {
        const k = clk.kOf(md.mediaTime);
        if (k >= 0 && desired.current.has(k)) {
          const d = drawn.current.get(k), x = desired.current.get(k)!;
          if (d === undefined || Math.abs(d - x) > 1.5) draw(k);
        }
        plan();
      }
      handle = v.requestVideoFrameCallback(onFrame);
    };
    if (hasRvfc) handle = v.requestVideoFrameCallback(onFrame);
    const iv = setInterval(plan, 300);
    return () => {
      dead = true;
      clearInterval(iv);
      if (hasRvfc && handle) v.cancelVideoFrameCallback(handle);
      v.playbackRate = 1;
    };
  }, [video, tr ? tr.frames : 0, tr ? tr.width : 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // what the strip shows: the whole clip while SAM works, then the measured motion, close up
  const view = useMemo(() => {
    const full = { x0: 0, x1: W, y0: 0, y1: H };
    const fit = (ys: number[], minSpan: number) => {
      if (!ys.length) return { y0: 0, y1: H };
      const lo = Math.min(...ys), hi = Math.max(...ys);
      const pad = Math.max(0.3 * (hi - lo), 0.05 * H);
      let y0 = lo - pad, y1 = hi + pad;
      if (y1 - y0 < minSpan) {
        const c = (y0 + y1) / 2;
        (y0 = c - minSpan / 2), (y1 = c + minSpan / 2);
      }
      if (y0 < 0) (y1 -= y0), (y0 = 0);
      if (y1 > H) (y0 = Math.max(0, y0 - (y1 - H))), (y1 = H);
      return { y0, y1 };
    };
    if (geo && geo.pts.length > 2) {
      const xs = geo.pts.map((p) => p[0]);
      const lo = Math.min(...xs) - SLICE / 2, hi = Math.max(...xs) + SLICE / 2;
      const pad = Math.max(4 * SLICE, 0.14 * (hi - lo));
      return { x0: Math.max(0, lo - pad), x1: Math.min(W, hi + pad), ...fit(geo.pts.map((p) => p[1]), 0.32 * H) };
    }
    const sub = objs[subject];
    if (sub && sub.length > 4) return { ...full, ...fit(sub.map((p) => p[2]), 0.5 * H) };
    return full;
  }, [geo, objs, subject, W, H]);

  const sx = view.x1 - view.x0, sy = view.y1 - view.y0;
  const inner = {
    left: `${(-view.x0 / sx) * 100}%`,
    width: `${(W / sx) * 100}%`,
    top: `${(-view.y0 / sy) * 100}%`,
    height: `${(H / sy) * 100}%`,
  };
  const pctX = (x: number) => `${(x / W) * 100}%`;
  const pctY = (y: number) => `${(y / H) * 100}%`;

  // the strip's clock: a tick each clip second (half or fifth of one when zoomed in)
  const ticks = useMemo(() => {
    if (!clock || !tr) return [];
    const t0 = clock.tOf(view.x0 / SLICE) - 0.5 / clock.fps, t1 = clock.tOf(view.x1 / SLICE) - 0.5 / clock.fps;
    const span = t1 - t0;
    const step = span > 5 ? 1 : span > 2 ? 0.5 : span > 0.8 ? 0.2 : 0.1;
    const out: { x: number; label: string }[] = [];
    for (let t = Math.ceil(t0 / step - 1e-6) * step; t <= t1 + 1e-6; t += step) out.push({ x: clock.kAt(t) * SLICE, label: `${+t.toFixed(1)} s` });
    return out;
  }, [clock, tr, view.x0, view.x1]);

  const sub = objs[subject];
  const cols = drawn.current.size;
  void ver;
  const front = geo && race >= 0 ? geo.splitX + (geo.endX - geo.splitX) * ease(race) : null;
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("");
  const clipId = `race-${tr?.frames ?? 0}`;
  const seenPct = geo ? Math.round((geo.split / Math.max(1, geo.pts.length)) * 100) : 70;

  return (
    <div className={styles.wrap}>
      <div className={styles.ruler} aria-hidden="true">
        <div className={styles.rulerInner} style={{ left: inner.left, width: inner.width }}>
          {ticks.map((t) => (
            <span key={t.label} style={{ left: pctX(t.x) }}>
              {t.label}
            </span>
          ))}
        </div>
      </div>
      <div className={styles.view} role="img" aria-label={tr ? `Photo-finish being built: ${cols} of ${tr.frames} frames cut so far` : "The photo-finish builds here as SAM 3.1 measures each frame"}>
        <div className={`${styles.inner} ${geo ? styles.zoomed : ""}`} style={inner}>
          <canvas ref={canvas} className={`${styles.canvas} ${colour ? "" : styles.print}`} />
          {tr && (
            <svg className={styles.svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              {geo && (
                <>
                  <defs>
                    <clipPath id={clipId}>
                      <rect x={geo.splitX} y={-H} width={Math.max(0, (front ?? geo.splitX) - geo.splitX)} height={H * 3} />
                    </clipPath>
                  </defs>
                  <rect x={geo.splitX} y={-H} width={W - geo.splitX} height={H * 3} className={styles.unseen} />
                  <line x1={geo.splitX} x2={geo.splitX} y1={-H} y2={2 * H} className={styles.split} vectorEffect="non-scaling-stroke" />
                  {[...geo.laws].reverse().map((l) => {
                    const lose = settled && l.rank !== 1;
                    return (
                      <g key={l.id} className={`${styles.law} ${lose ? (l.struck ? styles.struck : styles.lost) : ""} ${settled && l.rank === 1 ? styles.won : ""}`}>
                        <path d={path(l.pts.slice(0, geo.split + 1))} stroke={l.style.stroke} strokeDasharray={l.style.dash} strokeWidth={l.style.width * 0.7} className={styles.fitted} vectorEffect="non-scaling-stroke" />
                        {race >= 0 && <path d={path(l.pts.slice(geo.split))} stroke={l.style.stroke} strokeDasharray={l.style.dash} strokeWidth={l.style.width} clipPath={`url(#${clipId})`} vectorEffect="non-scaling-stroke" />}
                      </g>
                    );
                  })}
                  {front !== null && race < 1 && <line x1={front} x2={front} y1={-H} y2={2 * H} className={styles.front} vectorEffect="non-scaling-stroke" />}
                </>
              )}
            </svg>
          )}
          {sub?.map((p) =>
            drawn.current.has(p[0]) ? <i key={`t${p[0]}`} className={`${styles.dot} ${geo ? styles.gone : ""}`} style={{ left: pctX((p[0] + 0.5) * SLICE), top: pctY(p[2]) }} /> : null,
          )}
          {geo?.pts.map((p, i) => (
            <i key={`m${i}`} className={styles.mdot} style={{ left: pctX(p[0]), top: pctY(p[1]), animationDelay: `${Math.min(i * 14, 900)}ms` }} />
          ))}
        </div>
        {geo && (
          <span className={styles.tag} style={{ left: `${((geo.splitX - view.x0) / sx) * 100}%` }}>
            <b>fitted, {seenPct}%</b>
            <b>predicted, {100 - seenPct}%</b>
          </span>
        )}
        {!tr ? <p className={styles.empty}>The photo-finish builds here, one column per frame, as SAM 3.1 measures.</p> : !geo && <p className={styles.count}>{cols} of {tr.frames} frames cut</p>}
      </div>
    </div>
  );
}

export default memo(LiveStrip);

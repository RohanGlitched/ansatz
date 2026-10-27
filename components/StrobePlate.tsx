"use client";

import { useEffect, useRef, useState } from "react";
import { rleDecode } from "@/lib/rle";
import mareyData from "./marey.json";
import styles from "./StrobePlate.module.css";

/** A chronophotograph made ahead of time by scripts/marey.ts: see that script. */
type Marey = { W: number; H: number; src: string; left: number; span: number; cx: number; dur: number; strobe: number[] };
const MAREY = mareyData as Record<string, Marey>;

export type PlateData = {
  video: string;
  width: number;
  height: number;
  baseT: number;
  strobe: { t: number; box: [number, number, number, number]; rle?: { size: [number, number]; counts: string | number[] } }[];
  measured: { x: number; y: number }[];
  /** index into `measured` where the frames the law never saw begin */
  split: number;
  law: { x: number; y: number }[];
  pivot?: { x: number; y: number } | null;
  whatIf?: { label: string; px: { x: number; y: number }[] }[];
  caption?: string;
  /** where to fetch `strobe` from when the page shipped without it (keeps listing pages light) */
  strobeSrc?: string;
  /** the same print rendered ahead of time (scripts/prints.ts): shown at once on listing pages */
  poster?: string;
};

type Props = { data: PlateData; showWhatIf?: number | null; compact?: boolean; priority?: boolean };

/**
 * A stroboscopic print made from the clip itself: one darkened frame as the plate, and the object's own
 * pixels cut out by SAM's masks at each strobe instant laid over it. The law's path is drawn on top; the
 * part of the path it predicted without seeing those frames is labelled, with the real positions on it.
 */
export default function StrobePlate({ data, showWhatIf = null, compact = false, priority = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(0);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(priority);
  // a ready-made print is used where it exists; if it fails to load, the print is developed from the clip as usual
  const [usePoster, setUsePoster] = useState(!!data.poster);
  const { height: H } = data;
  // motion that is mostly vertical gets a chronophotograph (each exposure shifted right by its time), with a switch
  // back to the true positions; it is shown first, since in the true print those exposures pile into one figure
  const marey = !compact && data.poster ? MAREY[data.poster.replace(/^.*\//, "").replace(/\.webp$/, "")] : undefined;
  const [mode, setMode] = useState<"time" | "true">(marey ? "time" : "true");
  const spread = !!marey && mode === "time";
  const W = spread ? marey.W : data.width;

  useEffect(() => {
    if (visible || !holderRef.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "300px" });
    io.observe(holderRef.current);
    return () => io.disconnect();
  }, [visible]);

  const FW = data.width;
  useEffect(() => {
    if (!visible || usePoster) return;
    const W = FW;
    let cancelled = false;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d", { willReadFrequently: false })!;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.crossOrigin = "anonymous";
    video.src = data.video;
    const off = document.createElement("canvas");
    off.width = W;
    off.height = H;
    const octx = off.getContext("2d", { willReadFrequently: true })!;
    const seek = (t: number) =>
      new Promise<void>((resolve, reject) => {
        const done = () => { video.removeEventListener("seeked", done); resolve(); };
        video.addEventListener("seeked", done);
        video.addEventListener("error", () => reject(new Error("video")), { once: true });
        video.currentTime = Math.max(0, t + 0.002);
      });
    (async () => {
      try {
        await new Promise<void>((res, rej) => {
          if (video.readyState >= 1) return res();
          video.addEventListener("loadedmetadata", () => res(), { once: true });
          video.addEventListener("error", () => rej(new Error("video")), { once: true });
        });
        await seek(data.baseT);
        if (cancelled) return;
        ctx.filter = "grayscale(0.9) brightness(0.38) contrast(1.08)";
        ctx.drawImage(video, 0, 0, W, H);
        ctx.filter = "none";
        setDrawn(1);
        let i = 0;
        const strobe: PlateData["strobe"] = data.strobe.length || !data.strobeSrc ? data.strobe : await fetch(data.strobeSrc).then((r) => (r.ok ? r.json() : []));
        for (const s of strobe) {
          if (cancelled) return;
          if (!s.rle) continue;
          await seek(s.t);
          if (cancelled) return;
          octx.drawImage(video, 0, 0, W, H);
          const [l, t, r, b] = s.box.map(Math.round) as [number, number, number, number];
          const bw = Math.max(1, Math.min(W, r) - Math.max(0, l)), bh = Math.max(1, Math.min(H, b) - Math.max(0, t));
          const [mh, mw] = s.rle.size;
          const mask = rleDecode(s.rle.counts, mh, mw);
          const img = octx.getImageData(Math.max(0, l), Math.max(0, t), bw, bh);
          for (let y = 0; y < bh; y++)
            for (let x = 0; x < bw; x++) {
              const mx = Math.min(mw - 1, Math.floor((x / bw) * mw)), my = Math.min(mh - 1, Math.floor((y / bh) * mh));
              if (!mask[my * mw + mx]) img.data[(y * bw + x) * 4 + 3] = 0;
            }
          const patch = document.createElement("canvas");
          patch.width = bw;
          patch.height = bh;
          patch.getContext("2d")!.putImageData(img, 0, 0);
          ctx.filter = "brightness(1.12) saturate(1.05)";
          ctx.drawImage(patch, Math.max(0, l), Math.max(0, t));
          ctx.filter = "none";
          setDrawn(2 + i++);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      video.removeAttribute("src");
      video.load();
    };
  }, [visible, usePoster, data, FW, H]);

  const r = Math.max(2.5, W / 260);
  // in the chronophotograph every point moves right by its time: measurements and the law are index-aligned and
  // evenly spaced in time (one per frame), so index i of n sits at time fraction i / (n − 1)
  const shiftAt = (f: number) => (marey ? marey.left + f * marey.span - marey.cx : 0);
  const shift = (pts: { x: number; y: number }[]) => (spread ? pts.map((p, i) => ({ x: p.x + shiftAt(pts.length > 1 ? i / (pts.length - 1) : 0), y: p.y })) : pts);
  const place = { measured: shift(data.measured), law: shift(data.law) };
  const lawTrain = pathOf(place.law.slice(0, data.split + 1));
  const lawUnseen = pathOf(place.law.slice(data.split));
  const wiRaw = showWhatIf !== null && showWhatIf !== undefined ? data.whatIf?.[showWhatIf] : undefined;
  const wi = wiRaw ? { ...wiRaw, px: shift(wiRaw.px) } : undefined;
  const splitPt = place.law[data.split] ?? place.measured[data.split];
  const tag = splitPt && !compact ? emptiestCorner([...place.measured, ...place.law], W, H, spread ? 0.78 : 0.86) : null;
  // the time axis under the chronophotograph: a tick every "nice" step, labelled from the first measured frame
  const ticks = spread && marey
    ? (() => {
        const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 5, 10].find((s) => marey.dur / s <= 7) ?? 10;
        return Array.from({ length: Math.floor(marey.dur / step + 1e-9) + 1 }, (_, k) => k * step).map((t) => ({ t, x: marey.left + (t / marey.dur) * marey.span }));
      })()
    : [];

  return (
    <figure className={`${styles.plate} ${compact ? styles.compact : ""}`} ref={holderRef}>
      {marey && (
        <div className={styles.modes} role="group" aria-label="How the exposures are laid out">
          <button type="button" aria-pressed={spread} onClick={() => setMode("time")}>
            Spread by time
          </button>
          <button type="button" aria-pressed={!spread} onClick={() => setMode("true")}>
            True positions
          </button>
          <span className={styles.modeNote}>
            {spread ? `each exposure moved right by its time, so the up-and-down motion draws its own graph (${marey.dur.toFixed(2)} s, left to right)` : "each exposure where it really was: a motion in place piles into one figure"}
          </span>
        </div>
      )}
      <div className={compact ? styles.box : undefined}>
      <div className={`${styles.frame} ${spread ? styles.spread : ""}`} style={{ aspectRatio: `${W} / ${H}` }}>
        {spread && marey ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key="marey" src={marey.src} alt="" width={W} height={H} className={styles.canvas} loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setMode("true")} />
        ) : usePoster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key="poster" src={data.poster} alt="" width={W} height={H} className={styles.canvas} loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setUsePoster(false)} />
        ) : (
          <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} aria-hidden="true" />
        )}
        {!spread && !usePoster && drawn === 0 && !failed && <div className={styles.loading}>Developing the print…</div>}
        <svg className={styles.overlay} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={data.caption ?? (spread ? "Chronophotograph: each exposure shifted right by its time, with the fitted law" : "Stroboscopic print with the fitted law")}>
          {spread && splitPt && <rect x={splitPt.x} y={0} width={W - splitPt.x} height={H} fill="rgba(143,160,255,0.06)" />}
          {ticks.map((k) => (
            <line key={k.t} x1={k.x} x2={k.x} y1={H - r * 3} y2={H} stroke="#8b929b" strokeWidth={r * 0.3} />
          ))}
          {!spread && data.pivot && <circle cx={data.pivot.x} cy={data.pivot.y} r={r * 1.4} fill="none" stroke="#e9ebe6" strokeWidth={r * 0.5} />}
          {wi && <path d={pathOf(wi.px)} fill="none" stroke="#e9ebe6" strokeWidth={r * 0.7} strokeDasharray={`${r * 2} ${r * 2}`} opacity={0.9} />}
          <path d={lawTrain} fill="none" stroke="var(--law)" strokeWidth={r * 0.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
          <path d={lawUnseen} fill="none" stroke="#8fa0ff" strokeWidth={r * 1.25} strokeLinecap="round" strokeLinejoin="round" />
          {place.measured.map((p, i) =>
            i < data.split ? (
              <circle key={i} cx={p.x} cy={p.y} r={r * 0.62} fill="var(--measured)" />
            ) : (
              <circle key={i} cx={p.x} cy={p.y} r={r * 0.8} fill="none" stroke="var(--measured)" strokeWidth={r * 0.42} />
            ),
          )}
          {splitPt && !compact && spread && <line x1={splitPt.x} y1={0} x2={splitPt.x} y2={H} stroke="#e9ebe6" strokeWidth={r * 0.35} strokeDasharray={`${r * 1.4} ${r * 1.2}`} />}
          {splitPt && !compact && !spread && <line x1={splitPt.x} y1={splitPt.y - r * 9} x2={splitPt.x} y2={splitPt.y + r * 9} stroke="#e9ebe6" strokeWidth={r * 0.35} strokeDasharray={`${r} ${r}`} />}
          {/* a 1-pixel leader from the split to its tag, which sits in the quarter the motion leaves emptiest */}
          {splitPt && tag && <line x1={splitPt.x} y1={splitPt.y} x2={tag.x} y2={tag.y} stroke="#e9ebe6" strokeWidth={1} vectorEffect="non-scaling-stroke" opacity={0.7} />}
        </svg>
        {ticks.map((k) => (
          <span key={k.t} className={styles.tick} style={{ left: `${(k.x / W) * 100}%` }} aria-hidden="true">
            {k.t === 0 ? "0 s" : `${+k.t.toFixed(2)}`}
          </span>
        ))}
        {splitPt && tag && (
          <div className={styles.splitTag} style={{ left: `${(tag.x / W) * 100}%`, top: `${(tag.y / H) * 100}%` }}>
            <span className={styles.fitted}>fitted</span>
            <span className={styles.predicted}>predicted, never seen</span>
          </div>
        )}
        {failed && <div className={styles.loading}>The clip didn’t load here, so the print shows the measured path only.</div>}
      </div>
      </div>
      {data.caption && <figcaption className={styles.caption}>{data.caption}</figcaption>}
    </figure>
  );
}

/**
 * Where the fitted|predicted tag goes: the quarter of the plate with the fewest measured points and law points in it,
 * near that quarter's outer edge, so the tag never sits on the data. Ties go to the top, then the right.
 */
function emptiestCorner(pts: { x: number; y: number }[], W: number, H: number, low: number) {
  const quarters = [
    { right: true, bottom: false },
    { right: false, bottom: false },
    { right: true, bottom: true },
    { right: false, bottom: true },
  ].map((c) => ({ ...c, n: pts.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= W / 2 === c.right && p.y >= H / 2 === c.bottom).length }));
  const best = quarters.reduce((a, b) => (b.n < a.n ? b : a));
  return { x: best.right ? W * 0.74 : W * 0.26, y: best.bottom ? H * low : H * 0.12 };
}

function pathOf(pts: { x: number; y: number }[]) {
  let d = "";
  for (const p of pts) if (Number.isFinite(p.x) && Number.isFinite(p.y)) d += `${d ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  return d;
}

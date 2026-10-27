"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { rleDecode } from "@/lib/rle";
import styles from "./StrobePlate.module.css";

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
  const { width: W, height: H } = data;

  useEffect(() => {
    if (visible || !holderRef.current) return;
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && setVisible(true), { rootMargin: "300px" });
    io.observe(holderRef.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || usePoster) return;
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
  }, [visible, usePoster, data, W, H]);

  const r = Math.max(2.5, W / 260);
  const lawTrain = useMemo(() => pathOf(data.law.slice(0, data.split + 1)), [data]);
  const lawUnseen = useMemo(() => pathOf(data.law.slice(data.split)), [data]);
  const wi = showWhatIf !== null && showWhatIf !== undefined ? data.whatIf?.[showWhatIf] : undefined;
  const splitPt = data.law[data.split] ?? data.measured[data.split];

  return (
    <figure className={`${styles.plate} ${compact ? styles.compact : ""}`} ref={holderRef}>
      <div className={compact ? styles.box : undefined}>
      <div className={styles.frame} style={{ aspectRatio: `${W} / ${H}` }}>
        {usePoster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.poster} alt="" width={W} height={H} className={styles.canvas} loading={priority ? "eager" : "lazy"} decoding="async" onError={() => setUsePoster(false)} />
        ) : (
          <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} aria-hidden="true" />
        )}
        {!usePoster && drawn === 0 && !failed && <div className={styles.loading}>Developing the print…</div>}
        <svg className={styles.overlay} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={data.caption ?? "Stroboscopic print with the fitted law"}>
          {data.pivot && <circle cx={data.pivot.x} cy={data.pivot.y} r={r * 1.4} fill="none" stroke="#e9ebe6" strokeWidth={r * 0.5} />}
          {wi && <path d={pathOf(wi.px)} fill="none" stroke="#e9ebe6" strokeWidth={r * 0.7} strokeDasharray={`${r * 2} ${r * 2}`} opacity={0.9} />}
          <path d={lawTrain} fill="none" stroke="var(--law)" strokeWidth={r * 0.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.95} />
          <path d={lawUnseen} fill="none" stroke="#8fa0ff" strokeWidth={r * 1.25} strokeLinecap="round" strokeLinejoin="round" />
          {data.measured.map((p, i) =>
            i < data.split ? (
              <circle key={i} cx={p.x} cy={p.y} r={r * 0.62} fill="var(--measured)" />
            ) : (
              <circle key={i} cx={p.x} cy={p.y} r={r * 0.8} fill="none" stroke="var(--measured)" strokeWidth={r * 0.42} />
            ),
          )}
          {splitPt && !compact && (
            <g>
              <line x1={splitPt.x} y1={splitPt.y - r * 9} x2={splitPt.x} y2={splitPt.y + r * 9} stroke="#e9ebe6" strokeWidth={r * 0.35} strokeDasharray={`${r} ${r}`} />
            </g>
          )}
        </svg>
        {splitPt && !compact && (
          <div className={styles.splitTag} style={{ left: `${Math.min(76, Math.max(24, (splitPt.x / W) * 100))}%`, top: `${Math.max(14, (splitPt.y / H) * 100)}%` }}>
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

function pathOf(pts: { x: number; y: number }[]) {
  let d = "";
  for (const p of pts) if (Number.isFinite(p.x) && Number.isFinite(p.y)) d += `${d ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  return d;
}

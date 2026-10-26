"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ClipPlayer.module.css";

export type ClipData = {
  video: string;
  width: number;
  height: number;
  /** each measured sample: video time (s) and position (px) */
  samples: { vt: number; x: number; y: number }[];
  /** the law's position at each sample */
  law: { x: number; y: number }[];
  split: number;
};

/** The clip itself, with SAM's measurement and the law's prediction drawn on every frame as it plays. */
export default function ClipPlayer({ data }: { data: ClipData }) {
  const vRef = useRef<HTMLVideoElement>(null);
  const [i, setI] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const { width: W, height: H, samples, law, split } = data;
  const r = Math.max(3, W / 160);

  useEffect(() => {
    const v = vRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      const t = v.currentTime;
      // the last sample at or before the playhead
      let lo = -1;
      for (let k = 0; k < samples.length; k++) if (samples[k].vt <= t + 1e-3) lo = k;
      setI(lo);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [samples]);

  const toggle = () => {
    const v = vRef.current;
    if (!v) return;
    if (v.paused) {
      if (samples.length && (v.currentTime < samples[0].vt - 0.5 || v.currentTime >= samples[samples.length - 1].vt)) v.currentTime = Math.max(0, samples[0].vt - 0.3);
      v.play();
    } else v.pause();
  };

  const cur = i >= 0 ? samples[i] : null;
  const pred = i >= 0 ? law[i] : null;
  const unseen = i >= split;
  const trail = samples.slice(Math.max(0, i - 400), i + 1);
  return (
    <div className={styles.player}>
      <div className={styles.frame} style={{ aspectRatio: `${W} / ${H}` }}>
        <video
          ref={vRef}
          src={data.video}
          className={styles.video}
          muted
          playsInline
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />
        <svg className={styles.overlay} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <path d={law.slice(0, Math.max(0, i + 1)).map((p, k) => `${k ? "L" : "M"}${p.x} ${p.y}`).join("")} fill="none" stroke="#8fa0ff" strokeWidth={r * 0.5} opacity="0.8" />
          {trail.map((p, k) => (
            <circle key={k} cx={p.x} cy={p.y} r={r * 0.35} fill="#ff5a1f" opacity={0.55} />
          ))}
          {cur && <circle cx={cur.x} cy={cur.y} r={r} fill="none" stroke="#ff5a1f" strokeWidth={r * 0.45} />}
          {pred && <circle cx={pred.x} cy={pred.y} r={r * 0.55} fill="#8fa0ff" />}
        </svg>
        {cur && (
          <span className={`${styles.badge} ${unseen ? styles.unseenBadge : ""}`}>
            {unseen ? "unseen frames: the blue dot is the law’s prediction" : "fitting frames"}
          </span>
        )}
      </div>
      <div className={styles.bar}>
        <button type="button" className={styles.play} onClick={toggle} aria-label={playing ? "Pause" : "Play"}>
          {playing ? "Pause" : "Play the clip"}
        </button>
        <span className="key">
          <i className="m" /> SAM 3.1, this frame
        </span>
        <span className="key">
          <i className="l" /> the law
        </span>
        <span className={`small num ${styles.time}`}>{cur ? `${(cur.vt - samples[0].vt).toFixed(2)} s` : ""}</span>
      </div>
    </div>
  );
}

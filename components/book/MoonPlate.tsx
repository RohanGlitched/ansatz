"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./MoonPlate.module.css";

type Clip = { width: number; height: number; frames: number; fps: number; helmetTop: (number | null)[] };
type Traces = { broadcast: Clip; slowed: Clip };

/**
 * Plate: the Apollo 16 broadcast (A) and the same clip slowed 1.5× in secret (B), printed as cyanotypes and played
 * together on one clock. Under each, the astronaut's helmet height as SAM 3.1 measured it in every frame draws
 * itself at the clip's own speed, so B's jumps come out wider. When B ends, the measured slowdown is set.
 */
export default function MoonPlate({ ratio, sigma, truth, sparkWrong, sparkN, g }: { ratio: number; sigma: number; truth: number; sparkWrong: number; sparkN: number; g?: { v: number; s: number; ref: number } }) {
  const [tr, setTr] = useState<Traces | null>(null);
  const [t, setT] = useState(0);
  const [done, setDone] = useState(false);
  const a = useRef<HTMLVideoElement>(null);
  const b = useRef<HTMLVideoElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    fetch("/book/moon-traces.json").then((r) => r.json()).then(setTr).catch(() => {});
  }, []);

  const play = () => {
    const va = a.current, vb = b.current;
    if (!va || !vb) return;
    setDone(false);
    va.currentTime = 0;
    vb.currentTime = 0;
    void va.play().catch(() => {});
    void vb.play().catch(() => {});
  };

  // start once, when the plate comes into view (unless the reader prefers no motion: then show the finished state)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setT(99);
      setDone(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((x) => x.isIntersecting) && !started.current) {
          started.current = true;
          play();
        }
      },
      { threshold: 0.45 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // the shared clock is B's (the longer clip)
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const vb = b.current;
      if (vb && !vb.paused) setT(vb.currentTime);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const TMAX = 12.4;
  const durA = tr ? tr.broadcast.frames / tr.broadcast.fps : 8;
  const durB = tr ? tr.slowed.frames / tr.slowed.fps : 12;

  const trace = (c: Clip | undefined, upto: number) => {
    if (!c) return "";
    const vals = c.helmetTop.filter((v): v is number => v !== null);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const pts: string[] = [];
    c.helmetTop.forEach((v, f) => {
      const tt = f / c.fps;
      if (v === null || tt > upto) return;
      pts.push(`${((tt / TMAX) * 1000).toFixed(1)},${(8 + ((v - lo) / Math.max(1, hi - lo)) * 104).toFixed(1)}`);
    });
    return pts.join(" ");
  };

  const ticks = [0, 2, 4, 6, 8, 10, 12];
  const panes = [
    { key: "A", title: "Apollo 16, 1972, as broadcast", src: "/showcase/moon-jump.mp4", ref: a, clip: tr?.broadcast, dur: durA },
    { key: "B", title: "the same clip, slowed 1.5× in secret", src: "/showcase/moon-jump-slowed.mp4", ref: b, clip: tr?.slowed, dur: durB },
  ];

  return (
    <div ref={box} className={styles.wrap}>
      <div className={styles.panes}>
        {panes.map((p) => (
          <div key={p.key} className={styles.pane}>
            <p className={styles.label}>
              <b>{p.key}</b> {p.title}
            </p>
            <div className={styles.film}>
              <video
                ref={p.ref}
                src={p.src}
                muted
                playsInline
                preload="auto"
                className={styles.video}
                onEnded={p.key === "B" ? () => setDone(true) : undefined}
              />
              <span className={styles.clock}>{Math.min(t, p.dur).toFixed(1)} s</span>
            </div>
            <svg viewBox="0 0 1000 150" className={styles.trace} aria-label={`Helmet height in every frame of clip ${p.key}, as SAM 3.1 measured it`}>
              <line x1="0" x2="1000" y1="124" y2="124" className={styles.axis} />
              {ticks.map((s) => (
                <text key={s} x={(s / TMAX) * 1000} y="146" className={styles.tick} textAnchor={s === 0 ? "start" : "middle"}>
                  {s} s
                </text>
              ))}
              <polyline points={trace(p.clip, t)} className={styles.line} />
              {done && <line x1={(p.dur / TMAX) * 1000} x2={(p.dur / TMAX) * 1000} y1="0" y2="124" className={styles.end} />}
            </svg>
          </div>
        ))}
      </div>

      <div className={styles.verdicts}>
        <div>
          <p className={styles.vh}>Muse Spark, shown B alone and asked {sparkN === 5 ? "five" : sparkN} times whether it plays at real speed</p>
          <p className={styles.spark}>
            <span className={styles.quote}>“real speed”</span> {sparkWrong} of {sparkN}
          </p>
        </div>
        <div className={done ? styles.on : styles.off}>
          <p className={styles.vh}>SAM 3.1 measured the astronaut in every frame of both; code compared them jump for jump</p>
          <p className={styles.measured}>
            B runs {ratio.toFixed(3)} <small>± {sigma.toFixed(3)}</small>× slower <span className={styles.truth}>truth {truth}×</span>
          </p>
        </div>
      </div>

      <div className={styles.foot}>
        <button type="button" className="btn ghost" onClick={play}>
          Play both clips again
        </button>
        {g && (
          <p className={styles.g}>
            From A alone, with John Young&rsquo;s height as the ruler: the Moon&rsquo;s gravity is {g.v.toFixed(2)} ± {g.s.toFixed(2)} m/s² (known: {g.ref}).
          </p>
        )}
      </div>
    </div>
  );
}

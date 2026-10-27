"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Plays a scan: everything inside waits (CSS animations paused) until its clips can play, then the clips and the
 * strips start together, so a strip draws at its clip's own playback speed. "Play again" remounts the children,
 * which restarts every animation and clip. With reduced motion, the finished picture shows and nothing plays.
 */
export default function ReplayScope({ children, className, buttonClassName, label = "Play again" }: { children: React.ReactNode; className?: string; buttonClassName?: string; label?: string }) {
  const [run, setRun] = useState(0);
  const [playing, setPlaying] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const videos = [...root.querySelectorAll("video")];
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      videos.forEach((v) => v.pause());
      setPlaying(true);
      return;
    }
    setPlaying(false);
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      videos.forEach((v) => {
        v.currentTime = 0;
        v.play().catch(() => {});
      });
      setPlaying(true);
    };
    // start when every clip can play through, or after a short wait so a slow network doesn't hold the page still
    let ready = 0;
    const onReady = () => {
      ready += 1;
      if (ready >= videos.length) start();
    };
    videos.forEach((v) => (v.readyState >= 3 ? onReady() : v.addEventListener("canplaythrough", onReady, { once: true })));
    if (!videos.length) start();
    const t = setTimeout(start, 2500);
    return () => {
      clearTimeout(t);
      videos.forEach((v) => v.removeEventListener("canplaythrough", onReady));
    };
  }, [run]);

  return (
    <div ref={ref} className={className} data-playing={playing ? "" : undefined}>
      <div key={run}>{children}</div>
      <button type="button" className={buttonClassName} onClick={() => { setPlaying(false); setRun((n) => n + 1); }}>
        {label}
      </button>
    </div>
  );
}

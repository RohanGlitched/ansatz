"use client";

import { useEffect, useRef } from "react";

/**
 * Real footage in its original colour (no cyanotype filter): the clips loop, muted, as the page opens. A reader who
 * prefers reduced motion gets the first frame and the controls instead.
 */
export default function Footage({ clips, className, clipClassName, labelClassName }: { clips: { src: string; label: string }[]; className?: string; clipClassName?: string; labelClassName?: string }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    box.current?.querySelectorAll("video").forEach((v) => {
      v.pause();
      v.controls = true;
    });
  }, []);
  return (
    <div ref={box} className={className}>
      {clips.map((c) => (
        <div key={c.src} className={clipClassName}>
          <video src={c.src} autoPlay muted loop playsInline preload="auto" aria-label={c.label} />
          <span className={labelClassName}>{c.label}</span>
        </div>
      ))}
    </div>
  );
}

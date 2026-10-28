"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A measured number that counts up to its value once, the first time it is seen. The server renders the final value
 * (so the page reads right without script, and to machines); readers who prefer reduced motion only ever see it.
 */
export default function CountUp({ to, decimals = 0, prefix = "", suffix = "", ms = 1100 }: { to: number; decimals?: number; prefix?: string; suffix?: string; ms?: number }) {
  const [v, setV] = useState(to);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !Number.isFinite(to)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let done = false;
    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / ms);
        const e = 1 - Math.pow(1 - k, 3);
        setV(to * e);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      (es) => {
        if (!done && es.some((x) => x.isIntersecting)) {
          done = true;
          io.disconnect();
          run();
        }
      },
      { threshold: 0.6 },
    );
    // start from zero only if the number is not on screen yet, so nothing visible jumps backwards
    const r = el.getBoundingClientRect();
    if (r.top > window.innerHeight || r.bottom < 0) setV(0);
    else done = true;
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to, ms]);

  return (
    <span ref={ref}>
      <span className="visually-hidden">
        {prefix}
        {to.toFixed(decimals)}
        {suffix}
      </span>
      <span aria-hidden="true">
        {prefix}
        {v.toFixed(decimals)}
        {suffix}
      </span>
    </span>
  );
}

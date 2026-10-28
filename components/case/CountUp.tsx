"use client";

import { useEffect, useRef, useState } from "react";
import { useApproach } from "@/components/book/approach";

/**
 * A measured number that counts up to its value once, when it is first seen. The server renders the final value, and
 * the number is set back to zero only as it comes within reach below the screen (components/book/approach.ts), so the
 * page reads right without script, to machines, in print, and for readers who prefer reduced motion.
 */
export default function CountUp({ to, decimals = 0, prefix = "", suffix = "", ms = 1100 }: { to: number; decimals?: number; prefix?: string; suffix?: string; ms?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const stage = useApproach(ref, { threshold: 0.6 });
  const [v, setV] = useState(to);

  useEffect(() => {
    if (!Number.isFinite(to) || stage === "done") {
      setV(to);
      return;
    }
    if (stage === "armed") {
      setV(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      setV(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, to, ms]);

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

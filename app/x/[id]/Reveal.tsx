"use client";

import { useEffect, useRef, useState } from "react";
import { useApproach } from "@/components/book/approach";

/**
 * Marks a block for its one deliberate moment (a refuted law's strike drawn across, attempts written in order). The
 * server renders the finished state; the block is set back to its start only as it comes within reach below the
 * screen (components/book/approach.ts), so a reader who never scrolls to it, a printout, a reader without scripts or
 * one who prefers reduced motion always sees the result.
 */
export function Reveal({ children, className, as: Tag = "div", id }: { children: React.ReactNode; className?: string; as?: "div" | "ol"; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const stage = useApproach(ref, { threshold: 0.2 });
  return (
    <Tag ref={ref as React.Ref<HTMLDivElement & HTMLOListElement>} id={id} className={className} data-armed={stage === "armed" ? "" : undefined} data-shown={stage === "shown" ? "" : undefined}>
      {children}
    </Tag>
  );
}

/**
 * A reading that counts up to its value once, when it is first seen. The text is the finished value on the server, for
 * screen readers and whenever the reading is not being watched; only the first number in it moves, at its own number
 * of decimals.
 */
export function CountUp({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const stage = useApproach(ref, { threshold: 0.6 });
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const m = /(\d+(?:\.\d+)?)/.exec(text);
    if (!m || stage === "done") {
      setShown(text);
      return;
    }
    const target = Number(m[1]);
    const dec = m[1].includes(".") ? m[1].split(".")[1].length : 0;
    const put = (v: number) => setShown(text.slice(0, m.index) + v.toFixed(dec) + text.slice(m.index + m[1].length));
    if (stage === "armed") {
      put(0);
      return;
    }
    let raf = 0;
    const t0 = performance.now(), dur = 900;
    const tick = (now: number) => {
      const u = Math.min(1, (now - t0) / dur);
      put(target * (1 - Math.pow(1 - u, 3)));
      if (u < 1) raf = requestAnimationFrame(tick);
      else setShown(text);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [stage, text]);
  return (
    <>
      <span ref={ref} aria-hidden="true">
        {shown}
      </span>
      <span className="visually-hidden">{text}</span>
    </>
  );
}

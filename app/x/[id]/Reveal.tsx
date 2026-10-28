"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Marks a block once it comes into view, so its CSS can play one deliberate moment (a refuted law's strike drawn
 * across, attempts written in order). The server renders the finished state; the block is only "armed" (set back to
 * its start) on the client when motion is allowed and the block is still below the fold, so a reader without
 * scripts, or who prefers reduced motion, always sees the result.
 */
export function Reveal({ children, className, as: Tag = "div", id }: { children: React.ReactNode; className?: string; as?: "div" | "ol"; id?: string }) {
  const ref = useRef<HTMLElement>(null);
  const [state, setState] = useState<"done" | "armed" | "shown">("done");
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.85) return;
    setState("armed");
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((x) => x.isIntersecting)) {
          // one frame armed, then shown, so the transition runs
          requestAnimationFrame(() => setState("shown"));
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref as React.Ref<HTMLDivElement & HTMLOListElement>} id={id} className={className} data-armed={state === "armed" ? "" : undefined} data-shown={state === "shown" ? "" : undefined}>
      {children}
    </Tag>
  );
}

/**
 * A reading that counts up to its value once, the first time it is seen. The text is the finished value on the server
 * and for screen readers; only the first number in it moves, at its own number of decimals.
 */
export function CountUp({ text }: { text: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(text);
  useEffect(() => {
    const el = ref.current;
    const m = /(\d+(?:\.\d+)?)/.exec(text);
    if (!el || !m || window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
    const target = Number(m[1]);
    const dec = m[1].includes(".") ? m[1].split(".")[1].length : 0;
    const put = (v: number) => setShown(text.slice(0, m.index) + v.toFixed(dec) + text.slice(m.index + m[1].length));
    put(0);
    let raf = 0;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((x) => x.isIntersecting)) return;
        io.disconnect();
        const t0 = performance.now(), dur = 900;
        const tick = (now: number) => {
          const u = Math.min(1, (now - t0) / dur);
          put(target * (1 - Math.pow(1 - u, 3)));
          if (u < 1) raf = requestAnimationFrame(tick);
          else setShown(text);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      setShown(text);
    };
  }, [text]);
  return (
    <>
      <span ref={ref} aria-hidden="true">
        {shown}
      </span>
      <span className="visually-hidden">{text}</span>
    </>
  );
}

"use client";
import { useEffect, useRef } from "react";

/**
 * Lights a pipeline's nodes in order the first time it is half in view, the way a run passes through them: each
 * `[data-node]` child gets `data-on` in turn, then the band gets `data-done`. Without script or with reduced motion
 * the CSS shows every node lit.
 */
export default function PipelineLight({ children, className, step = 320 }: { children: React.ReactNode; className?: string; step?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      root.dataset.done = "";
      return;
    }
    root.dataset.armed = "";
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-node]")];
    const timers: number[] = [];
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((x) => x.isIntersecting)) return;
        io.disconnect();
        nodes.forEach((n, i) => timers.push(window.setTimeout(() => n.setAttribute("data-on", ""), 150 + i * step)));
        timers.push(window.setTimeout(() => (root.dataset.done = ""), 150 + nodes.length * step + 400));
      },
      { threshold: 0.5 },
    );
    io.observe(root);
    return () => {
      io.disconnect();
      timers.forEach(clearTimeout);
    };
  }, [step]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

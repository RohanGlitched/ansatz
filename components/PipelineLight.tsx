"use client";
import { useEffect, useRef } from "react";
import { useApproach } from "@/components/book/approach";

/**
 * Lights a pipeline's nodes in order when it is first seen, the way a run passes through them: each `[data-node]`
 * child gets `data-on` in turn, then the band gets `data-done`. The band is set back to unlit only as it comes within
 * reach below the screen (components/book/approach.ts); otherwise, without script, in print or with reduced motion,
 * every node shows lit.
 */
export default function PipelineLight({ children, className, step = 320 }: { children: React.ReactNode; className?: string; step?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const stage = useApproach(ref, { threshold: 0.5 });
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const nodes = [...root.querySelectorAll<HTMLElement>("[data-node]")];
    if (stage === "done") {
      delete root.dataset.armed;
      root.dataset.done = "";
      return;
    }
    root.dataset.armed = "";
    delete root.dataset.done;
    if (stage === "armed") {
      nodes.forEach((n) => n.removeAttribute("data-on"));
      return;
    }
    const timers = nodes.map((n, i) => window.setTimeout(() => n.setAttribute("data-on", ""), 150 + i * step));
    timers.push(window.setTimeout(() => (root.dataset.done = ""), 150 + nodes.length * step + 400));
    return () => timers.forEach(clearTimeout);
  }, [stage, step]);
  return (
    <div ref={ref} className={className} data-done="">
      {children}
    </div>
  );
}

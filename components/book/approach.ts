"use client";

import { useEffect, useState } from "react";

export type Stage = "done" | "armed" | "shown";

/**
 * Runs `cb` once the reader has scrolled (at once if the page is already scrolled). Nothing below the fold is armed
 * before that, so a capture, a printout or a crawler, none of which scroll, always meets the finished page.
 */
export function afterScroll(cb: () => void): () => void {
  if (window.scrollY > 0) {
    cb();
    return () => {};
  }
  const on = () => {
    window.removeEventListener("scroll", on);
    cb();
  };
  window.addEventListener("scroll", on, { passive: true });
  return () => window.removeEventListener("scroll", on);
}

/**
 * One deliberate moment per element, without ever showing a page that reads wrong. The server renders the finished
 * state ("done"). An element is only set back to its start ("armed") as it comes within reach below the screen, then
 * plays ("shown") when it is in view. So a reader who never scrolls to it, a printout, a full-page capture, a reader
 * without script or one who prefers less motion all see the finished state. `onScreen: "play"` also plays an element
 * that is already in view when the page loads (the page's opening moment); otherwise it is left finished.
 */
export function useApproach(ref: React.RefObject<Element | null>, opts: { threshold?: number; onScreen?: "play" | "leave"; key?: unknown } = {}): Stage {
  const [stage, setStage] = useState<Stage>("done");
  const { threshold = 0.25, onScreen = "leave", key } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!el || !("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let show: IntersectionObserver | null = null;
    const arm = () => {
      setStage("armed");
      show = new IntersectionObserver(
        (es) => {
          if (!es.some((x) => x.isIntersecting)) return;
          show?.disconnect();
          // one frame armed, then shown, so transitions run from the start
          requestAnimationFrame(() => requestAnimationFrame(() => setStage("shown")));
        },
        { threshold },
      );
      show.observe(el);
    };
    const r = el.getBoundingClientRect();
    const visible = r.top < window.innerHeight && r.bottom > 0;
    let near: IntersectionObserver | null = null;
    let unscroll = () => {};
    if (visible) {
      if (onScreen === "play") arm();
    } else unscroll = afterScroll(() => {
      near = new IntersectionObserver(
        (es) => {
          const e = es.find((x) => x.isIntersecting);
          if (!e) return;
          near?.disconnect();
          // armed only while still below the screen, so nothing visible jumps backwards
          if (e.boundingClientRect.top >= window.innerHeight - 2) arm();
        },
        { rootMargin: "0px 0px 45% 0px" },
      );
      near.observe(el);
    });
    const print = () => setStage("done");
    window.addEventListener("beforeprint", print);
    return () => {
      unscroll();
      near?.disconnect();
      show?.disconnect();
      window.removeEventListener("beforeprint", print);
    };
  }, [ref, threshold, onScreen, key]);
  return stage;
}

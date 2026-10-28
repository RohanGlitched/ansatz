"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Plates develop like cyanotypes: a sheet starts as the pale yellow-green of unexposed iron salts and exposes to
 * Prussian blue the first time it comes into view. Pages without JavaScript, and readers who prefer less motion,
 * see the developed plate at once (the pale state only applies under html.js and is skipped for reduced motion).
 */
export default function Develop() {
  const path = usePathname();
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-develop]:not([data-developed])")];
    if (!els.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      els.forEach((e) => (e.dataset.developed = "1"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          (en.target as HTMLElement).dataset.developed = "1";
          io.unobserve(en.target);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [path]);
  return null;
}

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { afterScroll } from "./approach";

/** Set on the plates in view before the first paint (by the layout's inline script), so the page opens developing. */
export const PREARM = `(function(){if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;var h=innerHeight;document.querySelectorAll('[data-develop]').forEach(function(e){var r=e.getBoundingClientRect();if(r.top<h&&r.bottom>0)e.setAttribute('data-armed','')})})()`;

/**
 * Plates develop like cyanotypes: an armed sheet is the pale yellow-green of unexposed iron salts and exposes to
 * Prussian blue when it comes into view. A plate is armed only before the first paint (if it is on screen then) or,
 * once the reader scrolls, as it comes within reach below the screen; so a plate nobody scrolls to, a printout, a
 * full-page capture, a reader without script and a reader who prefers less motion all see it developed.
 */
export default function Develop() {
  const path = usePathname();
  useEffect(() => {
    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const plates = [...document.querySelectorAll<HTMLElement>("[data-develop]:not([data-developed])")];
    const show = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.developed = "1";
          show.unobserve(e.target);
        }
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );
    const near = new IntersectionObserver(
      (es) => {
        for (const e of es) {
          if (!e.isIntersecting) continue;
          near.unobserve(e.target);
          // armed only while still below the screen, so nothing visible turns pale
          if (e.boundingClientRect.top >= window.innerHeight - 2) {
            (e.target as HTMLElement).dataset.armed = "";
            show.observe(e.target);
          }
        }
      },
      { rootMargin: "0px 0px 45% 0px" },
    );
    const below: HTMLElement[] = [];
    for (const p of plates) {
      if (p.dataset.armed !== undefined) show.observe(p);
      else {
        const r = p.getBoundingClientRect();
        // a plate already on screen after a client-side navigation develops in place
        if (r.top < window.innerHeight && r.bottom > 0) {
          p.dataset.armed = "";
          show.observe(p);
        } else below.push(p);
      }
    }
    // plates below the fold wait for the reader to scroll
    const unscroll = afterScroll(() => below.forEach((p) => near.observe(p)));
    const print = () => plates.forEach((p) => (p.dataset.developed = "1"));
    window.addEventListener("beforeprint", print);
    return () => {
      unscroll();
      show.disconnect();
      near.disconnect();
      window.removeEventListener("beforeprint", print);
    };
  }, [path]);
  return null;
}

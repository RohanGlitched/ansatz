"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import styles from "./Rail.module.css";

type Stop = { id: string; label: string; kind: "section" | "plate" };

/**
 * Finding your way through a page, the way Ansatz reads a clip: every section and plate is a point on a track down
 * the margin. The ones you have read are measured (solid orange), the ones ahead are the future (hollow), and
 * where you are now is the white ring, the same ring that marks a law's prediction. On phones it folds into a
 * "Contents" sheet. A back-to-the-top button draws a throw going up. The dock shows only while the reader scrolls
 * back up, and never over the footer, so it never sits on text being read.
 */
export default function Rail() {
  const path = usePathname();
  const [stops, setStops] = useState<Stop[]>([]);
  const [at, setAt] = useState(-1);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  // the dock is for going back: it shows while scrolling up, and hides over the footer
  const [goingUp, setGoingUp] = useState(false);
  const [atFoot, setAtFoot] = useState(false);
  // on a phone the dock sits where the thumb drags a plate's handle or taps an answer: it stays away while a handle,
  // the blind test or any fieldset is near the bottom
  const [nearHandle, setNearHandle] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y < last - 6) setGoingUp(true);
      else if (y > last + 6) setGoingUp(false);
      last = y;
      if (window.innerWidth < 760) {
        const h = window.innerHeight;
        const handle = [...document.querySelectorAll<HTMLElement>("input[type=range]")].some((el) => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.bottom > h - 170 && r.top < h;
        });
        // and over the blind test, or any set of choices, where the dock would sit on an answer button
        const choices = [...document.querySelectorAll<HTMLElement>("#can-you-tell, fieldset")].some((el) => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.bottom > h - 170 && r.top < h;
        });
        const near = handle || choices;
        setNearHandle(near);
      } else setNearHandle(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const foot = document.querySelector("body > footer");
    const io = foot ? new IntersectionObserver((es) => setAtFoot(es.some((x) => x.isIntersecting)), { threshold: 0 }) : null;
    if (foot && io) io.observe(foot);
    return () => {
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
    };
  }, [path]);

  // collect the page's sections (h2) and plates (figures with a caption); give each an id to jump to
  useEffect(() => {
    setOpen(false);
    const collect = () => {
      const main = document.getElementById("main");
      if (!main) return;
      const found: Stop[] = [];
      let n = 0;
      main.querySelectorAll<HTMLElement>("h2, figure[data-develop]").forEach((el) => {
        let label = "";
        let kind: Stop["kind"] = "section";
        if (el.tagName === "FIGURE") {
          const cap = el.querySelector("figcaption");
          label = (cap?.textContent ?? "").replace(/\s+/g, " ").trim();
          kind = "plate";
          const m = /^(Plate [IVXLC]+\.)\s*(.*)$/.exec(label);
          label = m ? `${m[1]} ${m[2].split(/(?<=\.)\s/)[0]}` : label;
        } else label = (el.textContent ?? "").replace(/\s+/g, " ").replace(/^§\s*\d+\s*/, "").trim();
        if (!label) return;
        if (label.length > 64) label = label.slice(0, 62).trimEnd() + "…";
        if (!el.id) el.id = `at-${kind}-${++n}`;
        found.push({ id: el.id, label, kind });
      });
      setStops(found.length >= 3 ? found : []);
    };
    collect();
    // pages that load parts of themselves after the first paint
    const t = setTimeout(collect, 1500);
    return () => clearTimeout(t);
  }, [path]);

  // a #fragment that points inside a closed fold opens the fold and goes there
  useEffect(() => {
    const openTo = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      const el = id ? document.getElementById(id) : null;
      if (!el) return;
      let d = el.closest("details");
      let opened = false;
      while (d) {
        if (!d.open) {
          d.open = true;
          opened = true;
        }
        d = d.parentElement?.closest("details") ?? null;
      }
      if (opened) el.scrollIntoView({ block: "start" });
    };
    openTo();
    window.addEventListener("hashchange", openTo);
    return () => window.removeEventListener("hashchange", openTo);
  }, [path]);

  // which stop the reader is at: the last one whose top has passed a line a third of the way down the screen
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > window.innerHeight * 0.9);
      const line = window.innerHeight * 0.34;
      let k = -1;
      stops.forEach((s, i) => {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) k = i;
      });
      setAt(k);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [stops]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    setOpen(false);
  };
  const top = () => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

  return (
    <>
      {stops.length > 0 && (
        <nav className={styles.rail} aria-label="On this page">
          <ol>
            {stops.map((s, i) => (
              <li key={s.id} className={`${i < at ? styles.past : i === at ? styles.now : styles.future} ${s.kind === "plate" ? styles.plate : ""}`}>
                <a href={`#${s.id}`} onClick={(e) => (e.preventDefault(), go(s.id))} aria-current={i === at ? "location" : undefined}>
                  <span className={styles.mark} aria-hidden="true" />
                  <span className={styles.label}>{s.label}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className={`${styles.dock} ${(scrolled && goingUp && !atFoot && !nearHandle) || open ? styles.show : ""}`}>
        {stops.length > 0 && (
          <button type="button" className={styles.contents} aria-expanded={open} aria-controls="page-contents" onClick={() => setOpen((o) => !o)}>
            Contents
          </button>
        )}
        <button type="button" className={styles.top} onClick={top} aria-label="Back to the top of the page">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M5 27 Q16 -4 27 27" className={styles.arc} />
            <circle cx="16" cy="11.5" r="3" className={styles.ball} />
          </svg>
          <span>Top</span>
        </button>
      </div>

      {open && (
        <div id="page-contents" className={styles.sheet} role="dialog" aria-label="On this page">
          <ol>
            {stops.map((s, i) => (
              <li key={s.id} className={i < at ? styles.past : i === at ? styles.now : styles.future}>
                <a href={`#${s.id}`} onClick={(e) => (e.preventDefault(), go(s.id))}>
                  <span className={styles.mark} aria-hidden="true" />
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

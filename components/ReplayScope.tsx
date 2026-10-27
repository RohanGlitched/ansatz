"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Plays a scan, locked to the footage. Inside the scope:
 * - `[data-track]` elements are strips that develop over `data-dur` seconds; the scope writes their progress to `--p`
 *   (0 to 1). A track with `data-clip` follows the `<video data-clip>` of the same name while that clip is on screen,
 *   so the strip and the playing clip never drift apart; otherwise it follows the scope's clock.
 * - `[data-at]` marks (a fraction of their track) and `[data-t]` marks (seconds on the scope's clock) get `data-on`
 *   as the scan reaches them; CSS decides what that looks like.
 * - `data-hold="0.7,1.4"` on a track holds the clock for 1.4 s when that track reaches 0.7.
 * The scope's clock is `--t` (seconds). It is the playing clips' own time while any is on screen and playing, so a
 * stall stops the scan too; when none is, it runs on the wall clock.
 *
 * The scope sets `data-state` to idle, run or done. Before this runs (or without JS, or with reduced motion), the
 * CSS shows the finished print. A scan starts once the first strip is 40% in view, its images have decoded and its
 * on-screen clips can play (or after a short wait), so a strip below the fold develops when it is seen.
 */
export default function ReplayScope({ children, className, buttonClassName, label = "Play again" }: { children: React.ReactNode; className?: string; buttonClassName?: string; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const replay = useRef<() => void>(() => {});
  const [canReplay, setCanReplay] = useState(false);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    const videos = [...root.querySelectorAll<HTMLVideoElement>("video")];
    if (reduce.matches) {
      videos.forEach((v) => v.pause());
      root.dataset.state = "done";
      return;
    }
    setCanReplay(true);
    const shown = (el: Element) => (el as HTMLElement).offsetParent !== null;
    const tracks = [...root.querySelectorAll<HTMLElement>("[data-track]")].map((el) => {
      const [hAt, hLen] = (el.dataset.hold ?? "").split(",").map(Number);
      return {
        el,
        dur: Number(el.dataset.dur) || 1,
        clip: el.dataset.clip ? videos.find((v) => v.dataset.clip === el.dataset.clip) : undefined,
        hold: Number.isFinite(hAt) && hLen > 0 ? { at: hAt, len: hLen } : null,
        p: 0,
      };
    });
    type Mark = { el: HTMLElement; time: number; track: (typeof tracks)[number] | null };
    const marks: Mark[] = [...root.querySelectorAll<HTMLElement>("[data-at],[data-t]")].map((el) => {
      if (el.dataset.t !== undefined) return { el, time: Number(el.dataset.t), track: null };
      const host = el.closest<HTMLElement>("[data-track]");
      const track = tracks.find((t) => t.el === host) ?? null;
      return { el, time: Number(el.dataset.at) * (track?.dur ?? 1), track };
    });
    const end = Math.max(0, ...tracks.map((t) => t.dur), ...marks.map((m) => (m.track ? 0 : m.time)));

    let raf = 0, last = 0, clock = 0, holdUntil = 0, held = new Set<object>(), running = false;
    const leads = () => videos.filter((v) => shown(v) && !v.ended && !v.paused);
    const setP = (p: number) => {
      tracks.forEach((t) => {
        t.p = p;
        t.el.style.setProperty("--p", String(p));
      });
    };
    const reset = () => {
      root.dataset.reset = "";
      root.dataset.state = "idle";
      marks.forEach((m) => m.el.removeAttribute("data-on"));
      setP(0);
      root.style.setProperty("--t", "0");
      void root.offsetWidth;
      requestAnimationFrame(() => delete root.dataset.reset);
    };
    const finish = () => {
      running = false;
      cancelAnimationFrame(raf);
      setP(1);
      root.style.setProperty("--t", String(end));
      marks.forEach((m) => m.el.setAttribute("data-on", ""));
      root.dataset.state = "done";
    };
    const tick = (now: number) => {
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (now < holdUntil) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (holdUntil) {
        holdUntil = 0;
        videos.filter(shown).forEach((v) => !v.ended && v.play().catch(() => {}));
      }
      const live = leads();
      clock = live.length ? Math.max(clock, ...live.map((v) => v.currentTime)) : clock + dt;
      root.style.setProperty("--t", clock.toFixed(3));
      for (const t of tracks) {
        const v = t.clip && shown(t.clip) && !t.clip.ended && !t.clip.paused ? t.clip.currentTime : clock;
        let p = Math.min(1, Math.max(t.p, v / t.dur));
        if (t.hold && !held.has(t) && p >= t.hold.at) {
          // the scan stops at the split while the law runs ahead; the clock and any clip wait with it
          held.add(t);
          p = t.hold.at;
          clock = t.hold.at * t.dur;
          holdUntil = now + t.hold.len * 1000;
          t.el.dataset.holding = "";
          setTimeout(() => t.el.removeAttribute("data-holding"), t.hold.len * 1000);
          videos.forEach((x) => x.pause());
        }
        t.p = p;
        t.el.style.setProperty("--p", p.toFixed(4));
      }
      for (const m of marks) {
        if (m.el.hasAttribute("data-on")) continue;
        const now2 = m.track ? m.track.p * m.track.dur : clock;
        if (now2 + 1e-6 >= m.time) m.el.setAttribute("data-on", "");
      }
      if (tracks.every((t) => t.p >= 1) && clock >= end - 0.02 && !holdUntil) return finish();
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (running) return;
      running = true;
      cancelAnimationFrame(raf);
      reset();
      clock = 0;
      last = 0;
      holdUntil = 0;
      held = new Set();
      videos.filter(shown).forEach((v) => {
        v.currentTime = 0;
        v.play().catch(() => {});
      });
      root.dataset.state = "run";
      raf = requestAnimationFrame(tick);
    };
    replay.current = () => {
      running = false;
      start();
    };

    // wait for the strip to be seen, its pictures decoded and its clips ready (or a short while), then scan
    root.dataset.state = "idle";
    const first = tracks[0]?.el ?? root;
    let timer = 0, armed = false;
    const arm = () => {
      if (armed) return;
      armed = true;
      const onScreen = videos.filter(shown);
      onScreen.forEach((v) => {
        if (v.preload !== "auto") {
          v.preload = "auto";
          v.load();
        }
      });
      const imgs = [...root.querySelectorAll<HTMLImageElement>("[data-track] img")];
      const decoded = Promise.all(imgs.map((i) => i.decode().catch(() => {})));
      const ready = Promise.all(onScreen.map((v) => (v.readyState >= 3 ? null : new Promise((r) => { v.addEventListener("canplaythrough", r, { once: true }); v.addEventListener("error", r, { once: true }); }))));
      const slow = new Promise((r) => (timer = window.setTimeout(r, 2500)));
      decoded.then(() => Promise.race([ready, slow])).then(start);
    };
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (es) => {
          if (!es.some((x) => x.isIntersecting)) return;
          io?.disconnect();
          arm();
        },
        { threshold: 0.4 },
      );
      io.observe(first);
    } else arm();
    // a clip that stalls stops the scan with it (its time stops); a reduced-motion switch mid-scan finishes it
    const onReduce = () => reduce.matches && finish();
    reduce.addEventListener?.("change", onReduce);
    return () => {
      io?.disconnect();
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      reduce.removeEventListener?.("change", onReduce);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
      {canReplay && (
        <button type="button" className={buttonClassName} onClick={() => replay.current()}>
          {label}
        </button>
      )}
    </div>
  );
}

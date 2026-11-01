"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Cyt, Verdict } from "@/app/cyt";
import styles from "./CanYouTell.module.css";

const OPTIONS: Verdict[] = ["real time", "slowed", "sped up"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A right, wrong or no-answer mark beside each row of the scorecard. */
function Mark({ ok }: { ok: boolean | null }) {
  if (ok === null) return <span className={`${styles.mark} ${styles.none}`}>no answer</span>;
  return <span className={`${styles.mark} ${ok ? styles.right : styles.wrong}`}>{ok ? "right" : "wrong"}</span>;
}

/**
 * The blind test: six real clips loop, muted, and the reader says how each plays. Then each clip turns over to show
 * the reader's guess, what Muse Spark said by eye, what Ansatz measured and the truth, and the three are tallied. All
 * of it comes from stored runs (app/cyt.ts); nothing is fetched and no model is called.
 */
export default function CanYouTell({ data }: { data: Cyt }) {
  const { clips } = data;
  const [guess, setGuess] = useState<Record<string, Verdict>>({});
  const [shown, setShown] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const tally = useRef<HTMLDivElement>(null);
  const answered = clips.filter((c) => guess[c.id]).length;
  const you = clips.filter((c) => guess[c.id] === c.truth.verdict).length;

  // each clip plays while it is on screen; a reader who prefers no motion gets the first frame and the controls
  useEffect(() => {
    const vids = [...(box.current?.querySelectorAll("video") ?? [])];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      vids.forEach((v) => (v.controls = true));
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((x) => {
          const v = x.target as HTMLVideoElement;
          if (x.isIntersecting) void v.play().catch(() => {});
          else v.pause();
        }),
      { threshold: 0.25 },
    );
    vids.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, []);

  const reveal = () => {
    setShown(true);
    requestAnimationFrame(() => tally.current?.focus());
  };
  const reset = () => {
    setGuess({});
    setShown(false);
  };

  const score = (n: number | null) => (n === null ? "?" : String(n));

  return (
    <div ref={box} className={styles.wrap}>
      <ol className={styles.grid}>
        {clips.map((c, i) => {
          const g = guess[c.id];
          return (
            <li key={c.id} className={styles.item}>
              <div className={styles.film}>
                <video src={c.src} poster={c.poster} muted loop playsInline preload="none" aria-label={`Clip ${i + 1}`} width={480} height={480} />
                <span className={styles.num} aria-hidden="true">
                  {i + 1}
                </span>
              </div>
              <fieldset className={styles.choice} disabled={shown}>
                <legend className={styles.legend}>Clip {i + 1} plays</legend>
                {OPTIONS.map((o) => (
                  <label key={o} className={`${styles.opt} ${g === o ? styles.on : ""}`}>
                    <input type="radio" name={`cyt-${c.id}`} value={o} checked={g === o} onChange={() => setGuess((s) => ({ ...s, [c.id]: o }))} />
                    <span>{cap(o)}</span>
                  </label>
                ))}
              </fieldset>
              <p className={styles.credit}>
                <a href={c.credit.href}>{c.credit.who}</a>, {c.credit.licence}
              </p>
              {shown && (
                <dl className={styles.card}>
                  <dt className={styles.cardTitle}>{c.title}</dt>
                  <dd className={styles.row}>
                    <span className={styles.rk}>You</span>
                    <span className={styles.rv}>
                      {g ? cap(g) : "No guess"} <Mark ok={g ? g === c.truth.verdict : null} />
                    </span>
                  </dd>
                  <dd className={styles.row}>
                    <span className={styles.rk}>Muse Spark, by eye</span>
                    <span className={styles.rv}>
                      {c.spark.said} <Mark ok={c.spark.verdict === c.truth.verdict} />
                      {c.spark.detail && <small>{c.spark.detail}</small>}
                    </span>
                  </dd>
                  <dd className={styles.row}>
                    <span className={styles.rk}>Ansatz, measured</span>
                    <span className={styles.rv}>
                      {c.ansatz.reading} <Mark ok={c.ansatz.verdict === null ? null : c.ansatz.verdict === c.truth.verdict} />
                      {c.ansatz.detail && <small>{c.ansatz.detail}</small>}
                      {c.ansatz.href && (
                        <small>
                          <Link href={c.ansatz.href}>Open the run</Link>
                        </small>
                      )}
                    </span>
                  </dd>
                  <dd className={`${styles.row} ${styles.truth}`}>
                    <span className={styles.rk}>Truth</span>
                    <span className={styles.rv}>
                      {c.truth.factor}
                      <small>{c.truth.source}</small>
                    </span>
                  </dd>
                </dl>
              )}
            </li>
          );
        })}
      </ol>

      <div className={styles.foot}>
        <div ref={tally} tabIndex={-1} className={styles.tally} aria-live="polite" aria-label={shown ? `You ${you} of ${clips.length}. Muse Spark by eye ${data.spark} of ${clips.length}. Ansatz, measured, ${data.ansatz} of ${clips.length}.` : undefined}>
          <div className={styles.score}>
            <span className={styles.sv}>
              {score(shown ? you : null)}
              <span className={styles.of}>/{clips.length}</span>
            </span>
            <span className={styles.sl}>You</span>
          </div>
          <div className={`${styles.score} ${shown ? styles.wrongScore : ""}`}>
            <span className={styles.sv}>
              {score(shown ? data.spark : null)}
              <span className={styles.of}>/{clips.length}</span>
            </span>
            <span className={styles.sl}>Muse Spark, by eye</span>
          </div>
          <div className={`${styles.score} ${shown ? styles.rightScore : ""}`}>
            <span className={styles.sv}>
              {score(shown ? data.ansatz : null)}
              <span className={styles.of}>/{clips.length}</span>
            </span>
            <span className={styles.sl}>Ansatz, measured</span>
          </div>
        </div>
        <div className={styles.actions}>
          {shown ? (
            <button type="button" className="btn ghost" onClick={reset}>
              Try again
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={reveal} disabled={answered < clips.length}>
                Show the answers
              </button>
              <span className={styles.count}>
                {answered} of {clips.length} answered.{" "}
                <button type="button" className={styles.skip} onClick={reveal}>
                  Skip to the answers
                </button>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

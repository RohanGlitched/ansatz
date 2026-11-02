"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Fold from "./Fold";
import type { CytAnswers, CytPublic, Verdict } from "@/app/cyt";
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
 * the reader's guess, what Muse Spark answered to the same question, what Ansatz measured and the truth, and the
 * three are tallied, by verdict and by factor. The page holds only the clips and scale cues; the answers, with each
 * clip's credit, come from /api/cyt (stored runs; no model is called) only when the reader asks for them, so nothing on
 * the page beforehand gives a clip away or pairs two clips cut from one film.
 */
export default function CanYouTell({ data }: { data: CytPublic }) {
  const { clips } = data;
  const [guess, setGuess] = useState<Record<string, Verdict>>({});
  const [ans, setAns] = useState<CytAnswers | null>(null);
  const [shown, setShown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  // on a phone each card's reasons start folded, so the six cards and the tally fit in a few screens
  const [narrow, setNarrow] = useState(false);
  const pausedRef = useRef(false);
  const visible = useRef(new Set<HTMLVideoElement>());
  const box = useRef<HTMLDivElement>(null);
  const tally = useRef<HTMLDivElement>(null);
  const answered = clips.filter((c) => guess[c.id]).length;
  const truthOf = (id: string) => ans?.clips.find((a) => a.id === id)?.truth.verdict;
  const you = clips.filter((c) => guess[c.id] && guess[c.id] === truthOf(c.id)).length;
  const N = clips.length;

  // each clip plays while it is on screen, unless the reader paused them; a reader who prefers no motion starts paused
  useEffect(() => {
    const vids = [...(box.current?.querySelectorAll("video") ?? [])];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      pausedRef.current = true;
      setPaused(true);
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((x) => {
          const v = x.target as HTMLVideoElement;
          if (x.isIntersecting) {
            visible.current.add(v);
            if (!pausedRef.current) void v.play().catch(() => {});
          } else {
            visible.current.delete(v);
            v.pause();
          }
        }),
      { threshold: 0.25 },
    );
    vids.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, []);

  const togglePlay = () => {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
    const vids = [...(box.current?.querySelectorAll("video") ?? [])];
    if (next) vids.forEach((v) => v.pause());
    else visible.current.forEach((v) => void v.play().catch(() => {}));
  };

  const reveal = async () => {
    setFailed(false);
    if (!ans) {
      setLoading(true);
      try {
        const r = await fetch("/api/cyt");
        if (!r.ok) throw new Error(String(r.status));
        setAns((await r.json()) as CytAnswers);
      } catch {
        setFailed(true);
        setLoading(false);
        return;
      }
      setLoading(false);
    }
    setNarrow(window.matchMedia("(max-width: 600px)").matches);
    setShown(true);
    requestAnimationFrame(() => tally.current?.focus());
  };
  const reset = () => {
    setGuess({});
    setShown(false);
  };

  const open = shown && ans;
  const score = (n: number | null) => (n === null ? "?" : String(n));

  return (
    <div ref={box} className={styles.wrap}>
      <div className={styles.bar}>
        <p className="visually-hidden">This test is visual: each clip is a muted loop of a few seconds with no sound or description. Choose an answer for each, or skip to the answers, which are written out in full under each clip.</p>
        <button type="button" className={styles.playToggle} onClick={togglePlay}>
          <span aria-hidden="true" className={paused ? styles.playIcon : styles.pauseIcon} />
          {paused ? "Play the clips" : "Pause the clips"}
        </button>
      </div>
      <ol className={styles.grid}>
        {clips.map((c, i) => {
          const g = guess[c.id];
          const a = open ? ans.clips.find((x) => x.id === c.id) : undefined;
          return (
            <li key={c.id} className={styles.item}>
              <div className={styles.film}>
                <video src={c.src} poster={c.poster} muted loop playsInline preload="none" controls={paused} aria-label={`Clip ${i + 1}`} width={480} height={480} />
                <span className={styles.num} aria-hidden="true">
                  {i + 1}
                </span>
              </div>
              <fieldset className={styles.choice} disabled={!!open}>
                <legend className={styles.legend}>Clip {i + 1} plays</legend>
                {OPTIONS.map((o) => (
                  <label key={o} className={`${styles.opt} ${g === o ? styles.on : ""}`}>
                    <input type="radio" name={`${c.id}-guess`} value={o} checked={g === o} onChange={() => setGuess((s) => ({ ...s, [c.id]: o }))} />
                    <span>{cap(o)}</span>
                  </label>
                ))}
              </fieldset>
              {/* before the answers only the scale cue shows: a maker's credit would pair the two clips cut from one film */}
              {(c.cue || a) && (
                <p className={styles.credit}>
                  {c.cue && <span className={styles.cue}>Scale: {c.cue.replace(/^For scale, /, "").replace(/^./, (m) => m.toLowerCase())}</span>}
                  {a && (
                    <>
                      <a href={a.credit.href}>{a.credit.who}</a>, {a.credit.licence}
                    </>
                  )}
                </p>
              )}
              {a && (
                <dl className={styles.card}>
                  <dt className={styles.cardTitle}>{a.title}</dt>
                  <dd className={styles.row}>
                    <span className={styles.rk}>You</span>
                    <span className={styles.rv}>
                      {g ? cap(g) : "No guess"} <Mark ok={g ? g === a.truth.verdict : null} />
                    </span>
                  </dd>
                  <dd className={styles.row}>
                    <span className={styles.rk}>Muse Spark, same question</span>
                    <span className={styles.rv}>
                      {a.spark.said} <Mark ok={a.spark.verdict === a.truth.verdict} />
                    </span>
                  </dd>
                  <dd className={styles.row}>
                    <span className={styles.rk}>Ansatz, measured</span>
                    <span className={styles.rv}>
                      {a.ansatz.reading} <Mark ok={a.ansatz.verdict === null ? null : a.ansatz.verdict === a.truth.verdict} />
                    </span>
                  </dd>
                  <dd className={`${styles.row} ${styles.truth}`}>
                    <span className={styles.rk}>Truth</span>
                    <span className={styles.rv}>{a.truth.factor}</span>
                  </dd>
                  <dd className={styles.row}>
                    <details className={styles.why} open={!narrow}>
                      <summary>Why</summary>
                      <span className={styles.rv}>
                        {a.spark.detail && <small>Muse Spark: {a.spark.detail}</small>}
                        {a.spark.quote && <small className={styles.quote}>&ldquo;{a.spark.quote}&rdquo;</small>}
                        {a.ansatz.detail && <small>Ansatz: {a.ansatz.detail}</small>}
                        {a.ansatz.href && (
                          <small>
                            <Link href={a.ansatz.href}>Open the run</Link>
                          </small>
                        )}
                        <small>Truth: {a.truth.source}</small>
                      </span>
                    </details>
                  </dd>
                </dl>
              )}
            </li>
          );
        })}
      </ol>
      {!open && <p className={styles.creditNote}>Credits for all six clips appear with the answers.</p>}

      <div className={styles.foot}>
        <div className={styles.tallyCol}>
          <div ref={tally} tabIndex={-1} className={styles.tally}>
            <div className={styles.score} aria-hidden="true">
              <span className={styles.sv}>
                {score(open ? you : null)}
                <span className={styles.of}>/{N}</span>
              </span>
              <span className={styles.sl}>You</span>
            </div>
            {/* Muse Spark's tally stays in plain ink: the colour goes to the measured row and to misses */}
            <div className={styles.score} aria-hidden="true">
              <span className={styles.sv}>
                {score(open ? ans.spark : null)}
                <span className={styles.of}>/{N}</span>
              </span>
              <span className={styles.sl}>Muse Spark, {open && ans.sets.length > 1 ? ans.sets[0].label : "same question"}</span>
              {open &&
                ans.sets.slice(1).map((s) => (
                  <span key={s.key} className={styles.slSub}>
                    {s.spark}/{N} {s.label}
                    {s.spark === ans.ansatz ? ", a tie" : ""}
                  </span>
                ))}
            </div>
            <div className={`${styles.score} ${open ? (ans.ansatz * 2 > N ? styles.rightScore : styles.wrongScore) : ""}`} aria-hidden="true">
              <span className={styles.sv}>
                {score(open ? ans.ansatz : null)}
                <span className={styles.of}>/{N}</span>
              </span>
              <span className={styles.sl}>Ansatz, measured</span>
            </div>
          </div>
          {open && (
            <div className={styles.factorTally} aria-hidden="true">
              <p className={styles.factorHead}>
                Right factor, within {Math.round(ans.factor.tol * 100)}%, by majority answer, on the {ans.factor.n} retimed clips
              </p>
              <div className={styles.tally}>
                <div className={styles.score}>
                  <span className={`${styles.sv} ${styles.svWord}`}>can&rsquo;t say</span>
                  <span className={styles.sl}>You, by eye</span>
                </div>
                <div className={`${styles.score} ${ans.factor.spark * 2 > ans.factor.n ? styles.rightScore : styles.wrongScore}`}>
                  <span className={styles.sv}>
                    {ans.factor.spark}
                    <span className={styles.of}>/{ans.factor.n}</span>
                  </span>
                  <span className={styles.sl}>Muse Spark, {ans.sets.length > 1 ? ans.sets[0].label : "same question"}</span>
                  {ans.sets.slice(1).map((s) => (
                    <span key={s.key} className={styles.slSub}>
                      {s.factor.spark}/{s.factor.n} {s.label}
                    </span>
                  ))}
                </div>
                <div className={`${styles.score} ${ans.factor.ansatz * 2 > ans.factor.n ? styles.rightScore : styles.wrongScore}`}>
                  <span className={styles.sv}>
                    {ans.factor.ansatz}
                    <span className={styles.of}>/{ans.factor.n}</span>
                  </span>
                  <span className={styles.sl}>Ansatz, measured</span>
                </div>
              </div>
              <p className={styles.factorNote}>
                {/* each set's own count, named: the first ask alone is not the whole story (the asks with the lengths have one each) */}
                Muse Spark&rsquo;s single answers on those clips within {Math.round(ans.factor.tol * 100)}%: {ans.sets.map((s) => `${s.factor.sparkAnswersRight} of ${s.factor.sparkAnswers} ${s.key === "first" ? "on its first ask" : s.label}`).join(", ")}; a clip counts by its majority answer.
              </p>
            </div>
          )}
          {/* read out when the answers land: the visible scores above are hidden from screen readers in favour of this */}
          <p role="status" aria-live="polite" className={open ? styles.baseline : "visually-hidden"}>
            {open && (
              <>
                <span className="visually-hidden">{`You scored ${you} of ${N}. Muse Spark, asked the same question: ${ans.sets.map((s) => `${s.spark} of ${N} ${s.label}`).join("; ")}. Ansatz, measured, ${ans.ansatz} of ${N}. Right factor, within ${Math.round(ans.factor.tol * 100)}%, by majority answer, on the ${ans.factor.n} retimed clips: Muse Spark ${ans.sets.map((s) => `${s.factor.spark} of ${s.factor.n} ${s.label}`).join("; ")}; Ansatz ${ans.factor.ansatz} of ${ans.factor.n}. `}</span>
                {ans.baseline}
              </>
            )}
            {loading && "Loading the answers…"}
            {failed && "The answers could not be loaded. Try again."}
          </p>
        </div>
        <div className={styles.actions}>
          {open ? (
            <button type="button" className="btn ghost" onClick={reset}>
              Try again
            </button>
          ) : (
            <>
              <button type="button" className="btn" onClick={reveal} disabled={answered < N || loading}>
                Show the answers
              </button>
              <span className={styles.count}>
                {answered} of {N} answered.{" "}
                <button type="button" className={styles.skip} onClick={reveal} disabled={loading}>
                  Skip to the answers
                </button>
              </span>
            </>
          )}
        </div>
      </div>

      {open && <p className={styles.factorLine}>{ans.factorLine}</p>}
      {open && ans.parity && <p className={styles.parityLine}>{ans.parity.line}</p>}
      {open && ans.parityMedium && <p className={`${styles.parityLine} ${styles.mediumLine}`}>{ans.parityMedium.line}</p>}

      {open && (
        <Fold className={`onPlateFold ${styles.sources}`} summary="Credits, cuts and where each answer comes from">
          <ol className={styles.sourceList}>
            {ans.clips.map((a, i) => (
              <li key={a.id}>
                <b>
                  {i + 1}. {a.title}.
                </b>{" "}
                {a.source.href ? <a href={a.source.href}>{a.source.credit}</a> : a.source.credit}, {a.source.licence}. On this page: {a.source.cut}. Answers from <code>{a.source.record}</code>.
              </li>
            ))}
          </ol>
          <p>{ans.method}</p>
        </Fold>
      )}
    </div>
  );
}

"use client";

import katex from "katex";
import styles from "./LiveRun.module.css";

export type LiveData = {
  measure?: { width: number; height: number; px: [number, number][]; pivot: [number, number] | null };
  laws?: { id: string; title: string; summary: string; latex: string[] }[];
  board?: { id: string; title: string; origin: string; rank: number; miss: string; rel: number; latex: string[]; path: [number, number][] }[];
};

function tex(s: string) {
  return { __html: katex.renderToString(s, { throwOnError: false, strict: "ignore" }) };
}

/** What the experiment has found so far, drawn on the clip itself as each step lands. */
export default function LiveRun({ src, live }: { src: string | null; live: LiveData }) {
  const m = live.measure;
  const W = m?.width ?? 16, H = m?.height ?? 9;
  const r = Math.max(2, W / 240);
  const path = (pts: [number, number][]) => pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join("");
  const winner = live.board?.[0];
  return (
    <div className={styles.live}>
      <div className={styles.frame} style={{ aspectRatio: `${W} / ${H}` }}>
        {src && <video src={src} className={styles.video} muted autoPlay loop playsInline />}
        {m && (
          <svg className={styles.overlay} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-label="Measured positions and the laws' paths">
            {live.board?.slice(1).map((b) => <path key={b.id} d={path(b.path)} fill="none" stroke="#e9ebe6" strokeOpacity="0.45" strokeWidth={r * 0.5} strokeDasharray={`${r * 1.5} ${r * 1.5}`} />)}
            {winner && <path d={path(winner.path)} fill="none" stroke="#8fa0ff" strokeWidth={r * 1.1} className={styles.draw} />}
            {m.px.map((p, i) => (
              <circle key={i} cx={p[0]} cy={p[1]} r={r * 0.7} fill="#ff5a1f" className={styles.dot} style={{ animationDelay: `${Math.min(i * 12, 1800)}ms` }} />
            ))}
            {m.pivot && <circle cx={m.pivot[0]} cy={m.pivot[1]} r={r * 1.4} fill="none" stroke="#e9ebe6" strokeWidth={r * 0.4} />}
          </svg>
        )}
        {!m && <p className={styles.wait}>Measuring…</p>}
      </div>
      {(live.board || live.laws) && (
        <div className={styles.laws}>
          <p className={styles.h}>{live.board ? "The trial: each law’s miss on the frames it never saw" : "Laws proposed by Muse Spark"}</p>
          <ol>
            {(live.board ?? live.laws!.map((l, i) => ({ ...l, rank: i + 1, miss: "", origin: "muse", rel: 0, path: [] }))).map((l) => (
              <li key={l.id} className={live.board && l.rank === 1 ? styles.win : ""}>
                <span className={styles.title}>
                  {l.title}
                  {l.origin === "control" && <em> textbook control</em>}
                </span>
                <span className={styles.eq}>
                  {l.latex.slice(0, 2).map((x, i) => (
                    <span key={i} dangerouslySetInnerHTML={tex(x)} />
                  ))}
                </span>
                {l.miss && <span className={`num ${styles.miss}`}>{l.miss}</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

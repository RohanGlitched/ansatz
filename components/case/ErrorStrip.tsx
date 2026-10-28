import styles from "./case.module.css";

type Err = { label: string; err: number };
type Row = { title: string; sub: string; errs: Err[]; kind: "measured" | "eye" };

const LO = -2; // 0.01%
const HI = Math.log10(5000);
const pctText = (v: number) => (v < 0.01 ? "under 0.01%" : `${+v.toPrecision(v < 1 ? 2 : 3)}%`);

/** Where a value sits on the log axis, as a percentage of the track's width. */
const at = (v: number) => {
  const l = Math.log10(Math.max(10 ** LO, Math.min(10 ** HI, v)));
  return ((l - LO) / (HI - LO)) * 100;
};

/** Stack dots that would overlap into lanes, so every error is visible (a simple beeswarm). */
function lanes(errs: Err[]) {
  const sorted = [...errs].sort((a, b) => a.err - b.err);
  const last: number[] = [];
  return sorted.map((e) => {
    const x = at(e.err);
    let lane = last.findIndex((lx) => x - lx > 1.6);
    if (lane < 0) {
      lane = last.length;
      last.push(x);
    } else last[lane] = x;
    return { ...e, x, lane };
  });
}

function median(a: number[]) {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : NaN;
}

/**
 * Every error on one log axis, one dot per number: what Ansatz measured against the truth, and what Muse Spark read off
 * the same clips by eye. Drawn in HTML so its labels stay legible at any width.
 */
export default function ErrorStrip({ rows }: { rows: Row[] }) {
  const ticks = [0.01, 0.1, 1, 10, 100, 1000];
  return (
    <div className={styles.strip}>
      {rows.map((r) => {
        const placed = lanes(r.errs);
        const nLanes = Math.max(1, ...placed.map((p) => p.lane + 1));
        const h = 24 + nLanes * 13;
        const med = median(r.errs.map((e) => e.err));
        const mx = at(med);
        return (
          <div key={r.title} className={styles.stripRow}>
            <p className={styles.stripLab}>
              {r.title}
              <small>{r.sub}</small>
            </p>
            <div className={styles.track} style={{ ["--h" as string]: `${h}px` }} role="img" aria-label={`${r.title}: ${r.errs.length} errors, median ${pctText(med)}; ${r.errs.filter((e) => e.err <= 5).length} within 5%.`}>
              <span className={styles.five} style={{ left: `${at(5)}%` }} aria-hidden="true" />
              {placed.map((p, i) => (
                <span
                  key={i}
                  className={`${styles.dot} ${r.kind === "eye" ? styles.eye : ""} ${p.err >= 5000 ? styles.clamped : ""}`}
                  style={{ left: `${p.x}%`, top: `${h - 10 - p.lane * 13}px` }}
                  title={`${p.label}: ${pctText(p.err)} off`}
                />
              ))}
              <span className={`${styles.median} ${mx > 70 ? styles.flip : ""}`} style={{ left: `${mx}%` }} aria-hidden="true">
                <span>median {pctText(med)}</span>
              </span>
            </div>
          </div>
        );
      })}
      <div className={styles.stripRow} aria-hidden="true">
        <span className={styles.axisLab}>error against the truth, log scale</span>
        <div className={styles.axis}>
          {ticks.map((t) => (
            <span key={t} style={{ left: `${at(t)}%` }} className={t === 0.1 || t === 1000 ? styles.minor : undefined}>
              {t}%
            </span>
          ))}
        </div>
      </div>
      <p className={styles.stripKey}>
        <span>
          <i className={styles.kM} />
          SAM 3.1 measured, code fitted
        </span>
        <span>
          <i className={styles.kE} />
          Muse Spark by eye
        </span>
        <span>
          <i className={styles.kF} />
          within 5% of the truth, left of the line
        </span>
      </p>
    </div>
  );
}

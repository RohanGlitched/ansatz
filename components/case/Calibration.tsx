import styles from "./case.module.css";

type Case = { law: string; noise: string; "coverage1σ": number; "coverage2σ": number };

const LO = 0.5, HI = 1;
const at = (v: number) => ((Math.max(LO, Math.min(HI, v)) - LO) / (HI - LO)) * 100;
const NOISE: Record<string, string> = { white: "white noise", mixed: "both kinds of noise" };
const noiseName = (n: string) => NOISE[n] ?? (n.startsWith("ar") ? "smoothly wandering noise" : `${n} noise`);

/**
 * How often the reported error bars held the true value, on synthetic tracks with known answers: a filled dot for
 * ±1σ (ideal 68%), a ring for ±2σ (ideal 95%), each against its ideal as a dashed line.
 */
export default function Calibration({ cases, trials }: { cases: Case[]; trials: number }) {
  const ticks = [0.5, 0.6, 0.7, 0.8, 0.9, 1];
  return (
    <div className={styles.cal}>
      <div role="list">
        {cases.map((c) => {
          const one = c["coverage1σ"], two = c["coverage2σ"];
          return (
            <div key={`${c.law}-${c.noise}`} className={styles.calRow} role="listitem">
              <p className={styles.calLab}>
                {c.law[0].toUpperCase() + c.law.slice(1)} <small>with {noiseName(c.noise)}</small>
              </p>
              <div className={styles.calTrack} role="img" aria-label={`±1σ held the truth in ${Math.round(one * 100)}% of ${trials} trials (ideal 68%); ±2σ in ${Math.round(two * 100)}% (ideal 95%)`}>
                <span className={styles.ideal} style={{ left: `${at(0.6827)}%` }} />
                <span className={styles.ideal} style={{ left: `${at(0.9545)}%` }} />
                <span className={styles.dot} style={{ left: `${at(one)}%` }} title={`±1σ: ${Math.round(one * 100)}%`} />
                <span className={`${styles.dot} ${styles.ring}`} style={{ left: `${at(two)}%` }} title={`±2σ: ${Math.round(two * 100)}%`} />
              </div>
              <p className={styles.calNum}>
                {Math.round(one * 100)}%, {Math.round(two * 100)}%
              </p>
            </div>
          );
        })}
      </div>
      <div className={styles.calAxis} aria-hidden="true">
        {ticks.map((t) => (
          <span key={t} style={{ left: `${at(t)}%` }}>
            {Math.round(t * 100)}%
          </span>
        ))}
      </div>
      <p className={styles.stripKey} style={{ marginTop: 18 }}>
        <span>
          <i className={styles.kM} />
          inside ±1σ (ideal 68%)
        </span>
        <span>
          <i className={styles.kR} />
          inside ±2σ (ideal 95%)
        </span>
        <span>
          <i className={styles.kF} />
          the ideal for each
        </span>
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
import StrobePlate, { type PlateData } from "./StrobePlate";
import styles from "./PlateWithControls.module.css";

/** The print plus the counterfactual switches the referee proposed ("on the Moon", "without air"). */
export default function PlateWithControls({ data, priority }: { data: PlateData; priority?: boolean }) {
  const [wi, setWi] = useState<number | null>(null);
  return (
    <div>
      <StrobePlate data={data} showWhatIf={wi} priority={priority} />
      <div className={styles.row}>
        <span className="key">
          <i className="m" /> measured by SAM 3.1
        </span>
        <span className="key">
          <i className="l" /> the law’s path
        </span>
        {!!data.whatIf?.length && (
          <div className={styles.whatIf} role="group" aria-label="What if">
            <span className={styles.wiLabel}>What if</span>
            {data.whatIf.map((w, i) => (
              <button key={i} type="button" className={`${styles.chip} ${wi === i ? styles.on : ""}`} aria-pressed={wi === i} onClick={() => setWi(wi === i ? null : i)}>
                {w.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

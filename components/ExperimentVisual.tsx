"use client";

import { useState } from "react";
import ClipPlayer, { type ClipData } from "./ClipPlayer";
import PlateWithControls from "./PlateWithControls";
import type { PlateData } from "./StrobePlate";
import styles from "./ExperimentVisual.module.css";

/** The experiment's two views: the stroboscopic print, and the clip played with the measurement on it. */
export default function ExperimentVisual({ plate, clip }: { plate: PlateData; clip: ClipData }) {
  const [tab, setTab] = useState<"print" | "clip">("print");
  return (
    <div>
      <div className={styles.tabs} role="tablist" aria-label="View">
        <button role="tab" aria-selected={tab === "print"} className={tab === "print" ? styles.on : ""} onClick={() => setTab("print")}>
          Stroboscopic print
        </button>
        <button role="tab" aria-selected={tab === "clip"} className={tab === "clip" ? styles.on : ""} onClick={() => setTab("clip")}>
          Play the clip
        </button>
      </div>
      {tab === "print" ? <PlateWithControls data={plate} priority /> : <ClipPlayer data={clip} />}
    </div>
  );
}

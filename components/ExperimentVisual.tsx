"use client";

import { useState } from "react";
import ClipPlayer, { type ClipData } from "./ClipPlayer";
import PlateWithControls from "./PlateWithControls";
import type { PlateData } from "./StrobePlate";
import styles from "./ExperimentVisual.module.css";

/**
 * The experiment's two views, printed on a plate: the stroboscopic print, and the clip played with the measurement on
 * it. Both go through the cyanotype duotone; "Original colour" takes it off.
 */
export default function ExperimentVisual({ plate, clip, start = "print" }: { plate: PlateData; clip: ClipData; start?: "print" | "clip" }) {
  const [tab, setTab] = useState<"print" | "clip">(start);
  const [colour, setColour] = useState(false);
  return (
    <div className={styles.visual}>
      <div className={styles.bar}>
        <div className={styles.tabs} role="group" aria-label="View">
          <button type="button" aria-pressed={tab === "print"} onClick={() => setTab("print")}>
            Stroboscopic print
          </button>
          <button type="button" aria-pressed={tab === "clip"} onClick={() => setTab("clip")}>
            Play the clip
          </button>
        </div>
        <button type="button" className={styles.colour} aria-pressed={colour} onClick={() => setColour((c) => !c)}>
          {colour ? "Print as cyanotype" : "Original colour"}
        </button>
      </div>
      {tab === "print" ? <PlateWithControls data={plate} priority colour={colour} /> : <ClipPlayer data={clip} colour={colour} />}
    </div>
  );
}

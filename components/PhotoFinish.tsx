import type { Experiment } from "@/lib/experiment";
import { toPixels } from "@/lib/pixels";
import slits from "@/data/slits.json";
import ReplayScope from "./ReplayScope";
import styles from "./PhotoFinish.module.css";

type Slit = {
  slice: number;
  frames: number;
  height: number;
  fps: number;
  duration: number;
  /** y: a fixed column; follow: a column riding on SAM's x; arc: a band along a pendulum's circle, unrolled */
  axis?: "y" | "follow" | "arc";
  x?: number;
  /** arc only: the swing angle at the strip's top row, and radians per row */
  top?: number;
  step?: number;
};

/**
 * A photo-finish of the clip: one thin slice through the moving object from every frame, side by side, so the motion
 * draws its own graph against time in real pixels. On it: what SAM 3.1 measured, the law that won, and the moment the
 * law stopped being fitted and had to predict.
 */
export default function PhotoFinish({ e }: { e: Experiment }) {
  const meta = (slits as Record<string, Slit>)[e.id];
  if (!meta) return null;
  const m = e.measured;
  const W = meta.frames * meta.slice, H = meta.height;
  const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  const law = toPixels(win.fit.predicted, m);
  const X = (f: number) => (f + 0.5) * meta.slice;
  // where a point sits along the slice: its height, or for an unrolled arc, its swing angle about the pivot
  const pv = m.pivot;
  const axis = meta.axis ?? "y";
  if (axis === "arc" && (!pv || meta.top === undefined || !meta.step)) return null;
  const Y = (p: { x: number; y: number }) => (axis === "arc" ? (meta.top! - Math.atan2(p.x - pv!.x, p.y - pv!.y)) / meta.step! : p.y);
  const lawPath = m.px.map((p, i) => (law[i] ? `${i ? "L" : "M"}${X(p.f).toFixed(1)} ${Y(law[i]).toFixed(1)}` : "")).join("");
  const split = m.px[Math.min(m.px.length - 1, Math.max(1, Math.round(m.px.length * e.trainFrac)))];
  const seconds = Array.from({ length: Math.floor(meta.duration) + 1 }, (_, s) => s);
  const every = Math.max(1, Math.ceil(m.px.length / 220));
  // marks land when the scan reaches their frame, at the clip's own playback speed
  const at = (f: number) => `${(((f + 0.5) / meta.frames) * meta.duration).toFixed(3)}s`;
  return (
    <figure className={styles.finish}>
      <div className={styles.ruler} aria-hidden="true">
        {seconds.map((s) => (
          <span key={s} style={{ left: `${(s / meta.duration) * 100}%` }}>
            {s === 0 ? "0 s" : s}
          </span>
        ))}
      </div>
      <ReplayScope className={styles.scan} buttonClassName={styles.replay} label="Scan the clip again">
      <div className={styles.strip} style={{ ["--dur" as string]: `${meta.duration}s` }}>
        <span className={styles.develop}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/slits/${e.id}.webp`} alt={`Photo-finish of the clip: one slice per frame through the ${e.tracking.noun}, ${meta.frames} frames over ${meta.duration.toFixed(1)} seconds`} />
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {split && <rect x={X(split.f)} y={0} width={W - X(split.f)} height={H} className={styles.unseen} />}
          {split && <line x1={X(split.f)} x2={X(split.f)} y1={0} y2={H} className={styles.splitLine} vectorEffect="non-scaling-stroke" />}
          <path d={lawPath} className={styles.law} vectorEffect="non-scaling-stroke" />
        </svg>
        {m.px.map((p, i) =>
          i % every === 0 ? <i key={i} className={styles.dot} style={{ left: `${(X(p.f) / W) * 100}%`, top: `${(Y(p) / H) * 100}%`, ["--d" as string]: at(p.f) }} /> : null,
        )}
        {split && (
          <span className={styles.tag} style={{ left: `${(X(split.f) / W) * 100}%`, ["--d" as string]: at(split.f) }}>
            <b>fitted</b>
            <b>predicted, never seen</b>
          </span>
        )}
        </span>
        <b className={styles.scanLine} aria-hidden="true" />
      </div>
      </ReplayScope>
      <figcaption>
        {axis === "arc"
          ? `Photo-finish: a ${meta.slice}-pixel band bent along the circle the ${e.tracking.noun} swings on, cut from each of the clip’s ${meta.frames} frames, unrolled and laid side by side, so the swing draws its own graph against time (up is a swing to the right).`
          : axis === "follow"
            ? `Photo-finish: a ${meta.slice}-pixel column cut from each of the clip’s ${meta.frames} frames where SAM 3.1 placed the ${e.tracking.noun}, laid side by side, so its height draws its own graph against time.`
            : `Photo-finish: one ${meta.slice}-pixel slice through the ${e.tracking.noun} from each of the clip’s ${meta.frames} frames, laid side by side, so the motion draws its own graph against time.`}{" "}
        Orange: SAM 3.1’s measurement in each frame. Blue: the law that won, fitted to the left of the line and predicting the right.
      </figcaption>
    </figure>
  );
}

import type { Experiment } from "@/lib/experiment";
import { stripGeometry } from "./strip";
import styles from "./StripCard.module.css";

/**
 * A gallery card's print: the experiment's photo-finish strip, with the frames no law saw shaded and the winning law
 * drawn across the whole clip. On hover or focus of the card the strip re-develops at three times the clip's speed
 * under the law, so the measurements arrive on a line that was drawn before them. Returns null without a strip.
 */
export default function StripCard({ e }: { e: Experiment }) {
  const g = stripGeometry(e);
  if (!g) return null;
  const { meta, m, W, H, X, Y, at, n, split, win, pathOf } = g;
  const fast = meta.duration / 3;
  const every = Math.max(1, Math.ceil(n / 60));
  const law = pathOf(win);
  return (
    <div className={styles.plate} style={{ ["--fast" as string]: `${fast.toFixed(3)}s` }}>
      <div className={styles.strip}>
        {/* the first paint: a small copy of the strip (scripts/stills.mjs), loaded at once, so the card shows its print
            before the full-size strip below the fold is fetched */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.first} src={`/slits/thumb/${e.id}.webp`} alt="" decoding="async" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className={styles.latent} src={`/slits/${e.id}.webp`} alt="" loading="lazy" decoding="async" />
        <span className={styles.develop}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/slits/${e.id}.webp`} alt={`Photo-finish of the clip: one slice per frame through the ${e.tracking.noun}`} loading="lazy" decoding="async" />
          {m.px.map((p, i) =>
            i % every === 0 ? <i key={i} className={styles.dot} style={{ left: `${(X(p.f) / W) * 100}%`, top: `${(Y(p) / H) * 100}%`, ["--d" as string]: `${(at(p.f) * fast).toFixed(3)}s` }} /> : null,
          )}
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {split && <rect x={X(split.f)} y={0} width={W - X(split.f)} height={H} className={styles.unseen} />}
          {split && <line x1={X(split.f)} x2={X(split.f)} y1={0} y2={H} className={styles.splitLine} vectorEffect="non-scaling-stroke" />}
          <path d={law} className={styles.lawHalo} vectorEffect="non-scaling-stroke" />
          <path d={law} className={styles.law} vectorEffect="non-scaling-stroke" />
        </svg>
        <b className={styles.scanLine} aria-hidden="true" />
      </div>
    </div>
  );
}

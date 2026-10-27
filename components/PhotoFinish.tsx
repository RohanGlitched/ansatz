import type { Experiment } from "@/lib/experiment";
import ReplayScope from "./ReplayScope";
import { fmtMiss, stripGeometry } from "./strip";
import styles from "./PhotoFinish.module.css";

/** how long the scan waits at the split while the laws run ahead: a beat, then the prediction draws */
const PAUSE = 0.6, DRAW = 0.9;

/**
 * A photo-finish of the clip: one thin slice through the moving object from every frame, side by side, so the motion
 * draws its own graph against time in real pixels. On it: what SAM 3.1 measured, the law that won, and the moment the
 * law stopped being fitted and had to predict. The scan stops at that moment; the winner and the runner-up draw their
 * predictions ahead to the end of the clip, and then the measurements arrive on top of them.
 */
export default function PhotoFinish({ e }: { e: Experiment }) {
  const g = stripGeometry(e);
  if (!g) return null;
  const { meta, m, W, H, axis, X, Y, at, n, splitIdx, split, win, runner, channels, pathOf, missSoFar } = g;
  const dur = meta.duration;
  const s = split ? at(split.f) : 1;
  const seconds = Array.from({ length: Math.floor(dur) + 1 }, (_, k) => k);
  const every = Math.max(1, Math.ceil(n / 220));
  // the fitted|predicted tag goes in whichever edge band near the split the motion leaves emptier
  const near = m.px.filter((p) => Math.abs(at(p.f) - s) < 0.18).map((p) => Y(p) / H);
  const tagBottom = near.filter((y) => y < 0.24).length > near.filter((y) => y > 0.76).length;
  const fmtS = (x: number) => x.toFixed(3);
  const counters = [
    { c: win, cls: styles.kWin, name: win.law.title },
    ...(runner ? [{ c: runner, cls: styles.kRun, name: runner.law.title }] : []),
  ];
  return (
    <figure className={styles.finish}>
      <div className={styles.ruler} aria-hidden="true">
        {seconds.map((k) => (
          <span key={k} style={{ left: `${(k / dur) * 100}%` }}>
            {k === 0 ? "0 s" : k}
          </span>
        ))}
      </div>
      <ReplayScope className={styles.scan} buttonClassName={styles.replay} label="Scan the clip again">
        <div className={styles.strip} data-track="" data-dur={fmtS(dur)} data-hold={split ? `${s.toFixed(4)},${PAUSE + DRAW}` : undefined} style={{ ["--split" as string]: s.toFixed(4), ["--pause" as string]: `${PAUSE}s`, ["--draw" as string]: `${DRAW}s` }}>
          {/* the latent print: the whole strip, faint, so the scan develops a picture rather than sweeping a void */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.latent} src={`/slits/${e.id}.webp`} alt="" aria-hidden="true" />
          <span className={styles.develop}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/slits/${e.id}.webp`} alt={`Photo-finish of the clip: one slice per frame through the ${e.tracking.noun}, ${meta.frames} frames over ${dur.toFixed(1)} seconds`} />
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
              {split && <rect x={X(split.f)} y={0} width={W - X(split.f)} height={H} className={styles.unseen} />}
              {split && <line x1={X(split.f)} x2={X(split.f)} y1={0} y2={H} className={styles.splitLine} vectorEffect="non-scaling-stroke" />}
              <path d={pathOf(win, 0, splitIdx)} className={styles.lawHalo} vectorEffect="non-scaling-stroke" />
              <path d={pathOf(win, 0, splitIdx)} className={styles.law} vectorEffect="non-scaling-stroke" />
            </svg>
            {m.px.map((p, i) =>
              i % every === 0 ? <i key={i} className={styles.dot} data-at={at(p.f).toFixed(4)} style={{ left: `${(X(p.f) / W) * 100}%`, top: `${(Y(p) / H) * 100}%` }} /> : null,
            )}
          </span>
          {/* the predictions sit outside the developing print, so they can run ahead of the data */}
          {split && (
            <span className={styles.ahead} data-at={s.toFixed(4)} aria-hidden="true">
              <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
                {runner && <path d={pathOf(runner, splitIdx, n - 1)} className={styles.runner} vectorEffect="non-scaling-stroke" />}
                <path d={pathOf(win, splitIdx, n - 1)} className={styles.lawHalo} vectorEffect="non-scaling-stroke" />
                <path d={pathOf(win, splitIdx, n - 1)} className={styles.law} vectorEffect="non-scaling-stroke" />
              </svg>
            </span>
          )}
          {split && (
            <span className={`${styles.tag} ${tagBottom ? styles.tagLow : ""}`} data-at={s.toFixed(4)} style={{ ["--s" as string]: s.toFixed(4) }}>
              <b>fitted</b>
              <b>
                predicted<span className={styles.long}>, never seen</span>
              </b>
            </span>
          )}
          <b className={styles.scanLine} aria-hidden="true" />
        </div>
        {split && (
          <p className={styles.race} data-t={fmtS(s * dur)}>
            <span className={styles.raceHead}>Predicting the unseen {Math.round((1 - e.trainFrac) * 100)}%, missed so far:</span>
            {counters.map(({ c, cls, name }) => (
              <span key={c.law.id} className={styles.racer}>
                <i className={cls} aria-hidden="true" />
                <span className={styles.racerName}>{c === win ? "winner" : "runner-up"}, {name}</span>
                <strong className={styles.count}>
                  <span data-t={fmtS(s * dur)}>—</span>
                  {missSoFar(c).map((p, k) => (
                    <span key={k} data-t={fmtS(p.at * dur)}>
                      {fmtMiss(p.v, e, channels)}
                    </span>
                  ))}
                </strong>
              </span>
            ))}
            {runner && runner.fit.testRms <= win.fit.testRms && <span className={styles.tie}>a tie within the measurement noise</span>}
          </p>
        )}
      </ReplayScope>
      <figcaption>
        {axis === "arc"
          ? `Photo-finish: a ${meta.slice}-pixel band bent along the circle the ${e.tracking.noun} swings on, cut from each of the clip’s ${meta.frames} frames, unrolled and laid side by side, so the swing draws its own graph against time (up is a swing to the right).`
          : axis === "follow"
            ? `Photo-finish: a ${meta.slice}-pixel column cut from each of the clip’s ${meta.frames} frames where SAM 3.1 placed the ${e.tracking.noun}, laid side by side, so its height draws its own graph against time.`
            : `Photo-finish: one ${meta.slice}-pixel slice through the ${e.tracking.noun} from each of the clip’s ${meta.frames} frames, laid side by side, so the motion draws its own graph against time.`}{" "}
        Orange: SAM 3.1’s measurement in each frame. Blue: the law that won, fitted to the left of the line and predicting the right{runner ? "; dashed: the runner-up’s prediction" : ""}. The scan stops at the line while both laws draw what they expect, then the measurements land.
      </figcaption>
    </figure>
  );
}

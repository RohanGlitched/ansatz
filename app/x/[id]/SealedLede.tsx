import { sealedTest } from "@/app/sealed";
import type { Experiment } from "@/lib/experiment";
import { fmtProse } from "@/lib/format";
import styles from "./page.module.css";

type Row = { label: string; param: string; measured: number; sigma: number; truth: number; unit: string; si?: { measured: number; sigma: number; truth: number; unit: string } };

/** "3408 ± 28" with the error bar's own precision */
const pm = (v: number, s: number) => {
  const d = Math.max(0, -Math.floor(Math.log10(s)) + (s / 10 ** Math.floor(Math.log10(s)) < 2 ? 1 : 0));
  return `${v.toFixed(d)} ± ${s.toFixed(d)}`;
};

/**
 * The first screen of a sealed-law run: the law drand drew against the law Ansatz found, each constant beside its drawn
 * value, the seal and the reveal. The referee's own summary was written before the truth was revealed, in pixels, and
 * folds away beneath it, so the first screen never contradicts the run's verdict.
 */
export default async function SealedLede({ e }: { e: Experiment }) {
  const sealed = await sealedTest().catch(() => null);
  const draw = sealed?.draws.find((d) => d.href === `/x/${e.id}`);
  if (!sealed || !draw) return null;
  const rows = (e.extras?.truth?.rows ?? []) as Row[];
  const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  const wonder = win.origin === "revision" && sealed.wonderStory?.includes(`round ${draw.round}`);
  return (
    <>
      <p className={styles.lede}>{draw.line}</p>
      {draw.verdict === "hit" && rows.length > 0 && (
        <ul className={styles.findingList}>
          {rows.map((r) => {
            const v = r.si ?? r;
            const z = Math.abs(r.measured - r.truth) / r.sigma;
            return (
              <li key={r.param}>
                {r.label.charAt(0).toUpperCase() + r.label.slice(1)}: <b>{pm(v.measured, v.sigma)} {v.unit}</b>, drawn {v.truth.toPrecision(4)} ({z.toFixed(1)}σ)
              </li>
            );
          })}
        </ul>
      )}
      {wonder && <p className={styles.finding}>{sealed.wonderStory}</p>}
      {draw.verdict === "miss" && sealed.driveNote && <p className={styles.finding}>{sealed.driveNote}</p>}
      <p className={styles.finding}>
        Drawn by <a href={draw.url}>drand round {draw.round}</a>; its hash was pushed to GitHub before the clip was rendered (<a href={draw.sealUrl}>commit {draw.seal}</a>, set {draw.set}) and the law revealed after the run (<a href={draw.revealUrl}>commit {draw.reveal}</a>). {rows.some((r) => r.si) ? "Lengths are in pixels in the run, which found no ruler; the metre values use the render’s own scale. " : ""}
        <a href="/proof#sealed">All {sealed.n} draws, the rule for “found”, and what the seal does not prove</a>.
      </p>
      <details className={styles.more}>
        <summary>The referee&rsquo;s own summary of this run, written before the law was revealed</summary>
        <p className={styles.finding}>{fmtProse(e.finding, {})}</p>
      </details>
    </>
  );
}

import type { Experiment } from "@/lib/experiment";
import { slitOf } from "./strip";
import styles from "./MoonPairCard.module.css";

type JumpFit = { f0: number; f1: number; px?: [number, number, number][] };

/**
 * The home gallery's first plate: the Apollo broadcast (A) and the copy we slowed in secret (B) as one A/B print, on
 * one clock, so B's strip runs longer by exactly the slowdown. Each jump in A is joined to the same jump in B, its
 * helmet track and fitted fall drawn on both, and the jump-for-jump slowdown sits in the room A leaves empty. On hover
 * or focus of the card both strips re-develop on the same wall clock, so B is visibly still running when A has ended.
 * Returns null unless both strips and the same-jump measurement exist.
 */
export default function MoonPairCard({ a, b }: { a: Experiment; b: Experiment }) {
  const sj = a.extras?.memoryTest?.sameJump;
  const mA = slitOf(a.id), mB = slitOf(b.id);
  if (!sj || !mA || !mB) return null;
  const truth = a.extras?.speedTest?.truth;
  const maxS = Math.max(mA.duration, mB.duration);
  // three times the clips' speed on hover, as on the other cards
  const fast = maxS / 3;
  const rows = [
    { key: "A", e: a, meta: mA, fit: (j: (typeof sj.jumps)[number]) => j.real as unknown as JumpFit },
    { key: "B", e: b, meta: mB, fit: (j: (typeof sj.jumps)[number]) => j.slowed as unknown as JumpFit },
  ];
  const tOf = (meta: typeof mA, f: number) => ((f + 0.5) / meta.frames) * meta.duration;
  const links = sj.jumps.map((j) => {
    const A = j.real as unknown as JumpFit, B = j.slowed as unknown as JumpFit;
    const x = [tOf(mA, A.f0), tOf(mA, A.f1), tOf(mB, B.f1), tOf(mB, B.f0)].map((t) => (t / maxS) * 1000);
    return { n: j.jump, ratio: j.ratio, x };
  });
  return (
    <div className={styles.pair} style={{ ["--fast" as string]: `${fast.toFixed(3)}s` }}>
      {rows.map((r, k) => {
        const W = r.meta.frames * r.meta.slice, H = r.meta.height;
        const X = (f: number) => (f + 0.5) * r.meta.slice;
        const jumps = sj.jumps.map((j) => r.fit(j)).filter((p) => p.px?.length);
        return (
          <div key={r.key} className={styles.row} style={{ ["--w" as string]: `${((r.meta.duration / maxS) * 100).toFixed(2)}%`, ["--dur" as string]: `${((r.meta.duration / maxS) * fast).toFixed(3)}s` }}>
            <div className={styles.strip}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className={styles.latent} src={`/slits/${r.e.id}.webp`} alt="" decoding="async" />
              <span className={styles.develop}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/slits/${r.e.id}.webp`} alt={`${r.key}: photo-finish of the ${r.key === "A" ? "broadcast" : "slowed copy"}, one slice per frame through the astronaut`} decoding="async" />
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                  {jumps.map((j, i) => {
                    const d = j.px!.map(([f, , fy], q) => `${q ? "L" : "M"}${X(f).toFixed(1)} ${fy.toFixed(1)}`).join("");
                    return (
                      <g key={i}>
                        <path d={d} className={styles.halo} vectorEffect="non-scaling-stroke" />
                        <path d={d} className={styles.law} vectorEffect="non-scaling-stroke" />
                      </g>
                    );
                  })}
                  {jumps.flatMap((j) => j.px!.filter((_, q) => q % 2 === 0).map(([f, y]) => <circle key={`${j.f0}-${f}`} cx={X(f)} cy={y} r={H / 70} className={styles.dot} />))}
                </svg>
              </span>
              <b className={styles.key}>{r.key}</b>
            </div>
            {k === 0 && (
              <span className={styles.badge}>
                <strong>
                  {sj.combined.ratio.toFixed(3)} ± {sj.combined.sigma.toFixed(3)}×
                </strong>
                <span>B slower, jump for jump{truth ? ` · truth ${truth}×` : ""}</span>
              </span>
            )}
            {k === 0 && (
              <div className={styles.lane} aria-hidden="true">
                <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
                  {links.map((l) => (
                    <g key={l.n}>
                      <polygon points={`${l.x[0]},0 ${l.x[1]},0 ${l.x[2]},100 ${l.x[3]},100`} />
                      <line x1={l.x[0]} y1={0} x2={l.x[3]} y2={100} vectorEffect="non-scaling-stroke" />
                      <line x1={l.x[1]} y1={0} x2={l.x[2]} y2={100} vectorEffect="non-scaling-stroke" />
                    </g>
                  ))}
                </svg>
                {links.map((l) => (
                  <em key={l.n} style={{ left: `${((l.x[0] + l.x[1] + l.x[2] + l.x[3]) / 4 / 10).toFixed(2)}%` }}>
                    {l.ratio.toFixed(2)}×
                  </em>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

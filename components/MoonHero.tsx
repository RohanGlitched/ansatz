import Link from "next/link";
import type { Experiment } from "@/lib/experiment";
import { toPixels } from "@/lib/pixels";
import slits from "@/data/slits.json";
import styles from "./MoonHero.module.css";

type Slit = { slice: number; x: number; frames: number; height: number; fps: number; duration: number };

/**
 * The home page's first screen: a photo-finish of the Moon. One thin slice through John Young from every frame of the
 * 1972 broadcast, laid side by side, so his two jumps draw their own arches in real pixels; beneath it, the same clip
 * slowed 1.5× in secret, 1.5× longer on the same clock. On each, what SAM 3.1 measured and the law that won.
 */
export default function MoonHero({ e, slowed }: { e: Experiment; slowed?: Experiment | null }) {
  const g = e.comparisons.find((x) => x.param === "g");
  const mt = e.extras?.memoryTest;
  const st = e.extras?.speedTest;
  const ratio = mt ? Math.sqrt(mt.rows[0].g / mt.rows[1].g) : NaN;
  const maxS = Math.max(...Object.values(slits as Record<string, Slit>).map((s) => s.duration));
  const strips = [
    { id: "moon-jump", e, title: "Apollo 16, as broadcast", verdict: g ? `${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s²: real speed` : "" },
    ...(slowed ? [{ id: "moon-jump-slowed", e: slowed, title: "The same clip, slowed 1.5× in secret", verdict: mt ? `${mt.rows[1].g.toFixed(2)} ± ${mt.rows[1].sigma.toFixed(2)} m/s²: runs ${ratio.toFixed(2)}× slow` : "" }] : []),
  ];
  return (
    <section className={styles.hero}>
      <div className={`wrap ${styles.head}`}>
        <h1>Film anything that moves. Ansatz finds the law that moves it.</h1>
        <div className={styles.intro}>
          <p className={styles.lede}>
            Below, every frame of John Young’s 1972 jump on the Moon, cut to one thin slice and laid side by side: his two jumps draw their own arches. The second strip is the same clip, slowed 1.5× in secret. Shown one clip at a time, a language model gives both the same answer. Ansatz measures each, and tells them apart.
          </p>
          <div className={styles.cta}>
            <Link className="btn" href="/new">
              Run an experiment
            </Link>
            <Link className="btn ghost" href="/x/moon-jump">
              Open the Moon experiment
            </Link>
          </div>
        </div>
      </div>

      <figure className={`wrap ${styles.plate}`}>
        <div className={styles.ruler} aria-hidden="true">
          {Array.from({ length: Math.floor(maxS) + 1 }, (_, s) => (
            <span key={s} style={{ left: `${(s / maxS) * 100}%` }}>
              {s === 0 ? "0 s" : s}
            </span>
          ))}
        </div>
        {strips.map((s) => {
          const meta = (slits as Record<string, Slit>)[s.id];
          const m = s.e.measured;
          const W = meta.frames * meta.slice, H = meta.height;
          const win = s.e.candidates.find((c) => c.law.id === s.e.winner) ?? s.e.candidates[0];
          const law = toPixels(win.fit.predicted, m);
          const pos = (f: number, y: number) => ({ left: `${((f + 0.5) * meta.slice / W) * 100}%`, top: `${(y / H) * 100}%` });
          const lawPath = m.px.map((p, i) => (law[i] ? `${i ? "L" : "M"}${((p.f + 0.5) * meta.slice).toFixed(1)} ${law[i].y.toFixed(1)}` : "")).join("");
          return (
            <div key={s.id} className={styles.stripRow}>
              <Link href={`/x/${s.id}`} className={styles.strip} style={{ width: `${(meta.duration / maxS) * 100}%` }} aria-label={`${s.title}: slit-scan of every frame`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/slits/${s.id}.webp`} alt="" />
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                  <path d={lawPath} className={styles.law} vectorEffect="non-scaling-stroke" />
                </svg>
                {m.px.map((p, i) => (
                  <i key={i} className={styles.dot} style={pos(p.f, p.y)} />
                ))}
              </Link>
              <figcaption className={styles.cap}>
                <strong>{s.title}</strong>
                <span>{meta.duration.toFixed(1)} s of playback</span>
                <span className={styles.verdict}>Ansatz: {s.verdict}</span>
              </figcaption>
            </div>
          );
        })}
        <p className={styles.legend}>
          <span>
            <i className={styles.kDot} /> the helmet top, measured by SAM 3.1 in each frame
          </span>
          <span>
            <i className={styles.kLaw} /> the law that won
          </span>
        </p>
      </figure>

      {mt && (
        <div className={`wrap ${styles.lower}`}>
          <table className={styles.memory}>
            <thead>
              <tr>
                <th />
                <th>Muse Spark, one clip at a time</th>
                <th>Ansatz, one clip at a time</th>
              </tr>
            </thead>
            <tbody>
              {mt.rows.map((r, i) => (
                <tr key={r.clip}>
                  <th scope="row">{i === 0 ? "Apollo 16, as broadcast" : "Same clip, slowed 1.5× in secret"}</th>
                  <td>
                    {st ? `${st.single[i].playback_accel} m/s² as played` : r.eye != null ? r.eye.toFixed(2) : "—"}
                    <span className={styles.note}>{st ? (st.single[i].real_speed ? "“real speed”" : `“slowed ${st.single[i].factor}×”`) : "recalled"}</span>
                  </td>
                  <td>
                    <strong className={i === 0 ? styles.big : undefined}>{r.g.toFixed(2)}</strong> ± {r.sigma.toFixed(2)} m/s²
                    {i === 0 ? (
                      <span className={styles.note}>real speed: the Moon is 1.625</span>
                    ) : (
                      <span className={styles.flag}>
                        so it runs {ratio.toFixed(2)}× slow
                        {mt.sameJump ? (
                          <>
                            ; jump for jump, <Link href="/x/moon-jump#same-jump">{mt.sameJump.combined.ratio.toFixed(2)} ± {mt.sameJump.combined.sigma.toFixed(2)}×</Link>
                          </>
                        ) : null}{" "}
                        (it is 1.5×)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {mt.renders && (
                <tr>
                  <th scope="row">
                    <Link href="/proof">3 new renders, slowed {mt.renders.slows.join("×, ")}× in secret</Link>
                  </th>
                  <td>
                    g {mt.renders.eye.map((v) => +v.toPrecision(2)).join(", ")}
                    <span className={styles.note}>Earth’s 9.8, mostly</span>
                  </td>
                  <td>
                    all {mt.renders.slows.length} flagged
                    <span className={styles.flag}>at {mt.renders.clocks.map((v) => v.toFixed(1)).join("×, ")}× (one ruler misread)</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <div className={styles.side}>
            {g && <GravityLine g={g.measured} sigma={g.sigma} slowed={mt.rows[1]} />}
            <p className={styles.sideNote}>Gravity in m/s². Blue: the broadcast, on the Moon’s tick. Orange: the slowed copy, which a fall alone would place on a world with half the Moon’s pull.</p>
            {st && (
              <p className={styles.sideNote}>
                Side by side, Muse Spark can count frames and say B is about {st.pair.factor}× slower. Given Ansatz’s measurements as tools, it answers{" "}
                <Link href="/x/moon-jump#speed-test">{ratio.toFixed(2)}×</Link>, from a ratio that needs no reference value.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/** Where the measurement falls among the worlds it could have been: one glance rules out Earth and Mars. */
function GravityLine({ g, sigma, slowed }: { g: number; sigma: number; slowed?: { g: number; sigma: number } }) {
  const W = 420, L = 8, R = 12, max = 10.5;
  const X = (v: number) => L + (v / max) * (W - L - R);
  const worlds = [
    { name: "Moon", v: 1.62 },
    { name: "Mars", v: 3.71 },
    { name: "Earth", v: 9.81 },
  ];
  return (
    <svg className={styles.line} viewBox={`0 0 ${W} 64`} role="img" aria-label={`The broadcast measured ${g.toFixed(2)} plus or minus ${sigma.toFixed(2)} metres per second squared, on a line from 0 to 10 with the Moon, Mars and Earth marked`}>
      <line x1={L} x2={W - R} y1={30} y2={30} stroke="#3a3f46" strokeWidth="2" />
      {[0, 2, 4, 6, 8, 10].map((v) => (
        <text key={v} x={X(v)} y={60} fontSize="12" textAnchor="middle" fill="#8b929b">
          {v}
        </text>
      ))}
      {worlds.map((w) => (
        <g key={w.name}>
          <line x1={X(w.v)} x2={X(w.v)} y1={22} y2={38} stroke="#b8bec6" strokeWidth="1.5" />
          <text x={X(w.v)} y={14} fontSize="13" textAnchor={w.name === "Moon" ? "start" : "middle"} fill="#b8bec6">
            {w.name}
          </text>
        </g>
      ))}
      {slowed && (
        <g>
          <rect x={X(slowed.g - slowed.sigma)} y={25} width={Math.max(2, X(slowed.g + slowed.sigma) - X(slowed.g - slowed.sigma))} height={10} rx={3} fill="#ff5a1f" opacity="0.35" />
          <circle cx={X(slowed.g)} cy={30} r={4.5} fill="none" stroke="#ff5a1f" strokeWidth="2" />
        </g>
      )}
      <rect x={X(g - sigma)} y={25} width={Math.max(2, X(g + sigma) - X(g - sigma))} height={10} rx={3} fill="#8fa0ff" opacity="0.45" />
      <circle cx={X(g)} cy={30} r={5} fill="#8fa0ff" />
    </svg>
  );
}

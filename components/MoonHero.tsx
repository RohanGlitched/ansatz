import Link from "next/link";
import type { Experiment } from "@/lib/experiment";
import { toPixels } from "@/lib/pixels";
import slits from "@/data/slits.json";
import ReplayScope from "./ReplayScope";
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
    ...(slowed ? [{ id: "moon-jump-slowed", e: slowed, title: "The same clip, slowed 1.5× in secret", verdict: mt?.sameJump ? `${mt.rows[1].g.toFixed(2)} ± ${mt.rows[1].sigma.toFixed(2)} m/s²; jump for jump it runs ${mt.sameJump.combined.ratio.toFixed(3)} ± ${mt.sameJump.combined.sigma.toFixed(3)}× slow` : mt ? `${mt.rows[1].g.toFixed(2)} ± ${mt.rows[1].sigma.toFixed(2)} m/s²: runs ${ratio.toFixed(2)}× slow` : "" }] : []),
  ];
  // both jumps, measured the same way in both clips: helmet-top pixels and the fitted parabola, frame by frame
  const jumpsOf = (id: string) => mt?.sameJump?.jumps.map((j) => ({ n: j.jump, ratio: j.ratio, px: (id === "moon-jump" ? j.real : j.slowed) as unknown as { px?: [number, number, number][] } })) ?? [];
  return (
    <section className={styles.hero}>
      <div className={`wrap ${styles.head}`}>
        <h1>
          From 1972 television, Ansatz measured the Moon’s gravity{g ? `: ${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s²` : ""}.
        </h1>
        <div className={styles.intro}>
          <p className={styles.tagline}>Film anything that moves. Ansatz finds the law that moves it.</p>
          <p className={styles.lede}>
            The true value is 1.625. Below, every frame of John Young’s jump cut to one thin slice and laid side by side, so his two jumps draw their own arches; under it, the same clip slowed 1.5× in secret. Shown one clip at a time, a language model gives both the same answer. Ansatz measures each, and tells them apart.
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
        <ReplayScope className={styles.scan} buttonClassName={styles.replay} label="Play both clips again">
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
          // each mark appears when the scan reaches its frame, at the clip's own playback speed
          const at = (f: number) => `${(((f + 0.5) / meta.frames) * meta.duration).toFixed(3)}s`;
          const pos = (f: number, y: number) => ({ left: `${((f + 0.5) * meta.slice / W) * 100}%`, top: `${(y / H) * 100}%`, ["--d" as string]: at(f) });
          const jumps = jumpsOf(s.id).filter((j) => j.px.px?.length);
          const X = (f: number) => ((f + 0.5) * meta.slice).toFixed(1);
          const dots = jumps.length ? jumps.flatMap((j) => j.px.px!.map(([f, y]) => ({ f, y }))) : m.px.map((p) => ({ f: p.f, y: p.y }));
          const lawPaths = jumps.length
            ? jumps.map((j) => j.px.px!.map(([f, , fy], i) => `${i ? "L" : "M"}${X(f)} ${fy.toFixed(1)}`).join(""))
            : [m.px.map((p, i) => (law[i] ? `${i ? "L" : "M"}${X(p.f)} ${law[i].y.toFixed(1)}` : "")).join("")];
          const apexes = jumps.map((j) => {
            const top = j.px.px!.reduce((a, b) => (b[2] < a[2] ? b : a));
            const last = j.px.px![j.px.px!.length - 1][0];
            return { n: j.n, left: `${(((top[0] + 0.5) * meta.slice) / W) * 100}%`, top: `${(top[2] / H) * 100}%`, d: at(last) };
          });
          return (
            <div key={s.id} className={styles.stripRow}>
              <div className={styles.still} aria-hidden="true">
                <video src={s.e.source.video} poster={`/slits/${s.id}-still.webp`} muted playsInline preload="auto" />
                <i style={{ left: `${((meta.x + meta.slice / 2) / s.e.video.width) * 100}%` }} />
              </div>
              <Link href={`/x/${s.id}`} className={styles.strip} style={{ width: `${(meta.duration / maxS) * 100}%`, ["--dur" as string]: `${meta.duration}s` }} aria-label={`${s.title}: slit-scan of every frame`}>
                <span className={styles.develop}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/slits/${s.id}.webp`} alt="" />
                {dots.map((p, i) => (
                  <i key={i} className={styles.dot} style={pos(p.f, p.y)} />
                ))}
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                  {lawPaths.map((d, i) => (
                    <g key={i}>
                      <path d={d} className={styles.lawHalo} vectorEffect="non-scaling-stroke" />
                      <path d={d} className={styles.law} vectorEffect="non-scaling-stroke" />
                    </g>
                  ))}
                </svg>
                {apexes.map((a) => (
                  <span key={a.n} className={styles.jumpTag} style={{ left: a.left, top: a.top, ["--d" as string]: a.d }}>
                    jump {a.n}
                  </span>
                ))}
                </span>
                <b className={styles.scanLine} aria-hidden="true" />
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
            <i className={styles.kSlit} /> where each frame is cut: one column, 4 pixels wide, laid beside the next
          </span>
          <span>
            <i className={styles.kDot} /> the helmet top, measured by SAM 3.1 in each airborne frame of both jumps
          </span>
          <span>
            <i className={styles.kLaw} /> the fitted fall
          </span>
        </p>
        </ReplayScope>
      </figure>

      {mt && (
        <div className={`wrap ${styles.lower}`}>
          <div>
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
                            ; jump for jump, <Link href="/x/moon-jump#same-jump">{mt.sameJump.combined.ratio.toFixed(3)} ± {mt.sameJump.combined.sigma.toFixed(3)}×</Link>
                          </>
                        ) : null}{" "}
                        (it is 1.5×)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {st && (
            <p className={styles.punch}>
              Same frames, same ruler: Muse Spark’s estimate of the fall in the broadcast was {st.single[0].playback_accel} m/s², about {Math.round(mt.rows[0].g / Number(st.single[0].playback_accel))}× too small, so it called the real broadcast slowed. SAM 3.1 measured it.
            </p>
          )}
          </div>
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

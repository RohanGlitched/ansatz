import Link from "next/link";
import type { Experiment } from "@/lib/experiment";
import { toPixels } from "@/lib/pixels";
import ReplayScope from "./ReplayScope";
import { slitOf } from "./strip";
import styles from "./MoonHero.module.css";

type Repeat = { playback_accel: number; real_speed: boolean; factor: number };

const word = (k: number) => ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][k] ?? String(k);
const times = (k: number) => (k === 1 ? "once" : k === 2 ? "twice" : `${word(k)} times`);
/** a list of a model's answers, most common first: "1.6 three times, 0.4 twice" */
const answersOf = (a: Repeat[]) => {
  const by = new Map<number, number>();
  a.forEach((x) => by.set(x.playback_accel, (by.get(x.playback_accel) ?? 0) + 1));
  return [...by].sort((p, q) => q[1] - p[1]).map(([v, k]) => `${v} ${times(k)}`).join(", ");
};
const rangeOf = (a: Repeat[]) => {
  const v = a.map((x) => x.playback_accel);
  const lo = Math.min(...v), hi = Math.max(...v);
  return lo === hi ? `${lo}` : `${lo} to ${hi}`;
};

/**
 * The home page's first screen: a photo-finish of the Moon. One thin slice through John Young from every frame of the
 * 1972 broadcast, laid side by side, so his two jumps draw their own arches in real pixels; beneath it, the same clip
 * slowed in secret, longer on the same clock. Both develop at their clip's own playback speed beside the playing clip.
 * Every mark that lands is measured: each jump joined to the same jump in the other clip with its ratio, the moment
 * the broadcast ends, the extra seconds the slowed copy runs, and the jump-for-jump slowdown with the truth beside it.
 */
export default function MoonHero({ e, slowed }: { e: Experiment; slowed?: Experiment | null }) {
  const g = e.comparisons.find((x) => x.param === "g");
  const mt = e.extras?.memoryTest;
  const st = e.extras?.speedTest;
  const rp = st?.repeats;
  const sj = mt?.sameJump;
  const truth = st?.truth;
  const ratio = mt ? Math.sqrt(mt.rows[0].g / mt.rows[1].g) : NaN;
  const metaA = slitOf("moon-jump")!;
  const metaB = slowed ? slitOf("moon-jump-slowed") : undefined;
  const durA = metaA.duration, durB = metaB?.duration ?? durA;
  const maxS = Math.max(durA, durB);
  const a = durA / maxS;
  const pct = (x: number) => `${(x * 100).toFixed(3)}%`;
  const sec = (x: number) => x.toFixed(3);
  // the one-clip question, asked repeatedly: how often the model called each clip what it isn't
  const repA = rp?.clips.find((c) => c.clip === "A"), repB = rp?.clips.find((c) => c.clip === "B");
  const wrongB = repB ? repB.answers.filter((x) => x.real_speed).length : 0;
  const strips = [
    { id: "moon-jump", e, meta: metaA, key: "A", title: "Apollo 16, as broadcast", verdict: g ? `${g.measured.toFixed(2)} ± ${g.sigma.toFixed(2)} m/s², real speed` : "" },
    ...(slowed && metaB ? [{ id: "moon-jump-slowed", e: slowed, meta: metaB, key: "B", title: `The same clip, slowed ${truth ?? ""}${truth ? "× " : ""}in secret`, verdict: mt ? `${mt.rows[1].g.toFixed(2)} ± ${mt.rows[1].sigma.toFixed(2)} m/s² as played` : "" }] : []),
  ];
  // both jumps, measured the same way in both clips: helmet-top pixels and the fitted parabola, frame by frame
  const jumpsOf = (id: string) => sj?.jumps.map((j) => ({ n: j.jump, ratio: j.ratio, px: (id === "moon-jump" ? j.real : j.slowed) as unknown as { px?: [number, number, number][]; f0: number; f1: number } })) ?? [];
  // a frame's moment on the shared clock
  const tA = (f: number) => ((f + 0.5) / metaA.frames) * durA;
  const tB = (f: number) => (metaB ? ((f + 0.5) / metaB.frames) * durB : 0);
  const links = slowed && metaB && sj ? sj.jumps.map((j) => {
    const A = j.real as unknown as { f0: number; f1: number }, B = j.slowed as unknown as { f0: number; f1: number };
    const x = [tA(A.f0), tA(A.f1), tB(B.f1), tB(B.f0)].map((t) => t / maxS);
    return { n: j.jump, ratio: j.ratio, x, at: tB(B.f1) };
  }) : [];
  const seconds = Array.from({ length: Math.floor(maxS) + 1 }, (_, s) => s);
  const extra = durB - durA;

  return (
    <section className={styles.hero}>
      <div className={`wrap ${styles.head}`}>
        <p className={styles.tagline}>Film anything that moves. Ansatz finds the law that moves it.</p>
        <h1>
          From 1972 television, SAM 3.1 tracked every frame and Ansatz measured the Moon’s gravity{g ? `: ${g.measured.toFixed(2)}\u00a0±\u00a0${g.sigma.toFixed(2)}\u00a0m/s²` : ""}.
        </h1>
        <div className={styles.intro}>
          <p className={styles.lead}>Is this footage real time? Muse Spark, watching alone, can’t tell. With SAM 3.1 measuring every frame, the clips come apart.</p>
          <p className={styles.lede}>
            {g ? `The true value is ${g.reference}. ` : ""}Below, every frame of John Young’s jump cut to one thin slice and laid side by side, so his two jumps draw their own arches; under it, the same clip slowed {truth ? `${truth}× ` : ""}in secret.{" "}
            {repB && rp
              ? `Asked ${word(rp.n)} times about the slowed copy alone, Muse Spark called it real speed ${wrongB === rp.n ? "every time" : `${wrongB} of ${rp.n} times`}. `
              : "Shown one clip at a time, a language model gives both the same answer. "}
            SAM 3.1 times every fall, Muse Spark recognises the Moon and proposes the laws, code fits them with the astronaut’s height (1.88 m, given by us) as the ruler, and the two clips come apart by exactly the slowdown.
          </p>
          <div className={styles.cta}>
            <Link className="btn" href="/new">
              Run an experiment
            </Link>
            <Link className="btn ghost" href="/x/moon-jump">
              Open the Moon experiment
            </Link>
            <Link className={styles.judging} href="/judges">
              Judging? Start here (3 minutes)
            </Link>
          </div>
        </div>
      </div>

      <figure className={`wrap ${styles.plate}`}>
        <ReplayScope className={styles.scan} buttonClassName={styles.replay} label="Play both clips again">
          <div className={styles.body} style={{ ["--a" as string]: a.toFixed(4), ["--tA" as string]: sec(durA), ["--tB" as string]: sec(durB), ["--max" as string]: sec(maxS) }}>
            <div className={styles.stills} aria-hidden="true">
              {strips.map((s) => (
                <div key={s.id} className={styles.still}>
                  <video src={s.e.source.video} data-clip={s.id} poster={`/slits/${s.id}-still.webp`} muted playsInline preload="metadata" />
                  <i style={{ left: `${(((s.meta.x ?? 0) + s.meta.slice / 2) / (s.e.video.codedWidth ?? s.e.video.width)) * 100}%` }} />
                  <span className={styles.stillCap}>
                    {s.key}, {s.key === "A" ? "as broadcast" : "slowed"}: the orange line is the column cut from every frame
                  </span>
                </div>
              ))}
            </div>

            <p className={`${styles.cap} ${styles.capA}`}>
              <strong>A · {strips[0].title}</strong>
              <span>{durA.toFixed(1)} s of playback</span>
              {strips[0].verdict && (
                <span className={styles.verdict} data-t={sec(durA)}>
                  Ansatz: {strips[0].verdict}
                </span>
              )}
            </p>

            <div className={styles.stack}>
              {strips.map((s, k) => {
                const meta = s.meta;
                const m = s.e.measured;
                const W = meta.frames * meta.slice, H = meta.height;
                const win = s.e.candidates.find((c) => c.law.id === s.e.winner) ?? s.e.candidates[0];
                const law = toPixels(win.fit.predicted, m);
                const at = (f: number) => ((f + 0.5) / meta.frames).toFixed(4);
                const pos = (f: number, y: number) => ({ left: `${(((f + 0.5) * meta.slice) / W) * 100}%`, top: `${(y / H) * 100}%` });
                const jumps = jumpsOf(s.id).filter((j) => j.px.px?.length);
                const X = (f: number) => ((f + 0.5) * meta.slice).toFixed(1);
                const dots = jumps.length ? jumps.flatMap((j) => j.px.px!.map(([f, y]) => ({ f, y }))) : m.px.map((p) => ({ f: p.f, y: p.y }));
                const lawPaths = jumps.length
                  ? jumps.map((j) => j.px.px!.map(([f, , fy], i) => `${i ? "L" : "M"}${X(f)} ${fy.toFixed(1)}`).join(""))
                  : [m.px.map((p, i) => (law[i] ? `${i ? "L" : "M"}${X(p.f)} ${law[i].y.toFixed(1)}` : "")).join("")];
                const apexes = jumps.map((j) => {
                  const top = j.px.px!.reduce((p, q) => (q[2] < p[2] ? q : p));
                  const last = j.px.px![j.px.px!.length - 1][0];
                  return { n: j.n, left: `${(((top[0] + 0.5) * meta.slice) / W) * 100}%`, top: `${(top[2] / H) * 100}%`, at: at(last) };
                });
                return (
                  <div key={s.id} className={styles.row}>
                    <Link
                      href={`/x/${s.id}`}
                      className={styles.strip}
                      data-track=""
                      data-dur={sec(meta.duration)}
                      data-clip={s.id}
                      style={{ width: pct(meta.duration / maxS) }}
                      aria-label={`${s.title}: slit-scan of every frame`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className={styles.latent} src={`/slits/${s.id}.webp`} alt="" />
                      <span className={styles.develop}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/slits/${s.id}.webp`} alt="" />
                        {dots.map((p, i) => (
                          <i key={i} className={styles.dot} data-at={at(p.f)} style={pos(p.f, p.y)} />
                        ))}
                        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
                          {lawPaths.map((d, i) => (
                            <g key={i}>
                              <path d={d} className={styles.lawHalo} vectorEffect="non-scaling-stroke" />
                              <path d={d} className={styles.law} vectorEffect="non-scaling-stroke" />
                            </g>
                          ))}
                        </svg>
                        {apexes.map((x) => (
                          <span key={x.n} className={styles.jumpTag} data-at={x.at} style={{ left: x.left, top: x.top }}>
                            jump {x.n}
                          </span>
                        ))}
                      </span>
                      <b className={styles.scanLine} aria-hidden="true" />
                    </Link>
                    {k === 0 && slowed && (
                      <div className={styles.aside}>
                        <span className={styles.endNote} data-t={sec(durA)}>
                          A ends at {durA.toFixed(1)} s
                        </span>
                        {sj && (
                          <span className={styles.badge} data-t={sec(durB)}>
                            <strong>
                              {sj.combined.ratio.toFixed(3)} ± {sj.combined.sigma.toFixed(3)}×
                            </strong>
                            <span>B is slower, jump for jump{truth ? ` · truth ${truth}×` : ""}</span>
                          </span>
                        )}
                      </div>
                    )}
                    {k === 0 && links.length > 0 && (
                      <div className={styles.lane} aria-hidden="true">
                        {links.map((l) => (
                          <span key={l.n} className={styles.link} data-t={sec(l.at)}>
                            <svg viewBox="0 0 1000 100" preserveAspectRatio="none">
                              <polygon points={`${l.x[0] * 1000},0 ${l.x[1] * 1000},0 ${l.x[2] * 1000},100 ${l.x[3] * 1000},100`} />
                              <line x1={l.x[0] * 1000} y1={0} x2={l.x[3] * 1000} y2={100} vectorEffect="non-scaling-stroke" />
                              <line x1={l.x[1] * 1000} y1={0} x2={l.x[2] * 1000} y2={100} vectorEffect="non-scaling-stroke" />
                            </svg>
                            <em style={{ left: pct((l.x[0] + l.x[1] + l.x[2] + l.x[3]) / 4) }}>
                              jump {l.n}: {l.ratio.toFixed(2)}×
                            </em>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div className={styles.ruler} aria-hidden="true">
                {seconds.map((s) => (
                  <span key={s} style={{ left: pct(s / maxS) }}>
                    {s === 0 ? "0 s" : s}
                  </span>
                ))}
                {slowed && extra > 0 && (
                  <>
                    <b className={styles.bracket} />
                    <em className={styles.bracketLabel} data-t={sec(durB)} style={{ left: pct((durA + durB) / 2 / maxS) }}>
                      +{extra.toFixed(1)} s
                    </em>
                  </>
                )}
              </div>
              {slowed && <i className={styles.endTick} data-t={sec(durA)} aria-hidden="true" />}
            </div>

            {strips[1] && (
              <p className={`${styles.cap} ${styles.capB}`}>
                <strong>B · {strips[1].title}</strong>
                <span>{durB.toFixed(1)} s of playback</span>
                {repB && rp && (
                  <span className={styles.muse}>
                    Muse Spark, shown B alone {word(rp.n)} times: <s data-t={sec(durB)}>“real speed”, {wrongB} of {rp.n}</s>
                  </span>
                )}
                {strips[1].verdict && (
                  <span className={styles.verdict} data-t={sec(durB)}>
                    Ansatz: {strips[1].verdict}
                  </span>
                )}
              </p>
            )}
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
              {links.length > 0 && (
                <span>
                  <i className={styles.kLink} /> the same jump in both clips, and how much longer it takes in B
                </span>
              )}
            </p>
          </div>
        </ReplayScope>
      </figure>

      {mt && (
        <div className={`wrap ${styles.lower}`}>
          <div>
            <table className={styles.memory}>
              <thead>
                <tr>
                  <th />
                  <th>Muse Spark, one clip at a time{rp ? `, asked ${rp.n} times` : ""}</th>
                  <th>Ansatz, one clip at a time</th>
                </tr>
              </thead>
              <tbody>
                {mt.rows.map((r, i) => {
                  const rep = i === 0 ? repA : repB;
                  const n = rep?.answers.length ?? 0;
                  const slowCalls = rep ? rep.answers.filter((x) => !x.real_speed).length : 0;
                  return (
                    <tr key={r.clip}>
                      <th scope="row">{i === 0 ? "Apollo 16, as broadcast" : `Same clip, slowed ${truth ?? ""}${truth ? "× " : ""}in secret`}</th>
                      <td data-label={`Muse Spark, one clip${rp ? `, asked ${rp.n} times` : ""}`}>
                        {rep ? (
                          <>
                            {i === 0 ? `called it slowed ${slowCalls} of ${n} times` : `called it real speed ${n - slowCalls} of ${n} times`}
                            <span className={styles.note}>its fall, in m/s² as played: {answersOf(rep.answers)}</span>
                          </>
                        ) : st ? (
                          <>
                            {st.single[i].playback_accel} m/s² as played
                            <span className={styles.note}>{st.single[i].real_speed ? "“real speed”" : `“slowed ${st.single[i].factor}×”`}</span>
                          </>
                        ) : r.eye != null ? (
                          r.eye.toFixed(2)
                        ) : (
                          "—"
                        )}
                      </td>
                      <td data-label="Ansatz, one clip">
                        <strong className={i === 0 ? styles.big : undefined}>{r.g.toFixed(2)}</strong> ± {r.sigma.toFixed(2)} m/s²
                        {i === 0 ? (
                          <span className={styles.note}>consistent with real speed, if this is the Moon ({g?.reference ?? ""}) and Young is 1.88 m tall</span>
                        ) : (
                          <span className={styles.flag}>
                            {sj ? (
                              <>
                                slower than the broadcast by <Link href="/x/moon-jump#same-jump">{sj.combined.ratio.toFixed(3)} ± {sj.combined.sigma.toFixed(3)}×</Link>, jump for jump
                              </>
                            ) : (
                              <>so it runs {ratio.toFixed(2)}× slow</>
                            )}
                            {truth ? ` (truth ${truth}×)` : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {repB && rp && sj ? (
              <p className={styles.punch}>
                Asked {word(rp.n)} times, Muse Spark called the secretly slowed copy real speed {wrongB === rp.n ? "every time" : `${wrongB} of ${rp.n} times`}, answering {rangeOf(repB.answers)} m/s², the Moon’s textbook value. With SAM 3.1 timing every fall, the same copy measures {sj.combined.ratio.toFixed(3)} ± {sj.combined.sigma.toFixed(3)}× slow, jump for jump{truth ? ` (truth ${truth}×)` : ""}.
              </p>
            ) : (
              st && (
                <p className={styles.punch}>
                  Same frames, same ruler: Muse Spark’s estimate of the fall in the broadcast was {st.single[0].playback_accel} m/s², about {Math.round(mt.rows[0].g / Number(st.single[0].playback_accel))}× too small, so it called the real broadcast slowed. SAM 3.1 measured it.
                </p>
              )
            )}
          </div>
          <div className={styles.side}>
            {g && <GravityLine g={g.measured} sigma={g.sigma} slowed={mt.rows[1]} />}
            <p className={styles.sideNote}>Gravity in m/s². Blue: the broadcast, on the Moon’s tick. Orange: the slowed copy, which a fall alone would place on a world with half the Moon’s pull.</p>
            {st && (
              <p className={styles.sideNote}>
                Side by side, Muse Spark can count frames and say B is about {st.pair.factor}× slower. Given SAM 3.1’s measurements as tools, Muse Spark answers{" "}
                <Link href="/x/moon-jump#speed-test">{ratio.toFixed(2)}× (the ratio of the two whole runs)</Link>, which needs no reference value.
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

import Link from "next/link";
import type { Experiment } from "@/lib/experiment";
import styles from "./MoonHero.module.css";

/**
 * The home page's first screen: the 1972 clip beside what Ansatz made of it, the helmet's height against time,
 * the lunar arc that fits it, and the same take-off on Earth. One glance says why this can only be the Moon.
 */
export default function MoonHero({ e }: { e: Experiment }) {
  const m = e.measured;
  const k = m.calibration.metresPerPixel;
  const t0 = m.series.t[0] ?? 0;
  const pts = m.px.map((p, i) => ({ t: (m.series.t[i] ?? 0) - t0, h: (m.px[0].y - p.y) * k }));
  // least-squares parabola through the measured heights: h = a + b t + c t²
  const S = [0, 0, 0, 0, 0], Y = [0, 0, 0];
  for (const p of pts) {
    const q = [1, p.t, p.t ** 2, p.t ** 3, p.t ** 4];
    for (let i = 0; i < 5; i++) S[i] += q[i];
    for (let i = 0; i < 3; i++) Y[i] += q[i] * p.h;
  }
  const M = [[S[0], S[1], S[2]], [S[1], S[2], S[3]], [S[2], S[3], S[4]]];
  const det = (A: number[][]) => A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]);
  const D = det(M) || 1;
  const sol = [0, 1, 2].map((j) => det(M.map((row, i) => row.map((v, c) => (c === j ? Y[i] : v)))) / D);
  const [a, b, c] = sol;
  const g = e.comparisons.find((x) => x.param === "g");
  const mt = e.extras?.memoryTest;
  const tEnd = Math.max(...pts.map((p) => p.t)) * 1.05;
  const hMax = Math.max(0.05, ...pts.map((p) => p.h)) * 1.25;
  const W = 640, H = 380, L = 46, R = 16, T = 18, B = 34;
  const X = (t: number) => L + (t / tEnd) * (W - L - R);
  const Yp = (h: number) => T + (1 - (h + 0.02) / (hMax + 0.02)) * (H - T - B);
  const curve = (f: (t: number) => number, until = tEnd) => {
    let d = "";
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * until;
      const h = f(t);
      if (h < -0.02) break;
      d += `${i ? "L" : "M"}${X(t).toFixed(1)} ${Yp(h).toFixed(1)}`;
    }
    return d;
  };
  const moon = (t: number) => a + b * t + c * t * t;
  const earth = (t: number) => a + b * t - 0.5 * 9.81 * t * t;
  const tEarthLand = (b + Math.sqrt(b * b + 2 * 9.81 * a)) / 9.81;
  const ticksT = [0, 0.25, 0.5, 0.75, 1, 1.25, 1.5].filter((x) => x <= tEnd);
  const ticksH = [0, 0.1, 0.2, 0.3, 0.4, 0.5].filter((x) => x <= hMax);

  return (
    <section className={styles.hero}>
      <div className={`wrap ${styles.grid}`}>
        <div className={styles.text}>
          <h1>Film anything that moves. Ansatz finds the law that moves it.</h1>
          <p className="lede">
            Show a language model up to 300 frames of this 1972 clip and it recites the Moon’s textbook gravity, even after we secretly slow the clip down. Ansatz measures it, frame by frame, with SAM 3.1 and Muse Spark, and only the measurement notices.
          </p>
          {mt ? (
            <table className={styles.memory}>
              <thead>
                <tr>
                  <th />
                  <th>Muse Spark, by eye</th>
                  <th>Ansatz, measured</th>
                </tr>
              </thead>
              <tbody>
                {mt.rows.map((r, i) => (
                  <tr key={r.clip}>
                    <th scope="row">{i === 0 ? "Apollo 16, 1972" : "Same clip, secretly slowed 1.5×"}</th>
                    <td className="num">
                      {r.eye != null ? r.eye.toFixed(2) : "—"}
                      <span className={styles.note}>{i === 0 ? "the textbook, recalled" : "the textbook again"}</span>
                    </td>
                    <td className="num">
                      <strong className={i === 0 ? styles.num : undefined}>{r.g.toFixed(2)}</strong> ± {r.sigma.toFixed(2)}
                      {i > 0 && <span className={styles.flag}>so the clip runs {Math.sqrt(mt.rows[0].g / r.g).toFixed(2)}× slow (it does: 1.5×)</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            g && (
              <p className={styles.result}>
                <span className={styles.num}>
                  g = {g.measured.toFixed(2)} ± {g.sigma.toFixed(2)} m/s²
                </span>
              </p>
            )
          )}
          {g && <GravityLine g={g.measured} sigma={g.sigma} slowed={mt?.rows[1]} />}
          <p className={styles.ref}>Gravity in m/s². The Moon’s is {g?.reference ?? 1.625}; Earth’s is 9.81.</p>
          <div className={styles.cta}>
            <Link className="btn" href="/new">
              Run an experiment
            </Link>
            <Link className="btn ghost" href="/x/moon-jump">
              Open the Moon experiment
            </Link>
          </div>
        </div>
        <div className={styles.visual}>
          {!mt && (
            <div className={styles.clip}>
              <video src="/showcase/moon-jump.mp4" muted autoPlay loop playsInline aria-label="Apollo 16: John Young's jump salute, April 1972" />
              <span className={styles.caption}>NASA, Apollo 16, 21 April 1972</span>
            </div>
          )}
          <figure className={styles.chart}>
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Height of the astronaut's helmet against time: measured points, the fitted lunar arc, and the same take-off under Earth's gravity">
              {ticksH.map((h) => (
                <g key={`h${h}`}>
                  <line x1={L} x2={W - R} y1={Yp(h)} y2={Yp(h)} stroke="#2a2e34" strokeWidth="1" />
                  <text x={L - 8} y={Yp(h) + 4} fontSize="13" textAnchor="end" fill="#8b929b">
                    {h.toFixed(1)}
                  </text>
                </g>
              ))}
              {ticksT.map((t) => (
                <text key={`t${t}`} x={X(t)} y={H - 12} fontSize="12" textAnchor="middle" fill="#8b929b">
                  {t} s
                </text>
              ))}
              <text x={L - 38} y={T + 2} fontSize="12" fill="#b8bec6">m</text>
              <path d={curve(earth, Math.min(tEnd, tEarthLand))} fill="none" stroke="#e9ebe6" strokeWidth="2" strokeDasharray="6 5" opacity="0.7" />
              <text x={X(Math.min(tEnd, tEarthLand)) + 8} y={Yp(earth(Math.min(tEnd, tEarthLand) * 0.5)) - 4} fontSize="15" fill="#e9ebe6">
                the same jump on Earth: over in {tEarthLand.toFixed(2)} s
              </text>
              <path d={curve(moon)} fill="none" stroke="#8fa0ff" strokeWidth="3" />
              {pts.map((p, i) => (
                <circle key={i} cx={X(p.t)} cy={Yp(p.h)} r="3.2" fill="#ff5a1f" />
              ))}
              <text x={X(tEnd * 0.5)} y={Yp(moon(tEnd * 0.5)) - 16} fontSize="15" fill="#8fa0ff" textAnchor="middle">
                the law that won: the Moon
              </text>
            </svg>
            <figcaption>
              <span className="key">
                <i className="m" /> helmet height, measured by SAM 3.1 in each frame
              </span>
            </figcaption>
          </figure>
          {mt && (
            <div className={styles.pair}>
              {[
                { src: "/showcase/moon-jump.mp4", label: "NASA, Apollo 16, 1972: real speed", href: "/x/moon-jump" },
                { src: "/showcase/moon-jump-slowed.mp4", label: "slowed 1.5× in secret", href: "/x/moon-jump-slowed" },
              ].map((c) => (
                <Link key={c.src} href={c.href} className={styles.pairClip}>
                  <video src={c.src} muted autoPlay loop playsInline preload="metadata" aria-label={`Apollo 16 jump, ${c.label}`} />
                  <span>{c.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
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
    <svg className={styles.line} viewBox={`0 0 ${W} 64`} role="img" aria-label={`The measurement, ${g.toFixed(2)} plus or minus ${sigma.toFixed(2)} metres per second squared, on a line from 0 to 10 with the Moon, Mars and Earth marked`}>
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

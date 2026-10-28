import styles from "./figure.module.css";

/**
 * One measured channel against time, set like a figure in a paper: SAM 3.1's measurements as dots (filled where the
 * laws were fitted, open over the last part no law was fitted to), the winning law as a line in Prussian ink, the
 * runner-up dashed. Server-rendered SVG with a text alternative; prints on white paper as it is.
 */
type Props = {
  t: number[];
  measured: number[];
  law: number[];
  runnerUp?: number[];
  split: number;
  label: string;
  unit: string;
  height?: number;
  /** "the last 30%" label over the shaded part */
  futurePct?: number;
};

export default function SeriesFigure({ t, measured, law, runnerUp, split, label, unit, height = 250, futurePct }: Props) {
  const W = 500, H = height, L = 50, R = 8, T = 34, B = 36;
  const vals = [...measured, ...law].filter(Number.isFinite);
  if (!vals.length || t.length < 2) return null;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad;
  hi += pad;
  const t0 = t[0], t1 = t[t.length - 1];
  const X = (v: number) => L + ((v - t0) / (t1 - t0 || 1)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = (arr: number[]) => {
    let d = "";
    let pen = false;
    arr.forEach((v, i) => {
      if (!Number.isFinite(v) || i >= t.length) {
        pen = false;
        return;
      }
      const y = Math.max(T - 6, Math.min(H - B + 6, Y(v)));
      d += `${pen ? "L" : "M"}${X(t[i]).toFixed(1)} ${y.toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  const ticks = niceTicks(lo, hi, 4);
  const tticks = niceTicks(t0, t1, 4);
  const xs = X(t[split] ?? t1);
  const step = Math.max(1, Math.ceil(measured.length / 150));
  const pct = futurePct ?? Math.round((1 - split / Math.max(1, t.length)) * 100);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.fig} role="img" aria-label={`${label} against time: SAM 3.1's measurements as dots and the winning law as a line; the shaded last ${pct}% was predicted, not fitted`}>
      <defs>
        <clipPath id={`clip-${label}`}>
          <rect x={L} y={T - 6} width={W - L - R} height={H - T - B + 12} />
        </clipPath>
      </defs>
      <rect x={xs} y={T - 6} width={W - R - xs} height={H - T - B + 12} className={styles.future} />
      {ticks.map((v) => (
        <g key={`y${v}`}>
          <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className={styles.grid} />
          <text x={L - 8} y={Y(v) + 5} textAnchor="end" className={styles.tick}>
            {fmt(v)}
          </text>
        </g>
      ))}
      {tticks.map((v) => (
        <text key={`x${v}`} x={X(v)} y={H - 10} textAnchor="middle" className={styles.tick}>
          {fmt(v)} s
        </text>
      ))}
      <text x={L} y={17} className={styles.axis}>
        {label}
        {unit ? ` (${unit})` : ""}
      </text>
      <text x={W - R} y={17} textAnchor="end" className={styles.zone}>
        predicted: the last {pct}%
      </text>
      <line x1={xs} x2={xs} y1={T - 6} y2={H - B + 6} className={styles.cut} />
      <g clipPath={`url(#clip-${label})`}>
        {runnerUp && <path d={line(runnerUp)} className={styles.runner} />}
        <path d={line(law)} className={styles.law} />
        {measured.map((v, i) =>
          i % step === 0 && Number.isFinite(v) && i < t.length ? (
            i < split ? <circle key={i} cx={X(t[i])} cy={Y(v)} r="2.8" className={styles.dot} /> : <circle key={i} cx={X(t[i])} cy={Y(v)} r="3.1" className={styles.ring} />
          ) : null,
        )}
      </g>
    </svg>
  );
}

function niceTicks(lo: number, hi: number, n: number) {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / n;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-12; v += step) out.push(+v.toPrecision(10));
  return out;
}

function fmt(v: number) {
  const a = Math.abs(v);
  if (a < 1e-12) return "0";
  if (a >= 1e5 || a < 1e-5) return v.toExponential(1);
  return String(+v.toPrecision(3)).replace("-", "−");
}

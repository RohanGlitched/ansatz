/**
 * One measured channel against time: SAM's measurements as dots (filled where the law was fitted, open where it had
 * to predict), the winning law as a line, the frames it never saw shaded. Server-rendered SVG with a text alternative.
 * On paper the law is Prussian ink; on a plate (tone="plate") it is white ink, as everywhere in the book.
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
  tone?: "paper" | "plate";
};

export default function SeriesChart({ t, measured, law, runnerUp, split, label, unit, height = 220, tone = "paper" }: Props) {
  const c = tone === "plate" ? PLATE : PAPER;
  const W = 640, H = height, L = 52, R = 14, T = 16, B = 34;
  const vals = [...measured, ...law].filter(Number.isFinite);
  if (!vals.length || t.length < 2) return null;
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08 || 1;
  lo -= pad; hi += pad;
  const t0 = t[0], t1 = t[t.length - 1];
  const X = (v: number) => L + ((v - t0) / (t1 - t0 || 1)) * (W - L - R);
  const Y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = (arr: number[]) => arr.map((v, i) => (Number.isFinite(v) ? `${i ? "L" : "M"}${X(t[i]).toFixed(1)} ${Y(v).toFixed(1)}` : "")).join("");
  const ticks = niceTicks(lo, hi, 4);
  const tticks = niceTicks(t0, t1, 5);
  const xs = X(t[split] ?? t1);
  const step = Math.max(1, Math.ceil(measured.length / 140));
  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${label} over time: measured points and the law's prediction; the shaded part was never shown to the fit`}>
        <defs>
          <pattern id={`hatch-${label}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke={c.law} strokeOpacity={c.hatch} strokeWidth="3" />
          </pattern>
        </defs>
        <rect x={xs} y={T} width={W - R - xs} height={H - T - B} fill={`url(#hatch-${label})`} />
        <line x1={xs} x2={xs} y1={T} y2={H - B} stroke={c.law} strokeWidth="1.5" />
        <text x={xs + 6} y={T + 13} fontSize="12" fill={c.law} fontWeight="600" fontFamily="var(--ui)">never seen by the fit</text>
        {ticks.map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke={c.grid} strokeWidth="0.6" />
            <text x={L - 8} y={Y(v) + 4} fontSize="12" textAnchor="end" fill={c.tick} fontFamily="var(--ui)">{fmt(v)}</text>
          </g>
        ))}
        {tticks.map((v) => (
          <text key={`x${v}`} x={X(v)} y={H - 12} fontSize="12" textAnchor="middle" fill={c.tick} fontFamily="var(--ui)">{fmt(v)} s</text>
        ))}
        <text x={L - 44} y={T + 2} fontSize="12" fill={c.label} fontWeight="600" fontFamily="var(--ui)">{label}{unit ? ` (${unit})` : ""}</text>
        {runnerUp && <path d={line(runnerUp)} fill="none" stroke={c.runner} strokeWidth="1.4" strokeDasharray="5 4" />}
        <path d={line(law)} fill="none" stroke={c.law} strokeWidth="2.2" />
        {measured.map((v, i) =>
          i % step === 0 && Number.isFinite(v) ? (
            i < split ? <circle key={i} cx={X(t[i])} cy={Y(v)} r="2.6" fill={c.measured} /> : <circle key={i} cx={X(t[i])} cy={Y(v)} r="3" fill="none" stroke={c.measured} strokeWidth="1.5" />
          ) : null,
        )}
      </svg>
    </figure>
  );
}

// the book's tokens (app/globals.css), as literal colours so the chart prints and exports the same everywhere
const PAPER = { law: "#163d6e", hatch: 0.14, grid: "#c3ced7", tick: "#43566b", label: "#0f1d2e", runner: "#43566b", measured: "#ff7b2e" };
const PLATE = { law: "#ffffff", hatch: 0.12, grid: "#3f68a0", tick: "#dbe7f3", label: "#eef2f4", runner: "#dbe7f3", measured: "#ff7b2e" };

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
  if (a === 0) return "0";
  if (a >= 1e5 || a < 1e-5) return v.toExponential(1);
  return String(+v.toPrecision(3));
}

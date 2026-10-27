/**
 * A value with its uncertainty the way a lab report writes it: the uncertainty to two significant figures and the
 * value rounded to the same decimal place ("4012 ± 7", "0.8000 ± 0.0021", "1.72 ± 0.11").
 */
export function fmtPair(v: number, s: number): string {
  if (!Number.isFinite(v)) return "—";
  if (!Number.isFinite(s) || s <= 0) return String(+v.toPrecision(4));
  const e = Math.floor(Math.log10(s)) - 1; // the decimal place of s's second significant figure
  const dec = Math.max(0, -e);
  const round = (x: number) => (dec > 0 ? x.toFixed(dec) : String(Math.round(x / 10 ** e) * 10 ** e));
  return `${round(v)} ± ${round(s)}`;
}

/** A plain number to a few significant figures, with no trailing zeros ("9.81", "0.0306"). */
export function fmtSig(v: number | undefined, sig = 3): string {
  if (v === undefined || !Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e5 || a < 1e-6)) return v.toExponential(sig - 1);
  return String(+v.toPrecision(sig));
}

/**
 * One fitted constant as a sentence fragment, keeping three cases apart: a constant that was given (held fixed, not
 * measured), one the frames did not pin down (no finite error bar), and a measurement with its error bar.
 */
export function fmtParam(v: number, s: number, fixed?: boolean): string {
  if (fixed) return `${fmtSig(v, 4)} (given)`;
  if (!Number.isFinite(s) || s <= 0) return `about ${fmtSig(v, 3)}, fitted; not determined by these frames`;
  return fmtPair(v, s);
}

/** A date the way the site writes one: "10 November 2026" (in UTC, so a page reads the same everywhere). */
export function fmtDate(iso: string | number | Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** A signed percentage ("+0.03%", "−4.1%"), with the true minus sign. */
export function fmtSignedPct(p: number | undefined, dec = 1): string {
  if (p === undefined || !Number.isFinite(p)) return "—";
  const s = Math.abs(p).toFixed(dec);
  return `${p >= 0 ? "+" : "−"}${s}%`;
}

const decimalsOf = (t: string) => (t.includes(".") ? t.split(".")[1].length : 0);

/**
 * A model-written sentence with every "value ± error" in it rewritten the way fmtPair writes it. When the pair is a
 * fitted constant (the value matches one to the digits shown, and the error to within a third), the constant's own
 * value and error are used, so "0.8 ± 0.0021 m" becomes "0.7999 ± 0.0021 m"; otherwise digits finer than the error are
 * dropped and nothing is padded.
 */
export function fmtProse(text: string, params: Record<string, { v: number; s: number }> = {}): string {
  return text.replace(/([-−]?)(\d+(?:\.\d+)?)\s*±\s*(\d+(?:\.\d+)?)/g, (all, sign: string, xs: string, ys: string) => {
    const x = (sign ? -1 : 1) * Number(xs), y = Number(ys);
    if (!(y > 0) || !Number.isFinite(x)) return all;
    const half = 0.5 * 10 ** -decimalsOf(xs) * 1.001;
    const hit = Object.values(params).find(({ v, s }) => Number.isFinite(v) && Number.isFinite(s) && s > 0 && (Math.abs(v - x) <= half || Math.abs(Math.abs(v) - Math.abs(x)) <= half) && Math.abs(s - y) <= y / 3 + 0.5 * 10 ** -decimalsOf(ys));
    if (hit) {
      const out = fmtPair(Math.sign(x || 1) * Math.abs(hit.v), hit.s);
      return sign === "−" ? out.replace(/^-/, "−") : out;
    }
    const trimmed = fmtPair(x, y);
    const dec = decimalsOf(trimmed.split(" ± ")[0]);
    return decimalsOf(xs) > dec ? (sign === "−" ? trimmed.replace(/^-/, "−") : trimmed) : all;
  });
}

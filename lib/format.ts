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

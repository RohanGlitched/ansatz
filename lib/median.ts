/** The median of the finite values; for an even count, the mean of the two middle values. */
export function median(a: number[]): number {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2 : NaN;
}

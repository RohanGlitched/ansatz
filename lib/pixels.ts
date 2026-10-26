import type { Measured } from "./measure";

/** Map a law's predicted channels back to pixels for overlays. */
export function toPixels(pred: Record<string, number[]>, m: Pick<Measured, "calibration" | "origin" | "pivot" | "line">): { x: number; y: number }[] {
  const k = m.calibration.metresPerPixel;
  const n = Math.max(...Object.values(pred).map((v) => v.length), 0);
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (pred.x && pred.y) out.push({ x: m.origin.x + pred.x[i] / k, y: m.origin.y - pred.y[i] / k });
    else if (pred.theta && m.pivot) {
      const r = pred.r?.[i] !== undefined ? pred.r[i] / k : m.pivot.r;
      out.push({ x: m.pivot.x + r * Math.sin(pred.theta[i]), y: m.pivot.y + r * Math.cos(pred.theta[i]) });
    } else if (pred.s && m.line) out.push({ x: m.line.x0 + (pred.s[i] / k) * m.line.ux, y: m.line.y0 + (pred.s[i] / k) * m.line.uy });
    else if (pred.y) out.push({ x: m.origin.x, y: m.origin.y - pred.y[i] / k });
    else if (pred.x) out.push({ x: m.origin.x + pred.x[i] / k, y: m.origin.y });
  }
  return out;
}


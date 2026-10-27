import { rleDecode } from "@/lib/rle";

/** A stored SAM mask: COCO RLE over the mask's own grid, which is stretched over `box` (l, t, r, b) in frame pixels. */
export type StoredMask = { box: [number, number, number, number]; rle?: { size: [number, number]; counts: string | number[] } | null };

/**
 * The outline of a stored SAM mask as an SVG path in frame pixels: every edge between a mask cell and an empty one,
 * chained into closed loops and with straight runs merged, so it strokes cleanly at any size. Empty string without a
 * mask. Pure, so it runs on the server (first paint) and in the browser alike.
 */
export function maskOutlinePath(mask: StoredMask): string {
  if (!mask.rle) return "";
  const [mh, mw] = mask.rle.size;
  if (!mh || !mw) return "";
  const m = rleDecode(mask.rle.counts, mh, mw);
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < mw && y < mh && m[y * mw + x] === 1;
  // directed edges with the mask on their right (clockwise loops); keyed by start corner
  const next = new Map<number, number[]>();
  const key = (x: number, y: number) => y * (mw + 1) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = key(x0, y0);
    const list = next.get(k);
    if (list) list.push(key(x1, y1));
    else next.set(k, [key(x1, y1)]);
  };
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      if (!on(x, y)) continue;
      if (!on(x, y - 1)) add(x, y, x + 1, y);
      if (!on(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!on(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!on(x - 1, y)) add(x, y + 1, x, y);
    }
  const [l, t, r, b] = mask.box;
  const sx = (r - l) / mw, sy = (b - t) / mh;
  const pt = (k: number) => [l + (k % (mw + 1)) * sx, t + Math.floor(k / (mw + 1)) * sy] as const;
  let d = "";
  for (const start of [...next.keys()]) {
    let list = next.get(start);
    if (!list?.length) continue;
    const loop: number[] = [start];
    let cur = start;
    for (let guard = 0; guard < 1e6; guard++) {
      list = next.get(cur);
      if (!list?.length) break;
      const to = list.pop()!;
      if (to === start) break;
      loop.push(to);
      cur = to;
    }
    if (loop.length < 3) continue;
    // keep only the corners: a point whose two neighbours are in line with it adds nothing
    const pts = loop.map(pt);
    const keep = pts.filter((p, i) => {
      const a = pts[(i - 1 + pts.length) % pts.length], c = pts[(i + 1) % pts.length];
      return (p[0] - a[0]) * (c[1] - p[1]) - (p[1] - a[1]) * (c[0] - p[0]) !== 0;
    });
    if (keep.length < 3) continue;
    d += keep.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join("") + "Z";
  }
  return d;
}

/**
 * SAM 3.1's mask, drawn over the frame it came from: an orange outline (and an optional faint fill) laid on a video
 * or image of the same frame. Place it inside a positioned box the size of the picture; it fills that box.
 *
 * Usage (e.g. a replay's SAM step):
 *   <div style={{ position: "relative" }}>
 *     <video ... />
 *     <MaskOutline mask={strobe[k]} width={codedWidth} height={height} fill />
 *   </div>
 * `mask` is one entry of an experiment's `strobe` (or `/x/<id>/strobe.json`), `width`/`height` the frame's coded size
 * (the coordinates SAM's boxes use). Pick the entry whose `t` is nearest the clip's currentTime.
 */
export default function MaskOutline({ mask, width, height, fill = false, className, style }: { mask: StoredMask; width: number; height: number; fill?: boolean; className?: string; style?: React.CSSProperties }) {
  const d = maskOutlinePath(mask);
  if (!d) return null;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", overflow: "visible", ...style }}
    >
      {fill && <path d={d} fill="#ff5a1f" fillOpacity={0.32} fillRule="evenodd" />}
      <path d={d} fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={3.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="none" stroke="#ff5a1f" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

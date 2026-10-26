/**
 * Reads when each frame was shot, from the MP4/MOV container itself (stts + ctts in the video track's
 * sample table). Phones record variable frame rates, so "frame i at i/30 s" can be off by whole frames;
 * physics needs the real clock. Also returns the display size and rotation.
 */

export type VideoInfo = {
  width: number; // display width (after rotation)
  height: number;
  rotation: 0 | 90 | 180 | 270;
  timescale: number;
  /** presentation time of each frame in display order, seconds from the first frame */
  times: number[];
  duration: number;
  fps: number; // median
  codec: string;
  /** frame-rate spread: (max interval - min interval) / median */
  jitter: number;
};

type Box = { type: string; start: number; end: number; body: number };

function* boxes(v: DataView, start: number, end: number): Generator<Box> {
  let p = start;
  while (p + 8 <= end) {
    let size = v.getUint32(p);
    const type = String.fromCharCode(v.getUint8(p + 4), v.getUint8(p + 5), v.getUint8(p + 6), v.getUint8(p + 7));
    let body = p + 8;
    if (size === 1) {
      size = Number(v.getBigUint64(p + 8));
      body = p + 16;
    } else if (size === 0) size = end - p;
    if (size < 8 || p + size > end) return;
    yield { type, start: p, end: p + size, body };
    p += size;
  }
}

function child(v: DataView, b: Box, type: string, skip = 0): Box | undefined {
  for (const c of boxes(v, b.body + skip, b.end)) if (c.type === type) return c;
}

export class VideoError extends Error {}

export function readVideoInfo(buf: Uint8Array): VideoInfo {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let moov: Box | undefined;
  for (const b of boxes(v, 0, buf.byteLength)) if (b.type === "moov") moov = b;
  if (!moov) throw new VideoError("This file has no MP4/MOV index (moov box). Export it as MP4 or MOV.");
  for (const trak of boxes(v, moov.body, moov.end)) {
    if (trak.type !== "trak") continue;
    const mdia = child(v, trak, "mdia");
    if (!mdia) continue;
    const hdlr = child(v, mdia, "hdlr");
    if (!hdlr) continue;
    const handler = String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(hdlr.body + 8 + i)));
    if (handler !== "vide") continue;
    const mdhd = child(v, mdia, "mdhd")!;
    const ver = v.getUint8(mdhd.body);
    const timescale = ver === 1 ? v.getUint32(mdhd.body + 20) : v.getUint32(mdhd.body + 12);
    // display size + rotation from tkhd
    const tkhd = child(v, trak, "tkhd")!;
    const tv = v.getUint8(tkhd.body);
    const mOff = tkhd.body + (tv === 1 ? 52 : 40);
    const a = v.getInt32(mOff) / 65536, b = v.getInt32(mOff + 4) / 65536;
    const w = v.getUint32(mOff + 36) / 65536, h = v.getUint32(mOff + 40) / 65536;
    const deg = Math.round((Math.atan2(b, a) * 180) / Math.PI);
    const rotation = (((deg % 360) + 360) % 360) as 0 | 90 | 180 | 270;
    const minf = child(v, mdia, "minf")!;
    const stbl = child(v, minf, "stbl")!;
    const stsd = child(v, stbl, "stsd");
    const codec = stsd ? String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(stsd.body + 12 + i))) : "?";
    const stts = child(v, stbl, "stts");
    if (!stts) throw new VideoError("The video track has no timing table (stts).");
    const deltas: number[] = [];
    const n = v.getUint32(stts.body + 4);
    for (let i = 0; i < n; i++) {
      const count = v.getUint32(stts.body + 8 + i * 8);
      const delta = v.getUint32(stts.body + 12 + i * 8);
      for (let k = 0; k < count && deltas.length < 200_000; k++) deltas.push(delta);
    }
    const dts: number[] = [];
    let acc = 0;
    for (const d of deltas) { dts.push(acc); acc += d; }
    const ctts = child(v, stbl, "ctts");
    const offsets = new Array(dts.length).fill(0);
    if (ctts) {
      const cver = v.getUint8(ctts.body);
      const m = v.getUint32(ctts.body + 4);
      let i = 0;
      for (let e = 0; e < m; e++) {
        const count = v.getUint32(ctts.body + 8 + e * 8);
        const off = cver === 1 ? v.getInt32(ctts.body + 12 + e * 8) : v.getUint32(ctts.body + 12 + e * 8);
        for (let k = 0; k < count && i < offsets.length; k++) offsets[i++] = off;
      }
    }
    const pts = dts.map((d, i) => d + offsets[i]).sort((x, y) => x - y);
    const t0 = pts[0] ?? 0;
    const times = pts.map((p) => (p - t0) / timescale);
    const intervals = times.slice(1).map((t, i) => t - times[i]).filter((x) => x > 0);
    const sorted = [...intervals].sort((x, y) => x - y);
    const med = sorted[sorted.length >> 1] || 1 / 30;
    const rot = rotation === 90 || rotation === 270;
    return {
      width: Math.round(rot ? h : w),
      height: Math.round(rot ? w : h),
      rotation,
      timescale,
      times,
      duration: acc / timescale,
      fps: 1 / med,
      codec,
      jitter: sorted.length ? (sorted[sorted.length - 1] - sorted[0]) / med : 0,
    };
  }
  throw new VideoError("No video track found in this file.");
}

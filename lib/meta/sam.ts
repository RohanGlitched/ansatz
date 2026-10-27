/**
 * SAM 3.1 as a measuring instrument. One request per noun phrase tracks every match through every frame;
 * each mask is reduced to the numbers physics needs: centroid (sub-pixel, from the mask's first moments),
 * area, orientation and principal axes (second moments). The per-frame RLE is kept so the page can draw
 * the stroboscopic print from the very pixels that were measured.
 */
import { buildObjectPrompt, decodeMaskToRaster, decodeMaskToRLE, formats, type SegmentationMaskRecord } from "@meta-sam/parser";
import { IncompleteStream, Ledger, PRICE, respondStreamText } from "./client";

/** One retry when a stream ends without completing; any other failure goes straight up. */
const once = async <T,>(f: () => Promise<T>): Promise<T> => {
  try {
    return await f();
  } catch (e) {
    if (e instanceof IncompleteStream) return f();
    throw e;
  }
};

export type Sample = {
  f: number; // source frame index
  cx: number; // centroid, source px
  cy: number;
  area: number; // px²
  angle: number; // major-axis orientation, radians (image axes, y down)
  major: number; // full major-axis length, px (4·sqrt(λ1)): exact for an ellipse
  minor: number;
  /** true extent along the major / minor axis, px: a rectangle's real length and width (a ruler) */
  len: number;
  wid: number;
  box: [number, number, number, number]; // left, top, right, bottom
  conf?: number;
  rle?: { size: [number, number]; counts: string | number[]; origin: [number, number] };
};

export type Track = { id: string; noun: string; samples: Sample[] };

export type SamResult = { width: number; height: number; tracks: Track[]; frames: number; raw: string };

function moments(rec: SegmentationMaskRecord): Omit<Sample, "f" | "conf" | "rle"> | null {
  const { width: W, height: H } = rec.mask;
  const raster = decodeMaskToRaster(rec.mask);
  const { left, top, right, bottom } = rec.bounds;
  const sx = (right - left) / W;
  const sy = (bottom - top) / H;
  let n = 0, mx = 0, my = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (raster[y * W + x]) { n++; mx += x; my += y; }
  if (!n) return null;
  mx /= n; my /= n;
  let cxx = 0, cyy = 0, cxy = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (raster[y * W + x]) {
    const dx = (x - mx) * sx, dy = (y - my) * sy;
    cxx += dx * dx; cyy += dy * dy; cxy += dx * dy;
  }
  cxx /= n; cyy /= n; cxy /= n;
  const tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  const l1 = tr / 2 + disc, l2 = Math.max(0, tr / 2 - disc);
  const angle = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ux = Math.cos(angle), uy = Math.sin(angle);
  let pMin = Infinity, pMax = -Infinity, qMin = Infinity, qMax = -Infinity;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (raster[y * W + x]) {
    const dx = (x - mx) * sx, dy = (y - my) * sy;
    const pp = dx * ux + dy * uy, qq = -dx * uy + dy * ux;
    if (pp < pMin) pMin = pp;
    if (pp > pMax) pMax = pp;
    if (qq < qMin) qMin = qq;
    if (qq > qMax) qMax = qq;
  }
  const px = (sx + sy) / 2;
  return {
    len: pMax - pMin + px,
    wid: qMax - qMin + px,
    cx: left + (mx + 0.5) * sx,
    cy: top + (my + 0.5) * sy,
    area: n * sx * sy,
    angle,
    major: 4 * Math.sqrt(l1),
    minor: 4 * Math.sqrt(l2),
    box: [left, top, right, bottom],
  };
}

export function parseSam(raw: string, noun: string, keepRle = true): Omit<SamResult, "frames"> & { frames: number } {
  const parser = formats.segmentation.video().createParser();
  parser.push(raw, { emit: false });
  const { result } = parser.finish({ status: "completed" });
  let width = 0, height = 0;
  const m = /;w=(\d+);h=(\d+)/.exec(raw);
  if (m) { width = +m[1]; height = +m[2]; }
  const byId = new Map<string, Sample[]>();
  let maxF = -1;
  for (const rec of result.records) {
    if (rec.kind !== "mask" || !rec.frame) continue;
    const mom = moments(rec);
    if (!mom) continue;
    const f = rec.frame.frameIndex;
    maxF = Math.max(maxF, f);
    let rle: Sample["rle"];
    if (keepRle) {
      const r = decodeMaskToRLE(rec.mask);
      rle = { size: r.size as [number, number], counts: r.counts as string | number[], origin: [rec.bounds.left, rec.bounds.top] };
    }
    const s: Sample = { f, ...mom, conf: rec.confidence, rle };
    const list = byId.get(rec.objectId) ?? [];
    list.push(s);
    byId.set(rec.objectId, list);
  }
  const tracks = [...byId].map(([id, samples]) => ({ id, noun, samples: samples.sort((a, b) => a.f - b.f) }));
  return { width, height, tracks, frames: maxF + 1, raw };
}

/** One mask as it streams in: enough to draw a dot while SAM is still working. */
export type LiveMask = { f: number; cx: number; cy: number; id: string };

/** A stream listener that decodes masks as they arrive, for a live view; it never interferes with the real parse. */
function liveListener(onMask?: (m: LiveMask) => void) {
  if (!onMask) return undefined;
  const parser = formats.segmentation.video().createParser();
  let seen = 0;
  return (delta: string) => {
    try {
      const snaps = parser.push(delta, { emit: true });
      const last = snaps[snaps.length - 1];
      if (!last) return;
      for (let i = seen; i < last.records.length; i++) {
        const rec = last.records[i];
        if (rec.kind !== "mask" || !rec.frame) continue;
        const mom = moments(rec);
        if (mom) onMask({ f: rec.frame.frameIndex, cx: mom.cx, cy: mom.cy, id: rec.objectId });
      }
      seen = last.records.length;
    } catch {
      /* the live view is a nicety */
    }
  };
}

/** Tracks every match of `noun` through the clip. */
export async function trackNoun(fileId: string, noun: string, ledger: Ledger | null, frameCount?: number, onMask?: (m: LiveMask) => void): Promise<SamResult> {
  const raw = await once(() => respondStreamText(
    {
      model: "sam-3.1",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: noun }, { type: "input_video", file_id: fileId }] }],
      metadata: { include_confidence: "true", mask_encoding: "one_bit" },
    },
    null,
    `track "${noun}"`,
    liveListener(onMask),
  ));
  if (process.env.SAM_DUMP_DIR) {
    const { writeFileSync, mkdirSync } = await import("node:fs");
    mkdirSync(process.env.SAM_DUMP_DIR, { recursive: true });
    writeFileSync(`${process.env.SAM_DUMP_DIR}/${noun.replace(/\W+/g, "_")}-${Date.now()}.txt`, raw);
  }
  const res = parseSam(raw, noun);
  const frames = Math.max(50, frameCount ?? res.frames);
  ledger?.add({ model: "sam-3.1", purpose: `track "${noun}"`, ms: 0, frames, usd: frames * PRICE.samFrame });
  return res;
}

/** Tracks specific objects from boxes (e.g. where Muse Spark pointed) on given frames. */
export async function trackBoxes(
  fileId: string,
  size: { width: number; height: number },
  objects: { id: number; frame: number; box: { left: number; top: number; right: number; bottom: number } }[],
  ledger: Ledger | null,
  frameCount?: number,
): Promise<SamResult> {
  const text = buildObjectPrompt({ size, objects: objects.map((o) => ({ id: o.id, prompts: [{ frame: o.frame, box: o.box }] })) });
  const raw = await once(() => respondStreamText(
    {
      model: "sam-3.1",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text }, { type: "input_video", file_id: fileId }] }],
      metadata: { include_confidence: "true", mask_encoding: "one_bit" },
    },
    null,
    "track pointed objects",
  ));
  const res = parseSam(raw, "pointed object");
  const frames = Math.max(50, frameCount ?? res.frames);
  ledger?.add({ model: "sam-3.1", purpose: "track pointed objects", ms: 0, frames, usd: frames * PRICE.samFrame });
  return res;
}

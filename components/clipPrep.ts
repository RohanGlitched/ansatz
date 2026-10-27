/**
 * Trims a clip and shrinks it to 720p in the browser before it is uploaded, so a phone's 1080p or 4K clip doesn't
 * cross a school's connection at full size. WebCodecs decodes and re-encodes the frames; every frame keeps the
 * timestamp the camera wrote (the physics runs on that clock), and the result is checked frame by frame against
 * the original's sample table before it is used. Anything that can't be done exactly (no WebCodecs, a codec the
 * browser can't decode, a WebM recording, timestamps that would change) falls back to uploading the clip as it is.
 *
 * The demuxer and muxer are pure (no DOM), so test/clipprep.test.ts runs them in Node.
 */
import { readVideoInfo } from "../lib/video";

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

const child = (v: DataView, b: Box, type: string, skip = 0) => {
  for (const c of boxes(v, b.body + skip, b.end)) if (c.type === type) return c;
};

export type DemuxSample = { offset: number; size: number; dts: number; cts: number; dur: number; sync: boolean };
export type DemuxTrack = {
  kind: "vide" | "soun";
  timescale: number;
  /** tkhd's 3×3 matrix, raw (rotation lives here) */
  matrix: number[];
  /** the sample entry's four-letter code and its size (coded size for video) */
  format: string;
  width: number;
  height: number;
  /** avcC/hvcC body (video), or the AudioSpecificConfig (AAC) */
  config?: Uint8Array;
  /** the WebCodecs codec string */
  codec?: string;
  channels?: number;
  sampleRate?: number;
  samples: DemuxSample[];
};

/** Reads an MP4/MOV's tracks and sample tables (decode order). Throws on anything else. */
export function demux(buf: Uint8Array): DemuxTrack[] {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let moov: Box | undefined;
  for (const b of boxes(v, 0, buf.byteLength)) if (b.type === "moov") moov = b;
  if (!moov) throw new Error("not an MP4/MOV file");
  const out: DemuxTrack[] = [];
  for (const trak of boxes(v, moov.body, moov.end)) {
    if (trak.type !== "trak") continue;
    const tkhd = child(v, trak, "tkhd"), mdia = child(v, trak, "mdia");
    if (!tkhd || !mdia) continue;
    const hdlr = child(v, mdia, "hdlr"), mdhd = child(v, mdia, "mdhd"), minf = child(v, mdia, "minf");
    if (!hdlr || !mdhd || !minf) continue;
    const handler = String.fromCharCode(...[0, 1, 2, 3].map((i) => v.getUint8(hdlr.body + 8 + i)));
    if (handler !== "vide" && handler !== "soun") continue;
    const timescale = v.getUint8(mdhd.body) === 1 ? v.getUint32(mdhd.body + 20) : v.getUint32(mdhd.body + 12);
    const mOff = tkhd.body + (v.getUint8(tkhd.body) === 1 ? 52 : 40);
    const matrix = Array.from({ length: 9 }, (_, i) => v.getInt32(mOff + i * 4));
    const stbl = child(v, minf, "stbl");
    const stsd = stbl && child(v, stbl, "stsd");
    if (!stbl || !stsd) continue;
    const entry = [...boxes(v, stsd.body + 8, stsd.end)][0];
    if (!entry) continue;
    const t: DemuxTrack = { kind: handler, timescale, matrix, format: entry.type, width: 0, height: 0, samples: [] };
    if (handler === "vide") {
      t.width = v.getUint16(entry.body + 24);
      t.height = v.getUint16(entry.body + 26);
      for (const c of boxes(v, entry.body + 78, entry.end)) {
        if (c.type === "avcC") {
          t.config = buf.slice(c.body, c.end);
          t.codec = `${entry.type}.${[1, 2, 3].map((i) => t.config![i].toString(16).padStart(2, "0")).join("")}`;
        } else if (c.type === "hvcC") {
          t.config = buf.slice(c.body, c.end);
          t.codec = hevcCodec(entry.type, t.config);
        }
      }
    } else {
      const ver = v.getUint16(entry.body + 8);
      t.channels = v.getUint16(entry.body + 16);
      t.sampleRate = v.getUint32(entry.body + 24) >>> 16;
      // QuickTime sound descriptions: version 1 adds 16 bytes before the child boxes, version 2 adds 36
      const kids = entry.body + 28 + (ver === 1 ? 16 : ver === 2 ? 36 : 0);
      const esds = findBox(v, kids, entry.end, "esds");
      if (esds) {
        const asc = audioSpecificConfig(buf.subarray(esds.body + 4, esds.end));
        if (asc) {
          t.config = asc.data;
          t.codec = `mp4a.${asc.oti.toString(16)}${asc.oti === 0x40 ? `.${asc.data[0] >> 3}` : ""}`;
        }
      }
    }
    t.samples = sampleTable(v, stbl);
    out.push(t);
  }
  return out;
}

function findBox(v: DataView, start: number, end: number, type: string): Box | undefined {
  for (const b of boxes(v, start, end)) {
    if (b.type === type) return b;
    if (b.type === "wave") {
      const inner = findBox(v, b.body, b.end, type);
      if (inner) return inner;
    }
  }
}

/** The DecoderSpecificInfo inside an esds's ES_Descriptor → DecoderConfigDescriptor. */
function audioSpecificConfig(d: Uint8Array): { oti: number; data: Uint8Array } | null {
  let p = 0, oti = 0;
  const len = () => {
    let n = 0;
    for (let i = 0; i < 4; i++) {
      const b = d[p++];
      n = (n << 7) | (b & 0x7f);
      if (!(b & 0x80)) break;
    }
    return n;
  };
  while (p < d.length) {
    const tag = d[p++];
    const n = len();
    if (tag === 3) {
      const flags = d[p + 2];
      p += 3;
      if (flags & 0x80) p += 2;
      if (flags & 0x40) p += 1 + d[p];
      if (flags & 0x20) p += 2;
    } else if (tag === 4) {
      oti = d[p];
      p += 13;
    } else if (tag === 5) {
      return { oti, data: d.slice(p, p + n) };
    } else p += n;
  }
  return null;
}

function hevcCodec(type: string, c: Uint8Array) {
  const space = c[1] >> 6, tier = (c[1] >> 5) & 1, idc = c[1] & 0x1f;
  let compat = ((c[2] << 24) | (c[3] << 16) | (c[4] << 8) | c[5]) >>> 0;
  let rev = 0;
  for (let i = 0; i < 32; i++) {
    rev = (rev << 1) | (compat & 1);
    compat >>>= 1;
  }
  const cons = Array.from(c.slice(6, 12));
  while (cons.length && cons[cons.length - 1] === 0) cons.pop();
  return `${type}.${["", "A", "B", "C"][space]}${idc}.${(rev >>> 0).toString(16)}.${tier ? "H" : "L"}${c[12]}${cons.map((b) => `.${b.toString(16)}`).join("")}`;
}

function sampleTable(v: DataView, stbl: Box): DemuxSample[] {
  const stsz = child(v, stbl, "stsz"), stsc = child(v, stbl, "stsc"), stts = child(v, stbl, "stts");
  const stco = child(v, stbl, "stco"), co64 = child(v, stbl, "co64"), ctts = child(v, stbl, "ctts"), stss = child(v, stbl, "stss");
  if (!stsz || !stsc || !stts || !(stco || co64)) throw new Error("incomplete sample table");
  const fixed = v.getUint32(stsz.body + 4), n = v.getUint32(stsz.body + 8);
  const size = (i: number) => (fixed || v.getUint32(stsz.body + 12 + i * 4));
  const nc = v.getUint32((stco ?? co64)!.body + 4);
  const chunk = (i: number) => (stco ? v.getUint32(stco.body + 8 + i * 4) : Number(v.getBigUint64(co64!.body + 8 + i * 8)));
  const runs = Array.from({ length: v.getUint32(stsc.body + 4) }, (_, i) => ({ first: v.getUint32(stsc.body + 8 + i * 12), per: v.getUint32(stsc.body + 12 + i * 12) }));
  const out: DemuxSample[] = [];
  let s = 0;
  for (let c = 0; c < nc && s < n; c++) {
    let per = 0;
    for (const r of runs) if (r.first <= c + 1) per = r.per;
    let off = chunk(c);
    for (let k = 0; k < per && s < n; k++, s++) {
      const z = size(s);
      out.push({ offset: off, size: z, dts: 0, cts: 0, dur: 0, sync: !stss });
      off += z;
    }
  }
  let i = 0, t = 0;
  for (let e = 0, m = v.getUint32(stts.body + 4); e < m; e++) {
    const count = v.getUint32(stts.body + 8 + e * 8), delta = v.getUint32(stts.body + 12 + e * 8);
    for (let k = 0; k < count && i < out.length; k++, i++) {
      out[i].dts = t;
      out[i].dur = delta;
      t += delta;
    }
  }
  for (const x of out) x.cts = x.dts;
  if (ctts) {
    const signed = v.getUint8(ctts.body) === 1;
    i = 0;
    for (let e = 0, m = v.getUint32(ctts.body + 4); e < m; e++) {
      const count = v.getUint32(ctts.body + 8 + e * 8), off = signed ? v.getInt32(ctts.body + 12 + e * 8) : v.getUint32(ctts.body + 12 + e * 8);
      for (let k = 0; k < count && i < out.length; k++, i++) out[i].cts = out[i].dts + off;
    }
  }
  if (stss) for (let e = 0, m = v.getUint32(stss.body + 4); e < m; e++) {
    const k = v.getUint32(stss.body + 8 + e * 4) - 1;
    if (out[k]) out[k].sync = true;
  }
  return out;
}

// ---- the muxer: one video track (H.264), and the narration as 16 kHz mono PCM ----

const enc = new TextEncoder();
function cat(parts: Uint8Array[]) {
  const n = parts.reduce((s, p) => s + p.length, 0);
  const o = new Uint8Array(n);
  let p = 0;
  for (const x of parts) (o.set(x, p), (p += x.length));
  return o;
}
function u32(...xs: number[]) {
  const o = new Uint8Array(xs.length * 4), v = new DataView(o.buffer);
  xs.forEach((x, i) => v.setUint32(i * 4, x >>> 0));
  return o;
}
function u16(...xs: number[]) {
  const o = new Uint8Array(xs.length * 2), v = new DataView(o.buffer);
  xs.forEach((x, i) => v.setUint16(i * 2, x & 0xffff));
  return o;
}
function box(type: string, ...parts: Uint8Array[]) {
  const body = cat(parts);
  return cat([u32(body.length + 8), enc.encode(type), body]);
}
const full = (type: string, version: number, flags: number, ...parts: Uint8Array[]) => box(type, u32(((version & 0xff) << 24) | (flags & 0xffffff)), ...parts);
const zeros = (n: number) => new Uint8Array(n);

/** Run-length table of (count, value) pairs, as stts and ctts store them. */
function rle(xs: number[]) {
  const out: number[] = [];
  for (const x of xs) {
    if (out.length && out[out.length - 1] === x) out[out.length - 2]++;
    else out.push(1, x);
  }
  return out;
}

export type MuxVideo = { width: number; height: number; matrix: number[]; timescale: number; avcC: Uint8Array; samples: { data: Uint8Array; dts: number; cts: number; dur: number; sync: boolean }[] };
export type MuxAudio = { rate: number; pcm: Int16Array };

const IDENTITY = [0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000];

/** A progressive MP4: ftyp, mdat (the video samples, then the PCM), moov at the end. */
export function mux(video: MuxVideo, audio?: MuxAudio): Uint8Array {
  const ftyp = box("ftyp", enc.encode("isom"), u32(0x200), enc.encode("isomiso2avc1mp41"));
  const vData = video.samples.map((s) => s.data);
  const vBytes = vData.reduce((s, d) => s + d.length, 0);
  const aBytes = audio ? audio.pcm.length * 2 : 0;
  const mdatHead = u32(8 + vBytes + aBytes);
  const dataStart = ftyp.length + 8;
  // video: one sample per chunk; audio: one chunk per second of PCM
  const vOffsets: number[] = [];
  let p = dataStart;
  for (const d of vData) (vOffsets.push(p), (p += d.length));
  const aStart = p;
  const vDur = video.samples.reduce((s, x) => s + x.dur, 0);
  const movieTs = 1000;
  const mvhd = full("mvhd", 0, 0, u32(0, 0, movieTs, Math.round((vDur / video.timescale) * movieTs), 0x10000), u16(0x100, 0), zeros(8), u32(...IDENTITY), zeros(24), u32(audio ? 3 : 2));
  const dinf = box("dinf", full("dref", 0, 0, u32(1), full("url ", 0, 1)));
  const hdlr = (t: string, name: string) => full("hdlr", 0, 0, u32(0), enc.encode(t), zeros(12), enc.encode(`${name}\0`));
  const mdhd = (ts: number, dur: number) => full("mdhd", 0, 0, u32(0, 0, ts, dur), u16(0x55c4, 0));
  const tkhd = (id: number, durMs: number, volume: number, matrix: number[], w: number, h: number) => full("tkhd", 0, 3, u32(0, 0, id, 0, durMs), zeros(8), u16(0, 0, volume, 0), u32(...matrix), u32(w << 16, h << 16));

  // the video track
  const avc1 = box("avc1", zeros(6), u16(1), zeros(16), u16(video.width, video.height), u32(0x480000, 0x480000, 0), u16(1), zeros(32), u16(0x18, 0xffff), box("avcC", video.avcC));
  const sttsV = rle(video.samples.map((s) => s.dur));
  const offs = video.samples.map((s) => s.cts - s.dts);
  const cttsV = offs.some((o) => o !== 0) ? [full("ctts", offs.some((o) => o < 0) ? 1 : 0, 0, u32(rle(offs).length / 2, ...rle(offs)))] : [];
  const syncs = video.samples.map((s, i) => (s.sync ? i + 1 : 0)).filter(Boolean);
  const stblV = box(
    "stbl",
    full("stsd", 0, 0, u32(1), avc1),
    full("stts", 0, 0, u32(sttsV.length / 2, ...sttsV)),
    ...cttsV,
    full("stss", 0, 0, u32(syncs.length, ...syncs)),
    full("stsc", 0, 0, u32(1, 1, 1, 1)),
    full("stsz", 0, 0, u32(0, vData.length, ...vData.map((d) => d.length))),
    full("stco", 0, 0, u32(vOffsets.length, ...vOffsets)),
  );
  const vMs = Math.round((vDur / video.timescale) * movieTs);
  const trakV = box("trak", tkhd(1, vMs, 0, video.matrix, video.width, video.height), box("mdia", mdhd(video.timescale, vDur), hdlr("vide", "VideoHandler"), box("minf", full("vmhd", 0, 1, zeros(8)), dinf, stblV)));

  let trakA = new Uint8Array(0);
  if (audio) {
    const N = audio.pcm.length, per = audio.rate, chunks = Math.ceil(N / per);
    const stsc = N % per && chunks > 1 ? u32(2, 1, per, 1, chunks, N % per, 1) : u32(1, 1, Math.min(per, N), 1);
    const sowt = box("sowt", zeros(6), u16(1), u16(0, 0), u32(0), u16(1, 16, 0, 0), u32(audio.rate << 16));
    const stblA = box("stbl", full("stsd", 0, 0, u32(1), sowt), full("stts", 0, 0, u32(1, N, 1)), full("stsc", 0, 0, stsc), full("stsz", 0, 0, u32(2, N)), full("stco", 0, 0, u32(chunks, ...Array.from({ length: chunks }, (_, i) => aStart + i * per * 2))));
    trakA = box("trak", tkhd(2, Math.round((N / audio.rate) * movieTs), 0x100, IDENTITY, 0, 0), box("mdia", mdhd(audio.rate, N), hdlr("soun", "SoundHandler"), box("minf", full("smhd", 0, 0, zeros(4)), dinf, stblA)));
  }
  const pcm = audio ? new Uint8Array(audio.pcm.buffer, audio.pcm.byteOffset, audio.pcm.byteLength) : new Uint8Array(0);
  // PCM in the file is little-endian ('sowt'); Int16Array is too on every platform a browser runs on
  return cat([ftyp, mdatHead, enc.encode("mdat"), ...vData, pcm, box("moov", mvhd, trakV, trakA)]);
}

// ---- the browser pipeline ----

export type PrepResult =
  | { ok: true; file: File; width: number; height: number; seconds: number; frames: number; audio: boolean }
  | { ok: false; why: string; skip?: boolean };

/** Whether this browser can trim and shrink a clip at all. */
export function canPrepare() {
  return typeof window !== "undefined" && "VideoDecoder" in window && "VideoEncoder" in window && "EncodedVideoChunk" in window;
}

const MAX_LONG = 1280, MAX_SHORT = 720;

/**
 * Trims [start, end] (seconds from the first frame) and scales to fit 1280×720, keeping every frame's timestamp.
 * keepAudio carries the narration (16 kHz mono, which is all the server keeps of it); when it can't be carried and
 * needAudio is set, the clip goes as it is instead.
 */
export async function prepareClip(file: File, o: { start: number; end: number; keepAudio: boolean; needAudio: boolean; onProgress?: (f: number) => void; cancelled?: () => boolean }): Promise<PrepResult> {
  if (!canPrepare()) return { ok: false, why: "this browser can’t re-encode video" };
  const buf = new Uint8Array(await file.arrayBuffer());
  let tracks: DemuxTrack[];
  try {
    tracks = demux(buf);
  } catch {
    return { ok: false, why: "only MP4 and MOV clips can be trimmed here" };
  }
  const vt = tracks.find((t) => t.kind === "vide");
  if (!vt || !vt.codec || !vt.config || !vt.samples.length) return { ok: false, why: "the clip’s video track can’t be read here" };
  const ts = vt.timescale;
  const tMin = Math.min(...vt.samples.map((s) => s.cts));
  const pt = (s: DemuxSample) => (s.cts - tMin) / ts;
  const byPts = [...vt.samples].sort((a, b) => a.cts - b.cts);
  const gaps = byPts.slice(1).map((s, i) => s.cts - byPts[i].cts).sort((a, b) => a - b);
  const fps = ts / (gaps[gaps.length >> 1] || ts / 30);
  const total = pt(byPts[byPts.length - 1]);
  const eps = 0.5 / fps;
  const trimmed = o.start > eps || o.end < total - eps;
  const scale = Math.min(1, MAX_LONG / Math.max(vt.width, vt.height), MAX_SHORT / Math.min(vt.width, vt.height));
  if (!trimmed && scale >= 0.999) return { ok: false, skip: true, why: "already 720p or smaller, and not trimmed" };
  const outW = Math.max(2, 2 * Math.round((vt.width * scale) / 2)), outH = Math.max(2, 2 * Math.round((vt.height * scale) / 2));

  const keep = byPts.filter((s) => pt(s) >= o.start - eps && pt(s) <= o.end + eps);
  if (keep.length < 12) return { ok: false, why: "the trimmed clip is too short" };
  const us = (s: DemuxSample) => Math.round(((s.cts - tMin) * 1e6) / ts);
  const keptUs = new Map(keep.map((s) => [us(s), s]));
  // decode from the key frame at or before the first kept frame, up to the key frame after the last
  const dec = vt.samples;
  const idx = new Map(dec.map((s, i) => [s, i]));
  let i0 = Math.min(...keep.map((s) => idx.get(s)!)), i1 = Math.max(...keep.map((s) => idx.get(s)!));
  while (i0 > 0 && !dec[i0].sync) i0--;
  while (i1 + 1 < dec.length && !dec[i1 + 1].sync) i1++;

  const dcfg: VideoDecoderConfig = { codec: vt.codec, codedWidth: vt.width, codedHeight: vt.height, description: vt.config };
  if (!(await VideoDecoder.isConfigSupported(dcfg).catch(() => ({ supported: false }))).supported) return { ok: false, why: `this browser can’t decode ${vt.codec.startsWith("hvc") || vt.codec.startsWith("hev") ? "HEVC" : vt.codec}` };
  const bitrate = Math.round(Math.min(8e6, Math.max(1.5e6, outW * outH * fps * 0.09)));
  let ecfg: VideoEncoderConfig | null = null;
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.42001f"]) {
    const c: VideoEncoderConfig = { codec, width: outW, height: outH, bitrate, framerate: fps, latencyMode: "quality", avc: { format: "avc" } };
    if ((await VideoEncoder.isConfigSupported(c).catch(() => ({ supported: false }))).supported) {
      ecfg = c;
      break;
    }
  }
  if (!ecfg) return { ok: false, why: "this browser can’t encode H.264" };

  // the narration first (small), so a clip that needs it and can't keep it goes as it is before any video work
  let pcm: Int16Array | undefined;
  const at = tracks.find((t) => t.kind === "soun");
  if (at && o.keepAudio) {
    pcm = await narration(buf, at, o.start, o.end).catch(() => undefined);
    if (!pcm && o.needAudio) return { ok: false, why: "the narration couldn’t be carried over in this browser" };
  }

  const chunks: { data: Uint8Array; ts: number; key: boolean }[] = [];
  let avcC: Uint8Array | null = null;
  let failed: unknown = null;
  const encoder = new VideoEncoder({
    output: (c, meta) => {
      const d = new Uint8Array(c.byteLength);
      c.copyTo(d);
      chunks.push({ data: d, ts: c.timestamp, key: c.type === "key" });
      const desc = meta?.decoderConfig?.description;
      if (desc && !avcC) avcC = desc instanceof ArrayBuffer ? new Uint8Array(desc.slice(0)) : new Uint8Array((desc as ArrayBufferView).buffer.slice((desc as ArrayBufferView).byteOffset, (desc as ArrayBufferView).byteOffset + (desc as ArrayBufferView).byteLength));
    },
    error: (e) => (failed = e),
  });
  encoder.configure(ecfg);
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(outW, outH) : Object.assign(document.createElement("canvas"), { width: outW, height: outH });
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) return { ok: false, why: "no canvas to scale on" };
  const gop = Math.max(1, Math.round(fps));
  let n = 0;
  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        if (!keptUs.has(frame.timestamp)) return;
        ctx.drawImage(frame, 0, 0, outW, outH);
        const f2 = new VideoFrame(canvas, { timestamp: frame.timestamp });
        encoder.encode(f2, { keyFrame: n++ % gop === 0 });
        f2.close();
      } finally {
        frame.close();
      }
    },
    error: (e) => (failed = e),
  });
  decoder.configure(dcfg);
  const wait = () => new Promise((r) => setTimeout(r, 4));
  for (let i = i0; i <= i1; i++) {
    if (failed) break;
    if (o.cancelled?.()) {
      decoder.close();
      encoder.close();
      return { ok: false, why: "cancelled" };
    }
    const s = dec[i];
    decoder.decode(new EncodedVideoChunk({ type: s.sync ? "key" : "delta", timestamp: us(s), duration: Math.round((s.dur * 1e6) / ts), data: buf.subarray(s.offset, s.offset + s.size) }));
    while (!failed && (decoder.decodeQueueSize > 6 || encoder.encodeQueueSize > 6)) await wait();
    o.onProgress?.((i - i0 + 1) / (i1 - i0 + 1));
  }
  try {
    if (!failed) await decoder.flush();
    if (!failed) await encoder.flush();
  } catch (e) {
    failed = e;
  }
  decoder.close();
  encoder.close();
  if (failed || !avcC) return { ok: false, why: "re-encoding failed in this browser" };

  // every kept frame came back once, in order, with its own timestamp: or the clip goes as it is
  if (chunks.length !== keep.length || chunks.some((c, i) => !keptUs.has(c.ts) || (i && c.ts <= chunks[i - 1].ts))) return { ok: false, why: "the re-encoded frames didn’t keep their timestamps" };
  const c0 = keep[0].cts;
  const samples = chunks.map((c, i) => {
    const src = keptUs.get(c.ts)!;
    const next = keep[i + 1];
    return { data: c.data, dts: src.cts - c0, cts: src.cts - c0, dur: next ? next.cts - src.cts : src.dur, sync: c.key };
  });
  const out = mux({ width: outW, height: outH, matrix: vt.matrix, timescale: ts, avcC: avcC!, samples }, pcm ? { rate: 16000, pcm } : undefined);
  // the check: the new file's clock, read the way the server reads it, is the original's, frame for frame
  try {
    const got = readVideoInfo(out).times;
    const want = keep.map((s) => (s.cts - c0) / ts);
    if (got.length !== want.length || got.some((t, i) => Math.abs(t - want[i]) > 1e-6)) return { ok: false, why: "the new file’s frame times didn’t match the original’s" };
  } catch {
    return { ok: false, why: "the new file couldn’t be read back" };
  }
  const name = file.name.replace(/\.\w+$/, "") + "-720p.mp4";
  return { ok: true, file: new File([out as Uint8Array<ArrayBuffer>], name, { type: "video/mp4" }), width: outW, height: outH, seconds: (keep[keep.length - 1].cts - c0) / ts, frames: keep.length, audio: !!pcm };
}

/** The narration over [start, end], as 16 kHz mono 16-bit PCM (what the server transcribes). AAC only. */
async function narration(buf: Uint8Array, at: DemuxTrack, start: number, end: number): Promise<Int16Array | undefined> {
  if (typeof AudioDecoder === "undefined" || !at.codec?.startsWith("mp4a") || !at.config || !at.sampleRate || !at.channels) return undefined;
  const cfg: AudioDecoderConfig = { codec: at.codec, sampleRate: at.sampleRate, numberOfChannels: at.channels, description: at.config };
  if (!(await AudioDecoder.isConfigSupported(cfg).catch(() => ({ supported: false }))).supported) return undefined;
  const ts = at.timescale;
  const t0 = Math.min(...at.samples.map((s) => s.cts));
  const parts: { t: number; mono: Float32Array; rate: number }[] = [];
  let failed = false;
  const d = new AudioDecoder({
    output: (a) => {
      try {
        const ch = a.numberOfChannels, nf = a.numberOfFrames;
        const mono = new Float32Array(nf);
        const tmp = new Float32Array(nf);
        for (let c = 0; c < ch; c++) {
          a.copyTo(tmp, { planeIndex: c, format: "f32-planar" });
          for (let i = 0; i < nf; i++) mono[i] += tmp[i] / ch;
        }
        parts.push({ t: a.timestamp / 1e6, mono, rate: a.sampleRate });
      } finally {
        a.close();
      }
    },
    error: () => (failed = true),
  });
  d.configure(cfg);
  for (const s of at.samples) {
    const t = (s.cts - t0) / ts;
    if (t < start - 0.2 || t > end + 0.2) continue;
    d.decode(new EncodedAudioChunk({ type: "key", timestamp: Math.round(t * 1e6), duration: Math.round((s.dur * 1e6) / ts), data: buf.subarray(s.offset, s.offset + s.size) }));
  }
  await d.flush().catch(() => (failed = true));
  d.close();
  if (failed || !parts.length) return undefined;
  // average the source samples falling in each 1/16000 s (a box filter is enough for speech)
  const OUT = 16000, n = Math.max(0, Math.round((end - start) * OUT));
  const acc = new Float64Array(n), cnt = new Uint32Array(n);
  for (const p of parts) {
    for (let i = 0; i < p.mono.length; i++) {
      const j = Math.floor((p.t + i / p.rate - start) * OUT);
      if (j >= 0 && j < n) (acc[j] += p.mono[i]), cnt[j]++;
    }
  }
  const pcm = new Int16Array(n);
  let last = 0;
  for (let j = 0; j < n; j++) {
    const x = cnt[j] ? acc[j] / cnt[j] : last;
    last = x;
    pcm[j] = Math.max(-32768, Math.min(32767, Math.round(x * 32767)));
  }
  return pcm;
}

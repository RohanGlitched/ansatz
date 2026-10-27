import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demux, mux } from "../components/clipPrep";
import { readVideoInfo } from "../lib/video";

const src = new Uint8Array(readFileSync("public/samples/pendulum.mp4"));

test("demux reads the sample table the server reads: same frames, same clock", () => {
  const v = demux(src).find((t) => t.kind === "vide")!;
  assert.ok(v.codec?.startsWith("avc1."), v.codec);
  const info = readVideoInfo(src);
  const pts = v.samples.map((s) => s.cts).sort((a, b) => a - b);
  const times = pts.map((p) => (p - pts[0]) / v.timescale);
  assert.equal(times.length, info.times.length);
  times.forEach((t, i) => assert.ok(Math.abs(t - info.times[i]) < 1e-9));
  assert.ok(v.samples[0].sync);
});

test("a remuxed clip keeps every frame's timestamp, its rotation and the narration track", () => {
  const v = demux(src).find((t) => t.kind === "vide")!;
  // a trim: frames from 2 s to 5 s, copied as they are (the browser re-encodes; the clock logic is the same)
  const byPts = [...v.samples].sort((a, b) => a.cts - b.cts);
  const t0 = byPts[0].cts;
  const keep = byPts.filter((s) => (s.cts - t0) / v.timescale >= 2 && (s.cts - t0) / v.timescale <= 5);
  const c0 = keep[0].cts;
  const rot90 = [0, 0x10000, 0, -0x10000, 0, 0, 0, 0, 0x40000000];
  const pcm = new Int16Array(16000 * 3).map((_, i) => Math.round(8000 * Math.sin(i / 10)));
  const out = mux(
    { width: v.width, height: v.height, matrix: rot90, timescale: v.timescale, avcC: v.config!, samples: keep.map((s, i) => ({ data: src.subarray(s.offset, s.offset + s.size), dts: s.cts - c0, cts: s.cts - c0, dur: keep[i + 1] ? keep[i + 1].cts - s.cts : s.dur, sync: s.sync })) },
    { rate: 16000, pcm },
  );
  const info = readVideoInfo(out);
  assert.equal(info.times.length, keep.length);
  keep.forEach((s, i) => assert.ok(Math.abs(info.times[i] - (s.cts - c0) / v.timescale) < 1e-9));
  assert.equal(info.rotation, 90);
  assert.equal(info.width, v.height);
  const back = demux(out);
  const a = back.find((t) => t.kind === "soun")!;
  assert.equal(a.format, "sowt");
  assert.equal(a.sampleRate, 16000);
  assert.equal(a.samples.length, pcm.length);
  // the PCM is where the table says
  const s = a.samples[100];
  assert.equal(new DataView(out.buffer, out.byteOffset).getInt16(s.offset, true), pcm[100]);
});

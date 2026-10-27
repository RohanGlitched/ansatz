import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { prepare } from "../lib/transcode";
import { readVideoInfo } from "../lib/video";

test("a browser recording (WebM) is converted and keeps its frame clock", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ansatz-webm-"));
  const out = path.join(dir, "rec.webm");
  execFileSync(ffmpeg as unknown as string, ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30", "-t", "2", "-c:v", "libvpx", "-b:v", "300k", out]);
  const raw = readFileSync(out);
  assert.throws(() => readVideoInfo(raw));
  const p = await prepare(raw, { maxSeconds: 60 });
  const vi = readVideoInfo(p.video);
  assert.equal(vi.times.length, 60);
  assert.ok(Math.abs(vi.fps - 30) < 0.01);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeMaskToRaster, formats } from "@meta-sam/parser";
import { decodeMaskToRLE } from "@meta-sam/parser";
import { rleDecode } from "../lib/rle";

test("our RLE decoder matches SAM's raster decoder on real masks", () => {
  const raw = readFileSync(new URL("./fixtures/toss_raw.txt", import.meta.url), "utf8");
  const parser = formats.segmentation.video().createParser();
  parser.push(raw, { emit: false });
  const { result } = parser.finish({ status: "completed" });
  let n = 0;
  for (const rec of result.records) {
    if (rec.kind !== "mask") continue;
    const ref = decodeMaskToRaster(rec.mask);
    const rle = decodeMaskToRLE(rec.mask);
    const ours = rleDecode(rle.counts as string, rle.size[0], rle.size[1]);
    assert.deepEqual(Array.from(ours), Array.from(ref));
    if (++n > 30) break;
  }
  assert.ok(n > 10);
});

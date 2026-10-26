/** COCO compressed RLE (the string form) → row-major 0/1 mask. Runs in the browser for the strobe print. */
export function rleCounts(s: string): number[] {
  const cnts: number[] = [];
  let p = 0;
  while (p < s.length) {
    let x = 0, k = 0, more = 1;
    while (more) {
      const c = s.charCodeAt(p) - 48;
      x |= (c & 0x1f) << (5 * k);
      more = c & 0x20;
      p++;
      k++;
      if (!more && c & 0x10) x |= -1 << (5 * k);
    }
    if (cnts.length > 2) x += cnts[cnts.length - 2];
    cnts.push(x);
  }
  return cnts;
}

export function rleDecode(counts: string | number[], h: number, w: number): Uint8Array {
  const cnts = typeof counts === "string" ? rleCounts(counts) : counts;
  const out = new Uint8Array(h * w);
  let idx = 0, v = 0;
  for (const c of cnts) {
    if (v) for (let i = idx; i < idx + c && i < h * w; i++) out[(i % h) * w + Math.floor(i / h)] = 1;
    idx += c;
    v ^= 1;
  }
  return out;
}

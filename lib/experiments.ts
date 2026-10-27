import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PIPELINE, type Experiment } from "./experiment";
import { toPixels } from "./pixels";
import type { PlateData } from "@/components/StrobePlate";
import { getObject, listKeys } from "./store";

const SHOWCASE_DIR = path.join(process.cwd(), "data", "showcase");

/** Showcase experiments ship with the app (JSON in data/showcase, clips in public/showcase). */
export async function showcaseIds(): Promise<string[]> {
  try {
    const order = JSON.parse(await readFile(path.join(SHOWCASE_DIR, "order.json"), "utf8")) as string[];
    return order;
  } catch {
    return (await readdir(SHOWCASE_DIR).catch(() => [])).filter((f) => f.endsWith(".json") && f !== "order.json").map((f) => f.replace(/\.json$/, ""));
  }
}

export async function getExperiment(id: string): Promise<Experiment | null> {
  if (!/^[a-z0-9-]{3,40}$/.test(id)) return null;
  try {
    return JSON.parse(await readFile(path.join(SHOWCASE_DIR, `${id}.json`), "utf8")) as Experiment;
  } catch {
    /* not a showcase */
  }
  const raw = await getObject(`experiments/${id}.json`).catch(() => null);
  return raw ? (JSON.parse(new TextDecoder().decode(raw)) as Experiment) : null;
}

export async function recentIds(limit = 24): Promise<string[]> {
  const keys = await listKeys("experiments/").catch(() => []);
  return keys
    .filter((k) => k.endsWith(".json"))
    .map((k) => k.replace(/^experiments\//, "").replace(/\.json$/, ""))
    .slice(-limit)
    .reverse();
}

export function videoUrl(e: Experiment) {
  return e.source.kind === "showcase" ? `/showcase/${e.id}.mp4` : `/api/clip/${e.id}`;
}

export function winnerOf(e: Experiment) {
  return e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
}

// a tenth of a pixel is finer than any screen draws it; and a smooth path needs no more than a few hundred points
const r1 = (p: { x: number; y: number }) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
const thin = (pts: { x: number; y: number }[], max: number, keep?: number) => {
  const k = Math.max(1, Math.ceil(pts.length / max));
  return pts.filter((_, i) => i % k === 0 || i === pts.length - 1 || i === keep).map(r1);
};

export function plateData(e: Experiment, opts: { caption?: string; lazyStrobe?: boolean; compact?: boolean } = {}): PlateData {
  const m = e.measured;
  const win = winnerOf(e);
  const lawPx = toPixels(win.fit.predicted, m);
  const n = m.px.length;
  const split = Math.min(n - 1, Math.max(1, Math.round(n * e.trainFrac)));
  const baseT = e.strobe[0]?.t ?? 0;
  // a gallery card shows at most ~80 dots: measurements and law thinned with one stride, so the split still lines up
  const k = opts.compact ? Math.max(1, Math.ceil(n / 80)) : 1;
  const every = <T,>(a: T[]) => (k === 1 ? a : a.filter((_, i) => i % k === 0));
  return {
    video: videoUrl(e),
    width: e.video.width,
    height: e.video.height,
    baseT,
    strobe: opts.lazyStrobe ? [] : strobeOf(e),
    strobeSrc: opts.lazyStrobe ? `/x/${e.id}/strobe.json` : undefined,
    poster: e.source.kind === "showcase" ? `/prints/${e.id}.webp` : undefined,
    measured: every(m.px).map(r1),
    split: Math.round(split / k),
    // the law's path is index-aligned with the measurements (split marks the unseen part)
    law: every(lawPx).map(r1),
    pivot: m.pivot ? r1(m.pivot) : null,
    whatIf: opts.compact ? [] : e.whatIf.map((w) => ({ label: w.label, px: thin(w.px, 160) })),
    caption: opts.caption,
  };
}

export function clipData(e: Experiment) {
  const m = e.measured;
  const win = winnerOf(e);
  const law = toPixels(win.fit.predicted, m);
  const slow = m.slowMotion || 1;
  return {
    video: videoUrl(e),
    width: e.video.width,
    height: e.video.height,
    samples: m.px.map((p, i) => ({ vt: (m.window.t0 + (m.series.t[i] ?? 0)) * slow, x: p.x, y: p.y })),
    law,
    split: Math.min(m.px.length - 1, Math.max(1, Math.round(m.px.length * e.trainFrac))),
  };
}

let recentCache: { at: number; items: { id: string; title: string; headline: string; createdAt: string }[] } | null = null;

/** The latest experiments visitors ran on the live site (cached a minute). */
export async function recentExperiments(limit = 6) {
  if (recentCache && Date.now() - recentCache.at < 60_000) return recentCache.items;
  const ids = await recentIds(40).catch(() => []);
  const items = (await Promise.all(ids.map((id) => getExperiment(id).catch(() => null))))
    // only visitors' own clips, measured by the current method
    .filter((e): e is Experiment => !!e && !e.sample && e.pipeline === PIPELINE)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map((e) => ({ id: e.id, title: e.title, headline: e.headline ?? e.finding, createdAt: e.createdAt }));
  recentCache = { at: Date.now(), items };
  return items;
}

/** The strobe instants with SAM's masks: the heavy part of a print. */
export function strobeOf(e: Experiment): PlateData["strobe"] {
  return e.strobe.filter((s) => s.rle).map((s) => ({ t: s.t, box: s.box, rle: s.rle ? { size: s.rle.size, counts: s.rle.counts } : undefined }));
}

import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Experiment } from "./experiment";
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

export function plateData(e: Experiment, opts: { caption?: string } = {}): PlateData {
  const m = e.measured;
  const win = winnerOf(e);
  const lawPx = toPixels(win.fit.predicted, m);
  const n = m.px.length;
  const split = Math.min(n - 1, Math.max(1, Math.round(n * e.trainFrac)));
  const baseT = e.strobe[0]?.t ?? 0;
  return {
    video: videoUrl(e),
    width: e.video.width,
    height: e.video.height,
    baseT,
    strobe: e.strobe.filter((s) => s.rle).map((s) => ({ t: s.t, box: s.box, rle: s.rle ? { size: s.rle.size, counts: s.rle.counts } : undefined })),
    measured: m.px.map((p) => ({ x: p.x, y: p.y })),
    split,
    law: lawPx,
    pivot: m.pivot ? { x: m.pivot.x, y: m.pivot.y } : null,
    whatIf: e.whatIf.map((w) => ({ label: w.label, px: w.px })),
    caption: opts.caption,
  };
}

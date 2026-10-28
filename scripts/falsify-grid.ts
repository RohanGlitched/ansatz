// The draggable "past | future" line on experiment pages: every candidate law refitted (same code as a run) with the
// split at 30%, 35% … 90%, and its prediction of everything after the split. No model calls; deterministic.
// npx tsx --conditions=react-server scripts/falsify-grid.ts [ids…] -> public/falsify/<id>.json
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { fitLaw } from "../lib/physics/law";
import { toPixels } from "../lib/pixels";
import type { Experiment } from "../lib/experiment";

const ids = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync("data/showcase").filter((f) => f.endsWith(".json") && f !== "order.json").map((f) => f.replace(/\.json$/, ""));
const FRACS = Array.from({ length: 13 }, (_, i) => Math.round((0.3 + i * 0.05) * 100) / 100);
const KEEP = 180;
mkdirSync("public/falsify", { recursive: true });
const r1 = (v: number) => Math.round(v * 10) / 10;
for (const id of ids) {
  const e = JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;
  const m = e.measured;
  const N = m.series.t.length;
  const step = Math.max(1, Math.ceil(N / KEEP));
  const pick = <T,>(a: T[]) => a.filter((_, i) => i % step === 0 || i === a.length - 1);
  const idx = pick(Array.from({ length: N }, (_, i) => i));
  const laws = e.candidates.filter((c) => c.fit?.ok).map((c) => {
    const law = c.fitted ?? c.law;
    const per = FRACS.map((frac) => {
      const f = fitLaw(law, m.series, { trainFrac: frac, starts: 4 });
      const px = f.ok ? toPixels(f.predicted, m) : [];
      return { frac, ok: f.ok, testRms: f.testRms, testZ: f.testZ ?? null, trainZ: f.trainZ ?? null, path: f.ok ? idx.map((i) => [r1(px[i]?.x ?? NaN), r1(px[i]?.y ?? NaN)]) : [] };
    });
    process.stdout.write(".");
    return { id: c.law.id, title: c.law.title, origin: c.origin, rank: c.rank, derivatives: law.derivatives, per };
  });
  const seenAt = new Map(m.px.map((p) => [p.f, p]));
  const out = {
    id, fracs: FRACS, N, sealed: m.split ?? Math.round(N * 0.7),
    width: e.video.width, height: e.video.height, codedWidth: (e.video as { codedWidth?: number }).codedWidth ?? null,
    unit: m.calibration.kind === "none" ? (m.series.ch.theta ? "rad" : "px") : "m",
    t: idx.map((i) => Math.round(m.series.t[i] * 1000) / 1000),
    seen: idx.map((i) => { const p = m.px[i] ?? seenAt.get(m.window.f0 + i); return p ? [r1(p.x), r1(p.y)] : null; }),
    winner: e.winner,
    laws,
  };
  writeFileSync(`public/falsify/${id}.json`, JSON.stringify(out));
  console.log(` ${id}: ${laws.length} laws × ${FRACS.length} splits, ${idx.length} points`);
}

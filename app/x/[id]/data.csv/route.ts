import { csvNum, csvText } from "@/lib/csv";
import { getExperiment, winnerOf } from "@/lib/experiments";

export const runtime = "nodejs";

// a comment line never spans two lines, whatever a title or a meaning contains, and no field after a comma opens as a formula
const one = (s: string) => s.replace(/[\r\n]+/g, " ").replace(/,(\s*)([=+\-@\t])/g, ",$1'$2");
const sig2 = (v: number) => (Number.isFinite(v) ? String(+v.toPrecision(2)) : "");

/** The experiment's data as CSV: every measured frame, the winning law's prediction, and which frames it was fitted on. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = await getExperiment(id);
  if (!e) return new Response("No such experiment.", { status: 404 });
  const win = winnerOf(e);
  const s = e.measured.series;
  const chans = Object.keys(s.ch);
  const nFit = Math.max(3, Math.round(s.t.length * e.trainFrac));
  const lines: string[] = [];
  lines.push(one(`# Ansatz experiment ${e.id}: ${e.title}`));
  lines.push(one(`# law: ${win.law.title} (${win.law.id})`));
  for (const p of win.law.params) {
    const v = win.fit.theta[p.name], sg = win.fit.sigma[p.name];
    // no error bar when even the winner misses the unseen frames by far more than the noise
    const rough = Number.isFinite(win.fit.testZ) && win.fit.testZ! > 5;
    const val = p.fixed || !Number.isFinite(sg) ? `${v} (given)` : rough ? `about ${+v.toPrecision(3)} (no error bar: the law misses the unseen frames by ${+win.fit.testZ!.toPrecision(2)}x the noise)` : `${+v.toPrecision(6)} ± ${sig2(sg)}`;
    lines.push(one(`# ${p.name} = ${val} ${p.unit ?? ""} : ${p.meaning ?? ""}`.trimEnd()));
  }
  lines.push(`# scale: ${e.measured.calibration.metresPerPixel} m per pixel (${e.measured.calibration.kind})`);
  lines.push(`# fitted on the first ${nFit} of ${s.t.length} frames; the rest were predicted unseen`);
  lines.push(["t_s", "x_px", "y_px", ...chans.map((c) => `${c}_measured`), ...chans.map((c) => `${c}_law`), "split"].map(csvText).join(","));
  for (let i = 0; i < s.t.length; i++) {
    const px = e.measured.px[i];
    const cell = (v: number | undefined) => (v != null && Number.isFinite(v) ? String(+v.toPrecision(7)) : "");
    lines.push([cell(s.t[i]), cell(px?.x), cell(px?.y), ...chans.map((c) => cell(s.ch[c][i])), ...chans.map((c) => cell(win.fit.predicted[c]?.[i])), i < nFit ? "fitted" : "unseen"].map(csvNum).join(","));
  }
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ansatz-${e.id}.csv"`, "cache-control": "public, max-age=300" },
  });
}

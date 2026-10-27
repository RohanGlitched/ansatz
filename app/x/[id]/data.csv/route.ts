import { getExperiment, winnerOf } from "@/lib/experiments";

export const runtime = "nodejs";

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
// a comment line never spans two lines, whatever a title or a meaning contains
const one = (s: string) => s.replace(/[\r\n]+/g, " ");
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
    lines.push(one(`# ${p.name} = ${!p.fixed && Number.isFinite(sg) ? `${+v.toPrecision(6)} ± ${sig2(sg)}` : `${v} (given)`} ${p.unit ?? ""} : ${p.meaning ?? ""}`.trimEnd()));
  }
  lines.push(`# scale: ${e.measured.calibration.metresPerPixel} m per pixel (${e.measured.calibration.kind})`);
  lines.push(`# fitted on the first ${nFit} of ${s.t.length} frames; the rest were predicted unseen`);
  lines.push(["t_s", "x_px", "y_px", ...chans.map((c) => `${c}_measured`), ...chans.map((c) => `${c}_law`), "split"].join(","));
  for (let i = 0; i < s.t.length; i++) {
    const px = e.measured.px[i];
    const cell = (v: number | undefined) => (v != null && Number.isFinite(v) ? String(+v.toPrecision(7)) : "");
    lines.push([cell(s.t[i]), cell(px?.x), cell(px?.y), ...chans.map((c) => cell(s.ch[c][i])), ...chans.map((c) => cell(win.fit.predicted[c]?.[i])), i < nFit ? "fitted" : "unseen"].map((v) => q(v)).join(","));
  }
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ansatz-${e.id}.csv"`, "cache-control": "public, max-age=300" },
  });
}

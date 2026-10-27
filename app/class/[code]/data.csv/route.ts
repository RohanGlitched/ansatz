import { getClass } from "@/lib/classes";
import { classRows } from "@/lib/classrows";

export const runtime = "nodejs";

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** The class's results as a spreadsheet: one row per run. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cls = await getClass(code);
  if (!cls) return new Response("No such class.", { status: 404 });
  const rows = await classRows(cls);
  const lines = ["student,experiment,g_m_s2,sigma_m_s2,off_9.81_percent,law,check,run_at,link"];
  for (const r of rows) lines.push([r.student, r.experiment, r.g?.toPrecision(5) ?? "", r.sigma?.toPrecision(2) ?? "", r.offPct?.toFixed(2) ?? "", r.law, r.warn ?? "ok", r.at, `https://ansatz-lab.vercel.app/x/${r.id}`].map((v) => q(String(v))).join(","));
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ansatz-class-${cls.code}.csv"` } });
}

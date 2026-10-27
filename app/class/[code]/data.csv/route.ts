import { getClass } from "@/lib/classes";
import { csvNum, csvText } from "@/lib/csv";
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
  for (const r of rows) lines.push([csvText(String(r.student)), csvText(String(r.experiment)), csvNum(r.g?.toPrecision(5) ?? ""), csvNum(r.sigma?.toPrecision(2) ?? ""), csvNum(r.offPct?.toFixed(2) ?? ""), csvText(String(r.law)), csvText(r.warn ?? "ok"), csvText(String(r.at)), csvText(`https://ansatz-lab.vercel.app/x/${r.id}`)].join(","));
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ansatz-class-${cls.code}.csv"` } });
}

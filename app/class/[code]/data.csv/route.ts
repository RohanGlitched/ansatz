import { getClass } from "@/lib/classes";
import { csvNum, csvText } from "@/lib/csv";
import { classRows } from "@/lib/classrows";
import { fmtPair } from "@/lib/format";

export const runtime = "nodejs";

/** The class's results as a spreadsheet: one row per run, each scored against its own experiment's known value. */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const cls = await getClass(code);
  if (!cls) return new Response("No such class.", { status: 404 });
  const rows = await classRows(cls);
  // value and sigma rounded together, the way the page writes them ("9.806 ± 0.049")
  const pair = (v?: number, s?: number) => (v === undefined ? ["", ""] : fmtPair(v, s ?? NaN).split(" ± ").concat(""));
  const lines = ["run,experiment,quantity,value,sigma,unit,known_value,off_known_percent,length_from,length_m,g_with_sheet,g_with_sheet_sigma,law,check,note,run_at,link"];
  for (const r of rows) {
    const [v, s] = pair(r.value, r.sigma);
    const [gs, ss] = pair(r.gSheet, r.sigmaSheet);
    lines.push(
      [
        csvText(String(r.student)),
        csvText(String(r.experiment)),
        csvText(r.symbol ?? ""),
        csvNum(v),
        csvNum(s),
        csvText(r.unit ?? ""),
        csvNum(r.reference !== undefined ? String(r.reference) : ""),
        csvNum(r.offPct !== undefined ? r.offPct.toFixed(3) : ""),
        csvText(r.lengthFrom ?? ""),
        csvNum(r.lengthM !== undefined ? String(+r.lengthM.toPrecision(4)) : ""),
        csvNum(gs),
        csvNum(ss),
        csvText(r.damping ?? String(r.law)),
        csvText(r.warn ?? "ok"),
        csvText(r.dash ?? ""),
        csvText(String(r.at)),
        csvText(`https://ansatz-lab.vercel.app/x/${r.id}`),
      ].join(","),
    );
  }
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="ansatz-class-${cls.code}.csv"` } });
}

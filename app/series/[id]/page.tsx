import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getExperiment, winnerOf } from "@/lib/experiments";
import { getSeries as series } from "@/lib/series";
import { fitSeries, seriesPoint, stopwatch, STOPWATCH, TAPE_SIGMA_M, type SeriesPoint } from "@/lib/seriesfit";
import { saveTape } from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const s = await series((await params).id);
  return { title: s ? s.title : "Series", description: "A pendulum at several lengths: g from the slope of L against T², the school practical done by video." };
}

const pct = (x: number, d = 2) => `${(x * 100).toFixed(d)}%`;

/** Several runs of one experiment at different lengths, fitted together the way a school practical asks: L against T². */
export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const s = await series((await params).id);
  if (!s) notFound();
  const runs = (await Promise.all(s.ids.map((id) => getExperiment(id).catch(() => null)))).filter((e) => !!e);
  // each run: T from its fitted law; L from the tape when the student gave one (else a length said in the clip, else the sheet)
  const both = runs.map((e) => ({ e, tape: seriesPoint(e, winnerOf(e), s.tape?.[e.id]), sheet: seriesPoint(e, winnerOf(e)) }));
  const pts = both.map((b) => b.tape).filter((p): p is SeriesPoint => !!p);
  const sheetPts = both.map((b) => b.sheet).filter((p): p is SeriesPoint => !!p && p.lengthFrom === "sheet");
  const editable = /^s-[a-z2-9]{8}$/.test(s.id);
  if (pts.length < 2)
    return (
      <article className="wrap" style={{ paddingBlock: "clamp(32px, 5vw, 64px)", display: "grid", gap: 20, maxWidth: 820 }}>
        <h1 style={{ fontSize: "clamp(28px, 3.6vw, 42px)" }}>{s.title}</h1>
        <p className="lede">
          {pts.length} pendulum length{pts.length === 1 ? "" : "s"} so far. A series needs at least two, ideally four (say 40, 60, 80 and 100 cm): film the same pendulum at each length from this link, and type the length you measured with a metre scale under each run. No tape? Keep a paper sheet on the wall and Ansatz reads the length from it, within about 6%.
        </p>
        {editable && runs.length > 0 && <TapeForms s={s} runs={runs.map((e) => ({ id: e.id, title: e.title }))} />}
        <p>
          <Link className="btn" href={`/new?series=${s.id}`}>
            Add a length
          </Link>
        </p>
      </article>
    );
  const fit = fitSeries(pts);
  const allTape = pts.every((p) => p.lengthFrom !== "sheet");
  const sheetFit = !allTape || sheetPts.length < 2 ? null : fitSeries(sheetPts);
  const k = fit.k;
  const W = 560, H = 340, M = 48;
  const maxT2 = Math.max(...pts.map((p) => p.T ** 2)) * 1.12, maxL = Math.max(...pts.map((p) => p.L)) * 1.15;
  const X = (v: number) => M + (v / maxT2) * (W - M - 16), Y = (v: number) => H - M + 12 - (v / maxL) * (H - M - 12);
  const relT = pts.map((p) => p.sT / p.T);
  const sw = stopwatch(1.42);
  const mid = pts.reduce((a, p) => (Math.abs(p.T - 1.42) < Math.abs(a.T - 1.42) ? p : a), pts[0]);
  return (
    <article className="wrap" style={{ paddingBlock: "clamp(32px, 5vw, 64px)", display: "grid", gap: 28, maxWidth: 980 }}>
      <header style={{ display: "grid", gap: 12 }}>
        <p className="small">Series · {pts.length} experiments</p>
        <h1 style={{ fontSize: "clamp(28px, 3.6vw, 42px)" }}>{s.title}</h1>
        <p className="lede">{s.note}</p>
      </header>
      <section style={{ display: "grid", gap: 8 }}>
        <p style={{ fontSize: "clamp(26px, 3vw, 38px)", fontWeight: 650 }} className="num">
          g = {fit.g.toFixed(allTape ? 3 : 2)} ± {fit.sg.toFixed(allTape ? 3 : 2)} ± {(allTape ? fit.sgTape : fit.sgShared).toFixed(allTape ? 3 : 2)} m/s²
        </p>
        {allTape ? (
          <p className="small">
            Lengths from a tape, periods from Ansatz. The first ± is the scatter between runs, which shrinks as you add lengths. The second is what the tape readings allow (±{TAPE_SIGMA_M * 1000} mm a length, pivot to the bob’s centre, an assumed reading error), which now dominates: the periods are known far better than the lengths.{s.tapeNote ? ` ${s.tapeNote}` : ""}
          </p>
        ) : (
          <p className="small">
            The first ± is the scatter between runs, which shrinks as you add lengths. The second is what the runs measured against the sheet share, the sheet’s true size ({Math.round(fit.relShared * 100)}%: a sheet’s size is assumed, and SAM 3.1 reads its edge a few percent short), which no number of runs removes. Type each length you measured with a metre scale below a run and it goes away.
          </p>
        )}
        <p className="small">
          From the slope of L against T² ({(k * 1000).toFixed(1)} mm/s²), g = 4π² × slope.{s.truth ? ` True value: ${s.truth.g} m/s², off by ${Math.abs(((fit.g - s.truth.g) / s.truth.g) * 100).toFixed(allTape ? 2 : 1)}%.` : ""} The single runs gave {pts.map((p) => p.g.toFixed(allTape ? 3 : 2)).join(", ")}.
        </p>
        {sheetFit && (
          <p className="small">
            No tape? The same four clips with each length read from the A4 sheet on the wall give g = {sheetFit.g.toFixed(2)} ± {sheetFit.sg.toFixed(2)} ± {sheetFit.sgShared.toFixed(2)} m/s²{s.truth ? `, ${Math.abs(((sheetFit.g - s.truth.g) / s.truth.g) * 100).toFixed(1)}% off` : ""}: within about 6%, the sheet’s own uncertainty. The periods are the same; only the lengths differ.
          </p>
        )}
      </section>
      <figure>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W }} role="img" aria-label="String length against period squared, with the fitted straight line">
          <line x1={M} x2={W - 16} y1={Y(0)} y2={Y(0)} stroke="var(--rule)" />
          <line x1={M} x2={M} y1={Y(0)} y2={12} stroke="var(--rule)" />
          <line x1={X(0)} y1={Y(0)} x2={X(maxT2)} y2={Y(k * maxT2)} stroke="var(--law)" strokeWidth="2" />
          {pts.map((p) => (
            <g key={p.id}>
              <line x1={X(p.T ** 2)} x2={X(p.T ** 2)} y1={Y(p.L - p.sL)} y2={Y(p.L + p.sL)} stroke="var(--measured)" strokeWidth="1.5" />
              <circle cx={X(p.T ** 2)} cy={Y(p.L)} r="5" fill="var(--measured)" />
            </g>
          ))}
          {[0, 1, 2, 3, 4, 5].filter((v) => v <= maxT2).map((v) => (
            <text key={v} x={X(v)} y={H - 18} fontSize="12" textAnchor="middle" fill="var(--ink-3)">
              {v}
            </text>
          ))}
          {[0, 0.25, 0.5, 0.75, 1, 1.25].filter((v) => v <= maxL).map((v) => (
            <text key={v} x={M - 8} y={Y(v) + 4} fontSize="12" textAnchor="end" fill="var(--ink-3)">
              {v}
            </text>
          ))}
          <text x={W / 2} y={H - 2} fontSize="12" textAnchor="middle" fill="var(--ink-2)">
            T² (s²)
          </text>
          <text x={12} y={16} fontSize="12" fill="var(--ink-2)">
            L (m)
          </text>
        </svg>
      </figure>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 820 }} className="num">
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--ink)" }}>
              <th style={{ padding: 6 }}>Run</th>
              <th style={{ padding: 6 }}>L (m)</th>
              <th style={{ padding: 6 }}>from</th>
              {s.truth && <th style={{ padding: 6 }}>L, true (m)</th>}
              <th style={{ padding: 6 }}>T (s), Ansatz</th>
              <th style={{ padding: 6 }}>T² (s²)</th>
              <th style={{ padding: 6 }}>g, this run alone</th>
            </tr>
          </thead>
          <tbody>
            {pts.map((p) => (
              <tr key={p.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                <td style={{ padding: 6 }}>
                  <Link href={`/x/${p.id}`}>{p.title}</Link>
                </td>
                <td style={{ padding: 6 }}>
                  {p.L.toFixed(3)} ± {p.sL.toFixed(3)}
                </td>
                <td style={{ padding: 6 }}>{p.lengthFrom === "sheet" ? "the sheet" : p.lengthFrom === "tape" ? "tape" : "said in the clip"}</td>
                {s.truth && <td style={{ padding: 6 }}>{s.truth.lengths[s.ids.indexOf(p.id)]?.toFixed(2)}</td>}
                <td style={{ padding: 6 }}>
                  {p.T.toFixed(4)} ± {p.sT.toFixed(4)}
                </td>
                <td style={{ padding: 6 }}>{(p.T ** 2).toFixed(3)}</td>
                <td style={{ padding: 6 }}>
                  {p.g.toFixed(allTape ? 3 : 2)} ± {p.sg.toFixed(allTape ? 3 : 2)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <section style={{ display: "grid", gap: 10, maxWidth: "75ch" }} id="stopwatch">
        <h2 style={{ fontSize: "clamp(20px, 2.2vw, 26px)" }}>Stopwatch vs Ansatz</h2>
        <p>
          The usual practical times {STOPWATCH.swings} swings with a stopwatch. Starting and stopping it by hand costs about {STOPWATCH.reactionS} s of reaction time, spread over the {STOPWATCH.swings} swings: ±{(stopwatch(1).sT * 1000).toFixed(0)} ms a period, ±{pct(sw.relT, 1)} in T and ±{pct(sw.relG, 1)} in g for a 50 cm string (T ≈ 1.42 s). Ansatz fits the period to every frame of the swing: ±{pct(Math.min(...relT), 3)} to ±{pct(Math.max(...relT), 2)} in T on these runs, the fits’ statistical error.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", maxWidth: 720 }} className="num">
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--ink)" }}>
                <th style={{ padding: 6 }}>Run</th>
                <th style={{ padding: 6 }}>T (s)</th>
                <th style={{ padding: 6 }}>Stopwatch ±, T*</th>
                <th style={{ padding: 6 }}>Ansatz ±, T</th>
                <th style={{ padding: 6 }}>g ±, stopwatch* + tape</th>
                <th style={{ padding: 6 }}>g ±, Ansatz + {allTape ? "tape" : "lengths as above"}</th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p) => {
                const st = stopwatch(p.T), rl = p.sL / p.L;
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid var(--rule)" }}>
                    <td style={{ padding: 6 }}>{p.title}</td>
                    <td style={{ padding: 6 }}>{p.T.toFixed(3)}</td>
                    <td style={{ padding: 6 }}>
                      {(st.sT * 1000).toFixed(0)} ms ({pct(st.relT, 2)})
                    </td>
                    <td style={{ padding: 6 }}>
                      {(p.sT * 1000).toFixed(2)} ms ({pct(p.sT / p.T, 3)})
                    </td>
                    <td style={{ padding: 6 }}>{pct(Math.hypot(st.relG, allTape ? rl : TAPE_SIGMA_M / p.L), 1)}</td>
                    <td style={{ padding: 6 }}>{pct(p.sg / p.g, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="small">
          * The stopwatch figures are a typical-reaction-time estimate ({STOPWATCH.reactionS} s over {STOPWATCH.swings} swings), not a measurement: we have not timed these pendulums by hand. Ansatz’s figures are the fits’ statistical errors on rendered clips, which are cleaner than phone footage, so a real clip’s period will be less precise than these; we have not yet measured by how much on a phone clip. With both methods the tape (±{TAPE_SIGMA_M * 1000} mm, assumed) is the other half of g’s error: at {Math.round(mid.L * 100)} cm it alone is ±{pct(TAPE_SIGMA_M / mid.L, 1)}, so with Ansatz timing, the length becomes the limit.
        </p>
      </section>
      {editable && <TapeForms s={s} runs={runs.map((e) => ({ id: e.id, title: e.title }))} />}
      <p className="small" style={{ maxWidth: "75ch" }}>
        The period comes from the fitted law, so it uses every frame of the swing rather than a stopwatch on {STOPWATCH.swings} swings. It is the small-swing period 2π/ω₀ of the fitted law, which is what g = 4π²L/T² assumes; the law itself accounts for the swing’s size and its damping.
      </p>
    </article>
  );
}

/** Where a student types the length measured with a metre scale, run by run (visitor series only). */
function TapeForms({ s, runs }: { s: { id: string; tape?: Record<string, number> }; runs: { id: string; title: string }[] }) {
  return (
    <section style={{ display: "grid", gap: 10, maxWidth: 720 }} id="tape">
      <h2 style={{ fontSize: "clamp(18px, 2vw, 22px)" }}>Lengths from your tape</h2>
      <p className="small">Measure each string with a metre scale, from the pivot to the middle of the bob, and type it here. Ansatz then uses your length with its own period; leave a box empty to use the sheet in view (within about 6%).</p>
      {runs.map((r) => (
        <form key={r.id} action={saveTape} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input type="hidden" name="series" value={s.id} />
          <input type="hidden" name="run" value={r.id} />
          <label style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ minWidth: 160 }}>{r.title}</span>
            <input name="cm" inputMode="decimal" placeholder="length in cm" defaultValue={s.tape?.[r.id] ? +(s.tape[r.id] * 100).toFixed(1) : ""} style={{ width: 130 }} aria-label={`String length for ${r.title}, in centimetres`} />
          </label>
          <button className="btn ghost" type="submit">
            Save
          </button>
        </form>
      ))}
    </section>
  );
}

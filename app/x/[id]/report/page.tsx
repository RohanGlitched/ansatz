import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Tex from "@/components/Tex";
import PrintButton from "@/components/PrintButton";
import { getExperiment, plateData, winnerOf } from "@/lib/experiments";
import { clockCheckFor } from "@/lib/experiment";
import { lawLatex, paramLatex } from "@/lib/latex";
import { prettyUnit } from "@/lib/units";
import { fmtParam, fmtProse } from "@/lib/format";
import { tr } from "@/lib/i18n";
import { LANGUAGES, translation } from "@/lib/translate";
import SeriesFigure from "../SeriesFigure";
import styles from "./report.module.css";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }>; searchParams?: Promise<{ lang?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const e = await getExperiment(id);
  // a missing record is a real 404, rendered on the server
  if (!e) notFound();
  return {
    title: `Lab report: ${e.title}`,
    description: `The printable lab report for “${e.title}”: aim, method, observations, the winning law, every constant with its error bar against the known value, and what was given rather than measured, with spaces for a student’s name.`,
    alternates: { canonical: `/x/${e.id}/report` },
  };
}

/** A one-page lab report in the form a physics practical asks for: aim, method, observations, result, errors. */
export default async function ReportPage({ params, searchParams }: Params) {
  const { id } = await params;
  const q = (await searchParams)?.lang;
  const lang = q && LANGUAGES[q] ? q : undefined;
  const t = tr(lang);
  const e = await getExperiment(id);
  if (!e) notFound();
  const win = winnerOf(e);
  const plate = plateData(e);
  const m = e.measured;
  const lengthUnit = m.calibration.kind === "none" ? "px" : "m";
  const channels = Object.keys(win.fit.predicted).filter((c) => m.series.ch[c]);
  const free = win.law.params.filter((p) => !p.fixed && p.name !== "cal");
  const step = Math.max(1, Math.ceil(m.series.t.length / 14));
  const rows = m.series.t.map((t, i) => ({ t, i })).filter((r) => r.i % step === 0);
  const trans = lang ? await translation(e, lang).catch(() => null) : null;
  const fmt = (v: number, sig = 3) => (Number.isFinite(v) ? String(+v.toPrecision(sig)) : "—");
  // when even the winning law misses its unseen frames by more than five times the noise, its values carry no error bar
  const rough = Number.isFinite(win.fit.testZ) && win.fit.testZ! > 5;
  // the scale sentence and the given lines are English in the record; a showcase translation may carry them by hand
  const scale = trans?.scale ?? m.calibration.note;
  const given = trans?.given?.length === e.given.length ? trans.given : e.given;
  const clockCheck = clockCheckFor(e);
  const finding = fmtProse(trans?.finding ?? e.finding, Object.fromEntries(win.law.params.map((p) => [p.name, { v: win.fit.theta[p.name], s: win.fit.sigma[p.name] }])));
  return (
    <article className={styles.page} lang={lang ?? "en"}>
      {/* on paper the report is the whole page: the site's bar and footer stay on screen only */}
      <style>{"@media print{body>header,body>footer,body>a{display:none!important}body{background:#fff!important}}"}</style>
      <div className={styles.noprint}>
        <PrintButton />
        <a href={`/x/${e.id}${lang ? `?lang=${lang}` : ""}`}>{t("back")}</a>
      </div>
      <header className={styles.head}>
        <p className={styles.small}>{t("made_with", { date: new Date(e.createdAt).toISOString().slice(0, 10) })}</p>
        <h1>{e.title}</h1>
        <div className={styles.student}>
          {[t("name"), t("class"), t("roll"), t("date")].map((f) => (
            <label key={f}>
              {f} <input aria-label={f} />
            </label>
          ))}
        </div>
      </header>

      <h2>{t("aim")}</h2>
      <p>{t("aim_text")}</p>

      <h2>{t("apparatus")}</h2>
      <p>{t("apparatus_text", { frames: e.video.frames, fps: e.video.fps.toFixed(1), size: `${e.video.width}×${e.video.height}`, scale })}</p>

      <h2>{t("method")}</h2>
      <ol>
        <li>{t(e.measured.point === "top" ? "method_1_top" : "method_1_centre", { noun: e.tracking.noun })}</li>
        <li>{t("method_2", { n: e.candidates.length, pct: Math.round(e.trainFrac * 100) })}</li>
        <li>{t("method_3", { pct: Math.round((1 - e.trainFrac) * 100) })}</li>
      </ol>

      <h2>{t("observations")}</h2>
      <table className={`journal ${styles.table} ${styles.obsTable}`}>
        <thead>
          <tr>
            <th className="r">t (s)</th>
            {Object.keys(m.series.ch).map((c) => (
              <th key={c} className="r">
                {c === "theta" ? "θ (rad)" : `${c} (${lengthUnit})`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, i }) => (
            <tr key={i}>
              <td className="r">{t.toFixed(3)}</td>
              {Object.keys(m.series.ch).map((c) => (
                <td key={c} className="r">
                  {fmt(m.series.ch[c][i], 4)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.small}>{step === 1 ? t("every", { n: m.series.t.length }) : t("every_nth", { k: step, n: m.series.t.length })}</p>
      <div className={styles.figs}>
        {channels.slice(0, 2).map((ch) => (
          <SeriesFigure key={ch} t={m.series.t} measured={m.series.ch[ch]} law={win.fit.predicted[ch]} split={plate.split} label={ch === "theta" ? "θ" : ch} unit={ch === "theta" ? "rad" : lengthUnit} height={220} futurePct={Math.round((1 - e.trainFrac) * 100)} />
        ))}
      </div>

      <h2>{t("result")}</h2>
      <p>{t("result_law", { law: win.law.title })}</p>
      <div className={styles.eq}>
        {lawLatex(win.law).map((l, i) => (
          <Tex key={i} display>
            {l}
          </Tex>
        ))}
      </div>
      <table className={`journal ${styles.table}`}>
        <thead>
          <tr>
            <th>{t("quantity")}</th>
            <th>{t("measured")}</th>
            <th>{t("accepted")}</th>
            <th>{t("difference")}</th>
          </tr>
        </thead>
        <tbody>
          {free.map((p) => {
            const c = e.comparisons.find((x) => x.param === p.name);
            return (
              <tr key={p.name}>
                <td>
                  <Tex>{paramLatex(p.name)}</Tex> {p.meaning}
                </td>
                <td>
                  {rough ? `≈ ${fmt(win.fit.theta[p.name], 2)}` : fmtParam(win.fit.theta[p.name], win.fit.sigma[p.name])} {prettyUnit(p.unit)}
                </td>
                <td>{c ? `${fmt(c.reference)} ${prettyUnit(p.unit)}` : "—"}</td>
                <td>{c && c.reference !== 0 ? `${c.errorPct >= 0 ? "+" : ""}${c.errorPct.toFixed(1)}%` : c ? `${c.withinSigma.toFixed(1)}σ` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>{rough ? finding.replace(/([-−]?)(\d+(?:\.\d+)?)\s*±\s*\d+(?:\.\d+)?/g, (_all, sign: string, x: string) => `≈ ${sign}${fmt(Number(x), 2)}`) : finding}</p>

      <h2>{t("conclusion")}</h2>
      <p>{conclusion(e, win.law.title, t, rough, !lang)}</p>

      <h2>{t("precautions")}</h2>
      <ul>
        <li>{t("prec_still")}</li>
        <li>{t("prec_plane")}</li>
        <li>{t("prec_light")}</li>
        {e.observation.motion_kind === "swing" && <li>{t("prec_swing")}</li>}
        <li>{t("prec_clock")}</li>
      </ul>

      <h2>{t("errors")}</h2>
      <ul>
        <li>{t("scale_err", { scale })}</li>
        {[...e.observation.caveats, ...(e.critique && (!e.critique.winnerId || e.critique.winnerId === e.winner) ? e.critique.caveats : [])].slice(0, 5).map((c, i) => (
          <li key={i}>{c}</li>
        ))}
        <li>{t("given", { given: given.length ? given.join("; ") : t("nothing") })}</li>
        {/* the clock check is stated in English only (its reasons are not in the translated strings) */}
        {!lang && <li>{clockCheck.why}</li>}
      </ul>
    </article>
  );
}

/** One paragraph a student can stand behind: the law, how well its constants agree with accepted values, and any clock doubt. */
function conclusion(e: NonNullable<Awaited<ReturnType<typeof getExperiment>>>, law: string, t: ReturnType<typeof tr>, rough: boolean, english: boolean) {
  // a law that won a tie (within the noise, the simpler law wins) did not predict better than every alternative: say what it did
  const win = e.candidates.find((c) => c.law.id === e.winner) ?? e.candidates[0];
  const tieWon = e.candidates.some((c) => c.fit.ok && c.law.id !== win.law.id && c.fit.testRms < win.fit.testRms);
  const parts = [t(tieWon ? "conc_law_tie" : "conc_law", { law })];
  // a rough fit has no error bar to agree within, so no agreement is claimed
  for (const c of rough ? [] : e.comparisons.filter((x) => x.reference !== 0).slice(0, 2)) {
    const n = c.withinSigma;
    parts.push(t(Number.isFinite(n) && n <= 2 ? "conc_agree" : "conc_differ", { q: c.param, label: c.label, pct: Math.abs(c.errorPct).toFixed(1) }));
  }
  // the translated sentence says "slower"; a clip whose gravity came out too strong plays faster, which is said in English only
  if (e.clock && e.clock.factor >= 1) parts.push(t("conc_clock", { f: e.clock.factor.toFixed(1) }));
  else if (e.clock && english) parts.push(`This points to the clip’s clock rather than the physics: the clip most likely plays about ${(1 / e.clock.factor).toFixed(1)}× faster than real life.`);
  return parts.join(" ");
}

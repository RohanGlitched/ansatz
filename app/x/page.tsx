import type { Metadata } from "next";
import Link from "next/link";
import Tex from "@/components/Tex";
import Plate, { Note, Page, Section } from "@/components/book/Plate";
import { getExperiment, recentExperiments, showcaseIds, winnerOf } from "@/lib/experiments";
import { getSeries } from "@/lib/series";
import { lawLatex } from "@/lib/latex";
import type { Experiment } from "@/lib/experiment";
import { fmtOff, summarise, type Summary } from "./summary";
import styles from "./index.module.css";
import { BENCH_FILES } from "@/app/bench/files";

// Muse Wonder is called in by code when the leading law misses its fitted frames by more than this many times the
// noise (lib/experiment.ts reads the same setting)
const POOR_FIT = Number(process.env.WONDER_POOR_FIT ?? 6);

// the shipped runs change only with a deploy; the visitors' runs are read from storage, so the page is rebuilt at most
// once a minute (force-static keeps that uncached storage read from turning it into a per-request render)
export const dynamic = "force-static";
export const revalidate = 60;

export const metadata: Metadata = {
  title: "Every experiment",
  description: "The catalogue of Ansatz: every experiment printed as a cyanotype, with the law that won, the constant it measured against the known value, and links to the lab report, the data as CSV and the raw record as JSON.",
  alternates: { canonical: "/x" },
};

const eqOf = (e: Experiment) => {
  const l = lawLatex(winnerOf(e).law);
  return l[l.length > 1 ? 1 : 0] ?? "";
};

function Value({ s }: { s: Summary }) {
  return (
    <>
      {s.value}
      {s.unit ? (s.unit === "×" ? "×" : ` ${s.unit}`) : ""}
    </>
  );
}

const isClose = (s: Summary) => s.offPct !== undefined && (Math.abs(s.offPct) <= 5 || (s.sigmas ?? Infinity) <= 2);

/**
 * One specimen of the catalogue: the clip's frames printed as a cyanotype (hovering or focusing it exposes the print
 * back to the clip's own colours), its figure letter, title, winning law, finding, measured value and credit.
 */
function Specimen({ e, fig, copy }: { e: Experiment; fig: string; copy?: boolean }) {
  const s = summarise(e);
  const w = winnerOf(e);
  return (
    <li className={styles.spec}>
      <Link href={`/x/${e.id}`} className={styles.printLink} tabIndex={-1} aria-hidden="true">
        <span className={styles.print}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/prints/${e.id}.webp`} alt="" className={styles.orig} loading="lazy" decoding="async" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/prints/${e.id}.webp`} alt="" className={styles.cyan} loading="lazy" decoding="async" />
        </span>
      </Link>
      <p className={styles.fig}>
        Fig. {fig}
        {copy && <span className={styles.copy}>a copy we altered</span>}
      </p>
      <h3 className={styles.ctitle}>
        <Link href={`/x/${e.id}`}>{e.title}</Link>
      </h3>
      <p className={styles.lawName}>{w.law.title}</p>
      <div className={styles.ceq}>
        <Tex>{eqOf(e)}</Tex>
      </div>
      <p className={styles.cfind}>{e.headline ?? e.finding}</p>
      {s && (
        <dl className={styles.result}>
          <div>
            <dt>{s.what}</dt>
            <dd className={styles.measured}>
              <Value s={s} />
            </dd>
          </div>
          {s.known && (
            <div>
              <dt>Known{s.known.source !== s.what ? `, ${s.known.source}` : ""}</dt>
              <dd>{s.known.value}</dd>
            </div>
          )}
          {s.offPct !== undefined && (
            <div>
              <dt>Off by</dt>
              <dd className={isClose(s) ? styles.ok : styles.far}>
                {fmtOff(s.offPct)}
                {s.sigmas !== undefined && <span className={styles.sig}> ({s.sigmas.toFixed(1)}σ)</span>}
              </dd>
            </div>
          )}
        </dl>
      )}
      {s?.also && <p className={styles.also}>Also: {s.also}.</p>}
      {s?.note && <p className={styles.also}>{s.note}</p>}
      <p className={styles.credit}>{e.source.credit}</p>
      <p className={styles.files}>
        <a href={`/x/${e.id}/report`}>Lab report</a>
        <a href={`/x/${e.id}/data.csv`}>Data (CSV)</a>
        <a href={`/x/${e.id}/record.json`}>Raw record (JSON)</a>
      </p>
    </li>
  );
}

export default async function ExperimentsIndex() {
  const ids = await showcaseIds();
  const exps = (await Promise.all(ids.map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => !!e);
  const series = await getSeries("pendulum-lengths").catch(() => null);
  const runs = series ? (await Promise.all(series.ids.map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => !!e) : [];
  const recent = await recentExperiments().catch(() => []);
  const rows = exps.map((e) => ({ e, s: summarise(e), w: winnerOf(e) }));
  const seriesRows = runs.map((e) => ({ e, s: summarise(e), w: winnerOf(e) }));
  const known = rows.filter((r) => r.s?.known && r.s.offPct !== undefined);
  // footage nobody rendered, and among it the copies we altered ourselves (the Moon clip slowed in secret)
  const notRendered = exps.filter((e) => !/^Rendered/.test(e.source.credit ?? ""));
  const copies = notRendered.filter((e) => /\bby us\b/i.test(e.source.credit ?? ""));
  const real = notRendered.filter((e) => !copies.includes(e));
  const rendered = exps.filter((e) => /^Rendered/.test(e.source.credit ?? ""));
  // figure letters run through the whole book, in catalogue order
  const filmed = [...real, ...copies];
  const letter = (i: number) => String.fromCharCode(97 + i);

  return (
    <>
      <header className={styles.title}>
        <div>
          <p className={styles.kicker}>The catalogue</p>
          <h1>Every experiment</h1>
        </div>
        <div className={styles.abstract}>
          <p>
            {exps.length} clips, each measured by SAM 3.1, given laws by Muse Spark (and Muse Wonder when the referee asks for one or the leading law misses its fitted frames by more than {POOR_FIT}× the noise), and ranked on the part of the motion no law was fitted to. {real.length} are real footage{copies.length ? ` (and ${copies.length} ${copies.length === 1 ? "is a copy" : "are copies"} we slowed)` : ""}; the rest are renders whose physics we set, so the answer is known. {known.length} of the {exps.length} carry a known value to check against, with how far off Ansatz came.
          </p>
          <nav className={styles.jump} aria-label="On this page">
            <a href="#filmed">Filmed</a>
            <a href="#rendered">Rendered, with known answers</a>
            {seriesRows.length > 0 && <a href="#series">One pendulum, four lengths</a>}
            <a href="#visitors">Run by visitors</a>
            <a href="#table">Every number in one table</a>
            <a href="#agents">For agents and scripts</a>
          </nav>
        </div>
      </header>

      <Plate
        n="I"
        id="filmed"
        title="Filmed: footage nobody rendered, so nobody set its physics."
        caption={copies.length ? "The slowed Moon clip is a copy we altered ourselves, as a test; its credit says how. Hover or focus a print to see the clip in its own colours." : "Hover or focus a print to see the clip in its own colours."}
      >
        <ul className={styles.catalogue}>
          {filmed.map((e, i) => (
            <Specimen key={e.id} e={e} fig={letter(i)} copy={copies.includes(e)} />
          ))}
        </ul>
      </Plate>

      <Plate n="II" id="rendered" title="Rendered with known physics, so the answer is known." caption="Each credit line states the physics the clip was rendered with; the off-by figure is Ansatz against those settings.">
        <ul className={styles.catalogue}>
          {rendered.map((e, i) => (
            <Specimen key={e.id} e={e} fig={letter(filmed.length + i)} />
          ))}
        </ul>
      </Plate>

      <Page className={styles.page}>
        {series && seriesRows.length > 0 && (
          <>
            <Section n={1} title={series.title} id="series">
              <p>
                The school practical: one rendered pendulum (true g 9.81 m/s²) filmed at {seriesRows.length} string lengths. Each run below takes its length from the A4 sheet on the wall; the <Link href={`/series/${series.id}`}>series page</Link> uses tape-measured lengths instead and fits g from the slope of L against T², as the practical asks.
              </p>
              <div className={styles.scroll} tabIndex={0} role="region" aria-label={series.title}>
                <table className={`journal num ${styles.table}`}>
                  <thead>
                    <tr>
                      <th scope="col">Run</th>
                      <th scope="col">Winning law</th>
                      <th scope="col" className="r">
                        g, length from the sheet
                      </th>
                      <th scope="col" className="r">
                        Off by
                      </th>
                      <th scope="col">Files</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seriesRows.map(({ e, s, w }) => (
                      <tr key={e.id}>
                        <th scope="row">
                          <Link href={`/x/${e.id}`}>{e.title}</Link>
                        </th>
                        <td>{w.law.title}</td>
                        <td className={`r ${styles.measuredInk}`}>{s ? <Value s={s} /> : "—"}</td>
                        <td className="r">{fmtOff(s?.offPct) || "—"}</td>
                        <td className={styles.filesCell}>
                          <a href={`/x/${e.id}/report`}>report</a> <a href={`/x/${e.id}/data.csv`}>CSV</a> <a href={`/x/${e.id}/record.json`}>JSON</a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className={styles.act}>
                <Link className="btn ghost" href={`/series/${series.id}`}>
                  Open the series: g from L against T²
                </Link>
              </p>
            </Section>
            <Note who="Given, not measured">The sheet&rsquo;s size is assumed (A4, 29.7 cm), so every length read from it shares its few-percent error; a tape removes it.</Note>
          </>
        )}

        <Section n={seriesRows.length ? 2 : 1} title="Run by visitors" id="visitors">
          {recent.length > 0 ? (
            <>
              <p>The latest clips visitors ran on the site, measured by the current method. Nothing here was rendered or chosen by us.</p>
              <ol className={styles.visitors}>
                {recent.map((r) => (
                  <li key={r.id}>
                    <Link href={`/x/${r.id}`} className={styles.vTitle}>
                      {r.title}
                    </Link>
                    <span className={styles.vFind}>{r.headline}</span>
                    <span className={styles.vWhen}>{new Date(r.createdAt).toUTCString().slice(5, 22)} UTC</span>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>
              No visitor has run a clip with the current method yet. <Link href="/new">Run an experiment</Link> and it appears here.
            </p>
          )}
        </Section>
        <Note who="Kept">Visitors&rsquo; clips are kept for two days; their results stay.</Note>

        <Section n={seriesRows.length ? 3 : 2} title="Every number in one table" id="table">
          <p>
            The same figures as above, one row per experiment, for reading side by side or copying out. Values carry their one-standard-deviation error; &ldquo;about&rdquo; means the winning law missed its unseen frames by more than five times the noise, so no error bar is given.
          </p>
        </Section>
        <Note who="code">Every number is read from the stored record; none is typed by hand.</Note>
      </Page>

      <div className={styles.wideTable}>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Every number in one table">
          <table className={`journal num ${styles.table}`}>
            <thead>
              <tr>
                <th scope="col">Fig.</th>
                <th scope="col">Experiment</th>
                <th scope="col">Winning law</th>
                <th scope="col">Quantity</th>
                <th scope="col" className="r">
                  Measured
                </th>
                <th scope="col" className="r">
                  Known
                </th>
                <th scope="col" className="r">
                  Off by
                </th>
              </tr>
            </thead>
            <tbody>
              {[...filmed, ...rendered].map((e, i) => {
                const r = rows.find((x) => x.e.id === e.id)!;
                return (
                  <tr key={e.id}>
                    <td className={styles.figCell}>{letter(i)}</td>
                    <th scope="row">
                      <Link href={`/x/${e.id}`}>{e.title}</Link>
                    </th>
                    <td>{r.w.law.title}</td>
                    <td className={styles.qty}>{r.s?.what ?? "—"}</td>
                    <td className={`r ${styles.measuredInk}`}>{r.s ? <Value s={r.s} /> : "—"}</td>
                    <td className="r">{r.s?.known?.value ?? "—"}</td>
                    <td className="r">{fmtOff(r.s?.offPct) || "—"}</td>
                  </tr>
                );
              })}
              {seriesRows.map(({ e, s, w }) => (
                <tr key={e.id}>
                  <td className={styles.figCell} />
                  <th scope="row">
                    <Link href={`/x/${e.id}`}>{e.title}</Link>
                  </th>
                  <td>{w.law.title}</td>
                  <td className={styles.qty}>{s?.what ?? "—"}</td>
                  <td className={`r ${styles.measuredInk}`}>{s ? <Value s={s} /> : "—"}</td>
                  <td className="r">{s?.known?.value ?? "—"}</td>
                  <td className="r">{fmtOff(s?.offPct) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Page className={`${styles.page} ${styles.pageEnd}`}>
        <Section n={seriesRows.length ? 4 : 3} title="For agents and scripts" id="agents">
          <p>Every page is server-rendered, and every number on it comes from a file you can fetch directly.</p>
          <dl className={styles.endpoints}>
            <dt>
              <a href="/llms.txt">/llms.txt</a>
            </dt>
            <dd>A plain-text guide: every page, what it proves, and every headline number with its label and source.</dd>
            <dt>
              <code>/x/&lt;id&gt;/record.json</code>
            </dt>
            <dd>The stored experiment: observation, every candidate law with its fit, the referee’s critique, Muse Wonder’s attempts and the model ledger.</dd>
            <dt>
              <code>/x/&lt;id&gt;/data.csv</code>
            </dt>
            <dd>Every measured frame beside the winning law’s prediction, marked fitted or unseen.</dd>
            <dt>
              <a href="/bench">/bench</a>
            </dt>
            <dd>
              The benchmark files behind /proof and the series page, read-only:{" "}
              {Object.keys(BENCH_FILES).map((f, i, all) => (
                <span key={f}>
                  <a href={`/bench/${f}`}>{f.replace(/\.json$/, "")}</a>
                  {i < all.length - 2 ? ", " : i === all.length - 2 ? " and " : "."}
                </span>
              ))}
            </dd>
            <dt>
              <a href="/api/health">/api/health</a>
            </dt>
            <dd>When each Meta model last answered.</dd>
          </dl>
          <p className={styles.rule}>
            Please never POST to /api/run or /api/upload: they run paid models. The recorded replays at <a href="/new?replay=hardening-spring">/new?replay=hardening-spring</a> show a full run for free.
          </p>
          <p className={styles.act}>
            <Link className="btn" href="/judges">
              For judges: the case in one page
            </Link>
            <Link className="btn ghost" href="/proof">
              Proof: the benchmark
            </Link>
          </p>
        </Section>
        <Note who="Courtesy">The replays call no model, so an agent can watch a whole run without spending anyone&rsquo;s credits.</Note>
      </Page>
    </>
  );
}

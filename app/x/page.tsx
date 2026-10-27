import type { Metadata } from "next";
import Link from "next/link";
import Tex from "@/components/Tex";
import { stripGeometry } from "@/components/strip";
import strip from "@/components/StripCard.module.css";
import { getExperiment, showcaseIds, winnerOf } from "@/lib/experiments";
import { getSeries } from "@/lib/series";
import { lawLatex } from "@/lib/latex";
import type { Experiment } from "@/lib/experiment";
import { fmtOff, summarise, type Summary } from "./summary";
import styles from "./index.module.css";
import { BENCH_FILES } from "@/app/bench/files";

// Muse Wonder is called in by code when the leading law misses its fitted frames by more than this many times the
// noise (lib/experiment.ts reads the same setting)
const POOR_FIT = Number(process.env.WONDER_POOR_FIT ?? 6);

// every row is read from runs that ship with the site; they change only with a deploy
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Every experiment",
  description: "Every Ansatz experiment in one list: the photo-finish of each clip, the law that won, the constant it measured against the known value, and links to the lab report, the data as CSV and the raw record as JSON.",
  alternates: { canonical: "/x" },
};

const eqOf = (e: Experiment) => {
  const l = lawLatex(winnerOf(e).law);
  return l[l.length > 1 ? 1 : 0] ?? "";
};

/**
 * The gallery's print without the hover animation: the photo-finish strip, the frames no law saw shaded, and the winning
 * law across the whole clip. A list of every run stays light this way (the animated card carries a dot per frame).
 */
function Thumb({ e }: { e: Experiment }) {
  const g = stripGeometry(e);
  if (!g) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/prints/${e.id}.webp`} alt="" loading="lazy" />;
  }
  const { W, H, X, split, win, pathOf } = g;
  const law = pathOf(win);
  return (
    <div className={strip.strip}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/slits/${e.id}.webp`} alt={`Photo-finish of the clip: one slice per frame through the ${e.tracking.noun}, with the winning law drawn across it`} loading="lazy" decoding="async" />
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {split && <rect x={X(split.f)} y={0} width={W - X(split.f)} height={H} className={strip.unseen} />}
        {split && <line x1={X(split.f)} x2={X(split.f)} y1={0} y2={H} className={strip.splitLine} vectorEffect="non-scaling-stroke" />}
        <path d={law} className={strip.lawHalo} vectorEffect="non-scaling-stroke" />
        <path d={law} className={strip.law} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function Value({ s }: { s: Summary }) {
  return (
    <>
      {s.value}
      {s.unit ? (s.unit === "×" ? "×" : ` ${s.unit}`) : ""}
    </>
  );
}

export default async function ExperimentsIndex() {
  const ids = await showcaseIds();
  const exps = (await Promise.all(ids.map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => !!e);
  const series = await getSeries("pendulum-lengths").catch(() => null);
  const runs = series ? (await Promise.all(series.ids.map((id) => getExperiment(id).catch(() => null)))).filter((e): e is Experiment => !!e) : [];
  const rows = exps.map((e) => ({ e, s: summarise(e), w: winnerOf(e) }));
  const seriesRows = runs.map((e) => ({ e, s: summarise(e), w: winnerOf(e) }));
  const known = rows.filter((r) => r.s?.known && r.s.offPct !== undefined);
  // footage nobody rendered, and among it the copies we altered ourselves (the Moon clip slowed in secret)
  const notRendered = exps.filter((e) => !/^Rendered/.test(e.source.credit ?? ""));
  const copies = notRendered.filter((e) => /\bby us\b/i.test(e.source.credit ?? ""));
  const real = notRendered.filter((e) => !copies.includes(e));

  return (
    <>
      <header className={`wrap ${styles.head}`}>
        <h1 className={styles.h1}>Every experiment</h1>
        <p className="lede">
          {exps.length} clips, each measured by SAM 3.1, given laws by Muse Spark (and Muse Wonder when the referee asks for one or the leading law misses its fitted frames by more than {POOR_FIT}× the noise), and ranked on the part of the motion no law was fitted to. {real.length} are real footage{copies.length ? ` (and ${copies.length} ${copies.length === 1 ? "is a copy" : "are copies"} we slowed)` : ""}; the rest are renders whose physics we set, so the answer is known. {known.length} of the {exps.length} carry a known value to check against, with how far off Ansatz came.
        </p>
        <nav className={styles.jump} aria-label="On this page">
          <a href="#showcase">The {exps.length} experiments</a>
          {seriesRows.length > 0 && <a href="#series">One pendulum, four lengths</a>}
          <a href="#table">Every number in one table</a>
          <a href="#agents">For agents and scripts</a>
        </nav>
      </header>

      <section id="showcase" className={styles.list} aria-label="Experiments">
        <ol className="wrap">
          {rows.map(({ e, s, w }, i) => (
            <li key={e.id} className={styles.row}>
              <Link href={`/x/${e.id}`} className={styles.thumb} aria-label={`Open ${e.title}`} tabIndex={-1}>
                <Thumb e={e} />
              </Link>
              <div className={styles.body}>
                <h2 className={styles.title}>
                  <span className={styles.plate}>Plate {i + 1}.</span> <Link href={`/x/${e.id}`}>{e.title}</Link>
                </h2>
                <p className={styles.law}>
                  <span className={styles.lawName}>{w.law.title}</span>
                  <span className={styles.eq} aria-hidden="true">
                    <Tex>{eqOf(e)}</Tex>
                  </span>
                </p>
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
                        <dt>Known</dt>
                        <dd>
                          {s.known.value}
                          {s.known.source !== s.what && <span className={styles.src}> ({s.known.source})</span>}
                        </dd>
                      </div>
                    )}
                    {s.offPct !== undefined && (
                      <div>
                        <dt>Off by</dt>
                        <dd className={Math.abs(s.offPct) <= 5 || (s.sigmas ?? Infinity) <= 2 ? styles.ok : styles.far}>
                          {fmtOff(s.offPct)}
                          {s.sigmas !== undefined && <span className={styles.src}> ({s.sigmas.toFixed(1)}σ)</span>}
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
                {s?.also && <p className={styles.also}>Also: {s.also}.</p>}
                {s?.note && <p className={styles.also}>{s.note}</p>}
                <p className={styles.credit}>{e.source.credit}</p>
                <p className={styles.links}>
                  <Link href={`/x/${e.id}`}>Open the experiment</Link>
                  <a href={`/x/${e.id}/report`}>Lab report</a>
                  <a href={`/x/${e.id}/data.csv`}>Data (CSV)</a>
                  <a href={`/x/${e.id}/record.json`}>Raw record (JSON)</a>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {series && seriesRows.length > 0 && (
        <section id="series" className={`section ${styles.band}`}>
          <div className="wrap">
            <h2>{series.title}</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              The school practical: one rendered pendulum (true g 9.81 m/s²) filmed at {seriesRows.length} string lengths. Each run below takes its length from the A4 sheet on the wall; the <Link href={`/series/${series.id}`}>series page</Link> uses tape-measured lengths instead and fits g from the slope of L against T², as the practical asks.
            </p>
            <div className={styles.scroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Run</th>
                    <th scope="col">Winning law</th>
                    <th scope="col">g, length from the sheet</th>
                    <th scope="col">Off by</th>
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
                      <td className={styles.measured}>{s ? <Value s={s} /> : "—"}</td>
                      <td>{fmtOff(s?.offPct)}</td>
                      <td className={styles.files}>
                        <a href={`/x/${e.id}/report`}>report</a> <a href={`/x/${e.id}/data.csv`}>CSV</a> <a href={`/x/${e.id}/record.json`}>JSON</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ marginTop: 20 }}>
              <Link className="btn ghost" href={`/series/${series.id}`}>
                Open the series: g from L against T²
              </Link>
            </p>
          </div>
        </section>
      )}

      <section id="table" className="section">
        <div className="wrap">
          <h2>Every number in one table</h2>
          <p className="lede" style={{ marginTop: 12 }}>
            The same figures as above, one row per experiment, for reading side by side or copying out. Values carry their one-standard-deviation error; “about” means the winning law missed its unseen frames by more than five times the noise, so no error bar is given.
          </p>
          <div className={styles.scroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Experiment</th>
                  <th scope="col">Winning law</th>
                  <th scope="col">Quantity</th>
                  <th scope="col">Measured</th>
                  <th scope="col">Known</th>
                  <th scope="col">Off by</th>
                </tr>
              </thead>
              <tbody>
                {[...rows, ...seriesRows].map(({ e, s, w }) => (
                  <tr key={e.id}>
                    <th scope="row">
                      <Link href={`/x/${e.id}`}>{e.title}</Link>
                    </th>
                    <td>{w.law.title}</td>
                    <td>{s?.what ?? "—"}</td>
                    <td className={styles.measured}>{s ? <Value s={s} /> : "—"}</td>
                    <td>{s?.known?.value ?? "—"}</td>
                    <td>{fmtOff(s?.offPct) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section id="agents" className={styles.agents}>
        <div className="wrap">
          <h2>For agents and scripts</h2>
          <p className={styles.agentsLede}>Every page is server-rendered, and every number on it comes from a file you can fetch directly.</p>
          <dl className={styles.endpoints}>
            <div>
              <dt>
                <a href="/llms.txt">/llms.txt</a>
              </dt>
              <dd>A plain-text guide: every page, what it proves, and every headline number with its label and source.</dd>
            </div>
            <div>
              <dt>
                <code>/x/&lt;id&gt;/record.json</code>
              </dt>
              <dd>The stored experiment: observation, every candidate law with its fit, the referee’s critique, Muse Wonder’s attempts and the model ledger.</dd>
            </div>
            <div>
              <dt>
                <code>/x/&lt;id&gt;/data.csv</code>
              </dt>
              <dd>Every measured frame beside the winning law’s prediction, marked fitted or unseen.</dd>
            </div>
            <div>
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
            </div>
            <div>
              <dt>
                <a href="/api/health">/api/health</a>
              </dt>
              <dd>When each Meta model last answered.</dd>
            </div>
          </dl>
          <p className={styles.rule}>Please never POST to /api/run or /api/upload: they run paid models. The recorded replays at <a href="/new?replay=hardening-spring">/new?replay=hardening-spring</a> show a full run for free.</p>
          <p className={styles.next}>
            <Link className="btn" href="/judges">
              For judges: the case in one page
            </Link>
            <Link className="btn ghost" href="/proof">
              Proof: the benchmark
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

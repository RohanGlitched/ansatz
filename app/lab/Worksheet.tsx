import type { Sheet } from "./sheets";
import styles from "./lab.module.css";

const pageOf = (s: Sheet, n: number) => s.page.replace("{n}", String(n));

/** Two A4 pages of the pendulum worksheet in one language, set on screen as sheets lying on the page. */
export default function Worksheet({ s, fontClass = "" }: { s: Sheet; fontClass?: string }) {
  return (
    <div className={`${styles.wsSet} ${fontClass}`} lang={s.lang} data-lang={s.lang}>
      <section className={styles.wsPage} aria-label={`${s.title}, ${pageOf(s, 1)}`}>
        <header className={styles.wsHead}>
          <p className={styles.wsKicker}>
            <span>{s.kicker}</span>
            <span>{pageOf(s, 1)}</span>
          </p>
          <h3 className={styles.wsTitle}>{s.title}</h3>
          <p className={styles.wsRefs}>{s.refs}</p>
        </header>
        <div className={styles.wsFields}>
          {s.fields.map((f) => (
            <span key={f} className={styles.wsField}>
              {f}
              <i />
            </span>
          ))}
        </div>
        <h4 className={styles.wsH}>{s.aimH}</h4>
        <p>{s.aim}</p>
        <h4 className={styles.wsH}>{s.needH}</h4>
        <p>{s.need}</p>
        <h4 className={styles.wsH}>{s.filmH}</h4>
        <ul className={styles.wsChecks}>
          {s.film.map((f) => (
            <li key={f}>
              <span className={styles.wsBox} aria-hidden="true" />
              {f}
            </li>
          ))}
        </ul>
        <h4 className={styles.wsH}>{s.tableH}</h4>
        <table className={styles.wsTable}>
          <thead>
            <tr>
              {s.cols.map((c) => (
                <th key={c} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((r) => (
              <tr key={r}>
                <td>{r}</td>
                {s.cols.slice(1).map((c) => (
                  <td key={c} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.wsLine}>
          {s.runLine}
          <i />
        </p>
        <p className={styles.wsFoot}>{s.foot}</p>
      </section>

      <section className={styles.wsPage} aria-label={`${s.title}, ${pageOf(s, 2)}`}>
        <header className={styles.wsHead}>
          <p className={styles.wsKicker}>
            <span>{s.kicker}</span>
            <span>{pageOf(s, 2)}</span>
          </p>
        </header>
        <h4 className={styles.wsH}>{s.graphH}</h4>
        <div className={styles.wsGraphs}>
          {s.graphs.map((g, i) => (
            <figure key={g} className={styles.wsGraph}>
              <div className={styles.wsGrid} aria-hidden="true">
                <span className={styles.wsAxisY}>{s.axes[i * 2 + 1]}</span>
                <span className={styles.wsAxisX}>{s.axes[i * 2]}</span>
              </div>
              <figcaption>{g}</figcaption>
            </figure>
          ))}
        </div>
        <h4 className={styles.wsH}>{s.calcH}</h4>
        <ol className={styles.wsCalc}>
          {s.calc.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ol>
        <h4 className={styles.wsH}>{s.extH}</h4>
        <ul className={styles.wsCalc}>
          {s.ext.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <h4 className={styles.wsH}>{s.qH}</h4>
        <ol className={styles.wsQs}>
          {s.qs.map((q) => (
            <li key={q}>
              {q}
              <i />
            </li>
          ))}
        </ol>
        <div className={styles.wsSign}>
          {s.teacher.map((t) => (
            <span key={t} className={styles.wsField}>
              {t}
              <i />
            </span>
          ))}
        </div>
        <p className={styles.wsFoot}>{s.foot}</p>
      </section>
    </div>
  );
}

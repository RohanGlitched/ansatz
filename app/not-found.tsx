import type { Metadata } from "next";
import Link from "next/link";
import styles from "./not-found.module.css";

export const metadata: Metadata = { title: "Not found" };

const WAYS = [
  { href: "/", title: "Home", what: "The Moon's gravity, measured from 1972 television, and the slowed copy Ansatz caught." },
  { href: "/x", title: "Every experiment", what: "Each run with its winning law, the constant it measured and how far off the known value is." },
  { href: "/judges", title: "For judges", what: "The case in one page: the criteria, a three-minute tour and a link for every number." },
  { href: "/proof", title: "Proof", what: "The benchmark on 28 clips with known answers, and how each model is checked." },
  { href: "/new", title: "Run an experiment", what: "Film or upload a clip, or watch a recorded run for free." },
];

/** The page for a wrong address: what may have happened, and the five places worth going instead. */
export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={`wrap ${styles.inner}`}>
        <p className={styles.code}>404</p>
        <h1 className={styles.h1}>Nothing moves here.</h1>
        <p className={styles.lede}>
          That page doesn’t exist, or the experiment it pointed to has expired. Visitors’ clips are kept for two days; their results stay. Experiment addresses look like <code>/x/moon-jump</code>.
        </p>
        <ul className={styles.ways}>
          {WAYS.map((w) => (
            <li key={w.href}>
              <Link href={w.href}>
                <span className={styles.wayTitle}>{w.title}</span>
                <span className={styles.wayWhat}>{w.what}</span>
                <span className={styles.wayHref}>{w.href}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className={styles.small}>
          An agent? <a href="/llms.txt">/llms.txt</a> lists every page and every number with its source.
        </p>
      </div>
    </div>
  );
}

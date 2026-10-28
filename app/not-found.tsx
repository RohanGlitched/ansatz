import type { Metadata } from "next";
import Link from "next/link";
import styles from "./not-found.module.css";

export const metadata: Metadata = { title: "Not found" };

const WAYS = [
  { href: "/", title: "Home", what: "The Moon’s gravity, measured from 1972 television, and the slowed copy Ansatz caught." },
  { href: "/x", title: "Every experiment", what: "Each run with its winning law, the constant it measured and how far off the known value is." },
  { href: "/new", title: "Run an experiment", what: "Film or upload a clip, or watch a recorded run for free." },
  { href: "/judges", title: "For judges", what: "The case in one page: the criteria, a three-minute tour and a link for every number." },
];

/** The page for a wrong address: an unexposed plate, what may have happened, and the ways back. */
export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.inner}>
        <figure className={styles.figure} aria-hidden="true">
          <div className={styles.sheet}>
            {/* a law in white ink with no measurement on it: the plate was never exposed */}
            <svg viewBox="0 0 400 260" className={styles.blank}>
              <line x1="40" x2="360" y1="220" y2="220" className={styles.axis} />
              <path d="M60 220 Q200 -70 340 220" className={styles.law} />
              <circle cx="60" cy="220" r="6" className={styles.dot} />
              <text x="200" y="244" textAnchor="middle" className={styles.lab}>
                no frames measured
              </text>
            </svg>
          </div>
          <figcaption className={styles.cap}>
            <span className={styles.no}>Plate 404.</span> A law with nothing to predict.
          </figcaption>
        </figure>
        <div className={styles.text}>
          <h1 className={styles.h1}>Nothing moves here.</h1>
          <p className={styles.lede}>
            That page doesn’t exist, or the experiment it pointed to has expired. Visitors’ clips are kept for two days; their results stay. Experiment addresses look like <Link href="/x/moon-jump">/x/moon-jump</Link>.
          </p>
          <p className={styles.back}>
            <Link href="/" className="btn">
              Back to the first page
            </Link>
            <Link href="/x" className="btn ghost">
              Every experiment
            </Link>
          </p>
          <ul className={styles.ways}>
            {WAYS.map((w) => (
              <li key={w.href}>
                <Link href={w.href}>{w.title}</Link>
                <span>{w.what}</span>
              </li>
            ))}
          </ul>
          <p className={styles.small}>
            An agent? <a href="/llms.txt">/llms.txt</a> lists every page and every number with its source.
          </p>
        </div>
      </div>
    </div>
  );
}

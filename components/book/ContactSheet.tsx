import Link from "next/link";
import styles from "./ContactSheet.module.css";

export type SheetVerdict = "measured" | "number right, law wrong" | "about right, no error bar" | "no published answer" | "no factor claimed" | "miss";
export type SheetClip = { id: string; img: string; title: string; verdict: SheetVerdict; line: string; href?: string; anchor?: string };

const TONE: Record<SheetVerdict, string> = {
  measured: styles.held,
  "number right, law wrong": styles.half,
  "about right, no error bar": styles.half,
  "no published answer": styles.plain,
  "no factor claimed": styles.plain,
  miss: styles.struck,
};

/**
 * A contact sheet of every real clip Ansatz has run, each frame printed as a cyanotype with its verdict stamped on it:
 * the hits and the misses on one sheet. The frames are the runs' own prints, or a still cut from the clip.
 */
export default function ContactSheet({ clips }: { clips: SheetClip[] }) {
  return (
    <ul className={styles.sheet}>
      {clips.map((c, i) => {
        const body = (
          <>
            <span className={styles.frame}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.img} alt="" className={styles.img} loading="lazy" />
              <span className={`${styles.stamp} ${TONE[c.verdict]}`}>{c.verdict}</span>
            </span>
            <span className={styles.fig}>Fig. {String.fromCharCode(97 + i)}.</span>
            <span className={styles.title}>{c.title}</span>
            <span className={styles.line}>{c.line}</span>
          </>
        );
        return (
          <li key={c.id}>
            {c.href ? (
              <Link href={c.href} className={styles.cell}>
                {body}
              </Link>
            ) : (
              <a href={c.anchor ?? "#strangers"} className={styles.cell}>
                {body}
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

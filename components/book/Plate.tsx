import styles from "./book.module.css";

/**
 * A cyanotype plate: a Prussian-blue sheet with a hand-brushed edge lying on the page, and its caption set like a
 * book plate ("Plate II. The same jump, measured in every frame."). Plates are numbered in page order.
 */
export default function Plate({
  n,
  title,
  children,
  id,
  wide = true,
  className = "",
  caption,
}: {
  n?: string;
  title?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
  wide?: boolean;
  className?: string;
  /** extra caption text after the title */
  caption?: React.ReactNode;
}) {
  return (
    <figure id={id} className={`${styles.plate} ${wide ? styles.wide : ""} ${className}`} data-develop="" suppressHydrationWarning>
      <div className={`${styles.sheet} onPlate`}>
        <div className={styles.inner}>{children}</div>
        <span className={styles.unexposed} aria-hidden="true" />
      </div>
      {(n || title || caption) && (
        <figcaption className={styles.plateCap}>
          {n && <span className={styles.plateNo}>Plate {n}.</span>} {title}
          {caption && <span className={styles.plateMore}> {caption}</span>}
        </figcaption>
      )}
    </figure>
  );
}

/** A page of text with a margin column for notes on wide screens. */
export function Page({ children, className = "", id }: { children: React.ReactNode; className?: string; id?: string }) {
  return (
    <div id={id} className={`${styles.page} ${className}`}>
      {children}
    </div>
  );
}

/** A margin note: who produced the claim beside it (a model, or code). On narrow screens it follows the text. */
export function Note({ who, children }: { who?: string; children: React.ReactNode }) {
  return (
    <aside className={styles.note}>
      {who && <span className={styles.who}>{who}</span>}
      {children}
    </aside>
  );
}

/** A section heading of a paper: "§2 How a law wins". */
export function Section({ n, title, id, children, className = "" }: { n?: string | number; title: React.ReactNode; id?: string; children?: React.ReactNode; className?: string }) {
  return (
    <section id={id} className={`${styles.section} ${className}`}>
      <h2 className={styles.sh}>
        {n !== undefined && <span className={styles.sn}>§{n}</span>}
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A big measured number with its uncertainty set small beside it, and a label underneath. */
export function Reading({ value, pm, unit, label, tone }: { value: React.ReactNode; pm?: React.ReactNode; unit?: React.ReactNode; label?: React.ReactNode; tone?: "measured" | "struck" | "held" }) {
  return (
    <div className={`${styles.reading} ${tone ? styles[tone] : ""}`}>
      <div className={styles.rv}>
        {value}
        {pm !== undefined && <span className={styles.pm}> ± {pm}</span>}
        {unit && <span className={styles.unit}> {unit}</span>}
      </div>
      {label && <div className={styles.rl}>{label}</div>}
    </div>
  );
}

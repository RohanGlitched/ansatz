/**
 * A fold in the book: the heading stays on the page, the long part opens on demand. A link to anything inside it
 * opens it (components/book/Rail.tsx watches the address's #fragment).
 */
import styles from "./book.module.css";

export default function Fold({ summary, children, id, open = false, className = "" }: { summary: React.ReactNode; children: React.ReactNode; id?: string; open?: boolean; className?: string }) {
  return (
    <details id={id} className={`${styles.fold} ${className}`} open={open}>
      <summary>{summary}</summary>
      <div className={styles.foldBody}>{children}</div>
    </details>
  );
}

import { BUILT_BY } from "@/app/site";
import styles from "./book.module.css";

/** The "who built this" line, read from the one constant in app/site.ts; renders nothing while that is empty. */
export default function BuiltBy({ className = "" }: { className?: string }) {
  const who = BUILT_BY.trim().replace(/\.$/, "");
  if (!who) return null;
  return <p className={`${styles.builtBy} ${className}`}>Built by {who}.</p>;
}

"use client";

import { useState } from "react";
import styles from "./AskRun.module.css";

/** Ask Muse Spark about this run: it answers from the stored record with a quote for every number, and code strikes any number whose quote doesn't read true. */
export default function AskRun({ id, examples }: { id: string; examples: string[] }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [a, setA] = useState<{ answer?: string; verified?: number; replaced?: number; error?: string } | null>(null);
  async function ask(text: string) {
    if (!text.trim()) return;
    setQ(text);
    setBusy(true);
    setA(null);
    const r = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, question: text }) });
    setA(await r.json().catch(() => ({ error: "No answer came back." })));
    setBusy(false);
  }
  return (
    <div className={styles.ask}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
        className={styles.row}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Why did this law win?" maxLength={400} aria-label="Your question about this experiment" />
        <button className="btn" disabled={busy}>
          {busy ? "Asking…" : "Ask"}
        </button>
      </form>
      <div className={styles.examples}>
        {examples.map((x) => (
          <button key={x} type="button" onClick={() => ask(x)} disabled={busy}>
            {x}
          </button>
        ))}
      </div>
      {a?.answer && (
        <div className={styles.answer} aria-live="polite">
          <p>{a.answer}</p>
          <p className="small">
            {a.replaced
              ? `${a.replaced} ${a.replaced === 1 ? "number wasn’t" : "numbers weren’t"} in the record and ${a.replaced === 1 ? "was" : "were"} removed.${a.verified ? ` The other ${a.verified === 1 ? "quote was" : `${a.verified} quotes were`} checked against this run’s record.` : ""}`
              : a.verified
                ? `Every number above was checked against this run’s record (${a.verified} ${a.verified === 1 ? "quote" : "quotes"}).`
                : "This answer states no measured numbers."}
          </p>
        </div>
      )}
      {a?.error && <p role="alert">{a.error}</p>}
    </div>
  );
}

"use client";

import { useState } from "react";
import styles from "./ClassMaker.module.css";

/** A teacher names the class and gets two links: one for students to run experiments, one to see the results. */
export default function ClassMaker() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ code: string; name: string; quota: number; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function make(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/class", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setError(j.error ?? `The class couldn’t be made (HTTP ${r.status}). Try again in a minute.`);
      setMade(j);
    } catch {
      setError("The class couldn’t be made: the connection dropped. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(text: string, which: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied((c) => (c === which ? null : c)), 2500);
    } catch {
      setCopied(null);
    }
  }

  if (made) {
    const run = `${origin}/new?class=${made.code}`, page = `${origin}/class/${made.code}`;
    const slips = [
      { key: "run", who: "For your students", what: "Each experiment they run with this link counts against the class, not their school’s connection.", url: run },
      { key: "page", who: "For you", what: "Every result appears here, with all the class’s measurements of g on one line.", url: page },
    ];
    return (
      <div className={styles.made} role="status">
        <p className={styles.madeHead}>
          <b>{made.name}</b> has {made.quota} runs until {new Date(made.expiresAt).toDateString()}.
        </p>
        <ol className={styles.slips}>
          {slips.map((s) => (
            <li key={s.key}>
              <p className={styles.who}>{s.who}</p>
              <p className={styles.what}>{s.what}</p>
              <div className={styles.urlRow}>
                <a href={s.url} className={`num ${styles.url}`}>
                  {s.url}
                </a>
                <button type="button" className="btn ghost" onClick={() => copy(s.url, s.key)}>
                  {copied === s.key ? "Copied" : "Copy the link"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return (
    <form className={styles.form} onSubmit={make} noValidate>
      <label className={styles.field}>
        <span className={styles.label}>Class name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Class 11 B, Physics practical" maxLength={80} aria-describedby="class-name-help" />
        <small id="class-name-help">Shown at the top of the class page. Left empty, the class is called &ldquo;A physics class&rdquo;.</small>
      </label>
      <button type="submit" className="btn" disabled={busy}>
        {busy ? "Making the class link…" : "Make a class link"}
      </button>
      {error && (
        <div className={styles.error} role="alert">
          <p className={styles.errorHead}>The class link wasn&rsquo;t made.</p>
          <p>{error}</p>
        </div>
      )}
    </form>
  );
}

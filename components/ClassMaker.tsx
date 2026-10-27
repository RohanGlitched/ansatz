"use client";

import { useState } from "react";

/** A teacher names the class and gets two links: one for students to run experiments, one to see the results. */
export default function ClassMaker() {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState<{ code: string; name: string; quota: number; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function make() {
    setBusy(true);
    setError(null);
    const r = await fetch("/api/class", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setError(j.error ?? "The class couldn't be made. Try again.");
    setMade(j);
  }

  if (made) {
    const run = `${origin}/new?class=${made.code}`, page = `${origin}/class/${made.code}`;
    return (
      <div style={{ display: "grid", gap: 16, maxWidth: "70ch" }}>
        <p>
          <strong>{made.name}</strong> has {made.quota} runs until {new Date(made.expiresAt).toDateString()}.
        </p>
        <div>
          <p className="small">Give this link to your students. Each experiment they run with it counts against the class, not their school’s connection.</p>
          <p className="num" style={{ wordBreak: "break-all", fontSize: 18 }}>
            <a href={run}>{run}</a>
          </p>
        </div>
        <div>
          <p className="small">Every result appears here, with all the class’s measurements of g on one line.</p>
          <p className="num" style={{ wordBreak: "break-all", fontSize: 18 }}>
            <a href={page}>{page}</a>
          </p>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 12, maxWidth: "48ch" }}>
      <label style={{ display: "grid", gap: 6 }}>
        <span>Class name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Class 11 B, Physics practical" maxLength={80} style={{ font: "inherit", padding: "10px 12px", border: "1px solid var(--rule)", borderRadius: "var(--radius)" }} />
      </label>
      <button type="button" className="btn" onClick={make} disabled={busy}>
        {busy ? "Making the class link…" : "Make a class link"}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

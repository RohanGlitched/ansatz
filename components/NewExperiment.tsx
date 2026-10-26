"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import LiveRun, { type LiveData } from "./LiveRun";
import styles from "./NewExperiment.module.css";

type StepId = "upload" | "listen" | "observe" | "track" | "measure" | "hypothesise" | "fit" | "referee" | "report";
type StepState = { state: "wait" | "run" | "done" | "fail" | "skip"; detail?: string; at?: number; started?: number };

const STEPS: { id: StepId; label: string; who: string }[] = [
  { id: "upload", label: "Read the clip and its clock", who: "ffmpeg + the file’s timestamps" },
  { id: "listen", label: "Listen to the narration", who: "Muse Voice Transcribe" },
  { id: "observe", label: "Watch the clip: what moves, when, and what is known", who: "Muse Spark 1.3" },
  { id: "track", label: "Measure the object in every frame", who: "SAM 3.1" },
  { id: "measure", label: "Turn pixels into a trajectory", who: "code" },
  { id: "hypothesise", label: "Propose laws of motion", who: "Muse Spark 1.3" },
  { id: "fit", label: "Fit each law, predict the frames it never saw", who: "code" },
  { id: "referee", label: "Referee the result; write one more law if the misses demand it", who: "Muse Spark 1.3, then Muse Wonder 1.0" },
  { id: "report", label: "Write it up", who: "code" },
];

export type Sample = { file: string; label: string; hint: string; noun?: string; slowMotion?: number; narration?: string };

export default function NewExperiment({ samples }: { samples: Sample[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [noun, setNoun] = useState("");
  const [narration, setNarration] = useState("");
  const [slow, setSlow] = useState("1");
  const [ruler, setRuler] = useState("");
  const [rulerLen, setRulerLen] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [live, setLive] = useState<LiveData>({});
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [drag, setDrag] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const t0 = useRef(0);
  const [, tick] = useState(0);

  useEffect(() => {
    if (recording && liveRef.current && streamRef.current) {
      liveRef.current.srcObject = streamRef.current;
      liveRef.current.play().catch(() => {});
    }
  }, [recording]);

  useEffect(() => {
    if (!busy) return;
    const iv = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(iv);
  }, [busy]);

  const pick = useCallback((f: File | null) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm)$/i.test(f.name)) return setError("That isn’t a video. Choose an MP4, MOV or WebM clip.");
    if (f.size > 200 * 1024 * 1024) return setError("That clip is over 200 MB. Trim it to the few seconds where the thing moves.");
    setFile(f);
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }, []);

  async function useSample(s: Sample) {
    setError(null);
    const r = await fetch(s.file);
    const b = await r.blob();
    pick(new File([b], s.file.split("/").pop() ?? "sample.mp4", { type: "video/mp4" }));
    setNoun(s.noun ?? "");
    setSlow(String(s.slowMotion ?? 1));
    setNarration(s.narration ?? "");
  }

  async function startRecording() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 }, frameRate: { ideal: 60 } }, audio: true });
      streamRef.current = stream;
      const type = MediaRecorder.isTypeSupported("video/mp4") ? "video/mp4" : "video/webm";
      const rec = new MediaRecorder(stream, { mimeType: type });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        pick(new File([new Blob(chunks, { type })], `recording.${type === "video/mp4" ? "mp4" : "webm"}`, { type }));
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setError("The camera didn’t open. Allow camera access, or film with your phone’s camera app and upload the clip.");
    }
  }

  function stopRecording() {
    recRef.current?.stop();
    setRecording(false);
  }

  async function run() {
    if (!file) return;
    setBusy(true);
    setError(null);
    setSteps({ upload: { state: "run", started: 0 } });
    setLive({});
    t0.current = performance.now();
    try {
      const u = await fetch("/api/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: file.type || "video/mp4", size: file.size }) });
      const uj = await u.json();
      if (!u.ok) throw new Error(uj.error ?? "Upload failed.");
      await putWithProgress(uj.url, file, setUploadPct);
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: uj.key,
          noun: noun || undefined,
          narration: narration || undefined,
          slowMotion: Number(slow) > 1 ? Number(slow) : undefined,
          ruler: ruler && Number(rulerLen) > 0 ? { noun: ruler, metres: Number(rulerLen) } : undefined,
        }),
      });
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `The run didn’t start (HTTP ${r.status}).`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let runId: string | null = null;
      for (;;) {
        let chunkRead: ReadableStreamReadResult<Uint8Array>;
        try {
          chunkRead = await reader.read();
        } catch {
          // the stream can drop on a flaky connection while the experiment keeps running on the server
          if (runId) return await pollUntilDone(runId);
          throw new Error("The connection dropped before the experiment started. Try again.");
        }
        const { value, done } = chunkRead;
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const chunk = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (\w+)/m.exec(chunk)?.[1];
          const data = /^data: (.*)$/m.exec(chunk)?.[1];
          if (!ev || !data) continue;
          const d = JSON.parse(data);
          if (ev === "started") {
            runId = d.id;
          } else if (ev === "progress") {
            if (d.state === "done" && d.data) {
              if (d.step === "measure") setLive((l) => ({ ...l, measure: d.data }));
              if (d.step === "hypothesise") setLive((l) => ({ ...l, laws: d.data.laws }));
              if (d.step === "fit") setLive((l) => ({ ...l, board: d.data.board }));
            }
            setSteps((s) => ({ ...s, [d.step]: { state: d.state === "start" ? "run" : d.state, detail: d.detail ?? s[d.step]?.detail, at: d.at, started: d.state === "start" ? d.at : s[d.step]?.started } }));
          } else if (ev === "done") {
            router.push(`/x/${d.id}`);
            return;
          } else if (ev === "error") {
            throw new Error(d.message);
          }
        }
      }
      if (runId) return await pollUntilDone(runId);
      throw new Error("The connection closed before the experiment finished. Try again.");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  async function pollUntilDone(id: string) {
    setSteps((s) => ({ ...s, report: { state: "run", detail: "The live feed dropped; the experiment is still running on the server. Waiting for it…", started: s.report?.started } }));
    for (let i = 0; i < 100; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const s = await fetch(`/api/status/${id}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      if (s?.state === "done") {
        router.push(`/x/${id}`);
        return;
      }
      if (s?.state === "failed") throw new Error(s.message ?? "The experiment failed.");
    }
    throw new Error("The experiment is taking too long. Open it later from its link: /x/" + id);
  }

  const elapsed = busy ? (performance.now() - t0.current) / 1000 : 0;

  return (
    <div className={styles.grid}>
      <div className={styles.left}>
        {!busy ? (
          <>
            <div
              className={`${styles.drop} ${drag ? styles.dragging : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                pick(e.dataTransfer.files?.[0] ?? null);
              }}
            >
              {recording ? (
                <video ref={liveRef} className={styles.preview} muted playsInline />
              ) : preview ? (
                <video src={preview} className={styles.preview} controls muted playsInline />
              ) : (
                <div className={styles.empty}>
                  <p className={styles.emptyTitle}>Drop a clip here</p>
                  <p className="small">3–20 seconds of something moving, filmed from a phone that stays still. MP4, MOV or WebM.</p>
                </div>
              )}
            </div>
            <div className={styles.actions}>
              <label className="btn ghost">
                Choose a clip
                <input type="file" accept="video/*" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              </label>
              {!recording ? (
                <button type="button" className="btn ghost" onClick={startRecording}>
                  Film with this device
                </button>
              ) : (
                <button type="button" className="btn" onClick={stopRecording}>
                  Stop filming
                </button>
              )}
            </div>
            {samples.length > 0 && (
              <div className={styles.samples}>
                <p className="small">No clip handy? Use one of these:</p>
                <div className={styles.sampleRow}>
                  {samples.map((s) => (
                    <button key={s.file} type="button" className={styles.sample} onClick={() => useSample(s)}>
                      <strong>{s.label}</strong>
                      <span>{s.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <LiveRun src={preview} live={live} />
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>

      <div className={styles.right}>
        {busy ? (
          <ol className={styles.steps} aria-live="polite">
            {STEPS.map((s) => {
              const st = steps[s.id];
              const state = st?.state ?? "wait";
              const secs = state === "run" && st?.started !== undefined ? Math.max(0, elapsed - st.started / 1000) : st?.at !== undefined && st.started !== undefined ? (st.at - st.started) / 1000 : null;
              return (
                <li key={s.id} className={styles[state]}>
                  <span className={styles.dot} aria-hidden="true" />
                  <div>
                    <p className={styles.stepLabel}>
                      {s.label} <span className={styles.who}>{s.who}</span>
                    </p>
                    {s.id === "upload" && state === "run" && uploadPct > 0 && uploadPct < 100 && <p className={styles.detail}>Uploading… {uploadPct}%</p>}
                    {st?.detail && <p className={styles.detail}>{st.detail}</p>}
                  </div>
                  <span className={`num ${styles.secs}`}>{secs !== null && state !== "wait" ? `${secs.toFixed(state === "run" ? 0 : 1)} s` : ""}</span>
                </li>
              );
            })}
          </ol>
        ) : (
        <>
        <label className={styles.field}>
          <span>What moves? (optional)</span>
          <input value={noun} onChange={(e) => setNoun(e.target.value)} placeholder="e.g. orange ball, the keys on the string" disabled={busy} maxLength={60} />
          <small>Muse Spark names it from the video; type it if it picks the wrong thing.</small>
        </label>
        <label className={styles.field}>
          <span>What do you know? (optional)</span>
          <textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={3} placeholder="e.g. the string is 50 cm long; dropped from about one metre" disabled={busy} maxLength={2000} />
          <small>Anything you say in the clip is transcribed too, in English, Hindi or both.</small>
        </label>
        <div className={styles.field}>
          <span>Something of known size in view? (optional)</span>
          <select
            value={ruler ? `${ruler}|${rulerLen}` : ""}
            onChange={(e) => {
              const [n, l] = e.target.value.split("|");
              setRuler(n ?? "");
              setRulerLen(l ?? "");
            }}
            disabled={busy}
            aria-label="Object of known size"
          >
            <option value="">No, or Muse Spark should look for one</option>
            <option value="white A4 sheet of paper|0.297">An A4 sheet on the wall (29.7 cm)</option>
            <option value="credit card|0.0856">A bank card (8.56 cm)</option>
            <option value="tennis ball|0.067">The moving thing is a tennis ball (6.7 cm)</option>
            <option value="cricket ball|0.072">The moving thing is a cricket ball (7.2 cm)</option>
            <option value="metre stick|1.0">A metre stick (1 m)</option>
          </select>
          <small>A ruler in the same plane as the motion lets Ansatz measure g instead of assuming it.</small>
        </div>
        <label className={styles.field}>
          <span>Does it play in slow motion?</span>
          <select value={slow} onChange={(e) => setSlow(e.target.value)} disabled={busy}>
            <option value="1">No, or Muse Spark should work it out</option>
            {[2, 4, 8, 10, 16, 20, 32].map((f) => (
              <option key={f} value={f}>
                Yes, {f}× slower than real life
              </option>
            ))}
          </select>
        </label>
        </>
        )}
        <button type="button" className={`btn ${styles.go}`} disabled={!file || busy} onClick={run}>
          {busy ? `Running… ${elapsed.toFixed(0)} s` : "Run the experiment"}
        </button>
        <p className="small">{!file && !busy ? "Choose or film a clip first." : "About a minute and a half. Each run calls five Meta models and costs about 15–30 cents, which we pay."}</p>
      </div>
    </div>
  );
}

function putWithProgress(url: string, file: File, onPct: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", file.type || "video/mp4");
    xhr.upload.onprogress = (e) => e.lengthComputable && onPct(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (HTTP ${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.send(file);
  });
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
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
type Event = { step: string; state: string; detail?: string; at: number; data?: unknown };
/** a real run's progress log, kept so anyone can watch one without spending a cent */
export type Replay = { id: string; label: string; clip: string; recorded: string; events: Event[]; cut?: LiveData["cut"] };
const REPLAY_SPEED = 3;

export default function NewExperiment({ samples, replays = [], classCode, seriesId, runNote }: { samples: Sample[]; replays?: Replay[]; classCode?: string; seriesId?: string; runNote?: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [noun, setNoun] = useState("");
  const [narration, setNarration] = useState("");
  const [slow, setSlow] = useState("1");
  const [language, setLanguage] = useState("");
  const [student, setStudent] = useState("");
  const [ruler, setRuler] = useState("");
  const [rulerLen, setRulerLen] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [live, setLive] = useState<LiveData>({});
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [drag, setDrag] = useState(false);
  const [fromSample, setFromSample] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const t0 = useRef(0);
  const speed = useRef(1);
  const [replaying, setReplaying] = useState(false);
  /** the run is over and the page holds on its result, until the visitor opens it or replays */
  const [held, setHeld] = useState<{ id: string; replay?: Replay; secs: number } | null>(null);
  const [runKey, setRunKey] = useState(0);
  const replayToken = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    if (recording && liveRef.current && streamRef.current) {
      liveRef.current.srcObject = streamRef.current;
      liveRef.current.play().catch(() => {});
    }
  }, [recording]);

  useEffect(() => {
    if (!busy || held) return;
    const iv = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(iv);
  }, [busy, held]);

  const pick = useCallback((f: File | null) => {
    setError(null);
    if (!f) return;
    if (!f.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm)$/i.test(f.name)) return setError("That isn’t a video. Choose an MP4, MOV or WebM clip.");
    if (f.size > 200 * 1024 * 1024) return setError("That clip is over 200 MB. Trim it to the few seconds where the thing moves.");
    setFromSample(false);
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
    setFromSample(true);
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

  function apply(d: Event) {
    // the clip's clock, so the live strip knows which frame of the clip each of SAM's measurements came from
    if (d.state === "done") {
      if (d.step === "upload") {
        const fps = Number(/at ([\d.]+) fps/.exec(d.detail ?? "")?.[1]);
        if (fps > 0) setLive((l) => ({ ...l, clock: { ...l.clock, fps } }));
      }
      if (d.step === "observe") {
        const w = (d.data as { window?: { start_s: number; end_s: number } } | undefined)?.window;
        if (w && Number.isFinite(w.start_s) && Number.isFinite(w.end_s)) setLive((l) => ({ ...l, clock: { ...l.clock, window: w } }));
      }
      if (d.step === "track") {
        const w = /window ([\d.]+)–([\d.]+) s/.exec(d.detail ?? "");
        if (w) setLive((l) => ({ ...l, clock: { ...l.clock, cut: [Number(w[1]), Number(w[2])] } }));
      }
      if (d.step === "fit") {
        const tf = (d.data as { trainFrac?: number } | undefined)?.trainFrac;
        const unseen = Number(/unseen (\d+)%/.exec(d.detail ?? "")?.[1]);
        const trainFrac = tf ?? (unseen > 0 && unseen < 100 ? 1 - unseen / 100 : undefined);
        if (trainFrac) setLive((l) => ({ ...l, trainFrac }));
      }
      if (d.step === "report" && d.detail) setLive((l) => ({ ...l, summary: d.detail }));
    }
    if (d.state === "update") {
      const u = d.data as { width: number; height: number; frames: number; pts: [number, number, number][] };
      if (d.step === "track" && u?.pts) setLive((l) => ({ ...l, tracking: { width: u.width, height: u.height, frames: u.frames, pts: [...(l.tracking?.pts ?? []), ...u.pts] } }));
      return;
    }
    if (d.state === "done" && d.data) {
      if (d.step === "measure") setLive((l) => ({ ...l, measure: d.data as LiveData["measure"] }));
      if (d.step === "hypothesise") setLive((l) => ({ ...l, laws: (d.data as { laws: LiveData["laws"] }).laws }));
      if (d.step === "fit") setLive((l) => ({ ...l, board: (d.data as { board: LiveData["board"] }).board }));
    }
    setSteps((s) => ({ ...s, [d.step]: { state: d.state === "start" ? "run" : (d.state as StepState["state"]), detail: d.detail ?? s[d.step]?.detail, at: d.at, started: d.state === "start" ? d.at : s[d.step]?.started } }));
  }

  /** brings the stage into view when a run starts below the fold (on a phone the replay buttons sit far down) */
  function showStage() {
    // after the form has given way to the stage, so the page has its new height
    setTimeout(() => {
      const g = gridRef.current;
      if (!g) return;
      const head = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
      const top = g.getBoundingClientRect().top - head;
      if (top < 0 || top + 560 > window.innerHeight - head) window.scrollTo({ top: window.scrollY + top - 8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, 80);
  }

  async function watchReplay(replay: Replay) {
    const token = ++replayToken.current;
    setError(null);
    setPreview(replay.clip);
    setReplaying(true);
    setBusy(true);
    setHeld(null);
    setRunKey((k) => k + 1);
    setSteps({ upload: { state: "run", started: 0 } });
    setLive({ cut: replay.cut });
    speed.current = REPLAY_SPEED;
    t0.current = performance.now();
    showStage();
    for (const d of replay.events) {
      const wait = d.at / REPLAY_SPEED - (performance.now() - t0.current);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (replayToken.current !== token) return;
      apply(d);
    }
    // hold on the result: the race on the strip is the payoff, so the page doesn't leave on its own
    setHeld({ id: replay.id, replay, secs: (replay.events[replay.events.length - 1]?.at ?? 0) / 1000 });
  }

  function reset() {
    replayToken.current++;
    setHeld(null);
    setBusy(false);
    setReplaying(false);
    setSteps({});
    setLive({});
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  async function run() {
    if (!file) return;
    speed.current = 1;
    replayToken.current++;
    setReplaying(false);
    setHeld(null);
    setRunKey((k) => k + 1);
    setBusy(true);
    setError(null);
    setSteps({ upload: { state: "run", started: 0 } });
    setLive({});
    t0.current = performance.now();
    showStage();
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
          sample: fromSample || undefined,
          language: language || undefined,
          class: classCode || undefined,
          series: seriesId || undefined,
          student: classCode && student ? student : undefined,
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
            apply(d);
          } else if (ev === "done") {
            // hold on the result with a link to it, so the race on the strip can finish in front of the visitor
            setHeld({ id: d.id, secs: (performance.now() - t0.current) / 1000 });
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
      for (const d of (s?.progress ?? []) as { step: string; state: string; detail?: string; at: number; data?: unknown }[]) {
        if (d.state === "done" && d.data) {
          if (d.step === "measure") setLive((l) => ({ ...l, measure: d.data as LiveData["measure"] }));
          if (d.step === "hypothesise") setLive((l) => ({ ...l, laws: (d.data as { laws: LiveData["laws"] }).laws }));
          if (d.step === "fit") setLive((l) => ({ ...l, board: (d.data as { board: LiveData["board"] }).board }));
        }
        setSteps((st) => ({ ...st, [d.step]: { state: d.state === "start" ? "run" : (d.state as StepState["state"]), detail: d.detail ?? st[d.step]?.detail, at: d.at, started: st[d.step]?.started } }));
      }
    }
    throw new Error("The experiment is taking too long. Open it later from its link: /x/" + id);
  }

  const elapsed = held ? held.secs : busy ? ((performance.now() - t0.current) / 1000) * speed.current : 0;

  return (
    <div className={styles.grid} ref={gridRef}>
      <div className={`${styles.left} ${busy ? styles.leftRun : ""}`}>
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
                  <p className={styles.emptyTitle}>Film, choose or drop a clip</p>
                  <p className="small">3–20 seconds of something moving, filmed from a phone that stays still. MP4, MOV or WebM.</p>
                </div>
              )}
            </div>
            <div className={styles.actions}>
              {/* on a phone, the camera app itself: its own frame rate and slow-motion modes, saved as a real video file */}
              <label className={`btn ${styles.touchOnly}`}>
                Film now
                <input type="file" accept="video/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              </label>
              <label className="btn ghost">
                Choose a clip
                <input type="file" accept="video/*" hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              </label>
              {!recording ? (
                <button type="button" className={`btn ghost ${styles.pointerOnly}`} onClick={startRecording}>
                  Film with this device
                </button>
              ) : (
                <button type="button" className="btn" onClick={stopRecording}>
                  Stop filming
                </button>
              )}
            </div>
            {!seriesId && (
              <div className={styles.samples}>
                <p className="small">Doing the pendulum practical? Film the same pendulum at three or four string lengths: a series fits them together and gives g from the slope of L against T².</p>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={async () => {
                    const r = await fetch("/api/series", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "My pendulum series" }) }).then((x) => x.json()).catch(() => null);
                    if (r?.id) router.push(`/new?series=${r.id}${classCode ? `&class=${classCode}` : ""}`);
                  }}
                >
                  Start a series
                </button>
              </div>
            )}
            {replays.length > 0 && (
              <div className={styles.samples}>
                <p className="small">Just want to see a run? These replay real ones, recorded on {replays[0].recorded}, at {REPLAY_SPEED}× speed, SAM 3.1’s measurements included. No model is called.</p>
                <div className={styles.sampleRow}>
                  {replays.map((r, i) => (
                    <button key={r.id} type="button" className={i === 0 ? "btn" : "btn ghost"} onClick={() => watchReplay(r)}>
                      Watch Ansatz measure {r.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
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
          <>
            {replaying && <p className={styles.replayNote}>Replay of a recorded run at {REPLAY_SPEED}× speed. The time beside each step is the real one.</p>}
            <LiveRun
              key={runKey}
              src={preview}
              live={live}
              footer={
                held ? (
                  <div className={styles.held}>
                    <Link className="btn" href={`/x/${held.id}`}>
                      Open the full result →
                    </Link>
                    {held.replay && (
                      <button type="button" className="btn ghost" onClick={() => watchReplay(held.replay!)}>
                        Replay
                      </button>
                    )}
                    <button type="button" className={styles.textBtn} onClick={reset}>
                      {held.replay ? "Run a clip of your own" : "Run another clip"}
                    </button>
                  </div>
                ) : null
              }
            />
          </>
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
        {classCode && (
          <label className={styles.field}>
            <span>Your name or roll number (for your teacher)</span>
            <input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="e.g. Asha, roll 14" disabled={busy} maxLength={40} />
          </label>
        )}
        <label className={styles.field}>
          <span>What moves? (optional)</span>
          <input value={noun} onChange={(e) => setNoun(e.target.value)} placeholder="e.g. orange ball, the keys on the string" disabled={busy} maxLength={60} />
          <small>Muse Spark names it from the video; type it if it picks the wrong thing.</small>
        </label>
        <label className={styles.field}>
          <span>What do you know? (optional)</span>
          <textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={3} placeholder="e.g. the string is 50 cm long; dropped from about one metre" disabled={busy} maxLength={2000} />
          <small>Anything you say in the clip is transcribed too: English, Hindi, Tamil, Bengali, Marathi, Telugu or Spanish.</small>
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
          <span>What language do you speak in the clip?</span>
          <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={busy}>
            <option value="">Muse Voice Transcribe should work it out</option>
            {["English", "Hindi", "Tamil", "Bengali", "Marathi", "Telugu", "Spanish"].map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>
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
        {held ? (
          <p className={`small ${styles.heldNote}`}>
            {held.replay ? `This run took ${Math.round(held.secs)} s for real, replayed here in ${Math.round(held.secs / REPLAY_SPEED)} s, with no model called.` : `Done in ${Math.round(held.secs)} s.`}{" "}
            <Link href={`/x/${held.id}`}>Open the full result →</Link>
          </p>
        ) : (
          <>
            <button type="button" className={`btn ${styles.go}`} disabled={!file || busy} onClick={run}>
              {busy ? `${replaying ? "Replaying" : "Running"}… ${elapsed.toFixed(0)} s` : "Run the experiment"}
            </button>
            <p className="small">{!file && !busy ? "Choose or film a clip first." : runNote ?? "About 2 minutes, longer when Muse Wonder steps in. Each run calls up to four Meta models, which we pay for."}</p>
          </>
        )}
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

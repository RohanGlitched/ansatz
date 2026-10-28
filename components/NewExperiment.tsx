"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import LiveRun, { type LiveData } from "./LiveRun";
import Plate, { Note, Page } from "./book/Plate";
import { readoutOf, type Readout } from "./liveStripMath";
import { canPrepare, prepareClip, type PrepResult } from "./clipPrep";
import type { Replay } from "@/data/replays/derive";
import styles from "./NewExperiment.module.css";

export type { Replay };

type StepId = "upload" | "listen" | "observe" | "track" | "measure" | "hypothesise" | "fit" | "referee" | "report";
type StepState = { state: "wait" | "run" | "done" | "fail" | "skip"; detail?: string; at?: number; started?: number };

const STEPS: { id: StepId; label: string; who: string; lite?: string }[] = [
  { id: "upload", label: "Read the clip and its clock", who: "ffmpeg + the file’s timestamps" },
  { id: "listen", label: "Listen to the narration", who: "Muse Voice Transcribe", lite: "skipped in lite mode" },
  { id: "observe", label: "Watch the clip: what moves, when, and what is known", who: "Muse Spark 1.3", lite: "you said what it is" },
  { id: "track", label: "Measure the object in every frame", who: "SAM 3.1" },
  { id: "measure", label: "Turn pixels into a trajectory", who: "code" },
  { id: "hypothesise", label: "Propose laws of motion", who: "Muse Spark 1.3", lite: "the textbook library, by code" },
  { id: "fit", label: "Fit each law to the first 70%, predict the last 30%", who: "code" },
  { id: "referee", label: "Referee the result; write one more law if the misses demand it", who: "Muse Spark 1.3, then Muse Wonder 1.0", lite: "skipped in lite mode" },
  { id: "report", label: "Write it up", who: "code" },
];

export type LiteType = "pendulum" | "drop" | "throw" | "bounce" | "spring";
const LITE_TYPES: { id: LiteType; label: string }[] = [
  { id: "pendulum", label: "Pendulum" },
  { id: "drop", label: "Drop" },
  { id: "throw", label: "Throw" },
  { id: "bounce", label: "Bounce" },
  { id: "spring", label: "Spring" },
];

export type Sample = { file: string; label: string; hint: string; noun?: string; slowMotion?: number; narration?: string; type?: LiteType };
type Event = { step: string; state: string; detail?: string; at: number; data?: unknown };
const REPLAY_SPEED = 3;

const mb = (n: number) => `${n >= 1e8 ? Math.round(n / 1e6) : (n / 1e6).toFixed(1)} MB`;
const secs = (t: number) => `${t.toFixed(1)} s`;

type Prep = { key: string; state: "work" | "done"; pct: number; result?: PrepResult };

export default function NewExperiment({
  samples,
  replays = [],
  classCode,
  seriesId,
  runNote,
  autoReplay,
  title,
  lede,
  notes,
  liteDefault = false,
  liteNote,
}: {
  samples: Sample[];
  replays?: Replay[];
  classCode?: string;
  seriesId?: string;
  runNote?: string;
  /** a replay id from /new?replay=: start that recorded run on arrival */
  autoReplay?: string;
  title: string;
  lede: string;
  notes?: ReactNode;
  /** class links start in lite mode */
  liteDefault?: boolean;
  /** what lite mode costs and where its defaults fail, from the benchmarks */
  liteNote?: string;
}) {
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
  const [lite, setLite] = useState(liteDefault);
  const [liteType, setLiteType] = useState<LiteType | "">("");
  const [busy, setBusy] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [live, setLive] = useState<LiveData>({});
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [drag, setDrag] = useState(false);
  /** show the clip in its own colours instead of printing it as a cyanotype */
  const [colour, setColour] = useState(false);
  const [fromSample, setFromSample] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const liveRef = useRef<HTMLVideoElement>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const t0 = useRef(0);
  const speed = useRef(1);
  const [replaying, setReplaying] = useState(false);
  const [replayNow, setReplayNow] = useState<Replay | null>(null);
  /** the run is over and the page holds on its result, until the visitor opens it or replays */
  const [held, setHeld] = useState<{ id: string; replay?: Replay; secs: number } | null>(null);
  const [readout, setReadout] = useState<Readout | null>(null);
  const [runKey, setRunKey] = useState(0);
  const replayToken = useRef(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const [, tick] = useState(0);
  // trim and shrink before upload
  const [canShrink, setCanShrink] = useState(false);
  const [dur, setDur] = useState(0);
  const [trim, setTrim] = useState<[number, number]>([0, 0]);
  const [prep, setPrep] = useState<Prep | null>(null);
  const prepRun = useRef<{ key: string; promise: Promise<PrepResult> } | null>(null);
  const [uploading, setUploading] = useState<{ size: number; orig: number } | null>(null);

  useEffect(() => setCanShrink(canPrepare()), []);

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
    setDur(0);
    setTrim([0, 0]);
    setPrep(null);
    prepRun.current = null;
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(f);
    });
  }, []);

  // what will be uploaded: the clip trimmed and shrunk to 720p, prepared in the background so its size shows first
  const shrinkable = !!file && canShrink && /\.(mp4|mov|m4v)$/i.test(file.name) && dur > 0;
  const prepKey = file && shrinkable ? `${file.name}|${file.size}|${trim[0].toFixed(2)}|${trim[1].toFixed(2)}|${lite ? "lite" : "full"}` : "";
  const startPrep = useCallback(
    (key: string) => {
      if (!file || !key) return null;
      if (prepRun.current?.key === key) return prepRun.current.promise;
      setPrep({ key, state: "work", pct: 0 });
      const promise = prepareClip(file, {
        start: trim[0],
        end: trim[1],
        // lite mode transcribes nothing, so the narration stays behind; a full run keeps it or sends the clip as it is
        keepAudio: !lite,
        needAudio: !lite,
        onProgress: (f) => setPrep((p) => (p && p.key === key ? { ...p, pct: Math.round(f * 100) } : p)),
        cancelled: () => prepRun.current?.key !== key,
      }).catch((e): PrepResult => ({ ok: false, why: (e as Error).message || "the clip couldn’t be prepared here" }));
      prepRun.current = { key, promise };
      promise.then((result) => setPrep((p) => (p && p.key === key ? { key, state: "done", pct: 100, result } : p)));
      return promise;
    },
    [file, trim, lite],
  );
  useEffect(() => {
    if (!prepKey || busy) return;
    const to = setTimeout(() => startPrep(prepKey), 700);
    return () => clearTimeout(to);
  }, [prepKey, busy, startPrep]);

  async function useSample(s: Sample) {
    setError(null);
    const r = await fetch(s.file);
    const b = await r.blob();
    pick(new File([b], s.file.split("/").pop() ?? "sample.mp4", { type: "video/mp4" }));
    setFromSample(true);
    setNoun(s.noun ?? "");
    setSlow(String(s.slowMotion ?? 1));
    setNarration(s.narration ?? "");
    if (s.type) setLiteType(s.type);
    // a slowed clip is one lite mode gets wrong (it assumes real time): it runs in full mode, with its factor set
    if ((s.slowMotion ?? 1) > 1) setLite(false);
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

  // a live run's own nouns, for the observer → SAM handoff line (a replay's events already carry it)
  const liveRun = useRef<{ noun: string; lite: boolean } | null>(null);

  function apply(d: Event) {
    // the clip's clock, so the live strip knows which frame of the clip each of SAM's measurements came from
    if (d.state === "done") {
      if (d.step === "upload") {
        const fps = Number(/at ([\d.]+) fps/.exec(d.detail ?? "")?.[1]);
        if (fps > 0) setLive((l) => ({ ...l, clock: { ...l.clock, fps } }));
      }
      if (d.step === "observe") {
        const o = d.data as { window?: { start_s: number; end_s: number }; subjects?: { noun_phrase: string }[] } | undefined;
        const w = o?.window;
        if (w && Number.isFinite(w.start_s) && Number.isFinite(w.end_s)) setLive((l) => ({ ...l, clock: { ...l.clock, window: w } }));
        // one line for the handoff: the name the observer gave, and the prompt SAM 3.1 is sent
        const lr = liveRun.current;
        const said = o?.subjects?.[0]?.noun_phrase;
        if (lr && said) {
          const prompt = lr.noun || said;
          const head = (d.detail ?? "").replace(/: tracking “[^”]*”/, "");
          d = { ...d, detail: `${head}\n${lr.lite ? `you: “${prompt}”` : `observer: “${said}”`} → SAM prompt “${prompt}”${!lr.lite && lr.noun && lr.noun !== said ? " (typed with the clip)" : ""}` };
        }
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
      // the board after the fit, and again after the referee when Muse Wonder's law joined it
      if ((d.step === "fit" || d.step === "referee") && (d.data as { board?: LiveData["board"] }).board) setLive((l) => ({ ...l, board: (d.data as { board: LiveData["board"] }).board }));
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
      // the stage's own height, measured: the clip and the strip, however tall this screen makes them
      const h = g.querySelector("[data-stage]")?.getBoundingClientRect().height ?? 0;
      if (top < 0 || top + h > window.innerHeight - head) window.scrollTo({ top: window.scrollY + top - 8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, 80);
  }

  // a deep link to a replay starts it once, on arrival; only a recorded replay, never a real run
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !autoReplay) return;
    const r = replays.find((x) => x.id === autoReplay);
    if (!r) return;
    autoStarted.current = true;
    watchReplay(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReplay]);

  async function watchReplay(replay: Replay) {
    const token = ++replayToken.current;
    liveRun.current = null;
    setError(null);
    setPreview(replay.clip);
    setReplaying(true);
    setReplayNow(replay);
    setBusy(true);
    setHeld(null);
    setReadout(null);
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
    setReadout(replay.readout);
  }

  function reset() {
    replayToken.current++;
    setHeld(null);
    setReadout(null);
    setBusy(false);
    setReplaying(false);
    setReplayNow(null);
    setSteps({});
    setLive({});
    setUploading(null);
    setPreview(file ? URL.createObjectURL(file) : null);
  }

  const liteReady = !lite || (!!liteType && !!noun.trim());

  async function run() {
    if (!file || !liteReady) return;
    speed.current = 1;
    replayToken.current++;
    liveRun.current = { noun: noun.trim(), lite };
    setReplaying(false);
    setReplayNow(null);
    setHeld(null);
    setReadout(null);
    setRunKey((k) => k + 1);
    setBusy(true);
    setError(null);
    setSteps({ upload: { state: "run", started: 0 } });
    setLive({});
    t0.current = performance.now();
    showStage();
    try {
      // the trimmed, 720p copy when it could be made exactly; otherwise the clip as it is
      let up: File = file;
      const pr = prepKey ? await startPrep(prepKey) : null;
      if (pr?.ok) up = pr.file;
      setUploading({ size: up.size, orig: file.size });
      const u = await fetch("/api/upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: up.type || "video/mp4", size: up.size }) });
      const uj = await u.json();
      if (!u.ok) throw new Error(uj.error ?? "Upload failed.");
      await putWithProgress(uj.url, up, setUploadPct);
      const r = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: uj.key,
          // the judges' lane key travels with the run (it arrives in the page's address)
          k: typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("k") ?? undefined : undefined,
          noun: noun || undefined,
          narration: !lite && narration ? narration : undefined,
          slowMotion: !lite && Number(slow) > 1 ? Number(slow) : undefined,
          ruler: ruler && Number(rulerLen) > 0 ? { noun: ruler, metres: Number(rulerLen) } : undefined,
          sample: fromSample || undefined,
          language: !lite && language ? language : undefined,
          class: classCode || undefined,
          series: seriesId || undefined,
          student: classCode && student ? student : undefined,
          lite: lite && liteType ? { type: liteType } : undefined,
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
            // the number to hold on to, read from the stored record the way its page reads it
            fetch(`/x/${d.id}/record.json`)
              .then((x) => (x.ok ? x.json() : null))
              .then((rec) => rec && setReadout(readoutOf(rec)))
              .catch(() => {});
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
  const runLite = busy && !replaying ? !!liveRun.current?.lite : false;

  // what the upload will be, in words
  const trimmed = dur > 0 && (trim[0] > 0.05 || trim[1] < dur - 0.05);
  const prepNote = (() => {
    if (!file || !shrinkable) return null;
    if (!prep || prep.key !== prepKey || prep.state === "work") return `Shrinking the clip for upload${prep && prep.key === prepKey && prep.pct ? `… ${prep.pct}%` : "…"}`;
    const r = prep.result!;
    if (r.ok) return `Uploading ${mb(r.file.size)} instead of ${mb(file.size)}: ${secs(r.seconds)}, ${r.width}×${r.height}, all ${r.frames} frames with the timestamps the camera wrote${r.audio ? ", narration kept" : ""}.`;
    if (r.skip) return `Uploading ${mb(file.size)}: the clip is already 720p or smaller.`;
    return `Uploading the clip as it is (${mb(file.size)})${trimmed ? ", untrimmed" : ""}: ${r.why}.`;
  })();

  // the step running now, for a screen reader (the list itself ticks every half second, so it isn't a live region)
  const current = STEPS.find((s) => steps[s.id]?.state === "run");
  const failed = STEPS.find((s) => steps[s.id]?.state === "fail");
  const hint = !file && !busy
    ? "Choose or film a clip first: use the buttons on the plate."
    : lite && !busy && !liteType
      ? "Lite mode needs to know what kind of experiment this is: pick one of the five above."
      : lite && !busy && !noun.trim()
        ? "Lite mode needs the name of what moves, so SAM 3.1 knows what to look for: type it above."
        : lite && !busy
          ? "Lite mode: SAM 3.1 measures, code fits the textbook laws. No Muse model is called."
          : runNote ?? "About 2 minutes, longer when Muse Wonder steps in. Each run calls up to four Meta models, which we pay for.";

  const caption = busy ? (
    <>
      <span className={styles.plateNo}>Plate I.</span> {replaying ? `A recorded run${replayNow ? ` of ${replayNow.label}` : ""}, replayed as it happened.` : "Your run, as it happens."} Orange: what SAM 3.1 measured, filled where the laws were fitted and open where they had to predict. White: each law&rsquo;s prediction. Red: a law the unseen frames refuted.
    </>
  ) : file || recording ? (
    <>
      <span className={styles.plateNo}>Plate I.</span> {recording ? "Filming, printed as a cyanotype as it comes in." : "Your clip, printed as a cyanotype."} Trim it to the motion; only that part is sent.
    </>
  ) : (
    <>
      <span className={styles.plateNo}>Plate I.</span> The bench. Your clip is printed here as a cyanotype, and SAM 3.1&rsquo;s measurements land on it in orange as they arrive.
    </>
  );

  return (
    <div className={styles.root}>
      {busy ? (
        <header className={styles.runHead}>
          <h1 className={styles.runTitle}>{replaying ? "Watching a recorded run" : title}</h1>
          {replaying && (
            <p className={styles.replayNote}>
              Replay of a real run at {REPLAY_SPEED}× speed: no model is called. The time beside each step is the real one.{replayNow?.rebuilt ? ` ${replayNow.rebuilt}` : ""}
            </p>
          )}
        </header>
      ) : (
        <header className={styles.title}>
          <h1>{title}</h1>
          <div className={styles.abstract}>
            <p>{lede}</p>
            {notes && <div className={styles.notes}>{notes}</div>}
            {replays.length > 0 && (
              <p className={styles.or}>
                Just want to see one? <a href="#replays">Watch a recorded run</a>; it calls no model.
              </p>
            )}
          </div>
        </header>
      )}

      <div className={`${styles.bench} ${busy ? styles.benchRun : ""}`} ref={gridRef}>
        <div className={`${styles.left} ${busy ? styles.leftRun : ""}`}>
          <div className={`${styles.sheet} onPlate`}>
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
                    <>
                      <video ref={liveRef} className={`${styles.preview} ${colour ? "" : styles.print}`} muted playsInline />
                      <span className={styles.recDot}>Filming</span>
                    </>
                  ) : preview ? (
                    <video
                      ref={previewRef}
                      src={preview}
                      className={`${styles.preview} ${colour ? "" : styles.print}`}
                      controls
                      muted
                      playsInline
                      onLoadedMetadata={(e) => {
                        const d = e.currentTarget.duration;
                        // a new clip starts untrimmed; the same clip shown again (after a run or an error) keeps its trim
                        if (Number.isFinite(d) && d > 0 && Math.abs(d - dur) > 0.01) {
                          setDur(d);
                          setTrim([0, d]);
                        }
                      }}
                    />
                  ) : (
                    <div className={styles.empty}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/prints/bouncing-ball.webp" alt="" className={styles.ghost} />
                      <p className={styles.emptyTitle}>Film, choose or drop a clip</p>
                      <p className={styles.emptyNote}>3 to 20 seconds of something moving, filmed from a phone that stays still. MP4, MOV or WebM, up to 200 MB.</p>
                    </div>
                  )}
                  {(preview || recording) && (
                    <button type="button" className={styles.colour} onClick={() => setColour((c) => !c)} aria-pressed={colour}>
                      {colour ? "Print as cyanotype" : "Original colour"}
                    </button>
                  )}
                </div>
                {shrinkable && (
                  <div className={styles.trim}>
                    <div className={styles.trimHead}>
                      <span>Trim to the motion</span>
                      <span className="num">
                        {secs(trim[0])} to {secs(trim[1])} ({secs(trim[1] - trim[0])} of {secs(dur)})
                      </span>
                    </div>
                    <div className={styles.range}>
                      <span className={styles.rangeFill} style={{ left: `${(trim[0] / dur) * 100}%`, right: `${100 - (trim[1] / dur) * 100}%` }} aria-hidden="true" />
                      {[0, 1].map((h) => (
                        <input
                          key={h}
                          type="range"
                          min={0}
                          max={dur}
                          step={0.05}
                          value={trim[h]}
                          aria-label={h ? "End of the clip to keep" : "Start of the clip to keep"}
                          aria-valuetext={`${secs(trim[h])}`}
                          onChange={(e) => {
                            const v = Number(e.target.value);
                            const next: [number, number] = h ? [trim[0], Math.max(v, trim[0] + 0.5)] : [Math.min(v, trim[1] - 0.5), trim[1]];
                            setTrim([Math.max(0, next[0]), Math.min(dur, next[1])]);
                            if (previewRef.current) previewRef.current.currentTime = h ? next[1] : next[0];
                          }}
                        />
                      ))}
                    </div>
                    <p className={styles.prepNote} aria-live="polite">
                      {prepNote}
                    </p>
                  </div>
                )}
                {file && !shrinkable && dur > 0 && (
                  <p className={styles.prepNote}>
                    Uploading {mb(file.size)} as it is{!canShrink ? ": this browser can’t trim or shrink video" : /\.webm$/i.test(file.name) ? ": a WebM recording is sent whole" : ""}.
                  </p>
                )}
                <div className={styles.actions}>
                  {/* on a phone, the camera app itself: its own frame rate and slow-motion modes, saved as a real video file */}
                  <label className={`btn ${styles.touchOnly} ${styles.fileBtn}`}>
                    Film now
                    <input type="file" accept="video/*" capture="environment" className={styles.fileInput} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                  </label>
                  <label className={`btn ${styles.fileBtn} ${styles.chooseBtn}`}>
                    {file ? "Choose another clip" : "Choose a clip"}
                    <input type="file" accept="video/*" className={styles.fileInput} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
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
                <p className={styles.sizeNote}>
                  Phones film at 1080p or 4K. Before uploading, Ansatz lets you trim the clip to the motion and shrinks it to 720p in your browser, keeping the timestamp of every frame, and says how much it will send.
                </p>
              </>
            ) : (
              <LiveRun
                key={runKey}
                src={preview}
                live={live}
                readout={held ? readout : null}
                footer={
                  held ? (
                    <div className={styles.held}>
                      <Link className="btn" href={`/x/${held.replay?.record ?? held.id}`}>
                        Open the full result
                      </Link>
                      {held.replay && (
                        <button type="button" className="btn ghost" onClick={() => watchReplay(held.replay!)}>
                          Watch it again
                        </button>
                      )}
                      <button type="button" className={styles.textBtn} onClick={reset}>
                        {held.replay ? "Run a clip of your own" : "Run another clip"}
                      </button>
                    </div>
                  ) : null
                }
              />
            )}
          </div>
          <p className={styles.plateCap}>{caption}</p>
          {error && (
            <div className={styles.error} role="alert">
              <p className={styles.errorHead}>{busy ? "The run stopped." : "That didn’t work."}</p>
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className={styles.right}>
          {busy ? (
            <>
              <h2 className={styles.colHead}>The run, step by step</h2>
              <p className="visually-hidden" aria-live="polite">
                {held ? "The run is done." : failed ? `${failed.label}: failed.` : current ? `${current.label}…` : ""}
              </p>
              <ol className={styles.steps}>
                {STEPS.map((s, i) => {
                  const st = steps[s.id];
                  const state = st?.state ?? "wait";
                  const t = state === "run" && st?.started !== undefined ? Math.max(0, elapsed - st.started / 1000) : st?.at !== undefined && st.started !== undefined ? (st.at - st.started) / 1000 : null;
                  return (
                    <li key={s.id} className={styles[state]} aria-current={state === "run" ? "step" : undefined}>
                      <span className={styles.n} aria-hidden="true">
                        {i + 1}
                      </span>
                      <div className={styles.stepBody}>
                        <p className={styles.stepLabel}>{s.label}</p>
                        <p className={styles.who}>{runLite && s.lite ? s.lite : s.who}</p>
                        {s.id === "upload" && state === "run" && uploading && (
                          <p className={styles.detail}>
                            {uploadPct > 0 && uploadPct < 100 ? `Uploading ${mb(uploading.size)}${uploading.size < uploading.orig ? ` instead of ${mb(uploading.orig)}` : ""}… ${uploadPct}%` : uploading.size < uploading.orig ? `Uploaded ${mb(uploading.size)} instead of ${mb(uploading.orig)}` : null}
                          </p>
                        )}
                        {st?.detail && <p className={styles.detail}>{st.detail}</p>}
                      </div>
                      <span className={`num ${styles.secs}`}>
                        {t !== null && state !== "wait" ? (state === "run" ? `${t.toFixed(0)} s` : t < 0.05 ? "<0.1 s" : `${t.toFixed(1)} s`) : state === "skip" ? "skipped" : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>
              {held ? (
                <p className={styles.heldNote}>
                  {held.replay ? `This run took ${Math.round(held.secs)} s for real, replayed here in ${Math.round(held.secs / REPLAY_SPEED)} s, with no model called.` : `Done in ${Math.round(held.secs)} s.`}{" "}
                  <Link href={`/x/${held.replay?.record ?? held.id}`}>Open the full result</Link>
                </p>
              ) : (
                <p className={`num ${styles.clock}`}>
                  {replaying ? "Replaying" : "Running"}… {elapsed.toFixed(0)} s
                </p>
              )}
            </>
          ) : (
            <div className={styles.form}>
              <h2 className={styles.colHead}>Say what you know</h2>
              <p className={styles.formLede}>Everything here is optional unless it says otherwise. What you give is kept apart from what Ansatz measures.</p>
              {classCode && (
                <label className={styles.field}>
                  <span className={styles.label}>{classCode === "jdgs26" ? "Your name (shown on the judges’ page)" : "Your name or roll number (for your teacher)"}</span>
                  <input value={student} onChange={(e) => setStudent(e.target.value)} placeholder="e.g. Asha, roll 14" disabled={busy} maxLength={40} />
                </label>
              )}
              <fieldset className={`${styles.field} ${styles.mode}`}>
                <legend className={styles.label}>How much should Ansatz work out?</legend>
                <label className={styles.choice}>
                  <input type="radio" name="mode" checked={!lite} onChange={() => setLite(false)} />
                  <span>
                    <b>Full run.</b> Muse Spark watches the clip, proposes laws and referees them; Muse Voice Transcribe hears the narration.
                  </span>
                </label>
                <label className={styles.choice}>
                  <input type="radio" name="mode" checked={lite} onChange={() => setLite(true)} />
                  <span>
                    <b>I know what this is.</b> Lite mode: no Muse model is called.
                  </span>
                </label>
                {lite && (
                  <div className={styles.liteBox}>
                    <div className={styles.types} role="radiogroup" aria-label="What kind of experiment (required in lite mode)">
                      {LITE_TYPES.map((t) => (
                        <button key={t.id} type="button" role="radio" aria-checked={liteType === t.id} className={liteType === t.id ? styles.typeOn : styles.type} onClick={() => setLiteType(t.id)}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {liteNote && <p className={styles.liteNote}>{liteNote}</p>}
                  </div>
                )}
              </fieldset>
              <label className={styles.field}>
                <span className={styles.label}>{lite ? "What moves? (required in lite mode)" : "What moves?"}</span>
                <input value={noun} onChange={(e) => setNoun(e.target.value)} placeholder="e.g. orange ball, the keys on the string" disabled={busy} maxLength={60} required={lite} aria-invalid={lite && !!liteType && !noun.trim() ? true : undefined} />
                <small>{lite ? "SAM 3.1 looks for exactly this, so name it as you would to a friend: colour and thing." : "Muse Spark names it from the video; type it if it picks the wrong thing."}</small>
              </label>
              {!lite && (
                <label className={styles.field}>
                  <span className={styles.label}>What do you know?</span>
                  <textarea value={narration} onChange={(e) => setNarration(e.target.value)} rows={3} placeholder="e.g. the string is 50 cm long; dropped from about one metre" disabled={busy} maxLength={2000} />
                  <small>Anything you say in the clip is transcribed too: English, Hindi, Tamil, Bengali, Marathi, Telugu or Spanish.</small>
                </label>
              )}
              <label className={styles.field}>
                <span className={styles.label}>Something of known size in view?</span>
                <select
                  value={ruler ? `${ruler}|${rulerLen}` : ""}
                  onChange={(e) => {
                    const [n, l] = e.target.value.split("|");
                    setRuler(n ?? "");
                    setRulerLen(l ?? "");
                  }}
                  disabled={busy}
                >
                  <option value="">{lite ? "No" : "No, or Muse Spark should look for one"}</option>
                  <option value="white A4 sheet of paper|0.297">An A4 sheet on the wall (29.7 cm)</option>
                  <option value="credit card|0.0856">A bank card (8.56 cm)</option>
                  <option value="tennis ball|0.067">The moving thing is a tennis ball (6.7 cm)</option>
                  <option value="cricket ball|0.072">The moving thing is a cricket ball (7.2 cm)</option>
                  <option value="metre stick|1.0">A metre stick (1 m)</option>
                </select>
                <small>A ruler in the same plane as the motion lets Ansatz measure g instead of assuming it.</small>
              </label>
              {!lite && (
                <>
                  <label className={styles.field}>
                    <span className={styles.label}>What language do you speak in the clip?</span>
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
                    <span className={styles.label}>Does it play in slow motion?</span>
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
              <div className={styles.go}>
                <button type="button" className="btn" disabled={!file || busy || !liteReady} onClick={run} aria-describedby="run-hint">
                  {lite ? "Run it in lite mode" : "Run the experiment"}
                </button>
                <p id="run-hint" className={`${styles.hint} ${(!file || !liteReady) ? styles.hintNeed : ""}`}>
                  {hint}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {!busy && (
        <>
          {replays.length > 0 && (
            <Plate
              n="II"
              id="replays"
              className={styles.replayPlate}
              title={`Recorded runs. Each replays a real run at ${REPLAY_SPEED}× speed, SAM 3.1’s measurements included, and ends on the numbers its page publishes.`}
              caption="No model is called."
            >
              <div className={styles.replayHead}>
                <h2>Just want to see a run?</h2>
                <p>Watch one from the first frame to the verdict: the clip measured, the laws proposed, and the race on the frames none of them saw.</p>
              </div>
              <ul className={styles.replays}>
                {replays.map((r, i) => (
                  <li key={r.id}>
                    <button type="button" className={styles.specimen} onClick={() => watchReplay(r)}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/prints/${r.record}.webp`} alt="" className={styles.specPrint} loading="lazy" />
                      <span className={styles.fig}>
                        Fig. {String.fromCharCode(97 + i)}, recorded {r.recorded}
                      </span>
                      <span className={styles.specTitle}>Watch Ansatz measure {r.label}</span>
                      <span className={styles.specMeta}>
                        {Math.round((r.events[r.events.length - 1]?.at ?? 0) / 1000)} s for real, {Math.round((r.events[r.events.length - 1]?.at ?? 0) / 1000 / REPLAY_SPEED)} s here
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Plate>
          )}

          <Page className={styles.after}>
            {samples.length > 0 && (
              <section className={styles.part}>
                <h2>No clip handy?</h2>
                <p>Run a real one on a clip licensed for reuse. It loads onto the bench above with what it needs filled in; you still press Run.</p>
                <ul className={styles.sampleList}>
                  {samples.map((s) => (
                    <li key={s.file}>
                      <span className={styles.sampleText}>
                        <span className={styles.sampleTitle}>{s.label}</span>
                        <span className={styles.sampleCredit}>{s.hint}</span>
                      </span>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={async () => {
                          await useSample(s);
                          gridRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
                        }}
                      >
                        Put this clip on the bench
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {samples.length > 0 && <Note who="A run on a sample">A real run, the same as one on your own clip; it is left out of the visitors&rsquo; runs on the experiments page.</Note>}

            {!seriesId && (
              <section className={styles.part}>
                <h2>Doing the pendulum practical?</h2>
                <p>Film the same pendulum at three or four string lengths, with the same paper sheet on the wall. A series fits them together and gives g from the slope of L against T², as the practical asks.</p>
                <p className={styles.partAct}>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={async () => {
                      const r = await fetch("/api/series", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "My pendulum series" }) }).then((x) => x.json()).catch(() => null);
                      if (r?.id) router.push(`/new?series=${r.id}${classCode ? `&class=${classCode}` : ""}${new URLSearchParams(window.location.search).get("k") ? `&k=${encodeURIComponent(new URLSearchParams(window.location.search).get("k")!)}` : ""}`);
                      else setError("The series couldn’t be started. Check your connection and try again.");
                    }}
                  >
                    Start a series
                  </button>
                  <Link href="/series/pendulum-lengths">See one finished</Link>
                </p>
              </section>
            )}
            {!seriesId && <Note who="code">The period comes from each run&rsquo;s fitted law, so it uses every frame of the swing rather than a stopwatch on a few.</Note>}

            <section className={styles.part}>
              <h2>Filming a clip that measures well</h2>
              <ol className={styles.tips}>
                <li>
                  <b>Hold the phone still.</b> Prop it on some books, or on a table. Ansatz measures the object against the picture, so the picture must not move.
                </li>
                <li>
                  <b>Keep the whole motion in frame,</b> from before it starts to after it ends, side on, so the object moves across the picture rather than toward you.
                </li>
                <li>
                  <b>Put something of known size in view,</b> in the same plane as the motion: an A4 sheet on the wall, a bank card, a metre stick. Then g is measured, not assumed.
                </li>
                <li>
                  <b>Say what you know</b> while filming, in any of seven languages: the string&rsquo;s length, the height of the drop.
                </li>
                <li>
                  <b>Three to twenty seconds is plenty.</b> Trim the rest on the bench before it is sent.
                </li>
              </ol>
            </section>
            <Note who="SAM 3.1">Finds the object by the name you or Muse Spark give it, then follows it through every frame. A name with a colour in it works best.</Note>

            <section className={styles.part}>
              <h2>What a run does</h2>
              <ol className={styles.preview9}>
                {STEPS.map((s) => (
                  <li key={s.id}>
                    <span className={styles.pLabel}>{s.label}</span>
                    <span className={styles.pWho}>{s.who}</span>
                  </li>
                ))}
              </ol>
              <p className={styles.partNote}>
                Code fits every law to the first 70% of the motion and makes it predict the last 30%, which no law was fitted to. The law that misses those frames least wins; no model picks the winner. <Link href="/how">How a law wins</Link>.
              </p>
            </section>
            <Note who="Who did what">SAM 3.1 measures. Muse Spark watches, proposes and referees. Muse Wonder proposes when every law misses. Code fits, predicts and ranks.</Note>
          </Page>
        </>
      )}
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

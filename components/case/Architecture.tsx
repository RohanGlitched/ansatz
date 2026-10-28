import styles from "./Architecture.module.css";

/**
 * How a clip becomes a law, as a real data flow from left to right: which Meta model does what, and what only code may
 * touch. Models are outlined boxes labelled in Archivo; code steps are filled paper with an italic label; measured data
 * travels in orange, laws in white. The last 30% of the measurement sits in a sealed box that only code edges enter.
 * Orange frames travel the edges in an 8 s loop (SMIL), each stage lighting as they pass; with reduced motion the
 * travelling dots and the lighting are hidden and the diagram is static.
 */

type Kind = "model" | "code" | "input" | "sealed";
type Box = { x: number; y: number; w: number; h: number; kind: Kind; title: string[]; lines: string[] };

const W = 150;
const COL = [20, 200, 380, 560, 740, 920, 1090];

const NODES: Record<string, Box> = {
  clip: { x: COL[0], y: 90, w: W, h: 86, kind: "input", title: ["Phone clip"], lines: ["video, with the", "narration as audio"] },
  person: { x: COL[0], y: 300, w: W, h: 86, kind: "input", title: ["What the person", "says or types"], lines: ["a length, a ruler,", "the object"] },
  voice: { x: COL[1], y: 60, w: W, h: 92, kind: "model", title: ["Muse Voice", "Transcribe"], lines: ["audio to transcript,", "7 languages"] },
  observe: { x: COL[1], y: 190, w: W, h: 132, kind: "model", title: ["Muse Spark 1.3"], lines: ["watches input_video at", "the clip’s frame rate:", "what moves, the window,", "the ruler, the world,", "slow motion"] },
  sam: { x: COL[2], y: 112, w: W, h: 108, kind: "model", title: ["SAM 3.1"], lines: ["tracks by name, or", "a box from Spark’s", "point, frame by frame,", "into masks"] },
  measure: { x: COL[2], y: 250, w: W, h: 118, kind: "code", title: ["measure"], lines: ["sub-pixel centroids;", "the frame clock from", "the MP4; the ruler", "and the scale"] },
  propose: { x: COL[3], y: 70, w: W, h: 102, kind: "model", title: ["Muse Spark 1.3"], lines: ["writes 2 to 4 laws in", "the equation language,", "from the first 70%"] },
  compile: { x: COL[3], y: 190, w: W, h: 64, kind: "code", title: ["compile"], lines: ["a safe language,", "never run as code"] },
  controls: { x: COL[3], y: 268, w: W, h: 50, kind: "code", title: ["textbook controls"], lines: ["join every run"] },
  fit: { x: COL[4], y: 84, w: W, h: 98, kind: "code", title: ["integrate and fit"], lines: ["RK4, then Levenberg–", "Marquardt on the", "first 70% only"] },
  sealed: { x: COL[4], y: 210, w: W, h: 104, kind: "sealed", title: ["the sealed", "last 30%"], lines: ["no model edge enters;", "only code compares", "each prediction to it"] },
  rank: { x: COL[4], y: 336, w: W, h: 92, kind: "code", title: ["predict and rank"], lines: ["by miss in units of", "the noise; the simpler", "law wins a tie"] },
  wonder: { x: COL[5], y: 74, w: W, h: 124, kind: "model", title: ["Muse Wonder 1.0"], lines: ["an agent with a fit_law", "tool on the fitted", "frames only; its law", "goes back to stage 4"] },
  referee: { x: COL[5], y: 326, w: W, h: 110, kind: "model", title: ["Muse Spark 1.3"], lines: ["reads the board and", "the residuals on the", "fitted frames; writes", "the finding, no digits"] },
};

const OUT = { x: COL[6], y: 64, w: 140, h: 384 };
const OUTPUTS: { title: string; lines: string[] }[] = [
  { title: "Report", lines: ["the law in LaTeX;", "constants ± error;", "given vs measured;", "the clock check"] },
  { title: "Files", lines: ["a print, a CSV,", "record.json"] },
  { title: "For a class", lines: ["a lab report in 7", "languages; a class page"] },
  { title: "Model ledger", lines: ["every call, with", "its cost"] },
];

type Tone = "measured" | "law" | "note";
type Edge = { d: string; tone: Tone; t: [number, number]; label?: { x: number; y: number; text: string; anchor?: "start" | "middle" | "end" } };

// each edge carries its travel window within the 8 s loop, so the frames move stage by stage from input to output
const EDGES: Edge[] = [
  { d: "M170 112 L200 106", tone: "note", t: [0.02, 0.1] },
  { d: "M95 176 L95 250 L200 250", tone: "measured", t: [0.0, 0.12], label: { x: 104, y: 242, text: "video" } },
  { d: "M170 330 L186 330 L186 300 L200 300", tone: "note", t: [0.04, 0.12] },
  { d: "M275 152 L275 190", tone: "note", t: [0.12, 0.18], label: { x: 282, y: 175, text: "transcript" } },
  { d: "M170 168 L380 168", tone: "measured", t: [0.08, 0.3], label: { x: 365, y: 160, text: "frames", anchor: "end" } },
  { d: "M350 208 L380 208", tone: "note", t: [0.2, 0.28] },
  { d: "M350 300 L380 300", tone: "note", t: [0.2, 0.3] },
  { d: "M170 364 L362 364 L362 350 L380 350", tone: "note", t: [0.08, 0.3], label: { x: 240, y: 380, text: "a stated length", anchor: "middle" } },
  { d: "M455 220 L455 250", tone: "measured", t: [0.3, 0.36], label: { x: 462, y: 240, text: "masks" } },
  { d: "M530 262 L545 262 L545 130 L560 130", tone: "measured", t: [0.36, 0.46] },
  { d: "M635 172 L635 190", tone: "law", t: [0.46, 0.5] },
  { d: "M635 268 L635 254", tone: "law", t: [0.46, 0.5] },
  { d: "M710 210 L716 210 L716 112 L740 112", tone: "law", t: [0.5, 0.58], label: { x: 724, y: 100, text: "laws", anchor: "middle" } },
  { d: "M530 340 L728 340 L728 160 L740 160", tone: "measured", t: [0.38, 0.58], label: { x: 640, y: 356, text: "the measured track", anchor: "middle" } },
  { d: "M530 340 L728 340 L728 270 L740 270", tone: "measured", t: [0.38, 0.6] },
  { d: "M815 182 L815 210", tone: "law", t: [0.58, 0.63], label: { x: 808, y: 200, text: "predictions", anchor: "end" } },
  { d: "M815 314 L815 336", tone: "law", t: [0.63, 0.68] },
  { d: "M890 382 L920 382", tone: "note", t: [0.68, 0.73] },
  { d: "M995 326 L995 198", tone: "note", t: [0.73, 0.79], label: { x: 1002, y: 252, text: "if every law" } },
  { d: "M920 136 L890 136", tone: "law", t: [0.79, 0.85] },
  { d: "M1070 382 L1090 382", tone: "law", t: [0.85, 0.95] },
];
// the referee's second label line
const EXTRA_LABELS = [{ x: 1002, y: 266, text: "misses" }];

const STAGES: { x: number; w: number; n?: string; label: string; t: [number, number][] }[] = [
  { x: COL[0], w: W, label: "Inputs", t: [[0, 0.12]] },
  { x: COL[1], w: W, n: "1", label: "Watch and listen", t: [[0.06, 0.24]] },
  { x: COL[2], w: W, n: "2", label: "Measure", t: [[0.22, 0.4]] },
  { x: COL[3], w: W, n: "3", label: "Hypothesise", t: [[0.4, 0.56]] },
  { x: COL[4], w: W, n: "4", label: "Falsify, code only", t: [[0.54, 0.7], [0.8, 0.9]] },
  { x: COL[5], w: W, n: "5", label: "Referee", t: [[0.68, 0.86]] },
  { x: COL[6], w: 140, label: "Outputs", t: [[0.86, 1]] },
];

const DUR = "8s";

/** keyTimes and values that make something show (1) only inside the given windows of the loop */
function windows(ws: [number, number][], on = "1", off = "0") {
  const times: number[] = [0];
  const vals: string[] = [off];
  for (const [a, b] of ws) {
    const a0 = Math.max(times[times.length - 1] + 0.001, a);
    times.push(a0, Math.min(0.999, a0 + 0.03), Math.max(a0 + 0.031, b - 0.03), Math.min(0.9995, Math.max(a0 + 0.032, b)));
    vals.push(off, on, on, off);
  }
  times.push(1);
  vals.push(off);
  return { keyTimes: times.map((t) => +t.toFixed(4)).join(";"), values: vals.join(";") };
}

function Node({ id, b }: { id: string; b: Box }) {
  const titleY = b.y + 22;
  const lineStart = titleY + (b.title.length - 1) * 17 + 19;
  return (
    <g className={`${styles.node} ${styles[b.kind]}`} data-node={id}>
      <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={b.kind === "model" ? 6 : b.kind === "input" ? 2 : 0} />
      {b.kind === "sealed" && (
        <g className={styles.lock} transform={`translate(${b.x + b.w - 30} ${b.y - 12})`} aria-hidden="true">
          <rect x="-4" y="-2" width="22" height="24" className={styles.lockBg} />
          <path d="M3 8 V5 a4 4 0 0 1 8 0 V8" />
          <rect x="0" y="8" width="14" height="10" rx="1.5" />
        </g>
      )}
      {b.title.map((t, i) => (
        <text key={i} x={b.x + 10} y={titleY + i * 17} className={styles.nt}>
          {t}
        </text>
      ))}
      {b.lines.map((t, i) => (
        <text key={i} x={b.x + 10} y={lineStart + i * 15.5} className={styles.nl}>
          {t}
        </text>
      ))}
    </g>
  );
}

export default function Architecture() {
  const desc =
    "Inputs: a phone clip (video and narration audio) and what the person says or types. Stage 1, watch and listen: Muse Voice Transcribe turns the audio into a transcript in 7 languages; Muse Spark 1.3 watches the video at the clip's frame rate and names what moves, the window, the ruler, the world and any slow motion. Stage 2, measure: SAM 3.1 tracks the object by name, or from a box at Muse Spark's point, into masks; code turns them into sub-pixel centroids, reads the frame clock from the MP4 and sets the scale from the ruler. Stage 3, hypothesise: Muse Spark 1.3 writes 2 to 4 laws in the equation language from the first 70% of the track; textbook control laws join; code compiles them in a safe language. Stage 4, falsify, code only: each law is integrated with RK4 and fitted by Levenberg–Marquardt on the first 70%, predicts the sealed last 30%, which no model edge enters, and is ranked by its miss in units of the noise, the simpler law winning a tie. Stage 5, referee: Muse Spark reads the board and the residuals on the fitted frames; if every law misses, Muse Wonder 1.0, an agent with a fit_law tool that sees the fitted frames only, submits a law that goes back to stage 4. Outputs: a report with the law in LaTeX, constants with uncertainties, what was given and what was measured, and the clock check; a print, a CSV and record.json; a lab report in 7 languages and a class page; a model ledger with every call's cost.";
  return (
    <div className={styles.wrap}>
      <p className={styles.hint}>Scroll sideways to follow the clip from left to right.</p>
      <div className={styles.scroll} tabIndex={0} role="region" aria-label="Architecture diagram, scrolls sideways">
        <svg viewBox="0 0 1240 470" className={styles.svg} role="img" aria-labelledby="arch-title arch-desc">
          <title id="arch-title">How a clip becomes a law</title>
          <desc id="arch-desc">{desc}</desc>
          <defs>
            <marker id="arch-m" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" className={styles.headM} />
            </marker>
            <marker id="arch-l" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" className={styles.headL} />
            </marker>
            <marker id="arch-n" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L8 4 L0 8 z" className={styles.headN} />
            </marker>
            <pattern id="arch-hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="7" className={styles.hatchLine} />
            </pattern>
          </defs>

          {/* the stages: a column each, lit while the frames pass through it */}
          {STAGES.map((s) => {
            const w = windows(s.t, "1", "0");
            return (
              <g key={s.label}>
                <rect x={s.x - 8} y={44} width={s.w + 16} height={410} className={styles.glow} opacity="0">
                  <animate attributeName="opacity" dur={DUR} repeatCount="indefinite" keyTimes={w.keyTimes} values={w.values} />
                </rect>
                <text x={s.x} y={30} className={styles.stage}>
                  {s.n && <tspan className={styles.sn}>{s.n}</tspan>}
                  <tspan dx={s.n ? 7 : 0}>{s.label}</tspan>
                </text>
              </g>
            );
          })}
          <rect x={COL[4] - 8} y={44} width={W + 16} height={410} className={styles.codeOnly} />

          {EDGES.map((e, i) => (
            <path key={i} d={e.d} className={`${styles.edge} ${styles[e.tone]}`} markerEnd={`url(#arch-${e.tone === "measured" ? "m" : e.tone === "law" ? "l" : "n"})`} />
          ))}
          {EDGES.filter((e) => e.label).map((e, i) => (
            <text key={i} x={e.label!.x} y={e.label!.y} textAnchor={e.label!.anchor ?? "start"} className={`${styles.el} ${styles[`el_${e.tone}`]}`}>
              {e.label!.text}
            </text>
          ))}
          {EXTRA_LABELS.map((l) => (
            <text key={l.text} x={l.x} y={l.y} className={`${styles.el} ${styles.el_note}`}>
              {l.text}
            </text>
          ))}

          <rect x={NODES.sealed.x} y={NODES.sealed.y} width={W} height={NODES.sealed.h} fill="url(#arch-hatch)" className={styles.hatch} />
          {Object.entries(NODES).map(([id, b]) => (
            <Node key={id} id={id} b={b} />
          ))}

          {/* the outputs, one bracket */}
          <g className={styles.out}>
            <rect x={OUT.x} y={OUT.y} width={OUT.w} height={OUT.h} />
            {OUTPUTS.map((o, i) => {
              const y = OUT.y + 24 + [0, 108, 190, 286][i];
              return (
                <g key={o.title}>
                  {i > 0 && <line x1={OUT.x + 10} x2={OUT.x + OUT.w - 10} y1={y - 22} y2={y - 22} className={styles.outRule} />}
                  <text x={OUT.x + 10} y={y} className={styles.nt}>
                    {o.title}
                  </text>
                  {o.lines.map((l, j) => (
                    <text key={j} x={OUT.x + 10} y={y + 19 + j * 15.5} className={styles.nl}>
                      {l}
                    </text>
                  ))}
                </g>
              );
            })}
          </g>

          {/* the frames: orange dots carry measurements, white dots carry laws, each in its window of the loop */}
          <g className={styles.moving} aria-hidden="true">
            {EDGES.map((e, i) => {
              const [a, b] = e.t;
              const kt = `0;${a};${b};1`;
              const vis = windows([[a, b]]);
              return [0, 0.025].map((lag, k) => {
                const a2 = Math.min(b - 0.01, a + lag);
                return (
                  <circle key={`${i}-${k}`} r={e.tone === "note" ? 3 : 4} className={e.tone === "law" ? styles.dotL : e.tone === "note" ? styles.dotN : styles.dotM} opacity="0">
                    <animateMotion dur={DUR} repeatCount="indefinite" path={e.d} keyPoints="0;0;1;1" keyTimes={k === 0 ? kt : `0;${a2};${b};1`} calcMode="linear" />
                    <animate attributeName="opacity" dur={DUR} repeatCount="indefinite" keyTimes={vis.keyTimes} values={vis.values} />
                  </circle>
                );
              });
            })}
          </g>
        </svg>
      </div>
      <div className={styles.key}>
        <span>
          <i className={styles.kModel} /> a Meta model
        </span>
        <span>
          <i className={styles.kCode} /> code
        </span>
        <span>
          <i className={styles.kM} /> measured data
        </span>
        <span>
          <i className={styles.kL} /> laws and predictions
        </span>
        <span>
          <i className={styles.kSealed} /> sealed: only code enters
        </span>
      </div>
      <p className={styles.infra}>Runs are stored on Google Cloud Storage; the app is Next.js on Vercel; every model is called through the Meta Model API.</p>
    </div>
  );
}

/**
 * The model's part of the method. Muse Spark watches and listens (observe), proposes laws as equations
 * (hypothesise), and reads the scoreboard to explain it (critique). When the referee sees drift the winner
 * can't explain, Muse Wonder works as a theorist with a fit_law tool and submits one more law (reviseAgentic).
 * A by-eye baseline (eyeball) answers the same questions from the video alone. The model never decides which
 * law wins, and every measured number comes from the fit: code fits, code scores, code fills the numbers. Two
 * inputs do come from Muse Spark, and reports list them as given: the size of the ruler it picked, and the world.
 */
import { citations, Ledger, outputText, parseJsonLoose, respond, respondJson } from "./meta/client";
import type { Law } from "./physics/law";

export const MODELS = {
  observe: process.env.ANSATZ_OBSERVE_MODEL ?? "muse-spark-1.3",
  hypothesise: process.env.ANSATZ_HYPOTHESISE_MODEL ?? "muse-spark-1.3",
  critique: process.env.ANSATZ_CRITIQUE_MODEL ?? "muse-spark-1.3",
  revise: process.env.ANSATZ_REVISE_MODEL ?? "muse-wonder-1.0",
  eyeball: process.env.ANSATZ_EYEBALL_MODEL ?? "muse-spark-1.3",
};

export type MotionKind = "flight" | "swing" | "oscillation" | "along a path" | "other";

export type Observation = {
  phenomenon: string;
  motion_kind: MotionKind;
  what_happens: string;
  subjects: { noun_phrase: string; alternatives: string[]; description: string }[];
  reference: { present: boolean; noun_phrase: string; real_length_m: number; dimension: "longest side" | "shortest side"; basis: string; relative_uncertainty?: number };
  stated_facts: { quantity: string; value: number; unit: string; said: string }[];
  window: { start_s: number; end_s: number };
  slow_motion: { factor: number; evidence: string };
  body: "earth" | "moon" | "mars" | "other";
  location: { place: string; latitude_deg: number | null };
  camera_static: boolean;
  caveats: string[];
};

export const OBS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["phenomenon", "motion_kind", "what_happens", "subjects", "reference", "stated_facts", "window", "slow_motion", "body", "location", "camera_static", "caveats"],
  properties: {
    phenomenon: { type: "string", description: "A short name for the physics on show, e.g. 'projectile', 'pendulum', 'bouncing ball', 'rolling down a ramp'." },
    motion_kind: {
      type: "string",
      enum: ["flight", "swing", "oscillation", "along a path", "other"],
      description: "flight = thrown, dropped or bouncing through the air; swing = pendulum; oscillation = spring or other back-and-forth without a pivot; along a path = rolling or sliding along a ramp, track or table; other = anything else.",
    },
    what_happens: { type: "string", description: "Two sentences: what moves, from where to where, and what starts and ends the motion." },
    subjects: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["noun_phrase", "alternatives", "description"],
        properties: {
          noun_phrase: { type: "string", description: "The plainest everyday name a segmentation model will find in every frame: colour + common noun, e.g. 'orange ball', 'white paper bag', 'pendulum bob'. Name what it IS, not what it resembles. Never a person or a hand." },
          alternatives: { type: "array", items: { type: "string" }, maxItems: 3, description: "Up to three other short names for the same object, plainest first (e.g. 'ball', 'paper bag', 'white object')." },
          description: { type: "string" },
        },
      },
    },
    reference: {
      type: "object",
      additionalProperties: false,
      required: ["present", "noun_phrase", "real_length_m", "dimension", "basis", "relative_uncertainty"],
      properties: {
        present: { type: "boolean", description: "True if an object of well-known size is visible in the plane of the motion: a sheet of A4 paper (0.297 m long side), a metre stick, a credit card (0.0856 m), a door (≈2.0 m) — or the moving object itself when it has a standard size (tennis ball 0.067 m, cricket ball 0.072 m, table-tennis ball 0.040 m, football 0.22 m, basketball 0.24 m)." },
        noun_phrase: { type: "string", description: "Its segmentation name; use exactly the subject's noun_phrase when the moving object is itself the ruler." },
        real_length_m: { type: "number", description: "Its real length in metres along `dimension` (0 if not present)." },
        dimension: { type: "string", enum: ["longest side", "shortest side"] },
        basis: { type: "string", description: "Why that length: a standard (A4 is 0.297 m), a label in view, or what the narrator said." },
        relative_uncertainty: { type: "number", description: "How well that length is known, as a fraction: 0.003 for an A4 sheet, 0.02 for a sports ball, 0.05 for a person's height, 0.1 for a rough guess." },
      },
    },
    stated_facts: {
      type: "array",
      description: "Quantities the narration, captions or on-screen text state (lengths, heights, masses, frame rates, slow-motion factors). Empty if none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["quantity", "value", "unit", "said"],
        properties: { quantity: { type: "string" }, value: { type: "number" }, unit: { type: "string" }, said: { type: "string", description: "The exact words or on-screen text." } },
      },
    },
    window: {
      type: "object",
      additionalProperties: false,
      required: ["start_s", "end_s"],
      properties: { start_s: { type: "number" }, end_s: { type: "number" } },
      description: "Seconds of the clip (video time) where the free motion to analyse happens: after release, before it is caught or stops. Pad by 0.2 s.",
    },
    slow_motion: {
      type: "object",
      additionalProperties: false,
      required: ["factor", "evidence"],
      properties: { factor: { type: "number", description: "How many times slower than real life the clip plays (1 if real time)." }, evidence: { type: "string" } },
    },
    body: { type: "string", enum: ["earth", "moon", "mars", "other"] },
    location: {
      type: "object",
      additionalProperties: false,
      required: ["place", "latitude_deg"],
      properties: { place: { type: "string", description: "Where it was filmed if stated or obvious, else ''." }, latitude_deg: { type: ["number", "null"] } },
    },
    camera_static: { type: "boolean" },
    caveats: { type: "array", items: { type: "string" }, description: "Things that could spoil a measurement: camera moves, motion toward the camera, occlusion, blur." },
  },
};

/** How a model sees the clip: every frame at its native rate, up to 300 frames, so it can time motion as well as look. */
export function videoPart(fileId: string, nativeFps: number, durationS: number) {
  const fps = Math.max(1, Math.min(nativeFps || 30, 300 / Math.max(0.5, durationS)));
  return { part: { type: "input_video", file_id: fileId, fps: Math.round(fps * 100) / 100 }, fps, frames: Math.round(fps * durationS) };
}

export async function observe(fileId: string, narration: string, ledger: Ledger, durationS: number, nativeFps = 30): Promise<{ obs: Observation; sources: { url: string; title: string }[] }> {
  const vid = videoPart(fileId, nativeFps, durationS);
  const prompt = [
    `You are the observing scientist in a physics lab. Watch this ${durationS.toFixed(1)} s clip. Another model will track the moving object frame by frame and fit equations of motion to it, so your job is to say WHAT to track, WHEN the free motion happens, and WHAT is known for certain.`,
    narration ? `The person filming said (transcribed, may be Hindi, English or mixed):\n"""${narration.slice(0, 3000)}"""` : "There is no narration.",
    "Read any on-screen text too (captions often state the slow-motion factor, frame rate or lengths). If a standard object (an A4 sheet, a tennis ball, a door) can serve as a ruler, give its usual size and say it is an estimate.",
    "Rulers: people are asked to tape a sheet of paper to the wall or lay a metre stick down, so take such objects at their standard size rather than declining them. A plain sheet of white paper is A4 (0.297 m long side; say relative_uncertainty 0.06, since it could be US Letter, 0.279 m); a banded stick is a metre stick (1.0 m) only when the scene around it fits that size (a table, a person, a doorway); in a close-up of a small object it is more likely a 15 or 30 cm ruler, so judge its length from the objects around it, and set relative_uncertainty to 0.3 if you can't tell. Decline a ruler only when nothing of standard size is in the plane of the motion. A ruler matters even when the object falls freely: comparing it with the fall is how a slowed-down clip gets caught.",
  ].join("\n\n");
  const { value, raw } = await respondJson<Observation>(
    {
      model: MODELS.observe,
      effort: "medium",
      input: [{ role: "user", content: [vid.part, { type: "input_text", text: prompt }] }],
      schema: OBS_SCHEMA,
      name: "observation",
      // no web search: across every published run it was never used, and a ruler's size must come from the clip,
      // the narration or a preset the visitor can see, not an unseen lookup
      maxOutput: 12000,
    },
    ledger,
    "observe the clip",
  );
  return { obs: value, sources: citations(raw) };
}

/* ───────────────────────────── hypotheses ───────────────────────────── */

type WireLaw = {
  id: string;
  title: string;
  summary: string;
  state: string[];
  derivatives: { state: string; expr: string }[];
  params: { name: string; guess: number; min: number; max: number; unit: string; meaning: string; fixed: boolean }[];
  observe: { channel: string; expr: string }[];
  events: { name: string; when: string; then: { state: string; expr: string }[] }[];
  if_it_wins: string;
};

export const LAW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["id", "title", "summary", "state", "derivatives", "params", "observe", "events", "if_it_wins"],
  properties: {
    id: { type: "string", description: "short slug, e.g. 'vacuum', 'quadratic-drag'" },
    title: { type: "string" },
    summary: { type: "string", description: "One plain sentence a 15-year-old understands." },
    state: { type: "array", items: { type: "string" }, description: "State variable names, e.g. ['x','y','vx','vy'] or ['theta','omega']." },
    derivatives: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["state", "expr"], properties: { state: { type: "string" }, expr: { type: "string" } } },
      description: "d(state)/dt for EVERY state variable, as an expression over state, params and t. Operators + - * / ^, functions sin cos tan exp log sqrt abs sign tanh atan2 min max hypot pow, constant pi.",
    },
    params: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "guess", "min", "max", "unit", "meaning", "fixed"],
        properties: {
          name: { type: "string" },
          guess: { type: "number" },
          min: { type: "number" },
          max: { type: "number" },
          unit: { type: "string" },
          meaning: { type: "string" },
          fixed: { type: "boolean", description: "true to hold it at `guess` (only for a value that is GIVEN, e.g. a stated length, or g when the fall was used as the ruler)" },
        },
      },
    },
    observe: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["channel", "expr"], properties: { channel: { type: "string" }, expr: { type: "string" } } },
      description: "Which measured channels this law predicts, each as an expression over state and params. Use only the channels listed as measured.",
    },
    events: {
      type: "array",
      description: "Instant changes, e.g. a bounce: when 'y - floor' crosses zero downward, then vy = -e*vy. Empty if none.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "when", "then"],
        properties: {
          name: { type: "string" },
          when: { type: "string" },
          then: { type: "array", items: { type: "object", additionalProperties: false, required: ["state", "expr"], properties: { state: { type: "string" }, expr: { type: "string" } } } },
        },
      },
    },
    if_it_wins: { type: "string", description: "What we learn if this law predicts the unseen part of the clip best." },
  },
};

export const LAWS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reasoning", "laws"],
  properties: {
    reasoning: { type: "string", description: "Two or three sentences: what the data shows and why these candidates." },
    laws: { type: "array", minItems: 2, maxItems: 4, items: LAW_SCHEMA },
  },
};

export function fromWire(w: WireLaw): Law {
  return {
    id: w.id.replace(/[^a-z0-9-]+/gi, "-").toLowerCase().slice(0, 40) || "law",
    title: w.title,
    summary: w.summary,
    state: w.state,
    derivatives: Object.fromEntries(w.derivatives.map((d) => [d.state, d.expr])),
    params: w.params.map((p) => ({ name: p.name, guess: p.guess, min: p.min, max: p.max, unit: p.unit, meaning: p.meaning, fixed: p.fixed })),
    observe: Object.fromEntries(w.observe.map((o) => [o.channel, o.expr])),
    events: w.events.length ? w.events.map((e) => ({ name: e.name, when: e.when, then: Object.fromEntries(e.then.map((u) => [u.state, u.expr])) })) : undefined,
  };
}

export type Hypotheses = { reasoning: string; laws: Law[]; ifItWins: Record<string, string> };

const METHOD = `Rules for writing laws:
- Each law is an initial-value problem. Every initial state value is fitted automatically from the data, so do not add parameters for initial positions or velocities.
- Observe only the measured channels listed. Prefer the channel that makes the law simplest: theta for a pendulum, s for motion along a straight track, x and y for flight.
- Give every free parameter a physical meaning, a unit, a realistic guess and generous min/max bounds. Mark a parameter fixed only when its value is GIVEN (stated by the person filming, or g when the fall itself set the scale).
- Offer 2–4 genuinely different candidates, from the simplest textbook law to richer ones (drag linear vs quadratic, damping, large-angle vs small-angle, rolling inertia, a bounce event with restitution). The candidates compete: the one that best predicts the last 30% of the clip, which it never sees, wins.
- Respect the setting: on the Moon, Mars-like vacuum or in space there is no air, so no drag terms there.
- Use SI units. Ids are short slugs.`;

export async function hypothesise(obs: Observation, digest: unknown, given: string[], ledger: Ledger, model = MODELS.hypothesise): Promise<Hypotheses> {
  const text = [
    "You are the theorist in a physics lab. A segmentation model tracked the object below through every frame; here is the measurement. Propose candidate laws of motion that could have produced it.",
    `What the observer saw: ${obs.phenomenon}. ${obs.what_happens} Setting: ${obs.body === "earth" ? "Earth, in air" : obs.body === "moon" ? "the Moon (no air)" : obs.body === "mars" ? "Mars (thin air)" : obs.body}.`,
    `Given (not to be measured): ${given.length ? given.join("; ") : "nothing"}.`,
    `Measurement:\n${JSON.stringify(digest, null, 1)}`,
    METHOD,
  ].join("\n\n");
  const { value } = await respondJson<{ reasoning: string; laws: WireLaw[] }>(
    { model, effort: process.env.ANSATZ_HYPOTHESISE_EFFORT ?? "medium", input: [{ role: "user", content: [{ type: "input_text", text }] }], schema: LAWS_SCHEMA, name: "hypotheses", maxOutput: 20000 },
    ledger,
    "propose laws",
  );
  return { reasoning: value.reasoning, laws: value.laws.map(fromWire), ifItWins: Object.fromEntries(value.laws.map((l) => [fromWire(l).id, l.if_it_wins])) };
}

/* ───────────────────────────── critique ───────────────────────────── */

export const RESIDUAL_FEATURES = ["none", "drift", "oscillating", "growing", "step", "dead-band"] as const;

export type Critique = {
  /** what the referee sees in the leading law's misses on the fitted frames, and how strongly (0 none … 3 unmistakable); written before the verdict */
  residual_feature?: (typeof RESIDUAL_FEATURES)[number];
  strength?: 0 | 1 | 2 | 3;
  verdict: "accept" | "revise";
  headline: string; // at most a dozen plain words, no numbers
  finding: string; // plain words, numbers as {param} placeholders
  why_it_won: string;
  caveats: string[];
  revision_idea: string;
  revised_law?: WireLaw | null;
  what_if: { label: string; param: string; factor: number }[];
  /** the law that led when the referee wrote this; its words are shown only while that law still leads */
  winnerId?: string;
};

export const CRITIQUE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["residual_feature", "strength", "verdict", "headline", "finding", "why_it_won", "caveats", "revision_idea", "what_if"],
  properties: {
    residual_feature: { type: "string", enum: [...RESIDUAL_FEATURES], description: "Look at the misses of the law code chose on the fitted frames (the picture, the bin means, the runs test and the lag-1 autocorrelation) and name the one structure you see: none (noise), drift (a slow trend), oscillating (a regular wave), growing (swings that widen with time), step (a jump), dead-band (misses vanish near zero then grow)." },
    strength: { type: "integer", enum: [0, 1, 2, 3], description: "How clear that structure is: 0 none, 1 faint, 2 clear, 3 unmistakable. 0 whenever residual_feature is none." },
    verdict: { type: "string", enum: ["accept", "revise"], description: "revise only if the winner's residuals drift systematically in time and a specific physical effect would explain the drift." },
    headline: { type: "string", description: "The discovery as a headline of at most 12 plain words, no numbers, about the object (e.g. 'The ball falls freely; the air barely touches it.')." },
    finding: { type: "string", description: "What the WINNING law says about this object, in at most two short sentences a 15-year-old understands, like a science teacher announcing a result. Name the winning law's fitted parameters only as placeholders in braces, e.g. 'falls with g = {g}' or 'loses {e} of its speed'. Never type digits. Do not mention ranks, RMS, BIC or code. If the law code chose leaves clear structure in its misses on the fitted frames, say plainly that it only partly captures the motion." },
    why_it_won: { type: "string", description: "One plain sentence on what the law code chose gets right that the other candidates on the table miss, judged from their equations and their misses on the fitted frames, without digits." },
    caveats: { type: "array", items: { type: "string" }, maxItems: 4 },
    revision_idea: { type: "string", description: "If revise: the one physical effect to add and why the residuals point to it, in two sentences. Empty if accept." },
    what_if: {
      type: "array",
      maxItems: 3,
      description: "Counterfactuals worth showing: scale a fitted parameter of the winning law by a factor (e.g. g ×0.165 for the Moon, drag ×0 for vacuum, string ×4).",
      items: { type: "object", additionalProperties: false, required: ["label", "param", "factor"], properties: { label: { type: "string" }, param: { type: "string" }, factor: { type: "number" } } },
    },
  },
};

export async function critique(obs: Observation, board: unknown, ledger: Ledger, model = MODELS.critique, plot?: Uint8Array): Promise<Critique> {
  const text = [
    "You are the referee in a physics lab. Several candidate laws were fitted to the first 70% of a tracked motion; the last 30% was held back and code used it to choose one law (named below as the law code chose). You see only how each candidate fits the frames it was fitted to, listed from the smallest miss to the largest, so the order says nothing about which one code chose, and you cannot change the choice. Explain the result honestly and briefly, and decide whether one more law is worth testing. Misses are given in units of the measurement noise (1 means no more than noise). Ask for a revision only when the chosen law's misses show structure in time (not just noise) and a specific physical effect would explain it: name the structure in residual_feature and its strength first, judging from the picture, the bin means, and the runs test and lag-1 autocorrelation that code computed for you.",
    `Experiment: ${obs.phenomenon}. ${obs.what_happens}`,
    `Table of fits (fitted frames only) and residuals:\n${JSON.stringify(board, null, 1)}`,
    METHOD,
  ].join("\n\n");
  const { value } = await respondJson<Critique>(
    {
      model,
      effort: "medium",
      input: [
        {
          role: "user",
          content: [
            // the residuals as a picture too: law minus measurement against time over the fitted frames, the leading laws
            // in blue, orange and green, with the measurement noise as a dashed band
            ...(plot ? [{ type: "input_image", image_url: `data:image/png;base64,${Buffer.from(plot).toString("base64")}` }, { type: "input_text", text: "The image plots the misses (law minus measurement, divided by each channel's noise) against time over the fitted frames for the three candidates that fit them best: blue is the best fit, orange the next, green the third (their names are in the table, in that order); the dashed band is ±1, one measurement noise. Misses that wander outside the band in a pattern point to a missing effect." }] : []),
            { type: "input_text", text },
          ],
        },
      ],
      schema: CRITIQUE_SCHEMA,
      name: "critique",
      maxOutput: 20000,
    },
    ledger,
    "referee the fits",
  );
  return value;
}

/** The theorist's two tools, strict so the arguments always parse as a law. */
export const WONDER_TOOLS = [
  { type: "function", name: "fit_law", description: "Fit a candidate law to the fitted frames and report how well it explains them.", strict: true, parameters: LAW_SCHEMA },
  { type: "function", name: "submit_law", description: "Submit the one law to be tested on the held-out frames.", strict: true, parameters: LAW_SCHEMA },
];

export type WonderAttempt = { title: string; ok: boolean; trainRms?: number; error?: string };

/**
 * Muse Wonder as an agentic theorist: it can try laws with a fit_law tool (fitted to the fitted frames only;
 * the held-out errors are never returned) and iterate before it submits one. The submitted law then competes
 * on the frames nobody has seen, like every other candidate.
 */
export async function reviseAgentic(
  obs: Observation,
  board: unknown,
  idea: string,
  fit: (law: Law) => Record<string, unknown>,
  ledger: Ledger,
  model = MODELS.revise,
  maxTurns = 6,
  deadline = Infinity,
): Promise<{ law: Law | null; attempts: WonderAttempt[]; auto?: boolean }> {
  const text = [
    "You are the senior theorist in a physics lab. The candidate laws below were fitted to the first 70% of a tracked motion; the rest is held back to test them and you will not see it. The law code chose (named in the table) is thought to miss a physical effect.",
    `Why you were called in: ${idea}`,
    `Experiment: ${obs.phenomenon}. ${obs.what_happens} Setting: ${obs.body}.`,
    `Table of fits (fitted frames only, smallest miss first):\n${JSON.stringify(board, null, 1)}`,
    METHOD,
    "Use the fit_law tool to try a law: it fits the law to the same frames and returns its residuals there, its fitted parameters with uncertainties and any parameter stuck at a bound. Try at most four laws. If an idea's parameter comes back stuck at its bound, the idea isn't refuted: widen that bound (or fix its guess) and try it again before moving on. Prefer the simplest law that removes the drift; a law that only lowers the residuals by adding knobs (a driving force, extra harmonics) will lose on the held-out frames. Then call submit_law with the one law to test.",
  ].join("\n\n");
  const tools = WONDER_TOOLS;
  const attempts: WonderAttempt[] = [];
  // the best law it tried, by its fit to the seen frames: submitted for it if the turns run out first
  let best: { law: Law; rms: number } | null = null;
  const fallback = () => ({ law: best?.law ?? null, attempts, auto: !!best });
  let prev: string | undefined;
  let input: unknown = [{ role: "user", content: [{ type: "input_text", text }] }];
  for (let turn = 0; turn < maxTurns; turn++) {
    // out of time: the best law tried so far goes forward rather than the run overrunning
    if (Date.now() > deadline) break;
    const raw = await respond(
      { model, reasoning: { effort: process.env.WONDER_EFFORT ?? "low" }, max_output_tokens: 16000, tools, parallel_tool_calls: false, input, ...(prev ? { previous_response_id: prev } : {}) },
      ledger,
      `theorist turn ${turn + 1}`,
    );
    prev = raw.id;
    const calls = (raw.output ?? []).filter((o) => (o as { type: string }).type === "function_call") as unknown as { name: string; arguments: string; call_id: string }[];
    if (!calls.length) {
      const loose = parseJsonLoose<WireLaw>(outputText(raw));
      return loose && loose.state ? { law: fromWire(loose), attempts } : fallback();
    }
    const outputs: unknown[] = [];
    for (const c of calls) {
      let wire: WireLaw | null = null;
      try {
        wire = JSON.parse(c.arguments) as WireLaw;
      } catch {
        outputs.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify({ error: "arguments were not valid JSON" }) });
        continue;
      }
      if (c.name === "submit_law") return { law: fromWire(wire), attempts };
      let result: Record<string, unknown>;
      try {
        result = fit(fromWire(wire));
      } catch (e) {
        result = { ok: false, error: (e as Error).message };
      }
      attempts.push({ title: wire.title, ok: !!result.ok, trainRms: typeof result.train_rms === "number" ? result.train_rms : undefined, error: typeof result.error === "string" ? result.error : undefined });
      outputs.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(result) });
      const rms = typeof result.train_rms === "number" ? result.train_rms : Infinity;
      if (result.ok && Number.isFinite(rms) && (!best || rms < best.rms)) {
        try {
          best = { law: fromWire(wire), rms };
        } catch {
          /* not a law the fitter can run */
        }
      }
    }
    // say so before the last turn, so the theorist chooses rather than runs out
    if (turn === maxTurns - 2) outputs.push({ role: "user", content: [{ type: "input_text", text: "Your next turn is the last: call submit_law with the one law to test." }] });
    input = outputs;
  }
  return fallback();
}

/* ─────────────────────── baseline: the eye alone ─────────────────────── */

export const EYEBALL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["estimates", "law_in_words", "confidence"],
  properties: {
    estimates: { type: "array", items: { type: "object", additionalProperties: false, required: ["quantity", "value", "unit"], properties: { quantity: { type: "string" }, value: { type: "number" }, unit: { type: "string" } } } },
    law_in_words: { type: "string" },
    confidence: { type: "string" },
  },
};

export type Eyeball = { estimates: { quantity: string; value: number; unit: string }[]; law_in_words: string; confidence: string };

export async function eyeball(
  fileId: string,
  narration: string,
  quantities: { name: string; unit: string; meaning: string }[],
  ledger: Ledger,
  clip: { fps: number; duration: number; ruler?: string } = { fps: 30, duration: 10 },
): Promise<Eyeball & { seen: { fps: number; frames: number } }> {
  // the same footing as the measurement: every frame (up to 300) and the same ruler
  const vid = videoPart(fileId, clip.fps, clip.duration);
  const text = [
    `Watch this clip of a physics experiment and estimate these quantities as precisely as you can from the video alone. You are shown ${vid.frames} frames, ${vid.fps.toFixed(1)} per second of the clip, so you can time the motion frame by frame.`,
    clip.ruler ? `For scale: ${clip.ruler}.` : "",
    quantities.map((q) => `- ${q.name} (${q.unit}): ${q.meaning}`).join("\n"),
    narration ? `The person filming said: """${narration.slice(0, 2000)}"""` : "",
    "Give your best numerical estimate for each even if unsure.",
  ].join("\n\n");
  const { value } = await respondJson<Eyeball>(
    {
      model: MODELS.eyeball,
      effort: "low",
      input: [{ role: "user", content: [vid.part, { type: "input_text", text }] }],
      name: "eyeball",
      schema: EYEBALL_SCHEMA,
      maxOutput: 3000,
    },
    ledger,
    `eyeball baseline (${vid.frames} frames at ${vid.fps.toFixed(1)} fps)`,
  );
  return { ...value, seen: { fps: vid.fps, frames: vid.frames } };
}

export const POINT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "left", "top", "right", "bottom"],
  properties: { found: { type: "boolean" }, left: { type: "number" }, top: { type: "number" }, right: { type: "number" }, bottom: { type: "number" } },
};

/** Muse Spark points at the object in one frame (pixel box), so SAM 3.1 can follow it when a noun phrase finds nothing. */
export async function point(png: Uint8Array, size: { width: number; height: number }, noun: string, description: string, ledger: Ledger, still = false): Promise<{ left: number; top: number; right: number; bottom: number } | null> {
  const text = `This frame is ${size.width}×${size.height} pixels. Find the ${noun} (${description})${still ? "" : " that is about to move"}. Return its tight bounding box in pixel coordinates of this frame (origin top-left, x to the right, y down). If it isn't visible, set found to false.`;
  const { value } = await respondJson<{ found: boolean; left: number; top: number; right: number; bottom: number }>(
    {
      model: MODELS.observe,
      effort: "medium",
      input: [{ role: "user", content: [{ type: "input_image", image_url: `data:image/png;base64,${Buffer.from(png).toString("base64")}` }, { type: "input_text", text }] }],
      name: "point",
      schema: POINT_SCHEMA,
      maxOutput: 6000,
    },
    ledger,
    `point at "${noun}"`,
  );
  if (!value.found) return null;
  const clamp = (v: number, hi: number) => Math.max(0, Math.min(hi, Math.round(v)));
  const box = { left: clamp(value.left, size.width - 1), top: clamp(value.top, size.height - 1), right: clamp(value.right, size.width), bottom: clamp(value.bottom, size.height) };
  return box.right - box.left >= 2 && box.bottom - box.top >= 2 ? box : null;
}

// Scores Muse Spark's "observe" step against truth, offline, at zero model cost: no Meta call, no SAM call.
// Reads the stored runs (the 28 benchmark runs, the 5 clock-control runs, the 10 showcase runs) and compares each
// stored Observation with what the clip really shows (the renders' exact truth, or hand-checkable facts).
//   1 subject  : did the noun phrase name the moving object (colour + kind, lenient), and did SAM 3.1 find it on the first noun?
//   2 window   : IoU of the observed free-motion window with the true one (release to end, from the truth's events)
//   3 ruler    : when the truth has a reference object, did the observation pick it, with the right length (within 5%)?
//   4 world    : body matches truth
//   5 slow     : when the clip itself states the slowdown, did observe report it? (scored only on stated cases)
//   6 narration: did it pull the spoken fact out of the narration?
// and, per run, what a naive lite default ("the moving object", whole clip, no ruler, Earth) would have got wrong.
// usage: tsx scripts/observer-score.ts [--out data/bench/observer.json]
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { median } from "../lib/median";
import type { Experiment } from "../lib/experiment";

const EARTH_G = 9.80665;
const BODY_G: Record<string, number> = { earth: 9.80665, moon: 1.625, mars: 3.721 };

/* ---------------------------------------------------------------- truth, in one shape */

type Obj = { colour: string | null; heads: string[]; label: string };
type Truth = {
  id: string;
  source: string; // where the truth came from
  phenomenon: string;
  body: string;
  slow: number | null; // true slow-motion factor (null: slowed, factor not known)
  slowStated: boolean; // the clip itself (captions, narration, on-screen text) says so
  motionKind: string;
  objects: Obj[];
  ref: { cat: "stick" | "paper" | "string" | "person" | "ball" | "none"; length_m: number | null; label: string } | null; // physical reference in frame
  window: { start: number; end: number; basis: string } | null; // video seconds
  duration: number;
  facts: { what: RegExp; value: number; label: string }[]; // facts a narrator states
  drag: boolean; // quadratic drag in the render (bends a gravity-as-ruler scale)
};

type RawTruth = {
  case_id: string; phenomenon: string; body: string; description: string; fps: number; width: number; duration_s: number; physics_duration_s: number;
  slow_motion_factor: number; metres_per_pixel: number; release_or_launch_time_s: number | null;
  params?: Record<string, { value: unknown }>;
  moving_objects: { noun_phrase: string; kind: string; colour_rgb?: number[] }[];
  reference?: { noun_phrase: string; length_m: number };
  events?: Record<string, unknown>;
};

const PALETTE: [string, number[]][] = [
  ["red", [215, 35, 45]], ["orange", [235, 110, 30]], ["yellow", [245, 205, 40]], ["green", [40, 165, 75]], ["blue", [35, 105, 215]],
  ["purple", [140, 60, 170]], ["teal", [20, 165, 170]], ["white", [240, 236, 215]], ["pink", [240, 130, 170]], ["brown", [120, 80, 50]], ["black", [30, 30, 30]], ["grey", [128, 128, 128]],
];
const colourOf = (rgb: number[]) => PALETTE.map(([n, c]) => [n, Math.hypot(c[0] - rgb[0], c[1] - rgb[1], c[2] - rgb[2])] as const).sort((a, b) => a[1] - b[1])[0][0];
const COLOUR_WORDS = PALETTE.map(([n]) => n).concat(["gray"]);
/** Observed colour words that mean a palette colour (lenient: "off-white", "violet", "turquoise"). */
const COLOUR_SYN: Record<string, string> = { gray: "grey", violet: "purple", magenta: "purple", lilac: "purple", turquoise: "teal", cyan: "teal", aqua: "teal", maroon: "red", crimson: "red", scarlet: "red", cream: "white", ivory: "white", beige: "white", "off-white": "white" };

/** What the truth's head noun may be called (lenient: a "block" may be a box, a puck a disc, a bob a ball). */
const HEADS: Record<string, string[]> = {
  ball: ["ball", "sphere", "circle", "dot", "balloon", "bob"],
  bob: ["ball", "bob", "sphere", "weight", "pendulum bob"],
  block: ["block", "box", "rectangle", "square", "cube", "mass", "weight"],
  weight: ["block", "box", "rectangle", "square", "cube", "mass", "weight"],
  puck: ["puck", "disc", "disk", "circle", "coin"],
};

function fromRender(t: RawTruth): Truth {
  const ev = (t.events ?? {}) as Record<string, number | number[] | null>;
  const s = t.slow_motion_factor || 1;
  const phys = t.physics_duration_s;
  const num = (k: string) => (typeof ev[k] === "number" ? (ev[k] as number) : undefined);
  const rel = num("release_time_s") ?? num("launch_time_s") ?? t.release_or_launch_time_s ?? 0;
  let span: [number, number, string];
  switch (t.phenomenon) {
    case "free_fall": span = [rel, num("impact_time_s") ?? phys, "release to impact"]; break;
    case "vertical_toss": case "projectile": case "projectile_drag": span = [rel, num("landing_time_s") ?? phys, "launch to landing"]; break;
    case "incline_rolling": span = [rel, num("stopper_hit_time_s") ?? phys, "release to the stopper"]; break;
    case "bouncing_ball": {
      const b = (ev.bounce_times_physics_s as number[] | undefined) ?? [];
      const rest = num("comes_to_rest_time_physics_s");
      // bounces that have converged (gaps under 50 ms) end the motion there; otherwise it runs to the end of the clip
      const end = rest ?? (b.length >= 2 && b[b.length - 1] - b[b.length - 2] < 0.05 ? b[b.length - 1] : phys);
      span = [rel, end, "release to the last bounce"];
      break;
    }
    case "collision_2d": span = [0, phys, "whole clip (both pucks move from the start)"]; break;
    default: span = [rel, phys, "release to the end of the clip"]; // pendulum, spring: held until release, then free until the clip ends
  }
  const objects: Obj[] = t.moving_objects.map((m) => {
    const words = m.noun_phrase.toLowerCase().split(/\s+/);
    const first = words[0];
    const head = m.kind.startsWith("block") ? "block" : m.kind.startsWith("puck") ? "puck" : m.kind.startsWith("ball on string") ? "bob" : words[words.length - 1];
    return { colour: COLOUR_WORDS.includes(first) ? (first === "gray" ? "grey" : first) : m.colour_rgb ? colourOf(m.colour_rgb) : null, heads: HEADS[head] ?? [head], label: m.noun_phrase };
  });
  const rn = t.reference?.noun_phrase.toLowerCase() ?? "";
  const ref: Truth["ref"] = t.reference ? { cat: /stick|ruler/.test(rn) ? "stick" : /paper|a4|sheet/.test(rn) ? "paper" : "stick", length_m: t.reference.length_m, label: `${t.reference.noun_phrase} (${t.reference.length_m} m)` } : null;
  const mk: Record<string, string> = { free_fall: "flight", vertical_toss: "flight", projectile: "flight", projectile_drag: "flight", bouncing_ball: "flight", pendulum: "swing", spring_mass: "oscillation", incline_rolling: "along a path", collision_2d: "along a path" };
  return {
    id: t.case_id, source: `bench/synth/clips/${t.case_id}.json (rendered ground truth)`, phenomenon: t.phenomenon, body: t.body,
    slow: s, slowStated: false, // none of the renders draws a caption or speaks: "captured at 240 fps, encoded at 30" is in the metadata, not in the clip
    motionKind: mk[t.phenomenon] ?? "other", objects, ref,
    window: { start: Math.min(span[0] * s, t.duration_s), end: Math.min(span[1] * s, t.duration_s), basis: span[2] },
    duration: t.duration_s, facts: [], drag: t.phenomenon === "projectile_drag",
  };
}

/** The four showcase clips that are not renders with per-frame truth: facts checked by hand (frames viewed, credit text, narration). */
const HAND: Record<string, Truth> = {
  "moon-jump": { id: "moon-jump", source: "hand-checked: NASA Apollo 16, Young's jump on the Moon; no ruler stated in the clip (we gave the astronaut's height, 1.88 m)", phenomenon: "jump", body: "moon", slow: 1, slowStated: false, motionKind: "flight", objects: [{ colour: null, heads: ["astronaut", "person", "man", "jumper", "spacesuit"], label: "astronaut" }], ref: null, window: null, duration: 8.008, facts: [], drag: false },
  "moon-jump-slowed": { id: "moon-jump-slowed", source: "hand-checked: the same footage slowed 1.5x by us with interpolated frames; nothing in the file says so", phenomenon: "jump", body: "moon", slow: 1.5, slowStated: false, motionKind: "flight", objects: [{ colour: null, heads: ["astronaut", "person", "man", "jumper", "spacesuit"], label: "astronaut" }], ref: null, window: null, duration: 11.945, facts: [], drag: false },
  "sample-pendulum": { id: "sample-pendulum", source: "hand-checked: Wikimedia Commons clip, a yellow tennis ball on a string; only the uploader's title says slow motion, the picture and sound do not", phenomenon: "pendulum", body: "earth", slow: null, slowStated: false, motionKind: "swing", objects: [{ colour: "yellow", heads: ["ball", "tennis ball", "sphere", "bob"], label: "yellow tennis ball" }], ref: null, window: null, duration: 8, facts: [], drag: false },
  "hindi-pendulum": { id: "hindi-pendulum", source: "hand-checked: render, a red bob on a string; the narrator says in Hindi that the thread is sixty centimetres (L = 0.60 m)", phenomenon: "pendulum", body: "earth", slow: 1, slowStated: false, motionKind: "swing", objects: [{ colour: "red", heads: HEADS.bob, label: "red bob" }], ref: { cat: "string", length_m: 0.6, label: "the string, whose 0.60 m the narrator states (no physical ruler is read from the picture)" }, window: null, duration: 7, facts: [{ what: /thread|string|length|lamb|धागे|लंबाई/i, value: 0.6, label: "thread length 0.60 m, spoken in Hindi" }], drag: false },
};

/** The showcase renders are the same renders as these bench clips (same size, fps, length, scale and constants; the web copy is re-encoded). */
const SHOWCASE_RENDER: Record<string, string> = {
  "beach-ball-drag": "pd01_earth_yellow_beachball_k0.25",
  "big-swing": "pe02_large_70deg_L0.80",
  "bouncing-ball": "bb01_e0.72_orange",
  spring: "sp01_k25_m0.20_b0.35",
  "hardening-spring": "sx01_hardening_k12_k3_800",
  "dry-friction-spring": "sx02_coulomb_k20_mu0.45",
};

/* ---------------------------------------------------------------- matching */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

function nameMatches(observed: string, o: Obj): { kind: boolean; colour: boolean } {
  const words = norm(observed).replace(/\b(off) white\b/, "white").split(" ").map((w) => COLOUR_SYN[w] ?? w);
  const text = words.join(" ");
  const kind = o.heads.some((h) => new RegExp(`\\b${h}\\b`).test(text));
  const named = words.filter((w) => COLOUR_WORDS.includes(w)).map((w) => (w === "gray" ? "grey" : w));
  const colour = !o.colour ? true : named.includes(o.colour);
  return { kind, colour };
}

type RulerCat = "stick" | "paper" | "string" | "person" | "ball" | "none";
const RULER_CAT: [RulerCat, RegExp][] = [
  ["stick", /stick|ruler|\bbar\b|scale|striped|banded|\brod\b|metre|meter|bands/],
  ["paper", /paper|sheet|\ba4\b|\bpage\b|\bcard\b/],
  ["string", /string|thread|cord/],
  ["person", /astronaut|person|man|jumper/],
  ["ball", /ball/],
];
const rulerCat = (noun: string) => RULER_CAT.find(([, re]) => re.test(norm(noun)))?.[0] ?? "none";

function iou(a: { start: number; end: number }, b: { start: number; end: number }) {
  const inter = Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
  const union = Math.max(a.end, b.end) - Math.min(a.start, b.start);
  return union > 0 ? inter / union : 0;
}

/** The ledger's SAM and pointing calls, read the way lib/experiment.ts step 4 writes them. */
function samCalls(e: Experiment) {
  const o = e.observation;
  const s = norm(o.subjects[0]?.noun_phrase ?? "");
  const r = o.reference.present ? norm(o.reference.noun_phrase) : "";
  const purposes = e.ledger.calls.map((c) => c.purpose);
  const tracks = purposes.map((p) => /^track "(.+?)"(?: \(est\.\))?$/.exec(p)?.[1]).filter((x): x is string => !!x).map(norm);
  const points = purposes.map((p) => /^point at "(.+?)"/.exec(p)?.[1]).filter((x): x is string => !!x).map(norm);
  const selfRuler = !!r && r === s;
  const subjectTracks = tracks.filter((n) => selfRuler || !r || n !== r);
  const subjectPoints = points.filter((n) => selfRuler || !r || n !== r);
  const rulerTracks = tracks.filter((n) => !!r && !selfRuler && n === r);
  const rulerPoints = points.filter((n) => !!r && !selfRuler && n === r);
  const altRetries = Math.max(0, subjectTracks.length - 1);
  const pointedTrackingUsed = /pointed out by Muse Spark/.test(e.tracking?.noun ?? "");
  const firstNoun = subjectTracks.length === 1 && subjectTracks[0] === s && subjectPoints.length === 0 && !pointedTrackingUsed && (e.tracking?.tracks ?? 0) >= 1;
  return {
    subjectTracks, altRetries, subjectPointedAt: subjectPoints.length > 0 || pointedTrackingUsed, firstNoun,
    rulerFoundByName: selfRuler ? null : r ? rulerPoints.length === 0 && rulerTracks.length > 0 : null,
    trackedNoun: e.tracking?.noun ?? null,
  };
}

/* ---------------------------------------------------------------- scoring one run */

type Reason = { kind: "hard" | "soft" | "shared"; text: string };

function score(set: string, e: Experiment, t: Truth) {
  const o = e.observation;
  const given = e.given ?? [];
  const hinted = {
    subject: o.subjects[0]?.description === "given with the clip",
    ruler: given.some((g) => /^scale:.*\(given with the clip\)/.test(g)) || o.reference.basis === "given with the clip",
    slowMotion: o.slow_motion.evidence === "given with the clip",
  };
  const hintedList = Object.entries(hinted).filter(([, v]) => v).map(([k]) => k);

  // 1. subject
  const observedNames = o.subjects.map((s) => s.noun_phrase);
  const per = t.objects.map((obj) => {
    const best = observedNames.map((n) => nameMatches(n, obj)).sort((a, b) => +(b.kind && b.colour) - +(a.kind && a.colour) || +b.kind - +a.kind)[0] ?? { kind: false, colour: false };
    return { truth: obj.label, kind: best.kind, colour: best.colour, right: best.kind && best.colour };
  });
  const calls = samCalls(e);
  const subject = {
    scored: !hinted.subject,
    observed: observedNames,
    truth: t.objects.map((x) => x.label),
    right: per.every((p) => p.right),
    perObject: per,
    firstNounFound: calls.firstNoun,
    samSubjectTracks: calls.subjectTracks,
    altNounRetries: calls.altRetries,
    pointAtFallback: calls.subjectPointedAt,
    trackedNoun: calls.trackedNoun,
  };

  // 2. window (video seconds)
  const obsWin = { start: o.window.start_s, end: o.window.end_s > o.window.start_s ? o.window.end_s : e.video.duration };
  const win = t.window
    ? { scored: true, observed: [obsWin.start, +obsWin.end.toFixed(3)], truth: [+t.window.start.toFixed(3), +t.window.end.toFixed(3)], truthBasis: t.window.basis, iou: +iou(obsWin, t.window).toFixed(3), naiveWholeClipIou: +iou({ start: 0, end: e.video.duration }, t.window).toFixed(3) }
    : { scored: false, observed: [obsWin.start, +obsWin.end.toFixed(3)], truth: null, truthBasis: "no per-frame truth for this clip", iou: null as number | null, naiveWholeClipIou: null as number | null };

  // 3. ruler
  const orig = { noun: o.reference.noun_phrase, present: o.reference.present, length: o.reference.real_length_m };
  const physRef = t.ref && t.ref.cat !== "string" ? t.ref : null;
  const needed = !!physRef && !hinted.ruler;
  const cat = rulerCat(o.reference.noun_phrase);
  const picked = needed && o.reference.present && cat === physRef!.cat;
  const lengthRight = picked && Math.abs(o.reference.real_length_m / physRef!.length_m! - 1) <= 0.05;
  // the observer wrote the right kind of reference object in its answer but left present = false
  const noticed = !o.reference.present && !!physRef && cat === physRef.cat && norm(orig.noun) !== "";
  const ruler = {
    truth: t.ref ? t.ref.label : "none stated in the clip",
    needed,
    observed: o.reference.present ? `${orig.noun} = ${orig.length} m` : `none${noticed ? ` (it named a “${orig.noun}” but did not use it as a ruler)` : ""}`,
    picked,
    lengthRight,
    foundByName: calls.rulerFoundByName,
    hinted: hinted.ruler,
    noticedButUnused: noticed,
    falsePositive: !t.ref && o.reference.present && !hinted.ruler,
    correctNone: !t.ref && !o.reference.present,
  };

  // 4. world
  const world = { truth: t.body, observed: o.body, right: o.body === t.body };

  // 5. slow motion (scored only when the clip itself states the factor)
  const observedSlow = o.slow_motion.factor;
  const slowedTruth = t.slow === null || t.slow > 1;
  const slow = {
    truth: t.slow === null ? "slowed (factor not known); only the uploader's title says so" : t.slow,
    stated: t.slowStated,
    observed: observedSlow,
    scored: t.slowStated,
    found: t.slowStated ? Math.abs(observedSlow / (t.slow ?? 1) - 1) <= 0.1 : null,
    sayingOnePointZeroOnASlowedClip: slowedTruth && observedSlow === 1,
    falseAlarm: t.slow === 1 && observedSlow > 1,
    clockCheckFactor: e.clock ? +e.clock.factor.toFixed(2) : null,
  };

  // 6. narration facts
  const stated = o.stated_facts ?? [];
  const facts = t.facts.map((f) => {
    const hit = stated.find((s) => Math.abs(s.value - f.value) <= 0.05 * f.value + 1e-9 && (f.what.test(s.quantity) || f.what.test(s.said)));
    return { fact: f.label, found: !!hit, extracted: hit ? `${hit.quantity} = ${hit.value} ${hit.unit}` : null };
  });

  const motionKind = { truth: t.motionKind, observed: o.motion_kind, right: o.motion_kind === t.motionKind };

  // naive lite default: "the moving object", whole clip, no ruler, Earth
  const reasons: Reason[] = [];
  const gT = BODY_G[t.body] ?? EARTH_G;
  const gravityRuler = t.motionKind === "flight" && t.body === "earth";
  if (t.body !== "earth") reasons.push({ kind: "hard", text: `assumes Earth's g (9.81 m/s²) on ${t.body === "moon" ? "the Moon" : "Mars"} (${gT.toFixed(2)}): a scale taken from gravity is ${(EARTH_G / gT).toFixed(1)}× too large, and every g, height and speed measured with it is wrong` });
  if (slowedTruth) {
    const s = t.slow ?? NaN;
    const fixes = picked && lengthRight;
    const text = `the clip is slowed${Number.isFinite(s) ? ` ${s}×` : ""} and nothing in it says so: a gravity-as-ruler scale on a slowed clip is ${Number.isFinite(s) ? `${(s * s).toFixed(1)}×` : "several times"} off${fixes ? "; the observer's ruler gives the right scale" : "; the observer has no right ruler either"} (only the clock check names the slowdown)`;
    if (t.body === "earth" && t.motionKind === "flight") reasons.push({ kind: fixes ? "hard" : "shared", text });
    else reasons.push({ kind: "shared", text: `the clip is slowed${Number.isFinite(s) ? ` ${s}×` : ""} and nothing in it says so: neither the observer nor a naive default sees it, only the clock check does` });
  }
  if (physRef && !(t.body !== "earth")) {
    if (picked && lengthRight && !slowedTruth) {
      if (gravityRuler && !t.drag) reasons.push({ kind: "soft", text: "has no ruler, but on an undistorted Earth flight gravity supplies the scale anyway (the observer's ruler is a cross-check here)" });
      else if (!gravityRuler) reasons.push({ kind: "hard", text: `no ruler and no Earth free flight to take a scale from (${t.motionKind}): lengths stay in pixels` });
    } else if (needed && !picked) {
      if (t.motionKind === "swing") { /* a swing is measured as an angle with Earth's g: no ruler needed, nothing lost */ }
      else if (gravityRuler && t.drag) reasons.push({ kind: "shared", text: "drag bends the gravity-as-ruler scale; the observer missed the ruler too, so both share the bias" });
      else if (!gravityRuler) reasons.push({ kind: "shared", text: `${physRef.label} is in frame and the observer did not pick it: both leave lengths in pixels (${t.motionKind})` });
    } else if (needed && picked && !lengthRight) reasons.push({ kind: "shared", text: `the observer picked the ruler but read it as ${orig.length} m instead of ${physRef.length_m} m: its scale is ${(orig.length / physRef.length_m!).toFixed(1)}× off, so it is no better than a naive default here` });
  }
  if (win.naiveWholeClipIou !== null && win.iou !== null && win.naiveWholeClipIou < 0.7 && win.iou - win.naiveWholeClipIou >= 0.1)
    reasons.push({ kind: "soft", text: `whole clip covers ${(100 * (1 - win.naiveWholeClipIou)).toFixed(0)}% frames outside the free motion (IoU ${win.naiveWholeClipIou} vs the observer's ${win.iou})` });
  if (t.objects.length > 1) reasons.push({ kind: "soft", text: `${t.objects.length} objects move: one generic prompt, "the moving object", names neither (not tested: no SAM call was made)` });
  if (facts.length) reasons.push({ kind: "soft", text: "a spoken length is only heard by the model; a naive default measures L from Earth's g instead, which agrees here" });
  const hard = reasons.filter((r) => r.kind === "hard");

  return {
    id: t.id,
    set,
    phenomenon: t.phenomenon,
    truthSource: t.source,
    hintedByUs: hintedList,
    subject,
    window: win,
    ruler,
    world,
    motionKind,
    slowMotion: slow,
    narration: facts,
    naive: { default: "“the moving object”, whole clip, no ruler, Earth", wouldFail: hard.length > 0, reasons },
  };
}

/* ---------------------------------------------------------------- run it over the stored runs */

function main() {
  const args = process.argv.slice(2);
  const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : "data/bench/observer.json";
  const truthDir = ["bench/synth/clips", "../bench/synth/clips"].find((d) => existsSync(d))!;
  const loadTruth = (id: string): RawTruth => JSON.parse(readFileSync(path.join(truthDir, `${id}.json`), "utf8"));
  const load = (f: string) => JSON.parse(readFileSync(f, "utf8")) as Experiment;

  type Row = ReturnType<typeof score>;
  const rows: Row[] = [];
  const benchDir = ".probe/bench_r7";
  for (const f of readdirSync(benchDir).filter((x) => x.endsWith(".json") && !x.endsWith(".error.json")).sort()) {
    const id = f.replace(/\.json$/, "");
    rows.push(score("benchmark", load(path.join(benchDir, f)), fromRender(loadTruth(id))));
  }
  const ctlDir = "bench/runs/synth";
  for (const f of readdirSync(ctlDir).filter((x) => /^ck\d+.*\.json$/.test(x)).sort()) {
    const id = f.replace(/\.json$/, "");
    rows.push(score("control", load(path.join(ctlDir, f)), fromRender(loadTruth(id))));
  }
  const order = ["moon-jump", "moon-jump-slowed", "sample-pendulum", "hindi-pendulum", "beach-ball-drag", "big-swing", "bouncing-ball", "spring", "hardening-spring", "dry-friction-spring"];
  for (const id of order) {
    const e = load(path.join("data/showcase", `${id}.json`));
    const t = HAND[id] ?? { ...fromRender(loadTruth(SHOWCASE_RENDER[id])), id, source: `bench/synth/clips/${SHOWCASE_RENDER[id]}.json (the same render: matching size, fps, length, scale and constants)` };
    rows.push(score("showcase", e, t));
  }

  const subj = rows.filter((r) => r.subject.scored);
  const winRows = rows.filter((r) => r.window.iou !== null);
  const rulerNeeded = rows.filter((r) => r.ruler.needed);
  const rulerPicked = rulerNeeded.filter((r) => r.ruler.picked);
  const noRuler = rows.filter((r) => !r.ruler.needed && r.ruler.truth === "none stated in the clip" && !r.ruler.hinted);
  const stated = rows.filter((r) => r.slowMotion.stated);
  const factsAll = rows.flatMap((r) => r.narration);
  const slowedTrue = rows.filter((r) => r.slowMotion.truth !== 1);
  const by = (pred: (r: Row) => boolean) => rows.filter(pred).length;
  const hardBreakdown: Record<string, number> = {};
  for (const r of rows) for (const x of r.naive.reasons) if (x.kind === "hard") { const k = /Earth's g/.test(x.text) ? "wrong world (Earth assumed on the Moon or Mars)" : /slowed/.test(x.text) ? "slowed clip: gravity-as-ruler scale off by the slowdown squared" : "no ruler and no free flight to take a scale from"; hardBreakdown[k] = (hardBreakdown[k] ?? 0) + 1; }

  const summary = {
    runs: rows.length,
    subjectRight: subj.filter((r) => r.subject.right).length,
    subjectScored: subj.length,
    firstNounFound: subj.filter((r) => r.subject.firstNounFound).length,
    windowMedianIoU: +median(winRows.map((r) => r.window.iou!)).toFixed(3),
    windowScored: winRows.length,
    windowNaiveWholeClipMedianIoU: +median(winRows.map((r) => r.window.naiveWholeClipIou!)).toFixed(3),
    windowTighterThanWholeClip: winRows.filter((r) => r.window.iou! > r.window.naiveWholeClipIou! + 0.02).length,
    windowIouAtLeast0_8: winRows.filter((r) => r.window.iou! >= 0.8).length,
    rulerPicked: rulerPicked.length,
    rulerNeeded: rulerNeeded.length,
    rulerLengthRight: rulerPicked.filter((r) => r.ruler.lengthRight).length,
    rulerFoundByNameWhenPicked: rulerPicked.filter((r) => r.ruler.foundByName === true).length,
    rulerMissedButNoticedABar: rulerNeeded.filter((r) => !r.ruler.picked && r.ruler.noticedButUnused).length,
    rulerNoneTruth: noRuler.length,
    rulerNoneCorrect: noRuler.filter((r) => r.ruler.correctNone).length,
    worldRight: by((r) => r.world.right),
    statedSlowFound: stated.filter((r) => r.slowMotion.found).length,
    statedSlow: stated.length,
    slowedClips: slowedTrue.length,
    slowedClipsObserverSaidNone: slowedTrue.filter((r) => r.slowMotion.sayingOnePointZeroOnASlowedClip).length,
    slowedClipsClockCheckFlagged: slowedTrue.filter((r) => r.slowMotion.clockCheckFactor !== null).length,
    slowFalseAlarms: by((r) => r.slowMotion.falseAlarm),
    narrationFactFound: factsAll.filter((f) => f.found).length,
    narrationFacts: factsAll.length,
    motionKindRight: by((r) => r.motionKind.right),
    naiveWouldFail: by((r) => r.naive.wouldFail),
    naiveWouldFailBy: hardBreakdown,
    samSubjectFallbacks: subj.filter((r) => !r.subject.firstNounFound).length,
    hintedByUs: Object.fromEntries(["subject", "ruler", "slowMotion"].map((k) => [k, by((r) => r.hintedByUs.includes(k))])),
    bySet: Object.fromEntries(["benchmark", "control", "showcase"].map((s) => [s, rows.filter((r) => r.set === s).length])),
  };

  const note =
    "Offline, no model or SAM call: every number is read from the stored runs. Muse Spark's observe step (subject, free-motion window, reference object, world, slow-motion, spoken facts, experiment type) is compared with the renders' exact truth (bench/synth/clips) and, for the four clips that are not renders, with facts checked by hand. " +
    "Judgement calls: (1) subject matching is lenient on kind (a block may be a box or mass, a puck a disc, a bob a ball) and on colour words (off-white is white), but it needs a colour and a kind; for pendulum bobs the colour comes from the render's RGB. " +
    "(2) The free-motion window is release to impact, landing, the stopper, the last converged bounce, or the end of the clip for pendulums and springs, from the truth's event times times the slow-motion factor; before release a bob or block is held, so a window that starts at 0 loses some IoU. " +
    "(3) A reference counts as picked when it is present and names the right kind of object (stick, bar or ruler; paper or sheet), and the length is right within 5%. " +
    "(4) Slow motion is scored only when the clip itself states it, and none of the renders draws or speaks a caption (the factor is in their metadata), so the stated count is zero; the slowed clips are listed instead, with the clock check's reading. " +
    "(5) On four showcase clips we gave the subject and/or the ruler with the clip (moon-jump, moon-jump-slowed, sample-pendulum; the metre stick on hardening-spring), so those fields are the hint, not the observer, and are left out of the subject and ruler counts. " +
    "(6) Six showcase renders are matched to their bench clips by size, fps, length, scale and the constants in the credit text (the web copies are re-encoded, so the bytes differ). " +
    "(7) hindi-pendulum has no physical ruler read from the picture; its scale is the narrated string, so it is scored under narration facts, not under the ruler. " +
    "(8) The naive default's trouble is judged from the physics (a gravity scale needs the right g, an unslowed clip and no drag), not re-run; whether SAM would find “the moving object” by that name was not tested. " +
    "A reason is hard when the observer's answer is right and the naive default's is not, shared when both miss, soft when it is a degradation rather than a failure.";

  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), note, summary, rows }, null, 1));
  console.log(JSON.stringify(summary, null, 1));
  for (const r of rows) {
    const w = r.window.iou === null ? "  -  " : r.window.iou.toFixed(2);
    console.log(`${r.id.padEnd(36)} subj ${r.subject.scored ? (r.subject.right ? "ok " : "NO ") : "hint"} 1st ${r.subject.firstNounFound ? "y" : "n"} win ${w} ruler ${r.ruler.needed ? (r.ruler.picked ? (r.ruler.lengthRight ? "ok " : "len") : "MISS") : r.ruler.hinted ? "hint" : r.ruler.falsePositive ? "FP  " : "n/a "} world ${r.world.right ? "ok" : "NO"} kind ${r.motionKind.right ? "ok" : "NO"} slow ${r.slowMotion.clockCheckFactor ?? "-"} naive ${r.naive.wouldFail ? "FAIL" : "ok"}`);
  }
}

if (process.argv[1] && /observer-score\.ts$/.test(process.argv[1].replace(/\\/g, "/"))) main();

export { fromRender, nameMatches, iou, samCalls, score, rulerCat, colourOf };

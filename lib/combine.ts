/**
 * Code combines terms the models already wrote. Two moves, each one more candidate in the pool that the held-out
 * frames then judge like every other law (a term that is not there loses on them, and a tie goes to the simpler law):
 *
 *  - a drive: when the misses of the best law without a drive oscillate at an unexplained frequency (lib/spectrum.ts
 *    classifyPeaks: not the motion's own, not a harmonic of it, not a drift, above the noise), code adds that law plus
 *    F·cos(ω_d t + φ) on its acceleration, ω_d started at the peak and F and φ started from the peak's amplitude and
 *    phase, every other constant started where the law's own fit left it;
 *  - a recombination: Muse Wonder's stiffness with Muse Spark's damping, when the two differ.
 *
 * Pure: laws in, laws out. Nothing here fits or ranks.
 */
import { compile, names, parse, type Node } from "./physics/expr";
import type { Law } from "./physics/law";
import type { SpectrumPeak } from "./spectrum";

/** the drive's parameter names (a frequency name the drive detector reads as one: w…, rad/s) */
export const DRIVE = { F: "F_drive", w: "w_drive", phi: "phi_drive" } as const;
const DRIVE_NAMES: string[] = Object.values(DRIVE);

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "^": 4 };
/** a tree back to source, parenthesised wherever precedence needs it */
export function print(n: Node, parent = 0, right = false): string {
  switch (n.k) {
    case "num":
      return Number.isInteger(n.v) ? String(n.v) : String(+n.v.toPrecision(12));
    case "var":
      return n.name;
    case "call":
      return `${n.fn}(${n.args.map((a) => print(a)).join(", ")})`;
    case "neg": {
      // unary minus binds looser than ^ and tighter than * and /: -a^2 is -(a^2), -a*b is (-a)*b (the same value)
      const s = `-${print(n.a, 2)}`;
      return parent >= 4 && !right ? `(${s})` : s;
    }
    case "bin": {
      const p = PREC[n.op];
      // a right operand of - or / binds tighter; ^ is right associative
      const s = `${print(n.a, n.op === "^" ? p + 1 : p)} ${n.op} ${print(n.b, p, true)}`;
      const need = p < parent || (p === parent && (right ? n.op !== "^" : n.op === "^"));
      return need ? `(${s})` : s;
    }
  }
}

/** rename variables in a tree */
export function rename(n: Node, map: Record<string, string>): Node {
  switch (n.k) {
    case "var":
      return map[n.name] ? { k: "var", name: map[n.name] } : n;
    case "neg":
      return { k: "neg", a: rename(n.a, map) };
    case "bin":
      return { ...n, a: rename(n.a, map), b: rename(n.b, map) };
    case "call":
      return { ...n, args: n.args.map((a) => rename(a, map)) };
    default:
      return n;
  }
}

/** the additive terms of an expression at its top level, each with its sign folded in */
export function additiveTerms(n: Node, sign = 1, out: Node[] = []): Node[] {
  if (n.k === "bin" && (n.op === "+" || n.op === "-")) {
    additiveTerms(n.a, sign, out);
    additiveTerms(n.b, n.op === "-" ? -sign : sign, out);
  } else if (n.k === "neg") additiveTerms(n.a, -sign, out);
  else out.push(sign < 0 ? { k: "neg", a: n } : n);
  return out;
}
const sum = (terms: Node[]) =>
  terms.length
    ? terms
        .map((t, i) => {
          const s = print(t);
          return i === 0 ? s : s.startsWith("-") ? `- ${s.slice(1)}` : `+ ${s}`;
        })
        .join(" ")
    : "0";

const namesOf = (src: string): Set<string> | null => {
  try {
    return names(parse(src));
  } catch {
    return null;
  }
};

/**
 * The law's position–velocity pair on a channel: the position state the channel observes and the velocity its
 * derivative names (s' = v). Null when the law is not written that way.
 */
export function motionPair(law: Law, channel?: string): { pos: string; vel: string } | null {
  const pairs = law.state.flatMap((s) => {
    const d = (law.derivatives[s] ?? "").trim();
    return d !== s && law.state.includes(d) ? [{ pos: s, vel: d }] : [];
  });
  if (!pairs.length) return null;
  const obs = channel ? [law.observe[channel]].filter(Boolean) : Object.values(law.observe);
  const seen = (p: { pos: string }) => obs.some((o) => namesOf(o)?.has(p.pos));
  return pairs.find(seen) ?? (pairs.length === 1 ? pairs[0] : null);
}

export type TermKind = "stiffness" | "damping" | "drive";
/** what a term of an acceleration does: depends on time (a drive), on the velocity (damping), or neither (stiffness, offsets) */
export function termKind(t: Node, pair: { pos: string; vel: string }): TermKind {
  const ns = names(t);
  if (ns.has("t")) return "drive";
  if (ns.has(pair.vel)) return "damping";
  return "stiffness";
}
/** the damping form of one term: dry (sign/tanh of v), quadratic (v·|v|, v²) or linear */
const dampForm = (t: Node, vel: string) => {
  const s = print(t).replace(/\s+/g, "");
  const v = vel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (/\b(sign|tanh|atan)\(/.test(s)) return "dry";
  if (new RegExp(`abs\\(${v}\\)|\\b${v}\\^2|\\b${v}\\*${v}\\b|hypot|sqrt`).test(s)) return "quadratic";
  return "linear";
};
/** the set of damping forms a law's acceleration carries, e.g. "linear+quadratic"; "" when it has none */
export function dampingSignature(law: Law, channel?: string): string | null {
  const pair = motionPair(law, channel);
  if (!pair) return null;
  let terms: Node[];
  try {
    terms = additiveTerms(parse(law.derivatives[pair.vel]));
  } catch {
    return null;
  }
  return [...new Set(terms.filter((t) => termKind(t, pair) === "damping").map((t) => dampForm(t, pair.vel)))].sort().join("+");
}

/** a law's fitted values as its starting guesses (inside its bounds), and its fitted initial states as theirs */
export function warmStart(law: Law, theta: Record<string, number>): Law {
  return {
    ...law,
    params: law.params.map((p) => {
      const v = theta[p.name];
      if (p.fixed || !Number.isFinite(v)) return { ...p };
      const lo = p.min ?? -Infinity, hi = p.max ?? Infinity;
      return { ...p, guess: Math.min(hi, Math.max(lo, v)) };
    }),
    initialGuess: {
      ...(law.initialGuess ?? {}),
      ...Object.fromEntries(Object.entries(theta).filter(([k, v]) => k.endsWith("@0") && Number.isFinite(v)).map(([k, v]) => [k.slice(0, -2), v])),
    },
  };
}

/** whether a law already has a term in time t (a drive, or anything else that depends on the clock) */
export const hasTimeTerm = (law: Law) => Object.values(law.derivatives).some((d) => namesOf(d)?.has("t") ?? true);

/**
 * The law plus a periodic drive F·cos(ω_d t + φ) on the acceleration of the position the peak's strongest channel
 * observes. ω_d starts at the peak; F and φ start from the forced response a drive at that frequency would leave in the
 * misses (amplitude R and phase ψ of the missing motion, F = |ω₀² − ω_d²|·R, φ = ψ, or ψ + π above ω₀); `flip` starts φ
 * half a cycle on (for a channel that observes the position with a minus sign); ω_d stays under `maxOmega` (the frame
 * rate's limit, where a faster drive would alias). Null when the law already has a time
 * term, has no position–velocity pair, or the peak has no channel to read.
 */
export function withDrive(law: Law, peak: SpectrumPeak, motionOmega: number, unit: string, flip = false, maxOmega = Infinity): Law | null {
  const chs = Object.entries(peak.byChannel).sort((a, b) => b[1] - a[1]);
  const ch = chs.find(([c]) => law.observe[c])?.[0];
  if (!ch) return null;
  const pair = motionPair(law, ch);
  if (!pair) return null;
  if (hasTimeTerm(law)) return null;
  if (law.params.some((p) => DRIVE_NAMES.includes(p.name)) || law.state.some((s) => DRIVE_NAMES.includes(s))) return null;
  const w = peak.omega;
  // the missing motion is minus the misses (misses are law minus measurement): −(a cos ωt + b sin ωt) = R cos(ωt + ψ)
  const c = peak.coef?.[ch] ?? { a: peak.byChannel[ch] ?? 0, b: 0 };
  const R = Math.hypot(c.a, c.b);
  const psi = Math.atan2(c.b, -c.a);
  const F = Math.max(Math.abs(motionOmega * motionOmega - w * w) * R, 1e-6);
  let phi = psi + (w > motionOmega ? Math.PI : 0) + (flip ? Math.PI : 0);
  phi = Math.atan2(Math.sin(phi), Math.cos(phi));
  const acc = law.derivatives[pair.vel];
  return {
    ...law,
    id: `${law.id}-drive`,
    title: `${law.title}, with a periodic drive`,
    summary: `${law.summary} Plus a periodic drive F·cos(ω_d t + φ), added by code at the unexplained residual frequency ${w.toFixed(2)} rad/s.`.trim(),
    derivatives: { ...law.derivatives, [pair.vel]: `${acc} + ${DRIVE.F}*cos(${DRIVE.w}*t + ${DRIVE.phi})` },
    params: [
      ...law.params.map((p) => ({ ...p })),
      { name: DRIVE.F, guess: F, min: 0, max: F * 20, unit: `${unit}/s^2`, meaning: "drive amplitude (acceleration)" },
      { name: DRIVE.w, guess: w, min: w / 2, max: Math.max(w * 1.01, Math.min(w * 2, maxOmega)), unit: "rad/s", meaning: "drive angular frequency" },
      { name: DRIVE.phi, guess: phi, min: -2 * Math.PI, max: 2 * Math.PI, unit: "rad", meaning: "drive phase" },
    ],
  };
}

/**
 * Muse Wonder's stiffness with another law's damping: the stiffness law's acceleration keeps its stiffness (and any
 * offset) terms and takes the damping law's damping terms in place of its own, with the damping law's position and
 * velocity renamed to the stiffness law's and its damping constants carried over (renamed on a clash). A drive in the
 * stiffness law is kept. Null when either law is not a position–velocity law on the channel, a damping term names
 * anything but the pair and its own constants, the damping law has a time term, or the damping would not change.
 */
export function combineStiffnessDamping(stiff: Law, damp: Law, channel?: string): Law | null {
  const ps = motionPair(stiff, channel), pd = motionPair(damp, channel);
  if (!ps || !pd) return null;
  let ts: Node[], td: Node[];
  try {
    ts = additiveTerms(parse(stiff.derivatives[ps.vel]));
    td = additiveTerms(parse(damp.derivatives[pd.vel]));
  } catch {
    return null;
  }
  // the stiffness law may carry a drive (kept with its stiffness: a driven law whose damping is the wrong form, set 4's
  // misses); the damping donor may not
  if (td.some((t) => termKind(t, pd) === "drive")) return null;
  const keep = ts.filter((t) => termKind(t, ps) !== "damping");
  const dampTerms = td.filter((t) => termKind(t, pd) === "damping");
  if (!dampTerms.length) return null;
  const dParams = new Map(damp.params.map((p) => [p.name, p]));
  // a damping term may name only the velocity, the position and the damping law's own constants
  for (const t of dampTerms) for (const n of names(t)) if (n !== pd.vel && n !== pd.pos && n !== "pi" && !dParams.has(n)) return null;
  const keptNames = new Set(keep.flatMap((t) => [...names(t)]));
  // the stiffness law's other equations, what it observes and its events keep their constants too
  const others = [...Object.entries(stiff.derivatives).filter(([s]) => s !== ps.vel).map(([, d]) => d), ...Object.values(stiff.observe), ...(stiff.events ?? []).flatMap((ev) => [ev.when, ...Object.values(ev.then)])];
  for (const src of others) {
    const ns = namesOf(src);
    if (!ns) return null;
    for (const n of ns) keptNames.add(n);
  }
  const stiffParams = stiff.params.filter((p) => keptNames.has(p.name));
  const taken = new Set([...stiffParams.map((p) => p.name), ...stiff.state, "t", "pi"]);
  const map: Record<string, string> = { [pd.vel]: ps.vel, [pd.pos]: ps.pos };
  const carried: Law["params"] = [];
  for (const n of new Set(dampTerms.flatMap((t) => [...names(t)]))) {
    const p = dParams.get(n);
    if (!p) continue;
    let name = n;
    while (taken.has(name)) name = `${name}_d`;
    taken.add(name);
    if (name !== n) map[n] = name;
    carried.push({ ...p, name });
  }
  const newDamp = dampTerms.map((t) => rename(t, map));
  const before = dampingSignature(stiff, channel);
  const after = [...new Set(newDamp.map((t) => dampForm(t, ps.vel)))].sort().join("+");
  if (before === after) return null;
  return {
    ...stiff,
    id: `${stiff.id}+${damp.id}-damping`,
    title: `${stiff.title}, with the damping of “${damp.title}”`,
    summary: `The stiffness of “${stiff.title}” with the damping of “${damp.title}”, combined by code.`,
    derivatives: { ...stiff.derivatives, [ps.vel]: sum([...keep, ...newDamp]) },
    params: [...stiffParams.map((p) => ({ ...p })), ...carried],
  };
}

/* ─────────────── code moves that complete a law's terms (recorded as code's, never as a model's) ─────────────── */

/** every position–velocity pair in a law (s' = v), in state order */
export function motionPairs(law: Law): { pos: string; vel: string }[] {
  return law.state.flatMap((s) => {
    const d = (law.derivatives[s] ?? "").trim();
    return d !== s && law.state.includes(d) ? [{ pos: s, vel: d }] : [];
  });
}

const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** the power of the position in a stiffness term: (pos − X)^n or pos^n, else the count of position factors */
function posPower(t: Node, pos: string): number {
  const s = print(t).replace(/\s+/g, "");
  const p = esc(pos);
  const caret = s.match(new RegExp(`\\(${p}-\\w+\\)\\^(\\d)|\\b${p}\\^(\\d)`));
  if (caret) return +(caret[1] ?? caret[2]);
  return (s.match(new RegExp(`\\(${p}-\\w+\\)|\\b${p}\\b(?!\\^)`, "g")) ?? []).length;
}
/** the rest position a law's stiffness is written about: X in (pos − X), or null when it is written about pos itself */
function restOf(terms: Node[], pos: string): string | null {
  const p = esc(pos);
  for (const t of terms) {
    const m = print(t).replace(/\s+/g, "").match(new RegExp(`\\(${p}-(\\w+)\\)`));
    if (m) return m[1];
  }
  return null;
}
/** a law's acceleration terms on its observed position, or null when it has no position–velocity pair there */
function accTerms(law: Law, channel?: string): { pair: { pos: string; vel: string }; terms: Node[] } | null {
  const pair = motionPair(law, channel);
  if (!pair) return null;
  try {
    return { pair, terms: additiveTerms(parse(law.derivatives[pair.vel])) };
  } catch {
    return null;
  }
}

/** whether a law's stiffness already has a term in the square of the position (a lopsided spring) */
export function hasLopsided(law: Law, channel?: string): boolean {
  const a = accTerms(law, channel);
  return !!a && a.terms.some((t) => termKind(t, a.pair) === "stiffness" && posPower(t, a.pair.pos) === 2);
}

/**
 * The law plus a lopsided (x²) stiffness, −k2·(pos − X)², about the rest position its stiffness is written about (every
 * other term, a drive included, as it was). `scale` sets the start: the motion's frequency and its amplitude (in the
 * channel's unit). Null when the law already has one or has no position–velocity pair.
 */
export function withLopsided(law: Law, scale: { omega: number; amp: number }, channel?: string): Law | null {
  const a = accTerms(law, channel);
  if (!a || hasLopsided(law, channel)) return null;
  if (law.params.some((p) => p.name === "k2_lop")) return null;
  const rest = restOf(a.terms.filter((t) => termKind(t, a.pair) === "stiffness"), a.pair.pos);
  const g = (0.02 * scale.omega * scale.omega) / Math.max(scale.amp, 1e-9);
  const sq = rest ? `(${a.pair.pos} - ${rest})^2` : `${a.pair.pos}^2`;
  return {
    ...law,
    id: `${law.id}+lopsided`,
    title: `${law.title}, with a lopsided (x²) stiffness`,
    summary: `${law.summary} Plus a lopsided restoring force k2·(s − s_eq)², added by code.`.trim(),
    derivatives: { ...law.derivatives, [a.pair.vel]: `${law.derivatives[a.pair.vel]} - k2_lop*${sq}` },
    params: [...law.params.map((p) => ({ ...p })), { name: "k2_lop", guess: g, min: -1000 * g, max: 1000 * g, meaning: "lopsided (x²) stiffness per unit mass" }],
  };
}

/** whether a law's damping already has a dry (Coulomb) form */
export const hasDry = (law: Law, channel?: string) => (dampingSignature(law, channel) ?? "").split("+").includes("dry");

/**
 * The law with its damping replaced by dry (Coulomb) friction, −μ·tanh(v/v0) with v0 held at 2% of the swing's peak
 * speed (stiffness and drive terms kept). Null when it already has a dry form or no position–velocity pair.
 */
export function withDryDamping(law: Law, scale: { omega: number; amp: number }, channel?: string): Law | null {
  const a = accTerms(law, channel);
  if (!a || hasDry(law, channel)) return null;
  if (law.params.some((p) => p.name === "mu_dry" || p.name === "v0_dry")) return null;
  const keep = a.terms.filter((t) => termKind(t, a.pair) !== "damping");
  const kept = new Set(keep.flatMap((t) => [...names(t)]));
  for (const [s, d] of Object.entries(law.derivatives)) if (s !== a.pair.vel) for (const n of namesOf(d) ?? []) kept.add(n);
  for (const o of Object.values(law.observe)) for (const n of namesOf(o) ?? []) kept.add(n);
  for (const ev of law.events ?? []) for (const src of [ev.when, ...Object.values(ev.then)]) for (const n of namesOf(src) ?? []) kept.add(n);
  const w = scale.omega, A = Math.max(scale.amp, 1e-9);
  const mu = (w * w * A) / 30;
  return {
    ...law,
    id: `${law.id}+dry`,
    title: `${law.title}, with dry (Coulomb) friction for its damping`,
    summary: `${law.summary} Its damping replaced by dry (Coulomb) friction μ·tanh(v/v0), by code.`.trim(),
    derivatives: { ...law.derivatives, [a.pair.vel]: `${sum(keep)} - mu_dry*tanh(${a.pair.vel}/v0_dry)` },
    params: [...law.params.filter((p) => kept.has(p.name)).map((p) => ({ ...p })), { name: "mu_dry", guess: mu, min: 0, max: 30 * mu, meaning: "dry friction (deceleration)" }, { name: "v0_dry", guess: 0.02 * w * A, fixed: true, meaning: "speed below which dry friction fades (held)" }],
  };
}

/**
 * The free oscillators a law carries besides its motion: for a law with more than one position–velocity pair, each
 * pair's own frequency and damping, linearised about its rest position (∂a/∂pos and ∂a/∂vel at rest), with the
 * damping's σ from the fit's σ on each constant. A pair whose damping is within 2σ of zero is an undamped mode: a
 * sinusoid at its own frequency that never decays, which is how a drive looks when it is written as a second
 * oscillator (sealed round 6604982's winner). Empty for a law with one pair.
 */
export function freeModes(law: Law, theta: Record<string, number>, sigma: Record<string, number> = {}): { pos: string; omega: number; gamma: number; sigmaGamma: number; undamped: boolean }[] {
  const pairs = motionPairs(law);
  if (pairs.length < 2) return [];
  const pnames = law.params.map((p) => p.name);
  const vars = [...law.state, "t", ...pnames];
  const out: { pos: string; omega: number; gamma: number; sigmaGamma: number; undamped: boolean }[] = [];
  for (const pair of pairs) {
    let f: (s: Float64Array) => number;
    let rest: string | null = null;
    try {
      f = compile(law.derivatives[pair.vel], vars);
      const r = restOf(additiveTerms(parse(law.derivatives[pair.vel])), pair.pos);
      rest = r && pnames.includes(r) ? r : null;
    } catch {
      continue;
    }
    const ip = vars.indexOf(pair.pos), iv = vars.indexOf(pair.vel);
    const lin = (th: number[]) => {
      const s = new Float64Array(vars.length);
      th.forEach((v, i) => (s[law.state.length + 1 + i] = v));
      if (rest) s[ip] = th[pnames.indexOf(rest)];
      const d = (i: number, h: number) => {
        const a = Float64Array.from(s), b = Float64Array.from(s);
        a[i] += h;
        b[i] -= h;
        return (f(a) - f(b)) / (2 * h);
      };
      return { k: -d(ip, 1e-4 * Math.max(1, Math.abs(s[ip]))), c: -d(iv, 1e-4) };
    };
    const th0 = law.params.map((p) => (Number.isFinite(theta[p.name]) ? theta[p.name] : p.guess));
    const { k, c } = lin(th0);
    if (!(k > 0) || !Number.isFinite(c)) continue;
    let v2 = 0, undef = false;
    law.params.forEach((p, i) => {
      if (p.fixed) return;
      const sg = sigma[p.name];
      if (!Number.isFinite(sg)) { undef = true; return; }
      const h = 1e-4 * Math.max(Math.abs(th0[i]), Math.abs(sg), 1e-9);
      const up = [...th0], dn = [...th0];
      up[i] += h;
      dn[i] -= h;
      const dc = (lin(up).c - lin(dn).c) / (2 * h);
      if (Number.isFinite(dc)) v2 += (dc * sg) ** 2;
    });
    const sg = undef ? NaN : Math.sqrt(v2);
    const omega = Math.sqrt(k);
    out.push({ pos: pair.pos, omega, gamma: c, sigmaGamma: sg, undamped: Number.isFinite(sg) ? Math.abs(c) <= 2 * sg : Math.abs(c) < 0.05 * omega });
  }
  return out;
}

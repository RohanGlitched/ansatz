/**
 * When two laws rank first and second only because a tie went to the simpler one, the clip has not told them apart.
 * The same tie rule the ranking uses (lib/experiment.ts rankCandidates): each law scored by the worse of its fitted and
 * unseen misses in noise units; both within 1.5× the noise, or half a noise unit or 10% apart, is a tie.
 */
type Fit = { ok: boolean; testZ?: number; trainZ?: number };
type LawLike = { id: string; title: string; derivatives?: Record<string, string>; params?: { name: string; fixed?: boolean; unit?: string }[] };
type Cand = { rank: number; law: LawLike; fit: Fit & { theta?: Record<string, number>; sigma?: Record<string, number> } };

export const noiseScore = (f: Fit) => (f.ok && Number.isFinite(f.testZ) ? Math.max(f.testZ!, Number.isFinite(f.trainZ) ? f.trainZ! : 0) : Infinity);

export function tied(a: Fit, b: Fit): boolean {
  const fa = noiseScore(a), fb = noiseScore(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return false;
  return Math.max(fa, fb) < 1.5 || Math.abs(fa - fb) < Math.max(0.1 * Math.max(fa, fb), 0.5);
}

/** How a law's velocity is damped: linear (−γv), quadratic (−c v|v|), both, or not at all (null). */
export type DampingForm = "linear" | "quadratic" | "both" | null;

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Read from the equation, never the title ("Damped pendulum with linear air drag" is linear, though its title says
 * "air drag"). The velocity variables are the ones a position's derivative names (s' = v, θ' = ω). In a velocity's own
 * derivative, v·|v|, |v|·v, v², v·v and hypot(…)·v are quadratic; sign(v) is dry friction, which is neither; any
 * velocity left after those are taken out is linear. A law with no equation falls back to its title.
 */
export function dampingForm(law: LawLike): DampingForm {
  const d = law.derivatives;
  if (!d || !Object.keys(d).length) {
    const t = `${law.title} ${law.id}`;
    if (/linear\s+(and|plus)\s+quadratic/i.test(t)) return "both";
    if (/quadratic|v\s*\|v\|/i.test(t)) return "quadratic";
    return /damp|drag|viscous|friction/i.test(t) ? "linear" : null;
  }
  const vel = [...new Set(Object.values(d).map((x) => x.trim()).filter((x) => /^[A-Za-z_]\w*$/.test(x) && x in d))];
  if (!vel.length) return null;
  const V = vel.map(esc).join("|");
  const id = String.raw`(?<![\w.])(?:${V})(?![\w(])`;
  const quad = [
    new RegExp(String.raw`${id}\*abs\(\s*(?:${V})\s*\)`, "g"),
    new RegExp(String.raw`abs\(\s*(?:${V})\s*\)\*${id}`, "g"),
    new RegExp(String.raw`${id}\*\|\s*(?:${V})\s*\|`, "g"),
    new RegExp(String.raw`${id}\s*(?:\^|\*\*)\s*2(?![\d.])`, "g"),
    new RegExp(String.raw`(?:hypot|sqrt)\([^()]*\)\*${id}`, "g"),
    new RegExp(String.raw`${id}\*(?:hypot|sqrt)\([^()]*\)`, "g"),
    new RegExp(String.raw`(?<![\w.])(${V})\*\1(?![\w(])`, "g"),
  ];
  let linear = false, quadratic = false;
  for (const v of vel) {
    let x = (d[v] ?? "").replace(/\s+/g, "");
    for (const q of quad) x = x.replace(q, () => ((quadratic = true), "Q"));
    x = x.replace(new RegExp(String.raw`sign\((?:${V})\)`, "g"), "D");
    if (new RegExp(id).test(x)) linear = true;
  }
  return linear && quadratic ? "both" : quadratic ? "quadratic" : linear ? "linear" : null;
}

const topTwo = (e: { candidates: Cand[] }) => e.candidates.filter((c) => c.fit.ok).sort((a, b) => a.rank - b.rank);

/** The damping law is not decided: the top two laws are the two damping forms and the ranking could not separate them. */
export const DAMPING_UNDECIDED = "the damping law is not decided by this clip (linear and quadratic damping tie)";

/**
 * DAMPING_UNDECIDED when the top two laws are one linear and one quadratic damping law and they tie; null otherwise
 * (two linear laws, a damped against an undamped law, or a linear law against linear-plus-quadratic, which is nested:
 * see dampingNested).
 */
export function dampingTie(e: { candidates: Cand[]; winner: string }): string | null {
  const [a, b] = topTwo(e);
  if (!a || !b) return null;
  const fa = dampingForm(a.law), fb = dampingForm(b.law);
  const pair = new Set([fa, fb]);
  if (!(pair.has("linear") && pair.has("quadratic"))) return null;
  return tied(a.fit, b.fit) ? DAMPING_UNDECIDED : null;
}

/**
 * A law with linear damping ranked first, tied with the same law plus a quadratic term: the two are nested, so this is
 * not a tie between forms; the quadratic term is simply not needed. Null otherwise.
 */
export function dampingNested(e: { candidates: Cand[]; winner: string }): string | null {
  const [a, b] = topTwo(e);
  if (!a || !b || !tied(a.fit, b.fit)) return null;
  const fa = dampingForm(a.law), fb = dampingForm(b.law);
  if (fb === "both" && (fa === "linear" || fa === "quadratic")) return `the ${fa === "linear" ? "quadratic" : "linear"} damping term is not needed: the same law with it added fits no better`;
  return null;
}

/**
 * The winning law's title as an index or a summary should print it: when the damping law is not decided, the title
 * of whichever form ranked first is followed by that caveat, so "with quadratic air drag" is never asserted alone.
 */
export function winnerTitle(e: { candidates: Cand[]; winner: string }): string {
  const w = e.candidates.find((c) => c.law.id === e.winner) ?? topTwo(e)[0];
  if (!w) return "";
  return dampingTie(e) ? `${w.law.title} (ranked first, but ${DAMPING_UNDECIDED})` : w.law.title;
}

/** What a page prints in place of the winner's own mechanism sentence when the damping law is not decided. */
export const DAMPING_UNDECIDED_SUMMARY = "It loses energy to damping, but this clip cannot tell whether the damping grows with the speed or with its square: the damping law is not decided by this clip.";

/**
 * When the damping law is not decided, each of the two tied laws' own damping rate: the free parameters one law has and
 * the other does not (γ in the linear law, c in the quadratic one). Null when there is no damping tie.
 */
export function dampingRates(e: { candidates: Cand[]; winner: string }) {
  if (!dampingTie(e)) return null;
  const [a, b] = topTwo(e);
  const own = (x: Cand, y: Cand) => {
    const other = new Set((y.law.params ?? []).map((p) => p.name));
    return (x.law.params ?? [])
      .filter((p) => !p.fixed && p.name !== "cal" && !other.has(p.name) && Number.isFinite(x.fit.theta?.[p.name]))
      .map((p) => ({ name: p.name, value: x.fit.theta![p.name], sigma: x.fit.sigma?.[p.name] ?? NaN, unit: p.unit ?? "" }));
  };
  return [a, b].map((x, i) => ({ title: x.law.title, form: dampingForm(x.law) as "linear" | "quadratic", params: own(x, i ? a : b) }));
}

type Ranked = { fit: Fit & { k?: number; bic?: number } };

/** ΔBIC at or above which the lower-BIC law counts as preferred (Kass and Raftery's "positive evidence"). */
export const BIC_EVIDENCE = 2;

const z = (x: number) => (x < 10 ? x.toFixed(2) : x.toFixed(1));

/**
 * Why the first of two tied laws is listed first, worded from the numbers: fewer parameters (Occam), or a BIC lower by
 * at least 2 (positive evidence). A smaller BIC gap, or a smaller miss on the unseen frames, prefers neither law, and
 * the held-out misses are then given side by side, including when the second law missed the unseen frames by less.
 */
export function tieBreakReason(first: Ranked, second: Ranked): string {
  const ka = first.fit.k, kb = second.fit.k;
  if (ka != null && kb != null && ka < kb) return "a tie goes to the law with fewer parameters";
  const ba = first.fit.bic, bb = second.fit.bic;
  const za = first.fit.testZ, zb = second.fit.testZ;
  const zs = za != null && zb != null && Number.isFinite(za) && Number.isFinite(zb);
  // to three decimals when two would print them the same
  const zz = (x: number) => (zs && z(za!) === z(zb!) ? x.toFixed(3) : z(x));
  const sideBySide = zs ? ` (unseen frames: ${zz(za!)}× the noise for the first, ${zz(zb!)}× for the second)` : "";
  const same = "neither is simpler (both have the same number of parameters)";
  if (ka === kb && ba != null && bb != null && Number.isFinite(ba) && Number.isFinite(bb)) {
    const dBic = bb - ba;
    if (dBic >= BIC_EVIDENCE) return `a tie goes to the law with the lower BIC (lower by ${dBic.toFixed(1)}, at least the 2 that counts as evidence)${sideBySide}`;
    if (dBic > 0) return `${same}, and the first's BIC is lower by only ${dBic.toFixed(1)}, under the 2 that would count as evidence, so neither is preferred and their order says nothing${sideBySide}`;
  }
  // a record ranked before this rule may list them the other way round: then their order says nothing at all
  if (zs && za! > zb!) return `${same}, so neither is preferred, and their order says nothing${sideBySide}`;
  return `${same}, so neither is preferred; it is listed first for a smaller miss on the unseen frames, a difference inside the noise${sideBySide}`;
}

/**
 * When two laws rank first and second only because a tie went to the simpler one, the clip has not told them apart.
 * The same tie rule the ranking uses (lib/experiment.ts rankCandidates): each law scored by the worse of its fitted and
 * unseen misses in noise units; both within 1.5× the noise, or half a noise unit or 10% apart, is a tie.
 */
type Fit = { ok: boolean; testZ?: number; trainZ?: number };
type Cand = { rank: number; law: { id: string; title: string }; fit: Fit };

export const noiseScore = (f: Fit) => (f.ok && Number.isFinite(f.testZ) ? Math.max(f.testZ!, Number.isFinite(f.trainZ) ? f.trainZ! : 0) : Infinity);

export function tied(a: Fit, b: Fit): boolean {
  const fa = noiseScore(a), fb = noiseScore(b);
  if (!Number.isFinite(fa) || !Number.isFinite(fb)) return false;
  return Math.max(fa, fb) < 1.5 || Math.abs(fa - fb) < Math.max(0.1 * Math.max(fa, fb), 0.5);
}

const isDamping = (t: string) => /damp|drag|viscous|friction/i.test(t);
const isQuadratic = (t: string) => /quadratic|air drag|v\s*\|v\||kq/i.test(t);

/**
 * "linear and quadratic tie" when the top two laws are the two damping forms and the ranking could not separate them;
 * null otherwise.
 */
export function dampingTie(e: { candidates: Cand[]; winner: string }): string | null {
  const ok = e.candidates.filter((c) => c.fit.ok).sort((a, b) => a.rank - b.rank);
  const [a, b] = ok;
  if (!a || !b) return null;
  const ta = `${a.law.title} ${a.law.id}`, tb = `${b.law.title} ${b.law.id}`;
  if (!isDamping(ta) || !isDamping(tb) || isQuadratic(ta) === isQuadratic(tb)) return null;
  return tied(a.fit, b.fit) ? "damping form not determined by this clip (linear and quadratic tie)" : null;
}

type Ranked = { fit: Fit & { k?: number; bic?: number } };

/**
 * Why the first of two tied laws is listed first, by the keys rankCandidates uses: fewer parameters, then a clearly
 * lower BIC (steps of 2), then the smaller miss on the unseen frames. Only the first two are Occam; the third is a
 * difference inside the noise, so it prefers neither law.
 */
export function tieBreakReason(first: Ranked, second: Ranked): string {
  const ka = first.fit.k, kb = second.fit.k;
  if (ka != null && kb != null && ka < kb) return "a tie goes to the law with fewer parameters";
  const ba = first.fit.bic, bb = second.fit.bic;
  if (ka === kb && ba != null && bb != null && Math.round(ba / 2) < Math.round(bb / 2)) return "a tie goes to the law with the lower BIC";
  const za = first.fit.testZ, zb = second.fit.testZ;
  // a record ranked before this rule may list them the other way round: then their order says nothing at all
  if (za != null && zb != null && Number.isFinite(za) && Number.isFinite(zb) && za > zb) return "neither is simpler (both have the same number of parameters), so neither is preferred, and their order says nothing";
  return "neither is simpler (both have the same number of parameters), so neither is preferred; it is listed first for a smaller miss on the unseen frames, a difference inside the noise";
}

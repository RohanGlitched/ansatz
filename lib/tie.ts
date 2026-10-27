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

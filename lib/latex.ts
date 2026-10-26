import { toLatex } from "./physics/expr";
import type { Law } from "./physics/law";

const GREEK = new Set(["alpha", "beta", "gamma", "delta", "theta", "omega", "mu", "lambda", "phi", "zeta", "tau", "rho", "sigma", "kappa", "eta", "psi"]);

function sym(name: string): string {
  if (GREEK.has(name)) return `\\${name}`;
  const m = /^([A-Za-z]+)_?(\d+|[A-Za-z]+)?$/.exec(name);
  if (m && m[2]) return `${GREEK.has(m[1]) ? `\\${m[1]}` : m[1]}_{\\mathrm{${m[2]}}}`;
  return name.length > 1 ? `\\mathit{${name}}` : name;
}

/**
 * Writes a law as a textbook would: a state whose derivative is another state becomes a second
 * derivative (x' = vx, vx' = -g  ->  ẍ = -g), and velocities inside expressions read as ẋ.
 */
export function lawLatex(law: Law): string[] {
  const rename: Record<string, string> = {};
  const second = new Map<string, string>(); // position -> velocity state
  for (const s of law.state) {
    const d = (law.derivatives[s] ?? "").replace(/\s/g, "");
    if (law.state.includes(d) && d !== s) {
      second.set(s, d);
      rename[d] = `\\dot{${sym(s)}}`;
    }
  }
  for (const s of law.state) if (!rename[s]) rename[s] = sym(s);
  for (const p of law.params) rename[p.name] = sym(p.name);
  const lines: string[] = [];
  const velocities = new Set(second.values());
  for (const s of law.state) {
    if (velocities.has(s)) continue;
    const v = second.get(s);
    try {
      if (v) lines.push(`\\ddot{${sym(s)}} = ${toLatex(law.derivatives[v], rename)}`);
      else lines.push(`\\dot{${sym(s)}} = ${toLatex(law.derivatives[s], rename)}`);
    } catch {
      lines.push(`\\dot{${sym(s)}} = \\text{(unparseable)}`);
    }
  }
  for (const ev of law.events ?? []) {
    try {
      const cond = toLatex(ev.when, rename);
      const sets = Object.entries(ev.then).map(([k, e]) => `${rename[k] ?? sym(k)} \\to ${toLatex(e, rename)}`).join(",\\ ");
      lines.push(`\\text{when } ${cond} = 0:\\ ${sets}`);
    } catch {
      /* skip */
    }
  }
  return lines;
}

export function paramLatex(name: string) {
  return sym(name);
}

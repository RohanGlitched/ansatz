/**
 * The power of metres in a unit string ("m/s^2" → 1, "1/m" → -1, "rad/s" → 0, "m²" → 2). A ruler's relative
 * uncertainty moves a fitted value by that power: g in m/s² scales with the ruler, a drag constant in 1/m
 * scales against it, a rate in 1/s doesn't care.
 */
export function metrePower(unit: string | undefined): number {
  return power(unit, /^(m|metres?|meters?)$/i);
}

/**
 * The power of one base unit in a unit string, however a model wrote it: "m/s^2", "m/s²", "m s^-2", "m·s⁻²", "m/s2".
 * Spaces and dots multiply; a digit straight after a unit is its power.
 */
function power(unit: string | undefined, base: RegExp): number {
  if (!unit) return 0;
  const u = unit
    .trim()
    .replace(/⁻¹/g, "^-1").replace(/⁻²/g, "^-2").replace(/⁻³/g, "^-3").replace(/¹/g, "").replace(/²/g, "^2").replace(/³/g, "^3")
    .replace(/[()]/g, "")
    .replace(/\s*\/\s*/g, "/")
    .replace(/[·\s]+/g, "*")
    .replace(/([a-z])(-?\d)/gi, "$1^$2")
    .replace(/\^\^/g, "^");
  const [num, ...dens] = u.split("/");
  const count = (part: string) => {
    let p = 0;
    for (const tok of part.split("*")) {
      const m = /^([a-z]+)(?:\^(-?\d+))?$/i.exec(tok);
      if (m && base.test(m[1])) p += m[2] ? Number(m[2]) : 1;
    }
    return p;
  };
  return count(num) - dens.reduce((s, d) => s + count(d), 0);
}

/** "m/s^2" → "m/s²", "1/m" stays, "s^-1" → "s⁻¹": units as a textbook prints them. */
export function prettyUnit(unit: string | undefined): string {
  if (!unit) return "";
  const sup: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴" };
  return unit.replace(/\^(-?\d)/g, (_, e: string) => [...e].map((c) => sup[c] ?? c).join("")).replace(/\*/g, "·");
}

/** The power of seconds in a unit string ("m/s^2" → -2, "1/s" → -1, "s" → 1): how a value changes when the clock is rescaled. */
export function secondPower(unit: string | undefined): number {
  return power(unit, /^(s|sec|seconds?)$/i);
}

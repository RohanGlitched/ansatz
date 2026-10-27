import { readFile } from "node:fs/promises";
import path from "node:path";

type SynthRow = { id: string; slowMotion?: number; clock?: { factor: number } | null };
type ControlRow = { id: string; slow: number; ruler: string | null; g: number | null; sigma: number | null; clock: number | null; outcome: string };

export type SlowRender = { id: string; slow: number; factor: number | null; outcome: "flagged" | "missed" | "unchecked"; right: boolean };

/** A factor within 10% of the truth counts as right, as the benchmark table grades it. */
const isRight = (factor: number | null, slow: number) => factor != null && Math.abs(factor / slow - 1) <= 0.1;

/**
 * Every rendered clip slowed down without saying so: the benchmark's (data/bench/synth.json) and the clock-check
 * controls' small slowdowns (data/bench/clock-controls.json), with what the clock check made of each.
 */
export async function slowRenders(): Promise<{ all: SlowRender[]; line: string } | null> {
  const read = <T,>(f: string) => readFile(path.join(process.cwd(), "data", "bench", f), "utf8").then((t) => JSON.parse(t) as T, () => null);
  const [synth, ctrl] = await Promise.all([read<{ rows: SynthRow[] }>("synth.json"), read<{ rows: ControlRow[] }>("clock-controls.json")]);
  if (!synth && !ctrl) return null;
  const all: SlowRender[] = [
    ...(synth?.rows ?? []).filter((r) => (r.slowMotion ?? 1) > 1).map((r) => ({ id: r.id, slow: r.slowMotion!, factor: r.clock?.factor ?? null, outcome: r.clock ? ("flagged" as const) : ("missed" as const), right: isRight(r.clock?.factor ?? null, r.slowMotion!) })),
    ...(ctrl?.rows ?? []).filter((r) => r.slow > 1).map((r) => ({ id: r.id, slow: r.slow, factor: r.clock, outcome: r.clock != null ? ("flagged" as const) : /^not checkable/i.test(r.outcome) ? ("unchecked" as const) : ("missed" as const), right: isRight(r.clock, r.slow) })),
  ];
  const n = all.length;
  const flagged = all.filter((r) => r.outcome === "flagged").length;
  const right = all.filter((r) => r.right).length;
  const x = (rs: SlowRender[]) => rs.map((r) => `${r.slow}×`).join(" and ");
  const missed = all.filter((r) => r.outcome === "missed"), unchecked = all.filter((r) => r.outcome === "unchecked");
  const tail = [missed.length ? `missed ${x(missed)}` : "", unchecked.length ? `could not check ${x(unchecked)}` : ""].filter(Boolean).join(", ");
  const line = `${flagged} of ${n} undeclared slow-motion renders flagged, factor right on ${right} of ${n}${tail ? `; ${tail}` : ""}`;
  return { all, line };
}

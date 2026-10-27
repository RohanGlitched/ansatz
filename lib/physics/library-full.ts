/**
 * A fuller textbook library, used to test whether Muse Spark's laws earn their place: every standard law a
 * physics teacher would try for the channels measured, with no model involved. /proof compares Spark's best law
 * against the best of these on every benchmark clip.
 */
import type { Law, ParamSpec, Series } from "./law";

export function fullLibrary(series: Series, opts: { g: number; gFixed: boolean }): Law[] {
  const ch = Object.keys(series.ch);
  const g: ParamSpec = { name: "g", guess: opts.g, min: 0.1, max: 40, unit: "m/s²", meaning: "gravitational acceleration", fixed: opts.gFixed };
  const out: Law[] = [];
  const law = (id: string, title: string, l: Omit<Law, "id" | "title" | "summary">): Law => ({ id: `lib-${id}`, title, summary: title, ...l });
  if (ch.includes("theta")) {
    const w0: ParamSpec = { name: "w0", guess: 3, min: 0.1, max: 60, unit: "rad/s", meaning: "natural angular frequency" };
    const base = { state: ["theta", "omega"], observe: { theta: "theta" } };
    out.push(law("pend-small", "Small-angle pendulum", { ...base, derivatives: { theta: "omega", omega: "-w0^2*theta" }, params: [w0] }));
    out.push(law("pend-large", "Large-angle pendulum", { ...base, derivatives: { theta: "omega", omega: "-w0^2*sin(theta)" }, params: [w0] }));
    out.push(law("pend-viscous", "Pendulum with linear damping", { ...base, derivatives: { theta: "omega", omega: "-w0^2*sin(theta) - c*omega" }, params: [w0, { name: "c", guess: 0.05, min: 0, max: 5, unit: "1/s", meaning: "linear damping rate" }] }));
    out.push(law("pend-quad", "Pendulum with quadratic drag", { ...base, derivatives: { theta: "omega", omega: "-w0^2*sin(theta) - k*omega*abs(omega)" }, params: [w0, { name: "k", guess: 0.05, min: 0, max: 5, unit: "1/rad", meaning: "quadratic drag" }] }));
    return out;
  }
  if (ch.includes("s")) {
    const s = series.ch.s.filter(Number.isFinite), mid = (Math.max(...s) + Math.min(...s)) / 2, span = Math.max(1e-6, Math.max(...s) - Math.min(...s));
    const seq: ParamSpec = { name: "s0", guess: mid, min: mid - span, max: mid + span, unit: "m", meaning: "rest position" };
    const w0: ParamSpec = { name: "w0", guess: 5, min: 0.1, max: 100, unit: "rad/s", meaning: "natural angular frequency" };
    const base = { state: ["s", "v"], observe: { s: "s" } };
    out.push(law("uniform", "Uniform acceleration", { ...base, derivatives: { s: "v", v: "a" }, params: [{ name: "a", guess: 1, min: -50, max: 50, unit: "m/s²", meaning: "acceleration" }] }));
    out.push(law("shm", "Simple harmonic motion", { ...base, derivatives: { s: "v", v: "-w0^2*(s - s0)" }, params: [w0, seq] }));
    out.push(law("shm-damped", "Damped harmonic motion", { ...base, derivatives: { s: "v", v: "-w0^2*(s - s0) - c*v" }, params: [w0, seq, { name: "c", guess: 0.3, min: 0, max: 20, unit: "1/s", meaning: "damping rate" }] }));
    out.push(law("shm-quad", "Harmonic motion with quadratic drag", { ...base, derivatives: { s: "v", v: "-w0^2*(s - s0) - k*v*abs(v)" }, params: [w0, seq, { name: "k", guess: 1, min: 0, max: 100, unit: "1/m", meaning: "quadratic drag" }] }));
    return out;
  }
  const hasX = ch.includes("x"), hasY = ch.includes("y");
  if (hasY) {
    const y = series.ch.y.filter(Number.isFinite), lo = Math.min(...y), span = Math.max(1e-6, Math.max(...y) - lo);
    const st = hasX ? ["x", "y", "vx", "vy"] : ["y", "vy"];
    const obs: Record<string, string> = hasX ? { x: "x", y: "y" } : { y: "y" };
    const d = (ax: string, ay: string): Record<string, string> => (hasX ? { x: "vx", y: "vy", vx: ax, vy: ay } : { y: "vy", vy: ay });
    const sp = hasX ? "sqrt(vx^2 + vy^2)" : "abs(vy)";
    out.push(law("vacuum", "Free flight, no air", { state: st, observe: obs, derivatives: d("0", "-g"), params: [g] }));
    out.push(law("drag-linear", "Flight with linear drag", { state: st, observe: obs, derivatives: d("-b*vx", "-g - b*vy"), params: [g, { name: "b", guess: 0.1, min: 0, max: 20, unit: "1/s", meaning: "linear drag rate" }] }));
    out.push(law("drag-quad", "Flight with quadratic drag", { state: st, observe: obs, derivatives: d(`-k*${sp}*vx`, `-g - k*${sp}*vy`), params: [g, { name: "k", guess: 0.1, min: 0, max: 20, unit: "1/m", meaning: "quadratic drag" }] }));
    out.push(law("bounce", "Bouncing, no air", { state: st, observe: obs, derivatives: d("0", "-g"), params: [g, { name: "floor", guess: lo - 0.01 * span, min: lo - 0.3 * span, max: lo + 0.1 * span, unit: "m", meaning: "floor contact height" }, { name: "e", guess: 0.7, min: 0.05, max: 1, unit: "1", meaning: "restitution" }], events: [{ name: "bounce", when: "y - floor", then: { vy: "-e*vy" } }] }));
  }
  return out;
}

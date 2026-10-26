/**
 * Textbook laws that always enter the competition alongside Muse's candidates, chosen by which channels
 * were measured. They are the control group: a model-written law only wins by predicting the unseen part
 * of the clip better than these.
 */
import type { Law } from "./law";

export function controls(channels: string[], opts: { g: number; gFixed: boolean }): Law[] {
  const out: Law[] = [];
  const gParam = { name: "g", guess: opts.g, min: 0.1, max: 40, unit: "m/s²", meaning: "gravitational acceleration", fixed: opts.gFixed };
  if (channels.includes("theta")) {
    out.push({
      id: "textbook-small-angle",
      title: "Textbook pendulum (small angles)",
      summary: "Swings like a simple harmonic oscillator: angular acceleration proportional to the angle.",
      state: ["theta", "omega"],
      derivatives: { theta: "omega", omega: "-w0^2*theta" },
      params: [{ name: "w0", guess: 3, min: 0.1, max: 60, unit: "rad/s", meaning: "natural angular frequency √(g/L)" }],
      observe: { theta: "theta" },
    });
  }
  if (channels.includes("x") && channels.includes("y") && !channels.includes("theta")) {
    out.push({
      id: "textbook-vacuum",
      title: "Textbook projectile (no air)",
      summary: "Moves at constant horizontal speed while gravity pulls it down at a constant rate.",
      state: ["x", "y", "vx", "vy"],
      derivatives: { x: "vx", y: "vy", vx: "0", vy: "-g" },
      params: [gParam],
      observe: { x: "x", y: "y" },
    });
  } else if (channels.includes("y") && !channels.includes("theta")) {
    out.push({
      id: "textbook-fall",
      title: "Textbook fall (no air)",
      summary: "Accelerates downward at a constant rate.",
      state: ["y", "vy"],
      derivatives: { y: "vy", vy: "-g" },
      params: [gParam],
      observe: { y: "y" },
    });
  }
  if (channels.includes("s") && !channels.includes("theta")) {
    out.push({
      id: "textbook-uniform",
      title: "Uniform acceleration along the path",
      summary: "Speeds up (or slows) at a constant rate along a straight path.",
      state: ["s", "v"],
      derivatives: { s: "v", v: "a" },
      params: [{ name: "a", guess: 1, min: -50, max: 50, unit: "m/s²", meaning: "acceleration along the path" }],
      observe: { s: "s" },
    });
  }
  return out;
}

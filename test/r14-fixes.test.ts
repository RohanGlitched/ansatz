import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dampingForm, dampingNested, dampingRates, dampingTie, tieBreakReason, winnerTitle } from "../lib/tie";
import type { Experiment } from "../lib/experiment";
import { summarise } from "../app/x/summary";
import { fou5Of, fou5Long } from "../lib/fou5";
import { zeroCrossingPeriod } from "../lib/period";

const show = (id: string) => JSON.parse(readFileSync(`data/showcase/${id}.json`, "utf8")) as Experiment;

/* ── the damping classifier reads the equation, not the title ── */

test("damping form from the equation: the 5× Foucault's two top laws are both linear, so no linear-and-quadratic tie", () => {
  const winner = { id: "pendulum-viscous", title: "Damped pendulum with linear air drag", derivatives: { s: "v", v: "-(g/L)*(s - s0) - gamma*v" } };
  const runnerUp = { id: "pendulum-largeangle-viscous-arc-rev", title: "Large-angle viscous pendulum in arc coordinate", derivatives: { s: "v", v: "-(g/L)*A*sin((s-s0)/A) - gamma*v" } };
  const quadratic = { id: "pendulum-quadratic-drag", title: "Pendulum with quadratic air drag", derivatives: { s: "v", v: "-(g/L)*(s - s0) - kq*v*abs(v)" } };
  assert.equal(dampingForm(winner), "linear", "'linear air drag' in a title is linear");
  assert.equal(dampingForm(runnerUp), "linear");
  assert.equal(dampingForm(quadratic), "quadratic");
  assert.equal(dampingForm({ id: "u", title: "Undamped small-angle pendulum", derivatives: { s: "v", v: "-(g/L)*(s - s0)" } }), null);
  const e = show("foucault-pendulum-5x");
  assert.equal(e.candidates.find((c) => c.rank === 1)!.law.title, winner.title);
  assert.equal(e.candidates.find((c) => c.rank === 2)!.law.title, runnerUp.title);
  assert.equal(dampingTie(e), null);
  assert.equal(winnerTitle(e), winner.title);
});

test("damping form: every shape the stored laws use", () => {
  const f = (d: Record<string, string>) => dampingForm({ id: "x", title: "x", derivatives: d });
  assert.equal(f({ theta: "omega", omega: "-(g/L)*sin(theta)-qd*abs(omega)*omega" }), "quadratic");
  assert.equal(f({ theta: "omega", omega: "-(g/L)*sin(theta)-c*omega" }), "linear");
  assert.equal(f({ x: "vx", y: "vy", vx: "-c*hypot(vx,vy)*vx", vy: "-g - c*hypot(vx,vy)*vy" }), "quadratic");
  assert.equal(f({ x: "vx", y: "vy", vx: "-k*vx", vy: "-g - k*vy" }), "linear");
  assert.equal(f({ x: "vx", y: "vy", vx: "0", vy: "-g" }), null);
  assert.equal(f({ theta: "omega", omega: "-g*sin(theta)/L - gamma*omega - cq*omega*abs(omega)" }), "both");
  assert.equal(f({ s: "v", v: "-w0*w0*(s - s_eq) - gamma*v - ac*sign(v)" }), "linear", "dry friction is neither form");
  assert.equal(f({ s: "v", v: "-omega^2*(s-s_eq) - beta*(s-s_eq)^3 - gamma*v" }), "linear", "omega here is a parameter, not a velocity");
  assert.equal(f({ s: "v", v: "-k*v^2" }), "quadratic");
});

test("damping ties on the stored records: Aachen and the 40 cm run tie; the Hindi pendulum is nested, not a tie", () => {
  assert.ok(dampingTie(show("aachen-pendulum-50cm")));
  assert.ok(dampingTie(show("pendulum-40cm")));
  const hindi = show("hindi-pendulum");
  assert.equal(dampingTie(hindi), null);
  assert.match(dampingNested(hindi) ?? "", /quadratic damping term is not needed/);
  assert.equal(dampingTie(show("spring")), null, "linear against linear plus dry friction");
  assert.equal(dampingTie(show("bouncing-ball")), null);
  const aachen = show("aachen-pendulum-50cm");
  assert.match(winnerTitle(aachen), /^Large-angle pendulum with quadratic air drag \(ranked first, but the damping law is not decided by this clip/);
  const rates = dampingRates(aachen)!;
  assert.deepEqual(rates.map((r) => [r.form, r.params.map((p) => p.name)]), [["quadratic", ["qd"]], ["linear", ["c"]]]);
});

/* ── near-ties: the BIC is a reason only at a difference of 2 or more ── */

test("tie wording: a BIC 1.7 lower is not a reason, and the held-out misses are shown side by side", () => {
  const e = show("pendulum-40cm");
  const [a, b] = e.candidates.filter((c) => c.fit.ok).sort((x, y) => x.rank - y.rank);
  assert.equal(a.fit.bic.toFixed(2), "-271.55");
  assert.equal(b.fit.bic.toFixed(2), "-269.85");
  const why = tieBreakReason(a, b);
  assert.doesNotMatch(why, /^a tie goes to the law with the lower BIC/);
  assert.match(why, /lower by only 1\.7, under the 2/);
  assert.match(why, /order says nothing/);
  assert.match(why, /4\.43× the noise for the first, 4\.3\d× for the second/);
  const f = (k: number, bic: number) => ({ fit: { ok: true, testZ: 1, trainZ: 1, k, bic } });
  assert.match(tieBreakReason(f(4, -271.55), f(4, -269.55)), /^a tie goes to the law with the lower BIC \(lower by 2\.0/);
});

test("tie wording on every stored record: the BIC is named as the reason only when it is lower by 2 or more", () => {
  for (const id of ["pendulum-40cm", "pendulum-60cm", "pendulum-80cm", "pendulum-100cm", "aachen-pendulum-50cm", "moon-jump", "moon-jump-slowed", "bouncing-ball", "hindi-pendulum"]) {
    const [a, b] = show(id).candidates.filter((c) => c.fit.ok).sort((x, y) => x.rank - y.rank);
    const why = tieBreakReason(a, b);
    if (/^a tie goes to the law with the lower BIC/.test(why)) assert.ok(b.fit.bic - a.fit.bic >= 2, `${id}: ${why}`);
  }
});

/* ── the 5× Foucault: the speed-up's ± split into its parts, and no ± where the rough-fit rule withholds one ── */

test("5× Foucault: /x and llms.txt print the speed-up with no ± (rough fit), the same form as the run page", () => {
  const fast = show("foucault-pendulum-5x"), real = show("foucault-pendulum");
  const s = summarise(fast)!;
  assert.doesNotMatch(s.value, /±/);
  assert.match(s.value, /^4\.97$/);
  const x = fou5Of(fast, real)!;
  const long = fou5Long(x);
  assert.doesNotMatch(long, /statistical ± 0\.02/);
  assert.match(long, /± 0\.025 if the stated 8\.97 m is good to 1%/);
  assert.match(long, /fit alone ± 0\.0015/);
});

test("5× Foucault: the zero-crossing period, with no law, gives the same factor as the fit", () => {
  const fast = show("foucault-pendulum-5x");
  const zc = fast.extras!.periodCheck!;
  const T = zeroCrossingPeriod(fast.measured.series.t, fast.measured.series.ch.s)!;
  assert.ok(Math.abs(T.period - 1.20836) < 0.0001, `T = ${T.period}`);
  assert.equal(zc.period.toFixed(5), T.period.toFixed(5));
  assert.ok(Math.abs(zc.speedup - 4.973) < 0.001, `factor ${zc.speedup}`);
});

/* ── /api/status: a deleted or dead run is not "running" ── */

import { runState, STALE_MS } from "../lib/runstate";

test("run state: a log that stopped before 'report done' is gone when its clip was deleted, failed when stale, else running", () => {
  const log = [{ step: "upload", state: "done" }, { step: "observe", state: "done" }, { step: "referee", state: "done" }];
  assert.equal(runState(log, 10_000, false), "gone", "gxn8b3c8ck: the log ends at 'referee done' and the clip is deleted");
  assert.equal(runState(log, STALE_MS + 1, true), "failed");
  assert.equal(runState(log, 10_000, true), "running");
  assert.equal(runState([], 5_000, false), "running", "a run that has not finished its upload step has stored no clip yet");
  assert.equal(runState([...log, { step: "report", state: "done" }], 1_000, true), "gone");
});

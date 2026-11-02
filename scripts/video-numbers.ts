// usage: tsx scripts/video-numbers.ts  prints every number the current demo video (v2) shows, read from the published data
import { readFileSync } from "node:fs";
import { median } from "../lib/median";
const j = (f: string) => JSON.parse(readFileSync(f, "utf8"));
type Row = { param: string; label: string; measured: number; sigma: number; truth: number; unit: string };
const row = (e: { extras?: { truth?: { rows: Row[] } } }, p: string) => e.extras?.truth?.rows.find((r) => r.param === p);

// the Moon: Muse Spark alone on the secretly slowed copy, then SAM 3.1 jump for jump
const moon = j("data/showcase/moon-jump.json");
const slowed = moon.extras.speedTest.repeats.clips.find((c: { truth: string }) => /slowed/.test(c.truth));
const real = slowed.answers.filter((a: { real_speed: boolean }) => a.real_speed).length;
const sj = moon.extras.memoryTest.sameJump;
console.log(`Moon: Muse Spark alone called the slowed copy "real speed" ${real} of ${slowed.answers.length}; jump for jump ${sj.combined.ratio.toFixed(3)} ± ${sj.combined.sigma.toFixed(3)}× slower (truth 1.5×); ${sj.jumps.map((r: { jump: number; ratio: number; sigma: number }) => `jump ${r.jump} ${r.ratio.toFixed(3)} ± ${r.sigma.toFixed(3)}`).join(", ")}`);

// the Foucault pendulum, real footage: the 5× stretch, and the real-time stretch's g from Muse Spark's plain law
const f5 = j("data/showcase/foucault-pendulum-5x.json"), fr = j("data/showcase/foucault-pendulum.json");
const sp = row(f5, "speedup")!, g5 = row(f5, "g")!, gs = row(fr, "g_spark")!;
console.log(`Foucault 5×: gravity ${(g5.measured / 9.80665).toFixed(0)}× Earth's (g = ${g5.measured.toFixed(0)} m/s²), so the clip plays ${sp.measured.toFixed(2)} ± ${sp.sigma.toFixed(2)}× faster than life (label ${sp.truth}×)`);
console.log(`Foucault real time: g = ${gs.measured.toFixed(2)} ± ${gs.sigma.toFixed(2)} m/s² (${gs.label}; truth ${gs.truth})`);

// Muse Wonder on the hardening spring: its law's unseen miss against the best proposed law's, and k₃/m against the truth
const h = j("data/showcase/hardening-spring.json");
const win = h.candidates.find((c: { law: { id: string } }) => c.law.id === h.winner);
const proposed = h.candidates.filter((c: { origin: string; fit: { ok: boolean } }) => c.origin !== "revision" && c.fit.ok).sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank)[0];
const k3 = row(h, "beta")!;
console.log(`Muse Wonder: ${h.wonder.attempts.length} laws tried, submitted "${h.wonder.submitted}"; unseen miss ${(win.fit.testRms * 1000).toFixed(1)} mm (best proposed law, ${proposed.law.id}: ${(proposed.fit.testRms * 1000).toFixed(0)} mm)`);
console.log(`Muse Wonder: k₃/m ${k3.measured.toFixed(0)} ± ${k3.sigma.toFixed(0)} (true ${k3.truth}), ${(Math.abs(k3.measured / k3.truth - 1) * 100).toFixed(1)}% off`);
const df = j("data/showcase/dry-friction-spring.json"), ac = row(df, "ac") as (Row & { si?: { measured: number; sigma: number; truth: number; unit: string } }) | undefined;
if (ac?.si) console.log(`Muse Wonder (dry friction): ${ac.si.measured.toFixed(3)} ± ${ac.si.sigma.toFixed(3)} ${ac.si.unit} (true ${ac.si.truth.toFixed(2)}), from ${ac.measured.toFixed(0)} ± ${ac.sigma.toFixed(0)} ${ac.unit}`);

// the benchmark
const b = j("data/bench/synth.json");
const all = b.rows.flatMap((r: { checks: { quantity: string; errPct: number }[] }) => r.checks);
const phys = all.filter((c: { quantity: string }) => !c.quantity.startsWith("scale")), sc = all.filter((c: { quantity: string }) => c.quantity.startsWith("scale"));
console.log(`Bench: ${b.summary.cases} clips; ${phys.filter((c: { errPct: number }) => Math.abs(c.errPct) <= 5).length}/${phys.length} constants within 5% (median ${median(phys.map((c: { errPct: number }) => Math.abs(c.errPct))).toFixed(2)}%); scales ${sc.filter((c: { errPct: number }) => Math.abs(c.errPct) <= 5).length}/${sc.length}; by eye ${Math.round(b.summary.medianEyeballErrPct)}%`);

// v3.1 additions (Nov 2): the Foucault same-film ratio, the Aachen pendulum, the dry-friction handoff, the slowed copy's clock
const gw = row(fr, "g")!;
console.log(`Foucault 5× against the same film's real-time stretch (no reference value): √(${g5.measured.toFixed(2)} ÷ ${gw.measured.toFixed(3)}) = ${Math.sqrt(g5.measured / gw.measured).toFixed(2)}×; clock factor ${f5.clock.factor.toFixed(5)} → ${(1 / f5.clock.factor).toFixed(3)}×`);
const aa = j("data/showcase/aachen-pendulum-50cm.json"), ag = aa.comparisons.find((c: { param: string }) => c.param === "g");
console.log(`Aachen pendulum: g = ${ag.measured.toFixed(2)} ± ${ag.sigma.toFixed(2)} m/s² (reference ${ag.reference.toFixed(2)})`);
const dwin = df.candidates.find((c: { law: { id: string } }) => c.law.id === df.winner);
const dlead = df.candidates.filter((c: { origin: string; fit: { ok: boolean } }) => c.origin === "muse" && c.fit.ok).sort((a: { rank: number }, b: { rank: number }) => a.rank - b.rank)[0];
console.log(`Dry friction: Muse Wonder's law misses the unseen frames by ${dwin.fit.testRms.toFixed(3)} px against ${dlead.fit.testRms.toFixed(2)} px for Muse Spark's leading law (${dlead.law.id}): ${(dlead.fit.testRms / dwin.fit.testRms).toFixed(0)}× closer; trigger ${df.wonder.trigger}`);
const sl = j("data/showcase/moon-jump-slowed.json");
console.log(`Slowed Apollo copy, from gravity alone: ${sl.clock.factor.toFixed(2)} ± ${sl.clock.sigma.toFixed(2)}× slower (truth 1.5×)`);

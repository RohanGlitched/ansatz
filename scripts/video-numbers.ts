// usage: tsx scripts/video-numbers.ts  prints every number the demo video shows, read from the published data
import { readFileSync } from "node:fs";
const j = (f: string) => JSON.parse(readFileSync(f, "utf8"));
const moon = j("data/showcase/moon-jump.json"), slow = j("data/showcase/moon-jump-slowed.json");
const mt = moon.extras.memoryTest.rows;
const ratio = Math.sqrt(mt[0].g / mt[1].g);
const sr = 0.5 * ratio * Math.hypot((mt[0].sigmaStat ?? mt[0].sigma) / mt[0].g, (mt[1].sigmaStat ?? mt[1].sigma) / mt[1].g);
console.log(`Moon: Spark by eye ${mt[0].eye} / ${mt[1].eye}; Ansatz ${mt[0].g.toFixed(2)} ± ${mt[0].sigma.toFixed(2)} / ${mt[1].g.toFixed(2)} ± ${mt[1].sigma.toFixed(2)}; paired slowdown ${ratio.toFixed(2)} ± ${sr.toFixed(2)}×; clock ${slow.clock.factor.toFixed(2)}×`);
const h = j("data/showcase/hardening-spring.json");
for (const r of h.extras.truth.rows) console.log(`Hardening: ${r.label} ${r.measured.toPrecision(4)} ± ${r.sigma.toPrecision(2)} (true ${r.truth.toPrecision(4)})`);
const sp = j("data/showcase/sample-pendulum.json");
console.log(`Pendulum: g ${sp.comparisons[0].measured.toFixed(3)}, ${(9.81 / sp.comparisons[0].measured).toFixed(0)}× weak, clock ${sp.clock.factor.toFixed(1)}×`);
const b = j("data/bench/synth.json");
const all = b.rows.flatMap((r: { checks: { quantity: string; errPct: number }[] }) => r.checks);
const phys = all.filter((c: { quantity: string }) => !c.quantity.startsWith("scale")), sc = all.filter((c: { quantity: string }) => c.quantity.startsWith("scale"));
const med = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; };
console.log(`Bench: ${phys.filter((c: { errPct: number }) => Math.abs(c.errPct) <= 5).length}/${phys.length} constants within 5% (median ${med(phys.map((c: { errPct: number }) => Math.abs(c.errPct))).toFixed(2)}%); scales ${sc.filter((c: { errPct: number }) => Math.abs(c.errPct) <= 5).length}/${sc.length}; by eye ${b.summary.medianEyeballErrPct}%`);

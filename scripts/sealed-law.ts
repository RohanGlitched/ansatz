// A sealed-law test: the law of a rendered spring is drawn by public randomness (drand), its SHA-256 committed and
// pushed before the clip is rendered or run, and the law itself revealed only after Ansatz has written its answer.
//
//   npx tsx scripts/sealed-law.ts precommit --batch <name> [--ahead 8] [--n 3]
//                                                reads the latest drand round R and writes sealed/precommit-<name>.json
//                                                naming the FUTURE rounds R+ahead .. R+ahead+n-1, the grammar, the
//                                                scoring rule and HEAD; commit and push it before those rounds exist
//   npx tsx scripts/sealed-law.ts draw --precommit sealed/precommit-<name>.json
//                                                waits for exactly the rounds named there and draws one law from each
//   npx tsx scripts/sealed-law.ts draw [--n 3]   (sets 1 and 2) reads https://api.drand.sh/public/latest, waits for the
//                                                next n rounds after it, draws one law from each
//                                                draw writes sealed/<round>.json and sealed/<round>.sha256
//   npx tsx scripts/sealed-law.ts render <round> renders sealed/clips/sealed-<round>.mp4 with bench/synth/render.py
//                                                (no caption, no numbers in the frame)
//   npx tsx scripts/sealed-law.ts verify <round> checks the json against its committed hash and re-derives the law
//                                                from the drand round, so anyone can check the draw
//
// The grammar below is fixed before any draw. Every constant is a uniform draw from the range stated next to it; where
// a range is stated relative to the swing (so the term visibly matters in a 7 s clip), the absolute value is stored too.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

export const GRAMMAR = "ansatz-sealed-law/1";
const DRAND = "https://api.drand.sh";
/** drand's default (quicknet-free, 30 s) chain: round r is published at GENESIS + (r - 1) * 30 s */
const GENESIS = 1595431050;
export const roundTime = (r: number) => new Date((GENESIS + (r - 1) * 30) * 1000).toISOString();
/** the scoring rule, fixed before any draw (the same rule as sets 1 and 2) */
export const SCORING =
  "hit: the same term structure as the drawn law (stiffness, damping and drive terms), and each shared constant within its error bar or within 10%; pixel constants converted with the render's own scale; anything else is a miss";
const M = 0.2; // kg; only ratios to it shape the motion

type Beacon = { round: number; randomness: string; signature: string; previous_signature?: string };

/** the i-th uniform number in [0, 1) from a beacon: the first 48 bits of SHA-256("<randomness>:<i>") */
export function u(randomness: string, i: number): number {
  const h = createHash("sha256").update(`${randomness}:${i}`).digest();
  return h.readUIntBE(0, 6) / 2 ** 48;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const r4 = (v: number) => +v.toPrecision(4);

export function drawLaw(b: Beacon) {
  const U = (i: number) => u(b.randomness, i);
  const k = r4(lerp(10, 30, U(0))); // N/m          stiffness
  const A = r4(lerp(0.08, 0.14, U(1))); // m        pulled down this far below rest and released
  const w0 = Math.sqrt(k / M);
  const stiffness = (["linear", "cubic", "asymmetric"] as const)[Math.floor(U(2) * 3)];
  const damping = (["viscous", "quadratic", "coulomb"] as const)[Math.floor(U(4) * 3)];
  const drive = U(6) < 0.5;
  const c: Record<string, { value: number; unit: string; rule: string }> = {
    k: { value: k, unit: "N/m", rule: "uniform in [10, 30]" },
    m: { value: M, unit: "kg", rule: "fixed" },
    A: { value: A, unit: "m", rule: "release below rest, uniform in [0.08, 0.14]" },
  };
  // stiffness beyond linear: strong enough at the release to matter
  if (stiffness === "cubic") {
    const rel = lerp(0.3, 0.9, U(3)); // k3 A^2 / k
    c.k3 = { value: r4((rel * k) / A ** 2), unit: "N/m^3", rule: `k3 A^2 / k uniform in [0.3, 0.9] (drawn ${rel.toFixed(3)})` };
  } else if (stiffness === "asymmetric") {
    const rel = lerp(0.2, 0.45, U(3)); // k2 A / k, stiffer stretched than squashed
    c.k2 = { value: r4((rel * k) / A), unit: "N/m^2", rule: `k2 A / k uniform in [0.2, 0.45], stiffer stretched (drawn ${rel.toFixed(3)})` };
  }
  if (damping === "viscous") c.b = { value: r4(lerp(0.2, 0.6, U(5))), unit: "1/s", rule: "uniform in [0.2, 0.6]" };
  else if (damping === "quadratic") {
    const rel = lerp(0.08, 0.2, U(5)); // fraction of the swing lost in the first half cycle, (4/3) cq A
    c.cq = { value: r4(rel / ((4 / 3) * A)), unit: "1/m", rule: `(4/3) cq A uniform in [0.08, 0.2] (drawn ${rel.toFixed(3)})` };
  } else {
    const N = lerp(10, 16, U(5)); // half cycles until the swing would stop without a drive
    c.mu = { value: r4((w0 * w0 * A) / (2 * N)), unit: "m/s^2", rule: `the swing dies in N half cycles, N uniform in [10, 16] (drawn ${N.toFixed(2)}); mu = w0^2 A / (2N)` };
  }
  if (drive) {
    const ratio = U(8) < 0.5 ? lerp(0.55, 0.8, U(9)) : lerp(1.25, 1.6, U(9)); // away from resonance
    const wd = r4(ratio * w0);
    const rel = lerp(0.15, 0.35, U(7)); // steady swing it drives, as a share of A
    c.F0 = { value: r4(rel * A * Math.abs(w0 * w0 - wd * wd)), unit: "m/s^2", rule: `F0 / |w0^2 - wd^2| = share of A uniform in [0.15, 0.35] (drawn ${rel.toFixed(3)})` };
    c.wd = { value: wd, unit: "rad/s", rule: `wd / w0 uniform in [0.55, 0.8] or [1.25, 1.6], each half the time (drawn ${ratio.toFixed(3)})` };
  }
  const colour = (["blue", "green", "orange", "red"] as const)[Math.floor(U(10) * 4)];
  const seed = 7000 + Math.floor(U(11) * 1000);
  const v = (n: string) => c[n]?.value ?? 0;
  // x = displacement below the resting point, down positive
  const terms = [
    "-(k/m) x",
    stiffness === "cubic" ? "- (k3/m) x^3" : stiffness === "asymmetric" ? "- (k2/m) x^2" : "",
    damping === "viscous" ? "- b x'" : damping === "quadratic" ? "- cq x'|x'|" : "- mu sign(x')",
    drive ? "+ F0 cos(wd t)" : "",
  ].filter(Boolean);
  return {
    grammar: GRAMMAR,
    drand: { round: b.round, randomness: b.randomness, signature: b.signature, url: `${DRAND}/public/${b.round}` },
    law: { stiffness, damping, drive, equation: `x'' = ${terms.join(" ")}`, x: "displacement below the resting point (m, down positive); t from release" },
    constants: c,
    derived: {
      omega0: { value: w0, unit: "rad/s", note: "sqrt(k/m)" },
      ...(c.k3 ? { beta: { value: v("k3") / M, unit: "1/(m^2 s^2)", note: "k3/m" } } : {}),
      ...(c.k2 ? { k2_over_m: { value: v("k2") / M, unit: "1/(m s^2)", note: "k2/m, sign: stiffer stretched (down)" } } : {}),
    },
    render: {
      script: "bench/synth/render.py build_spring",
      kw: { k, m: M, b: v("b"), l0: 0.3, A, g: 9.81, bw_m: 0.09, bh_m: 0.06, colour, W: 1280, H: 720, fps: 60, dur: 7.0, bgk: "wall", bgkw: "wall_sand", ref: "stick_h", lead: 0.5, seed, noun: "block", k3: v("k3"), k2: v("k2"), mu: v("mu"), cq: v("cq"), F0: v("F0"), wd: v("wd") },
    },
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url).catch(() => null);
  return r && r.ok ? ((await r.json()) as T) : null;
}

const sha = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");

const [cmd, arg] = process.argv.slice(2);
const opt = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };

if (cmd === "precommit") {
  const batch = opt("--batch");
  if (!batch) throw new Error("--batch <name> is required");
  const ahead = Number(opt("--ahead") ?? 8), n = Number(opt("--n") ?? 3);
  const latest = await getJson<Beacon>(`${DRAND}/public/latest`);
  if (!latest) throw new Error("drand unreachable");
  const git = (...a: string[]) => spawnSync("git", a, { encoding: "utf8" }).stdout.trimEnd();
  const rounds = Array.from({ length: n }, (_, j) => latest.round + ahead + j);
  const pre = {
    batch,
    grammar: GRAMMAR,
    head: git("rev-parse", "HEAD"),
    tracked_changes_at_precommit: git("status", "--porcelain", "--untracked-files=no").split("\n").filter(Boolean),
    latest_seen: { round: latest.round, published: roundTime(latest.round), read_at: new Date().toISOString() },
    rounds: rounds.map((r) => ({ round: r, published: roundTime(r), url: `${DRAND}/public/${r}` })),
    draw: "npx tsx scripts/sealed-law.ts draw --precommit sealed/precommit-" + batch + ".json (drawLaw in this script at the commit above)",
    run: 'npx tsx scripts/run.ts sealed/clips/sealed-<round>.mp4 --narration "a block on a spring, filmed from the side" --sealed (one run each; refuses a dirty tree)',
    scoring: SCORING,
  };
  mkdirSync("sealed", { recursive: true });
  writeFileSync(`sealed/precommit-${batch}.json`, JSON.stringify(pre, null, 1) + "\n");
  console.log(`latest round ${latest.round}; pre-committed rounds ${rounds.join(", ")} (first due ${roundTime(rounds[0])}); HEAD ${pre.head}`);
} else if (cmd === "draw") {
  const n = Number(opt("--n") ?? 3);
  const preFile = opt("--precommit");
  let rounds: number[];
  if (preFile) {
    const pre = JSON.parse(readFileSync(preFile, "utf8")) as { grammar: string; rounds: { round: number }[] };
    if (pre.grammar !== GRAMMAR) throw new Error(`pre-commitment names grammar ${pre.grammar}, this script is ${GRAMMAR}`);
    rounds = pre.rounds.map((r) => r.round);
    console.log(`drawing the pre-committed rounds ${rounds.join(", ")}`);
  } else {
    const latest = await getJson<Beacon>(`${DRAND}/public/latest`);
    if (!latest) throw new Error("drand unreachable");
    console.log(`latest drand round ${latest.round} (randomness ${latest.randomness}); using the next ${n}`);
    rounds = Array.from({ length: n }, (_, j) => latest.round + 1 + j);
  }
  mkdirSync("sealed", { recursive: true });
  for (const round of rounds) {
    let b: Beacon | null = null;
    for (let tries = 0; tries < 400 && !b; tries++) {
      b = await getJson<Beacon>(`${DRAND}/public/${round}`);
      if (!b) await new Promise((r) => setTimeout(r, 3000));
    }
    if (!b) throw new Error(`round ${round} never arrived`);
    const law = drawLaw(b);
    const json = JSON.stringify(law, null, 1) + "\n";
    writeFileSync(`sealed/${round}.json`, json);
    writeFileSync(`sealed/${round}.sha256`, `${sha(json)}  ${round}.json\ndrand round ${round} ${DRAND}/public/${round}\n`);
    console.log(`round ${round}: sealed, sha256 ${sha(json)}`);
  }
} else if (cmd === "render") {
  const law = JSON.parse(readFileSync(`sealed/${arg}.json`, "utf8"));
  const py = `
import sys, json
from pathlib import Path
sys.path.insert(0, "bench/synth")
import render
render.CLIPS = Path("sealed/clips"); render.CLIPS.mkdir(parents=True, exist_ok=True)
kw = json.loads(sys.argv[1]); cid = sys.argv[2]
kw["col"] = render.COL[kw.pop("colour")]; kw["bgkw"] = render.B[kw["bgkw"]]
kw["desc"] = "sealed-law draw"
render.CASES.append((cid, render.build_spring, kw))
print(render.render_case(cid))
`;
  const r = spawnSync("python", ["-c", py, JSON.stringify(law.render.kw), `sealed-${arg}`], { stdio: "inherit" });
  process.exit(r.status ?? 1);
} else if (cmd === "verify") {
  const json = readFileSync(`sealed/${arg}.json`);
  const want = readFileSync(`sealed/${arg}.sha256`, "utf8").split(/\s+/)[0];
  const got = sha(json);
  const b = await getJson<Beacon>(`${DRAND}/public/${arg}`);
  const again = b ? JSON.stringify(drawLaw(b), null, 1) + "\n" : null;
  console.log(`hash ${got === want ? "matches" : "DIFFERS"} (${got}); re-derived from drand round ${arg}: ${again === json.toString("utf8") ? "identical" : "DIFFERS"}`);
  process.exit(got === want && again === json.toString("utf8") ? 0 : 1);
} else {
  console.log("usage: npx tsx scripts/sealed-law.ts precommit --batch <name> [--ahead 8] [--n 3] | draw [--precommit <file> | --n 3] | render <round> | verify <round>");
  if (existsSync("sealed")) process.exit(1);
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import ffmpeg from "ffmpeg-static";
import { fitLaw, splitIndex, type Law } from "../lib/physics/law";
import { measure, pivotUnusable, fitCircle } from "../lib/measure";
import type { Sample, Track } from "../lib/meta/sam";
import { clockCheckOf, clockSentence, comparable, fillPlaceholders, holdPendulum, lengthBehindG, NOT_DETERMINED, pendulumHold, type Experiment } from "../lib/experiment";
import { seriesPoint } from "../lib/seriesfit";
import { pixelsToMetres } from "../lib/units";
import { visibleRecent, safeLine } from "../lib/recent";
import { prepare } from "../lib/transcode";
import { readVideoInfo } from "../lib/video";

function sample(f: number, cx: number, cy: number): Sample {
  return { f, cx, cy, area: 300, angle: 0, major: 20, minor: 20, len: 20, wid: 20, box: [cx - 10, cy - 10, cx + 10, cy + 10], conf: 0.9 };
}

/* ── fix 1: the flight search never reads a frame that ends up held out ── */

test("seal: a toss that lands early keeps every held-out frame after the last frame the flight search scanned", () => {
  // the judge's case: 60 fps, a 2 s window, thrown at 0.1 s and landing at 0.94 s, then resting. Before the fix the
  // search scanned frames 0-83 and all 15 held-out frames (41-55) lay inside it
  const times = Array.from({ length: 120 }, (_, i) => i / 60);
  const t0 = 0.1, land = 0.94, v0 = 750 * (land - t0);
  const y = (t: number) => (t < t0 || t > land ? 400 : 400 - v0 * (t - t0) + 750 * (t - t0) ** 2) + 0.25 * Math.sin(t * 997);
  const x = (t: number) => 200 + 120 * Math.min(Math.max(t - t0, 0), land - t0) + 0.2 * Math.cos(t * 611);
  const track: Track = { id: "1", noun: "ball", samples: times.map((t, f) => sample(f, x(t), y(t))) };
  const m = measure({ track, times, kind: "flight", gravity: 9.81, metresPerPixel: { value: 0.002, kind: "stated", note: "test" } });
  const held = m.px.slice(m.split!).map((p) => p.f);
  assert.equal(m.split, splitIndex(m.px.length));
  assert.ok(held.length >= 10, `held out ${held.length}`);
  assert.ok(m.flightSearch, "the scanned range is recorded");
  assert.deepEqual(held.filter((f) => f <= m.flightSearch!.f1), []);
  // the flight itself is still found: it starts at the throw and ends at the landing
  assert.ok(m.px[0].f >= 5 && m.px[0].f <= 8, `starts at ${m.px[0].f}`);
  assert.ok(Math.abs(m.px[m.px.length - 1].f - 56) <= 2, `ends at ${m.px[m.px.length - 1].f}`);
});

test("seal: a flight that runs past the searched 70% is cut exactly as before (one search, no shrinking)", () => {
  const times = Array.from({ length: 90 }, (_, i) => i / 60);
  const fall = (i: number) => 100 - 300 * times[i] + 1000 * times[i] ** 2 + 0.3 * Math.sin(i * 2.7);
  const track: Track = { id: "1", noun: "ball", samples: times.map((_, i) => sample(i, 300 + 40 * times[i], fall(i))) };
  const m = measure({ track, times, kind: "flight", gravity: 9.81 });
  assert.equal(m.flightSearch!.f1, splitIndex(90) - 1);
  for (const f of m.px.slice(m.split!).map((p) => p.f)) assert.ok(f > m.flightSearch!.f1);
});

/* ── fix 2: no angle about a centre that isn't a pivot ── */

test("pivot gate: a swing seen from a high angle (a near-vertical line whose circle sits beside it) is measured along s, not as theta", () => {
  // the Foucault 5× case: x 216-230, y 173-756 in pixels; a circle through it is centred far off to the side
  const times = Array.from({ length: 200 }, (_, i) => i / 30);
  const yOf = (t: number) => 465 + 290 * Math.cos(2 * Math.PI * t / 1.2);
  const xOf = (y: number) => 223 + 7 * (1 - ((y - 465) / 290) ** 2) + 0.3 * Math.sin(y);
  const track: Track = { id: "1", noun: "bob", samples: times.map((t, f) => sample(f, xOf(yOf(t)), yOf(t))) };
  const m = measure({ track, times, kind: "swing", noGravityRuler: true, frame: { width: 480, height: 854 } });
  assert.equal(m.series.ch.theta, undefined);
  assert.ok(m.series.ch.s, "falls back to the along-line coordinate");
  assert.equal(m.pivot, undefined);
  assert.ok(m.rejectedPivot && m.rejectedPivot.reason.length > 10);
  assert.match(m.pivotNote!, /not a pivot/);
  assert.match(m.pivotNote!, /distance s along/);
});

test("pivot gate: a short arc alone is no reason to refuse the pivot (theta stays; only L is undetermined)", () => {
  const pts = Array.from({ length: 120 }, (_, i) => { const a = 0.14 * Math.cos(i / 9); return { x: 400 + 325 * Math.sin(a) + 0.2 * Math.sin(i * 1.7), y: 40 + 325 * Math.cos(a) + 0.2 * Math.cos(i * 2.3) }; });
  const p = fitCircle(pts)!;
  assert.equal(p.lengthOk, false);
  assert.match(p.why!, /covers only/);
  assert.equal(pivotUnusable(p, pts, { width: 800, height: 450 }), null);
  // the same circle seen sideways (centre beside the path) is refused
  const side = pts.map((q) => ({ x: q.y + 300, y: 800 - q.x }));
  assert.ok(pivotUnusable(fitCircle(side)!, side, { width: 1200, height: 900 }));
});

/* ── fix 3: g and L never both float; a floating parameter is never printed as measured ── */

const pendulumLaw = (): Law => ({
  id: "damped", title: "damped pendulum", summary: "", state: ["theta", "omega"],
  derivatives: { theta: "omega", omega: "-(g/L)*sin(theta) - gamma*omega" },
  params: [{ name: "g", guess: 9.81, min: 1, max: 30, unit: "m/s^2", meaning: "gravity" }, { name: "L", guess: 0.595, min: 0.05, max: 5, unit: "m", meaning: "length" }, { name: "gamma", guess: 0.06, min: 0, max: 2, unit: "1/s" }],
  observe: { theta: "theta" },
});
const swing = () => {
  const t = Array.from({ length: 240 }, (_, i) => i / 24);
  const w = Math.sqrt(9.81 / 0.6), wd = Math.sqrt(w * w - 0.025 ** 2);
  return { t, ch: { theta: t.map((x, i) => 0.14 * Math.exp(-0.025 * x) * Math.cos(wd * x) + 2e-4 * Math.sin(i * 2.3)) } };
};

test("pendulum: with both g and L free a small swing determines only g/L, and the finding says 'not determined', never ± 830", () => {
  const f = fitLaw(pendulumLaw(), swing(), { starts: 2 });
  assert.ok(f.ok);
  assert.deepEqual([...(f.undetermined ?? [])].sort(), ["L", "g"]);
  assert.equal(comparable(f, "g"), false);
  const text = fillPlaceholders("length {L} pulled by gravity {g}, damping {gamma}", f, pendulumLaw());
  assert.match(text, new RegExp(`length ${NOT_DETERMINED} pulled by gravity ${NOT_DETERMINED}`));
  assert.doesNotMatch(text.split("damping")[0], /±/);
});

test("pendulum: code holds g (no length known) or L (stated or from the radius) whatever the theorist wrote", () => {
  const ch = { theta: [0], x: [0], y: [0] };
  assert.deepEqual(pendulumHold(ch, null, undefined, 9.80665), { name: "g", value: 9.80665 });
  assert.deepEqual(pendulumHold(ch, null, 0.6, 9.80665), { name: "L", value: 0.6 });
  assert.equal(pendulumHold({ x: [0] }, null, 0.6, 9.8), null);
  // a swing whose circle was refused as a pivot is measured along s: the hold still applies
  assert.deepEqual(pendulumHold({ s: [0], x: [0] }, null, 67, 9.8, true), { name: "L", value: 67 });
  assert.equal(pendulumHold(ch, 9.8, 0.6, 9.8), null);
  const law = holdPendulum(pendulumLaw(), pendulumHold(ch, null, undefined, 9.80665));
  assert.ok(law.params.find((p) => p.name === "g")!.fixed);
  const f = fitLaw(law, swing(), { starts: 2 });
  assert.ok(Math.abs(f.theta.L - 0.6) < 0.003, `L ${f.theta.L}`);
  assert.equal(f.undetermined, undefined);
  const text = fillPlaceholders("length {L} pulled by gravity {g}", f, law);
  assert.match(text, /length 0\.\d+ ± 0\.\d+ m pulled by gravity 9\.81 m\/s² \(given\)/);
  // a law that already fixes one of them is left alone
  const l2 = pendulumLaw();
  l2.params[1].fixed = true;
  holdPendulum(l2, { name: "g", value: 9.8 });
  assert.equal(l2.params[0].fixed, undefined);
});

test("pendulum: a rough winner's finding has no ±, as on the readout card", () => {
  const law = holdPendulum(pendulumLaw(), { name: "g", value: 9.80665 });
  const f = { ...fitLaw(law, swing(), { starts: 1 }), testZ: 5.6 };
  const text = fillPlaceholders("length {L}", f, law);
  assert.match(text, /^length about 0\.6 m$/);
});

test("series: a fitted L is never taken as 'from the sheet' unless the given says it was measured from the radius", () => {
  const e = { id: "x", title: "t", given: ["scale: metre stick = 1 m"], measured: { calibration: { kind: "reference", metresPerPixel: 0.002, note: "" } }, observation: { reference: { relative_uncertainty: 0.03 }, body: "earth", location: {} } } as unknown as Experiment;
  const w = { law: pendulumLaw(), fit: { theta: { g: 9.77, L: 0.5975 }, sigma: { g: 828, L: 51 } } } as never;
  assert.equal(seriesPoint(e, w), null);
});

/* ── fix 4: the clock check says when it could not run, and names the ruler as an explanation ── */

test("clock: not checkable without a ruler or a stated length, or when gravity set the scale; a misread ruler is offered beside slow motion", () => {
  const g = { measured: 9.75, reference: 9.80665 };
  assert.equal(clockCheckOf({ slowSet: false, calibration: "none", statedLength: false, gravity: null, flagged: false, body: "earth" }).checked, false);
  assert.match(clockCheckOf({ slowSet: false, calibration: "gravity", statedLength: false, gravity: null, flagged: false, body: "earth" }).why, /fall set the scale/);
  assert.match(clockCheckOf({ slowSet: false, calibration: "reference", statedLength: false, gravity: null, flagged: false, body: "earth" }).why, /no gravity was measured/);
  assert.equal(clockCheckOf({ slowSet: true, calibration: "reference", statedLength: false, gravity: g, flagged: false, body: "earth" }).checked, false);
  const ok = clockCheckOf({ slowSet: false, calibration: "reference", statedLength: false, gravity: g, flagged: false, body: "earth" });
  assert.equal(ok.checked, true);
  assert.match(ok.why, /within 0\.58% of Earth/);
  assert.equal(clockCheckOf({ slowSet: false, calibration: "none", statedLength: true, gravity: g, flagged: false, body: "earth" }).checked, true);
  const by = lengthBehindG({ kind: "reference" }, false, "a metre stick");
  assert.equal(by, "the metre stick");
  assert.equal(lengthBehindG({ kind: "none" }, false), null);
  const s = clockSentence(1 / 9, 3, "earth", false, by);
  assert.match(s, /about 3× slower than real life, or the metre stick is not the length assumed\./);
  assert.match(readFileSync("lib/experiment.ts", "utf8"), /clockCheck: rep\.clockCheck/);
});

/* ── fix 5: square pixels ── */

test("prepare: non-square pixels are squared (352 coded px at SAR 10:11 become 320), square ones are untouched", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "ansatz-sar-"));
  const bin = ffmpeg as unknown as string;
  const tv = path.join(dir, "tv.mp4"), sq = path.join(dir, "sq.mp4");
  execFileSync(bin, ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=352x240:rate=30", "-t", "1", "-vf", "setsar=10/11", "-c:v", "libx264", "-pix_fmt", "yuv420p", tv]);
  execFileSync(bin, ["-v", "error", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=30", "-t", "1", "-c:v", "libx264", "-pix_fmt", "yuv420p", sq]);
  const a = readVideoInfo((await prepare(readFileSync(tv))).video);
  assert.equal(a.width, 320);
  assert.equal(a.height, 240);
  assert.equal(a.times.length, 30);
  assert.equal(readVideoInfo((await prepare(readFileSync(sq))).video).width, 320);
});

/* ── fix 6: a no-ruler constant in metres ── */

test("units: the dry-friction deceleration in m/s² with the render's scale (355 ± 23 px/s² at 0.00121 m/px)", () => {
  const r = pixelsToMetres(355.28295392508875, 22.85554431642833, "pixel/s^2", 0.00121)!;
  assert.equal(r.value.toFixed(3), "0.430");
  assert.equal(r.sigma.toFixed(3), "0.028");
  assert.equal(r.unit, "m/s^2");
  assert.equal(pixelsToMetres(1, 1, "1/s", 0.001), null);
  assert.equal(pixelsToMetres(2, 0, "1/px", 0.5)!.value, 4);
  const df = JSON.parse(readFileSync("data/showcase/dry-friction-spring.json", "utf8")) as Experiment;
  const si = df.extras!.truth!.rows.find((x) => x.param === "ac")!.si!;
  assert.equal(`${si.measured.toFixed(3)} ± ${si.sigma.toFixed(3)} ${si.unit}`, "0.430 ± 0.028 m/s²");
  assert.equal(si.truth.toFixed(2), "0.45");
});

/* ── fix 7: upload and status routes ── */

test("routes: /api/upload checks the origin and never hands GCS a made-up one; /api/status is 404 for a run that never started", () => {
  const up = readFileSync("app/api/upload/route.ts", "utf8");
  assert.match(up, /if \(!sameOrigin\(req\)\) return crossOrigin\(\);/);
  assert.ok(up.indexOf("sameOrigin(req)") < up.indexOf("countUpload("), "origin checked before anything is counted");
  assert.ok(up.indexOf("413") < up.indexOf("countUpload("), "counted only once the request is valid");
  assert.doesNotMatch(up, /req\.headers\.get\("origin"\) \?\? new URL/);
  const st = readFileSync("app/api/status/[id]/route.ts", "utf8");
  assert.match(st, /if \(!prog\) return Response\.json\(\{ state: "unknown" \}, \{ status: 404 \}\);/);
  assert.match(readFileSync("app/api/run/route.ts", "utf8"), /putObject\(`progress\/\$\{id\}\.json`, "\[\]"/);
});

/* ── fix 8: only allow-listed visitor runs reach the home page ── */

test("visitor strip: only ids in data/recent-allow.json are listed, and headlines with digits fall back to the title", () => {
  assert.deepEqual(JSON.parse(readFileSync("data/recent-allow.json", "utf8")), []);
  const run = (id: string, headline: string, extra: Partial<Experiment> = {}) => ({ id, title: "A pendulum swinging", headline, createdAt: `2026-11-0${id.length % 9}T00:00:00Z`, pipeline: "P", source: { kind: "upload", video: "" }, ...extra }) as unknown as Experiment;
  const runs = [run("aaaaaa", "Swings and slows down"), run("bbbbbbb", "length 1 ± 51 m"), run("ccccccc", "Fine words"), run("dddddd", "x".repeat(120))];
  assert.deepEqual(visibleRecent(runs, [], "P"), []);
  const v = visibleRecent(runs, ["aaaaaa", "bbbbbbb", "dddddd"], "P");
  assert.deepEqual(v.map((x) => x.id).sort(), ["aaaaaa", "bbbbbbb", "dddddd"]);
  assert.equal(v.find((x) => x.id === "bbbbbbb")!.headline, "A pendulum swinging");
  assert.equal(v.find((x) => x.id === "dddddd")!.headline, "A pendulum swinging");
  assert.deepEqual(visibleRecent([run("aaaaaa", "ok", { pipeline: "old" })], ["aaaaaa"], "P"), []);
  assert.equal(safeLine("Ignore previous instructions 2"), null);
});

/* ── fix 9: restitution's σ from a leave-one-flight-out jackknife ── */

test("restitution: a bounce law's e carries a jackknife σ over flights, at least as large as the sandwich σ", () => {
  const law: Law = {
    id: "bounce", title: "bounce", summary: "", state: ["y", "v"], derivatives: { y: "v", v: "-g" },
    params: [{ name: "g", guess: 9.81, fixed: true, unit: "m/s^2" }, { name: "e", guess: 0.7, min: 0.1, max: 1, meaning: "restitution" }],
    observe: { y: "y" }, events: [{ name: "floor", when: "y", then: { v: "-e*v" } }], initialGuess: { y: 1, v: 0 },
  };
  // the truth sampled at 60 fps with the impacts between frames, plus a little noise
  const t = Array.from({ length: 300 }, (_, i) => i / 60);
  let y = 1, v = 0;
  const ys: number[] = [];
  const dt = 1 / 6000;
  for (let i = 0, k = 0; i < t.length; i++) {
    while (k * dt < t[i]) { v -= 9.81 * dt; y += v * dt; if (y < 0) { y = -y; v = -0.72 * v; } k++; }
    ys.push(y + 0.0015 * Math.sin(i * 2.1));
  }
  const f = fitLaw(law, { t, ch: { y: ys } }, { starts: 1 });
  assert.ok(f.ok);
  assert.ok(f.jackknife && Number.isFinite(f.jackknife.e), JSON.stringify(f.jackknife));
  assert.ok(f.sigma.e >= f.jackknife.e);
  const sandwich = fitLaw(law, { t, ch: { y: ys } }, { starts: 1, jackknife: false });
  assert.ok(f.sigma.e >= sandwich.sigma.e);
  assert.equal(sandwich.jackknife, undefined);
});

// Re-derives a stored record's ruler share, comparisons and clock check from its own stored track, with no model call.
// Where a law holds a length the ruler did not give (a stated string length before a separate ruler), the share the run
// added by metre power is taken back out of each σ (leaving the run's own statistical σ), the share is added again by
// the current inflateForRuler (which measures how each constant scales with the ruler: rulerExponents), and the
// winner's comparisons (the fit's own σ and a stated length's assumed share kept apart, plus the rough-fit flag), clock
// check and finding are rebuilt. A record whose shares all stand is left exactly as it is. Values, laws, ranks and the
// referee's words are never changed; a warm refit from the stored values checks the fit-only σ.
// With --retime, the stored series is also checked for a repeated frame at a fixed cadence (a 24 fps film stored at
// 25 fps shows one frame in 25 twice): the repeats are found from the clip's own frames, dropped, the unique frames
// retimed to k/24 s and the winning law refitted. That result is stored beside the run (extras.retimed), not over it.
// usage: tsx scripts/refit-record.ts [id ...] [--write] [--retime]   (no id: every showcase record, dry run)
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import ffmpeg from "ffmpeg-static";
import { clockCheckOf, fillPlaceholders, fitWithRoom, gravityComparison, heldLengthFromRuler, inflateForRuler, isRoughFit, referenceValues, rulerExponents, rulerShare, withScaleCorrection, type Experiment, type RulerFit } from "../lib/experiment";
import { compileLaw, fitLaw, noiseScale, splitIndex, type Fit, type Series } from "../lib/physics/law";
import { localGravity } from "../lib/measure";
import { median } from "../lib/median";
import { metrePower, toMetres } from "../lib/units";
import { readVideoInfo } from "../lib/video";

const DIR = "data/showcase";
const args = process.argv.slice(2);
const write = args.includes("--write");
const retime = args.includes("--retime");
const ids = args.filter((a) => !a.startsWith("--"));
const all = readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== "order.json").map((f) => f.replace(/\.json$/, ""));
const r4 = (x: number) => +x.toPrecision(4);

/** What the run held as given: a stated length (the narrator's, or the swing's radius against the ruler) and where it came from. */
function statedOf(e: Experiment) {
  const stated: Record<string, number> = {};
  for (const f of e.observation.stated_facts ?? []) {
    const q = f.quantity.toLowerCase();
    const metres = toMetres(f.value, f.unit);
    if (/length|string|rope|thread|dhaga|dhaage/.test(q) && metres !== undefined && metres > 0.02 && metres < 30) stated.l = metres;
  }
  const m = e.measured;
  let arcRel = 0, fromArc = false;
  if (m.series.ch.theta && m.pivot && m.pivot.lengthOk !== false && m.calibration.kind === "reference" && stated.l === undefined) {
    stated.l = m.pivot.r * m.calibration.metresPerPixel;
    fromArc = true;
    arcRel = (m.pivot.sigmaR ?? 0) / m.pivot.r;
  }
  return { stated, arcRel, fromArc };
}

/** Recomputes σ, the ruler's share, comparisons and the clock check in place; returns a line per change. */
function refit(e: Experiment) {
  const m = e.measured, obs = e.observation;
  const train = e.trainFrac ?? 0.7;
  const gUsed = m.calibration.kind === "gravity" ? m.calibration.g : null;
  const { stated, arcRel, fromArc } = statedOf(e);
  const lFromRuler = heldLengthFromRuler(obs, m.calibration, stated.l, fromArc);
  const share = rulerShare(obs, m.calibration, gUsed);
  const notes: string[] = [];
  const win0 = e.candidates.find((c) => c.law.id === e.winner)!;
  const oldWinSigma = { ...win0.fit.sigma };
  const oldFinding = e.critique?.finding ? fillPlaceholders(e.critique.finding, win0.fit, win0.law) : null;
  let changed = false;
  for (const c of e.candidates) {
    const fit = c.fit as RulerFit;
    // no share was added, or it is already the measured one
    if (!fit.ok || !fit.rulerAdded || fit.rulerExp) continue;
    const exp = share.fromRuler ? rulerExponents(c, m.series, lFromRuler) : null;
    // every length the law holds came from the ruler: the share stands as the run added it
    if (!exp) continue;
    // the share the run added: each constant's metre power times the ruler's (and the arc's) relative error
    const holdsG = obs.body === "earth" && c.law.params.some((p) => p.fixed && /^g$/i.test(p.name));
    const rel = Math.hypot(share.rulerRel || (holdsG ? share.gRel : 0), arcRel);
    // the fit's own σ is the stored σ with that share taken out: the run's own covariance, not a re-estimate
    const sigma: Record<string, number> = { ...fit.sigma };
    for (const p of c.law.params) {
      if (p.fixed) continue;
      const pw = metrePower(p.unit), v = fit.theta[p.name], sd = fit.sigma[p.name];
      if (pw && Number.isFinite(v) && Number.isFinite(sd)) sigma[p.name] = Math.sqrt(Math.max(0, sd * sd - (Math.abs(pw) * rel * Math.abs(v)) ** 2));
    }
    fit.sigma = sigma;
    delete fit.rulerAdded;
    inflateForRuler(c, share, obs.body, arcRel, { series: m.series, heldFromRuler: lFromRuler });
    changed = true;
    if (c.law.id === e.winner) {
      // a check on the subtraction: a warm refit from the stored values, its statistical σ by today's covariance code
      const law = c.fitted ?? c.law, free = compileLaw(law).free;
      const f = fitLaw(law, m.series, { trainFrac: train, theta0: Float64Array.from(free.map((n) => fit.theta[n])), jackknife: false });
      if (f.ok) notes.push(`check: a warm refit gives the fit-only σ as ${c.law.params.filter((p) => !p.fixed).map((p) => `${p.name} ${r4(f.sigma[p.name])} (record ${r4(fit.sigmaFit![p.name])})`).join(", ")}`);
    }
  }
  if (!changed) return notes;
  const win = e.candidates.find((c) => c.law.id === e.winner)!;
  for (const p of win.law.params) {
    if (p.fixed) continue;
    const a = oldWinSigma[p.name], b = win.fit.sigma[p.name];
    if (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) > 1e-6 * Math.max(Math.abs(a), 1e-12)) notes.push(`winner σ(${p.name}): ${r4(a)} -> ${r4(b)}${(win.fit as RulerFit).rulerExp ? ` (scales with the ruler as λ^${(win.fit as RulerFit).rulerExp![p.name]})` : ""}`);
  }
  const before = JSON.stringify(e.comparisons);
  const comps = referenceValues(win.law, win.fit, obs, gUsed, stated, m.line, m, lFromRuler).map((c) => (isRoughFit(win.fit) ? { ...c, rough: true } : c));
  // a comparison the stored record has and this code would not make (an older rule) is kept, not dropped
  for (const old of e.comparisons) if (!comps.some((c) => c.param === old.param && c.label === old.label)) comps.push(old);
  e.comparisons = comps;
  if (JSON.stringify(comps) !== before) {
    for (const c of comps) {
      const o = (JSON.parse(before) as Experiment["comparisons"]).find((x) => x.param === c.param && x.label === c.label);
      notes.push(`comparison ${c.param}: ${o ? `${r4(o.measured)} ± ${r4(o.sigma)} (${r4(o.withinSigma)}σ)` : "new"} -> ${r4(c.measured)} ± ${r4(c.sigma)} (${r4(c.withinSigma)}σ)${c.sigmaAssumed !== undefined ? ` [fit ± ${r4(c.sigmaFit!)}, assumed ± ${r4(c.sigmaAssumed)}]` : ""}${c.rough ? " [rough: printed with no ±]" : ""}`);
    }
  }
  // the clock check, from the same rule the run uses (a flagged clock is never set or cleared here: it's reported)
  const gc = gravityComparison(e.comparisons);
  const slow = (m.slowMotion ?? 1) > 1;
  if (gc && !slow && !e.clock) {
    const r = gc.measured / gc.reference, sr = gc.sigma > 0 ? gc.sigma / gc.reference : 0;
    if (r > 0 && Math.abs(r - 1) > Math.max(0.15, 3 * sr)) notes.push("WARNING: the clock would now be flagged; not changed here");
  }
  if (e.clockCheck && !e.clock) {
    const cc = clockCheckOf({ slowSet: slow, calibration: m.calibration.kind, statedLength: stated.l !== undefined && !fromArc, gravity: gc ?? null, flagged: false, body: obs.body, gHeld: win.law.params.some((p) => p.fixed && /^g$/i.test(p.name)) && !gUsed });
    if (cc.checked === e.clockCheck.checked && cc.why !== e.clockCheck.why) {
      notes.push(`clock check: "${e.clockCheck.why}" -> "${cc.why}"`);
      e.clockCheck = cc;
    }
  }
  // the finding names fitted values: refilled only when the stored one was filled from the referee's sentence
  if (oldFinding && e.critique?.finding && e.finding.startsWith(oldFinding)) {
    const now = fillPlaceholders(e.critique.finding, win.fit, win.law);
    if (now !== oldFinding) {
      e.finding = now + e.finding.slice(oldFinding.length);
      notes.push(`finding refilled: ${now}`);
    }
  }
  return notes;
}

/**
 * A film shot at 24 fps and stored at 25 shows one frame in 25 twice. The repeats are found from the clip's own frames
 * (the mean absolute grey-level change from the previous frame, by frame index mod 25), the tracked samples on them
 * dropped, the unique frames retimed to k/24 s, and the winning law refitted from scratch, held-out 30% as before.
 */
function retimed(e: Experiment) {
  const clip = `public${e.source.video}`;
  const buf = readFileSync(clip);
  const vi = readVideoInfo(buf);
  const P = 25, FILM = 24;
  if (Math.abs(vi.fps - P) > 0.01) return null;
  const raw = execFileSync(ffmpeg as unknown as string, ["-v", "error", "-i", clip, "-vf", "scale=320:-2", "-f", "rawvideo", "-pix_fmt", "gray", "pipe:1"], { maxBuffer: 1 << 28 });
  const n = vi.times.length, fb = raw.length / n;
  const diff = [NaN];
  for (let f = 1; f < n; f++) {
    let s = 0;
    for (let i = 0; i < fb; i++) s += Math.abs(raw[f * fb + i] - raw[(f - 1) * fb + i]);
    diff.push(s / fb);
  }
  const byPhase = Array.from({ length: P }, (_, p) => median(diff.filter((d, f) => f > 0 && f % P === p)));
  const phase = byPhase.indexOf(Math.min(...byPhase));
  const others = median(byPhase.filter((_, p) => p !== phase));
  const repeats = diff.map((d, f) => f > 0 && f % P === phase).map((x, f) => x && diff[f] < 0.5 * others);
  const m = e.measured;
  const keep = m.px.map((p, i) => ({ p, i })).filter(({ p }) => !repeats[p.f]);
  const f0 = m.px[0].f;
  // each unique frame's time on the film's clock: the count of unique frames before it, over 24
  const uniqueBefore = (f: number) => { let k = 0; for (let g = f0; g < f; g++) if (!repeats[g]) k++; return k; };
  const t = keep.map(({ p }) => m.series.t[0] + uniqueBefore(p.f) / FILM);
  const ch = Object.fromEntries(Object.entries(m.series.ch).map(([k, v]) => [k, keep.map(({ i }) => v[i])]));
  const series: Series = { t, ch };
  const win = e.candidates.find((c) => c.law.id === e.winner)!;
  const gUsed = m.calibration.kind === "gravity" ? m.calibration.g : null;
  const inner = { ...win.law, params: win.law.params.filter((p) => p.name !== "cal") };
  const r = fitWithRoom(inner, series, gUsed !== null ? withScaleCorrection : undefined);
  const asStored = fitLaw(win.fitted ?? win.law, m.series, { trainFrac: e.trainFrac ?? 0.7, theta0: Float64Array.from(compileLaw(win.fitted ?? win.law).free.map((k) => win.fit.theta[k])), jackknife: false });
  const N = t.length, S = splitIndex(N, e.trainFrac ?? 0.7);
  const noise = Object.fromEntries(Object.entries(ch).map(([k, v]) => [k, noiseScale(v.slice(0, S), t.slice(0, S))]));
  return { cadence: { period: P, phase, repeats: repeats.filter(Boolean).length, frames: n, dropped: m.px.length - keep.length, byPhase: byPhase.map((x) => +x.toFixed(3)) }, fit: r.fit, asStored, noise };
}

const summary: string[] = [];
for (const id of ids.length ? ids : all) {
  const path = `${DIR}/${id}.json`;
  const text = readFileSync(path, "utf8");
  const e = JSON.parse(text) as Experiment;
  const notes = refit(e);
  if (retime) {
    const rt = retimed(e);
    if (!rt) notes.push("retime: not a 25 fps clip; skipped");
    else {
      const g = (f: Fit) => f.theta.g, sg = (f: Fit) => f.sigma.g;
      const L = e.candidates.find((c) => c.law.id === e.winner)!.law.params.find((p) => p.fixed && /^l$/i.test(p.name))?.guess;
      notes.push(`retime: ${rt.cadence.repeats} repeated frames of ${rt.cadence.frames} (phase ${rt.cadence.phase} mod ${rt.cadence.period}), ${rt.cadence.dropped} tracked samples dropped`);
      notes.push(`retime: as stored  g ${g(rt.asStored).toFixed(4)} ± ${sg(rt.asStored).toFixed(4)} (fit alone), fitted miss ${(rt.asStored.trainRms * 1000).toFixed(2)} mm, unseen ${(rt.asStored.testRms * 1000).toFixed(2)} mm, ${rt.asStored.testZ!.toFixed(2)}× the noise`);
      notes.push(`retime: retimed   g ${g(rt.fit).toFixed(4)} ± ${sg(rt.fit).toFixed(4)} (fit alone), fitted miss ${(rt.fit.trainRms * 1000).toFixed(2)} mm, unseen ${(rt.fit.testRms * 1000).toFixed(2)} mm, ${rt.fit.testZ!.toFixed(2)}× the noise`);
      if (Number.isFinite(g(rt.fit))) {
        const ref = localGravity(e.observation.body, e.observation.location.latitude_deg ?? undefined);
        const rough = isRoughFit(rt.fit);
        const assumed = L !== undefined ? 0.01 * Math.abs(g(rt.fit)) : 0;
        const sigma = Math.hypot(sg(rt.fit), assumed);
        const ex = (e.extras ??= {} as NonNullable<Experiment["extras"]>) as Record<string, unknown>;
        ex.retimed = {
          method: "repeated frames found from the clip's own frames (grey-level change from the previous frame, by frame index mod 25), dropped, unique frames retimed to k/24 s; the winning law refitted from scratch on the first 70%, scored on the rest",
          cadence: rt.cadence,
          g: +g(rt.fit).toFixed(4),
          sigmaFit: +sg(rt.fit).toFixed(4),
          ...(assumed ? { sigmaAssumed: +assumed.toFixed(4) } : {}),
          sigma: +sigma.toFixed(4),
          trainRmsMm: +(rt.fit.trainRms * 1000).toFixed(2),
          testRmsMm: +(rt.fit.testRms * 1000).toFixed(2),
          testZ: +rt.fit.testZ!.toFixed(2),
          rough,
          asStored: { g: +g(rt.asStored).toFixed(4), sigmaFit: +sg(rt.asStored).toFixed(4), trainRmsMm: +(rt.asStored.trainRms * 1000).toFixed(2), testRmsMm: +(rt.asStored.testRms * 1000).toFixed(2), testZ: +rt.asStored.testZ!.toFixed(2) },
          note: `The clip was filmed at 24 frames a second and stored at 25, so one frame in 25 is shown twice (${rt.cadence.repeats} repeats in ${rt.cadence.frames} frames). With the repeats dropped and the unique frames retimed to 1/24 s, the same law gives g = ${g(rt.fit).toFixed(2)} m/s² and misses the frames it was fitted to by ${(rt.fit.trainRms * 1000).toFixed(2)} mm (${(rt.asStored.trainRms * 1000).toFixed(2)} mm as stored) and the unseen frames by ${(rt.fit.testRms * 1000).toFixed(2)} mm (${(rt.asStored.testRms * 1000).toFixed(2)} mm), ${rt.fit.testZ!.toFixed(1)}× the noise (${rt.asStored.testZ!.toFixed(1)}×)${rough ? ", still over five times, so g still carries no error bar" : `; with the stated length good to 1%, g = ${g(rt.fit).toFixed(2)} ± ${sigma.toFixed(2)} m/s² (${(Math.abs(g(rt.fit) - ref) / sigma).toFixed(1)}σ from ${ref.toFixed(3)})`}. Computed by scripts/refit-record.ts from the stored track and the clip's frames; no model call.`,
        };
      }
    }
  }
  summary.push(`${id}\n${notes.length ? notes.map((x) => `  ${x}`).join("\n") : "  unchanged"}`);
  const out = JSON.stringify(e);
  if (write && out !== JSON.stringify(JSON.parse(text))) {
    writeFileSync(path, out + (/\r?\n$/.test(text) ? "\n" : ""));
    summary.push(`  written ${path}`);
  }
}
console.log(summary.join("\n"));

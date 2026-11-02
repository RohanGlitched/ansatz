import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runRequestBody, type RunForm } from "../lib/runRequest";
import { statedLength } from "../lib/speech";
import { liteLaws, liteObservation, liteStatedFacts } from "../lib/lite";
import { narrationForObserver } from "../lib/experiment";
import { fitLaw } from "../lib/physics/law";
import { toMetres } from "../lib/units";

// a class link's form: lite mode (class links start in it), a pendulum, the length typed in "What do you know?"
const classForm: RunForm = {
  key: "uploads/abcdef123456.mp4",
  k: null,
  noun: "steel bob",
  narration: "The string is 60 cm long",
  slow: "1",
  ruler: "white A4 sheet of paper",
  rulerLen: "0.297",
  fromSample: false,
  language: "",
  classCode: "abc123",
  seriesId: null,
  student: "Asha, roll 14",
  lite: true,
  liteType: "pendulum",
  listen: true,
};

test("request builder: lite mode sends the typed 'What do you know?' text, the type and whether to listen", () => {
  const b = runRequestBody(classForm);
  assert.equal(b.narration, "The string is 60 cm long", "the typed length must reach the run in lite mode");
  assert.deepEqual(b.lite, { type: "pendulum", listen: true });
  assert.equal(b.class, "abc123");
  assert.equal(b.student, "Asha, roll 14");
  assert.deepEqual(b.ruler, { noun: "white A4 sheet of paper", metres: 0.297 });
  assert.equal(b.slowMotion, undefined, "lite assumes real time");
  // the language travels in lite mode too (it helps the transcription and the reading of a length typed in it)
  assert.equal(runRequestBody({ ...classForm, language: "Hindi" }).language, "Hindi");
  // not listening is the student's choice, and the typed text still goes
  const quiet = runRequestBody({ ...classForm, listen: false });
  assert.deepEqual(quiet.lite, { type: "pendulum", listen: false });
  assert.equal(quiet.narration, "The string is 60 cm long");
  // empty or blank notes send nothing
  assert.equal(runRequestBody({ ...classForm, narration: "   " }).narration, undefined);
});

test("request builder: a full run is as before (typed notes, slow motion, no lite field)", () => {
  const b = runRequestBody({ ...classForm, lite: false, slow: "4", language: "Tamil" });
  assert.equal(b.narration, "The string is 60 cm long");
  assert.equal(b.slowMotion, 4);
  assert.equal(b.language, "Tamil");
  assert.equal(b.lite, undefined);
  assert.equal(runRequestBody({ ...classForm, classCode: null }).student, undefined, "a name goes only with a class link");
});

test("the form builds its request with the builder, and shows the knowledge box in lite mode", () => {
  const src = readFileSync("components/NewExperiment.tsx", "utf8");
  assert.match(src, /runRequestBody\(/);
  assert.doesNotMatch(src, /narration: !lite/, "lite mode no longer drops the typed notes");
  assert.doesNotMatch(src, /\{!lite && \(\s*<label className=\{styles\.field\}>\s*<span className=\{styles\.label\}>What do you know\?/);
});

test("a stated length is read by code from typed or spoken text", () => {
  const m = (t: string, l?: string) => statedLength(t, l)?.metres;
  assert.equal(m("The string is 60 cm long"), 0.6);
  assert.equal(m("L = 60cm"), 0.6);
  assert.equal(m("string: 0.8 m"), 0.8);
  assert.equal(m("the string is fifty centimetres"), 0.5);
  assert.equal(m("धागा साठ सेंटीमीटर का है", "Hindi"), 0.6);
  assert.equal(m("धागे की लंबाई ८० सेंटीमीटर", "Hindi"), 0.8);
  // the scale in view is not the thing measured
  assert.equal(m("A4 sheet 29.7 cm on the wall, string 80 cm"), 0.8);
  assert.equal(m("an A4 sheet of 29.7 cm. The string is 1 m"), 1);
  assert.equal(statedLength("no length here"), null);
  assert.equal(statedLength("A4 sheet 29.7 cm"), null);
});

test("lite stated facts: the typed length first, a heard one when nothing was typed, labelled by the kind", () => {
  assert.deepEqual(liteStatedFacts("pendulum", { typed: "The string is 60 cm long" }), [{ quantity: "string length", value: 60, unit: "cm", said: "60 cm (typed)" }]);
  assert.deepEqual(liteStatedFacts("pendulum", { typed: "string 60 cm", heard: "the string is eighty centimetres" }).map((f) => f.value), [60]);
  assert.deepEqual(liteStatedFacts("pendulum", { heard: "the string is eighty centimetres" }), [{ quantity: "string length", value: 80, unit: "cm", said: "eighty centimetres (said)" }]);
  assert.deepEqual(liteStatedFacts("pendulum", { typed: "a pendulum" }), []);
  assert.equal(liteStatedFacts("drop", { typed: "dropped from 1.2 m" })[0].quantity, "drop height");
  // the run holds a stated fact as L the way it does a full run's (lib/experiment.ts: /length|string|…/ and toMetres)
  const L = /length|string|rope|thread|dhaga|dhaage/;
  const [f] = liteStatedFacts("pendulum", { typed: "L = 60cm" });
  assert.ok(L.test(f.quantity) && toMetres(f.value, f.unit) === 0.6);
  assert.ok(!L.test(liteStatedFacts("drop", { typed: "1.2 m" })[0].quantity), "a drop height is listed as given, never taken as a pendulum length");
  const obs = liteObservation("pendulum", "steel bob", 10, undefined, undefined, [f]);
  assert.deepEqual(obs.stated_facts, [f]);
  assert.deepEqual(liteObservation("pendulum", "steel bob", 10).stated_facts, []);
});

test("the observer reads both what was said and what was typed (a clip with sound no longer drops the typed notes)", () => {
  assert.equal(narrationForObserver(undefined, "string 50 cm"), "string 50 cm");
  assert.equal(narrationForObserver({ transcript: "now I let go", turns: [{ startMs: 2300, transcript: "now I let go" }] }, "string 50 cm"), "[2.3 s] now I let go\nTyped with the clip: string 50 cm");
  assert.equal(narrationForObserver({ transcript: "", turns: [] }, "string 50 cm"), "string 50 cm");
  assert.equal(narrationForObserver({ transcript: "hello", turns: [] }), "hello");
  assert.equal(narrationForObserver(undefined), "");
});

test("lite pendulum with a stated length: L is held at it and g measured, not g held and L measured", () => {
  // a 60 cm pendulum on Earth, 8 s at 30 fps, measured as an angle (no ruler: the case class links hit)
  const L = 0.6, g = 9.81, w = Math.sqrt(g / L);
  const t = Array.from({ length: 240 }, (_, i) => i / 30);
  const series = { t, ch: { theta: t.map((x) => 0.2 * Math.cos(w * x)) } };
  // without a length: g/L with g held at Earth's, so the fit measures L (the old lite behaviour, still right when nothing is stated)
  const held = liteLaws("pendulum", series, { g: 9.81, gFixed: false, pendulumG: 9.81, pixels: true });
  assert.ok(held[0].params.some((p) => p.name === "g" && p.fixed) && held[0].params.some((p) => p.name === "L" && !p.fixed));
  // with the stated 60 cm: L held at 0.6 m, g free, and the fit finds Earth's g
  const laws = liteLaws("pendulum", series, { g: 9.81, gFixed: false, pendulumG: 9.81, pixels: true, statedL: L });
  for (const l of laws) {
    assert.deepEqual(l.params.find((p) => p.name === "L"), { ...l.params.find((p) => p.name === "L")!, guess: L, fixed: true }, l.id);
    assert.equal(l.params.find((p) => p.name === "g")!.fixed, false, l.id);
  }
  const small = laws.find((l) => l.id === "lib-pend-small")!;
  const fit = fitLaw(small, series, { trainFrac: 0.7, jackknife: false });
  assert.ok(Math.abs(fit.theta.g - g) / g < 0.002, `g = ${fit.theta.g}`);
  // the library's own objects are not changed (the next run without a length still holds g)
  assert.ok(liteLaws("pendulum", series, { g: 9.81, gFixed: false, pendulumG: 9.81, pixels: true })[0].params.some((p) => p.name === "g" && p.fixed));
  // a ruler in view (ω₀ form): the stated length seeds ω₀ = √(g/L)
  const w0 = liteLaws("pendulum", series, { g: 9.81, gFixed: false, pixels: false, statedL: L })[0].params.find((p) => p.name === "w0")!;
  assert.ok(Math.abs(w0.guess - w) < 1e-9 && !w0.fixed);
  // the run hands the stated length to the library
  assert.match(readFileSync("lib/experiment.ts", "utf8"), /statedL: m\.series\.ch\.theta \? stated\.l : undefined/);
});

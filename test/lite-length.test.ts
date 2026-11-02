import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runRequestBody, type RunForm } from "../lib/runRequest";
import { spokenLength, statedLength } from "../lib/speech";
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

test("no language chosen ('work it out'): a length in any of the seven languages or scripts is still read", () => {
  const m = (t: string) => statedLength(t)?.metres;
  assert.equal(m("धागा ६० सेंटीमीटर का है"), 0.6, "Hindi, Devanagari digits, no language");
  assert.equal(m("धागा साठ सेंटीमीटर का है"), 0.6, "Hindi number word, no language");
  assert.equal(m("धागे की लंबाई 60 सेमी"), 0.6);
  assert.equal(m("धागे की लंबाई 60सेमी"), 0.6, "unit run on to the digits");
  assert.equal(m("நூல் நீளம் அறுபது சென்டிமீட்டர்"), 0.6, "Tamil");
  assert.equal(m("நூல் ௬௦ சென்டிமீட்டர்"), 0.6, "Tamil digits");
  assert.equal(m("সুতোর দৈর্ঘ্য ৬০ সেন্টিমিটার"), 0.6, "Bengali digits");
  assert.equal(m("दोऱ्याची लांबी साठ सेंटीमीटर"), 0.6, "Marathi");
  assert.equal(m("దారం పొడవు అరవై సెంటీమీటర్లు"), 0.6, "Telugu");
  assert.equal(m("la cuerda mide sesenta centímetros"), 0.6, "Spanish");
  assert.equal(m("धागा एक मीटर का है"), 1, "एक is one (it was missing before), so a metre said in Hindi reads");
  // what lite mode does with it: a heard Hindi length on a class link with no language picked
  assert.deepEqual(liteStatedFacts("pendulum", { heard: "धागा ६० सेंटीमीटर का है" }).map((f) => [f.value, f.unit]), [[60, "cm"]]);
  // a chosen language still reads as before
  assert.equal(statedLength("धागा ६० सेंटीमीटर का है", "Hindi")?.metres, 0.6);
});

test("the string's length beats a size of the bob, wherever each comes in the text", () => {
  const m = (t: string, l?: string) => statedLength(t, l)?.metres;
  assert.equal(m("the bob is 3 cm wide, string 60 cm"), 0.6);
  assert.equal(m("the bob is 3 cm wide and the string is 60 cm long"), 0.6);
  assert.equal(m("a 3 cm bob on a 60 cm string"), 0.6);
  assert.equal(m("bob diameter 2.5 cm. L = 80cm"), 0.8);
  assert.equal(m("bob 3 cm, 60 cm"), 0.6, "two lengths, one tied to the bob");
  assert.equal(m("pendulum with string, 3 cm and 60 cm"), 0.6, "ambiguous with a string named: the larger");
  assert.equal(m("3 cm and 60 cm"), 0.03, "ambiguous with no string named: the first, as before");
  assert.equal(m("the bob is 3 cm wide"), undefined, "a size alone is never taken as the string");
  assert.equal(m("the ball is dropped from 1.2 m"), 1.2, "a drop's height is not a size");
  assert.equal(m("ball 5 cm wide, dropped from 1.2 m"), 1.2);
  assert.equal(m("गोलक का व्यास 3 सेमी है, धागा 60 सेमी"), 0.6, "Hindi, no language");
  assert.equal(m("गोलक का व्यास ३ सेमी और धागे की लंबाई ६० सेमी", "Hindi"), 0.6);
  assert.equal(m("A4 sheet 29.7 cm, bob 3 cm wide, string 80 cm"), 0.8);
  assert.deepEqual(liteStatedFacts("pendulum", { typed: "the bob is 3 cm wide, string 60 cm" }).map((f) => f.value), [60]);
});

test("the Hindi worksheet's own sentences read as the worksheet promises", () => {
  const sheet = readFileSync("app/lab/sheets.ts", "utf8");
  // what it tells the student to type in "What do you know?", quoted in the Hindi checklist
  const typed = /बॉक्स में लिखें \(“([^”]+)”\)/.exec(sheet)?.[1];
  assert.equal(typed, "the string is 60 cm long");
  assert.equal(statedLength(typed!)?.metres, 0.6);
  // and the read-back it promises ("Read as 60 cm")
  assert.match(sheet, /Read as 60 cm/);
  // "or say the length while filming, in Hindi or English": with the language menu left at "work it out"
  assert.match(sheet, /लंबाई बोल भी सकते हैं, हिंदी या अंग्रेज़ी में/);
  for (const said of ["धागे की लंबाई साठ सेंटीमीटर है", "धागा ६० सेंटीमीटर का है", "लंबाई 60 सेंटीमीटर", "the string is sixty centimetres"])
    assert.equal(statedLength(said)?.metres, 0.6, said);
});

test("a decimal comma, a release offset and a ruler named after its length are not taken as the string", () => {
  const m = (t: string, l?: string) => statedLength(t, l)?.metres;
  assert.equal(m("0,6 m"), 0.6, "decimal comma");
  assert.equal(m("la cuerda mide 0,6 m", "Spanish"), 0.6);
  assert.equal(m("string 0,75 m"), 0.75);
  assert.equal(m("3 cm, 60 cm"), 0.03, "a list still splits on the comma (no string named: the first)");
  assert.equal(m("bob 3 cm, 60 cm"), 0.6);
  assert.equal(m("released 10 cm to the side; the string is 60 cm"), 0.6, "release offset");
  assert.equal(m("pulled 5 cm aside, string 60 cm"), 0.6);
  assert.equal(m("amplitude 8 cm, length 0.9 m"), 0.9);
  assert.equal(m("the string is 60 cm, released 10 cm to the side"), 0.6);
  assert.equal(m("30 cm ruler in view, 60 cm string"), 0.6, "scale word after the number");
  assert.equal(m("a 30 cm ruler beside the 60 cm string"), 0.6);
  assert.equal(m("30 cm ruler in view"), undefined);
  assert.equal(m("bob is 5 cm wide, string 60 cm"), 0.6);
  assert.equal(m("steel ball 2 cm diameter on a 60 cm string"), 0.6);
  assert.deepEqual(liteStatedFacts("pendulum", { heard: "released 10 cm to the side; the string is 60 cm" }).map((f) => f.value), [60]);
});

test("millimetres and compound number words: 'L = 600 mm', 'sixty-five centimetres', 'one metre twenty'", () => {
  const m = (t: string, l?: string) => statedLength(t, l)?.metres;
  assert.equal(m("L = 600 mm"), 0.6);
  assert.equal(m("string 600mm"), 0.6);
  assert.equal(m("the string is 650 millimetres"), 0.65);
  assert.equal(m("धागा ६०० मिमी"), 0.6, "Hindi millimetres, no language");
  assert.equal(m("sixty-five centimetres"), 0.65);
  assert.equal(m("the string is sixty five centimetres long"), 0.65);
  assert.equal(m("sesenta y cinco centímetros", "Spanish"), 0.65);
  assert.equal(m("la cuerda mide veinticinco centímetros"), 0.25);
  assert.equal(m("five centimetres"), 0.05);
  assert.equal(m("one metre twenty"), 1.2);
  assert.equal(m("the string is one metre twenty long"), 1.2);
  assert.equal(m("a metre"), 1);
  assert.equal(m("un metro veinte"), 1.2);
  assert.equal(m("string 1 m 20 cm"), 1.2);
  assert.equal(m("string 1 m 20 swings"), 1, "a trailing number in digits with no unit is not centimetres");
  assert.equal(m("length 1 m. 20 students"), 1, "never across a full stop");
  assert.equal(spokenLength("length 1 m, 3 cm bob", "English")?.metres, 1, "never across a comma");
  assert.equal(spokenLength("sixty-five centimetres", "English")?.said, "sixty-five centimetres");
  assert.equal(m("the bob is twenty-five mm wide, string sixty-five centimetres"), 0.65);
  assert.deepEqual(liteStatedFacts("pendulum", { heard: "the string is one metre twenty" }), [{ quantity: "string length", value: 1.2, unit: "m", said: "one metre twenty (said)" }]);
});

test("scale words in the seven languages are skipped like 'ruler' and 'A4'", () => {
  const m = (t: string, l?: string) => statedLength(t, l)?.metres;
  assert.equal(m("0,6 metros"), 0.6);
  assert.equal(m("regla de 30 cm a la vista, cuerda de 60 cm"), 0.6);
  assert.equal(m("hoja A4 de 29,7 cm, la cuerda mide 0,6 metros", "Spanish"), 0.6);
  assert.equal(m("regla de 30 cm"), undefined);
  assert.equal(m("पैमाना 30 सेमी, धागा 60 सेमी"), 0.6, "Hindi पैमाना");
  assert.equal(m("स्केल 30 सेमी का है और धागा 60 सेमी"), 0.6, "Hindi स्केल");
  assert.equal(m("30 सेमी रूलर, धागा 60 सेमी"), 0.6, "Hindi रूलर after the number");
  assert.equal(m("স্কেল ৩০ সেমি, সুতো ৬০ সেমি"), 0.6, "Bengali");
  assert.equal(m("३० सेमी फूटपट्टी, दोरा ६० सेमी"), 0.6, "Marathi");
  assert.equal(m("அளவுகோல் 30 செமீ, நூல் 60 சென்டிமீட்டர்"), 0.6, "Tamil");
  assert.equal(m("స్కేలు 30 సెం.మీ, దారం 60 సెం.మీ"), 0.6, "Telugu");
  assert.equal(m("A4 शीट 29.7 सेमी"), undefined);
});

test("the worksheet's own definition of L reads: 'point of suspension to centre of bob = 60 cm', in English and Hindi", () => {
  const m = (t: string, l?: string) => statedLength(t, l)?.metres;
  assert.equal(m("point of suspension to centre of bob = 60 cm"), 0.6, "'centre of bob' is an end of L, not a bob size");
  assert.equal(m("point of suspension to centre of bob: 60 cm"), 0.6);
  assert.equal(m("Measure L from the point of suspension to the centre of the bob = 60 cm"), 0.6);
  assert.equal(m("निलंबन बिंदु से गोलक के केंद्र तक = 60 cm"), 0.6, "the Hindi worksheet line, with =");
  assert.equal(m("निलंबन बिंदु से गोलक के केंद्र तक 60 cm"), 0.6, "and without");
  assert.equal(m("निलंबन बिंदु से गोलक के केंद्र तक 60 सेमी", "Hindi"), 0.6);
  assert.equal(m("centre of bob 60 cm"), 0.6);
  assert.equal(m("the bob hangs 45 cm below the pivot"), 0.45);
  assert.equal(m("from the pivot to the bob is 45 cm"), 0.45);
  // a definition never turns a size into the string
  assert.equal(m("bob diameter = 3 cm, string = 60 cm"), 0.6);
  assert.equal(m("bob = 3 cm"), undefined);
  assert.equal(m("the bob is 3 cm wide, string 60 cm"), 0.6);
});

test("fractions of a metre: half, quarter, three quarters, and a half", () => {
  const m = (t: string, l?: string) => statedLength(t, l)?.metres;
  assert.equal(m("half a metre string"), 0.5, "never 1 m");
  assert.equal(statedLength("half a metre string")?.said, "half a metre");
  assert.equal(m("the string is half a meter long"), 0.5);
  assert.equal(m("half metre"), 0.5);
  assert.equal(m("a quarter of a metre"), 0.25);
  assert.equal(m("three quarters of a metre"), 0.75);
  assert.equal(m("a metre and a half"), 1.5);
  assert.equal(m("one and a half metres"), 1.5);
  assert.equal(spokenLength("the string is a metre and a half", "English")?.metres, 1.5);
});

test("Hindi, Marathi and Bengali compounds and fraction words", () => {
  const m = (t: string, l?: string) => statedLength(t, l)?.metres;
  assert.equal(m("एक मीटर बीस सेंटीमीटर"), 1.2, "never 0.2");
  assert.equal(m("धागा एक मीटर बीस सेंटीमीटर", "Hindi"), 1.2);
  assert.equal(m("धागा एक मीटर बीस सेंटीमीटर का है"), 1.2);
  assert.equal(m("डेढ़ मीटर"), 1.5);
  assert.equal(m("\u0921\u0947\u0922\u093C \u092E\u0940\u091F\u0930"), 1.5, "the nukta as a separate mark");
  assert.equal(m("\u0921\u0947\u095D \u092E\u0940\u091F\u0930"), 1.5, "and as one precomposed letter");
  assert.equal(m("सवा मीटर"), 1.25);
  assert.equal(m("आधा मीटर"), 0.5);
  assert.equal(m("पौने दो मीटर"), 1.75);
  assert.equal(m("ढाई मीटर"), 2.5);
  assert.equal(m("साढ़े तीन मीटर"), 3.5);
  assert.equal(m("धागा डेढ़ मीटर लंबा है", "Hindi"), 1.5);
  assert.equal(m("दोरा दीड मीटर", "Marathi"), 1.5);
  assert.equal(m("सव्वा मीटर", "Marathi"), 1.25);
  assert.equal(m("अर्धा मीटर"), 0.5);
  assert.equal(m("সুতো দেড় মিটার", "Bengali"), 1.5);
  assert.equal(m("সোয়া মিটার"), 1.25);
  assert.equal(m("আধা মিটার"), 0.5);
  assert.equal(m("एक मीटर दो बार"), 1, "a single-digit number word after metres is not centimetres");
  assert.equal(m("one metre twenty"), 1.2);
});

test("feet and inches read as metres", () => {
  const m = (t: string, l?: string) => statedLength(t, l)?.metres;
  assert.equal(m("2 feet 3 inches"), 0.6858);
  assert.equal(m("27 inches"), 0.6858);
  assert.equal(m("the string is 27 in long"), 0.6858);
  assert.equal(m("2 ft"), 0.6096);
  assert.equal(m("two feet"), 0.6096);
  assert.equal(m("3'6\""), 1.0668);
  assert.equal(statedLength("3'6\"")?.said, "3'6\"");
  assert.equal(m("3′6″"), 1.0668);
  assert.equal(m("5’6”"), 1.6764, "phone keyboards' curly marks");
  assert.equal(m("3'6"), 1.0668);
  assert.equal(m("3 in the frame, string 60 cm"), 0.6, "'in' is a word, not inches, mid-phrase");
  assert.equal(m("the string is \"60\" long"), undefined, "a quoted number is not inches");
});

// The r17 adversarial-technical judge's sentences (fix 4: "18 of my 37 new sentences still read wrong"; the file quotes
// these). Each row: text, the run's type ("" = none given), the length in metres it must read (null = no length).
const R17: [string, string, number | null][] = [
  // read wrong before
  ["half a metre string", "pendulum", 0.5],
  ["a metre and a half of string", "pendulum", 1.5],
  ["string 1 m 20", "pendulum", 1.2],
  ["string is two hundred centimetres", "pendulum", 2],
  ["धागा साढ़े चार सौ मिलीमीटर", "pendulum", 0.45],
  ["hung from a height of 2 m, the string is 60 cm", "pendulum", 0.6],
  ["hung from a height of 2 m, the string is 60 cm", "", 0.6],
  ["My height is 1.7 m. The pendulum is 60 cm", "pendulum", 0.6],
  ["it hangs from a 2 m high stand; string 60 cm", "pendulum", 0.6],
  ["el péndulo cuelga a 2 m de altura y el hilo mide 60 cm", "pendulum", 0.6],
  ["ऊँचाई 2 मीटर, धागा 60 सेमी", "pendulum", 0.6],
  ["I stood 2 m away", "pendulum", null],
  ["I stood 2 m away", "", null],
  ["string 1,200 mm", "pendulum", 1.2],
  // read nothing before
  ["a 60-cm string", "pendulum", 0.6],
  ["60 cms string", "pendulum", 0.6],
  ["string 0.6 mtr", "pendulum", 0.6],
  ["string 60 c.m.", "pendulum", 0.6],
  ["डेढ़ मीटर का धागा", "pendulum", 1.5],
  ["आधा मीटर धागा", "pendulum", 0.5],
  ["medio metro de hilo", "pendulum", 0.5],
  ["un metro y medio de hilo", "pendulum", 1.5],
  ["the bob hangs 60 cm below the pivot", "pendulum", 0.6],
  // a height stays the length of a drop or a bounce
  ["dropped from a height of 2 m", "drop", 2],
  ["hung from a height of 2 m", "drop", 2],
  ["ऊँचाई 2 मीटर", "drop", 2],
  ["se soltó desde 2 m de altura", "bounce", 2],
  ["dropped from about one metre", "", 1],
  // hundreds in the other languages, and the old forms unchanged
  ["two hundred and fifty millimetres", "", 0.25],
  ["la cuerda mide ciento veinte centímetros", "", 1.2],
  ["doscientos centímetros de hilo", "", 2],
  ["धागा सौ सेंटीमीटर", "", 1],
  ["धागा डेढ़ सौ सेंटीमीटर", "", 1.5],
  ["string 1 m 20 swings", "", 1],
  ["0,6 metros", "", 0.6],
  ["string 0,600 m", "", 0.6],
];

test("the r17 judge's sentences read as a person meant them (table)", () => {
  for (const [text, type, want] of R17) {
    const got = statedLength(text, undefined, type || undefined)?.metres ?? null;
    assert.equal(got === null ? null : +got.toPrecision(10), want, `${JSON.stringify(text)} (${type || "no type"})`);
  }
});

test("lite mode passes its type: a pendulum's height is not L, a drop's is", () => {
  assert.deepEqual(liteStatedFacts("pendulum", { typed: "hung from a height of 2 m, the string is 60 cm" }).map((f) => [f.quantity, f.value, f.unit]), [["string length", 60, "cm"]]);
  assert.deepEqual(liteStatedFacts("drop", { typed: "dropped from a height of 2 m" }).map((f) => [f.quantity, f.value, f.unit]), [["drop height", 2, "m"]]);
  assert.deepEqual(liteStatedFacts("pendulum", { heard: "I stood 2 m away" }), []);
});

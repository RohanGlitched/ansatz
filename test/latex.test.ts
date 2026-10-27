import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import katex from "katex";
import { symbolLatex, toLatex } from "../lib/physics/expr";
import { lawLatex, paramLatex } from "../lib/latex";
import type { Law } from "../lib/physics/law";

test("latex: repeated factors collapse into powers", () => {
  assert.equal(toLatex("x*x"), "x^{2}");
  assert.equal(toLatex("x*x*x"), "x^{3}");
  assert.equal(toLatex("-omega*omega*(s - seq)"), "-\\omega^{2}\\,\\left(s - s_{\\mathrm{eq}}\\right)");
  assert.equal(toLatex("(s - seq)*(s - seq)*(s - seq)"), "\\left(s - s_{\\mathrm{eq}}\\right)^{3}");
  assert.equal(toLatex("x^2*x"), "x^{3}");
  assert.equal(toLatex("(theta - p)*80"), "80\\,\\left(\\theta - p\\right)");
  assert.equal(toLatex("-g/L*sin(theta)"), "-\\frac{g}{L}\\,\\sin\\left(\\theta\\right)");
  assert.equal(toLatex("a + -b"), "a - b");
  assert.equal(toLatex("a - -b*c"), "a + b\\,c");
  assert.equal(toLatex("-(a + b)"), "-\\left(a + b\\right)");
  assert.equal(toLatex("(-x)^2"), "\\left(-x\\right)^{2}");
});

test("latex: names render as textbook symbols", () => {
  const cases: Record<string, string> = {
    seq: "s_{\\mathrm{eq}}",
    s_eq: "s_{\\mathrm{eq}}",
    vsm: "v_{s}",
    cq: "c_{q}",
    Cq: "C_{q}",
    omega: "\\omega",
    omega0: "\\omega_{0}",
    w0: "\\omega_{0}",
    gamma: "\\gamma",
    theta: "\\theta",
    theta_pin: "\\theta_{\\mathrm{pin}}",
    y_floor: "y_{\\mathrm{floor}}",
    L_short: "L_{\\mathrm{short}}",
    ax: "a_{x}",
    g: "g",
  };
  for (const [name, want] of Object.entries(cases)) assert.equal(symbolLatex(name), want, name);
  assert.equal(paramLatex("cal"), "\\mathrm{cal}");
});

function laws(dir: string, out: { where: string; law: Law }[] = []) {
  const walk = (o: unknown, where: string) => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach((v) => walk(v, where));
    const l = o as Law;
    if (Array.isArray(l.state) && l.derivatives && Array.isArray(l.params)) out.push({ where, law: l });
    for (const v of Object.values(o)) walk(v, where);
  };
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    if (f.isDirectory()) laws(`${dir}/${f.name}`, out);
    else if (f.name.endsWith(".json")) walk(JSON.parse(readFileSync(`${dir}/${f.name}`, "utf8")), `${dir}/${f.name}`);
  }
  return out;
}

// a symbol (\dot{s}, \omega_{0}, x) or a bracketed group, then a thin space, then exactly the same thing again
const ATOM = String.raw`\\d?dot\{(?:[^{}]|\{[^{}]*\})*\}|\\?[A-Za-z]+(?:_\{(?:[^{}]|\{[^{}]*\})*\})?`;
const GROUP = String.raw`\\left\((?:(?!\\right\)).)*\\right\)`;
const REPEATED = new RegExp(String.raw`(?<![A-Za-z])(${ATOM}|${GROUP})\\,\1(?![A-Za-z_{^])`);

test("latex: the repeated-factor check catches the old output", () => {
  for (const bad of ["-\\omega\\,\\omega\\,s", "\\dot{s}\\,\\dot{s}", "\\left(s - s_{\\mathrm{eq}}\\right)\\,\\left(s - s_{\\mathrm{eq}}\\right)", "\\omega_{0}\\,\\omega_{0}"])
    assert.match(bad, REPEATED, bad);
  for (const ok of ["\\dot{\\theta}\\,\\left|\\dot{\\theta}\\right|", "\\omega^{2}\\,\\left(s - s_{\\mathrm{eq}}\\right)", "k\\,\\sqrt{x}\\,\\dot{x}"]) assert.doesNotMatch(ok, REPEATED, ok);
});

test("latex: every stored law renders cleanly", () => {
  const all = [...laws("data/showcase"), ...laws("data/bench")];
  assert.ok(all.length > 20);
  for (const { where, law } of all) {
    const tag = `${where} ${law.id}`;
    const lines = lawLatex(law);
    for (const l of lines) {
      assert.doesNotMatch(l, /\\mathit\{[A-Za-z]{3,}\}/, `${tag}: italic run-on in ${l}`);
      assert.doesNotMatch(l, /\\text\{\(unparseable\)\}/, `${tag}: ${l}`);
      // the same factor twice in a row should have been written as a power
      assert.doesNotMatch(l, REPEATED, `${tag}: repeated factor in ${l}`);
      assert.doesNotMatch(l, /(?<![A-Za-z\\])([a-z]) \1(?![A-Za-z])/, `${tag}: repeated factor in ${l}`);
      assert.doesNotThrow(() => katex.renderToString(l, { throwOnError: true }), `${tag}: KaTeX rejects ${l}`);
    }
    for (const p of law.params) assert.doesNotMatch(paramLatex(p.name), /\\mathit\{/, `${tag}: ${p.name}`);
  }
});

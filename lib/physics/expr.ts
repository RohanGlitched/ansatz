/**
 * A small, safe math language for the laws the model proposes. Muse writes equations of motion as strings
 * ("-g - k*vy*sqrt(vx^2+vy^2)"); this parses them into a tree and compiles a closure over a numeric scope.
 * Nothing is ever passed to eval: unknown names and functions are rejected at compile time, so a hypothesis
 * can only talk about its own state, parameters and time.
 */

export type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "^"; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

const FUNCS: Record<string, { n: number | [number, number]; f: (...x: number[]) => number }> = {
  sin: { n: 1, f: Math.sin },
  cos: { n: 1, f: Math.cos },
  tan: { n: 1, f: Math.tan },
  asin: { n: 1, f: Math.asin },
  acos: { n: 1, f: Math.acos },
  atan: { n: 1, f: Math.atan },
  atan2: { n: 2, f: Math.atan2 },
  sinh: { n: 1, f: Math.sinh },
  cosh: { n: 1, f: Math.cosh },
  tanh: { n: 1, f: Math.tanh },
  exp: { n: 1, f: Math.exp },
  log: { n: 1, f: Math.log },
  sqrt: { n: 1, f: Math.sqrt },
  abs: { n: 1, f: Math.abs },
  sign: { n: 1, f: Math.sign },
  min: { n: [2, 8], f: Math.min },
  max: { n: [2, 8], f: Math.max },
  pow: { n: 2, f: Math.pow },
  hypot: { n: [2, 4], f: Math.hypot },
};

const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export class ExprError extends Error {}

type Tok = { t: "num" | "id" | "op" | "(" | ")" | ","; v: string; at: number };

function lex(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new ExprError(`bad number at ${i}`);
      out.push({ t: "num", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    if (c === "*" && src[i + 1] === "*") { out.push({ t: "op", v: "^", at: i }); i += 2; continue; }
    if ("+-*/^".includes(c)) { out.push({ t: "op", v: c, at: i }); i++; continue; }
    if (c === "(" || c === ")" || c === ",") { out.push({ t: c, v: c, at: i }); i++; continue; }
    throw new ExprError(`unexpected "${c}" at ${i}`);
  }
  return out;
}

/** Precedence climbing: + - < * / < unary - < ^ (right associative), so -x^2 is -(x^2). */
export function parse(src: string): Node {
  if (src.length > 600) throw new ExprError("expression too long");
  const toks = lex(src);
  let p = 0;
  const peek = () => toks[p];
  const take = (t?: string, v?: string) => {
    const k = toks[p];
    if (!k || (t && k.t !== t) || (v && k.v !== v)) throw new ExprError(`expected ${v ?? t} at ${k?.at ?? src.length}`);
    p++;
    return k;
  };
  function expr(): Node {
    let a = term();
    while (peek()?.t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = take().v as "+" | "-";
      a = { k: "bin", op, a, b: term() };
    }
    return a;
  }
  function term(): Node {
    let a = unary();
    while (peek()?.t === "op" && (peek().v === "*" || peek().v === "/")) {
      const op = take().v as "*" | "/";
      a = { k: "bin", op, a, b: unary() };
    }
    return a;
  }
  function unary(): Node {
    if (peek()?.t === "op" && peek().v === "-") { take(); return { k: "neg", a: unary() }; }
    if (peek()?.t === "op" && peek().v === "+") { take(); return unary(); }
    return power();
  }
  function power(): Node {
    const base = atom();
    if (peek()?.t === "op" && peek().v === "^") { take(); return { k: "bin", op: "^", a: base, b: unary() }; }
    return base;
  }
  function atom(): Node {
    const k = peek();
    if (!k) throw new ExprError("unexpected end");
    if (k.t === "num") { take(); return { k: "num", v: Number(k.v) }; }
    if (k.t === "(") { take(); const e = expr(); take(")"); return e; }
    if (k.t === "id") {
      take();
      if (peek()?.t === "(") {
        take("(");
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          args.push(expr());
          while (peek()?.t === ",") { take(","); args.push(expr()); }
        }
        take(")");
        return { k: "call", fn: k.v, args };
      }
      return { k: "var", name: k.v };
    }
    throw new ExprError(`unexpected "${k.v}" at ${k.at}`);
  }
  const e = expr();
  if (p !== toks.length) throw new ExprError(`unexpected "${toks[p].v}" at ${toks[p].at}`);
  return e;
}

export function names(n: Node, out = new Set<string>()): Set<string> {
  if (n.k === "var") out.add(n.name);
  else if (n.k === "neg") names(n.a, out);
  else if (n.k === "bin") { names(n.a, out); names(n.b, out); }
  else if (n.k === "call") n.args.forEach((a) => names(a, out));
  return out;
}

export type Compiled = (scope: Float64Array) => number;

/**
 * Compiles against a fixed variable order: `vars[i]` is read from `scope[i]`. Unknown names throw, so the
 * caller decides exactly which symbols a law may use.
 */
export function compile(src: string, vars: string[]): Compiled {
  const tree = parse(src);
  const index = new Map(vars.map((v, i) => [v, i]));
  function build(n: Node): Compiled {
    switch (n.k) {
      case "num": { const v = n.v; return () => v; }
      case "var": {
        const i = index.get(n.name);
        if (i !== undefined) return (s) => s[i];
        if (Object.hasOwn(CONSTS, n.name)) { const v = CONSTS[n.name]; return () => v; }
        throw new ExprError(`unknown name "${n.name}"`);
      }
      case "neg": { const a = build(n.a); return (s) => -a(s); }
      case "bin": {
        const a = build(n.a), b = build(n.b);
        switch (n.op) {
          case "+": return (s) => a(s) + b(s);
          case "-": return (s) => a(s) - b(s);
          case "*": return (s) => a(s) * b(s);
          case "/": return (s) => a(s) / b(s);
          case "^": return (s) => Math.pow(a(s), b(s));
        }
      }
      // falls through (unreachable)
      case "call": {
        const spec = Object.hasOwn(FUNCS, n.fn) ? FUNCS[n.fn] : undefined;
        if (!spec) throw new ExprError(`unknown function "${n.fn}"`);
        const [lo, hi] = Array.isArray(spec.n) ? spec.n : [spec.n, spec.n];
        if (n.args.length < lo || n.args.length > hi) throw new ExprError(`${n.fn} takes ${lo === hi ? lo : `${lo}–${hi}`} arguments`);
        const args = n.args.map(build);
        const f = spec.f;
        if (args.length === 1) { const a0 = args[0]; return (s) => f(a0(s)); }
        if (args.length === 2) { const a0 = args[0], a1 = args[1]; return (s) => f(a0(s), a1(s)); }
        return (s) => f(...args.map((g) => g(s)));
      }
    }
  }
  return build(tree);
}

/** Renders a parsed expression as LaTeX for the report (dots become derivatives at the call site). */
export function toLatex(src: string, rename: Record<string, string> = {}): string {
  const tree = parse(src);
  // a fraction renders as \frac, which is already grouped, so it never needs parentheses; anything that comes out
  // with a leading minus binds like a negation
  const prec = (n: Node): number => {
    if (n.k === "neg" || (n.k === "bin" && n.op === "*")) return product(n).neg ? 3 : 2;
    if (n.k === "bin" && n.op === "/") return product(n.a).neg ? 3 : 5;
    return n.k === "bin" ? { "+": 1, "-": 1, "*": 2, "/": 5, "^": 4 }[n.op] : 5;
  };
  const sym = (name: string) => rename[name] ?? symbolLatex(name);
  // a chain of * and unary - read as one product: signs pulled out front, numbers merged into one coefficient,
  // repeated factors collapsed into powers (omega*omega -> omega^2, (s - seq)^2*(s - seq) -> (s - seq)^3)
  function product(n: Node): { neg: boolean; str: string } {
    let neg = false;
    let coef = 1;
    const groups = new Map<string, { base: Node; exp: number }>();
    const walk = (m: Node) => {
      if (m.k === "bin" && m.op === "*") { walk(m.a); walk(m.b); return; }
      if (m.k === "neg") { neg = !neg; walk(m.a); return; }
      if (m.k === "num") { if (m.v < 0) neg = !neg; coef *= Math.abs(m.v); return; }
      // a fraction with a negative top lends its sign to the whole product
      if (m.k === "bin" && m.op === "/" && product(m.a).neg) { neg = !neg; m = { ...m, a: { k: "neg", a: m.a } }; }
      const [base, exp] = m.k === "bin" && m.op === "^" && m.b.k === "num" ? [m.a, m.b.v] : [m, 1];
      const key = JSON.stringify(base);
      const g = groups.get(key);
      if (g) g.exp += exp;
      else groups.set(key, { base, exp });
    };
    walk(n);
    const parts = [...groups.values()].filter((g) => g.exp !== 0).map((g) => (g.exp === 1 ? wrap(g.base, 2) : `${wrap(g.base, 5)}^{${fmtNum(g.exp)}}`));
    if (coef !== 1 || !parts.length) parts.unshift(fmtNum(coef));
    return { neg: neg && coef !== 0, str: parts.join("\\,") };
  }
  function go(n: Node): string {
    switch (n.k) {
      case "num": return fmtNum(n.v);
      case "var": return sym(n.name);
      case "neg": {
        const p = product(n);
        return `${p.neg ? "-" : ""}${p.str}`;
      }
      case "call": {
        if (n.fn === "sqrt") return `\\sqrt{${go(n.args[0])}}`;
        if (n.fn === "abs") return `\\left|${go(n.args[0])}\\right|`;
        if (n.fn === "hypot") return `\\sqrt{${n.args.map((a) => `${wrap(a, 5)}^{2}`).join(" + ")}}`;
        const known = ["sin", "cos", "tan", "exp", "log", "sinh", "cosh", "tanh"].includes(n.fn);
        return `${known ? `\\${n.fn}` : `\\operatorname{${n.fn}}`}\\left(${n.args.map(go).join(", ")}\\right)`;
      }
      case "bin": {
        if (n.op === "/") {
          const top = product(n.a);
          return `${top.neg ? "-" : ""}\\frac{${top.str}}{${go(n.b)}}`;
        }
        if (n.op === "^") return `${wrap(n.a, 5)}^{${go(n.b)}}`;
        if (n.op === "*") {
          const p = product(n);
          return `${p.neg ? "-" : ""}${p.str}`;
        }
        // a + -b reads a - b, and a - -b reads a + b
        let op: string = n.op;
        let right = wrap(n.b, n.op === "-" ? 2 : 1);
        if (right.startsWith("-")) { op = op === "+" ? "-" : "+"; right = right.slice(1); }
        return `${go(n.a)} ${op} ${right}`;
      }
    }
  }
  function wrap(n: Node, min: number) {
    return prec(n) < min ? `\\left(${go(n)}\\right)` : go(n);
  }
  return go(tree);
}

const GREEK = new Set(["alpha", "beta", "gamma", "delta", "epsilon", "theta", "omega", "mu", "nu", "lambda", "phi", "zeta", "tau", "rho", "sigma", "kappa", "eta", "psi", "chi", "xi", "pi"]);

// names that mean something else than their letters suggest
const ALIAS: Record<string, string> = {
  w: "\\omega",
  w0: "\\omega_{0}",
  vsm: "v_{s}",
  pi: "\\pi",
};

// word subscripts a name may end with (seq -> s_eq, vmax -> v_max)
const SUFFIX = ["eq", "max", "min", "floor", "pin", "short", "long", "eff", "rel", "tot", "air"];

const sub = (s: string) => (/^\d+$/.test(s) || s.length === 1 ? s : `\\mathrm{${s}}`);
const head = (s: string) => (GREEK.has(s) ? `\\${s}` : s.length === 1 ? s : `\\mathrm{${s}}`);

/**
 * A parameter or state name as a textbook symbol: theta -> θ, omega0 -> ω₀, s_eq / seq -> s_eq, cq -> c_q. A longer name
 * that fits no pattern is set upright as a word, never as a run of italic letters that reads like a product.
 */
export function symbolLatex(name: string): string {
  if (Object.hasOwn(ALIAS, name)) return ALIAS[name];
  if (GREEK.has(name) || name.length === 1) return head(name);
  let m = /^([A-Za-z]+)_([A-Za-z0-9]+)$/.exec(name);
  if (m) return `${head(m[1])}_{${sub(m[2])}}`;
  m = /^([A-Za-z]+?)(\d+)$/.exec(name);
  if (m && (m[1].length === 1 || GREEK.has(m[1]))) return `${head(m[1])}_{${m[2]}}`;
  if (!/^[A-Za-z][A-Za-z0-9]*$/.test(name)) return `\\mathrm{${name.replace(/_/g, "\\_")}}`;
  // a Greek stem only claims a short name when what follows is clearly a subscript (gammaq, omegaeq; not pin)
  const greek = [...GREEK].find((g) => g.length > 2 && name.startsWith(g) && name.length > g.length);
  const rest = greek ? name.slice(greek.length) : "";
  if (greek && (rest.length === 1 || SUFFIX.includes(rest))) return `\\${greek}_{${sub(rest)}}`;
  if (name.length === 2) return `${name[0]}_{${name[1]}}`;
  const tail = name.slice(1);
  if (SUFFIX.includes(tail)) return `${name[0]}_{\\mathrm{${tail}}}`;
  return `\\mathrm{${name}}`;
}

function fmtNum(v: number) {
  if (Number.isInteger(v)) return String(v);
  return String(+v.toPrecision(4));
}

/**
 * Regions: sets of rationals written as betweenness chains on one variable.
 *
 *   2:x:8        2 ≤ x ≤ 8            _:x:8     x ≤ 8         2:x:_     x ≥ 2
 *   2:!x:8       2 < x ≤ 8            2:x:!8    2 ≤ x < 8     (`:!` is a strict link)
 *   2n:x:!2n+1   2n ≤ x < 2n+1 for some integer n
 *   _:x:!-1 || 1:!x:_                 a union of chains
 *
 * The middle of each chain is the variable. Bounds are exact rational
 * expressions (+ - * /, integer powers, parentheses, juxtaposition such as 2n)
 * of named parameters and at most one other name, which is an integer
 * variable; each bound must be affine in it. Unspaced and spaced colons read
 * the same here, since a bound is never an interval.
 *
 *   Region.parse("2n:x:!2n+1").match(R`5/2`)   // { n: 1 }
 *   R.region`${a}:!x:${b}`                     // interpolations are Core values
 */
import { Integer } from "./integer.js";
import { Rational } from "./rational.js";
import { RationalInterval } from "./rational-interval.js";
import { RationalIntervalSet } from "./rational-interval-set.js";
import { readLiteral, coreValue } from "./r-template.js";

const MAX_PIECES = 100000;
const ZERO = new Rational(0);
const NAME = /^[A-Za-z][A-Za-z0-9]*/;
const REGION_OPERATORS = ["||", "**", ":!", ":", "+", "-", "*", "/", "^", "(", ")"];

const fail = (message, Kind = SyntaxError) => {
  throw new Kind(`Region: ${message}`);
};

function exactRational(value) {
  if (value instanceof Rational) return value;
  if (value instanceof Integer) return value.toRational();
  return null;
}

function asPoint(value) {
  let v = value;
  if (!(v instanceof Rational || v instanceof Integer)) v = coreValue(v);
  const q = exactRational(v);
  if (!q) fail("a point must be an exact rational", TypeError);
  return q;
}

// ---- tokens -------------------------------------------------------------------

function tokenize(strings, values) {
  const tokens = [];
  strings.forEach((text, part) => {
    let index = 0;
    while (index < text.length) {
      const rest = text.slice(index);
      const space = rest.match(/^\s+/);
      if (space) { index += space[0].length; continue; }
      if (rest.startsWith("_:")) { tokens.push({ kind: "unbounded" }, { kind: "link", strict: false }); index += 2; continue; }
      if (rest.startsWith(":_")) { tokens.push({ kind: "link", strict: false }, { kind: "unbounded" }); index += 2; continue; }
      const name = rest.match(NAME);
      if (name) { tokens.push({ kind: "name", name: name[0] }); index += name[0].length; continue; }
      const literal = readLiteral(rest, null);
      if (literal) { tokens.push({ kind: "value", value: literal.value }); index += literal.text.length; continue; }
      const op = REGION_OPERATORS.find((candidate) => rest.startsWith(candidate));
      if (op === ":" || op === ":!") { tokens.push({ kind: "link", strict: op === ":!" }); index += op.length; continue; }
      if (op) { tokens.push({ kind: "op", value: op }); index += op.length; continue; }
      fail(`unexpected '${rest[0]}'`);
    }
    if (part < values.length) tokens.push({ kind: "value", value: coreValue(values[part]) });
  });
  return tokens;
}

// ---- bounds: a small exact grammar with names -----------------------------------

function parseRegionTokens(tokens) {
  let position = 0;
  const peek = () => tokens[position];
  const isOp = (value) => peek()?.kind === "op" && peek().value === value;
  const take = (value) => (isOp(value) ? tokens[position++] : null);

  function atom() {
    const token = tokens[position++];
    if (!token) fail("expression ended early");
    if (token.kind === "value") {
      const q = exactRational(token.value);
      if (!q) fail("bounds must be exact rationals (an interval or approximation cannot be a bound)", TypeError);
      return { type: "num", value: q };
    }
    if (token.kind === "name") return { type: "var", name: token.name };
    if (token.kind === "op" && token.value === "(") {
      const inner = sum();
      if (!take(")")) fail("missing ')'");
      return inner;
    }
    if (token.kind === "unbounded") fail("_ stands only at either end of a chain, as in _:x:8");
    return fail(`unexpected '${token.value ?? ":"}'`);
  }
  function power() {
    const base = atom();
    if (take("^") || take("**")) return { type: "op", op: "^", args: [base, unary()] };
    return base;
  }
  // 2n, 3(n+1): a name or '(' right after an operand multiplies, binding tighter than * and /.
  function juxtaposed() {
    let value = power();
    while (peek()?.kind === "name" || isOp("(")) value = { type: "op", op: "*", args: [value, power()] };
    return value;
  }
  function unary() {
    if (take("-")) return { type: "op", op: "neg", args: [unary()] };
    if (take("+")) return unary();
    return juxtaposed();
  }
  function product() {
    let value = unary();
    for (let t; (t = take("*") || take("/"));) value = { type: "op", op: t.value, args: [value, unary()] };
    return value;
  }
  function sum() {
    let value = product();
    for (let t; (t = take("+") || take("-"));) value = { type: "op", op: t.value, args: [value, product()] };
    return value;
  }
  function end() {
    if (peek()?.kind === "unbounded") { position++; return null; }
    return sum();
  }
  function link() {
    const token = tokens[position++];
    if (token?.kind !== "link") fail("each alternative should look like a:x:b (use _ for an unbounded side)");
    return token.strict;
  }
  function chain() {
    const lo = end();
    const loStrict = link();
    const middle = tokens[position++];
    if (middle?.kind !== "name") fail("the middle of a chain should be the variable, as in 2:x:8");
    const hiStrict = link();
    const hi = end();
    if (peek()?.kind === "link") fail("a region chain has exactly three parts, lo:x:hi");
    return { lo, hi, loStrict, hiStrict, variable: middle.name };
  }

  const alternatives = [chain()];
  while (take("||")) alternatives.push(chain());
  if (position < tokens.length) fail(`unexpected '${peek().value ?? peek().name ?? ":"}'`);
  return alternatives;
}

function freeNames(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.type === "var") out.add(ast.name);
  if (ast.type === "op") for (const a of ast.args) freeNames(a, out);
  return out;
}

function evaluate(ast, env) {
  switch (ast.type) {
    case "num":
      return ast.value;
    case "var": {
      const q = exactRational(env[ast.name]);
      if (!q) fail(`bound uses ${ast.name}, which has no exact rational value`, TypeError);
      return q;
    }
    default: {
      const [a, b] = ast.args.map((x) => evaluate(x, env));
      switch (ast.op) {
        case "+": return a.add(b);
        case "-": return a.subtract(b);
        case "*": return a.multiply(b);
        case "/":
          if (b.numerator === 0n) fail("a bound divides by 0", RangeError);
          return a.divide(b);
        case "neg": return a.negate();
        case "^":
          if (b.denominator !== 1n) fail("bounds take integer powers only", TypeError);
          return a.pow(b.numerator);
      }
    }
  }
  return fail("unknown bound");
}

/** A bound as c0 + c1·n in the integer variable (c1 = 0 without one). */
function affine(ast, params, integer) {
  if (!integer || !freeNames(ast).has(integer)) return { c0: evaluate(ast, params), c1: ZERO };
  const at = (k) => evaluate(ast, { ...params, [integer]: new Rational(BigInt(k)) });
  const c0 = at(0);
  const c1 = at(1).subtract(c0);
  for (const k of [2, -1, 3, -2]) {
    if (at(k).compareTo(c0.add(c1.multiply(new Rational(BigInt(k))))) !== 0) {
      fail(`a bound is not affine in ${integer}`, TypeError);
    }
  }
  return Object.freeze({ c0, c1 });
}

const isZero = (q) => q.numerator === 0n;
const sign = (q) => (q.numerator > 0n ? 1 : q.numerator < 0n ? -1 : 0);

function floorQ(v) {
  const a = v.numerator;
  const b = v.denominator;
  const f = a / b;
  return a < 0n && f * b !== a ? f - 1n : f;
}

// ---- matching -------------------------------------------------------------------

function matchChain(c, x) {
  const fixedOk = (A, strict, lower) => {
    const order = A.c0.compareTo(x) * (lower ? 1 : -1); // lower: c0 ≤ x ; upper: x ≤ c0
    return strict ? order < 0 : order <= 0;
  };
  if (c.L && isZero(c.L.c1) && !fixedOk(c.L, c.loStrict, true)) return null;
  if (c.U && isZero(c.U.c1) && !fixedOk(c.U, c.hiStrict, false)) return null;
  const varying = (c.L && !isZero(c.L.c1)) || (c.U && !isZero(c.U.c1));
  if (!varying) return { n: null };
  // Each varying bound limits n from one side: c0 + c1·n ≤ x, x ≤ c0 + c1·n.
  let nlo = null;
  let nhi = null;
  const tighten = (v, strict, upper) => {
    if (upper) {
      const order = nhi ? v.compareTo(nhi.v) : -1;
      if (order < 0 || (order === 0 && strict)) nhi = { v, strict };
    } else {
      const order = nlo ? v.compareTo(nlo.v) : 1;
      if (order > 0 || (order === 0 && strict)) nlo = { v, strict };
    }
  };
  if (c.L && !isZero(c.L.c1)) tighten(x.subtract(c.L.c0).divide(c.L.c1), c.loStrict, sign(c.L.c1) > 0);
  if (c.U && !isZero(c.U.c1)) tighten(x.subtract(c.U.c0).divide(c.U.c1), c.hiStrict, sign(c.U.c1) < 0);
  if (!nlo) {
    // unbounded below: report the largest fitting n
    const f = floorQ(nhi.v);
    const n = nhi.strict && new Rational(f).compareTo(nhi.v) === 0 ? f - 1n : f;
    return { n: Number(n) };
  }
  const f = floorQ(nlo.v);
  const onIt = new Rational(f).compareTo(nlo.v) === 0;
  const n = onIt && !nlo.strict ? f : f + 1n;
  if (nhi) {
    const order = new Rational(n).compareTo(nhi.v);
    if (nhi.strict ? order >= 0 : order > 0) return null;
  }
  return { n: Number(n) };
}

/** Integers n whose piece of chain c can meet [a, b]. */
function integerRange(c, a, b) {
  let lo = -Infinity;
  let hi = Infinity;
  const cut = (A, lowerEnd) => {
    // lower end: L(n) ≤ b ; upper end: U(n) ≥ a
    if (!A || isZero(A.c1)) return;
    const v = (lowerEnd ? b : a).subtract(A.c0).divide(A.c1);
    const floor = Number(floorQ(v));
    const ceil = Number(-floorQ(v.negate()));
    if (lowerEnd === sign(A.c1) > 0) hi = Math.min(hi, floor);
    else lo = Math.max(lo, ceil);
  };
  cut(c.L, true);
  cut(c.U, false);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    fail("this region has infinitely many pieces in the window; give both bounds in terms of the integer variable", RangeError);
  }
  if (hi - lo + 1 > MAX_PIECES) fail(`more than ${MAX_PIECES} pieces in the window`, RangeError);
  const out = [];
  for (let n = lo; n <= hi; n++) out.push(n);
  return out;
}

// ---- the class --------------------------------------------------------------------

export class Region {
  /**
   * Region.parse("2n:x:!2n+1 || 5:x:_", { variable: "x", params: { a: R`1/2` } }).
   * `variable` defaults to the middle name of the chains; `params` name exact
   * values used in bounds. Any other name is the integer variable.
   */
  static parse(text, options = {}) {
    return new Region([String(text)], [], options);
  }

  /** Region.from(text | Region, options) */
  static from(spec, options = {}) {
    return spec instanceof Region ? spec : Region.parse(spec, options);
  }

  constructor(strings, values = [], { variable, params = {} } = {}) {
    const chains = parseRegionTokens(tokenize(strings, values));
    this.variable = variable ?? chains[0].variable;
    for (const c of chains) {
      if (c.variable !== this.variable) fail(`the middle of every chain should be ${this.variable}, found ${c.variable}`);
    }
    // Exact inputs (bigint, safe integers, literal strings) become Core values;
    // anything else is kept and refused only if a bound uses it.
    const exactInput = (v) => typeof v === "bigint" || typeof v === "string" || (typeof v === "number" && Number.isSafeInteger(v));
    this.params = Object.freeze(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, exactInput(v) ? coreValue(v) : v])));
    const names = new Set();
    for (const c of chains) {
      for (const t of [c.lo, c.hi]) {
        for (const n of freeNames(t)) {
          if (n === this.variable) fail(`a bound cannot use the variable ${n}`);
          if (!(n in this.params)) names.add(n);
        }
      }
    }
    if (names.size > 1) fail(`at most one integer variable per region, found ${[...names].join(", ")}`);
    this.integer = names.size ? [...names][0] : null;
    this.alternatives = Object.freeze(chains.map((c) => Object.freeze({
      L: c.lo && affine(c.lo, this.params, this.integer),
      U: c.hi && affine(c.hi, this.params, this.integer),
      loStrict: c.lo ? c.loStrict : false,
      hiStrict: c.hi ? c.hiStrict : false,
    })));
    let text = strings[0];
    values.forEach((v, i) => (text += String(v) + strings[i + 1]));
    this.text = text.trim();
    Object.freeze(this);
  }

  /** { n } when x lies in the region (n is the integer variable's value, or null), else null. */
  match(x) {
    const q = asPoint(x);
    for (const c of this.alternatives) {
      const m = matchChain(c, q);
      if (m) return m;
    }
    return null;
  }

  contains(x) {
    return this.match(x) !== null;
  }

  test(x) {
    return this.contains(x);
  }

  /** Concrete pieces meeting [a, b]: { lo, hi, loStrict, hiStrict, n }, with null for an unbounded end. */
  intervals(a, b) {
    a = asPoint(a);
    b = asPoint(b);
    const out = [];
    for (const c of this.alternatives) {
      const ns = this.integer ? integerRange(c, a, b) : [null];
      for (const n of ns) {
        const N = n === null ? ZERO : new Rational(BigInt(n));
        const lo = c.L ? c.L.c0.add(c.L.c1.multiply(N)) : null;
        const hi = c.U ? c.U.c0.add(c.U.c1.multiply(N)) : null;
        if (lo && hi && lo.compareTo(hi) > 0) continue;
        if (lo && lo.compareTo(b) > 0) continue;
        if (hi && hi.compareTo(a) < 0) continue;
        out.push({ lo, hi, loStrict: c.loStrict, hiStrict: c.hiStrict, n });
      }
    }
    return out;
  }

  /** Every finite endpoint of the region's pieces inside [a, b]. */
  breakpoints(a, b) {
    a = asPoint(a);
    b = asPoint(b);
    const points = [];
    for (const r of this.intervals(a, b)) {
      for (const p of [r.lo, r.hi]) if (p && p.compareTo(a) >= 0 && p.compareTo(b) <= 0) points.push(p);
    }
    return points;
  }

  /** The region inside the closed window [a, b], as a RationalIntervalSet. */
  within(a, b) {
    a = asPoint(a);
    b = asPoint(b);
    const pieces = this.intervals(a, b).map((r) => ({
      low: r.lo, high: r.hi, lowClosed: r.lo !== null && !r.loStrict, highClosed: r.hi !== null && !r.hiStrict,
    }));
    return new RationalIntervalSet(pieces).intersection(new RationalIntervalSet([new RationalInterval(a, b)]));
  }

  toString() {
    return this.text;
  }
}

/** R.region`2n:x:!2n+1` — a Region from a template; interpolations are exact values. */
export function region(strings, ...values) {
  return new Region([...strings], values);
}

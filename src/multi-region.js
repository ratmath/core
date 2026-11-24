/**
 * MultiRegion: betweenness chains on several variables, joined with && (and)
 * and || (or).
 *
 *   0:x:1 && 0:y:x                    the triangle under y = x
 *   n:x:!n+1 && m:y:!m+1              unit squares, with integers n and m
 *   0:x:_ && 0:y:_ && _:x+y:4         (not allowed: a middle is one variable)
 *   0:x:_ && 0:y:4-x                  a feasible region, as in linear programming
 *
 * Every bound is affine (degree one) in the variables, the parameters and
 * the integers, so the region is a finite union of convex polytopes and all
 * the work is exact rational arithmetic. Bounds may use any variable, in any
 * order: `0:x:y && 0:y:1` is the same triangle as `0:x:1 && x:y:1`, and
 * `cells` rewrites it in the declared variable order (Fourier–Motzkin
 * elimination). Curved bounds such as `x^2` are refused; those belong to
 * @ratmath/analytic and @ratmath/algebraic.
 *
 * Each integer is pinned by a chain: a chain may use at most one integer that
 * no earlier chain has pinned, and match() finds it the way the one-variable
 * Region does (the least integer that fits).
 *
 *   const T = Region.parse("0:x:1 && 0:y:x", { variables: ["x", "y"] });
 *   T.contains([R`1/2`, R`1/4`])          // true
 *   T.cells()                              // one cell; vertices (0,0) (1,0) (1,1); area 1/2
 */
import { Rational } from "./rational.js";
import { RationalInterval } from "./rational-interval.js";
import { RationalIntervalSet } from "./rational-interval-set.js";
import { coreValue } from "./r-template.js";
import {
  fail, exactRational, tokenize, parseRegionTokens, freeNames, evaluate, affine, matchChain, floorQ, safeN,
} from "./region.js";

const ZERO = new Rational(0);
const ONE = new Rational(1);
const MAX_CELLS = 100000;
const PRUNE_LIMIT = 60;

const q = (n) => new Rational(BigInt(n));
const isZero = (x) => x.numerator === 0n;
const sign = (x) => (x.numerator > 0n ? 1 : x.numerator < 0n ? -1 : 0);
const ceilQ = (v) => -floorQ(v.negate());

function point(value, what) {
  let v = value;
  if (!(v instanceof Rational)) v = coreValue(v);
  const r = exactRational(v);
  if (!r) fail(`${what} must be an exact rational`, TypeError);
  return r;
}

// ---- linear forms ----------------------------------------------------------------
// A constraint over names z (variables, then integers) is  a·z + c ≥ 0,  or > 0 when strict.

/** The bound as coefficients over `names` plus a constant; refuses anything not affine. */
function linearForm(ast, names, params) {
  const at = (assign) => {
    const env = { ...params };
    names.forEach((name, i) => (env[name] = assign[i] ?? ZERO));
    try {
      return evaluate(ast, env);
    } catch (error) {
      if (error instanceof RangeError) fail(`a bound is not affine (degree one) in ${names.filter((n) => freeNames(ast).has(n)).join(", ")}; curved regions belong to @ratmath/analytic`, TypeError);
      throw error;
    }
  };
  const used = freeNames(ast);
  const unit = (i, k = ONE) => names.map((_, j) => (j === i ? k : ZERO));
  const c = at([]);
  const a = names.map((name, i) => (used.has(name) ? at(unit(i)).subtract(c) : ZERO));
  const value = (z) => z.reduce((s, zi, i) => s.add(a[i].multiply(zi)), c);
  const check = (z) => {
    if (at(z).compareTo(value(z)) !== 0) {
      fail(`a bound is not affine (degree one) in ${names.filter((n) => used.has(n)).join(", ")}; curved regions belong to @ratmath/analytic`, TypeError);
    }
  };
  const active = names.map((_, i) => i).filter((i) => used.has(names[i]));
  for (const i of active) {
    check(unit(i, q(2)));
    check(unit(i, q(-3)));
    for (const j of active) if (j > i) check(names.map((_, k) => (k === i ? q(2) : k === j ? q(-5) : ZERO)));
  }
  return { a, c };
}

const constraint = (a, c, strict) => ({ a, c, strict });

/** Scale so the first nonzero coefficient is ±1, which makes duplicates equal. */
function normalize(k) {
  const lead = k.a.find((x) => !isZero(x));
  if (!lead) return k;
  const s = lead.numerator < 0n ? lead.negate() : lead;
  return constraint(k.a.map((x) => x.divide(s)), k.c.divide(s), k.strict);
}

const sameShape = (k, l) => k.c.compareTo(l.c) === 0 && k.a.every((x, i) => x.compareTo(l.a[i]) === 0);

/** Drop always-true constant constraints and duplicates; null when a constant one fails. */
function tidy(list) {
  const out = [];
  for (const raw of list) {
    const k = normalize(raw);
    if (k.a.every(isZero)) {
      const s = sign(k.c);
      if (s < 0 || (s === 0 && k.strict)) return null;
      continue;
    }
    const twin = out.findIndex((l) => sameShape(k, l));
    if (twin < 0) out.push(k);
    else if (k.strict) out[twin] = k;
  }
  return out;
}

/** Fourier–Motzkin: the constraints with coordinate i eliminated (null if infeasible). */
function eliminate(list, i) {
  const keep = [];
  const lower = [];
  const upper = [];
  for (const k of list) {
    const s = sign(k.a[i]);
    if (s === 0) keep.push(k);
    else (s > 0 ? lower : upper).push(k);
  }
  for (const p of lower) {
    for (const m of upper) {
      const sp = m.a[i].negate();
      const sm = p.a[i];
      keep.push(constraint(p.a.map((x, j) => (j === i ? ZERO : x.multiply(sp).add(m.a[j].multiply(sm)))), p.c.multiply(sp).add(m.c.multiply(sm)), p.strict || m.strict));
    }
  }
  return tidy(keep);
}

/** Whether some real point satisfies every constraint. */
function feasible(list, width) {
  let current = tidy(list);
  for (let i = 0; i < width && current; i++) current = eliminate(current, i);
  return current !== null;
}

/** Remove constraints that the others imply. */
function prune(list, width) {
  let current = tidy(list);
  if (!current || current.length > PRUNE_LIMIT) return current;
  for (let i = current.length - 1; i >= 0; i--) {
    const k = current[i];
    const others = current.filter((_, j) => j !== i);
    const negation = constraint(k.a.map((x) => x.negate()), k.c.negate(), !k.strict);
    if (!feasible([...others, negation], width)) current = others;
  }
  return current;
}

/** Fix coordinate i at value v. */
const substitute = (list, i, v) => list.map((k) => constraint(k.a.map((x, j) => (j === i ? ZERO : x)), k.c.add(k.a[i].multiply(v)), k.strict));

/** The range of coordinate i over the constraints (others eliminated): { lo, hi, loStrict, hiStrict }, null ends unbounded. */
function range(list, i, width) {
  let current = tidy(list);
  for (let j = 0; j < width && current; j++) if (j !== i) current = eliminate(current, j);
  if (!current) return null;
  let lo = null;
  let hi = null;
  for (const k of current) {
    const v = k.c.negate().divide(k.a[i]);
    if (sign(k.a[i]) > 0) {
      const order = lo ? v.compareTo(lo.v) : 1;
      if (order > 0 || (order === 0 && k.strict)) lo = { v, strict: k.strict };
    } else {
      const order = hi ? v.compareTo(hi.v) : -1;
      if (order < 0 || (order === 0 && k.strict)) hi = { v, strict: k.strict };
    }
  }
  return { lo: lo?.v ?? null, hi: hi?.v ?? null, loStrict: lo?.strict ?? false, hiStrict: hi?.strict ?? false };
}

// ---- exact geometry of a bounded cell ----------------------------------------------

/** Solve the square system M z = b exactly; null when singular. */
function solve(M, b) {
  const n = b.length;
  const A = M.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    const pivot = A.findIndex((row, r) => r >= col && !isZero(row[col]));
    if (pivot < 0) return null;
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < n; r++) {
      if (r === col || isZero(A[r][col])) continue;
      const f = A[r][col].divide(A[col][col]);
      A[r] = A[r].map((x, j) => x.subtract(f.multiply(A[col][j])));
    }
  }
  return A.map((row, i) => row[n].divide(row[i]));
}

function* choose(n, k, start = 0, prefix = []) {
  if (prefix.length === k) { yield prefix; return; }
  for (let i = start; i < n; i++) yield* choose(n, k, i + 1, [...prefix, i]);
}

const holds = (k, z, closed) => {
  const s = sign(k.a.reduce((acc, x, i) => acc.add(x.multiply(z[i])), k.c));
  return s > 0 || (s === 0 && (closed || !k.strict));
};

/** Corners of a bounded polytope (its closure), each with `included` when it is in the cell. */
function vertices(list, d) {
  const out = [];
  for (const pick of choose(list.length, d)) {
    const z = solve(pick.map((i) => list[i].a.slice(0, d)), pick.map((i) => list[i].c.negate()));
    if (!z || !list.every((k) => holds(k, z, true))) continue;
    if (out.some((v) => v.point.every((x, i) => x.compareTo(z[i]) === 0))) continue;
    out.push({ point: z, included: list.every((k) => holds(k, z, false)) });
  }
  return out;
}

/** Counter-clockwise order around the centroid, compared exactly. */
function orderPolygon(corners) {
  if (corners.length < 3) return corners;
  const n = q(corners.length);
  const cx = corners.reduce((s, v) => s.add(v.point[0]), ZERO).divide(n);
  const cy = corners.reduce((s, v) => s.add(v.point[1]), ZERO).divide(n);
  const half = ([dx, dy]) => (sign(dy) > 0 || (sign(dy) === 0 && sign(dx) > 0) ? 0 : 1);
  const rel = (v) => [v.point[0].subtract(cx), v.point[1].subtract(cy)];
  return [...corners].sort((u, v) => {
    const a = rel(u);
    const b = rel(v);
    const h = half(a) - half(b);
    if (h) return h;
    return -sign(a[0].multiply(b[1]).subtract(a[1].multiply(b[0])));
  });
}

function shoelace(points) {
  let twice = ZERO;
  points.forEach((p, i) => {
    const r = points[(i + 1) % points.length];
    twice = twice.add(p[0].multiply(r[1]).subtract(r[0].multiply(p[1])));
  });
  const area = twice.divide(q(2));
  return sign(area) < 0 ? area.negate() : area;
}

/** Bounds of each variable in order: variable k's bounds are affine in variables 0..k-1. */
function cylinder(list, d, variables) {
  const levels = [];
  let current = list;
  for (let k = d - 1; k >= 0; k--) {
    const here = prune(current, k + 1) ?? [];
    const lower = [];
    const upper = [];
    for (const c of here) {
      if (isZero(c.a[k])) continue;
      // a_k z_k + rest ≥ 0  →  z_k ≥ −rest / a_k  (or ≤ when a_k < 0)
      const scale = c.a[k].negate();
      const bound = Object.freeze({
        coefficients: Object.freeze(c.a.slice(0, k).map((x) => x.divide(scale))),
        constant: c.c.divide(scale),
        strict: c.strict,
      });
      (sign(c.a[k]) > 0 ? lower : upper).push(bound);
    }
    levels[k] = Object.freeze({ variable: variables[k], lower: Object.freeze(lower), upper: Object.freeze(upper) });
    current = eliminate(here, k) ?? [];
  }
  return Object.freeze(levels);
}

// ---- the class ----------------------------------------------------------------------

export class MultiRegion {
  /**
   * MultiRegion.parse("0:x:1 && 0:y:x", { variables: ["x", "y"], params: { a: R`1/2` } }).
   * `variables` fixes their order (the order of points, cells and bounds);
   * without it the chain middles count, in order of first appearance.
   * Names that are neither variables nor params are integers.
   */
  static parse(text, options = {}) {
    return new MultiRegion([String(text)], [], options);
  }

  constructor(strings, values = [], { variables, params = {} } = {}) {
    const conjunctions = parseRegionTokens(tokenize(strings, values));
    const middles = [...new Set(conjunctions.flat().map((c) => c.variable))];
    this.variables = Object.freeze(variables ? [...variables].map(String) : middles);
    if (new Set(this.variables).size !== this.variables.length) fail("variables must be distinct");
    for (const m of middles) {
      if (!this.variables.includes(m)) fail(`the middle of a chain should be one of ${this.variables.join(", ")}, found ${m}`);
    }
    const exactInput = (v) => typeof v === "bigint" || typeof v === "string" || (typeof v === "number" && Number.isSafeInteger(v));
    this.params = Object.freeze(Object.fromEntries(Object.entries(params).map(([k, v]) => [k, exactInput(v) ? coreValue(v) : v])));
    for (const v of this.variables) if (v in this.params) fail(`${v} is both a variable and a parameter`);

    const integers = [];
    for (const c of conjunctions.flat()) {
      for (const t of [c.lo, c.hi]) {
        for (const n of freeNames(t)) {
          if (!this.variables.includes(n) && !(n in this.params) && !integers.includes(n)) integers.push(n);
        }
      }
    }
    this.integers = Object.freeze(integers);
    const names = [...this.variables, ...integers];
    const d = this.variables.length;

    this.alternatives = Object.freeze(conjunctions.map((chains, index) => {
      // Pin integers in chain order: each chain may introduce at most one.
      const pinned = [];
      const order = [];
      const pending = chains.map((c, i) => ({ c, i }));
      while (pending.length) {
        const at = pending.findIndex(({ c }) => {
          const fresh = [...freeNames(c.lo), ...freeNames(c.hi)].filter((n) => integers.includes(n) && !pinned.includes(n));
          return new Set(fresh).size <= 1;
        });
        if (at < 0) fail(`each chain may bring in at most one integer that no other chain pins (alternative ${index + 1})`);
        const [{ c, i }] = pending.splice(at, 1);
        const fresh = [...new Set([...freeNames(c.lo), ...freeNames(c.hi)].filter((n) => integers.includes(n) && !pinned.includes(n)))];
        pinned.push(...fresh);
        order.push({ chain: i, integer: fresh[0] ?? null });
      }
      const constraints = [];
      const vIndex = (name) => names.indexOf(name);
      for (const c of chains) {
        const v = vIndex(c.variable);
        if (c.lo) {
          const { a, c: c0 } = linearForm(c.lo, names, this.params);
          if (!isZero(a[v])) fail(`a bound of ${c.variable} cannot use ${c.variable} itself`);
          // v − lo ≥ 0
          constraints.push(constraint(a.map((x, j) => (j === v ? ONE : x.negate())), c0.negate(), c.loStrict));
        }
        if (c.hi) {
          const { a, c: c0 } = linearForm(c.hi, names, this.params);
          if (!isZero(a[v])) fail(`a bound of ${c.variable} cannot use ${c.variable} itself`);
          // hi − v ≥ 0
          constraints.push(constraint(a.map((x, j) => (j === v ? x.subtract(ONE) : x)), c0, c.hiStrict));
        }
      }
      return Object.freeze({
        chains: Object.freeze(chains),
        order: Object.freeze(order),
        integers: Object.freeze(pinned),
        constraints: Object.freeze(constraints),
      });
    }));
    this.dimension = d;
    let text = strings[0];
    values.forEach((v, i) => (text += String(v) + strings[i + 1]));
    this.text = text.trim();
    Object.freeze(this);
  }

  /** A point as an array in variable order, or an object { x, y }. */
  #point(p) {
    if (Array.isArray(p)) {
      if (p.length !== this.dimension) fail(`a point needs ${this.dimension} coordinates (${this.variables.join(", ")})`, TypeError);
      return p.map((v, i) => point(v, this.variables[i]));
    }
    if (p && typeof p === "object") return this.variables.map((v) => point(p[v], v));
    fail("a point is an array or an object of exact rationals", TypeError);
  }

  /** The integers' values ({ n: 1 }, or {} without integers) when the point lies in the region, else null. */
  match(p) {
    const z = this.#point(p);
    const env = { ...this.params };
    this.variables.forEach((v, i) => (env[v] = z[i]));
    for (const alt of this.alternatives) {
      const found = {};
      const scope = { ...env };
      let ok = true;
      for (const { chain: index, integer } of alt.order) {
        const c = alt.chains[index];
        const piece = {
          L: c.lo && affine(c.lo, scope, integer),
          U: c.hi && affine(c.hi, scope, integer),
          loStrict: c.lo ? c.loStrict : false,
          hiStrict: c.hi ? c.hiStrict : false,
        };
        const m = matchChain(piece, scope[c.variable]);
        if (!m) { ok = false; break; }
        if (integer) {
          found[integer] = m.n;
          scope[integer] = q(m.n);
        }
      }
      if (ok) return found;
    }
    return null;
  }

  contains(p) {
    return this.match(p) !== null;
  }

  test(p) {
    return this.contains(p);
  }

  /** A box as { x: [a, b], ... } or [[a, b], ...] in variable order (RationalIntervals work too). */
  #box(box) {
    if (box === undefined) return this.variables.map(() => null);
    const side = (v, name) => {
      if (v === null || v === undefined) return null;
      if (v instanceof RationalInterval) return [v.low, v.high];
      if (Array.isArray(v) && v.length === 2) {
        const [a, b] = v.map((x) => point(x, `the ${name} side of the box`));
        if (a.compareTo(b) > 0) fail(`the ${name} side of the box has its ends reversed`, RangeError);
        return [a, b];
      }
      return fail(`the ${name} side of the box should be [a, b]`, TypeError);
    };
    if (Array.isArray(box)) return this.variables.map((v, i) => side(box[i], v));
    return this.variables.map((v) => side(box[v], v));
  }

  /**
   * The convex pieces of the region inside the closed box: for each, the
   * alternative it came from, its integers, its constraints in variable
   * order (`bounds`), its corners, its bounding box, and its length, area or
   * (in higher dimensions) null as `measure`. Pieces of different
   * alternatives may overlap. Without a box the region must be bounded.
   */
  cells(box) {
    const sides = this.#box(box);
    const d = this.dimension;
    const out = [];
    this.alternatives.forEach((alt, index) => {
      const width = d + this.integers.length;
      const boxConstraints = [];
      sides.forEach((s, i) => {
        if (!s) return;
        const unit = (k) => Array.from({ length: width }, (_, j) => (j === i ? k : ZERO));
        boxConstraints.push(constraint(unit(ONE), s[0].negate(), false), constraint(unit(ONE.negate()), s[1], false));
      });
      let start = [...alt.constraints, ...boxConstraints];
      // integers this alternative does not use are fixed at 0
      this.integers.forEach((n, j) => {
        if (!alt.integers.includes(n)) start = substitute(start, d + j, ZERO);
      });
      const walk = (list, depth, values) => {
        if (depth === alt.integers.length) {
          const cell = this.#cell(list, index, values);
          if (cell) {
            out.push(cell);
            if (out.length > MAX_CELLS) fail(`more than ${MAX_CELLS} cells in the box`, RangeError);
          }
          return;
        }
        const name = alt.integers[depth];
        const i = d + this.integers.indexOf(name);
        const r = range(list, i, width);
        if (!r) return;
        if (r.lo === null || r.hi === null) {
          fail(`${name} takes infinitely many values here; give a bounded box or bound ${name} on both sides`, RangeError);
        }
        const first = r.loStrict && r.lo.denominator === 1n ? r.lo.numerator + 1n : ceilQ(r.lo);
        const last = r.hiStrict && r.hi.denominator === 1n ? r.hi.numerator - 1n : floorQ(r.hi);
        if (last - first + 1n > BigInt(MAX_CELLS)) fail(`${name} takes more than ${MAX_CELLS} values in the box`, RangeError);
        for (let n = first; n <= last; n++) walk(substitute(list, i, q(n)), depth + 1, { ...values, [name]: safeN(n) });
      };
      walk(start, 0, {});
    });
    return out;
  }

  #cell(list, alternative, integers) {
    const d = this.dimension;
    const own = list.map((k) => constraint(k.a.slice(0, d), k.c, k.strict));
    if (!feasible(own, d)) return null;
    const constraints = prune(own, d);
    if (!constraints) return null;
    for (let i = 0; i < d; i++) {
      const r = range(constraints, i, d);
      if (!r || r.lo === null || r.hi === null) {
        fail(`the region is unbounded in ${this.variables[i]}; pass a box such as { ${this.variables[i]}: [-10, 10] }`, RangeError);
      }
    }
    let corners = vertices(constraints, d);
    if (d === 2) corners = orderPolygon(corners);
    const box = this.variables.map((_, i) => {
      const xs = corners.map((v) => v.point[i]);
      const lo = xs.reduce((m, x) => (x.compareTo(m) < 0 ? x : m));
      const hi = xs.reduce((m, x) => (x.compareTo(m) > 0 ? x : m));
      return Object.freeze([lo, hi]);
    });
    const measure = d === 1 ? box[0][1].subtract(box[0][0])
      : d === 2 ? (corners.length < 3 ? ZERO : shoelace(corners.map((v) => v.point)))
        : null;
    return Object.freeze({
      alternative,
      integers: Object.freeze(integers),
      constraints: Object.freeze(constraints.map((k) => Object.freeze({ coefficients: Object.freeze(k.a), constant: k.c, strict: k.strict }))),
      bounds: cylinder(constraints, d, this.variables),
      vertices: Object.freeze(corners.map((v) => Object.freeze({ point: Object.freeze(v.point), included: v.included }))),
      box: Object.freeze(box),
      measure,
    });
  }

  /**
   * The set of one free variable when the others are fixed, inside the
   * window [a, b] for it: section({ x: R`1/2` }, [0, 1]) gives the y values.
   */
  section(fixed, window) {
    const free = this.variables.filter((v) => !(v in fixed));
    if (free.length !== 1) fail(`section fixes all variables but one (${this.variables.join(", ")})`, TypeError);
    const [f] = free;
    const sides = {};
    for (const v of this.variables) {
      if (v === f) sides[v] = window;
      else {
        const x = point(fixed[v], v);
        sides[v] = [x, x];
      }
    }
    if (!window) fail(`section needs a window [a, b] for ${f}`, TypeError);
    const i = this.variables.indexOf(f);
    const pieces = this.cells(sides).map((cell) => {
      const r = range(cell.constraints.map((k) => constraint(k.coefficients, k.constant, k.strict)), i, this.dimension);
      return { low: r.lo, high: r.hi, lowClosed: !r.loStrict, highClosed: !r.hiStrict };
    });
    const [a, b] = this.#box({ [f]: window })[i];
    return new RationalIntervalSet(pieces).intersection(new RationalIntervalSet([new RationalInterval(a, b)]));
  }

  /** Distinct coordinates of cell corners along one variable, ascending: where pieces start, end or turn. */
  breakpoints(variable, box) {
    const i = this.variables.indexOf(String(variable));
    if (i < 0) fail(`${variable} is not one of ${this.variables.join(", ")}`, TypeError);
    const points = this.cells(box).flatMap((cell) => cell.vertices.map((v) => v.point[i]));
    points.sort((p, r) => p.compareTo(r));
    return points.filter((p, k) => k === 0 || p.compareTo(points[k - 1]) !== 0);
  }

  toString() {
    return this.text;
  }
}

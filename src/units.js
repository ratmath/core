// Physical units and quantities with exact conversions.
//
//   import { Q, units } from "@ratmath/core/units";
//   Q("9.8 m/s^2").multiply(Q(3, "kg")).to("N");   // 147/5 N
//   Q(1, "mi").to("km");                            // 25146/15625 km, exactly
//   Q("20 degC").to("degF");                        // 68 degF
//
// Every unit is a rational multiple of a product of base units, times an
// integer power of pi (so degrees, turns and parsecs stay exact without a
// symbolic pi). A Quantity keeps its magnitude in the unit it was written in,
// so nothing is rounded until a conversion asks for it, and a conversion
// multiplies by an exact factor: interval magnitudes never widen except
// through the interval arithmetic itself.
//
// Temperatures follow the affine rules: degC and degF are points (offset
// scales), deltaK / deltaDegC / deltaDegF are differences, and K is an
// absolute scale that may be read as either. Point minus point is a
// difference, point plus difference is a point, point plus point throws.
//
// The magnitude arithmetic is pluggable (`UnitSystem#extend({ scalars })`), so
// RiX can pass its own exact values (symbolic pi, algebraic numbers) while the
// unit bookkeeping stays here.

import { Integer } from "./integer.js";
import { Rational } from "./rational.js";
import { RationalInterval } from "./rational-interval.js";
import { TypePromotion } from "./type-promotion.js";
import { CertifiedApproximation, Relation, possibleRelations } from "./certified-approximation.js";
import { parseNumber } from "./number-parser.js";

/** The base dimensions, in the order coherent units are written. */
export const BASE_DIMENSIONS = Object.freeze([
  "Mass", "Length", "Time", "Current", "Temperature", "Amount", "Luminosity", "Angle", "Information", "Money",
]);

const BASE_SYMBOLS = Object.freeze({
  Mass: "kg", Length: "m", Time: "s", Current: "A", Temperature: "K",
  Amount: "mol", Luminosity: "cd", Angle: "rad", Information: "bit", Money: "USD",
});

const ZERO = new Integer(0n);
const ONE = new Integer(1n);

// ---------------------------------------------------------------------------
// Exact rationals and scalars

function exactRational(value, label = "value") {
  if (value instanceof Integer || value instanceof Rational) return normalize(value);
  if (typeof value === "bigint") return new Integer(value);
  if (typeof value === "number" && Number.isSafeInteger(value)) return new Integer(BigInt(value));
  if (typeof value === "string") {
    const parsed = parseScalarText(value);
    if (parsed instanceof Integer || parsed instanceof Rational) return normalize(parsed);
  }
  throw new TypeError(`${label} must be an exact rational`);
}

function normalize(value) {
  return value instanceof Rational && value.denominator === 1n ? new Integer(value.numerator) : value;
}

const DECIMAL_E = /^([-+]?)(\d*)(?:\.(\d*))?[eE]([-+]?\d+)$/;

// Core literals, plus decimal E notation ("1.602176634E-19") for catalogues.
function parseScalarText(text) {
  const source = String(text).trim();
  const match = DECIMAL_E.exec(source);
  if (match && (match[2] || match[3])) {
    const [, sign, whole, part = "", exponent] = match;
    let numerator = BigInt((whole || "0") + part);
    if (sign === "-") numerator = -numerator;
    const shift = BigInt(exponent) - BigInt(part.length);
    return normalize(shift >= 0n
      ? new Integer(numerator * 10n ** shift)
      : new Rational(numerator, 10n ** -shift));
  }
  return parseNumber(source);
}

function isCoreScalar(value) {
  return value instanceof Integer || value instanceof Rational ||
    value instanceof RationalInterval || value instanceof CertifiedApproximation;
}

// pi lies in [PI_LOW, PI_HIGH]; the default scalars use this enclosure when a
// conversion needs a power of pi as a number (radians to degrees, say).
const PI_LOW = new Rational("3.14159265358979323846264338327950288");
const PI_HIGH = new Rational("3.14159265358979323846264338327950289");
const PI_ENCLOSURE = new RationalInterval(PI_LOW, PI_HIGH);
const piPowers = new Map();

/**
 * The default magnitude arithmetic: Core numbers through TypePromotion.
 * Replace it with `units.extend({ scalars })`; every function is required.
 */
export const coreScalars = Object.freeze({
  isScalar: isCoreScalar,
  from(value) {
    if (isCoreScalar(value)) return value;
    if (typeof value === "bigint") return new Integer(value);
    if (typeof value === "number" && Number.isSafeInteger(value)) return new Integer(BigInt(value));
    if (typeof value === "string") return parseScalarText(value);
    if (typeof value === "number") {
      throw new TypeError(`Cannot use inexact number ${value} as a magnitude; pass a string such as "${value}"`);
    }
    throw new TypeError(`Cannot use ${value === null ? "null" : typeof value} as a magnitude`);
  },
  add: (a, b) => TypePromotion.add(a, b),
  subtract: (a, b) => TypePromotion.subtract(a, b),
  multiply: (a, b) => TypePromotion.multiply(a, b),
  divide: (a, b) => TypePromotion.divide(a, b),
  negate: (a) => (typeof a.negate === "function" ? a.negate() : TypePromotion.negate(a)),
  pow: (a, n) => a.pow(n),
  relation: (a, b) => possibleRelations(a, b),
  /** pi^k for a nonzero integer k: an exact enclosure here. */
  pi(k) {
    if (!piPowers.has(k)) piPowers.set(k, PI_ENCLOSURE.pow(k));
    return piPowers.get(k);
  },
});

// ---------------------------------------------------------------------------
// Dimensions: frozen { name: exponent } maps with no zero exponents

function makeDimensions(entries) {
  const out = {};
  for (const name of BASE_DIMENSIONS) {
    const exponent = entries[name];
    if (exponent) out[name] = exponent;
  }
  for (const [name, exponent] of Object.entries(entries)) {
    if (!(name in out) && exponent) out[name] = exponent;
  }
  return Object.freeze(out);
}

function combineDimensions(a, b, sign) {
  const out = { ...a };
  for (const [name, exponent] of Object.entries(b)) out[name] = (out[name] || 0) + sign * exponent;
  return makeDimensions(out);
}

function scaleDimensions(a, n) {
  return makeDimensions(Object.fromEntries(Object.entries(a).map(([k, e]) => [k, e * n])));
}

/** True when two dimension maps are the same. */
export function dimensionsEqual(a, b) {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
}

/** "Length*Time^-2", or "Dimensionless". */
export function formatDimensions(dimensions) {
  const parts = Object.entries(dimensions).map(([k, e]) => (e === 1 ? k : `${k}^${e}`));
  return parts.length ? parts.join("*") : "Dimensionless";
}

function checkInteger(n, label = "exponent") {
  if (typeof n === "bigint") n = Number(n);
  if (n instanceof Integer) n = Number(n.value);
  if (!Number.isSafeInteger(n)) throw new TypeError(`Unit ${label} must be an integer`);
  return n;
}

// ---------------------------------------------------------------------------
// Units

const SUPERSCRIPT = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };

/**
 * A unit: `scale * pi^piPower` base units of `dimensions`. Named units have a
 * single factor (themselves); products, quotients and powers keep the named
 * factors they were built from so they print the way they were written.
 */
export class Unit {
  constructor(name, options = {}) {
    if (typeof name !== "string" || !name) throw new TypeError("A unit needs a name");
    this.name = name;
    this.dimensions = makeDimensions(options.dimensions || {});
    this.scale = exactRational(options.scale ?? ONE, "Unit scale");
    if (signOf(this.scale) <= 0) {
      throw new RangeError("Unit scale must be positive");
    }
    this.piPower = checkInteger(options.piPower ?? 0, "pi power");
    this.kind = options.kind || "linear";
    if (!["linear", "affine", "difference"].includes(this.kind)) throw new TypeError(`Unknown unit kind '${this.kind}'`);
    this.offset = exactRational(options.offset ?? ZERO, "Unit offset");
    if (this.kind !== "affine" && !isZero(this.offset)) throw new TypeError("Only an affine unit has an offset");
    if (this.kind === "affine" && this.piPower !== 0) throw new TypeError("An affine unit cannot carry pi");
    this.differenceUnit = options.differenceUnit || null;
    this.group = options.group || null;
    this.prefixes = options.prefixes || null;
    if (this.prefixes !== null && this.prefixes !== "SI" && this.prefixes !== "SI+binary") {
      throw new TypeError(`Unit prefixes must be "SI" or "SI+binary"`);
    }
    this.factors = Object.freeze(options.factors || [[this, 1]]);
    Object.freeze(this);
  }

  /** True for a unit defined by name, false for a product or power of units. */
  get isNamed() {
    return this.factors.length === 1 && this.factors[0][0] === this && this.factors[0][1] === 1;
  }

  get isDimensionless() {
    return Object.keys(this.dimensions).length === 0;
  }

  multiply(other) {
    return compound(this, other, 1);
  }

  divide(other) {
    return compound(this, other, -1);
  }

  inverse() {
    return compound(null, this, -1);
  }

  pow(exponent) {
    const n = checkInteger(exponent);
    requireLinear(this);
    if (n === 1) return this;
    return buildCompound(
      this.factors.map(([u, e]) => [u, e * n]),
      scaleDimensions(this.dimensions, n),
      normalize(this.scale.pow(n)),
      this.piPower * n,
    );
  }

  /** Same dimensions: quantities in the two units can be converted. */
  isCompatible(other) {
    return dimensionsEqual(this.dimensions, other.dimensions);
  }

  /** Same size, offset and kind (km and 1000 m are equal; degC and K are not). */
  equals(other) {
    return other instanceof Unit && this.isCompatible(other) && this.kind === other.kind &&
      this.piPower === other.piPower && this.scale.equals(other.scale) && this.offset.equals(other.offset);
  }

  /**
   * "kg*m^2/s^2" by default; `{ style: "unicode" }` gives "kg·m²/s²".
   * A denominator with several factors is parenthesised so it parses back.
   */
  toString({ style = "ascii" } = {}) {
    if (this.isNamed) return this.name;
    const unicode = style === "unicode";
    const times = unicode ? "·" : "*";
    const power = (n) => (n === 1 ? "" : unicode ? [...String(n)].map((c) => SUPERSCRIPT[c]).join("") : `^${n}`);
    const top = [];
    const bottom = [];
    for (const [unit, e] of this.factors) (e > 0 ? top : bottom).push(`${unit.name}${power(Math.abs(e))}`);
    if (!top.length && !bottom.length) return "1";
    const numerator = top.length ? top.join(times) : "1";
    if (!bottom.length) return numerator;
    return `${numerator}/${bottom.length > 1 ? `(${bottom.join(times)})` : bottom[0]}`;
  }
}

function signOf(r) {
  const n = r instanceof Integer ? r.value : r.numerator;
  return n > 0n ? 1 : n < 0n ? -1 : 0;
}

function isZero(r) {
  return signOf(r) === 0;
}

// Exact rational arithmetic on unit scales and offsets.
const rmul = (a, b) => normalize(TypePromotion.multiply(a, b));
const rdiv = (a, b) => normalize(TypePromotion.divide(a, b));
const rsub = (a, b) => normalize(TypePromotion.subtract(a, b));

function requireLinear(unit) {
  if (unit.kind === "affine") {
    throw new Error(`Affine unit '${unit.name}' cannot be used in a compound unit (a product, quotient or power); convert to K first`);
  }
}

function compound(left, right, sign) {
  if (!(right instanceof Unit)) throw new TypeError("Expected a Unit");
  if (left) requireLinear(left);
  requireLinear(right);
  const factors = new Map();
  const add = (unit, e) => {
    const [key, prev] = [unit.name, factors.get(unit.name)];
    const next = (prev ? prev[1] : 0) + e;
    if (next === 0) factors.delete(key);
    else factors.set(key, [prev ? prev[0] : unit, next]);
  };
  if (left) for (const [u, e] of left.factors) add(u, e);
  for (const [u, e] of right.factors) add(u, sign * e);
  const scale = left
    ? (sign > 0 ? rmul(left.scale, right.scale) : rdiv(left.scale, right.scale))
    : rdiv(ONE, right.scale);
  return buildCompound(
    [...factors.values()],
    combineDimensions(left ? left.dimensions : {}, right.dimensions, sign),
    scale,
    (left ? left.piPower : 0) + sign * right.piPower,
  );
}

function buildCompound(factors, dimensions, scale, piPower) {
  if (factors.length === 1 && factors[0][1] === 1) return factors[0][0];
  const unit = Object.create(Unit.prototype);
  const name = Unit.prototype.toString.call({ isNamed: false, factors });
  Object.assign(unit, {
    name, dimensions, scale: normalize(scale), piPower, kind: "linear", offset: ZERO,
    differenceUnit: null, group: null, prefixes: null, factors: Object.freeze(factors),
  });
  return Object.freeze(unit);
}

// ---------------------------------------------------------------------------
// Unit expressions: "kg*m^2/s^2", "N m", "m/(s*kg)", "m·s⁻²", "1/s"

const SUPER_DIGITS = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
const NAME = /^[\p{L}_°][\p{L}\p{Nd}_]*/u;

function parseUnitExpression(source, lookup) {
  const text = String(source);
  let i = 0;
  const skip = () => { while (i < text.length && /\s/.test(text[i])) i++; };
  const fail = (msg) => { throw new SyntaxError(`${msg} in unit '${text}' at character ${i + 1}`); };

  function exponent() {
    skip();
    if (text[i] === "^") {
      i++;
      skip();
      const m = /^[-+]?\d+/.exec(text.slice(i)) || /^\([-+]?\d+\)/.exec(text.slice(i));
      if (!m) fail("Expected an integer exponent");
      i += m[0].length;
      return Number(m[0].replace(/[()]/g, ""));
    }
    let digits = "";
    while (i < text.length && text[i] in SUPER_DIGITS) digits += SUPER_DIGITS[text[i++]];
    if (digits) {
      if (!/^-?\d+$/.test(digits)) fail("Bad superscript exponent");
      return Number(digits);
    }
    return 1;
  }

  function primary() {
    skip();
    if (text[i] === "(") {
      i++;
      const value = product();
      skip();
      if (text[i] !== ")") fail("Expected ')'");
      i++;
      return value;
    }
    if (text[i] === "1" && !/\d/.test(text[i + 1] || "")) {
      i++;
      return null; // "1/s"
    }
    const m = NAME.exec(text.slice(i));
    if (!m) fail("Expected a unit name");
    i += m[0].length;
    return lookup(m[0]);
  }

  function factor() {
    const base = primary();
    const e = exponent();
    if (base === null) {
      if (e !== 1) fail("Cannot raise 1 to a power");
      return null;
    }
    return e === 1 ? base : base.pow(e);
  }

  const times = (a, b) => (a === null ? b : b === null ? a : a.multiply(b));
  const over = (a, b) => (b === null ? a : a === null ? b.inverse() : a.divide(b));

  function product() {
    let value = factor();
    for (;;) {
      skip();
      const c = text[i];
      if (c === "*" || c === "·" || c === "⋅") { i++; value = times(value, factor()); }
      else if (c === "/") { i++; value = over(value, factor()); }
      else if (c !== undefined && c !== ")" && (NAME.test(text.slice(i)) || c === "(")) value = times(value, factor());
      else return value;
    }
  }

  skip();
  if (i >= text.length) throw new SyntaxError("A unit expression cannot be empty");
  const result = product();
  skip();
  if (i < text.length) fail("Unexpected input");
  if (result === null) fail("A unit expression needs a unit");
  return result;
}

// ---------------------------------------------------------------------------
// Quantities

function toUnit(system, unit) {
  if (unit instanceof Unit) return unit;
  if (typeof unit === "string") return system.parse(unit);
  throw new TypeError("Expected a Unit or a unit expression string");
}

/**
 * A magnitude in a unit. `point` marks an affine point (a temperature read on
 * the degC or degF scale, or a K reading converted from one).
 */
export class Quantity {
  constructor(value, unit, { point, system = units } = {}) {
    if (!(system instanceof UnitSystem)) throw new TypeError("Quantity system must be a UnitSystem");
    this.system = system;
    this.unit = toUnit(system, unit);
    this.value = system.scalars.from(value);
    this.point = point ?? this.unit.kind === "affine";
    if (this.point && this.unit.kind === "difference") throw new TypeError("A difference unit cannot hold a point");
    if (!this.point && this.unit.kind === "affine") throw new TypeError(`'${this.unit.name}' values are points`);
    Object.freeze(this);
  }

  get dimensions() {
    return this.unit.dimensions;
  }

  #make(value, unit, point = false) {
    return new Quantity(value, unit, { point, system: this.system });
  }

  #factor(from, to) {
    const s = this.system.scalars;
    const ratio = rdiv(from.scale, to.scale);
    const k = from.piPower - to.piPower;
    return k === 0 ? ratio : s.multiply(ratio, s.pi(k));
  }

  // The magnitude of `this` in `target`, as a linear (difference) reading.
  #linearIn(target) {
    if (this.unit === target) return this.value;
    return this.system.scalars.multiply(this.value, this.#factor(this.unit, target));
  }

  #sameDimensions(other, what) {
    if (!dimensionsEqual(this.dimensions, other.dimensions)) {
      throw new Error(`Incompatible dimensions for ${what}: ${formatDimensions(this.dimensions)} and ${formatDimensions(other.dimensions)}`);
    }
  }

  #other(other) {
    if (other instanceof Quantity) return other;
    throw new TypeError("Expected a Quantity");
  }

  /** The magnitude in another unit (a Unit or a unit expression). */
  valueIn(target) {
    return this.to(target).value;
  }

  /** The same quantity in another unit. Conversion factors are exact. */
  to(target) {
    const unit = toUnit(this.system, target);
    this.#sameDimensions(unit, "conversion");
    if (this.point && unit.kind === "difference") throw new Error(`Cannot convert a temperature point to the difference unit '${unit.name}'`);
    if (!this.point && unit.kind === "affine" && this.unit.kind === "difference") {
      throw new Error(`Cannot convert the difference unit '${this.unit.name}' to the point scale '${unit.name}'`);
    }
    const point = this.point || unit.kind === "affine";
    if (unit === this.unit) return this;
    const s = this.system.scalars;
    let value = this.#linearIn(unit);
    if (point) {
      const shift = rsub(this.unit.kind === "affine" ? this.unit.offset : ZERO, unit.kind === "affine" ? unit.offset : ZERO);
      if (!isZero(shift)) value = s.add(value, rdiv(shift, unit.scale));
    }
    return this.#make(value, unit, point);
  }

  /** The quantity in coherent SI base units (kg*m^2/s^2 for a joule). */
  toBase() {
    return this.to(this.system.coherentUnit(this.dimensions));
  }

  /** The quantity in the system's named coherent unit for its dimensions (N, J, W, ...), else in base units. */
  simplify() {
    const named = this.system.namedCoherentUnit(this.dimensions);
    return this.to(named || this.system.coherentUnit(this.dimensions));
  }

  add(other) {
    other = this.#other(other);
    this.#sameDimensions(other, "addition");
    const s = this.system.scalars;
    if (this.point && other.point) throw new Error("Cannot add two temperature points; add a difference instead");
    if (other.point) return this.#make(s.add(this.#linearIn(other.unit), other.value), other.unit, true);
    return this.#make(s.add(this.value, other.#linearIn(this.unit)), this.unit, this.point);
  }

  subtract(other) {
    other = this.#other(other);
    this.#sameDimensions(other, "subtraction");
    const s = this.system.scalars;
    if (other.point && !this.point && this.unit.kind === "difference") {
      throw new Error("Cannot subtract a temperature point from a difference");
    }
    if (other.point) {
      // point - point, where an absolute K reading counts as a point
      const value = s.subtract(this.value, other.to(this.unit).value);
      return this.#make(value, differenceUnitOf(this.unit), false);
    }
    return this.#make(s.subtract(this.value, other.#linearIn(this.unit)), this.unit, this.point);
  }

  negate() {
    if (this.point && this.unit.kind === "affine") throw new Error("Cannot negate a temperature point");
    return this.#make(this.system.scalars.negate(this.value), this.unit, this.point);
  }

  /** Multiply by a scalar or a quantity. A dimensionless product is returned as a plain scalar. */
  multiply(other) {
    return this.#product(other, 1);
  }

  /** Divide by a scalar or a quantity. A dimensionless quotient is returned as a plain scalar. */
  divide(other) {
    return this.#product(other, -1);
  }

  #product(other, sign) {
    const s = this.system.scalars;
    if (other instanceof Quantity) {
      if (this.unit.kind === "affine" || other.unit.kind === "affine") {
        throw new Error("Temperatures on the degC or degF scale cannot be multiplied or divided; convert to K");
      }
      const value = sign > 0 ? s.multiply(this.value, other.value) : s.divide(this.value, other.value);
      return this.#collapse(value, sign > 0 ? this.unit.multiply(other.unit) : this.unit.divide(other.unit));
    }
    if (other instanceof Unit) return this.#product(this.#make(ONE, other), sign);
    const scalar = s.from(other);
    if (this.point && this.unit.kind === "affine") throw new Error("Cannot scale a temperature point");
    return this.#make(sign > 0 ? s.multiply(this.value, scalar) : s.divide(this.value, scalar), this.unit, false);
  }

  #collapse(value, unit) {
    if (!unit.isDimensionless) return this.#make(value, unit, false);
    const s = this.system.scalars;
    const factor = this.#factor(unit, this.system.coherentUnit({}));
    return factor instanceof Integer && factor.value === 1n ? value : s.multiply(value, factor);
  }

  /** 1 / this, in the reciprocal unit. */
  inverse() {
    if (this.unit.kind === "affine") throw new Error("Temperatures on the degC or degF scale cannot be inverted; convert to K");
    return this.#make(this.system.scalars.divide(ONE, this.value), this.unit.inverse());
  }

  pow(exponent) {
    const n = checkInteger(exponent);
    if (this.unit.kind === "affine") throw new Error("Temperatures on the degC or degF scale cannot be raised to a power");
    if (n === 0) return ONE;
    return this.#collapse(this.system.scalars.pow(this.value, n), this.unit.pow(n));
  }

  /** The Relation mask (LESS | EQUAL | GREATER) of the possible orderings. */
  relation(other) {
    other = this.#other(other);
    this.#sameDimensions(other, "comparison");
    if (this.point !== other.point && (this.unit.kind === "difference" || other.unit.kind === "difference")) {
      throw new Error("Cannot compare a temperature point with a difference");
    }
    const value = this.point || other.point ? other.to(this.unit).value : other.#linearIn(this.unit);
    return this.system.scalars.relation(this.value, value);
  }

  /** -1, 0 or 1; throws when intervals overlap so the order is not decided. */
  compare(other) {
    const mask = this.relation(other);
    if (mask === Relation.LESS) return -1;
    if (mask === Relation.EQUAL) return 0;
    if (mask === Relation.GREATER) return 1;
    throw new Error("Quantity order is undecided: the magnitudes overlap");
  }

  /** True only when the two are certainly equal. */
  equals(other) {
    return other instanceof Quantity && dimensionsEqual(this.dimensions, other.dimensions) &&
      this.relation(other) === Relation.EQUAL;
  }

  /** "49/5 m/s^2"; `{ style: "unicode" }` for "49/5 m/s²", `format` to print the magnitude. */
  /**
   * A duration as clock text, exactly: "3:15" or, with seconds, "3:15:00".
   * `wrap: 12` or `24` reads it as a time of day after midnight (or noon):
   * 12-hour clocks show 12 for 0. Without `round`, a duration that is not a
   * whole number of the last unit shown is refused; fractional seconds that
   * end are shown as a decimal ("0:00:01.25").
   * @param {{ seconds?: boolean, wrap?: 12|24, round?: string }} [options]
   * @returns {string}
   */
  toClock({ seconds = false, wrap, round } = {}) {
    if (!dimensionsEqual(this.dimensions, { Time: 1 })) throw new TypeError("toClock needs a duration (a time quantity)");
    const total = this.to("s").value;
    if (!(total instanceof Integer || total instanceof Rational)) throw new TypeError("toClock needs an exact duration");
    let r = total instanceof Integer ? new Rational(total.value) : total;
    const step = seconds ? 1n : 60n;
    if (round) {
      r = new Rational(r.divide(new Rational(step)).round(round) * step);
    } else if (!seconds && (r.numerator % (60n * r.denominator)) !== 0n) {
      throw new RangeError("Duration is not a whole number of minutes (pass round, or seconds: true)");
    }
    const negative = r.numerator < 0n;
    if (negative) r = r.negate();
    const whole = r.floor();
    let frac = r.subtract(new Rational(whole));
    let h = whole / 3600n;
    const m = (whole / 60n) % 60n;
    const sec = whole % 60n;
    if (wrap !== undefined) {
      if (wrap !== 12 && wrap !== 24) throw new RangeError("wrap must be 12 or 24");
      if (negative) throw new RangeError("A time of day cannot be negative");
      h %= BigInt(wrap);
      if (wrap === 12 && h === 0n) h = 12n;
    }
    const two = (n) => n.toString().padStart(2, "0");
    let text = `${negative ? "-" : ""}${h}:${two(m)}`;
    if (seconds) {
      text += `:${two(sec)}`;
      if (frac.numerator !== 0n) {
        const dec = frac.toDecimal(40);
        if (!/^0\.\d+$/.test(dec) || !new Rational(dec.replace("0.", ""), 10n ** BigInt(dec.length - 2)).equals(frac)) {
          throw new RangeError("Fractional seconds do not end as a decimal (pass round)");
        }
        text += dec.slice(1);
      }
    }
    return text;
  }

  toString({ style = "ascii", format = (v) => v.toString() } = {}) {
    const unit = this.unit.toString({ style });
    return unit === "1" ? format(this.value) : `${format(this.value)} ${unit}`;
  }
}

function differenceUnitOf(unit) {
  if (unit.differenceUnit) return unit.differenceUnit;
  if (unit.kind !== "affine") return unit;
  return new Unit(`delta${unit.name}`, { dimensions: unit.dimensions, scale: unit.scale, kind: "difference" });
}

// ---------------------------------------------------------------------------
// Unit systems

const SI_PREFIXES = [
  ["Q", "quetta", 30], ["R", "ronna", 27], ["Y", "yotta", 24], ["Z", "zetta", 21], ["E", "exa", 18],
  ["P", "peta", 15], ["T", "tera", 12], ["G", "giga", 9], ["M", "mega", 6], ["k", "kilo", 3],
  ["h", "hecto", 2], ["da", "deca", 1], ["d", "deci", -1], ["c", "centi", -2], ["m", "milli", -3],
  ["µ", "micro", -6], ["μ", null, -6], ["u", null, -6], ["n", "nano", -9], ["p", "pico", -12],
  ["f", "femto", -15], ["a", "atto", -18], ["z", "zepto", -21], ["y", "yocto", -24], ["r", "ronto", -27],
  ["q", "quecto", -30],
];
const BINARY_PREFIXES = [
  ["Ki", "kibi", 10], ["Mi", "mebi", 20], ["Gi", "gibi", 30], ["Ti", "tebi", 40], ["Pi", "pebi", 50], ["Ei", "exbi", 60],
];

function prefixScale(prefix) {
  const [, , e, binary] = prefix;
  if (binary) return new Integer(1n << BigInt(e));
  return e >= 0 ? new Integer(10n ** BigInt(e)) : new Rational(1n, 10n ** BigInt(-e));
}

/**
 * A catalogue of named units. `units` is the standard one; `extend()` copies
 * it (optionally with other scalar arithmetic) so definitions can be added
 * without touching the shared catalogue.
 */
export class UnitSystem {
  #entries = new Map(); // key -> { unit, prefix: "symbol" | "name" | null, binary }
  #lower = new Map(); // lower-cased word names -> key
  #units = []; // named units in definition order
  #prefixed = new Map();

  constructor({ scalars = coreScalars } = {}) {
    for (const k of ["isScalar", "from", "add", "subtract", "multiply", "divide", "negate", "pow", "relation", "pi"]) {
      if (typeof scalars[k] !== "function") throw new TypeError(`scalars.${k} must be a function`);
    }
    this.scalars = scalars;
  }

  /** A copy of this catalogue, with other scalars if given. */
  extend({ scalars = this.scalars } = {}) {
    const copy = new UnitSystem({ scalars });
    for (const [k, v] of this.#entries) copy.#entries.set(k, v);
    for (const [k, v] of this.#lower) copy.#lower.set(k, v);
    copy.#units = [...this.#units];
    return copy;
  }

  /**
   * Define a named unit.
   *   define("furlong", "201.168 m")             a magnitude and unit expression
   *   define("smoot", Q("1.7018 m"))              a Quantity
   *   define("pace", units.get("m").pow(1))       a Unit
   *   define("m", { dimensions: { Length: 1 } })  a base or raw definition
   * Options: aliases, prefixes ("SI", "SI+binary", or none), group, kind,
   * offset and differenceUnit (for affine scales). Redefining a name throws
   * unless `replace: true`.
   */
  define(name, definition, options = {}) {
    let spec;
    if (definition instanceof Unit) {
      spec = {
        dimensions: definition.dimensions, scale: definition.scale, piPower: definition.piPower,
        kind: definition.kind, offset: definition.offset, differenceUnit: definition.differenceUnit,
      };
    } else if (definition instanceof Quantity) {
      if (definition.unit.kind === "affine") throw new TypeError("Define a unit from a linear quantity");
      spec = this.#specFrom(definition.value, definition.unit);
    } else if (typeof definition === "string") {
      const { value, unit } = this.#splitQuantityText(definition);
      spec = this.#specFrom(value, unit);
    } else if (definition && typeof definition === "object") {
      spec = definition;
    } else {
      throw new TypeError("A unit definition must be a Unit, Quantity, string or { dimensions }");
    }
    const unit = new Unit(name, {
      dimensions: spec.dimensions,
      scale: spec.scale,
      piPower: spec.piPower,
      kind: options.kind ?? spec.kind,
      offset: options.offset ?? spec.offset,
      differenceUnit: options.differenceUnit ?? spec.differenceUnit,
      group: options.group ?? null,
      prefixes: options.prefixes ?? null,
    });
    const keys = [name, ...(options.aliases || [])];
    if (!options.replace) {
      for (const key of keys) if (this.#entries.has(key)) throw new Error(`Unit '${key}' is already defined`);
    }
    for (const key of keys) this.#add(key, unit);
    return unit;
  }

  /**
   * Make an existing Unit reachable under `key` (its own name, or an alias),
   * keeping the same object. Prefixes follow `unit.prefixes`: a symbol key
   * takes symbol prefixes (km), a lower-case word alias takes word prefixes
   * (kilometre); `prefixes: false` registers the key without them. Throws if
   * the key is taken, unless `replace: true`.
   */
  register(key, unit, { replace = false, prefixes = true } = {}) {
    if (typeof key !== "string" || !key) throw new TypeError("register needs a name");
    if (!(unit instanceof Unit)) throw new TypeError("register needs a Unit");
    if (!replace && this.#entries.has(key)) throw new Error(`Unit '${key}' is already defined`);
    this.#add(key, unit, prefixes);
    return unit;
  }

  #add(key, unit, prefixes = true) {
    const word = key !== unit.name && /^\p{Ll}{3,}$/u.test(key);
    const mode = prefixes && unit.prefixes ? (word ? "name" : "symbol") : null;
    this.#entries.set(key, { unit, prefix: mode, binary: unit.prefixes === "SI+binary" });
    if (/^\p{L}{3,}$/u.test(key)) this.#lower.set(key.toLowerCase(), key);
    if (!this.#units.includes(unit)) this.#units.push(unit);
    this.#prefixed.clear();
  }

  #specFrom(value, unit) {
    const scale = this.scalars.multiply(value, unit.scale);
    if (!(scale instanceof Integer || scale instanceof Rational)) {
      throw new TypeError("A unit definition needs an exact rational magnitude");
    }
    return { dimensions: unit.dimensions, scale, piPower: unit.piPower };
  }

  #splitQuantityText(text) {
    const source = String(text).trim();
    const m = /^([-+]?(?:\d|\.\d)\S*)\s+(.+)$/s.exec(source);
    if (m) return { value: this.scalars.from(m[1]), unit: this.parse(m[2]) };
    return { value: ONE, unit: this.parse(source) };
  }

  /** True when `name` is a unit (including prefixed forms such as km). */
  has(name) {
    try {
      this.get(name);
      return true;
    } catch {
      return false;
    }
  }

  /** The unit with this name, symbol or alias; SI prefixes work on prefixable units (km, mL, kWh, MiB). */
  get(name) {
    const entry = this.#entries.get(name);
    if (entry) return entry.unit;
    const prefixed = this.#prefixed.get(name) || this.#tryPrefix(name);
    if (prefixed) return prefixed;
    const lower = this.#lower.get(name.toLowerCase());
    if (lower) return this.#entries.get(lower).unit;
    throw new Error(`Unknown unit '${name}'`);
  }

  #tryPrefix(name) {
    const tables = [
      ...SI_PREFIXES.map(([sym, word, e]) => [sym, word, e, false]),
      ...BINARY_PREFIXES.map(([sym, word, e]) => [sym, word, e, true]),
    ];
    for (const prefix of tables) {
      const [sym, word, , isBinary] = prefix;
      for (const [text, mode] of [[sym, "symbol"], [word, "name"]]) {
        if (!text || !name.startsWith(text) || name.length === text.length) continue;
        const entry = this.#entries.get(name.slice(text.length));
        if (!entry || entry.prefix !== mode || (isBinary && !entry.binary)) continue;
        const base = entry.unit;
        const unit = new Unit(name, {
          dimensions: base.dimensions,
          scale: rmul(base.scale, prefixScale(prefix)),
          piPower: base.piPower,
          group: base.group,
        });
        this.#prefixed.set(name, unit);
        return unit;
      }
    }
    return null;
  }

  /** Parse a unit expression such as "kg*m^2/s^2", "N m" or "m·s⁻²". */
  parse(expression) {
    return parseUnitExpression(expression, (name) => this.get(name));
  }

  /** A quantity: quantity(value, unit) or quantity("9.8 m/s^2"). */
  quantity(value, unit) {
    if (unit === undefined) {
      if (typeof value !== "string") throw new TypeError("quantity(text) needs a string such as \"9.8 m/s^2\"");
      const parts = this.#splitQuantityText(value);
      if (!/^\s*[-+]?(?:\d|\.\d)/.test(value)) throw new SyntaxError(`Expected a magnitude before the unit in '${value}'`);
      return new Quantity(parts.value, parts.unit, { system: this });
    }
    return new Quantity(value, unit, { system: this });
  }

  /** The coherent base unit for some dimensions: kg*m^2/s^2 for energy. */
  coherentUnit(dimensions) {
    let unit = null;
    for (const [name, e] of Object.entries(dimensions)) {
      const symbol = BASE_SYMBOLS[name];
      if (!symbol) throw new Error(`No base unit for dimension '${name}'`);
      const base = this.get(symbol).pow(e);
      unit = unit ? unit.multiply(base) : base;
    }
    return unit || DIMENSIONLESS;
  }

  /** The first named unit with these dimensions and scale 1 (N, J, Pa, ...), or null. */
  namedCoherentUnit(dimensions) {
    return this.#units.find((u) => u.kind === "linear" && u.piPower === 0 && u.scale.equals(ONE) &&
      dimensionsEqual(u.dimensions, dimensions)) || null;
  }

  /** Named units in definition order, grouped for menus: [{ title, units }]. */
  groups() {
    const out = new Map();
    for (const unit of this.#units) {
      if (!unit.group) continue;
      if (!out.has(unit.group)) out.set(unit.group, []);
      out.get(unit.group).push(unit);
    }
    return [...out].map(([title, list]) => ({ title, units: list }));
  }

  /** Every defined name and alias (prefixed forms not listed). */
  names() {
    return [...this.#entries.keys()];
  }
}

const DIMENSIONLESS = Object.freeze(Object.assign(Object.create(Unit.prototype), {
  name: "1", dimensions: Object.freeze({}), scale: ONE, piPower: 0, kind: "linear", offset: ZERO,
  differenceUnit: null, group: null, prefixes: null, factors: Object.freeze([]),
}));

// ---------------------------------------------------------------------------
// The standard catalogue

function standardCatalogue(system) {
  const def = (name, definition, options = {}) => system.define(name, definition, options);
  const SI = { prefixes: "SI" };
  let group = null;
  const g = (title) => { group = title; };
  const d = (name, definition, options = {}) => def(name, definition, { group, ...options });

  // Base units (kg is the coherent mass unit; prefixes attach to g)
  g("Length");
  d("m", { dimensions: { Length: 1 } }, { ...SI, aliases: ["metre", "meter"] });
  g("Mass");
  d("kg", { dimensions: { Mass: 1 } }, { aliases: ["kilogram"] });
  d("g", "0.001 kg", { ...SI, aliases: ["gram"] });
  g("Time");
  d("s", { dimensions: { Time: 1 } }, { ...SI, aliases: ["second", "sec"] });
  g("Electricity");
  d("A", { dimensions: { Current: 1 } }, { ...SI, aliases: ["ampere", "amp"] });
  g("Temperature");
  d("K", { dimensions: { Temperature: 1 } }, { ...SI, aliases: ["kelvin"] });
  g("Amount");
  d("mol", { dimensions: { Amount: 1 } }, { ...SI, aliases: ["mole"] });
  g("Luminosity");
  d("cd", { dimensions: { Luminosity: 1 } }, { ...SI, aliases: ["candela"] });
  g("Angle");
  d("rad", { dimensions: { Angle: 1 } }, { ...SI, aliases: ["radian"] });
  g("Information");
  d("bit", { dimensions: { Information: 1 } }, { prefixes: "SI+binary", aliases: ["bits"] });

  g("Length");
  d("in", "0.0254 m", { aliases: ["inch"] });
  d("ft", "12 in", { aliases: ["foot", "feet"] });
  d("yd", "3 ft", { aliases: ["yard"] });
  d("mi", "5280 ft", { aliases: ["mile"] });
  d("nmi", "1852 m", { aliases: ["nautical_mile"] });
  d("Å", "1E-10 m", { aliases: ["angstrom"] });
  d("au", "149597870700 m");
  d("ly", "9460730472580800 m", { aliases: ["lightyear"] });
  d("pc", { dimensions: { Length: 1 }, scale: 149597870700n * 648000n, piPower: -1 }, { aliases: ["parsec"] });

  g("Mass");
  d("t", "1000 kg", { aliases: ["tonne"] });
  d("lb", "0.45359237 kg", { aliases: ["pound"] });
  d("oz", "1/16 lb", { aliases: ["ounce"] });

  g("Time");
  d("min", "60 s", { aliases: ["minute"] });
  d("h", "60 min", { aliases: ["hr", "hour"] });
  d("day", "24 h", { aliases: ["days"] });
  d("week", "7 day", { aliases: ["wk"] });
  d("yr", "365.25 day", { aliases: ["year"] });

  g("Area");
  d("ha", "10000 m^2", { aliases: ["hectare"] });
  d("acre", "4046.8564224 m^2", { aliases: ["acres"] });

  g("Volume");
  d("L", "0.001 m^3", { ...SI, aliases: ["litre", "liter"] });
  d("gal", "231 in^3", { aliases: ["gallon"] });
  d("qt", "1/4 gal", { aliases: ["quart"] });
  d("pt", "1/2 qt", { aliases: ["pint"] });
  d("cup", "1/2 pt", { aliases: ["cups"] });
  d("floz", "1/8 cup", { aliases: ["fluid_ounce"] });
  d("tbsp", "1/2 floz", { aliases: ["tablespoon"] });
  d("tsp", "1/3 tbsp", { aliases: ["teaspoon"] });

  g("Speed");
  d("mph", "1 mi/h");
  d("kph", "1 km/h");
  d("kn", "1 nmi/h", { aliases: ["knot"] });

  g("Frequency");
  d("Hz", "1 1/s", { ...SI, aliases: ["hertz"] });

  g("Force");
  d("N", "1 kg*m/s^2", { ...SI, aliases: ["newton"] });
  d("lbf", "9.80665 lb*m/s^2", { aliases: ["pound_force"] });

  g("Energy");
  d("J", "1 N*m", { ...SI, aliases: ["joule"] });
  d("cal", "4.184 J", { ...SI, aliases: ["calorie"] });
  d("eV", "1.602176634E-19 J", { ...SI, aliases: ["electronvolt"] });
  d("Wh", "3600 J", SI);

  g("Power");
  d("W", "1 J/s", { ...SI, aliases: ["watt"] });
  d("hp", "550 ft*lbf/s", { aliases: ["horsepower"] });

  g("Pressure");
  d("Pa", "1 N/m^2", { ...SI, aliases: ["pascal"] });
  d("bar", "100000 Pa", SI);
  d("atm", "101325 Pa", { aliases: ["atmosphere"] });
  d("psi", "1 lbf/in^2");
  d("Torr", "101325/760 Pa", { aliases: ["torr"] });
  d("mmHg", "133.322387415 Pa");

  g("Electricity");
  d("C", "1 A*s", { ...SI, aliases: ["coulomb"] });
  d("V", "1 W/A", { ...SI, aliases: ["volt"] });
  d("Ω", "1 V/A", { ...SI, aliases: ["ohm"] });
  d("F", "1 C/V", { ...SI, aliases: ["farad"] });
  d("S", "1 A/V", { ...SI, aliases: ["siemens"] });
  d("Wb", "1 V*s", { ...SI, aliases: ["weber"] });
  d("T", "1 Wb/m^2", { ...SI, aliases: ["tesla"] });
  d("H", "1 Wb/A", { ...SI, aliases: ["henry"] });
  d("Ah", "3600 C", SI);

  g("Temperature");
  d("deltaK", { dimensions: { Temperature: 1 }, kind: "difference" });
  const deltaDegC = d("deltaDegC", { dimensions: { Temperature: 1 }, kind: "difference" });
  const deltaDegF = d("deltaDegF", { dimensions: { Temperature: 1 }, scale: new Rational(5n, 9n), kind: "difference" });
  d("degC", { dimensions: { Temperature: 1 }, kind: "affine", offset: new Rational(27315n, 100n) },
    { aliases: ["°C", "celsius"], differenceUnit: deltaDegC });
  d("degF", { dimensions: { Temperature: 1 }, scale: new Rational(5n, 9n), kind: "affine", offset: new Rational(45967n, 180n) },
    { aliases: ["°F", "fahrenheit"], differenceUnit: deltaDegF });

  g("Angle");
  d("deg", { dimensions: { Angle: 1 }, scale: new Rational(1n, 180n), piPower: 1 }, { aliases: ["°", "degree"] });
  d("arcmin", "1/60 deg");
  d("arcsec", "1/60 arcmin");
  d("gon", { dimensions: { Angle: 1 }, scale: new Rational(1n, 200n), piPower: 1 }, { aliases: ["grad"] });
  d("turn", { dimensions: { Angle: 1 }, scale: 2n, piPower: 1 }, { aliases: ["rev", "revolution"] });
  d("rpm", "1 turn/min");

  g("Information");
  d("B", "8 bit", { prefixes: "SI+binary", aliases: ["byte", "bytes"] });

  // US money: exact, so coin counts add up to exact cents.
  g("Money");
  d("USD", { dimensions: { Money: 1 } }, { aliases: ["dollar", "dollars"] });
  d("cent", "1/100 USD", { aliases: ["cents", "¢"] });
  d("penny", "1 cent", { aliases: ["pennies"] });
  d("nickel", "5 cent", { aliases: ["nickels"] });
  d("dime", "10 cent", { aliases: ["dimes"] });
  d("quarter", "25 cent", { aliases: ["quarters"] });

  return system;
}

/** The standard unit catalogue. */
export const units = standardCatalogue(new UnitSystem());

/** A quantity in the standard catalogue: Q(9.8, "m/s^2") or Q("9.8 m/s^2"). */
export function Q(value, unit) {
  return units.quantity(value, unit);
}

/**
 * Physical constants. The SI defining constants are exact; G is the CODATA
 * 2018 value as an interval (its standard uncertainty either side).
 */
export const constants = Object.freeze({
  c: Q("299792458 m/s"),
  h: Q("6.62607015E-34 J*s"),
  e: Q("1.602176634E-19 C"),
  kB: Q("1.380649E-23 J/K"),
  NA: Q("6.02214076E23 1/mol"),
  R: Q("1.380649E-23 J/K").multiply(Q("6.02214076E23 1/mol")),
  g0: Q("9.80665 m/s^2"),
  G: Q(new RationalInterval(parseScalarText("6.67415E-11"), parseScalarText("6.67445E-11")), "m^3/(kg*s^2)"),
});

export function isUnit(value) {
  return value instanceof Unit;
}

export function isQuantity(value) {
  return value instanceof Quantity;
}

// Classroom clock times and dates (not a date library; see src/time.js).
import { _registerQuantityFactory } from "./time.js";
_registerQuantityFactory(Q);
export {
  ClockTime, clock, SimpleDate, simpleDate, isLeapYear, daysInMonth, NOT_A_DATE_LIBRARY,
} from "./time.js";

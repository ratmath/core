// One contract for plain JavaScript operands across Core: every binary method
// (arithmetic, comparison, equality, containment, relations) accepts a bigint
// or a safe-integer number as the exact Integer, just as constructors and the
// R template do, and refuses any other number with the same RangeError.
import { describe, expect, test } from "bun:test";
import {
  CertifiedApproximation,
  Fraction,
  FractionInterval,
  Integer,
  Rational,
  RationalInterval,
  RationalIntervalSet,
} from "../index.js";

const r = (n, d = 1) => new Rational(n, d);
const interval = (a, b) => new RationalInterval(r(a), r(b));

// Each case: [label, receiver, method, expected result as a string or value]
const cases = [
  ["Integer", () => new Integer(3), [
    ["add", "5"], ["subtract", "1"], ["multiply", "6"], ["divide", "3/2"],
    ["equals", false], ["compareTo", 1], ["lessThan", false], ["lessThanOrEqual", false],
    ["greaterThan", true], ["greaterThanOrEqual", true], ["possibleRelationsTo", 4],
    ["floorDivide", "1"], ["floorModulo", "1"], ["divmod", "1,1"], ["modulo", "1"],
    ["gcd", "1"], ["lcm", "6"],
  ]],
  ["Rational", () => r(3, 2), [
    ["add", "7/2"], ["subtract", "-1/2"], ["multiply", "3"], ["divide", "3/4"],
    ["equals", false], ["compareTo", -1], ["lessThan", true], ["lessThanOrEqual", true],
    ["greaterThan", false], ["greaterThanOrEqual", false], ["possibleRelationsTo", 1],
  ]],
  ["Fraction", () => new Fraction(3, 2), [
    ["multiply", "6/2"], ["divide", "3/4"], ["mediant", "5/3"],
    ["equals", false], ["lessThan", true], ["lessThanOrEqual", true],
    ["greaterThan", false], ["greaterThanOrEqual", false],
  ]],
  ["RationalInterval", () => interval(1, 2), [
    ["add", "3:4"], ["subtract", "-1:0"], ["multiply", "2:4"], ["divide", "1/2:1"],
    ["equals", false], ["contains", true], ["overlaps", true],
    ["intersection", "2:2"], ["union", "1:2"], ["possibleRelationsTo", 3],
  ]],
  ["RationalIntervalSet", () => new RationalIntervalSet(interval(1, 2)), [
    ["equals", false], ["contains", true], ["intersection", "[2,2]"], ["union", "[1,2]"],
  ]],
  ["CertifiedApproximation", () => new CertifiedApproximation(r(3, 2), interval(1, 2)), [
    ["add", "7/2?[=3:4]"], ["subtract", "-1/2?[=-1:0]"], ["multiply", "3?[=2:4]"],
    ["divide", "3/4?[=1/2:1]"], ["possibleRelationsTo", 3],
  ]],
];

const show = (value) => typeof value === "object" ? String(value) : value;

describe("plain integer operands behave like the Integer 2 everywhere", () => {
  for (const [label, make, methods] of cases) {
    for (const [method, expected] of methods) {
      test(`${label}.${method}`, () => {
        const viaInteger = show(make()[method](new Integer(2)));
        expect(viaInteger).toBe(expected);
        expect(show(make()[method](2))).toBe(expected);
        expect(show(make()[method](2n))).toBe(expected);
      });
    }
  }
});

describe("numbers that are not safe integers are refused everywhere", () => {
  for (const [label, make, methods] of cases) {
    for (const [method] of methods) {
      test(`${label}.${method}`, () => {
        for (const bad of [0.5, 2 ** 60, Number.NaN, Infinity]) {
          expect(() => make()[method](bad)).toThrow(RangeError);
        }
      });
    }
  }
});

describe("specific consequences", () => {
  test("comparisons give correct answers, not silent 0 or a BigInt mix error", () => {
    expect(new Integer(3).compareTo(5)).toBe(-1);
    expect(new Integer(3).greaterThan(2)).toBe(true);
    expect(r(1, 2).lessThan(1)).toBe(true);
    expect(r(4, 2).equals(2)).toBe(true);
    expect(new Integer(-7).equals(-7n)).toBe(true);
    expect(new Fraction(4, 2).equals(2)).toBe(false); // Fraction equality is structural
    expect(new Fraction(2, 1).equals(2)).toBe(true);
  });

  test("an interval contains or equals a plain number as the point [x, x]", () => {
    expect(interval(1, 2).contains(3)).toBe(false);
    expect(interval(2, 2).equals(2)).toBe(true);
    expect(interval(1, 2).contains(r(3, 2))).toBe(true);
    expect(interval(1, 2).contains(new Integer(1))).toBe(true);
    expect(new FractionInterval(new Fraction(2, 1), new Fraction(2, 1)).equals(2)).toBe(true);
    expect(new RationalIntervalSet(interval(1, 2)).contains(3n)).toBe(false);
  });

  test("results match the Integer path in type as well as value", () => {
    expect(new Integer(3).add(2)).toBeInstanceOf(Integer);
    expect(r(3, 2).add(2)).toBeInstanceOf(Rational);
    expect(interval(1, 2).add(2)).toBeInstanceOf(RationalInterval);
  });

  test("the error explains the refusal", () => {
    expect(() => r(1, 2).add(0.1)).toThrow("Operand 0.1 is not a safe integer");
  });
});

import { describe, expect, test } from "bun:test";
import { R, Rational, Region, RationalIntervalSet } from "../index.js";

const S = (q) => q.toString();

describe("R chains: strict links, unbounded ends and ||", () => {
  const x = new Rational(2);
  test(":! forbids a tie across that link", () => {
    expect(R`2:${x}:8`).toBe(true);
    expect(R`2:!${x}:8`).toBe(false);
    expect(R`1:!${x}:!3`).toBe(true);
    expect(R`0:${x}:!2`).toBe(false);
    expect(R`8:${x}:!2`).toBe(false);
    expect(R`8:${x}:!1`).toBe(true);
    expect(R`3!:7`.toString()).toBe("6:7");
  });
  test("_ is an unbounded end, and a chain with one reads ascending", () => {
    expect(R`_:${x}:2`).toBe(true);
    expect(R`_:${x}:!2`).toBe(false);
    expect(R`3:${x}:_`).toBe(false);
    expect(R`1:${x}:_`).toBe(true);
    expect(R`8:${x}:_`).toBe(false);
    expect(R`_:${x}:_`).toBe(true);
    expect(R`_: ${x}+1 :3`).toBe(true);
  });
  test("|| joins chains", () => {
    expect(R`0:${x}:1 || 2:${x}:3`).toBe(true);
    expect(R`0:${x}:1||3:${x}:4`).toBe(false);
    expect(R.between`_:${x}:!-1 || 1:!${x}:_`).toBe(true);
  });
  test("misuse throws", () => {
    expect(() => R`_:5`).toThrow("betweenness chain");
    expect(() => R`2:!5`).toThrow("betweenness chain");
    expect(() => R`1:_:3`).toThrow("either end");
    expect(() => R`(1:2:3) || 1`).toThrow("||");
    expect(() => R`_ + 1`).toThrow();
  });
});

describe("Region", () => {
  test("chains, strict links, unbounded sides and unions", () => {
    const r = R.region`2:!x:8`;
    expect(r.variable).toBe("x");
    expect(r.contains(2)).toBe(false);
    expect(r.contains(8)).toBe(true);
    expect(Region.parse("_:x:8").contains(-1000)).toBe(true);
    expect(Region.parse("_:x:!8").contains(8)).toBe(false);
    expect(Region.parse("2:x:_").contains("2")).toBe(true);
    expect(Region.parse("_:x:_").contains(5)).toBe(true);
    const u = Region.parse("_:x:!-1 || 1:!x:_");
    expect(u.contains(0)).toBe(false);
    expect(u.contains(-2)).toBe(true);
    expect(u.contains(R`3/2`)).toBe(true);
    expect(Region.parse("0 : t :! 1").variable).toBe("t");
  });

  test("an integer variable: 2n:x:!2n+1", () => {
    const even = Region.parse("2n :x:! 2n+1");
    const odd = R.region`2n+1:x:!2n+2`;
    expect(even.integer).toBe("n");
    expect(even.contains("1/2")).toBe(true);
    expect(odd.contains("1/2")).toBe(false);
    expect(even.contains(-2)).toBe(true);
    expect(even.match("5/2").n).toBe(1);
    expect(even.match("-3/2").n).toBe(-1);
    expect(even.breakpoints(0, 3).map(S)).toEqual(["0", "1", "2", "3"]);
    expect(even.intervals(0, 3).map((p) => p.n)).toEqual([0, 1]);
    expect(Region.parse("n:x:!n+1").match("-1/3").n).toBe(-1);
    expect(Region.parse("3(n-1):x:3(n-1)+1").match(4).n).toBe(2);
  });

  test("within gives a RationalIntervalSet", () => {
    const s = Region.parse("2n:x:!2n+1").within(0, 3);
    expect(s).toBeInstanceOf(RationalIntervalSet);
    expect(s.components.length).toBe(2);
    expect(s.containsValue(new Rational(1))).toBe(false);
    expect(s.containsValue(new Rational(3))).toBe(false);
    expect(s.containsValue(new Rational(5, 2))).toBe(true);
    expect(Region.parse("_:x:1").within(-1, 2).containsValue(new Rational(-1))).toBe(true);
  });

  test("parameters and interpolations", () => {
    expect(Region.parse("a:x:b", { params: { a: 1, b: "5/2" } }).contains("5/2")).toBe(true);
    const a = new Rational(1, 3);
    expect(R.region`${a}:!x:${a}+1`.contains(a)).toBe(false);
    expect(R.region`${a}:!x:${a}+1`.contains("4/3")).toBe(true);
    expect(Region.parse("x0:x:x0+h", { params: { x0: 1, h: "1/2" } }).contains("3/2")).toBe(true);
  });

  test("division, powers and unbounded-below integer pieces", () => {
    expect(Region.parse("n/2:x:!(n+1)/2").match("3/4").n).toBe(1);
    expect(Region.parse("2^2:x:(1/2)^-3").contains(5)).toBe(true);
    // n bounded below only: the smallest fitting n
    expect(Region.parse("_:x:!2n").match(4).n).toBe(3);
    expect(Region.parse("_:x:2n").match(3).n).toBe(2);
    // n bounded above only: the largest fitting n
    expect(Region.parse("_:x:-n").match(4).n).toBe(-4);
    expect(Region.parse("_:x:!-n").match(4).n).toBe(-5);
  });

  test("from, test and toString", () => {
    const r = Region.parse(" 2n :x:! 2n+1 ");
    expect(Region.from(r)).toBe(r);
    expect(Region.from("0:x:1").test("1/2")).toBe(true);
    expect(r.toString()).toBe("2n :x:! 2n+1");
    expect(String(R.region`${new Rational(1, 2)}:x:1`)).toBe("1/2:x:1");
  });

  test("bad regions throw", () => {
    expect(() => Region.parse("1/(n-n):x:2")).toThrow("divides by 0");
    expect(() => Region.parse("2^(1/2):x:2")).toThrow("integer powers");
    expect(() => Region.parse("n^2:x:n^2+1")).toThrow("affine");
    expect(() => Region.parse("p:x:4", { params: { p: R`3:4` } })).toThrow("exact rational");
    expect(() => Region.parse("1:y:2", { variable: "x" })).toThrow("middle");
    expect(() => Region.parse("1:x:2 || 1:y:2")).toThrow("middle");
    expect(() => Region.parse("n:x:m")).toThrow("one integer");
    expect(() => Region.parse("1:x:2:3")).toThrow("three parts");
    expect(() => Region.parse(":x:2")).toThrow();
    expect(() => Region.parse("x:x:2")).toThrow("variable");
    expect(() => Region.parse("1:x:2 | 3:x:4")).toThrow();
    expect(() => Region.parse("n:x:n+1").within(-Infinity, 0)).toThrow();
    expect(() => Region.parse("n:x:_").intervals(0, 1)).toThrow("infinitely many");
  });
});

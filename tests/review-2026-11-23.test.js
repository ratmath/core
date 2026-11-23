import { describe, expect, test } from "bun:test";
import {
  BaseSystem, R, Rational, Region, boundedContinuedFractionApproximation, parseNumber,
} from "../index.js";

describe("Region fixes (pre-0.9.0 review)", () => {
  test("an integer-variable chain beside a fixed chain", () => {
    const r = Region.parse("2n:x:!2n+1 || 5:x:_");
    expect(r.within(0, 10).toString()).toBe("[0,1) U [2,3) U [4,10]");
    expect(r.intervals(0, 10).filter((p) => p.n === null)).toHaveLength(1);
    expect(r.breakpoints(4, 6).map(String)).toEqual(["4", "5", "6"]);
  });

  test("breakpoints are sorted without repeats", () => {
    expect(Region.parse("0:x:1 || 1:x:2").breakpoints(0, 3).map(String)).toEqual(["0", "1", "2"]);
    expect(Region.parse("5:x:6 || 1:x:2").breakpoints(0, 9).map(String)).toEqual(["1", "2", "5", "6"]);
  });

  test("intervals skip a piece whose strict end sits on the window edge", () => {
    expect(R.region`2n:x:!2n+1`.intervals(1, 3).map((p) => p.n)).toEqual([1]);
    expect(Region.parse("0:!x:1").intervals(-1, 0)).toEqual([]);
  });

  test("match refuses an integer variable beyond the safe range", () => {
    expect(() => Region.parse("n:x:!n+1").match("123456789012345678901234567890.5")).toThrow(RangeError);
    expect(Region.parse("n:x:!n+1").match("7/2")).toEqual({ n: 3 });
  });
});

describe("R.base fixes", () => {
  test("a base's own digit after 0 is not a prefix", () => {
    expect(R.base(16)`0b1`.toString()).toBe("177");
    expect(R.base(16)`0d5`.toString()).toBe("213");
    expect(R.base(16)`0e5`.toString()).toBe("229");
    expect(R.base(2)`0x1f`.toString()).toBe("31");
    expect(R.base(10)`0xff`.toString()).toBe("255");
  });

  test("signed-radix systems refuse positional fractions", () => {
    const negabinary = new BaseSystem("01", "Negabinary", { radix: -2 });
    expect(R.base(negabinary)`110`.toString()).toBe("2");
    expect(() => R.base(negabinary)`0.1`).toThrow(SyntaxError);
  });
});

describe("one-term continued-fraction approximations", () => {
  test("3.~? reparses", () => {
    for (const q of [new Rational(355, 113), new Rational(-355, 113)]) {
      const a = boundedContinuedFractionApproximation(q, { maxTerms: 1 });
      const back = parseNumber(a.toString());
      expect(back.enclosure.equals(a.enclosure)).toBe(true);
      expect(back.enclosure.containsValue(q)).toBe(true);
    }
    expect(R`3.~?`.enclosure.toString()).toBe("3:4");
  });
});

describe("negative continued-fraction strings round-trip through R", () => {
  test("a negative first term is written with ~", () => {
    for (const [n, d, text] of [[-9n, 4n, "~-3.~1~3"], [-1n, 2n, "~-1.~2"], [9n, 4n, "2.~4"]]) {
      const q = new Rational(n, d);
      expect(q.toContinuedFractionString()).toBe(text);
      expect(R([text]).equals(q)).toBe(true);
      expect(parseNumber(text).equals(q)).toBe(true);
      expect(Rational.fromContinuedFractionString(text).equals(q)).toBe(true);
    }
    const a = boundedContinuedFractionApproximation(new Rational(-355, 113), { maxTerms: 2 });
    expect(a.toString()).toBe("~-4.~1?");
    expect(R([a.toString()]).enclosure.equals(a.enclosure)).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import {
  BaseSystem, NumeralSystem, R, Rational, RationalInterval, Region, boundedContinuedFractionApproximation,
  parseContinuedFraction, parseNumber, reviveCoreValue,
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

describe("continued-fraction sign rule (James, 2026-11-23)", () => {
  // A plain leading - negates the whole value; ~- marks a negative first term.
  const cases = [["-3.~1~3", -15n, 4n], ["~-3.~1~3", -9n, 4n], ["-0.~2", -1n, 2n], ["~-0.~2", 1n, 2n], ["~3.~1~3", 15n, 4n]];
  test.each(cases)("%s", (text, n, d) => {
    const q = new Rational(n, d);
    expect(parseNumber(text).equals(q)).toBe(true);
    expect(R([text]).equals(q)).toBe(true);
    expect(Rational.fromContinuedFractionString(text).equals(q)).toBe(true);
    expect(parseContinuedFraction(text).equals(q)).toBe(true);
    expect(new NumeralSystem({ radix: 10, tokens: "0123456789".split("") }).parse(text).equals(q)).toBe(true);
  });

  test("convergents of a negated continued fraction converge to its value", () => {
    const cs = Rational.convergentsFromCF("-3.~7~15");
    expect(cs.at(-1).equals(new Rational(-333, 106))).toBe(true);
    expect(cs.map(String)).toEqual(new Rational(-333, 106).convergents().map(String));
  });

  test("certified prefixes follow the same rule", () => {
    expect(parseNumber("-3.~7?").enclosure.equals(parseNumber("3.~7?").enclosure.negate())).toBe(true);
    expect(parseNumber("~-4.~1?").enclosure.equals(new RationalInterval(new Rational(-7, 2), new Rational(-3)))).toBe(true);
  });

  test("negateContinuedFraction covers every shape", () => {
    for (let n = -40n; n <= 40n; n++) {
      for (const d of [1n, 2n, 3n, 5n, 7n, 12n]) {
        const q = new Rational(n, d);
        const text = q.toContinuedFractionString();
        expect(R([text]).equals(q)).toBe(true);
        if (n > 0n) expect(Rational.fromContinuedFractionString(`-${text}`).equals(q.negate())).toBe(true);
      }
    }
  });
});

describe("radix shift in a base", () => {
  test("shifts by the literal's base, exponent in that base", () => {
    expect(R`0t1_^10`.toString()).toBe("27");
    expect(R`0t2_^-1`.toString()).toBe("2/3");
    expect(R`0xff_^1`.toString()).toBe("4080");
    expect(R.base(3)`12_^2`.toString()).toBe("45");
    expect(R.base(16)`1_^a`.toString()).toBe(String(16n ** 10n));
    expect(R`2.5_^-2`.toString()).toBe("1/40");
    expect(R`0b1.1_^11 + 1`.toString()).toBe("13");
    expect(() => R`0t1_^1.1`).toThrow();
  });
});

describe("BaseSystem.ROMAN", () => {
  const roman = BaseSystem.ROMAN;
  test("standard numerals both ways", () => {
    for (const [n, s] of [[1n, "I"], [4n, "IV"], [9n, "IX"], [14n, "XIV"], [40n, "XL"], [90n, "XC"], [400n, "CD"], [944n, "CMXLIV"], [1994n, "MCMXCIV"], [3999n, "MMMCMXCIX"], [-14n, "-XIV"]]) {
      expect(roman.fromDecimal(n)).toBe(s);
      expect(roman.toDecimal(s)).toBe(n);
    }
    for (let n = 1n; n <= 3999n; n++) expect(roman.toDecimal(roman.fromDecimal(n))).toBe(n);
    expect(roman.toDecimal("mcmxciv")).toBe(1994n);
  });

  test("refuses non-standard and out-of-range", () => {
    for (const s of ["IIII", "IC", "VX", "MMMM", "XIIV", "A", ""]) expect(() => roman.toDecimal(s)).toThrow();
    expect(roman.isValidString("XIV")).toBe(true);
    expect(roman.isValidString("IIII")).toBe(false);
    expect(() => roman.fromDecimal(0n)).toThrow();
    expect(() => roman.fromDecimal(4000n)).toThrow(RangeError);
    expect(() => roman.fromDecimal(4)).toThrow();
  });

  test("works with Rational, R and JSON", () => {
    expect(new Rational(3, 4).toBase(roman)).toBe("III/IV");
    expect(R.base(roman)`XIV + II`.toString()).toBe("16");
    expect(() => R.base(roman)`X_^I`).toThrow(SyntaxError);
    expect(JSON.parse(JSON.stringify(roman), reviveCoreValue)).toBe(roman);
    expect(roman.isPositional).toBe(false);
    expect(roman.supportsPositionalFractions).toBe(false);
    expect(roman.withCaseSensitivity(false)).toBe(roman);
    expect(roman.equals(new BaseSystem("IVXLCDM"))).toBe(false);
    expect(roman.equals(BaseSystem.ROMAN)).toBe(true);
    expect(BaseSystem.DECIMAL.isPositional).toBe(true);
  });
});

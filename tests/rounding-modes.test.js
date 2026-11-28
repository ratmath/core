import { describe, expect, test } from "bun:test";
import { Integer, R, ROUNDING_MODES, Rational, isRoundingMode, rounding } from "../index.js";

const q = (n, d = 1) => new Rational(n, d);
const show = (values) => values.map(String).join(" ");

// value:            -2.5 -1.5 -1.2 -0.5 0.5 1.2 1.5 2.5 2.7
const inputs = [q(-5, 2), q(-3, 2), q(-6, 5), q(-1, 2), q(1, 2), q(6, 5), q(3, 2), q(5, 2), q(27, 10)];
const table = {
  "half-up":        "-3 -2 -1 -1 1 1 2 3 3",
  "half-down":      "-2 -1 -1 0 0 1 1 2 3",
  "half-even":      "-2 -2 -1 0 0 1 2 2 3",
  "half-odd":       "-3 -1 -1 -1 1 1 1 3 3",
  "half-ceil":      "-2 -1 -1 0 1 1 2 3 3",
  "half-floor":     "-3 -2 -1 -1 0 1 1 2 3",
  "floor":          "-3 -2 -2 -1 0 1 1 2 2",
  "ceil":           "-2 -1 -1 0 1 2 2 3 3",
  "toward-zero":    "-2 -1 -1 0 0 1 1 2 2",
  "away-from-zero": "-3 -2 -2 -1 1 2 2 3 3",
};

describe("named rounding conventions", () => {
  test("every mode is listed and tabulated", () => {
    expect([...ROUNDING_MODES].sort()).toEqual(Object.keys(table).sort());
    expect(ROUNDING_MODES[0]).toBe("half-up");
  });

  for (const [mode, expected] of Object.entries(table)) {
    test(mode, () => {
      expect(show(inputs.map((x) => x.round(mode)))).toBe(expected);
      expect(show(inputs.map((x) => rounding(mode)(x)))).toBe(show(inputs.map((x) => x.round(mode))));
    });
  }

  test("the default is half-up", () => {
    expect(show(inputs.map((x) => x.round()))).toBe(table["half-up"]);
    expect(rounding().mode).toBe("half-up");
  });

  test("unknown modes are refused with the list", () => {
    expect(() => q(1, 2).round("nearest")).toThrow("half-up, half-down");
    expect(() => rounding("bankers")).toThrow(TypeError);
    expect(isRoundingMode("half-odd")).toBe(true);
    expect(isRoundingMode(() => 0n)).toBe(true);
    expect(isRoundingMode("up")).toBe(false);
  });
});

describe("rounders", () => {
  test("round to an Integer, or to decimal places as a Rational", () => {
    const bankers = rounding("half-even");
    expect(bankers(R`6.5`)).toBeInstanceOf(Integer);
    expect(String(bankers(R`6.5`))).toBe("6");
    expect(bankers(R`2.675`, 2).equals(q(268, 100))).toBe(true);
    expect(bankers(65, -1).equals(q(60))).toBe(true);
    expect(rounding()(65n, -1).equals(q(70))).toBe(true);
    expect(String(rounding("ceil")("1/3"))).toBe("1");
    expect(String(rounding()(new Integer(4)))).toBe("4");
    expect(Object.isFrozen(bankers)).toBe(true);
    expect(() => bankers({})).toThrow(TypeError);
    expect(() => bankers(0.5)).toThrow(RangeError);
  });

  test("a custom convention gets value, floor, ceil and fraction", () => {
    const seen = [];
    const generous = rounding((info) => {
      seen.push(info);
      return info.fraction.lessThan(q(7, 10)) ? info.floor : info.ceil;
    });
    expect(String(generous(R`6.65`))).toBe("6");
    expect(String(generous(R`6.7`))).toBe("7");
    expect(String(generous(R`-6.2`))).toBe("-6"); // fraction of -6.2 above floor -7 is 0.8
    expect(String(generous(5))).toBe("5");         // integers never call the function
    expect(seen).toHaveLength(3);
    expect(seen[2].floor.toString()).toBe("-7");
    expect(seen[2].fraction.equals(q(4, 5))).toBe(true);
    expect(generous(R`3.14159`, 2).equals(q(314, 100))).toBe(true);
  });

  test("a custom function may return bigints or numbers, but only floor or ceil", () => {
    expect(String(q(7, 2).round(({ floor }) => floor.value))).toBe("3");
    expect(String(q(7, 2).round(() => 4))).toBe("4");
    expect(() => q(7, 2).round(() => 5n)).toThrow("floor or the ceiling");
    expect(() => q(7, 2).round(() => "4")).toThrow(RangeError);
  });

  test("Integer.round accepts the same modes", () => {
    const n = new Integer(5);
    expect(n.round("half-odd")).toBe(n);
    expect(n.round(() => 0n)).toBe(n);
    expect(() => n.round("nearest")).toThrow(TypeError);
  });
});

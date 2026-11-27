import { describe, expect, test } from "bun:test";
import { Integer, Rational } from "../index.js";
import { Q, units, BASE_DIMENSIONS } from "../src/units.js";

const q = (n, d = 1n) => new Rational(BigInt(n), BigInt(d));

describe("exact rounding to Core Integers", () => {
  test("roundInteger matches round() for every mode, as an Integer", () => {
    const modes = ["half-even", "half-up", "toward-zero", "floor", "ceil"];
    for (let n = -25; n <= 25; n++) {
      for (const d of [1, 2, 3, 4, 10]) {
        const x = q(n, d);
        for (const m of modes) {
          const r = x.roundInteger(m);
          expect(r).toBeInstanceOf(Integer);
          expect(r.value).toBe(x.round(m));
        }
        expect(x.floorInteger().value).toBe(x.floor());
        expect(x.ceilInteger().value).toBe(x.ceil());
        expect(x.truncInteger().value).toBe(x.trunc());
      }
    }
  });

  test("school rounding is half-up; the default is half-even", () => {
    expect(q(65, 10).roundInteger().toString()).toBe("6");
    expect(q(65, 10).roundInteger("half-up").toString()).toBe("7");
    expect(q(-5, 2).roundInteger("half-up").toString()).toBe("-3");
    // Integer results chain into Core arithmetic.
    expect(q(65, 10).roundInteger("half-up").multiply(new Integer(10n)).toString()).toBe("70");
    expect(() => q(1, 2).roundInteger("nearest")).toThrow();
  });

  test("Integer has the same names", () => {
    const n = new Integer(-7n);
    expect(n.roundInteger()).toBe(n);
    expect(n.floorInteger()).toBe(n);
    expect(n.ceilInteger()).toBe(n);
    expect(n.truncInteger()).toBe(n);
  });
});

describe("digits and place value", () => {
  test("digits of an integer", () => {
    expect(new Integer(486n).digits()).toEqual([4, 8, 6]);
    expect(new Integer(-486n).digits()).toEqual([4, 8, 6]);
    expect(new Integer(0n).digits()).toEqual([0]);
    expect(new Integer(10n).digits(2)).toEqual([1, 0, 1, 0]);
    expect(new Integer(255n).digits(16)).toEqual([15, 15]);
    expect(() => new Integer(5n).digits(1)).toThrow();
  });

  test("digits rebuild the number (independent check)", () => {
    for (const n of [0n, 7n, 486n, 1000n, 987654321987654321n]) {
      for (const b of [2, 3, 10, 16]) {
        const back = new Integer(n).digits(b).reduce((acc, d) => acc * BigInt(b) + BigInt(d), 0n);
        expect(back).toBe(n);
      }
    }
  });

  test("place value of 8 in 486 is 80", () => {
    const n = new Integer(486n);
    expect(n.digitAt(1)).toBe(8);
    expect(n.placeValue(1).toString()).toBe("80");
    expect(n.placeValue(2).toString()).toBe("400");
    expect(n.placeValue(5).toString()).toBe("0");
    expect(n.placeValue(-1).toString()).toBe("0");
    expect(new Integer(-486n).placeValue(0).toString()).toBe("-6");
  });

  test("fractional places, including repeating expansions", () => {
    const x = q(347, 100);
    expect(x.digitAt(0)).toBe(3);
    expect(x.digitAt(-1)).toBe(4);
    expect(x.placeValue(-2).toString()).toBe("7/100");
    expect(q(1, 3).digitAt(-7)).toBe(3);
    expect(q(1, 7).digitAt(-3)).toBe(2); // 0.142857...
    expect(q(-347, 100).placeValue(-1).toString()).toBe("-2/5");
    expect(q(5, 8).digitAt(-3, 2)).toBe(1); // 0.101 in base 2
  });

  test("place values add back to the number", () => {
    const x = q(98765, 1000);
    let sum = new Rational(0n);
    for (let k = -3; k <= 1; k++) sum = sum.add(x.placeValue(k));
    expect(sum.equals(x)).toBe(true);
  });
});

describe("money", () => {
  test("Money is a base dimension with USD", () => {
    expect(BASE_DIMENSIONS).toContain("Money");
    expect(units.coherentUnit({ Money: 1 }).toString()).toBe("USD");
  });

  test("coins add up exactly", () => {
    const total = Q("3 quarter").add(Q("2 dime")).add(Q("4 penny"));
    expect(total.to("cent").toString()).toBe("99 cent");
    expect(Q("1 nickel").to("penny").value.toString()).toBe("5");
    expect(Q("2 dollars").to("quarters").value.toString()).toBe("8");
    expect(Q("1 USD").equals(Q("100 cents"))).toBe(true);
    expect(() => Q("1 dime").to("m")).toThrow();
  });
});

describe("clock text", () => {
  test("h:mm and h:mm:ss", () => {
    expect(Q("150 min").add(Q("45 min")).toClock()).toBe("3:15");
    expect(Q("13/4 h").toClock({ seconds: true })).toBe("3:15:00");
    expect(Q("3725 s").toClock({ seconds: true })).toBe("1:02:05");
    expect(Q("26 h").toClock()).toBe("26:00");
    expect(Q("-90 min").toClock()).toBe("-1:30");
  });

  test("time of day", () => {
    expect(Q("13.5 h").toClock({ wrap: 12 })).toBe("1:30");
    expect(Q("13.5 h").toClock({ wrap: 24 })).toBe("13:30");
    expect(Q("30 min").toClock({ wrap: 12 })).toBe("12:30");
    expect(Q("25 h").toClock({ wrap: 24 })).toBe("1:00");
    expect(() => Q("-1 h").toClock({ wrap: 12 })).toThrow();
    expect(() => Q("1 h").toClock({ wrap: 10 })).toThrow();
  });

  test("exactness: no silent rounding", () => {
    expect(() => Q("100 s").toClock()).toThrow(/whole number of minutes/);
    expect(Q("100 s").toClock({ round: "half-up" })).toBe("0:02");
    expect(Q("100 s").toClock({ round: "floor" })).toBe("0:01");
    expect(Q("5/4 s").toClock({ seconds: true })).toBe("0:00:01.25");
    expect(() => Q("1/3 s").toClock({ seconds: true })).toThrow();
    expect(Q("1/3 s").toClock({ seconds: true, round: "half-up" })).toBe("0:00:00");
    expect(() => Q("3 m").toClock()).toThrow(TypeError);
  });

  test("clock text reads back to the same duration (independent check)", () => {
    for (const s of [0, 59, 60, 3599, 3600, 86399, 123456]) {
      const [h, m, sec] = Q(`${s} s`).toClock({ seconds: true }).split(":").map(Number);
      expect(h * 3600 + m * 60 + sec).toBe(s);
    }
  });
});

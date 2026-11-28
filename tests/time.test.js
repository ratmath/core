import { describe, expect, test } from "bun:test";
import {
  ClockTime, NOT_A_DATE_LIBRARY, Q, SimpleDate, clock, daysInMonth, isLeapYear, simpleDate,
} from "../src/units.js";

describe("clock times", () => {
  test("reading and writing", () => {
    expect(clock("9:45 AM").toString()).toBe("9:45 AM");
    expect(clock("9:45 pm").toString({ hours: 24 })).toBe("21:45");
    expect(clock("12:00 AM").hour).toBe(0);
    expect(clock("12:30 PM").hour).toBe(12);
    expect(clock("21:05").toString()).toBe("9:05 PM");
    expect(clock(9, 5, 30).toString()).toBe("9:05:30 AM");
    expect(clock(7, 0, 0, "PM").toString({ hours: 24, seconds: true })).toBe("19:00:00");
    expect(JSON.stringify(clock("9:45"))).toBe('"09:45:00"');
  });

  test("adding wraps around midnight and counts days", () => {
    expect(clock("9:45 AM").add("150 min").toString()).toBe("12:15 PM");
    const late = clock("10:30 PM").add(Q("3 h"));
    expect(late.toString()).toBe("1:30 AM");
    expect(late.daysLater).toBe(1);
    const early = clock("1:00 AM").subtract("2 h");
    expect(early.toString()).toBe("11:00 PM");
    expect(early.daysLater).toBe(-1);
    expect(clock("8:00").add("2 day").daysLater).toBe(2);
  });

  test("elapsed time", () => {
    expect(clock("10:30 PM").until(clock("1:15 AM")).toClock()).toBe("2:45");
    expect(clock("8:10").until("9:45").to("min").value.toString()).toBe("95");
    expect(clock("9:45").subtract(clock("8:10")).toString()).toBe("95 min");
    expect(clock("8:10").subtract(clock("9:45")).toString()).toBe("-95 min");
    expect(clock("9:00:00").until("9:00:30").toString()).toBe("30 s");
  });

  test("comparison", () => {
    expect(clock("9:00").equals(clock("9:00 AM"))).toBe(true);
    expect(clock("9:00").compareTo(clock("21:00"))).toBe(-1);
  });

  test("refusals", () => {
    expect(() => clock("25:00")).toThrow(RangeError);
    expect(() => clock("13:00 PM")).toThrow(RangeError);
    expect(() => clock("9:60")).toThrow(RangeError);
    expect(() => clock("noon")).toThrow(SyntaxError);
    expect(() => clock("9:00").add("1.5 s")).toThrow("whole seconds");
    expect(() => clock("9:00").add("3 m")).toThrow(TypeError);
    expect(() => new ClockTime(86400)).toThrow(RangeError);
  });
});

describe("simple dates", () => {
  test("weekdays against known dates", () => {
    expect(simpleDate("1970-01-01").weekdayName).toBe("Thursday");
    expect(simpleDate("1776-07-04").weekdayName).toBe("Thursday");
    expect(simpleDate("2000-01-01").weekdayName).toBe("Saturday");
    expect(simpleDate(2026, 11, 28).toLongString()).toBe("Saturday, November 28, 2026");
  });

  test("leap years and month lengths", () => {
    expect([1900, 2000, 2024, 2025].map(isLeapYear)).toEqual([false, true, true, false]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2023, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(simpleDate("2024-12-31").dayOfYear).toBe(366);
  });

  test("counting days", () => {
    const d = simpleDate("2026-11-28");
    expect(d.daysUntil("2027-01-01")).toBe(34);
    expect(d.addDays(34).toString()).toBe("2027-01-01");
    expect(simpleDate(2024, 2, 28).addDays(1).toString()).toBe("2024-02-29");
    expect(simpleDate(2000, 3, 1).addDays(-1).toString()).toBe("2000-02-29");
    expect(simpleDate("0001-01-01").daysUntil("9999-12-31")).toBe(3652058);
  });

  test("round trip through every day of a 400-year cycle", () => {
    let date = simpleDate(2000, 1, 1);
    for (let i = 0; i < 146097; i += 1) {
      const next = date.addDays(1);
      expect(date.daysUntil(next)).toBe(1);
      expect(next.weekday).toBe((date.weekday + 1) % 7);
      date = next;
    }
    expect(date.toString()).toBe("2400-01-01");
  });

  test("refusals and the warning", () => {
    expect(() => simpleDate("2025-02-29")).toThrow(RangeError);
    expect(() => simpleDate("11/28/2026")).toThrow(SyntaxError);
    expect(() => new SimpleDate(0, 1, 1)).toThrow(RangeError);
    expect(NOT_A_DATE_LIBRARY).toContain("Temporal");
  });
});

describe("small paths", () => {
  test("pass-through, getters and options", () => {
    const t = clock("9:45");
    expect(clock(t)).toBe(t);
    expect([t.minute, t.second, t.isAM]).toEqual([45, 0, true]);
    expect(() => t.toString({ hours: 10 })).toThrow(RangeError);
    expect(() => clock(9, 0, 0, "XM")).toThrow(RangeError);
    expect(() => t.add(5)).toThrow(TypeError);
    const d = simpleDate("2024-02-10");
    expect(simpleDate(d)).toBe(d);
    expect([d.isLeapYear, d.daysInMonth, d.monthName, d.serial]).toEqual([true, 29, "February", 19763]);
    expect(d.equals(simpleDate(2024, 2, 10))).toBe(true);
    expect(d.compareTo("2024-02-11")).toBe(-1);
    expect(JSON.stringify(d)).toBe('"2024-02-10"');
  });
});


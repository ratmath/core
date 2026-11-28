// Classroom clock times and dates.
//
//   import { clock, simpleDate } from "@ratmath/core/units";
//   clock("9:45 AM").add("150 min").toString();        // "12:15 PM"
//   clock("10:30 PM").until(clock("1:15 AM")).toClock(); // "2:45"
//   simpleDate("2026-11-28").weekdayName;               // "Saturday"
//
// WARNING: this is NOT a date library. It is a small set of exact helpers for
// classroom explorations: elapsed time on a clock face, leap years, days in a
// month, days between two dates, the day of the week. It knows nothing about
// time zones, daylight saving time, leap seconds, locales, or calendars other
// than the proleptic Gregorian one (dates before 1582 are not the historical
// Julian dates). For real dates and times use Temporal (Temporal.PlainDate,
// Temporal.PlainTime, Temporal.ZonedDateTime) where your runtime has it, or its
// polyfill @js-temporal/polyfill, or a maintained library such as Luxon or
// date-fns (with date-fns-tz for zones).

import { Integer } from "./integer.js";
import { Rational } from "./rational.js";

export const NOT_A_DATE_LIBRARY =
  "Classroom helpers only: no time zones, daylight saving, leap seconds or historical calendars. " +
  "For real dates and times use Temporal (or @js-temporal/polyfill), Luxon or date-fns.";

const DAY_SECONDS = 86400;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function checkInteger(value, label, low, high) {
  if (!Number.isSafeInteger(value) || value < low || value > high) {
    throw new RangeError(`${label} must be a whole number from ${low} to ${high}`);
  }
  return value;
}

const floorDiv = (a, b) => Math.floor(a / b);
const mod = (a, b) => ((a % b) + b) % b;

// A duration in whole seconds, from a Time Quantity or a string such as "150 min".
let quantityFactory = null;
/** @internal units.js hands over Q so this module need not import it. */
export function _registerQuantityFactory(Q) {
  quantityFactory = Q;
}

function durationSeconds(duration) {
  const q = typeof duration === "string" ? quantityFactory(duration) : duration;
  if (typeof q?.to !== "function") {
    throw new TypeError('A duration is a time Quantity or a string such as "2 h" or "45 min"');
  }
  let value;
  try {
    value = q.to("s").value;
  } catch {
    throw new TypeError("A duration must be a time (s, min, h, day, ...)");
  }
  const r = value instanceof Integer ? new Rational(value.value) : value;
  if (!(r instanceof Rational) || r.denominator !== 1n) {
    throw new RangeError("Clock arithmetic uses whole seconds; round the duration first");
  }
  return Number(r.numerator);
}

function secondsQuantity(seconds) {
  return seconds % 60 === 0 ? quantityFactory(seconds / 60, "min") : quantityFactory(seconds, "s");
}

// ---------------------------------------------------------------------------
// Clock times

/**
 * A time of day on a 24-hour clock, to the second. Adding a duration wraps
 * around midnight; `daysLater` on the result counts the midnights crossed.
 */
export class ClockTime {
  #seconds;

  /** @param {number} secondsSinceMidnight 0 to 86399 @param {number} [daysLater] */
  constructor(secondsSinceMidnight, daysLater = 0) {
    this.#seconds = checkInteger(secondsSinceMidnight, "Seconds since midnight", 0, DAY_SECONDS - 1);
    /** Midnights crossed by the add or subtract that made this time (negative going back). */
    this.daysLater = daysLater;
    Object.freeze(this);
  }

  get hour() { return floorDiv(this.#seconds, 3600); }
  get minute() { return floorDiv(this.#seconds, 60) % 60; }
  get second() { return this.#seconds % 60; }
  get secondsSinceMidnight() { return this.#seconds; }
  get isAM() { return this.#seconds < 43200; }

  #shift(seconds) {
    const total = this.#seconds + seconds;
    return new ClockTime(mod(total, DAY_SECONDS), floorDiv(total, DAY_SECONDS));
  }

  /** The time a duration later: a time Quantity or a string such as "2 h" or "45 min". */
  add(duration) {
    return this.#shift(durationSeconds(duration));
  }

  /** A duration earlier, or, given another ClockTime, the signed duration between them on the same day. */
  subtract(other) {
    if (other instanceof ClockTime) return secondsQuantity(this.#seconds - other.secondsSinceMidnight);
    return this.#shift(-durationSeconds(other));
  }

  /** Elapsed time going forward from this time to `later`, past midnight if needed (0 up to 24 h). */
  until(later) {
    const end = later instanceof ClockTime ? later : clock(later);
    return secondsQuantity(mod(end.secondsSinceMidnight - this.#seconds, DAY_SECONDS));
  }

  equals(other) {
    return other instanceof ClockTime && other.secondsSinceMidnight === this.#seconds;
  }

  compareTo(other) {
    return Math.sign(this.#seconds - other.secondsSinceMidnight);
  }

  /**
   * "9:45 AM" by default; `{ hours: 24 }` gives "09:45"; seconds are shown
   * when not zero, or always with `{ seconds: true }`.
   */
  toString({ hours = 12, seconds } = {}) {
    if (hours !== 12 && hours !== 24) throw new RangeError("hours must be 12 or 24");
    const showSeconds = seconds ?? this.second !== 0;
    const tail = `:${String(this.minute).padStart(2, "0")}` +
      (showSeconds ? `:${String(this.second).padStart(2, "0")}` : "");
    if (hours === 24) return `${String(this.hour).padStart(2, "0")}${tail}`;
    const h = this.hour % 12 === 0 ? 12 : this.hour % 12;
    return `${h}${tail} ${this.isAM ? "AM" : "PM"}`;
  }

  toJSON() {
    return this.toString({ hours: 24, seconds: true });
  }
}

/**
 * clock("9:45"), clock("9:45:30 PM"), clock("21:05"), clock(9, 45) or
 * clock(9, 45, 0, "PM"). Without AM/PM the hour is on a 24-hour clock.
 */
export function clock(hourOrText, minute = 0, second = 0, meridiem) {
  if (hourOrText instanceof ClockTime) return hourOrText;
  let hour = hourOrText;
  if (typeof hourOrText === "string") {
    const m = /^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([aApP])?\.?\s*[mM]?\.?\s*$/.exec(hourOrText);
    if (!m) throw new SyntaxError(`Cannot read "${hourOrText}" as a clock time such as "9:45" or "9:45 PM"`);
    hour = Number(m[1]);
    minute = Number(m[2]);
    second = m[3] === undefined ? 0 : Number(m[3]);
    meridiem = m[4] && (m[4].toUpperCase() === "A" ? "AM" : "PM");
  }
  checkInteger(minute, "Minute", 0, 59);
  checkInteger(second, "Second", 0, 59);
  if (meridiem !== undefined) {
    const half = String(meridiem).toUpperCase();
    if (half !== "AM" && half !== "PM") throw new RangeError('meridiem must be "AM" or "PM"');
    checkInteger(hour, "Hour on a 12-hour clock", 1, 12);
    hour = (hour % 12) + (half === "PM" ? 12 : 0);
  } else {
    checkInteger(hour, "Hour", 0, 23);
  }
  return new ClockTime(hour * 3600 + minute * 60 + second);
}

// ---------------------------------------------------------------------------
// Dates

/** True for a leap year in the Gregorian calendar (every 4th, but not centuries unless divisible by 400). */
export function isLeapYear(year) {
  checkInteger(year, "Year", 1, 9999);
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Days in a month (1 = January) of a year. */
export function daysInMonth(year, month) {
  checkInteger(month, "Month", 1, 12);
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  checkInteger(year, "Year", 1, 9999);
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

// Days since 1970-01-01 (Howard Hinnant's days_from_civil) and back.
function toSerial(y, m, d) {
  y -= m <= 2 ? 1 : 0;
  const era = floorDiv(y, 400);
  const yoe = y - era * 400;
  const doy = floorDiv(153 * (m + (m > 2 ? -3 : 9)) + 2, 5) + d - 1;
  const doe = yoe * 365 + floorDiv(yoe, 4) - floorDiv(yoe, 100) + doy;
  return era * 146097 + doe - 719468;
}

function fromSerial(z) {
  z += 719468;
  const era = floorDiv(z, 146097);
  const doe = z - era * 146097;
  const yoe = floorDiv(doe - floorDiv(doe, 1460) + floorDiv(doe, 36524) - floorDiv(doe, 146096), 365);
  const doy = doe - (365 * yoe + floorDiv(yoe, 4) - floorDiv(yoe, 100));
  const mp = floorDiv(5 * doy + 2, 153);
  const d = doy - floorDiv(153 * mp + 2, 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

/**
 * A calendar date in the proleptic Gregorian calendar, years 1 to 9999, with
 * no time of day and no time zone. See NOT_A_DATE_LIBRARY.
 */
export class SimpleDate {
  #serial;

  constructor(year, month, day) {
    checkInteger(year, "Year", 1, 9999);
    checkInteger(day, "Day", 1, daysInMonth(year, month));
    this.year = year;
    this.month = month;
    this.day = day;
    this.#serial = toSerial(year, month, day);
    Object.freeze(this);
  }

  /** Days since 1970-01-01 (negative before). */
  get serial() { return this.#serial; }
  /** 0 = Sunday ... 6 = Saturday. */
  get weekday() { return mod(this.#serial + 4, 7); }
  get weekdayName() { return WEEKDAYS[this.weekday]; }
  get monthName() { return MONTHS[this.month - 1]; }
  /** 1 for January 1. */
  get dayOfYear() { return this.#serial - toSerial(this.year, 1, 1) + 1; }
  get isLeapYear() { return isLeapYear(this.year); }
  get daysInMonth() { return daysInMonth(this.year, this.month); }

  /** The date n days later (n may be negative). */
  addDays(n) {
    checkInteger(n, "Number of days", -3652059, 3652059);
    return new SimpleDate(...fromSerial(this.#serial + n));
  }

  /** Signed number of days from this date to `other` (positive when other is later). */
  daysUntil(other) {
    return simpleDate(other).serial - this.#serial;
  }

  equals(other) {
    return other instanceof SimpleDate && other.serial === this.#serial;
  }

  compareTo(other) {
    return Math.sign(this.#serial - simpleDate(other).serial);
  }

  /** "2026-11-28" */
  toString() {
    return `${String(this.year).padStart(4, "0")}-${String(this.month).padStart(2, "0")}-${String(this.day).padStart(2, "0")}`;
  }

  /** "Saturday, November 28, 2026" */
  toLongString() {
    return `${this.weekdayName}, ${this.monthName} ${this.day}, ${this.year}`;
  }

  toJSON() {
    return this.toString();
  }
}

/** simpleDate("2026-11-28"), simpleDate(2026, 11, 28) or a SimpleDate. */
export function simpleDate(yearOrText, month, day) {
  if (yearOrText instanceof SimpleDate) return yearOrText;
  if (typeof yearOrText === "string") {
    const m = /^\s*(\d{4})-(\d{1,2})-(\d{1,2})\s*$/.exec(yearOrText);
    if (!m) throw new SyntaxError(`Cannot read "${yearOrText}" as a date; write it as "2026-11-28"`);
    return new SimpleDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  return new SimpleDate(yearOrText, month, day);
}

// A rounder: one rounding convention, chosen once and reused.
//
//   import { rounding } from "@ratmath/core";
//   const bankers = rounding("half-even");
//   bankers(R`6.5`);           // Integer 6
//   bankers(R`2.675`, 2);      // 2.68 (a true tie, so to the even digit)
//
//   // Your own convention: round up only from 0.7 on.
//   const generous = rounding(({ floor, ceil, fraction }) =>
//     fraction.lessThan(new Rational(7, 10)) ? floor : ceil);
//
// Nothing here changes how round() behaves elsewhere: a rounder is a value
// you pass around, not a global setting, so one library's choice cannot
// change another's results.

import { Integer } from "./integer.js";
import { Rational, ROUNDING_MODES, checkRoundingMode, isRoundingMode } from "./rational.js";

export { ROUNDING_MODES, isRoundingMode };

function asExact(value) {
  if (value instanceof Rational || value instanceof Integer) return value;
  if (typeof value === "bigint" || typeof value === "number" || typeof value === "string") {
    return new Rational(value);
  }
  throw new TypeError("A rounder takes an Integer, Rational, bigint, safe integer or exact string");
}

/**
 * Make a rounding function for one convention.
 * @param {string|Function} [mode] a name from ROUNDING_MODES (default
 *   "half-up"), or a function given { value, floor, ceil, fraction } for a
 *   non-integer value and returning floor or ceil
 * @returns {(value: any, places?: number) => Integer|Rational} without
 *   places, the nearest Integer by that convention; with places, a Rational
 *   rounded to that many decimal places (negative for tens, hundreds, ...)
 */
export function rounding(mode = "half-up") {
  checkRoundingMode(mode);
  const round = (value, places) => {
    const x = asExact(value);
    if (places === undefined) return x.round(mode);
    return (x instanceof Rational ? x : new Rational(x.value)).roundTo(places, mode);
  };
  return Object.freeze(Object.assign(round, { mode }));
}

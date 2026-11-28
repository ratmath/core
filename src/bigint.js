/**
 * Convert a numeric API input to BigInt without silently accepting an
 * already-rounded JavaScript number.
 *
 * @param {number|string|bigint} value
 * @param {string} label
 * @returns {bigint}
 */
export function toExactBigInt(value, label = "Value") {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(
        `${label} must be a safe integer; use a string or bigint for exact values`,
      );
    }
    return BigInt(value);
  }

  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  throw new TypeError(`${label} must be an integer number, string, or bigint`);
}

/**
 * The plain-JavaScript operands that binary methods (add, compareTo, equals,
 * contains, ...) accept next to Core values: a bigint, or a number that is a
 * safe integer, exactly as constructors and the R template accept them.
 * Any other number is refused, because it may already have been rounded.
 *
 * @param {*} value
 * @returns {bigint|undefined} the integer, or undefined when value is not a
 *   number or bigint (the method then handles it as a Core value)
 * @throws {RangeError} for a number that is not a safe integer
 */
export function plainIntegerOperand(value) {
  if (typeof value === "bigint") return value;
  if (typeof value !== "number") return undefined;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(
      `Operand ${value} is not a safe integer, so it may already be rounded; pass a bigint or an exact Core value instead`,
    );
  }
  return BigInt(value);
}

# Changelog

## Unreleased

### Added

- Classroom clock times and dates in `@ratmath/core/units`, explicitly not a
  date library (no time zones, daylight saving, leap seconds or historical
  calendars; the docs point to Temporal, Luxon and date-fns). `clock("9:45
  AM")` adds and subtracts durations around midnight (`daysLater` counts
  midnights) and `until` gives elapsed time; `simpleDate("2026-11-28")` has
  weekday and month names, day of year, `addDays` and `daysUntil`; plus
  `isLeapYear`, `daysInMonth` and the `NOT_A_DATE_LIBRARY` notice.
- `engines` lists `bun >=1.4.2` (Bun 1.4.0 caps BigInt at 2^20 bits).
- Plain operands: every binary method (arithmetic, comparisons, `equals`,
  interval/set `contains`/`overlaps`/`intersection`/`union`,
  `possibleRelationsTo`, Integer `gcd`/`modulo`/floor division) on Integer,
  Rational, Fraction, RationalInterval, FractionInterval, RationalIntervalSet
  and CertifiedApproximation accepts a bigint or safe-integer number as the
  exact Integer, as constructors and `R` already did. Other numbers (0.5,
  2^60, NaN) throw one RangeError. Interval and set methods read a number,
  Integer or Rational as the point [x, x]. Previously `Integer#compareTo(2)`
  returned 0, Rational/Fraction comparisons threw a BigInt-mix TypeError and
  interval `contains(2)` crashed.
- `Rational#roundInteger(mode)`, `floorInteger()`, `ceilInteger()` and
  `truncInteger()` return a Core `Integer` (the older `round`, `floor`,
  `ceil` and `trunc` still return bigints). `Integer` has the same names,
  returning itself.
- Place value: `Integer#digits(base)`, and `digitAt(k, base)` and
  `placeValue(k, base)` on `Integer` and `Rational` (k = 0 ones, 1 tens,
  -1 tenths), exact for repeating expansions too.
- Units: a Money dimension with `USD` (`dollar`), `cent` and the coins
  `penny`, `nickel`, `dime`, `quarter`.
- `Quantity#toClock({ seconds, wrap, round })` writes a duration as `h:mm`
  or `h:mm:ss`, exactly; `wrap: 12` or `24` reads it as a time of day.

### Fixed

- `FractionInterval#mediantSplit` (and so `partitionWithMediants`) keeps the
  mediant inside the interval when the endpoints' denominators have different
  signs: `[1/-2, 1/3]` split at `2` before, now at `0/5`. Same-sign pairs are
  unchanged.

### Docs

- The integers page separates safe `number` inputs, engine BigInt capacity and
  library budgets.

- The rounding section says first that the default is round half to even
  and shows school rounding with `"half-up"`.

## 0.11.1 - 2026-11-26

### Added

- `UnitSystem#register(key, unit)` makes an existing `Unit` reachable under
  a key (its name or an alias) while keeping the same object, and a unit's
  prefix rule now lives on the unit as `unit.prefixes` (`"SI"`,
  `"SI+binary"` or `null`). RiX uses both to build a unit system from its
  `.Units` collection.

### Changed

- Using `degC` or `degF` in a product, quotient or power now says it
  "cannot be used in a compound unit".

### Fixed

- `define(name, unit)` keeps the unit's kind, offset and difference unit, so
  a unit defined from `degC` is an affine scale rather than a plain one.

## 0.11.0 - 2026-11-26

### Added

- `@ratmath/core/units`: units and quantities with exact conversions. A
  `Quantity` keeps its magnitude (any Core number, intervals included) in the
  unit it was written in; `to`, `toBase` and `simplify` convert by exact
  factors. Unit sizes are a rational times a power of pi, so degrees, turns
  and parsecs stay exact. Temperatures follow affine rules (`degC`/`degF`
  points, `delta…` differences, `K` absolute). Unit expressions parse from
  text (`"kg*m^2/s^2"`, `"N m"`, `"m·s⁻²"`), SI and binary prefixes apply to
  the units that take them, and `constants` holds the exact SI defining
  constants and `G` as an interval. `units.extend({ scalars })` copies the
  catalogue and can swap the magnitude arithmetic. Types in `units.d.ts`; a
  new docs page. The main entry point is unchanged.

## 0.10.0 - 2026-11-24

### Added

- `@ratmath/core/refine`: the `Refinement` class and `live()` loop that
  linalg, analytic and graphics each carried a copy of. A `Refinement` has a
  float preview (`quick`), an exact answer computed by a generator
  (`exact()`, `stages()`), and `settle()` to run it in time slices with an
  `AbortSignal`. `live()` wires one to a slider and finishes only the latest
  question. Types ship in `refine.d.ts`. The main entry point is unchanged.
- `MultiRegion`: chains on several variables joined with `&&` and `||`, such
  as `0:x:1 && 0:y:x` or `n:x:!n+1 && m:y:!m+1`. Bounds are affine in the
  variables, parameters and integers and may use any variable in any order.
  `contains` and `match` take a point (an array in variable order, or an
  object); `cells(box)` lists the convex pieces with their bounds in variable
  order, constraints, exact corners (marked `included` or not), bounding box
  and length or area; `section` and `breakpoints` give one-variable views.
  `Region.parse(text, { variables })`, `MultiRegion.parse` and `R.region`
  build one.

### Changed

- `Region.parse` and `R.region` return a `MultiRegion` when the text joins
  chains with `&&` or uses more than one variable, or when `variables` is
  given. Chains on different variables used to throw.

## 0.9.0 — 2026-11-22

Betweenness chains gain strict links, unbounded ends and unions, and a new
`Region` reads them as sets (moved from `@ratmath/analytic`).

### Added

- `:!` is a strict link in an `R` chain: ``R`2:!${x}:8` `` is 2 < x ≤ 8 and
  ``R`2:${x}:!8` `` is 2 ≤ x < 8.
- `_` beside a colon (`_:` or `:_`) is an unbounded end: ``R`_:${x}:8` `` is
  x ≤ 8. A chain with `_` reads ascending. `_` anywhere else throws, as do
  two-value forms such as ``R`_:5` `` and ``R`2:!5` ``.
- `||` joins chains: ``R`0:${x}:1 || 2:${x}:3` ``.
- `Region` and `R.region`: chains on a variable as a set of rationals, with
  parameters, unions with `||`, and one integer variable affine in the bounds
  (``R.region`2n:x:!2n+1` ``). Methods `match`, `contains`, `intervals`,
  `breakpoints` and `within` (a `RationalIntervalSet`).

### Changed

- Continued-fraction signs follow RiX in every parser (`R`, `parseNumber`,
  `parseContinuedFraction`, `Rational.fromContinuedFractionString`,
  `convergentsFromCF`, `NumeralSystem.parse`): a plain leading `-` negates the
  whole value, so `-3.~1~3` is −(3.~1~3) = −15/4, and `~-3.~1~3` has first
  term −3, so it is −3 + 1/(1 + 1/3) = −9/4. Before, the parsers other than `R`
  read `-3.~1~3` as −9/4 (and `-0.~2` as +1/2).
  `toContinuedFractionString()` writes a negative first term with the `~`
  (`~-3.~1~3`, was `-3.~1~3`) so its output reads back as the same value;
  certified continued-fraction prefixes print the same way (`~-4.~1?`).
- The radix shift `_^k` after a base-prefixed literal, or under `R.base`,
  multiplies by that base to the k, with k written in that base:
  ``R`0t1_^10` `` is 3³ = 27 and ``R`0xff_^1` `` is 255 × 16 (was × 10).
  Decimal literals are unchanged (`2.5_^-2` is 1/40).
- `BaseSystem.ROMAN` reads and writes real Roman numerals (standard form,
  1 to 3999, lower case accepted, `IIII`/`IC` refused) instead of treating
  `IVXLCDM` as base-7 digits. `BaseSystem` gains `isPositional`, false only for
  Roman numerals.
- Under `R.base(n)`, a `0` followed by one of the base's own digits is a
  number, not a base prefix: ``R.base(16)`0b1` `` is 177 (was read as binary 1).

### Fixed

- `Region` with an integer-variable chain beside a fixed chain
  (`2n:x:!2n+1 || 5:x:_`) no longer throws from `intervals`, `breakpoints`
  and `within`.
- `Region.breakpoints` returns points sorted and without repeats;
  `Region.intervals` skips a piece whose strict end sits on the window's edge.
- `Region.match` throws instead of returning an inexact `n` beyond the safe
  integer range.
- `R.base` with a signed-radix `BaseSystem` (such as negabinary) throws on a
  fractional literal instead of reading it with the wrong radix.
- `3.~?` (a continued fraction certain only in its first term, as printed by
  `boundedContinuedFractionApproximation(q, { maxTerms: 1 })`) parses.
- TypeScript: the default export lists `Region`; `Rational` comparisons accept
  an `Integer`; `Rational` arithmetic with a `CertifiedApproximation` returns
  a `CertifiedApproximation`.

## 0.8.0 — 2026-11-14

`R` reads the interval colon by spacing, as RiX does, which changes two
results from 0.7.0 (see Changed), and gains betweenness chains.

### Added

- Betweenness chains in `R`, as in RiX: three or more values joined by colons
  return a JavaScript boolean, true when they run in one direction (ties
  allowed). ``R`0:${x}:1` `` checks that x lies in [0, 1], and an interval
  operand counts with both endpoints. Using a chain in arithmetic throws.
  `R.between` is the same test typed as `boolean` for TypeScript, and throws
  when its template is not a chain.

### Changed

- `R` reads the interval colon by spacing, as RiX now does. An unspaced colon
  groups with the unspaced text around it before any spaced operator applies,
  so ``R`1:2 * 2` `` is `2:4` (0.7.0 gave `1:4`) and ``R`1:2 + 3:4` `` is
  `4:6` as before. With one unspaced colon, unspaced arithmetic stays on the
  endpoint (``R`1:2*2` `` is `1:4`, ``R`1:${n}+1` `` is `1:(n+1)`); an
  unspaced `+ - *` between two colons joins two intervals. A colon with a
  space beside it now binds loosest: ``R`1 : 2 + 3` `` is `1:5` (0.7.0 gave
  `4:5`).

## 0.7.0 — 2026-11-06

`R` and the list helpers are new; string construction of `Rational` is
stricter (see Changed), which can reject inputs 0.6.0 accepted.

### Added

- `R`, a tagged template for exact arithmetic on Core literals with RiX's
  spelling (fractions, mixed numbers, repeating decimals, uncertainty,
  intervals, continued fractions `3.~7~15~1`, radix shifts `2.5_^-2`, base
  prefixes `0xff.8`), operators `+ - * / ^ ** ! !! :`, and exact `${}`
  interpolation. `R.base(n)` reads unprefixed literals in another base.
- `range`, `seq`, `sum` and `product` over Core values. `range` and `seq`
  return an `ExactList` (an `Array` subclass with `sum`, `product`, elementwise
  `add`/`subtract`/`multiply`/`divide`, `pow`, `min`, `max`); `exact(values)`
  wraps any list.
- `Integer.floorDivide`, `floorModulo` and `divmod`.

### Changed

- `bestApproximation` and `bestConvergent` accept safe integers and `Integer`s
  as the denominator bound, not only `bigint`.
- Integer comparisons accept `Rational` operands and Rational comparisons
  accept `Integer` operands.
- `Rational` string construction uses the shared literal grammar: `""`, `"."`
  and `"/2"` now throw, `"0.#3"` and `"1_000"` are accepted, and a second
  argument divides (`new Rational("3/4", 5)` is 3/20).
- Faster exact arithmetic for plain `Rational`/`Integer` operands.

### Fixed

- `Rational.toNumber()` stays finite for parts beyond the double range.
- `compactedDecimalInterval()` and `relativeMidDecimalInterval()` round
  outward so the text encloses the interval.
- `Rational("-.5")` and other signed leading decimals parse with an implicit
  zero whole part; malformed inputs are rejected.

## 0.6.0 — 2026-09-20

### Added

- Add `NumeralSystem`, `NUMERAL_SYSTEM_SCHEMA`, and `NUMERAL_LIMITS`, with
  TypeScript declarations and versioned `ratmath.numeral-system@1` descriptors.
- Support exact finite and repeating numeral parsing in ordinary, multi-token,
  balanced, and negative-base positional systems.
- Provide bounded expansion, exact place contributions, integer carry traces,
  and explicit completion status when a digit budget is exhausted.
- Add a runnable numeral-system example and a complete API manual covering
  descriptor validation, limits, provenance, and representation boundaries.

### Compatibility

- `NumeralSystem` supplements the existing `BaseSystem` API; it does not replace
  it or add bijective fractional expansions. Existing math APIs are unchanged.
- RiX checkouts using the new numeral API require Core 0.6.0 or later within
  the 0.6 line. Core 0.5.0 does not export `NumeralSystem`.

## 0.5.0 — 2026-08-22

### Added

- Add immutable `RationalIntervalSet` values for normalized finite unions with
  exact rational open/closed endpoints, structural infinities, exact set
  operations, tagged JSON revival, a public type guard, and TypeScript types.
- Add proof-safe exact range arithmetic for negation, absolute value, the four
  basic binary operations, reciprocal, and integer powers, including exact
  disconnected/unbounded images, domain-coverage records, configurable
  `0^0`, and a recomputing checker.
- Version the `RationalIntervalSet` tagged JSON form as v1 while accepting the
  unversioned pre-release shape during revival.

## 0.4.0 — 2026-08-15

### Added

- Add `CertifiedApproximation`, decimal/base and continued-fraction `?`
  parsing, exact enclosure propagation, possible-relation masks, JSON revival,
  bounded approximation helpers, and TypeScript declarations.
- Add signed-radix, balanced-digit, bijective-digit, and explicitly quoted
  digit-alphabet support to `BaseSystem`, with capability flags that distinguish
  integer conversion from ordinary fractional-place formatting.

### Changed

- Keep formatter ellipses display-only; certified uncertainty is represented
  by an explicit approximation value with an authoritative exact enclosure.
- Require the publication gate to meet the configured coverage thresholds and
  pin the development-only Bun declarations for reproducible installs.

### Fixes

- Preserve certified candidates and serializable dependency provenance across
  string and tagged-JSON round trips, and freeze public representation metadata.
- Reject unsafe JavaScript-number continued-fraction coefficients in certified
  approximation constructors.
- Preserve signed-radix `BaseSystem` options through tagged JSON revival, and
  keep case folding valid when upper- and lowercase digits collapse.
- Reject nonstandard digit systems in fractional expansion, period, and
  certified radix-prefix algorithms instead of producing invalid digits.
- Align TypeScript declarations and the manual with all public `BaseSystem` and
  certified-approximation fields and options.

## 0.3.0 — 2026-08-07

### Breaking changes

- Decimal interval brackets use `:` exclusively between two values. Comma
  forms such as `1.23[56,67]` and `1.23[+5,-6]` are no longer accepted.
- Signed decimal-interval offsets now use the base value's last visible digit
  as their unit. For example, `1.23[+5:-6]` means `1.17:1.28`.
- Constructors reject unsafe JavaScript integer values. Use a decimal string or
  `bigint` when a value is outside `Number`'s safe-integer range.
- `randomRational()` now samples a fixed-denominator grid instead of all
  reduced fractions up to a maximum denominator.

### Added

- Add `denominatorInterval()`, endpoint-denominator LCM defaults, empty-grid
  policies, and injectable randomness for rational interval sampling.
- Add exact rational rounding helpers, tagged JSON revival, and public type
  guards.
- Add canonical/long finite continued-fraction output and optional intermediate
  convergents along coefficient runs.

### Fixes

- Keep shortest-decimal searches in exact `BigInt` arithmetic and support
  terminating point values beyond 50 digits.
- Avoid enumerating every integer in wide intervals when selecting a compact
  relative-decimal base.
- Preserve exact asymmetric, repeating, and long terminating offsets in
  relative interval output.
- Recompute continued-fraction convergents when a later call requests more
  terms, instead of retaining a truncated first result.
- Derive continued fractions from rational values without retaining constructor
  provenance, preserve nonterminal `1` coefficients in limited prefixes, and
  allow `getConvergent()` to access indices beyond the default count limit.
- Recompute decimal metadata when the configurable period-discovery limit
  changes.
- Make repeating-decimal serialization exact by default, with a 30-digit
  configurable global period limit and explicit `"trunc"`, `"null"`, or
  `"error"` behavior.
- Correct scientific notation so incomplete periods are visibly marked with
  `...`, exact repeating mantissas preserve non-periodic integer-tail digits,
  and bounded repeating-decimal output retains `#` to locate the period.
- Report the exact count of leading zeros in a period even when the stored
  period prefix is shorter than that zero run.
- Fix negative zero-whole-part strings such as `-0.5`, `-.5`, and
  `-0..1/2`.
- Reject signs on mixed-number numerator and denominator components.
- Improve validation for fractions, bases, Farey operations, and interval
  notation.
- Reject unsafe JavaScript-number exponents across exact power and `E`
  operations instead of converting an already-rounded value to `bigint`.
- Mark incomplete continued-fraction strings with `~...`, including the long
  form boundary, so a limited prefix cannot masquerade as an exact value.
- Expose mutable, per-call-overridable defaults for ordinary decimal digits,
  scientific precision, arbitrary-base digits, modular-period work,
  continued-fraction work, and Stern–Brocot path traversal.
- Keep the frozen powers-of-five optimization private, validate boolean
  formatting flags, report the active period-discovery limit, and stop
  non-varying injected random sources from looping indefinitely.
- Make all retained examples executable and enforce line/function coverage
  thresholds in CI.

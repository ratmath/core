---
title: Exact expressions and list helpers
---

`R` is a tagged template that turns a small exact-arithmetic expression into
Core values. `range`, `seq`, `sum` and `product` combine Core values in lists.
They are the basis of the RatCalc calculator (`apps/calc`), where input is
JavaScript with these in scope. *Added in 0.7.0; spacing-aware colons and
betweenness chains since 0.8.0; strict links, unbounded ends, `||` and
`R.region` since 0.9.0.*

## `R`

```js
import { R, Rational } from "@ratmath/core";

R`1/3 + 1/6`;               // Rational 1/2
R`1:2 + 3`;                 // RationalInterval 4:5
R`(${new Rational(1, 3)} + 1) ^ 2`;   // Rational 16/9
```

### Literals

Literals are spelled as in RiX, so text moves between RiX, RatCalc and `R`
unchanged.

| Form | Example | Value |
|---|---|---|
| integer, `_` grouping | `1_000` | `1000` |
| fraction, mixed number | `3/4`, `1..2/3` | `3/4`, `5/3` |
| decimal, repeating `#`, digit runs | `.5`, `0.#3`, `0.{3~4}1` | `1/2`, `1/3`, `33331/100000` |
| uncertainty (colon only) | `1.2[3:6]`, `1.5[+-0.01]` | `1.23:1.26`, `1.499:1.501` |
| interval | `2:5` | `2:5` |
| continued fraction | `3.~7~15~1`, `~-1.~2` | `355/113`, `-1/2` |
| radix shift | `1_^3`, `2.5_^-2`, `1/2_^3` | `1000`, `1/40`, `1/2000` |
| base prefix | `0xff.8`, `0b0.#01`, `0o17`, `0z[7]66` | `511/2`, `1/3`, `15`, `48` |
| certified prefix | `1.5?`, `3.~7?` | `CertifiedApproximation` |

- A radix shift belongs to the literal before it: `1/2_^3` is `1/(2_^3)`.
- A leading `-` is negation: `-3.~7` is `-(3.~7)` = `-22/7`. Write `~-3.~7`
  for a negative first coefficient.
- Base prefixes are the ones registered with `BaseSystem.registerPrefix`
  (`b` 2, `o` 8, `x` 16, `d` 12, …); `0z[n]` names any base. Digits are
  case-insensitive when the base's digits are lowercase.
- There is no `E` notation and no comma form `1.2[3,6]`, matching RiX.

### Operators

Loosest to tightest: `:` (interval, when it has a space beside it); `+ -`;
`* /`; unary `-` and `+`; `^` and `**` (right-associative; Integer exponents;
`**` is the same power as `^`, as in RiX — the interval product power is
`RationalInterval.mpow`); postfix `!` and `!!`. Parentheses group, and `-2^2`
is `-4`.

Spacing decides what an interval colon holds, as in RiX. A colon written
without spaces groups with the unspaced text around it before any spaced
operator applies:

| Expression | Reads as | Value |
|---|---|---|
| `1:2 + 3:4` | `(1:2) + (3:4)` | `4:6` |
| `1:2 * 2` | `(1:2) * 2` | `2:4` |
| `1/2:3/4` | `(1/2):(3/4)` | `1/2:3/4` |
| `1:2*2`, `1:n+1` | arithmetic on the endpoint | `1:4`, `1:(n+1)` |
| `1:2+3:4` | `(1:2) + (3:4)` | `4:6` |
| `1 : 2 + 3` | `1:(2 + 3)` | `1:5` |

With a single unspaced colon, unspaced arithmetic belongs to the endpoint. An
unspaced `+`, `-` or `*` with a colon on both sides joins two intervals; write
it with spaces (RiX warns about the unspaced form with RX1710).

#### Betweenness

Three or more values joined by colons are a betweenness test, as in RiX, and
`R` returns a JavaScript boolean:

```js
R`0:${x}:1`;              // true when x lies in [0, 1]
R`1:3:2`;                 // false: 3 is not between 1 and 2
R`3:2:1`;                 // true: descending chains count too
R`1: ${n}+1 :10`;         // spaced colons, so the middle is n + 1
R`0:(1/4:1/2):1`;         // true: an interval counts with both endpoints
```

The values must run in one direction, ascending or descending, and equal
neighbours are allowed. A chain is a test, not a number: using one in
arithmetic, such as ``R`(1:2:3) + 1` ``, throws a `TypeError`.

`R.between` is the same test with a boolean type for TypeScript, which cannot
see inside a template and so types `R` as returning a number:
``R.between`0:${x}:1` `` returns a `boolean` and throws if the template is not
a chain of three or more values.

#### Strict links, unbounded ends and unions

```js
R`2:!${x}:8`;             // 2 < x ≤ 8: ":!" is a strict link
R`2:${x}:!8`;             // 2 ≤ x < 8
R`_:${x}:8`;              // x ≤ 8: "_" beside a colon is an unbounded end
R`2:${x}:_`;              // x ≥ 2
R`_:${x}:!-1 || 1:!${x}:_`; // || joins chains
```

`:!` forbids a tie across that one link, in either direction. A chain with
`_` reads ascending (otherwise `_:x:8` would hold for every x). `_` elsewhere
throws, and so do the two-value forms ``R`_:5` `` and ``R`2:!5` ``, which have
no middle value to test.

### Regions

`R.region` reads chains on a named variable as a set of rationals, without a
value for the variable. Any other name in a bound is an integer variable
(at most one), and each bound must be affine in it:

```js
const square = R.region`2n:x:!2n+1`;  // 2n ≤ x < 2n+1 for some integer n
square.contains(R`1/2`);            // true
square.match(R`5/2`);               // { n: 1 }
square.intervals(0, 3);             // pieces { lo, hi, loStrict, hiStrict, n }
square.breakpoints(0, 3);           // 0, 1, 2, 3
square.within(0, 3);                // RationalIntervalSet [0, 1) ∪ [2, 3)
Region.parse("a:x:b", { params: { a: 1, b: "5/2" } });
```

Bounds use `+ - * /`, integer powers, parentheses and juxtaposition (`2n`,
`3(n-1)`). Interpolations are exact values. `Region.parse` takes text with
named `params`, and `variable` to insist on the middle name. `||` joins chains;
`_:x:_` is every rational.

A whole `Rational` result is returned as an `Integer` (as in RiX):
``R`0.#3 * 3` `` is `Integer 1`.

### Interpolation

`${value}` inserts a value without turning it into text. Accepted: `Integer`,
`Rational`, `RationalInterval`, certified approximations, `bigint`, safe
integer `number`s, and strings (read with `parseNumber`). Other numbers such
as `0.1` throw a `TypeError`, because they are not exact.

### `R.base(radix)`

Returns a tag that reads unprefixed literals in another base. `radix` is a
number or `bigint` (2–62), an `Integer`, a `BaseSystem`, or a string listing
the digits in order.

```js
R.base(16)`ff.8 / 3`;      // Rational 511/6
R.base(2)`0.#01`;          // Rational 1/3
R.base("01234567")`17`;    // Integer 15
R.base(2)`101 + 0x10`;     // prefixed literals keep their own base: 21
```

### Errors

`R` throws `SyntaxError` for unexpected characters or tokens, unknown base
prefixes and unbalanced parentheses, and `TypeError` for non-integer
exponents, `!`/`!!` of a non-Integer, an interval endpoint that is itself an
interval, and inexact interpolations. Arithmetic errors (division by zero)
come from the Core classes.

## `range(start, end, step = 1)`

An inclusive arithmetic progression. Arguments accept the same inputs as `R`
interpolation. A negative step counts down; a zero step throws `RangeError`, as
does a range longer than 1,000,000 values. Whole results are `Integer`s.

```js
range(1, 5);              // [1, 2, 3, 4, 5]
range(0, 1, R`1/4`);      // [0, 1/4, 1/2, 3/4, 1]
range(5, 1, -2);          // [5, 3, 1]
```

## `seq`, `sum`, `product`

Each takes either a list (any iterable except a string), or `start, end` and
an optional `step` as in `range`, optionally followed by a function
`(value, index) => term`.

```js
seq(0, 6, 2, (k) => R`${k}^3`);   // [0, 8, 64, 216]
sum([R`1/2`, R`1/3`]);            // 5/6
sum(1, 10, (i) => R`${i}^2`);     // 385
sum(1, 4, (i) => R`1/${i}`);      // 25/12
product(1, 5, (j) => j);          // 120
sum([R`1:2`, 1]);                 // 2:3
```

`seq` returns the terms as given. `sum` and `product` convert each term like
`R` interpolation, add or multiply exactly, return whole results as
`Integer`, and return `0` and `1` for empty input.

## `ExactList` and `exact(values)`

`range` and `seq` return an `ExactList`, an `Array` subclass. `Array.isArray`
is true, and indexing, spread, `for…of`, `map`, `filter`, `reduce` and the
other `Array` methods work; `map`, `filter`, `slice` and `concat` return
`ExactList`s. Its own methods never mutate:

| Method | Result |
|---|---|
| `sum(fn?)`, `product(fn?)` | exact total of the elements (or of `fn(value, index)`); `0` / `1` when empty |
| `add(c)`, `subtract(c)`, `multiply(c)`, `divide(c)` | new list; `c` is a constant (as in `R` interpolation) or a same-length list |
| `pow(n)` | each element to the Integer power `n` |
| `min()`, `max()` | smallest / largest scalar element; throws on an empty list |
| `toString()` | `[1, 1/2, 1/3]` |

```js
const xs = range(1, 4);
xs.multiply(R`1/2`).product();   // 3/2
xs.pow(-1).sum();                // 25/12
xs.add(range(4, 1, -1));         // [5, 5, 5, 5]
```

`exact(iterable)` converts each element like `R` interpolation and returns an
`ExactList`; `ExactList.from` and `ExactList.of` wrap values unchanged. JSON
output is a plain array of tagged Core values, and `structuredClone` or
`postMessage` produce a plain `Array`.

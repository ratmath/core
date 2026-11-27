// Types for @ratmath/core/units.
import type { Integer, Rational, RelationMask, RoundingMode } from "./index.js";

/** Exponents of base dimensions, e.g. { Length: 1, Time: -2 }. Zero exponents are left out. */
export type Dimensions = Readonly<Record<string, number>>;
export type ExactRational = Integer | Rational;
/** A magnitude: a Core number by default, or whatever a custom `scalars` accepts. */
export type Magnitude = any;
export type MagnitudeInput = Magnitude | bigint | number | string;
export type UnitKind = "linear" | "affine" | "difference";

export declare const BASE_DIMENSIONS: readonly [
  "Mass", "Length", "Time", "Current", "Temperature", "Amount", "Luminosity", "Angle", "Information", "Money",
];

export declare function dimensionsEqual(a: Dimensions, b: Dimensions): boolean;
/** "Length*Time^-2", or "Dimensionless". */
export declare function formatDimensions(dimensions: Dimensions): string;

/** The arithmetic a UnitSystem uses on magnitudes. */
export interface Scalars {
  isScalar(value: unknown): boolean;
  /** Turn input into a magnitude; rejects non-integer JS numbers. */
  from(value: MagnitudeInput): Magnitude;
  add(a: Magnitude, b: Magnitude): Magnitude;
  subtract(a: Magnitude, b: Magnitude): Magnitude;
  multiply(a: Magnitude, b: Magnitude): Magnitude;
  divide(a: Magnitude, b: Magnitude): Magnitude;
  negate(a: Magnitude): Magnitude;
  pow(a: Magnitude, n: number): Magnitude;
  /** Possible orderings as a Relation mask. */
  relation(a: Magnitude, b: Magnitude): RelationMask;
  /** pi^k for a nonzero integer k. */
  pi(k: number): Magnitude;
}

/** Core numbers through TypePromotion; pi is an exact interval enclosure. */
export declare const coreScalars: Readonly<Scalars>;

export interface UnitOptions {
  dimensions?: Dimensions;
  scale?: ExactRational | bigint | number | string;
  piPower?: number;
  kind?: UnitKind;
  /** Base-unit value of this scale's zero (affine units only). */
  offset?: ExactRational | bigint | number | string;
  differenceUnit?: Unit | null;
  group?: string | null;
  /** Whether the unit takes SI prefixes (km), or SI and binary prefixes (KiB). */
  prefixes?: "SI" | "SI+binary" | null;
}

/** scale * pi^piPower base units of `dimensions`. */
export declare class Unit {
  constructor(name: string, options?: UnitOptions);
  readonly name: string;
  readonly dimensions: Dimensions;
  readonly scale: ExactRational;
  readonly piPower: number;
  readonly kind: UnitKind;
  readonly offset: ExactRational;
  readonly differenceUnit: Unit | null;
  readonly group: string | null;
  readonly prefixes: "SI" | "SI+binary" | null;
  /** The named units this one is a product of, with exponents. */
  readonly factors: ReadonlyArray<readonly [Unit, number]>;
  readonly isNamed: boolean;
  readonly isDimensionless: boolean;
  multiply(other: Unit): Unit;
  divide(other: Unit): Unit;
  inverse(): Unit;
  pow(exponent: number | bigint | Integer): Unit;
  isCompatible(other: Unit): boolean;
  equals(other: unknown): boolean;
  /** "kg*m^2/s^2", or "kg·m²/s²" with style "unicode". */
  toString(options?: { style?: "ascii" | "unicode" }): string;
}

export declare class Quantity {
  constructor(value: MagnitudeInput, unit: Unit | string, options?: { point?: boolean; system?: UnitSystem });
  readonly value: Magnitude;
  readonly unit: Unit;
  /** True for a temperature point (degC, degF, or a K reading converted from one). */
  readonly point: boolean;
  readonly system: UnitSystem;
  readonly dimensions: Dimensions;
  to(target: Unit | string): Quantity;
  valueIn(target: Unit | string): Magnitude;
  toBase(): Quantity;
  simplify(): Quantity;
  add(other: Quantity): Quantity;
  subtract(other: Quantity): Quantity;
  negate(): Quantity;
  /** A dimensionless product is returned as a plain magnitude. */
  multiply(other: Quantity | Unit | MagnitudeInput): Quantity | Magnitude;
  divide(other: Quantity | Unit | MagnitudeInput): Quantity | Magnitude;
  inverse(): Quantity;
  pow(exponent: number | bigint | Integer): Quantity | Magnitude;
  relation(other: Quantity): RelationMask;
  /** -1, 0 or 1; throws when the order is undecided. */
  compare(other: Quantity): -1 | 0 | 1;
  equals(other: unknown): boolean;
  /**
   * A duration as clock text, exactly: "3:15", or "3:15:00" with seconds.
   * wrap 12 or 24 reads it as a time of day; without round, a duration that is
   * not a whole number of the last unit shown is refused.
   */
  toClock(options?: { seconds?: boolean; wrap?: 12 | 24; round?: RoundingMode }): string;
  toString(options?: { style?: "ascii" | "unicode"; format?: (value: Magnitude) => string }): string;
}

export interface DefineOptions {
  aliases?: string[];
  /** Allow SI prefixes (km, mL), or SI and binary prefixes (KiB). */
  prefixes?: "SI" | "SI+binary";
  group?: string;
  kind?: UnitKind;
  offset?: ExactRational | bigint | number | string;
  differenceUnit?: Unit;
  replace?: boolean;
}

export declare class UnitSystem {
  constructor(options?: { scalars?: Scalars });
  readonly scalars: Scalars;
  /** A copy of the catalogue, with other scalars if given. */
  extend(options?: { scalars?: Scalars }): UnitSystem;
  /** Definition: "201.168 m", a Quantity, a Unit, or { dimensions, scale, piPower, kind, offset }. */
  define(name: string, definition: string | Quantity | Unit | UnitOptions, options?: DefineOptions): Unit;
  /** Make an existing Unit reachable under `key`, keeping the same object. */
  register(key: string, unit: Unit, options?: { replace?: boolean; prefixes?: boolean }): Unit;
  has(name: string): boolean;
  get(name: string): Unit;
  parse(expression: string): Unit;
  quantity(text: string): Quantity;
  quantity(value: MagnitudeInput, unit: Unit | string): Quantity;
  coherentUnit(dimensions: Dimensions): Unit;
  namedCoherentUnit(dimensions: Dimensions): Unit | null;
  groups(): { title: string; units: Unit[] }[];
  names(): string[];
}

/** The standard catalogue. */
export declare const units: UnitSystem;

/** Q(9.8, "m/s^2") or Q("9.8 m/s^2") in the standard catalogue. */
export declare function Q(text: string): Quantity;
export declare function Q(value: MagnitudeInput, unit: Unit | string): Quantity;

export declare const constants: Readonly<{
  c: Quantity; h: Quantity; e: Quantity; kB: Quantity; NA: Quantity; R: Quantity; g0: Quantity; G: Quantity;
}>;

export declare function isUnit(value: unknown): value is Unit;
export declare function isQuantity(value: unknown): value is Quantity;

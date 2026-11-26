import { describe, test, expect } from "bun:test";
import {
  BASE_DIMENSIONS, Q, Quantity, Unit, UnitSystem, constants, coreScalars, dimensionsEqual,
  formatDimensions, isQuantity, isUnit, units,
} from "@ratmath/core/units";
import { Integer, Rational, RationalInterval, Relation } from "../index.js";

const s = (x) => String(x);

describe("conversions are exact", () => {
  test("lengths, masses, volumes", () => {
    expect(s(Q(1, "mi").to("km"))).toBe("25146/15625 km");
    expect(s(Q(1, "mi").to("m").value)).toBe("201168/125");
    expect(s(Q(1, "ft").to("in"))).toBe("12 in");
    expect(s(Q(1, "lb").to("g"))).toBe("45359237/100000 g");
    expect(s(Q(1, "gal").to("L"))).toBe("473176473/125000000 L");
    expect(s(Q(3, "tsp").to("tbsp"))).toBe("1 tbsp");
    expect(s(Q(1, "acre").to("m^2").value)).toBe("316160658/78125");
    expect(s(Q("1 kilometre").to("m"))).toBe("1000 m");
  });
  test("derived units and products", () => {
    expect(s(Q("9.8 m/s^2").multiply(Q(3, "kg")).to("N"))).toBe("147/5 N");
    expect(s(Q("5 km").divide(Q("2 h")).to("m/s"))).toBe("25/36 m/s");
    expect(s(Q("1 kWh").to("J"))).toBe("3600000 J");
    expect(s(Q("1 hp").to("W"))).toBe("37284993579113511/50000000000000 W");
    expect(s(Q("1 atm").to("Torr"))).toBe("760 Torr");
    expect(s(Q("10 lbf").to("N"))).toBe("8896443230521/200000000000 N");
    expect(s(Q("1 mAh").to("C"))).toBe("18/5 C");
    expect(s(Q("1 keV").to("eV"))).toBe("1000 eV");
    expect(s(Q("3 J").divide(Q("2 s")).simplify())).toBe("3/2 W");
    expect(s(Q("1 N").toBase())).toBe("1 kg*m/s^2");
    expect(s(Q("2 m").pow(3).simplify())).toBe("8 m^3");
    expect(s(Q("1 m*s").simplify())).toBe("1 m*s");
  });
  test("information with SI and binary prefixes", () => {
    expect(s(Q("1 MiB").to("kB"))).toBe("131072/125 kB");
    expect(s(Q("1 KiB").to("bit"))).toBe("8192 bit");
    expect(s(Q("1 kibibyte").to("B"))).toBe("1024 B");
    expect(() => units.get("Kim")).toThrow("Unknown unit");
  });
  test("dimensionless products collapse to scalars", () => {
    expect(s(Q(2, "m").divide(Q(4, "cm")))).toBe("50");
    expect(s(Q(2, "m").multiply(Q(1, "1/m")))).toBe("2");
    expect(s(Q(3, "m").pow(0))).toBe("1");
    expect(s(Q("30 min").multiply(Q("2 1/h")))).toBe("1");
  });
});

describe("angles carry exact powers of pi", () => {
  test("degree, turn and gon convert rationally", () => {
    expect(s(Q(90, "deg").to("turn"))).toBe("1/4 turn");
    expect(s(Q(1, "turn").to("gon"))).toBe("400 gon");
    expect(s(Q(1, "deg").to("arcsec"))).toBe("3600 arcsec");
    expect(units.get("deg").piPower).toBe(1);
  });
  test("radians to degrees needs pi: an exact enclosure", () => {
    const d = Q(1, "rad").to("deg").value;
    expect(d).toBeInstanceOf(RationalInterval);
    expect(d.low.toNumber()).toBeCloseTo(57.29577951308232, 12);
    expect(d.high.subtract(d.low).toNumber()).toBeLessThan(1e-30);
    expect(Q(60, "rpm").to("rad/s").value).toBeInstanceOf(RationalInterval);
  });
  test("a parsec is 648000/pi au", () => {
    const pc = units.get("pc");
    expect(pc.piPower).toBe(-1);
    expect(s(Q(1, "pc").multiply(Q(1, "1/au")))).toContain(":");
    expect(Q(1, "pc").to("ly").value.low.toNumber()).toBeCloseTo(3.2615637771674333, 10);
  });
  test("pi powers cancel in products", () => {
    expect(s(Q(1, "deg").divide(Q(1, "turn")))).toBe("1/360");
  });
});

describe("temperatures follow the affine rules", () => {
  test("point conversions", () => {
    expect(s(Q("20 degC").to("degF"))).toBe("68 degF");
    expect(s(Q("-40 degF").to("degC"))).toBe("-40 degC");
    expect(s(Q("300 K").to("degC"))).toBe("537/20 degC");
    expect(s(Q(0, "°C").to("K"))).toBe("5463/20 K");
    expect(Q(0, "degC").to("K").point).toBe(true);
    expect(s(Q(1, "Celsius").to("K"))).toBe("5483/20 K");
  });
  test("point minus point is a difference; point plus difference is a point", () => {
    const d = Q("20 degC").subtract(Q("50 degF"));
    expect(s(d)).toBe("10 deltaDegC");
    expect(d.point).toBe(false);
    expect(s(Q("20 degC").add(Q("9 deltaDegF")))).toBe("25 degC");
    expect(s(Q("9 deltaDegF").add(Q("20 degC")))).toBe("25 degC");
    expect(s(Q("20 degC").subtract(Q("5 deltaK")))).toBe("15 degC");
    expect(s(Q("10 deltaDegC").to("deltaDegF"))).toBe("18 deltaDegF");
    expect(s(Q("10 deltaDegC").to("K"))).toBe("10 K");
    expect(s(Q("300 K").subtract(Q("20 degC")))).toBe("137/20 K");
    expect(s(Q("300 K").subtract(Q("200 K")))).toBe("100 K");
  });
  test("forbidden operations throw", () => {
    expect(() => Q("20 degC").add(Q("10 degC"))).toThrow("two temperature points");
    expect(() => Q("5 deltaK").subtract(Q("10 degC"))).toThrow("from a difference");
    expect(() => Q("20 degC").to("deltaK")).toThrow("difference unit");
    expect(() => Q("5 deltaK").to("degC")).toThrow("point scale");
    expect(() => Q("20 degC").multiply(Q("2 m"))).toThrow("convert to K");
    expect(() => Q("20 degC").multiply(2)).toThrow("scale a temperature point");
    expect(() => Q("20 degC").pow(2)).toThrow("raised to a power");
    expect(() => Q("20 degC").inverse()).toThrow("inverted");
    expect(() => Q("20 degC").negate()).toThrow("negate");
    expect(() => units.get("degC").multiply(units.get("m"))).toThrow("Affine unit");
    expect(() => new Quantity(1, "deltaK", { point: true })).toThrow("difference unit");
    expect(() => new Quantity(1, "degC", { point: false })).toThrow("are points");
    expect(() => Q("20 degC").relation(Q("5 deltaK"))).toThrow("point with a difference");
  });
  test("comparisons across scales", () => {
    expect(Q("20 degC").compare(Q("68 degF"))).toBe(0);
    expect(Q("300 K").compare(Q("20 degC"))).toBe(1);
    expect(Q("20 degC").compare(Q("300 K"))).toBe(-1);
    expect(Q("20 degC").equals(Q("293.15 K"))).toBe(true);
  });
  test("an unnamed affine difference unit is synthesised", () => {
    const sys = units.extend();
    sys.define("degX", { dimensions: { Temperature: 1 }, kind: "affine", offset: 100 });
    const d = sys.quantity("5 degX").subtract(sys.quantity("2 degX"));
    expect(d.unit.name).toBe("deltadegX");
    expect(d.unit.kind).toBe("difference");
  });
});

describe("intervals and ordering", () => {
  test("interval magnitudes convert without extra width", () => {
    expect(s(Q("1.2[3:6] m").to("cm"))).toBe("123:126 cm");
  });
  test("relation masks and compare", () => {
    expect(Q("1:2 m").relation(Q("150 cm"))).toBe(Relation.LESS | Relation.EQUAL | Relation.GREATER);
    expect(Q(1, "km").relation(Q(999, "m"))).toBe(Relation.GREATER);
    expect(Q(1, "km").compare(Q(1000, "m"))).toBe(0);
    expect(Q(1, "m").compare(Q(1, "km"))).toBe(-1);
    expect(() => Q("1:2 m").compare(Q("150 cm"))).toThrow("undecided");
    expect(Q(1, "km").equals(Q(1000, "m"))).toBe(true);
    expect(Q(1, "km").equals(Q(1000, "s"))).toBe(false);
    expect(Q(1, "km").equals(5)).toBe(false);
    expect(() => Q(1, "m").relation(Q(1, "s"))).toThrow("Incompatible dimensions for comparison");
  });
});

describe("quantity arithmetic", () => {
  test("add, subtract, negate, scale, inverse", () => {
    expect(s(Q(1, "km").add(Q(1, "m")))).toBe("1001/1000 km");
    expect(s(Q(1, "m").subtract(Q(1, "cm")))).toBe("99/100 m");
    expect(s(Q(1, "m").negate())).toBe("-1 m");
    expect(s(Q(3, "m").multiply("1/2"))).toBe("3/2 m");
    expect(s(Q(3, "m").divide(2n))).toBe("3/2 m");
    expect(s(Q(4, "s").inverse())).toBe("1/4 1/s");
    expect(s(Q(4, "m/s").inverse())).toBe("1/4 s/m");
    expect(s(Q(2, "m").multiply(units.get("s")))).toBe("2 m*s");
    expect(s(Q(2, "m").pow(-2))).toBe("1/4 1/m^2");
    expect(s(Q(2, "m").pow(new Integer(1n)))).toBe("2 m");
  });
  test("dimension mismatches throw", () => {
    expect(() => Q(1, "m").add(Q(1, "s"))).toThrow("Incompatible dimensions for addition: Length and Time");
    expect(() => Q(1, "m").subtract(Q(1, "kg"))).toThrow("subtraction");
    expect(() => Q(1, "m").to("s")).toThrow("conversion");
    expect(() => Q(1, "m").add(1)).toThrow("Expected a Quantity");
    expect(() => Q(1, "m").pow(1.5)).toThrow("integer");
  });
  test("magnitudes must be exact", () => {
    expect(() => Q(9.8, "m")).toThrow('pass a string such as "9.8"');
    expect(() => Q(null, "m")).toThrow("null");
    expect(() => Q({}, "m")).toThrow("object");
    expect(s(Q(new Rational(1n, 3n), "m"))).toBe("1/3 m");
    expect(s(Q("1.602176634E-19 C").value)).toBe("801088317/5000000000000000000000000000");
    expect(s(Q("-2.5e3 m").value)).toBe("-2500");
    expect(s(Q(".5E1 m").value)).toBe("5");
  });
  test("quantity text", () => {
    expect(s(Q("1/s"))).toBe("1 1/s");
    expect(() => Q(5)).toThrow("needs a string");
    expect(() => units.quantity("m/s")).toThrow("Expected a magnitude");
    expect(s(Q("2 N m"))).toBe("2 N*m");
  });
  test("valueIn, toString options, isQuantity", () => {
    expect(s(Q(1, "km").valueIn("m"))).toBe("1000");
    expect(Q(9, "m/s^2").toString({ style: "unicode" })).toBe("9 m/s²");
    expect(Q("1/2 m").toString({ format: (v) => v.toNumber().toFixed(2) })).toBe("0.50 m");
    expect(s(Q(5, "m/m"))).toBe("5");
    expect(isQuantity(Q(1, "m"))).toBe(true);
    expect(isQuantity(1)).toBe(false);
    expect(Q(1, "m").dimensions).toEqual({ Length: 1 });
    expect(Object.isFrozen(Q(1, "m"))).toBe(true);
    expect(() => new Quantity(1, "m", { system: {} })).toThrow("UnitSystem");
    expect(() => new Quantity(1, 5)).toThrow("unit expression string");
  });
});

describe("units and unit expressions", () => {
  test("parse and print", () => {
    expect(s(units.parse("kg*m^2/s^2"))).toBe("kg*m^2/s^2");
    expect(units.parse("m·s⁻²").toString({ style: "unicode" })).toBe("m/s²");
    expect(s(units.parse("m s^-2"))).toBe("m/s^2");
    expect(s(units.parse("m/(s*kg)"))).toBe("m/(s*kg)");
    expect(s(units.parse("m/s*kg"))).toBe("m*kg/s");
    expect(s(units.parse("(m/s)^2"))).toBe("m^2/s^2");
    expect(s(units.parse("m^(-1)"))).toBe("1/m");
    expect(s(units.parse("1/s"))).toBe("1/s");
    expect(s(units.parse("s/1"))).toBe("s");
    expect(s(units.parse("1*m"))).toBe("m");
    expect(s(units.parse("m*1"))).toBe("m");
    expect(s(units.parse("m/m"))).toBe("1");
    expect(s(units.parse("m ⋅ m"))).toBe("m^2");
    expect(units.parse("kg m² s⁻²").toString({ style: "unicode" })).toBe("kg·m²/s²");
    expect(units.parse("m^-12").toString({ style: "unicode" })).toBe("1/m¹²");
  });
  test("parse errors", () => {
    expect(() => units.parse("")).toThrow("cannot be empty");
    expect(() => units.parse("m^x")).toThrow("integer exponent");
    expect(() => units.parse("(m")).toThrow("Expected ')'");
    expect(() => units.parse("m)")).toThrow("Unexpected input");
    expect(() => units.parse("*m")).toThrow("Expected a unit name");
    expect(() => units.parse("1^2")).toThrow("Cannot raise 1");
    expect(() => units.parse("1")).toThrow("needs a unit");
    expect(() => units.parse("m⁻")).toThrow("superscript");
    expect(() => units.parse("furlong")).toThrow("Unknown unit 'furlong'");
  });
  test("prefixes, aliases, case", () => {
    expect(s(units.get("km").scale)).toBe("1000");
    expect(units.get("km")).toBe(units.get("km"));
    expect(s(units.get("µs").scale)).toBe("1/1000000");
    expect(s(units.get("us").scale)).toBe("1/1000000");
    expect(s(units.get("dam").scale)).toBe("10");
    expect(s(units.get("mg").scale)).toBe("1/1000000");
    expect(units.get("kg").name).toBe("kg");
    expect(s(units.get("millisecond").scale)).toBe("1/1000");
    expect(units.get("METRE").name).toBe("m");
    expect(units.has("km")).toBe(true);
    expect(units.has("kft")).toBe(false);
    expect(units.has("k")).toBe(false);
    expect(units.get("min").name).toBe("min");
    expect(units.get("cd").name).toBe("cd");
    expect(units.get("pt").name).toBe("pt");
  });
  test("Unit methods", () => {
    const m = units.get("m");
    expect(m.isNamed).toBe(true);
    expect(m.multiply(m).isNamed).toBe(false);
    expect(m.pow(1)).toBe(m);
    expect(m.multiply(units.get("s")).divide(units.get("s"))).toBe(m);
    expect(s(m.inverse())).toBe("1/m");
    expect(units.get("km").equals(units.get("m"))).toBe(false);
    expect(units.get("J").equals(units.parse("N*m"))).toBe(true);
    expect(units.get("J").equals("J")).toBe(false);
    expect(units.get("J").isCompatible(units.get("eV"))).toBe(true);
    expect(units.parse("m/km").isDimensionless).toBe(true);
    expect(isUnit(m)).toBe(true);
    expect(isUnit("m")).toBe(false);
    expect(() => m.multiply("s")).toThrow("Expected a Unit");
  });
  test("Unit constructor checks", () => {
    expect(() => new Unit("")).toThrow("needs a name");
    expect(() => new Unit("x", { scale: 0 })).toThrow("positive");
    expect(() => new Unit("x", { scale: -1 })).toThrow("positive");
    expect(() => new Unit("x", { scale: 1.5 })).toThrow("exact rational");
    expect(() => new Unit("x", { kind: "odd" })).toThrow("Unknown unit kind");
    expect(() => new Unit("x", { offset: 1 })).toThrow("Only an affine");
    expect(() => new Unit("x", { kind: "affine", piPower: 1 })).toThrow("cannot carry pi");
    expect(() => new Unit("x", { piPower: 0.5 })).toThrow("pi power");
    expect(s(new Unit("x", { scale: "1/2" }).scale)).toBe("1/2");
    expect(s(new Unit("x", { scale: new Rational(4n, 2n) }).scale)).toBe("2");
    expect(() => new Unit("x", { scale: "1:2" })).toThrow("exact rational");
  });
});

describe("dimensions", () => {
  test("helpers", () => {
    expect(BASE_DIMENSIONS).toContain("Information");
    expect(formatDimensions({ Length: 1, Time: -2 })).toBe("Length*Time^-2");
    expect(formatDimensions({})).toBe("Dimensionless");
    expect(dimensionsEqual({ Length: 1 }, { Length: 1 })).toBe(true);
    expect(dimensionsEqual({ Length: 1 }, { Length: 2 })).toBe(false);
    expect(dimensionsEqual({ Length: 1 }, {})).toBe(false);
  });
  test("custom dimensions have no base unit", () => {
    const sys = units.extend();
    sys.define("sheep", { dimensions: { Sheep: 1 } });
    expect(s(sys.quantity("3 sheep/m").dimensions.Sheep)).toBe("1");
    expect(() => sys.quantity("3 sheep").toBase()).toThrow("No base unit for dimension 'Sheep'");
  });
});

describe("UnitSystem", () => {
  test("define from strings, quantities, units and raw specs", () => {
    const sys = units.extend();
    expect(s(sys.define("furlong", "201.168 m").scale)).toBe("25146/125");
    expect(s(sys.define("smoot", Q("1.7018 m")).scale)).toBe("8509/5000");
    expect(s(sys.define("myJ", units.parse("N*m")).scale)).toBe("1");
    expect(s(sys.quantity("1 furlong").to("ft"))).toBe("660 ft");
    expect(units.has("furlong")).toBe(false);
    expect(() => sys.define("m", "1 ft")).toThrow("already defined");
    expect(s(sys.define("m", "1 ft", { replace: true }).scale)).toBe("381/1250");
    expect(() => sys.define("x", 5)).toThrow("definition must be");
    expect(() => sys.define("x", Q("20 degC"))).toThrow("linear quantity");
    expect(() => sys.define("x", "1:2 m")).toThrow("exact rational");
    sys.define("zorch", "3 s", { prefixes: "SI", aliases: ["zorches"] });
    expect(s(sys.get("kzorch").scale)).toBe("3000");
    expect(s(sys.get("kilozorches").scale)).toBe("3000");
    expect(sys.has("Kizorch")).toBe(false);
  });
  test("groups and names", () => {
    const titles = units.groups().map((g) => g.title);
    expect(titles).toContain("Length");
    expect(titles).toContain("Information");
    const temp = units.groups().find((g) => g.title === "Temperature").units.map((u) => u.name);
    expect(temp).toEqual(["K", "deltaK", "deltaDegC", "deltaDegF", "degC", "degF"]);
    expect(units.names()).toContain("°C");
    const sys = new UnitSystem();
    sys.define("x", { dimensions: { Length: 1 } });
    expect(sys.groups()).toEqual([]);
  });
  test("scalars are pluggable and checked", () => {
    expect(() => new UnitSystem({ scalars: { ...coreScalars, pi: 1 } })).toThrow("scalars.pi");
    let piCalls = 0;
    const scalars = { ...coreScalars, pi: (k) => { piCalls++; return coreScalars.pi(k); } };
    const sys = units.extend({ scalars });
    expect(sys.scalars).toBe(scalars);
    sys.quantity(1, "rad").to("deg");
    expect(piCalls).toBe(1);
    expect(units.extend().scalars).toBe(coreScalars);
  });
  test("coreScalars", () => {
    expect(coreScalars.isScalar(new Integer(1n))).toBe(true);
    expect(coreScalars.isScalar(1)).toBe(false);
    expect(s(coreScalars.from(5n))).toBe("5");
    expect(s(coreScalars.negate(new RationalInterval(new Rational(1n), new Rational(2n))))).toBe("-2:-1");
    expect(s(coreScalars.pow(new Rational(1n, 2n), 2))).toBe("1/4");
    expect(coreScalars.pi(2)).toBe(coreScalars.pi(2));
  });
});

describe("constants", () => {
  test("exact SI constants and an interval G", () => {
    expect(s(constants.c)).toBe("299792458 m/s");
    expect(s(constants.R.value)).toBe("207861565453831/25000000000000");
    expect(s(constants.R.unit)).toBe("J/(K*mol)");
    expect(constants.G.value).toBeInstanceOf(RationalInterval);
    expect(s(constants.g0.multiply(Q(1, "kg")).to("N"))).toBe("196133/20000 N");
    expect(s(constants.h.multiply(constants.c).divide(Q(500, "nm")).to("eV").value)).toContain("/");
    expect(Object.isFrozen(constants)).toBe(true);
  });
});

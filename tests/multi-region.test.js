import { describe, expect, test } from "bun:test";
import { R, Rational, RationalInterval, Region, MultiRegion } from "../index.js";
import ratmath from "../index.js";

const S = (x) => (x === null ? "_" : Array.isArray(x) ? `[${x.map(S).join(", ")}]` : String(x));
const corners = (cell) => cell.vertices.map((v) => S(v.point) + (v.included ? "" : "o")).join(" ");
const bound = (b) => `${S(b.coefficients)}+${S(b.constant)}${b.strict ? "!" : ""}`;
const levels = (cell) => cell.bounds.map((l) => `${l.variable}: ${l.lower.map(bound).join(",")} .. ${l.upper.map(bound).join(",")}`);

describe("MultiRegion: parsing and dispatch", () => {
  test("Region.parse and R.region give a MultiRegion for && or several variables", () => {
    expect(Region.parse("0:x:1 && 0:y:x")).toBeInstanceOf(MultiRegion);
    expect(Region.parse("0:x:1", { variables: ["x"] })).toBeInstanceOf(MultiRegion);
    expect(Region.parse("0:x:1 || 0:y:1")).toBeInstanceOf(MultiRegion);
    expect(R.region`0:x:1 && 0:y:${new Rational(1, 2)}`).toBeInstanceOf(MultiRegion);
    expect(Region.parse("2n:x:!2n+1")).toBeInstanceOf(Region);
    expect(R.region`2n:x:!2n+1`).toBeInstanceOf(Region);
    expect(MultiRegion.parse("0:x:1 && 0:y:x").variables).toEqual(["x", "y"]);
    expect(ratmath.MultiRegion).toBe(MultiRegion);
  });

  test("Region.from keeps either kind", () => {
    const T = Region.parse("0:x:1 && 0:y:x");
    expect(Region.from(T)).toBe(T);
    expect(Region.from("0:x:1 && 0:y:x")).toBeInstanceOf(MultiRegion);
  });

  test("variables fix the order; integers are the other names", () => {
    const T = Region.parse("0:y:x && 0:x:1", { variables: ["x", "y"] });
    expect(T.variables).toEqual(["x", "y"]);
    expect(T.dimension).toBe(2);
    expect(Region.parse("n:x:!n+1 && m:y:!m+1").integers).toEqual(["n", "m"]);
    expect(Region.parse("0:x:a && 0:y:1", { params: { a: 2n } }).integers).toEqual([]);
    expect(String(Region.parse("  0:x:1 && 0:y:x "))).toBe("0:x:1 && 0:y:x");
  });

  test("misuse throws", () => {
    expect(() => new Region(["0:x:1 && 0:y:1"])).toThrow("several variables");
    expect(() => Region.parse("0:x:1 && 0:y:x^2")).toThrow("not affine");
    expect(() => Region.parse("0:x:1 && 0:y:x*x")).toThrow("not affine");
    expect(() => Region.parse("0:x:1 && 0:y:1/x")).toThrow("not affine");
    expect(() => Region.parse("0:x:1 && 0:y:x+y")).toThrow("cannot use y itself");
    expect(() => Region.parse("y:y:1", { variables: ["x", "y"] })).toThrow("cannot use y itself");
    expect(() => Region.parse("0:x:1 && 0:y:1", { variables: ["x"] })).toThrow("should be one of x");
    expect(() => Region.parse("0:x:1", { variables: ["x", "x"] })).toThrow("distinct");
    expect(() => Region.parse("0:x:1 && 0:y:a", { variables: ["x", "y"], params: { x: 1n } })).toThrow("both a variable and a parameter");
    expect(() => Region.parse("0:x:n+m && 0:y:1")).toThrow("at most one integer");
    expect(() => Region.parse("0:x:1 && 0:y:b", { params: { b: 1.5 } })).toThrow("no exact rational value");
  });
});

describe("MultiRegion: membership", () => {
  const T = Region.parse("0:x:1 && 0:y:x");

  test("points as arrays or objects", () => {
    expect(T.contains([R`1/2`, R`1/4`])).toBe(true);
    expect(T.contains({ x: "1/2", y: "1/4" })).toBe(true);
    expect(T.test([1n, 1n])).toBe(true);
    expect(T.contains(["1/2", "3/4"])).toBe(false);
    expect(T.match([1, 0])).toEqual({});
    expect(T.match([2, 0])).toBeNull();
  });

  test("bad points throw", () => {
    expect(() => T.contains([1])).toThrow("2 coordinates");
    expect(() => T.contains(1)).toThrow("array or an object");
    expect(() => T.contains([new RationalInterval(new Rational(0), new Rational(1)), 0])).toThrow("exact rational");
  });

  test("strict links and unbounded ends", () => {
    const H = Region.parse("0:!x:_ && _:y:!x");
    expect(H.contains([1, 0])).toBe(true);
    expect(H.contains([1, 1])).toBe(false);
    expect(H.contains([0, -1])).toBe(false);
  });

  test("integers are found per chain", () => {
    const C = Region.parse("n:x:!n+1 && m:y:!m+1");
    expect(C.match(["5/2", "-1/3"])).toEqual({ n: 2, m: -1 });
    const D = Region.parse("n:x:!n+1 && n:y:!n+1");
    expect(D.match(["1/2", "1/2"])).toEqual({ n: 0 });
    expect(D.match(["1/2", "3/2"])).toBeNull();
    expect(Region.parse("n:x:_ && 0:y:1").match([5, 0])).toEqual({ n: 5 });
  });

  test("a one-sided integer chain takes the largest fitting integer", () => {
    expect(Region.parse("0:x:n && 0:y:1").match([0, 0])).toEqual({ n: 0 });
  });

  test("|| tries each alternative", () => {
    const U = Region.parse("0:x:1 && 0:y:1 || 2:x:3 && n:y:!n+1");
    expect(U.match(["1/2", "1/2"])).toEqual({});
    expect(U.match(["5/2", "7/2"])).toEqual({ n: 3 });
    expect(U.match(["3/2", 0])).toBeNull();
  });
});

describe("MultiRegion: cells", () => {
  test("a triangle, written in either order", () => {
    const [a] = Region.parse("0:x:1 && 0:y:x").cells();
    expect(corners(a)).toBe("[1, 1] [0, 0] [1, 0]");
    expect(S(a.measure)).toBe("1/2");
    expect(levels(a)).toEqual(["x: []+0 .. []+1", "y: [0]+0 .. [1]+0"]);
    const [b] = Region.parse("0:x:y && 0:y:1", { variables: ["x", "y"] }).cells();
    expect(S(b.measure)).toBe("1/2");
    expect(levels(b)).toEqual(["x: []+0 .. []+1", "y: [1]+0 .. [0]+1"]);
    expect(S(b.box)).toBe("[[0, 1], [0, 1]]");
    expect(b.alternative).toBe(0);
    expect(b.integers).toEqual({});
  });

  test("strict edges leave corners out", () => {
    const [c] = Region.parse("0:!x:1 && 0:y:!x").cells();
    expect(corners(c)).toBe("[1, 1]o [0, 0]o [1, 0]");
    expect(levels(c)[1]).toBe("y: [0]+0 .. [1]+0!");
    expect(c.constraints.some((k) => k.strict)).toBe(true);
  });

  test("a feasible region from linear programming", () => {
    const [c] = Region.parse("0:x:_ && 0:y:4-x").cells();
    expect(corners(c)).toBe("[0, 4] [0, 0] [4, 0]");
    expect(S(c.measure)).toBe("8");
  });

  test("checkerboard squares in a box, with their integers", () => {
    const C = Region.parse("n:x:!n+1 && m:y:!m+1");
    const cells = C.cells({ x: [0, 2], y: [0, 2] }).filter((c) => !c.measure.equals(new Rational(0)));
    expect(cells.map((c) => `${c.integers.n},${c.integers.m}`)).toEqual(["0,0", "0,1", "1,0", "1,1"]);
    expect(C.breakpoints("x", { x: [0, 3], y: [0, 1] }).map(S)).toEqual(["0", "1", "2", "3"]);
    expect(C.cells([[0, 1], [0, 1]]).length).toBe(4);
    expect(C.cells({ x: new RationalInterval(new Rational(0), new Rational(1)), y: [0, 1] }).length).toBe(4);
  });

  test("one, three and more variables", () => {
    const [line] = Region.parse("0:x:2 && 1:x:3").cells();
    expect(S(line.measure)).toBe("1");
    const [box] = Region.parse("0:x:1 && 0:y:2 && 0:z:3").cells();
    expect(box.vertices.length).toBe(8);
    expect(box.measure).toBeNull();
    const [point] = Region.parse("1:x:1 && 1:y:1").cells();
    expect(S(point.measure)).toBe("0");
  });

  test("parameters and empty pieces", () => {
    const P = Region.parse("0:x:a && 0:y:a-x", { params: { a: "3/2" } });
    expect(S(P.cells()[0].measure)).toBe("9/8");
    expect(Region.parse("0:x:1 && 2:x:3 && 0:y:1").cells()).toEqual([]);
    expect(Region.parse("0:x:1 && 0:y:1").cells({ x: [5, 6], y: [0, 1] })).toEqual([]);
  });

  test("unbounded regions need a box", () => {
    expect(() => Region.parse("0:x:_ && 0:y:1").cells()).toThrow("unbounded in x");
    expect(() => Region.parse("n:x:_ && 0:y:1").cells()).toThrow("infinitely many values");
    expect(() => Region.parse("0:x:1 && 0:y:1").cells({ x: [1, 0] })).toThrow("reversed");
    expect(() => Region.parse("0:x:1 && 0:y:1").cells({ x: 3 })).toThrow("should be [a, b]");
    expect(() => Region.parse("n:x:!n+1 && 0:y:1").cells({ x: [0, 200001], y: [0, 1] })).toThrow("more than");
  });
});

describe("MultiRegion: sections and breakpoints", () => {
  const T = Region.parse("0:x:1 && 0:y:x || 2:x:3 && 0:y:!1");

  test("section fixes all variables but one", () => {
    expect(T.section({ x: "1/2" }, [0, 1]).toString()).toBe("[0,1/2]");
    expect(T.section({ x: "5/2" }, [0, 2]).toString()).toBe("[0,1)");
    expect(T.section({ y: "1/2" }, [0, 3]).toString()).toBe("[1/2,1] U [2,3]");
    expect(() => T.section({}, [0, 1])).toThrow("all variables but one");
    expect(() => T.section({ x: 0 })).toThrow("needs a window");
  });

  test("breakpoints along an axis", () => {
    expect(T.breakpoints("x").map(S)).toEqual(["0", "1", "2", "3"]);
    expect(T.breakpoints("y").map(S)).toEqual(["0", "1"]);
    expect(() => T.breakpoints("z")).toThrow("not one of");
  });
});

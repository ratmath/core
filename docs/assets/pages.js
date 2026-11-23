// Live demos for the core docs pages, and the runnable code box at the end
// of every page. Each <div data-demo="name"> gets the demo of that name.
import * as C from "./core.js?v=9550585b08";
import { mountRunboxes } from "./runbox.js?v=9550585b08";
import { explorer, formsTable, typeOf } from "./explore.js?v=9550585b08";

const { R, Rational, Integer, RationalInterval, Fraction, FractionInterval, BaseSystem, NumeralSystem, Region, parseNumber } = C;

export function h(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "class") n.className = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) n.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return n;
}

/** Evaluate R text (no interpolation). */
export function evalR(text) {
  const parts = [text];
  parts.raw = parts;
  return R(parts);
}

function card(title, ...kids) {
  return h("div", { class: "demo-card" }, h("div", { class: "demo-title" }, title), ...kids);
}

function input(value, opts = {}) {
  return h("input", { class: "wide", value, spellcheck: "false", autocapitalize: "off", "aria-label": opts.label ?? "Input", ...opts.attrs });
}

function field(label, control) {
  return h("label", { class: "field" }, label, control);
}

function chips(examples, onPick) {
  return h("div", { class: "chips" }, examples.map((ex) => h("button", { type: "button", onclick: () => onPick(ex) }, ex)));
}

function table(rows) {
  return h("table", { class: "forms" }, rows.filter(Boolean).map(([k, v]) => h("tr", {}, h("th", {}, k), h("td", {}, v))));
}

function errorBox(e) {
  return h("div", { class: "err small" }, `${e.name ?? "Error"}: ${e.message ?? e}`);
}

/** Wire inputs to an update function that fills `out`. Errors show in place. */
function live(inputs, out, update) {
  const run = () => {
    for (const i of inputs) i.classList.remove("bad");
    try {
      out.replaceChildren(...[update()].flat());
    } catch (e) {
      out.replaceChildren(errorBox(e));
    }
  };
  for (const i of inputs) i.addEventListener("input", run);
  run();
  return run;
}

/** A number line drawing: pieces [{lo, hi, loOpen, hiOpen, color}] and points. */
function numberLine(lo, hi, pieces = [], points = [], { ticks = 6 } = {}) {
  const W = 640;
  const H = 56;
  const pad = 24;
  const X = (x) => pad + ((x - lo) / (hi - lo)) * (W - 2 * pad);
  const ns = "http://www.w3.org/2000/svg";
  const s = (tag, attrs) => {
    const n = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  const svg = s("svg", { class: "line", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Number line" });
  svg.append(s("line", { x1: pad, x2: W - pad, y1: 30, y2: 30, stroke: "currentColor", "stroke-opacity": ".35" }));
  for (let i = 0; i <= ticks; i++) {
    const x = lo + ((hi - lo) * i) / ticks;
    svg.append(s("line", { x1: X(x), x2: X(x), y1: 26, y2: 34, stroke: "currentColor", "stroke-opacity": ".35" }));
    const t = s("text", { x: X(x), y: 50, "text-anchor": "middle" });
    t.textContent = Number.isInteger(x) ? x : x.toFixed(2);
    svg.append(t);
  }
  pieces.forEach((p, i) => {
    const y = 30 - 8 - (i % 2) * 0;
    const a = Math.max(lo, p.lo ?? -Infinity);
    const b = Math.min(hi, p.hi ?? Infinity);
    if (!(b >= a)) return;
    svg.append(s("line", { x1: X(a), x2: X(b), y1: y, y2: y, stroke: p.color ?? "var(--accent)", "stroke-width": 5, "stroke-linecap": "butt" }));
    for (const [v, open] of [[p.lo, p.loOpen], [p.hi, p.hiOpen]]) {
      if (v == null || v < lo || v > hi) continue;
      svg.append(s("circle", { cx: X(v), cy: y, r: 5, fill: open ? "var(--surface)" : (p.color ?? "var(--accent)"), stroke: p.color ?? "var(--accent)", "stroke-width": 2 }));
    }
  });
  for (const p of points) {
    if (p.x < lo || p.x > hi) continue;
    svg.append(s("line", { x1: X(p.x), x2: X(p.x), y1: 12, y2: 36, stroke: p.color ?? "var(--fg)", "stroke-width": 2 }));
    if (p.label) {
      const t = s("text", { x: X(p.x), y: 9, "text-anchor": "middle" });
      t.textContent = p.label;
      svg.append(t);
    }
  }
  return svg;
}

const num = (q) => Number(q.toNumber ? q.toNumber() : q);
const typed = (v) => h("span", {}, h("span", { class: "typechip" }, typeOf(v)), String(v));

const DEMOS = {
  hero(el) {
    el.append(explorer({ compact: true }));
  },

  integers(el) {
    const a = input("84", { label: "a" });
    const b = input("30", { label: "b" });
    const out = h("div");
    el.append(card("Two integers", h("div", { class: "row" }, field("a", a), field("b", b)), out));
    live([a, b], out, () => {
      const A = new Integer(a.value.trim());
      const B = new Integer(b.value.trim());
      const rows = [
        ["a + b, a − b, a · b", `${A.add(B)}, ${A.subtract(B)}, ${A.multiply(B)}`],
        ["a / b", typed(B.isZero() ? "division by zero" : A.divide(B))],
        ["gcd, lcm", `${A.gcd(B)}, ${A.lcm(B)}`],
        ["a modulo b (sign of a)", B.isZero() ? "—" : String(A.modulo(B))],
        ["floor divide, floor modulo", B.isZero() ? "—" : `${A.floorDivide(B)}, ${A.floorModulo(B)}`],
        ["a in binary, hex", `${A.toString(2)}, ${A.toString(16)}`],
        ["bit length of a", String(A.bitLength())],
      ];
      const n = Number(A.value);
      if (n >= 0 && n <= 300) rows.push(["a!", h("span", { class: "wrap" }, String(A.factorial()))], ["a!!", h("span", { class: "wrap" }, String(A.doubleFactorial()))]);
      if (B.value >= 0n && B.value <= 400n) rows.push(["a ^ b", h("span", { class: "wrap" }, String(A.pow(B)))]);
      return table(rows);
    });
  },

  repeating(el) {
    const x = input("1/7", { label: "fraction" });
    const out = h("div");
    el.append(card("Repeating decimals", field("A fraction, decimal or any R expression", x), chips(["1/7", "1/6", "22/7", "1/97", "5/8", "123/999", "1/81"], (v) => ((x.value = v), run())), out));
    const run = live([x], out, () => {
      const q = evalR(x.value);
      if (!(q instanceof Rational || q instanceof Integer)) throw new TypeError("Type a single number");
      const r = q instanceof Integer ? q.toRational() : q;
      const md = r.computeDecimalMetadata(2000);
      const whole = String(md.wholePart ?? r.trunc());
      const sign = r.lessThan(Rational.zero) && whole === "0" ? "-" : "";
      const dec = h("div", { class: "big" }, sign, whole, ".", md.initialSegment, md.isTerminating ? "" : h("span", { class: "period" }, md.periodDigits.length > 120 ? `${md.periodDigits.slice(0, 120)}…` : md.periodDigits));
      const q2 = r.denominator;
      return [
        dec,
        table([
          ["RatMath notation", r.toRepeatingDecimal(5000)],
          ["denominator", `${q2}`],
          ["pre-period digits", String(md.initialSegment.length)],
          ["period length", md.isTerminating ? "0 (terminates)" : String(md.periodLength)],
          ["why", md.isTerminating ? "the denominator has no prime factors but 2 and 5" : `10 has order ${md.periodLength} modulo the part of ${q2} prime to 10`],
        ]),
      ];
    });
  },

  cf(el) {
    const x = input("3.14159265358979", { label: "value" });
    const d = h("input", { type: "range", min: 1, max: 400, value: 120, "aria-label": "Largest denominator" });
    const dl = h("output", {}, "120");
    const out = h("div");
    el.append(card("Convergents and best approximations", field("A rational (decimals are exact)", x), chips(["3.14159265358979", "355/113", "1.41421356", "2.718281828", "0.#3", "1.6180339887"], (v) => ((x.value = v), run())), h("label", { class: "slider" }, "largest denominator ", dl, d), out));
    const run = live([x, d], out, () => {
      dl.textContent = d.value;
      const q = evalR(x.value);
      const r = q instanceof Integer ? q.toRational() : q;
      if (!(r instanceof Rational)) throw new TypeError("Type a single number");
      const cf = r.toContinuedFraction({ maxTerms: 40 });
      const conv = r.convergents({ maxCount: 14 });
      const best = r.bestApproximation(BigInt(d.value));
      const bc = r.bestConvergent(BigInt(d.value));
      const t = h("table", { class: "data" }, h("tr", {}, h("th", {}, "k"), h("th", {}, "aₖ"), h("th", {}, "convergent"), h("th", {}, "error")));
      conv.forEach((c, k) => t.append(h("tr", {}, h("td", {}, k), h("td", {}, String(cf[k] ?? "")), h("td", {}, String(c)), h("td", {}, r.subtract(c).abs().toNumber().toExponential(2)))));
      return [
        table([
          ["continued fraction", r.toContinuedFractionString({ maxTerms: 40 })],
          [`best with q ≤ ${d.value}`, `${best}  (error ${r.subtract(best).abs().toNumber().toExponential(3)})`],
          [`last convergent with q ≤ ${d.value}`, `${bc}  (error ${r.subtract(bc).abs().toNumber().toExponential(3)})`],
        ]),
        h("div", { class: "mxwrap" }, t),
      ];
    });
  },

  intervals(el) {
    const a = input("1:2", { label: "a" });
    const b = input("-1/2:3", { label: "b" });
    const out = h("div");
    el.append(card("Interval arithmetic", h("div", { class: "row" }, field("a", a), field("b", b)), out));
    live([a, b], out, () => {
      const A = toIv(evalR(a.value));
      const B = toIv(evalR(b.value));
      const ops = [
        ["a + b", () => A.add(B)],
        ["a − b", () => A.subtract(B)],
        ["a · b", () => A.multiply(B)],
        ["a / b", () => A.divide(B)],
        ["a²  (pow)", () => A.pow(2)],
        ["a · a  (mpow)", () => A.mpow(2)],
        ["a ∩ b", () => A.intersection(B) ?? "empty"],
      ];
      const res = ops.map(([k, f]) => {
        try {
          return [k, String(f())];
        } catch (e) {
          return [k, h("span", { class: "muted" }, e.message)];
        }
      });
      const all = [A, B].flatMap((x) => [num(x.low), num(x.high)]);
      let lo = Math.min(...all, 0);
      let hi = Math.max(...all, 0);
      const padv = (hi - lo) * 0.1 || 1;
      lo -= padv;
      hi += padv;
      const sum = A.add(B);
      return [
        numberLine(lo, hi, [
          { lo: num(A.low), hi: num(A.high), color: "var(--accent)" },
        ], [{ x: num(B.low), label: "b" }, { x: num(B.high), label: "b" }]),
        h("div", { class: "legend small muted" }, "bar: a, marks: ends of b. a + b = ", String(sum)),
        table(res),
      ];
    });
  },

  display(el) {
    const x = input("1.224:1.235", { label: "interval" });
    const out = h("div");
    el.append(card("Ways to write one interval", field("An interval", x), chips(["1.224:1.235", "1/3:2/3", "3.14159:3.1416", "0.5[+-0.01]", "2.71[82:83]", "-1/7:1/7"], (v) => ((x.value = v), run())), out));
    const run = live([x], out, () => {
      const I = toIv(evalR(x.value));
      const safe = (f) => {
        try {
          return String(f());
        } catch (e) {
          return h("span", { class: "muted" }, e.message);
        }
      };
      return table([
        ["toString()", safe(() => I.toString())],
        ["toMixedString()", safe(() => I.toMixedString())],
        ["toRepeatingDecimal()", safe(() => I.toRepeatingDecimal())],
        ["compactedDecimalInterval()", safe(() => I.compactedDecimalInterval())],
        ["relativeMidDecimalInterval()", safe(() => I.relativeMidDecimalInterval())],
        ["relativeDecimalInterval()", safe(() => I.relativeDecimalInterval())],
        ["midpoint(), mediant()", safe(() => `${I.midpoint()}, ${I.mediant()}`)],
        ["shortestDecimal()", safe(() => I.shortestDecimal())],
        ["width", safe(() => I.high.subtract(I.low))],
      ]);
    });
  },

  certified(el) {
    const a = input("3.14159?26", { label: "a" });
    const b = input("22/7", { label: "b" });
    const out = h("div");
    el.append(card("A guess with a guarantee", h("div", { class: "row" }, field("a (use ? for the certified prefix)", a), field("b", b)), chips(["3.14159?26", "1.5?", "2.~2~2?", "23.456?789[+-12]", "0.333?"], (v) => ((a.value = v), run())), out));
    const run = live([a, b], out, () => {
      const A = parseNumber(a.value.trim());
      const B = evalR(b.value);
      const rel = C.possibleRelations(A, B);
      const names = [["LESS", "a < b"], ["EQUAL", "a = b"], ["GREATER", "a > b"]].filter(([k]) => rel & C.Relation[k]).map(([, s]) => s);
      const iv = A.enclosure ?? toIv(A);
      return [
        table([
          ["type", typeOf(A)],
          ["candidate", A.candidate ? String(A.candidate) : String(A)],
          ["enclosure", String(iv)],
          ["enclosure width", String(iv.high.subtract(iv.low))],
          ["a + b", String(A.add(B))],
          ["possible relations to b", names.join(", ") || "none"],
        ]),
        numberLine(num(iv.low) - (num(iv.high) - num(iv.low) || 1) * 0.5, num(iv.high) + (num(iv.high) - num(iv.low) || 1) * 0.5, [{ lo: num(iv.low), hi: num(iv.high) }], [A.candidate ? { x: num(A.candidate), label: "guess" } : null, { x: num(toIv(B).low), label: "b", color: "var(--exact)" }].filter(Boolean)),
      ];
    });
  },

  rtemplate(el) {
    const x = input("1:2 + 3:4", { label: "expression" });
    const out = h("div");
    el.append(card("Type an R expression", field("R`…`", x), chips(["1:2 + 3:4", "1:2 * 2", "1:2*2", "1 : 2 + 3", "1/2:3/4", "0.#3 * 3", "1..2/3 + 1/3", "2^-3", "10!", "3.~7~15~1", "0xff.8 / 3", "1_^3 + 2.5_^-2", "1.5[+-0.01]", "0:1/2:1"], (v) => ((x.value = v), run())), out));
    const run = live([x], out, () => {
      const v = evalR(x.value);
      return h("div", { class: "big" }, typed(v));
    });
  },

  chains(el) {
    const x = input("2:!x:8 || 10:x:_", { label: "region" });
    const v = h("input", { type: "range", min: -20, max: 160, value: 40, "aria-label": "x" });
    const vl = h("output", {}, "");
    const out = h("div");
    el.append(card("Chains on a number line", field("A chain on x (with one integer variable at most)", x), chips(["2:!x:8 || 10:x:_", "_:x:!-1 || 1:!x:_", "2n:x:!2n+1", "n:x:n+1/2", "0:x:1", "3n-1:!x:!3n+1"], (s) => ((x.value = s), run())), h("label", { class: "slider" }, "x = ", vl, v), out));
    const run = live([x, v], out, () => {
      const reg = Region.parse(x.value.trim(), { variable: "x" });
      const xv = new Rational(Number(v.value), 10);
      vl.textContent = String(xv);
      const lo = -2;
      const hi = 16;
      const pieces = reg.intervals(lo, hi).map((p) => ({ lo: p.lo ? num(p.lo) : -Infinity, hi: p.hi ? num(p.hi) : Infinity, loOpen: p.loStrict, hiOpen: p.hiStrict }));
      const m = reg.match(xv);
      return [
        numberLine(lo, hi, pieces, [{ x: num(xv), label: "x", color: m ? "var(--exact)" : "var(--bad)" }], { ticks: 9 }),
        table([
          ["contains(x)", h("span", { class: m ? "yes" : "no" }, String(!!m))],
          ["match(x)", m ? JSON.stringify(Object.fromEntries(Object.entries(m).map(([k, q]) => [k, String(q)]))) : "null"],
          ["within(-2, 16)", String(reg.within(lo, hi))],
          ["breakpoints(-2, 16)", reg.breakpoints(lo, hi).map(String).join(", ")],
        ]),
      ];
    });
  },

  parsing(el) {
    const x = input("0.1#6", { label: "literal" });
    const out = h("div");
    el.append(card("Which parser accepts it?", field("A number literal", x), chips(["0.1#6", "-2..1/4", "3.~7~15", "1.23[56:67]", "1.3[+-1]", "0.[#3:#6]", "0.{0~8}1", "1_000", "23.456?789", "1/3:2/3", "1.25#0"], (s) => ((x.value = s), run())), out));
    const run = live([x], out, () => {
      const text = x.value;
      const fns = ["parseNumber", "parseRational", "parseDecimal", "parseMixedNumber", "parseContinuedFraction", "parseInterval", "parseCertifiedApproximation"];
      return table(
        fns.map((f) => {
          try {
            const v = C[f](text);
            return [f, typed(v)];
          } catch (e) {
            return [f, h("span", { class: "muted" }, `✗ ${e.message}`)];
          }
        }),
      );
    });
  },

  bases(el) {
    const x = input("1/3", { label: "value" });
    const b = h("input", { class: "small", type: "number", min: 2, max: 62, value: 2, "aria-label": "base" });
    const out = h("div");
    el.append(card("One value in many bases", h("div", { class: "row" }, field("A rational", x), field("base (2–62)", b)), chips(["1/3", "1/10", "22/7", "255/256", "-5", "1/7"], (s) => ((x.value = s), run())), out));
    const run = live([x, b], out, () => {
      const q = evalR(x.value);
      const r = q instanceof Integer ? q.toRational() : q;
      const sys = BaseSystem.fromBase(Number(b.value));
      const rep = r.toRepeatingBaseWithPeriod(sys);
      const bal = new NumeralSystem({ kind: "balanced", radix: 3, tokens: ["T", "0", "1"] });
      const neg = new NumeralSystem({ kind: "negative", radix: -2, tokens: ["0", "1"] });
      const fmt = (s) => {
        const f = s.format(r, { maxDigits: 64 });
        return f.spelling ?? `${f.status} (needs more than 64 digits)`;
      };
      return table([
        [`base ${b.value} expansion`, rep.baseStr],
        ["period", String(rep.period)],
        [`numerator/denominator in base ${b.value}`, r.toBase(sys)],
        ["base 10", r.toRepeatingDecimal(400)],
        ["balanced ternary (T = −1)", fmt(bal)],
        ["negabinary (base −2)", fmt(neg)],
      ]);
    });
  },

  harmonic(el) {
    const n = h("input", { type: "range", min: 1, max: 200, value: 10, "aria-label": "n" });
    const nl = h("output", {}, "10");
    const out = h("div");
    el.append(card("Harmonic numbers, exactly", h("label", { class: "slider" }, "n = ", nl, n), out));
    live([n], out, () => {
      nl.textContent = n.value;
      const H = C.sum(1, Number(n.value), (i) => R`1/${i}`);
      const r = H instanceof Integer ? H.toRational() : H;
      return table([
        [`H(${n.value}) = Σ 1/k`, h("span", { class: "wrap" }, String(H))],
        ["≈", r.toDecimal(30)],
        ["denominator digits", String(String(r.denominator ?? 1n).length)],
        ["bits (bitLength)", String(H.bitLength())],
      ]);
    });
  },

  sternbrocot(el) {
    const x = input("3/5", { label: "fraction" });
    const out = h("div");
    el.append(card("Find a fraction in the Stern–Brocot tree", field("A reduced fraction", x), chips(["3/5", "22/7", "-2/3", "13/8", "355/113"], (s) => ((x.value = s), run())), out));
    const run = live([x], out, () => {
      const f = new Fraction(x.value.trim());
      if (!f.isSternBrocotValid()) throw new Error("Use a reduced fraction with a positive denominator");
      const path = f.sternBrocotPath();
      let left = new Fraction(-1, 0, { allowInfinite: true });
      let right = new Fraction(1, 0, { allowInfinite: true });
      let cur = new Fraction(0, 1);
      const steps = [["root", `${left} < ${cur} < ${right}`]];
      for (const d of path) {
        if (d === "L") right = cur;
        else left = cur;
        cur = left.mediant(right);
        steps.push([d === "L" ? "L (go left)" : "R (go right)", `${left} < ${cur} < ${right}`]);
      }
      const runs = path.join("").match(/L+|R+/g) ?? [];
      return [
        table([
          ["path", path.join("") || "(root)"],
          ["depth", String(f.sternBrocotDepth())],
          ["runs", runs.map((r) => `${r[0]}${r.length}`).join(" ") || "—"],
          ["parent", String(f.sternBrocotParent() ?? "—")],
          ["Farey parents", (() => {
            const p = f.fareyParents();
            return `${p.left} and ${p.right}`;
          })()],
        ]),
        h("div", { class: "mxwrap" }, h("table", { class: "data" }, steps.map(([a, b]) => h("tr", {}, h("td", {}, a), h("td", {}, b))))),
      ];
    });
  },

  mediants(el) {
    const d = h("input", { type: "range", min: 0, max: 5, value: 2, "aria-label": "depth" });
    const dl = h("output", {}, "2");
    const out = h("div");
    el.append(card("Mediant splits of [0/1, 1/1]", h("label", { class: "slider" }, "depth ", dl, d), out));
    live([d], out, () => {
      dl.textContent = d.value;
      const I = new FractionInterval(new Fraction(0, 1), new Fraction(1, 1));
      const parts = I.partitionWithMediants(Number(d.value));
      const pts = [parts[0].low, ...parts.map((p) => p.high)];
      return [
        numberLine(0, 1, [], pts.map((p) => ({ x: Number(p.numerator) / Number(p.denominator), label: Number(d.value) <= 3 ? String(p) : "" })), { ticks: 4 }),
        h("p", { class: "mono wrap" }, pts.map(String).join("  ")),
      ];
    });
  },

  promotion(el) {
    const a = input("2", { label: "a" });
    const b = input("1/3", { label: "b" });
    const out = h("div");
    el.append(card("What type comes out?", h("div", { class: "row" }, field("a", a), field("b", b)), chips(["2 | 1/3", "8 | 4", "8 | 3", "1/2 | 1:2", "1.5? | 1/2", "0.#3 | 3"], (s) => {
      const [p, q] = s.split(" | ");
      a.value = p;
      b.value = q;
      run();
    }), out));
    const run = live([a, b], out, () => {
      const A = evalR(a.value);
      const B = evalR(b.value);
      const op = (f) => {
        try {
          return typed(f());
        } catch (e) {
          return h("span", { class: "muted" }, e.message);
        }
      };
      return table([
        ["a", typed(A)],
        ["b", typed(B)],
        ["a.add(b)", op(() => A.add(B))],
        ["a.multiply(b)", op(() => A.multiply(B))],
        ["a.divide(b)", op(() => A.divide(B))],
        ["R`a * b` (whole results become Integer)", op(() => R`${A} * ${B}`)],
      ]);
    });
  },

  explore(el) {
    el.append(explorer({ compact: false }));
  },
};

function toIv(v) {
  if (v instanceof RationalInterval) return v;
  if (v && v.enclosure) return v.enclosure;
  if (v instanceof Integer) return RationalInterval.point(v.toRational());
  if (v instanceof Rational) return RationalInterval.point(v);
  throw new TypeError("Expected a number or an interval");
}

for (const el of document.querySelectorAll("[data-demo]")) {
  const make = DEMOS[el.dataset.demo];
  if (!make) continue;
  try {
    make(el);
  } catch (e) {
    el.append(errorBox(e));
  }
}

document.getElementById("toc-select")?.addEventListener("change", (e) => {
  location.href = e.target.value;
});

mountRunboxes(document, { scope: C });
export { formsTable };

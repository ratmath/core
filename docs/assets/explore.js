// The free-form explorer: type R expressions, keep names, see every form of
// each answer. Used on the Explore page and (compact) on the Overview.
import * as C from "./core.js?v=5d6410b803";

const { R, Rational, Integer, RationalInterval } = C;

function h(tag, attrs = {}, ...kids) {
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

export function typeOf(v) {
  if (typeof v === "boolean") return "chain → boolean";
  if (typeof v === "string") return "";
  return v?.constructor?.name ?? typeof v;
}

const safe = (f) => {
  try {
    return String(f());
  } catch (e) {
    return `— (${e.message})`;
  }
};

function repeating(q, limit = 80) {
  try {
    return q.toRepeatingDecimal(limit);
  } catch {
    return q.toRepeatingDecimal(limit, "trunc");
  }
}

/** Rows [label, text] describing a Core value in its useful written forms. */
export function forms(v, { digits = 20, base = 10 } = {}) {
  if (typeof v === "boolean") return [["value", String(v)], ["meaning", v ? "the values run in one direction (the chain holds)" : "the chain does not hold"]];
  if (v instanceof Integer) {
    const rows = [["integer", String(v)], ["binary", v.toString(2)], ["hexadecimal", v.toString(16)], ["bit length", String(v.bitLength())]];
    if (base !== 10) rows.splice(1, 0, [`base ${base}`, safe(() => v.toRational().toRepeatingBase(C.BaseSystem.fromBase(base)))]);
    return rows;
  }
  if (v instanceof Rational) {
    const rows = [
      ["fraction", String(v)],
      ["mixed", v.toMixedString()],
      ["repeating decimal", repeating(v)],
      [`decimal (${digits} places)`, v.toDecimal(digits)],
      ["continued fraction", safe(() => v.toContinuedFractionString({ maxTerms: 30 }))],
      ["scientific", safe(() => v.toScientificNotation())],
    ];
    if (base !== 10) rows.splice(3, 0, [`base ${base}`, safe(() => v.toRepeatingBase(C.BaseSystem.fromBase(base)))]);
    return rows;
  }
  if (v instanceof RationalInterval) {
    return [
      ["interval", String(v)],
      ["mixed", safe(() => v.toMixedString())],
      ["common prefix", safe(() => v.compactedDecimalInterval())],
      ["midpoint ± offset", safe(() => v.relativeMidDecimalInterval())],
      ["low, high", `${v.low.toDecimal(digits)}, ${v.high.toDecimal(digits)}`],
      ["width", String(v.high.subtract(v.low))],
      ["shortest decimal inside", safe(() => v.shortestDecimal())],
    ];
  }
  if (v && v.enclosure) {
    return [
      ["certified", String(v)],
      ["candidate", String(v.candidate)],
      ["enclosure", String(v.enclosure)],
      ["enclosure, as decimals", `${v.enclosure.low.toDecimal(digits)} to ${v.enclosure.high.toDecimal(digits)}`],
    ];
  }
  return [["value", String(v)]];
}

export function formsTable(v, opts) {
  return h("table", { class: "forms" }, forms(v, opts).map(([k, t]) => h("tr", {}, h("th", {}, k), h("td", {}, t))));
}

const NAME = /^\s*([A-Za-z_][\w]*)\s*=(?!=)\s*([\s\S]+)$/;
const RESERVED = new Set(["x"]); // x is the chain variable in R.region text

/** Evaluate text with R (or R.base(b)), substituting known names as exact values. */
export function evaluate(text, names = {}, base = 10) {
  const tag = base === 10 ? R : R.base(base);
  const keys = Object.keys(names).sort((a, b) => b.length - a.length);
  const strings = [];
  const values = [];
  if (keys.length) {
    const re = new RegExp(`(?<![\\w.~#])(${keys.join("|")})(?![\\w])`, "g");
    let last = 0;
    for (const m of text.matchAll(re)) {
      strings.push(text.slice(last, m.index));
      values.push(names[m[1]]);
      last = m.index + m[0].length;
    }
    strings.push(text.slice(last));
  } else strings.push(text);
  strings.raw = strings;
  return tag(strings, ...values);
}

const EXAMPLES = ["1/3 + 1/6", "0.#142857 * 7", "(1:2) * (3:4)", "1:2 + 3:4", "1.5[+-0.01] ^ 3", "3.~7~15~1", "20!", "2^100 / 3^50", "0:1/2:1", "2:!3:8", "0b0.#01 + 0x0.8", "1.41421356? ^ 2"];

/**
 * compact: one input with live results (Overview). Otherwise a log of
 * entries with names (`a = 1/3`), `ans`, a base and a digits setting.
 */
export function explorer({ compact = false } = {}) {
  const wrap = h("div", { class: "demo-card" });
  const inp = h("input", { class: "wide", value: compact ? "1/3 + 1/6" : "", placeholder: "Type R text, e.g. 1/3 + 1/6, and press Enter", spellcheck: "false", autocapitalize: "off", "aria-label": "Expression" });
  const chipRow = h("div", { class: "chips" }, EXAMPLES.map((ex) => h("button", { type: "button", onclick: () => ((inp.value = ex), compact ? show() : submit()) }, ex)));
  if (compact) {
    const out = h("div");
    const show = () => {
      inp.classList.remove("bad");
      try {
        const v = evaluate(inp.value);
        out.replaceChildren(h("div", { class: "big" }, h("span", { class: "typechip" }, typeOf(v)), String(v)), formsTable(v));
      } catch (e) {
        inp.classList.add("bad");
        out.replaceChildren(h("div", { class: "err small" }, `${e.name}: ${e.message}`));
      }
    };
    inp.addEventListener("input", show);
    wrap.append(h("div", { class: "demo-title" }, "Exact arithmetic, written as text"), inp, chipRow, out);
    show();
    return wrap;
  }
  const names = {};
  const baseSel = h("select", { "aria-label": "Base" }, [10, 2, 3, 8, 12, 16, 60].map((b) => h("option", { value: b }, `base ${b}`)));
  const digits = h("input", { class: "small", type: "number", min: 1, max: 400, value: 20, "aria-label": "Decimal places" });
  const vars = h("div", { class: "chips" });
  const log = h("div", { class: "wb-log" });
  const status = h("div", { class: "small muted" }, "Enter evaluates. a = 1/3 names a value; ans is the last answer. Click an entry to edit it again.");
  const paintVars = () =>
    vars.replaceChildren(
      ...Object.entries(names).map(([k, v]) => h("button", { type: "button", title: "Insert", onclick: () => ((inp.value += k), inp.focus()) }, `${k} = ${String(v).length > 30 ? `${String(v).slice(0, 30)}…` : v}`)),
    );
  function submit() {
    const text = inp.value.trim();
    if (!text) return;
    inp.classList.remove("bad");
    const m = text.match(NAME);
    const expr = m && !RESERVED.has(m[1]) ? m[2] : text;
    const base = Number(baseSel.value);
    let entry;
    try {
      const v = evaluate(expr, names, base);
      if (m && !RESERVED.has(m[1])) names[m[1]] = v;
      if (typeof v !== "boolean") names.ans = v;
      paintVars();
      entry = h(
        "div",
        { class: "wb-entry" },
        h("button", { class: "wb-src", type: "button", onclick: () => ((inp.value = text), inp.focus()) }, text),
        h("div", { class: "big" }, h("span", { class: "typechip" }, typeOf(v)), String(v)),
        h("details", {}, h("summary", { class: "small muted" }, "every form"), formsTable(v, { digits: Number(digits.value) || 20, base })),
      );
      inp.value = "";
    } catch (e) {
      inp.classList.add("bad");
      entry = h("div", { class: "wb-entry", style: "background: var(--sunk)" }, h("button", { class: "wb-src", type: "button", onclick: () => ((inp.value = text), inp.focus()) }, text), h("div", { class: "err small" }, `${e.name}: ${e.message}`));
    }
    log.prepend(entry);
    entry.querySelector("details")?.setAttribute("open", "");
    for (const d of [...log.querySelectorAll("details")].slice(1)) d.removeAttribute("open");
  }
  inp.addEventListener("keydown", (e) => {
    if (e.key === "Enter") submit();
  });
  wrap.append(
    h("div", { class: "row" }, h("div", { style: "flex: 1 1 18rem" }, inp), h("label", { class: "field" }, "read literals in", baseSel), h("label", { class: "field" }, "decimal places", digits)),
    chipRow,
    status,
    vars,
    log,
  );
  return wrap;
}

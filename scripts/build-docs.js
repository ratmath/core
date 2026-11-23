// Build the docs site in docs/ from docs-src/.
//
//   bun run docs:build            bundle, assemble pages, check every code box
//   bun run docs:build --verbose  also print what each page's box shows
//
// Each page is an HTML fragment in docs-src/pages/<name>.html. The build
// typesets \( … \) and \[ … \] with KaTeX, appends the runnable code box
// (seeded from <template data-runbox> or the page's code examples), wraps the
// page in docs-src/layout.html, and stamps asset links with a content hash so
// a browser never mixes a cached script with a new page. Finally it runs every
// box's code against the library and fails if any of it throws.
import { readFileSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { renderMath, addRunbox, stampAssets, stampLinks, KATEX_LINK } from "./docs-kit.js";
import { runCode } from "../docs/assets/runbox.js";
import * as core from "../index.js";

export const SITE = "https://ratmath.com/core/";

export const PAGES = [
  { name: "intro", file: "index.html", title: "Overview", description: "Exact integers, rationals, intervals and certified approximations for JavaScript." },
  { name: "reference", title: "Reference", description: "Every export of @ratmath/core with its signature." },
  { name: "explore", title: "Explore", description: "Type exact arithmetic and see every form of the answer." },
  { group: "Numbers" },
  { name: "integers", title: "Integers", description: "BigInt integers: arithmetic, gcd, factorials, floor division." },
  { name: "rationals", title: "Rationals", description: "Exact fractions, repeating decimals and rounding." },
  { name: "continued-fractions", title: "Continued fractions", description: "Continued fractions, convergents and best approximations." },
  { name: "intervals", title: "Intervals", description: "Rational intervals, interval arithmetic, display forms and interval sets." },
  { name: "certified", title: "Certified approximations", description: "A guess plus an exact enclosure that is the real promise." },
  { group: "Writing numbers" },
  { name: "r-template", title: "The R template", description: "Exact arithmetic written as text: literals, operators, spacing." },
  { name: "chains", title: "Chains and regions", description: "Betweenness tests, strict links, unbounded ends, unions and Region." },
  { name: "parsing", title: "Number literals", description: "Repeating decimals, mixed numbers, uncertainty and continued fraction literals." },
  { name: "bases", title: "Bases and numeral systems", description: "Digits in any base, balanced and negative bases, repeating expansions." },
  { group: "More" },
  { name: "lists", title: "Lists, sums and products", description: "range, seq, sum, product and ExactList." },
  { name: "fractions", title: "Fractions and Stern–Brocot", description: "Unreduced fractions, mediants, Farey neighbours and the Stern–Brocot tree." },
  { name: "promotion", title: "Types, promotion and JSON", description: "How mixed arithmetic chooses a result type, type guards and JSON." },
];

// Pages of the old Quarto site, kept as redirects so links to them still work.
const REDIRECTS = {
  "api-index.html": "reference.html",
  "getting-started.html": "index.html",
  "examples.html": "explore.html",
  "exact-expressions.html": "r-template.html",
  "integer.html": "integers.html",
  "rational.html": "rationals.html",
  "rational-interval.html": "intervals.html",
  "certified-approximation.html": "certified.html",
  "fraction.html": "fractions.html",
  "fraction-interval.html": "fractions.html",
  "base-system.html": "bases.html",
  "numeral-system.html": "bases.html",
  "type-promotion.html": "promotion.html",
};

const verbose = process.argv.includes("--verbose");

// 1. The library bundle the pages and boxes use.
const out = await Bun.build({ entrypoints: ["./scripts/docs-entry.js"], outdir: "./docs/assets", naming: "core.js", target: "browser", format: "esm", minify: { whitespace: true, syntax: true, identifiers: true, keepNames: true } });
if (!out.success) {
  for (const m of out.logs) console.error(m);
  process.exit(1);
}
console.log("docs/assets/core.js written");

// 2. Pages.
const v = stampAssets("docs/assets");
const layout = readFileSync("docs-src/layout.html", "utf8");
const pages = PAGES.filter((p) => p.name).map((p) => ({ ...p, file: p.file ?? `${p.name}.html` }));
const fileOf = Object.fromEntries(pages.map((p) => [p.name, p.file]));
const seeds = [];
let mathCount = 0;
for (const [i, p] of pages.entries()) {
  let src = readFileSync(`docs-src/pages/${p.name}.html`, "utf8");
  const wide = /<!-- wide: yes -->/.test(src) ? " wide" : "";
  src = src.replace(/<!-- wide: (yes|no) -->\n?/, "").replace(/href="#([a-z-]+)(#[\w-]+)?"/g, (m, id, hash) => (fileOf[id] ? `href="${fileOf[id]}${hash ?? ""}"` : m));
  const boxed = addRunbox(src, { lib: "<code>@ratmath/core</code>" });
  seeds.push({ page: p.name, seed: boxed.seed });
  const math = renderMath(boxed.html);
  mathCount += math.count;
  const options = pages.map((q) => `    <option value="${q.file}"${q === p ? " selected" : ""}>${q.title}</option>`).join("\n");
  const links = PAGES.map((q) => (q.group ? `    <div class="group">${q.group}</div>` : `    <a href="${fileOf[q.name]}"${q.name === p.name ? ' class="on" aria-current="page"' : ""}>${q.title}</a>`)).join("\n");
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const pager = `${prev ? `<a class="prev" href="${prev.file}"><small>Previous</small>${prev.title}</a>` : "<span></span>"}${next ? `<a class="next" href="${next.file}"><small>Next</small>${next.title}</a>` : "<span></span>"}`;
  const html = layout
    .replace("{{title}}", p.name === "intro" ? "RatMath Core: exact numbers for JavaScript" : `${p.title} · RatMath Core`)
    .replace("{{description}}", p.description)
    .replace("{{file}}", p.file === "index.html" ? "" : p.file)
    .replace("{{katex}}", math.count ? KATEX_LINK : "")
    .replace("{{options}}", options)
    .replace("{{links}}", links)
    .replace("{{wide}}", wide)
    .replace("{{name}}", p.name)
    .replace("{{body}}", () => math.html.trimEnd())
    .replace("{{pager}}", pager);
  writeFileSync(`docs/${p.file}`, stampLinks(html, v));
}
console.log(`${pages.length} pages written to docs/ (${mathCount} formulas typeset, assets ?v=${v})`);

// 3. Sitemap and robots.txt.
const today = new Date().toISOString().slice(0, 10);
writeFileSync("docs/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `  <url><loc>${SITE}${p.file === "index.html" ? "" : p.file}</loc><lastmod>${today}</lastmod></url>`).join("\n")}\n</urlset>\n`);
writeFileSync("docs/robots.txt", `Sitemap: ${SITE}sitemap.xml\n`);
if (!existsSync("docs/.nojekyll")) writeFileSync("docs/.nojekyll", "");
for (const old of ["docs/site_libs", "docs/search.json", "docs/styles.css"]) rmSync(old, { recursive: true, force: true });
for (const [from, to] of Object.entries(REDIRECTS)) {
  writeFileSync(`docs/${from}`, `<!doctype html>\n<meta charset="utf-8">\n<title>Moved</title>\n<link rel="canonical" href="${SITE}${to === "index.html" ? "" : to}">\n<meta http-equiv="refresh" content="0; url=${to}">\n<p>This page moved to <a href="${to}">${to}</a>.</p>\n`);
}

// 4. Every box must run.
let failed = 0;
for (const { page, seed } of seeds) {
  const res = await runCode(seed, core);
  if (res.error) {
    failed++;
    console.error(`✗ ${page}: ${res.error.name}: ${res.error.message}`);
  } else if (verbose) {
    console.log(`— ${page} (${res.ms.toFixed(0)} ms)`);
    for (const pr of res.prints) console.log(`  ${pr.text}`);
    if (res.hasValue) console.log(`  → ${res.type ? `${res.type} ` : ""}${res.text}`);
  }
}
if (failed) {
  console.error(`${failed} code box(es) failed`);
  process.exit(1);
}
console.log(`${seeds.length} code boxes run without errors`);

#!/usr/bin/env node
/**
 * Token lint: the design system is only a system if a machine holds it shut.
 *
 * WHY THIS EXISTS
 *
 * This repo already proves the point. `caps-lint.mjs` holds one rule — nothing
 * is ever set in all caps — and that rule has never broken. Every rule that was
 * written down in a comment instead of a check broke: 109 font sizes with no
 * scale, seven weights, three unrelated palettes, and a page rendering colours
 * no token controls.
 *
 * The sharpest case was `app/world.module.css`, which called `--nc-quiet`,
 * `--nc-teacher`, `--nc-green`, `--nc-terracotta` and `--nc-rule` thirty-one
 * times. None of those five was ever defined. Every one silently rendered its
 * `var()` fallback, so that page ran a fourth palette that no token controlled
 * and that no amount of editing globals.css could have changed. It shipped, and
 * it was found by a person reading the page, which is the expensive way.
 *
 * A `var(--x, #fallback)` whose `--x` does not exist is not a fallback. It is a
 * hard-coded colour wearing a token's clothes, and it is invisible in review
 * because it LOOKS like it is consuming the system.
 *
 * GATE 1 OF 3 (nc#382).
 *
 * This is the phantom-token gate, and it lands alone and first, deliberately.
 * It has no design dependency: it does not care which green wins, what the
 * ground is, or whether the scale exists yet. It is a pure defect detector,
 * it goes red on real bugs that are in the tree today, and green is proof the
 * fix is complete without anyone auditing by hand.
 *
 * The other two gates (no inline hex, font-size must come from the scale) land
 * LAST, after the migration, because shipping them now would leave a
 * permanently-red check against ninety-six existing hexes — and a gate that is
 * always red is worse than no gate, because the team learns to ignore it.
 *
 * WHAT COUNTS AS DEFINED
 *
 * Custom properties inherit, so a token defined in any stylesheet under app/ is
 * available to every other one at runtime. The check is therefore repo-wide
 * rather than per-file: this is a "does this token exist anywhere" check, not a
 * scope-resolution check.
 *
 * Two tokens are defined OUTSIDE css — `--font-display` and `--font-text` come
 * from next/font in app/layout.tsx. Those are discovered by scanning the TSX
 * for `variable:` rather than being written into an allowlist here, because an
 * allowlist is another thing that rots when someone adds a third font.
 *
 * CSS-IN-TSX IS SCANNED TOO, and it has to be. app/welcome/Landing.tsx ships a
 * whole stylesheet as a template literal, and it declared `--terracotta:
 * #566036` — a token named for one hue holding another product's green. Its
 * `.fj-cta` painted that token and hovered to `--terracotta-deep` (a real
 * terracotta), so the public landing's primary button was green and turned
 * orange-red under the cursor. A gate that only read .css files could not see
 * any of it: not the definition, not the uses, not the consequence. A colour
 * does not stop being part of the design system because it is spelled inside a
 * backtick.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const SCAN_DIRS = ["app"];

/* COMMENTS ARE PROSE, NOT CODE, AND THIS GATE MUST NOT READ THEM.
 *
 * Learned immediately and the hard way. app/SkyMark.tsx documents a real past
 * bug by quoting the code that caused it — `fill="var(--cloud)"` — inside its
 * header comment. The first version of this check read that quotation as a live
 * call site and failed the build over a defect that was fixed months ago and is
 * already held by its own test.
 *
 * That is the exact failure this script's header warns about: a gate that cries
 * wolf is a gate someone switches off, and then the 31 real defects it exists to
 * catch go with it. It matters more here than in most repos, because these
 * stylesheets carry unusually thorough documentation that quotes values and
 * tokens on purpose — good comments are the norm, so misreading them is not an
 * edge case.
 *
 * Comments are blanked rather than deleted so every reported line number still
 * points at the right line in the real file. */
function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  /* Line comments, but never a URL's `//`, which is why `:` is excluded. */
  out = out.replace(/(^|[^:\\])\/\/[^\n]*/g, (m, p) => p + " ".repeat(m.length - p.length));
  return out;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const cssFiles = files.filter((f) => f.endsWith(".css"));
const tsxFiles = files.filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));

/* Defined in CSS: `--name:` in a declaration position. The negative lookbehind
   for `(` keeps `var(--name, ...)` from being read as a definition. */
const defined = new Set();
for (const file of cssFiles) {
  const src = stripComments(readFileSync(file, "utf8"));
  for (const m of src.matchAll(/(^|[;{\s])(--[a-zA-Z0-9-]+)\s*:/g)) {
    defined.add(m[2]);
  }
}

/* Defined outside CSS: next/font, inline style objects, and CSS-in-TSX. */
for (const file of tsxFiles) {
  const src = stripComments(readFileSync(file, "utf8"));
  for (const m of src.matchAll(/variable\s*:\s*["'](--[a-zA-Z0-9-]+)["']/g)) {
    defined.add(m[1]);
  }
  /* Inline style objects: style={{ "--x": ... }} */
  for (const m of src.matchAll(/["'](--[a-zA-Z0-9-]+)["']\s*:/g)) {
    defined.add(m[1]);
  }
  /* Template-literal stylesheets: `--x: value;` unquoted, as CSS spells it. */
  for (const m of src.matchAll(/(^|[;{\s])(--[a-zA-Z0-9-]+)\s*:/gm)) {
    defined.add(m[2]);
  }
}

/* WHAT COUNTS AS A DEFECT
 *
 * Not every undefined token is a bug, and getting this wrong would be fatal to
 * the gate: a check that cries wolf is a check the team turns off.
 *
 * `var(--wordmark-ink, currentColor)` and `var(--leaf-ink, var(--ink-2))` are
 * DELIBERATE optional override hooks. globals.css says so in as many words:
 * "A scope with its own accent sets --wordmark-ink." Nobody sets it today, and
 * that is fine — the fallback is a SYSTEM value, so the surface is still being
 * driven by the system whether the hook is used or not.
 *
 * `var(--nc-green, #566036)` is the defect. The fallback is a LITERAL COLOUR,
 * so the call site is a hard-coded hex wearing a token's clothes: it reads like
 * it consumes the system, it renders something the system cannot reach, and no
 * edit to any token file will ever move it.
 *
 * So the rule is about the FALLBACK, not about the token:
 *   undefined token + literal-colour fallback  -> error, this is a hidden hex
 *   undefined token + system-value fallback    -> fine, this is an override hook
 *   undefined token + NO fallback              -> error, this renders nothing
 */
const SYSTEM_VALUE = /^\s*(currentColor|inherit|transparent|initial|unset|var\()/i;

/* Split `var(--x, rest)` at the top-level comma so nested var() survives. */
function fallbackOf(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "(") depth++;
    else if (c === ")") {
      if (depth === 0) return null; /* no comma before close: no fallback */
      depth--;
    } else if (c === "," && depth === 0) {
      let end = i + 1, d = 0;
      while (end < text.length) {
        const e = text[end];
        if (e === "(") d++;
        else if (e === ")") { if (d === 0) break; d--; }
        end++;
      }
      return text.slice(i + 1, end);
    }
  }
  return null;
}

/* Used: every var() reference, with the line it sits on. CSS files and the
   TSX stylesheets alike — a var() in a template literal resolves at runtime
   exactly like one in a .css file, so it is held to exactly the same rule. */
const phantoms = new Map();
for (const file of [...cssFiles, ...tsxFiles]) {
  const lines = stripComments(readFileSync(file, "utf8")).split("\n");
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
      const name = m[1];
      if (defined.has(name)) continue;

      const fb = fallbackOf(line, m.index + m[0].length);
      /* A system-value fallback means this is an intentional override hook,
         not a hidden literal. Leave it alone. */
      if (fb !== null && SYSTEM_VALUE.test(fb)) continue;

      if (!phantoms.has(name)) phantoms.set(name, []);
      const why = fb === null ? "no fallback, renders nothing" : `hidden literal: ${fb.trim()}`;
      phantoms.get(name).push(`${relative(ROOT, file)}:${i + 1}  (${why})`);
    }
  });
}


/* ══ GATE 2: NO INLINE HEX ═══════════════════════════════════════════════════
 *
 * A colour is BORN in the token block and nowhere else. This is the gate the
 * whole of #382 was clearing the way for, and it lands last on purpose: shipped
 * against the 433 raw values this codebase started with it would have been red
 * from the first run, and a check that is always red is a check the team
 * learns to scroll past.
 *
 * Two exemptions, both principled rather than convenient:
 *
 *   Custom property DEFINITIONS (`--x: #hex`). That is the token block doing
 *   its job. Scoped registers count -- `.run.outdoor`, the hybrid runner's
 *   `.outdoor`, the printed sheet -- because a scope that redefines the whole
 *   set is the system, not an escape from it.
 *
 *   Colour stops inside a gradient function. A two-stop gradient is not a
 *   colour, it is a shape made of colour, and `--gradient-celebrate-start` is
 *   a token nothing else would ever consume.
 */
/* A DECLARATION IS NOT A LINE (#392).
 *
 * The first version of this gate split the source on "\n" and then looked for
 * `prop: value` inside each line, so a declaration broken across lines hid its
 * colour from the check completely:
 *
 *     box-shadow:
 *       0 0 0 1px
 *       #ff00ff;
 *
 * That passed. The scan is therefore over the whole source, and the line
 * number is recovered from the match index so every report still points at the
 * right place. `[^;{}]` already matches a newline, so the declaration's own
 * bounds do the work once the artificial line boundary is gone.
 *
 * The camelCase half matters because a JS style object spells the property the
 * way JS spells it. `{ color: "#ff00ff" }` was caught by accident, because
 * `color` happens to be all lower case; `{ backgroundColor: "#ff00ff" }` was
 * not caught at all. Same value, same surface, same defect, and whether the
 * gate saw it came down to the spelling of the property name.
 *
 * TWO GUARDS THE WIDENING NEEDED, both found by running it before trusting it,
 * and both there to stop this gate crying wolf rather than to let anything
 * through:
 *
 *   The value excludes `:` as well as `;{}`. Without it a value ran on past
 *   its own declaration into the next one, so `name:` in app/manifest.ts
 *   reported the hex belonging to `background_color:` eight lines below and
 *   named the wrong property. CSS values do not contain a colon; JS object
 *   properties are separated by commas, and this is what stands in for the
 *   semicolon that is not there.
 *
 *   The property cannot be preceded by a quote. `xmlns="http://www.w3.org/..."`
 *   otherwise reads as a property named `http` whose value runs to whatever
 *   colour appears next on the line, which is how a valid SVG namespace got
 *   reported as an inline hex. */
/* HELD BY A STRONGER CHECK THAN THIS ONE.
 *
 * Exemptions are load-bearing, so each one names what holds the value instead,
 * and "instead" has to mean a machine. The web app manifest is the only colour
 * in the product that genuinely cannot consume a token: it is JSON by the time
 * a browser reads it, so there is no var(--paper) to call. Exempting it and
 * trusting a comment is what produced the defect -- it sat on #f4efe4, the
 * cream retired in #382, painting the iPad splash and the browser chrome with
 * a ground the product had stopped using.
 *
 * It is pinned by tests/unit/design-contrast.spec.ts, which reads --paper out
 * of globals.css and asserts these keys equal it. That is a tighter constraint
 * than this gate could express, not a looser one: this gate only asks whether a
 * colour was born outside the token block, and that test asks whether this
 * particular colour is still the right one. */
const HELD_ELSEWHERE = new Map([
  ["app/manifest.ts:background_color", "pinned to --paper by design-contrast.spec.ts"],
  ["app/manifest.ts:theme_color", "pinned to --paper by design-contrast.spec.ts"],
]);

const hexViolations = [];
for (const file of [...cssFiles, ...tsxFiles]) {
  const src = stripComments(readFileSync(file, "utf8"));
  const lineOf = (idx) => src.slice(0, idx).split("\n").length;

  for (const m of src.matchAll(
    /(?<![-\w"'`])([a-zA-Z_-]+)\s*:\s*([^;{}:]*#[0-9a-fA-F]{3,8})/g
  )) {
    if (m[1].startsWith("--")) continue;          // a definition
    if (/gradient\(/.test(m[2])) continue;        // a stop inside a shape
    if (HELD_ELSEWHERE.has(`${relative(ROOT, file)}:${m[1]}`)) continue;
    hexViolations.push(
      `${relative(ROOT, file)}:${lineOf(m.index)}  ${m[1]}: ${m[2].trim().replace(/\s+/g, " ").slice(0, 48)}`
    );
  }

  /* COLOUR-BEARING JSX ATTRIBUTES.
   *
   * A hex in `fill="#322620"` is not spelled as a declaration, so the scan
   * above cannot see it however carefully it reads. This is not hypothetical:
   * app/welcome/Landing.tsx shipped THREE off-palette colours on the public
   * landing page, in inline SVG, straight through a green run of this gate --
   * a near-black that was not --ink, a peach that was not --berry, and a green
   * that was neither --action nor --living. Green meant "no violation the gate
   * can express", and nobody could tell the difference from the outside.
   *
   * A NAMED LIST of attributes rather than a general rule, for exactly the
   * reason DRAWN_NOT_TYPED is a named list: adding one is a visible, arguable
   * diff, and a gate that guesses at what carries colour starts crying wolf on
   * `d="M248 160"` and gets switched off. */
  if (file.endsWith(".tsx") || file.endsWith(".ts")) {
    for (const m of src.matchAll(
      /\b(fill|stroke|color|stopColor|stop-color|floodColor|flood-color|lightingColor|lighting-color|bgcolor)\s*=\s*[{"'`\s]*(#[0-9a-fA-F]{3,8})/g
    )) {
      hexViolations.push(
        `${relative(ROOT, file)}:${lineOf(m.index)}  ${m[1]}="${m[2]}"  (JSX attribute)`
      );
    }
  }
}

/* ══ GATE 3: EVERY FONT-SIZE COMES FROM THE SCALE ════════════════════════════
 *
 * Six steps at a constant 1.2, floor 0.833rem. 109 distinct sizes is what the
 * absence of this check looks like after a year.
 *
 * Allowed without argument: any `var()` (the value is under the system's
 * control and gate 1 already proved it resolves), any `clamp()` (fluid display
 * type is a size that answers to the viewport, not a step), `inherit`, `pt`
 * (the print medium has its own units), and `em` (sized by its parent).
 *
 * ALLOWED BY NAME: the list below. Each entry is a font-size that is a DRAWING
 * DIMENSION rather than a type step -- a glyph whose size answers to a box or a
 * mark beside it, not to the scale the sentences use. The test is mechanical,
 * not a matter of taste: the rule's own geometry depends on the number. Each
 * one carries its reasoning in the stylesheet at its definition.
 *
 * Adding to this list is a visible, arguable diff. That is the point. An
 * exception with a reason in the file is fine; an exception because the sweep
 * was hard is not.
 */
const DRAWN_NOT_TYPED = new Map([
  [".temp", "the weather figure, sized to the sky mark at the prototype's ratio (#355)"],
  [".degScale", "the scale letter travelling with that same figure (#355)"],
  [".moment-grouped .quote-glyph", "hanging punctuation, tuned to the plate it hangs off"],
  [".speak-plate .speak-quote", "hanging punctuation, tuned to the plate it hangs off"],
  [".entry-mark", "a numeral centred in a 1.55rem circle at half its size"],
  [".sighting-mark", "a glyph centred in a 72px circle at roughly half its size"],
  [".plan-route-number", "a numeral centred in a 1.4rem ring at half its size"],
  [".previewMenu li > span", "a menu glyph centred in a 32px cell on the landing's miniature"],
  [".questionIllustration", "a question mark centred in a 76 by 64px plate, sized to the plate"],
]);

const sizeViolations = [];
for (const file of [...cssFiles, ...tsxFiles]) {
  const src = stripComments(readFileSync(file, "utf8"));
  /* Walk rules so a violation can be reported against its selector, which is
     stable, rather than a line number, which moves on every edit above it. */
  for (const m of src.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().split("\n").pop().trim();
    for (const d of m[2].matchAll(/font-size:\s*([^;]+);/g)) {
      const value = d[1].trim();
      if (/^var\(|clamp\(|^inherit$/.test(value)) continue;
      if (/[\d.]+(pt|em)\b/.test(value) && !/[\d.]+rem\b/.test(value)) continue;
      if (DRAWN_NOT_TYPED.has(selector)) continue;
      const line = src.slice(0, m.index).split("\n").length;
      sizeViolations.push(
        `${relative(ROOT, file)}:~${line}  ${selector} { font-size: ${value} }`
      );
    }
  }
}

function reportGate(title, rows, help) {
  if (rows.length === 0) return false;
  console.error(`\ntoken-lint: ${title}\n`);
  console.error(help + "\n");
  for (const r of rows) console.error(`  ${r}`);
  console.error(`\n${rows.length} violation${rows.length === 1 ? "" : "s"}.\n`);
  return true;
}

let failed = false;
failed = reportGate(
  "inline hex — a colour born outside the token block.",
  hexViolations,
  "Define it as a token and reference it. Definitions (--x: #hex) and colour\n" +
    "stops inside gradient() are exempt; nothing else is."
) || failed;
failed = reportGate(
  "off-scale font-size.",
  sizeViolations,
  "Use one of --size-1..6, or a clamp() if the size genuinely answers to the\n" +
    "viewport. If it is a drawn mark rather than type, add it to DRAWN_NOT_TYPED\n" +
    "in this script WITH its reason, and put that reason in the stylesheet too."
) || failed;

// ── outdoor parity (#442) ───────────────────────────────────────────────────
//
// A colour token defined at :root and NOT redefined for outdoor renders its
// LIGHT value on the dark ground. That has now shipped three times, each time
// found from a screenshot rather than by us: the spoken plate at 1.10:1
// (#442), the teacher note at 2.81:1 (#452), and the species safety band at
// 2.33:1 plus every accented control at 3.33:1 (both caught while writing
// this check). Every one was invisible to the existing gates, because a token
// with no outdoor value resolves perfectly well — to the wrong colour.
//
// So: every :root token in a colour family must have an outdoor value, or be
// listed below with the reason it does not need one. The exemptions are for
// surfaces already dark, or that never render outdoors at all; a surface that
// simply has not been checked does not belong here.
const OUTDOOR_EXEMPT = new Map([
  ["--grounded", "the photo viewer's ground, already near-black in both modes"],
  ["--caption", "the photo viewer's light text, sits on --grounded, dark in both modes"],
  ["--card-ink", "print only (.print-card); the child sheet is paper, never a field"],
]);
const COLOUR_FAMILIES = /^--(ink|paper|hairline|plate|card|action|tone|grounded|caption)/;
const NAMED_COLOURS = new Set(["--umber", "--slate", "--amber", "--leaf", "--sky", "--berry"]);

function declarationsIn(src, startIndex) {
  const end = src.indexOf("\n}", startIndex);
  const body = src.slice(startIndex, end === -1 ? undefined : end);
  return new Set([...body.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
}

{
  const globals = stripComments(readFileSync(join(ROOT, "app/globals.css"), "utf8"));
  const rootAt = globals.indexOf(":root {");
  const outdoorAt = globals.indexOf(".run.outdoor,");
  if (rootAt === -1 || outdoorAt === -1) {
    console.error("token-lint: cannot find :root or the shared outdoor register in globals.css");
    process.exit(1);
  }
  const rootTokens = declarationsIn(globals, rootAt);
  const outdoorTokens = declarationsIn(globals, outdoorAt);

  const gaps = [...rootTokens].filter(
    (t) =>
      (COLOUR_FAMILIES.test(t) || NAMED_COLOURS.has(t)) &&
      !outdoorTokens.has(t) &&
      !OUTDOOR_EXEMPT.has(t)
  );
  const staleExemptions = [...OUTDOOR_EXEMPT.keys()].filter((t) => !rootTokens.has(t));

  if (gaps.length > 0 || staleExemptions.length > 0) {
    console.error("\ntoken-lint: outdoor parity.\n");
    for (const token of gaps) {
      console.error(
        `  ${token} has no outdoor value. On #1d2213 it renders its LIGHT value,\n` +
          `      which is how three unreadable surfaces shipped. Add it to the outdoor\n` +
          `      register in app/globals.css, or add it to OUTDOOR_EXEMPT with the reason.`
      );
    }
    for (const token of staleExemptions) {
      console.error(`  ${token} is exempted but no longer defined at :root — drop the exemption.`);
    }
    console.error("");
    process.exit(1);
  }
}

if (failed && phantoms.size === 0) process.exit(1);

if (phantoms.size === 0) {
  console.log(
    `token-lint: ok — ${defined.size} tokens defined, every var() reference resolves;\n` +
      `            no inline hex outside the token block; every font-size on the scale.`
  );
  process.exit(0);
}

let total = 0;
console.error("\ntoken-lint: phantom tokens — var() references that resolve to nothing.\n");
console.error(
  "Each of these silently renders its fallback, so the surface is running a\n" +
    "colour no token controls. Define the token, or point the call site at one\n" +
    "that already exists. Do not delete the fallback and leave the var().\n"
);
for (const [name, sites] of [...phantoms].sort((a, b) => b[1].length - a[1].length)) {
  total += sites.length;
  console.error(`  ${name}  — ${sites.length} call site${sites.length === 1 ? "" : "s"}`);
  for (const site of sites) console.error(`      ${site}`);
}
console.error(
  `\n${total} phantom reference${total === 1 ? "" : "s"} across ${phantoms.size} undefined token${
    phantoms.size === 1 ? "" : "s"
  }.\n`
);
process.exit(1);

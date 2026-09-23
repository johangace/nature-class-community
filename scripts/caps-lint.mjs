#!/usr/bin/env node
/**
 * Caps lint: nothing in this product is ever set in all caps — that is
 * Johan's standing product rule (sentence case everywhere: folio lines,
 * phase names, buttons, captions, the lot), not a style preference. The
 * cheapest way all-caps sneaks back into a codebase is one CSS declaration,
 * so this script scans the source that styles or renders the UI (app/,
 * engine/, lib/) for `text-transform: uppercase` in any spacing and fails
 * CI when it finds one. Label STRINGS are reviewed by humans; the CSS
 * escape hatch is what a machine can hold shut.
 *
 * SCOPE: HOUSE COPY AND HOUSE CODE ONLY.
 *
 * It reads `app/`, `engine/` and `lib/` — code agents wrote — and, since #188,
 * the pack CONTENT in `packs/`, under the founder guard.
 *
 * "Never all-caps" governs what WE write. It does not govern Johan's
 * curriculum. His emphasis is his: `understand WHY flowers matter` and
 * `Biodiversity means LOTS of different living things` are how he tells a
 * five-year-old which word carries the weight. The spring port lowercased
 * both, because nobody had written down that this rule stops at his
 * sentences (#140).
 *
 * So the boundary is enforced rather than remembered. `declareScope()` below
 * refuses to let this script read `packs/` unless it declares
 * `guardsFounderText: true` and runs every finding through `guard()`, which
 * drops the founder's strings by provenance rather than by anyone remembering
 * to be careful. Nine of his sentences are dropped there on every run and the
 * scope line says so.
 *
 * WHY THE PACK SCAN EXISTS (#188)
 *
 * The all-caps rule had two holes. `lib/outside/data/phenology/*.json` is held
 * by `tests/unit/phenology-register.spec.ts`, which now covers every region.
 * Nothing at all held the packs: five house-written pack strings were shouting
 * — `You can SEE yourself being alive`, `What eats THAT animal?` — and no
 * check could see them, because the only script that reads packs
 * (`register-lint.mjs`) asserts nothing and the only one with a caps opinion
 * refused to read content. That is the hole this closes.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { declareScope, HOUSE } from "./authorship.mjs";
import { CHILD, termsFor } from "./lib/acronyms.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const CODE_DIRS = ["app", "engine", "lib"];
const CONTENT_DIRS = ["packs"];
const SCAN_DIRS = [...CODE_DIRS, ...CONTENT_DIRS];
const EXTENSIONS = new Set([".ts", ".tsx", ".css", ".mjs", ".js", ".jsx"]);

const scope = declareScope({
  script: "scripts/caps-lint.mjs",
  reads: SCAN_DIRS,
  governs: HOUSE,
  guardsFounderText: true,
});

/**
 * A shouted word in content: two or more capitals in a row, allowing an
 * internal hyphen or apostrophe so `NON-STOP` and `DON'T` are one word rather
 * than two findings.
 */
const SHOUT_RE = /\b[A-Z][A-Z'-]*[A-Z]\b/g;

/**
 * Real acronyms. Not shouting — that is how the word is spelled.
 *
 * This used to be a second copy of the list in
 * `tests/unit/phenology-register.spec.ts` with a comment on each saying it was
 * kept in step with the other. #599 replaced the convention with a shared
 * source: both read `scripts/lib/acronyms.mjs`, so they cannot drift, and a
 * drifted pair is worse than either half because both look authoritative.
 *
 * WHICH READER PACKS ARE JUDGED FOR. That table is keyed by audience rather
 * than by field, because a pack has no `childFriendlyNote` — it has session
 * blocks a teacher reads out to a class. So the reader here is the CHILD, and
 * this script asks for the terms a child can read. It is the stricter half of
 * the table: everything allowed for a child is allowed for a teacher too, and
 * the two terms that differ ("PNW", "US") occur nowhere in `packs/`, so this
 * forbids nothing that is written today. If a pack ever needs one of them, the
 * answer is the sentence, not the list — a five-year-old is being read to.
 */
const ACRONYMS = termsFor(CHILD);

// Matches `text-transform: uppercase` and `text-transform:uppercase`,
// including camelCase inline-style spellings (textTransform: "uppercase").
const UPPERCASE_RE = /text-?transform['"]?\s*:\s*['"]?uppercase/i;

function* walkFiles(dir, keep) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walkFiles(full, keep);
    } else if (keep(entry)) {
      yield full;
    }
  }
}

const isCode = (name) => [...EXTENSIONS].some((ext) => name.endsWith(ext));
const isJson = (name) => name.endsWith(".json");

const findings = [];
let filesScanned = 0;

for (const dir of CODE_DIRS) {
  for (const file of walkFiles(join(root, dir), isCode)) {
    filesScanned += 1;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      if (UPPERCASE_RE.test(line)) {
        findings.push({ file: relative(root, file), line: i + 1, text: line.trim() });
      }
    });
  }
}

// ---------------------------------------------------------------------------
// The content scan: shouted words in the packs (#188)
// ---------------------------------------------------------------------------

/** Every string in a JSON tree, with the path that locates it. */
function* jsonStrings(node, path = "") {
  if (typeof node === "string") {
    yield { path, text: node };
  } else if (Array.isArray(node)) {
    for (const [i, n] of node.entries()) yield* jsonStrings(n, `${path}[${i}]`);
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      // A country code is data the resolver reads, not a word a child hears
      // (validity.requiresCountry, 2026-09-08). ISO codes are upper case by
      // definition, so they are skipped rather than added to ACRONYMS.
      if (k === "requiresCountry") continue;
      yield* jsonStrings(v, `${path}.${k}`);
    }
  }
}

const shouts = [];

for (const dir of CONTENT_DIRS) {
  for (const file of walkFiles(join(root, dir), isJson)) {
    filesScanned += 1;
    for (const { path, text } of jsonStrings(JSON.parse(readFileSync(file, "utf8")))) {
      const words = [...new Set(text.match(SHOUT_RE) ?? [])].filter((w) => !ACRONYMS.has(w));
      if (words.length === 0) continue;
      // `text` is the key `guard()` reads: findings the founder authored are
      // dropped here, by provenance, before anything is reported.
      shouts.push({ file: relative(root, file), path, words, text });
    }
  }
}

const ours = scope.guard(shouts);

if (findings.length > 0 || ours.length > 0) {
  if (findings.length > 0) {
    console.error(`Caps lint FAILED. ${findings.length} all-caps transform(s) found:`);
    for (const f of findings) {
      console.error(`  - ${f.file}:${f.line}  ${f.text.slice(0, 100)}`);
    }
    console.error("Nothing in this product is set in all caps. Use sentence case (letter-spacing carries the small-caption voice).");
  }
  if (ours.length > 0) {
    console.error(`Caps lint FAILED. ${ours.length} shouted word(s) in house-written pack copy:`);
    for (const s of ours) {
      console.error(`  - ${s.file}${s.path}  [${s.words.join(", ")}]`);
      console.error(`      ${JSON.stringify(s.text.slice(0, 140))}`);
    }
    console.error("The register rule is never all-caps (#188). Lower-case the word; if the");
    console.error("sentence goes limp without it, move the emphasis into the words instead.");
    console.error("If the word is a real acronym a child can read, add it to ACRONYMS in");
    console.error("scripts/lib/acronyms.mjs with the reason and the readers it is legible to.");
  }
  process.exit(1);
}

console.log(
  `Caps lint passed: ${filesScanned} file(s) scanned, no all-caps transforms and no shouted ` +
    `pack copy; ${scope.scopeLine()}.`
);

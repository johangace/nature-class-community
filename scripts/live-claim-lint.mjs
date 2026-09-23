#!/usr/bin/env node
/**
 * Live-claim lint: a surface that says "live" may not be reading a literal.
 *
 * WHY THIS EXISTS
 *
 * `app/start/LiveOutside.tsx` rendered this, under the eyebrow
 * `outside now · {class} · live` (nc#855):
 *
 *     const headline =
 *       data.conditions.line ??
 *       "Look at the sky together before you set off. …";
 *
 * (Trimmed there deliberately. The whole sentence is in the packs, which is the
 * point of rule 1; a header carrying it would be one more copy of the thing
 * this file exists to stop, even in a comment nothing renders.)
 *
 * Two separate faults sat in those three lines, and each one is a rule below.
 *
 *   1. THE SENTENCE WAS NOT THE COMPONENT'S. It is the `fallbackText` of a
 *      `conditions-line` block, present byte for byte in seven shipped packs
 *      and in the compiled offline core — curriculum, authored once, owned by
 *      the packs. A component had taken a private copy of it, so editing the
 *      curriculum and editing `/start` had quietly become two different jobs
 *      that could disagree and never go red. `verbatim-fidelity.mjs` compares
 *      the source rows against the packs and does not look at `app/` at all,
 *      so nothing in the build could see the fork.
 *
 *   2. `conditions.line` IS NULL WHEN THERE WAS NO READ, and null is the
 *      answer, not a gap. `lib/conditions.ts` is explicit about it — "Anything
 *      thin, stale, low-confidence, slow, or unreachable resolves to null…We
 *      never invent weather." A caller that coalesces that null into a
 *      plausible sentence has undone the one decision the grounding layer
 *      exists to make, and it did so under a label promising the opposite.
 *
 * The component is gone (deleted with the location step's rebuild, PR #933),
 * which fixes the site and not the shape. Nothing in the build stopped it being
 * written and nothing would stop the next one, on the next live surface, with
 * the next pack's line. `DailyCard` and `TodayDay` get this right today by
 * their authors' care; care is not a mechanism.
 *
 * WHAT IT ASSERTS
 *
 *   RULE 1  No `conditions-line` sentence authored in `packs/` may appear as
 *           text anywhere under app/, engine/ or lib/. Byte for byte, the
 *           fidelity guard's test. The pack is where that sentence lives; code
 *           reads it from the block it is on. It looks only for lines long
 *           enough that finding one is evidence of a copy — see
 *           `DISTINCTIVE_MIN_CHARS`, and the note the run prints for any pack
 *           line below it.
 *
 *   RULE 2  No conditions read may be coalesced into a string literal —
 *           `conditions.line ?? "…"`, `conditions?.line || \`…\``. This is the
 *           mechanism rather than the string, so it bites on a NEW sentence
 *           nobody has authored anywhere, which rule 1 by construction cannot
 *           see.
 *
 *   RULE 3  In a file that renders a live claim — an eyebrow ending `· live`,
 *           or the live dot — no `??`/`||` may fall back to a SENTENCE literal
 *           at all, whatever is on its left. Under that label the honest
 *           answers are the reading or the absence of one, and a default
 *           sentence is neither.
 *
 * Rule 3 deliberately does NOT ban a sentence a live surface renders outright.
 * `DailyCard`'s "We could not see outside today, so there is nothing new to
 * report." is house copy that says the read failed; it is the honest answer and
 * it must stay legal. What is banned is a sentence standing IN for a reading.
 *
 * SCOPE: HOUSE code in app/, engine/ and lib/ — the components, and nothing
 * else. It loads the packs' conditions lines the way `scripts/authorship.mjs`
 * loads `fixtures/source-rows/`: as a reference corpus it holds no opinion
 * about. A pack line is never a finding here. A component carrying one is, and
 * the remedy is always to delete the copy in the code, never to touch his
 * sentence. See `scripts/authorship.mjs` for why every check here says so.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { declareScope, HOUSE } from "./authorship.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Where components live. These are the roots scanned for violations. */
const CODE_ROOTS = ["app", "engine", "lib"];

/** Where the authored conditions lines live. Read, never judged. */
const PACK_DIR = join(ROOT, "packs");
const OFFLINE_CORE = join(ROOT, "public", "offline", "core-v1.json");

const scope = declareScope({
  script: "scripts/live-claim-lint.mjs",
  reads: CODE_ROOTS,
  governs: HOUSE,
});

// ---------------------------------------------------------------------------
// The corpus: every conditions-line sentence the packs author
// ---------------------------------------------------------------------------

/**
 * Every string a `conditions-line` block renders — its `fallbackText` and each
 * of its ability variants, since a variant is the same sentence for a
 * different reading level and copying one into a component is the same fork.
 *
 * Walked structurally rather than grepped for `"fallbackText"`, so a line
 * inside a phase's `conditionVariants` counts too.
 */
export function authoredConditionsLines() {
  const lines = new Map(); // sentence -> Set of files it is authored in

  const record = (text, file) => {
    if (typeof text !== "string" || text.trim() === "") return;
    if (!lines.has(text)) lines.set(text, new Set());
    lines.get(text).add(file);
  };

  const walk = (node, file) => {
    if (Array.isArray(node)) return node.forEach((child) => walk(child, file));
    if (!node || typeof node !== "object") return;
    if (node.type === "conditions-line") {
      record(node.fallbackText, file);
      for (const variant of Object.values(node.abilityVariants ?? {})) {
        record(variant, file);
      }
    }
    Object.values(node).forEach((child) => walk(child, file));
  };

  const sources = readdirSync(PACK_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => join(PACK_DIR, name));
  // The compiled offline core carries the same sentences. It is included so a
  // pack deleted from packs/ but still shipped offline stays covered.
  if (existsSync(OFFLINE_CORE)) sources.push(OFFLINE_CORE);

  for (const path of sources) {
    walk(JSON.parse(readFileSync(path, "utf8")), relative(ROOT, path));
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Rule 1's floor: how much text has to match before a match means anything
// ---------------------------------------------------------------------------

/**
 * Rule 1 finds a pack's sentence as a SUBSTRING of a file's code, and a
 * substring match is evidence of a copy only while the sentence is long enough
 * that coincidence is not the likelier reading of it.
 *
 * Nothing upstream supplies that length. `schema/pack.ts` accepts
 * `fallbackText: z.string().min(1)`, so a pack may author the conditions line
 * `"the sky"` — seven characters that already stand, on this tree, in three
 * files nobody forked anything into: `app/field/print/FieldPrint.tsx`,
 * `lib/offline/readiness.ts` and `lib/outside/place.ts`. Those three findings
 * would be aimed at a curriculum author who has never opened any of them, over
 * a line they were entitled to write, and the reasonable response to that is to
 * stop believing the check. A guard nobody believes is a guard that gets
 * deleted, which is how the thing it was protecting comes back (nc#994).
 *
 * The floor is about DISTINCTIVENESS, and that is why neither of the two
 * narrower matching rules is used instead:
 *
 *   - WORD BOUNDARIES leave the reported case exactly where it was. All three
 *     `"the sky"` matches are already whole words sitting in ordinary prose.
 *
 *   - A WHOLE-SENTENCE match clears those three and not the class behind them.
 *     `"It is raining."` is a conditions line somebody will plausibly write,
 *     and it already stands as a complete sentence in `lib/ai/conditions-line.ts`;
 *     `"How did it feel?"` stands complete in two more files. Both rules ask
 *     WHERE the text sits. The defect is HOW MUCH TEXT THERE IS: below a
 *     certain length two identical runs of English are not related, and no
 *     amount of positional care can tell a copy from a coincidence when the
 *     bytes are the same and there are only seven of them.
 *
 * Rule 3's sentence floor is the same number today for the same underlying
 * reason — below this, a run of English is a fragment and not prose. They are
 * kept as two constants because they answer different questions (is this pack
 * line distinctive? is this literal a standing sentence?) and must be free to
 * move apart without one silently dragging the other with it.
 *
 * What the floor costs is recorded rather than hidden: a short pack line
 * genuinely copied into a component is not caught here, `main()` says so by
 * name on every run, and `guard-mutation-check.mjs` pins it as a blind spot.
 */
export const DISTINCTIVE_MIN_CHARS = 25;

/** Is this authored line long enough that finding it under app/ means something? */
export function isDistinctive(sentence) {
  return sentence.length >= DISTINCTIVE_MIN_CHARS;
}

/**
 * The harvest split by the floor: what rule 1 enforces, and what it has to let
 * past. The corpus itself stays whole — the exempt half is reported, not
 * dropped, because a pack author only learns why their line is unenforced if
 * something tells them.
 */
export function partitionByFloor(authored) {
  const enforced = new Map();
  const exempt = new Map();
  for (const [sentence, sources] of authored) {
    (isDistinctive(sentence) ? enforced : exempt).set(sentence, sources);
  }
  return { enforced, exempt };
}

// ---------------------------------------------------------------------------
// The code under scan
// ---------------------------------------------------------------------------

export function sourceFiles() {
  const found = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        visit(path);
        continue;
      }
      if (/\.(ts|tsx|mts|mjs|js|jsx)$/.test(entry)) found.push(path);
    }
  };
  for (const root of CODE_ROOTS) {
    const path = join(ROOT, root);
    if (existsSync(path)) visit(path);
  }
  return found;
}

/**
 * Comments out, everything else byte-for-byte in place.
 *
 * Every rule below is about what a file DOES. This one's own header quotes the
 * offending sentence and shows the offending expression, and a check that read
 * prose would go red on the file explaining it — and, worse, could be silenced
 * by moving a violation into a comment. Newlines are preserved so the reported
 * line numbers are the file's real ones.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (match, lead) =>
      lead + " ".repeat(match.length - lead.length)
    );
}

function lineNumberOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

// ---------------------------------------------------------------------------
// Rule 3's precondition: does this file render a live claim?
// ---------------------------------------------------------------------------

/**
 * A live claim is a promise about THIS MOMENT made in the chrome around a
 * value: the eyebrow that ends `· live`, or the drawn dot that says the same
 * thing without words. Both are matched on what the file renders, not on the
 * word "live" anywhere in it — `let live = true` and "Open the live guide" are
 * not claims about the weather.
 */
const LIVE_CLAIM_MARKS = [
  { pattern: /·\s*live\b/i, what: 'an eyebrow ending "· live"' },
  { pattern: /\blive[-_]?dot\b/i, what: "the live dot" },
];

function liveClaimIn(code) {
  return LIVE_CLAIM_MARKS.filter(({ pattern }) => pattern.test(code));
}

// ---------------------------------------------------------------------------
// The rules
// ---------------------------------------------------------------------------

/**
 * RULE 2. A conditions read coalesced into a string literal.
 *
 * The left side has to NAME a conditions read, so this is about the one value
 * whose null is a deliberate silence. `label ?? "the position we have"` in the
 * location step is a different kind of default and is none of this check's
 * business.
 */
const READ_COALESCED = /\bconditions\s*\??\.\s*line\s*(\?\?|\|\|)\s*(["'`])/g;

/**
 * A literal is what this rule can see. `conditions.line ?? SOME_CONSTANT` is
 * the same defect wearing a name, and it is caught by rule 1 whenever that
 * constant holds a pack's sentence — which is the form the defect has actually
 * taken. A constant holding a NEW invented sentence would pass both, and that
 * gap is recorded here rather than papered over: the honest fix for it is a
 * type carrying provenance, not a wider regex.
 */

/**
 * RULE 3. Any coalesce into a sentence, inside a file that claims live.
 *
 * A sentence is prose: at least 25 characters, containing a space, ending in
 * terminal punctuation. Short defaults ("the position we have", "outside now")
 * are labels, not readings, and are left alone.
 */
const ANY_COALESCE = /(\?\?|\|\|)\s*(["'`])((?:\\.|(?!\2)[^\\])*)\2/g;

function isSentence(literal) {
  const text = literal.trim();
  // A template with a hole in it is composed from something, so it is not a
  // standing sentence and this rule has no view on it.
  if (text.includes("${")) return false;
  return text.length >= 25 && /\s/.test(text) && /[.!?]$/.test(text);
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

/**
 * Every violation in one file's source. Pure: it takes the text rather than
 * reading it, so `tests/unit/live-claim-lint.spec.ts` can hold nc#855's own
 * three lines against it without planting a file in the tree.
 *
 * Each finding names its rule, so a test can assert WHICH one bit rather than
 * only that something did.
 */
export function scanSource(file, source, authored) {
  const code = stripComments(source);
  const findings = [];

  // ── RULE 1 ───────────────────────────────────────────────────────────────
  for (const [sentence, sources] of authored) {
    // Too short to be evidence of anything. See DISTINCTIVE_MIN_CHARS (nc#994).
    if (!isDistinctive(sentence)) continue;
    const at = code.indexOf(sentence);
    if (at === -1) continue;
    findings.push({
      rule: "pack-line-copied",
      file,
      line: lineNumberOf(code, at),
      message:
        `${file}:${lineNumberOf(code, at)} carries a pack's conditions line ` +
        `verbatim:\n      ${JSON.stringify(sentence)}\n` +
        `      It is authored in ${[...sources].join(", ")}. Read it off the ` +
        `block instead of keeping a copy here — a copy is a second place the ` +
        `curriculum has to be edited, and nothing goes red when only one of ` +
        `the two changes.\n` +
        `      (This rule reaches conditions lines of ${DISTINCTIVE_MIN_CHARS} ` +
        `characters or more. A shorter line turns up in ordinary prose, so ` +
        `matching it would name files nobody copied anything into.)`,
    });
  }

  // ── RULE 2 ───────────────────────────────────────────────────────────────
  for (const match of code.matchAll(READ_COALESCED)) {
    findings.push({
      rule: "null-read-coalesced",
      file,
      line: lineNumberOf(code, match.index),
      message:
        `${file}:${lineNumberOf(code, match.index)} fills a null conditions ` +
        `read with a literal (\`${match[0].replace(/\s+/g, " ").trim()}…\`).\n` +
        `      \`conditions.line\` is null exactly when there was nothing true ` +
        `to say (lib/conditions.ts). Render the absence — omit the line, or say ` +
        `the read failed — rather than a sentence standing in for a reading.`,
    });
  }

  // ── RULE 3 ───────────────────────────────────────────────────────────────
  const marks = liveClaimIn(code);
  if (marks.length === 0) return findings;
  for (const match of code.matchAll(ANY_COALESCE)) {
    if (!isSentence(match[3])) continue;
    findings.push({
      rule: "live-label-over-a-default-sentence",
      file,
      line: lineNumberOf(code, match.index),
      message:
        `${file}:${lineNumberOf(code, match.index)} claims live (${marks
          .map((m) => m.what)
          .join(", ")}) and falls back to a sentence:\n      ${JSON.stringify(
          match[3]
        )}\n      Under a live label the only honest answers are the reading ` +
        `and the absence of one. A default sentence is neither, and it is ` +
        `indistinguishable on screen from a real read.`,
    });
  }
  return findings;
}

/** Does this file's source make a live claim at all? Rule 3's precondition. */
export function claimsLive(source) {
  return liveClaimIn(stripComments(source)).length > 0;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

function main() {
  const authored = authoredConditionsLines();

  if (authored.size === 0) {
    console.error(
      "Live-claim lint FAILED: harvested no conditions-line sentences from " +
        "packs/. Rule 1 would then forbid nothing while reporting green, which " +
        "is the shape nc#554 taught this repo to distrust."
    );
    process.exit(1);
  }

  const { enforced, exempt } = partitionByFloor(authored);

  // Said out loud, on a passing run as much as a failing one. A pack author
  // whose line is below the floor has to be able to learn that from the check
  // rather than from a silence they cannot see (nc#994).
  if (exempt.size > 0) {
    console.log(
      `Live-claim lint NOTE: ${exempt.size} conditions line(s) authored in packs/ are ` +
        `shorter than ${DISTINCTIVE_MIN_CHARS} characters, so rule 1 does not look for ` +
        `them under ${CODE_ROOTS.join(", ")}:`
    );
    for (const [sentence, sources] of exempt) {
      console.log(
        `  - ${JSON.stringify(sentence)} (${sentence.length} chars), authored in ` +
          `${[...sources].join(", ")}`
      );
    }
    console.log(
      "  A line that short turns up in ordinary prose. Finding it in a component would not\n" +
        "  be evidence that anybody copied it — it would name files whose authors never read\n" +
        "  the pack — so rule 1 stays quiet rather than send you to them. Rules 2 and 3 are\n" +
        "  unaffected: a short line standing in for a null conditions read is still caught.\n" +
        "  If you want the line enforced, give it enough sentence to be recognisable."
    );
  }

  if (enforced.size === 0) {
    console.error(
      `Live-claim lint FAILED: all ${authored.size} conditions line(s) harvested from packs/ ` +
        `are shorter than the ${DISTINCTIVE_MIN_CHARS}-character floor, so rule 1 has nothing ` +
        "left to forbid while this check would still print green — the same false green as an " +
        "empty harvest, reached from the other side. Lengthen the lines, or move the floor on " +
        "purpose; do not let this one pass quietly."
    );
    process.exit(1);
  }

  const files = sourceFiles();

  if (files.length === 0) {
    console.error(
      `Live-claim lint FAILED: found no source files under ${CODE_ROOTS.join(", ")}. ` +
        "This check refuses to report green off a scan that found nothing to check."
    );
    process.exit(1);
  }

  const failures = [];
  let liveFiles = 0;

  for (const path of files) {
    const rel = relative(ROOT, path);
    const source = readFileSync(path, "utf8");
    if (claimsLive(source)) liveFiles += 1;
    for (const finding of scanSource(rel, source, authored)) {
      failures.push(finding.message);
    }
  }

  if (failures.length > 0) {
    console.error("Live-claim lint FAILED:");
    for (const message of failures) console.error(`  - ${message}`);
    console.error("");
    console.error("A surface labelled live is making a promise about this moment in this");
    console.error("place. The product's whole claim is that it invents no nature, and a");
    console.error("plausible sentence printed under that label is the one failure it");
    console.error("cannot afford — it is indistinguishable, on screen, from a real read.");
    process.exit(1);
  }

  console.log(
    `Live-claim lint passed: ${files.length} file(s) under ${CODE_ROOTS.join(", ")} ` +
      `carry none of the ${enforced.size} enforceable conditions line(s) of the ` +
      `${authored.size} authored in packs/, ` +
      `no conditions read is coalesced into a literal, and the ${liveFiles} file(s) ` +
      `that claim live fall back to no sentence. ${scope.scopeLine()}`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}

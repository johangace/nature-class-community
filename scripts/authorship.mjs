#!/usr/bin/env node
/**
 * Authorship: who wrote the string a check is about to judge.
 *
 * WHY THIS EXISTS
 *
 * This repo carries two kinds of writing and they are not the same thing.
 *
 *   HOUSE   copy an agent wrote — buttons, labels, captions, empty states,
 *           the sentences we put in the product's mouth. Our house voice
 *           governs it: sentence case, no all-caps, no em dashes, say what a
 *           thing is. Those rules exist to restrain US.
 *
 *   FOUNDER the curriculum Johan authored, pulled from the old production
 *           database into `fixtures/source-rows/` and ported into `packs/`.
 *           His words. His punctuation. His emphasis. His typos, if any.
 *
 * Nobody ever wrote down which was which, so the house rules were pointed at
 * the founder's own sentences. The spring port swapped his em dashes for
 * commas and lowercased his emphasis — `understand WHY flowers matter` shipped
 * as `why` (#140). The summer port stripped the leading `If ` off forty-eight
 * of his tips (#130). Before both, a register lint invented a "how many" ban
 * and kept two of his sessions out of the product for months.
 *
 * Every one of those looked like tidying. A style guide written to restrain
 * agents was used to edit the man it was written for.
 *
 * WHAT THIS MODULE ASSERTS
 *
 * A style rule governs house copy and nothing else. That is not advice in a
 * comment; it is the contract of `declareScope()` below, and a check that
 * breaks it throws before it can report a single finding.
 *
 * The founder's strings are identified the same way the fidelity guard
 * identifies them: by being present, byte for byte, in a source row. The
 * information already exists — this module just makes every check consult it.
 *
 * NOT A BAN LIST. There are no words in this file. It cannot forbid anything.
 * It only answers "did Johan write this?" and refuses to let a house rule
 * judge a string where the answer is yes.
 *
 * THE AUDIT: WHOSE WRITING EVERY CHECK GOVERNS
 *
 * Each check states this in its own header too. The table is here because this
 * is the file they all import, so it is the one place that cannot drift out of
 * the build.
 *
 *   scripts/register-lint.mjs   HOUSE copy in packs/, guarded by provenance.
 *                               Its word bans are gone on Johan's ruling and
 *                               are not coming back. What it asserts now (#90)
 *                               is SHAPE, not vocabulary: a make beat, a
 *                               budgeted clock, no generated parent line. Two
 *                               of those three judge pack ASSEMBLY rather than
 *                               anyone's sentences, so the guard drops none of
 *                               them — and the script fails rather than passes
 *                               if it ever does.
 *
 *   scripts/caps-lint.mjs       HOUSE code in app/, engine/, lib/, and since
 *                               #188 the HOUSE copy in packs/ too. It reads
 *                               his sentences to get to ours, so it declares
 *                               guardsFounderText and drops nine of them
 *                               through guard() on every run. Widening it
 *                               onto fixtures/ without that declaration would
 *                               still fail the script — see declareScope().
 *
 *   scripts/case-only-check     NEITHER, and deliberately so. It compares two
 *                               revisions of the same content file and asks
 *                               only whether anything but letter case moved.
 *                               No style opinion, so nothing to scope: it
 *                               protects his strings and ours identically, by
 *                               refusing to let a bulk pass change more than
 *                               it claims (#188).
 *
 *   scripts/verbatim-fidelity   FOUNDER text, and it is the ONLY check that
 *                               may. It holds no opinion of its own: it
 *                               compares his strings against the source rows
 *                               they came from, byte for byte. It does not
 *                               come out.
 *
 *   scripts/mint-node-ids.mjs   NEITHER. It assigns machine handles beside the
 *                               text and reads no prose at all. Every string
 *                               in every pack — his and ours — comes out of it
 *                               byte-identical, which is the property
 *                               scripts/node-id-invisibility.mjs proves rather
 *                               than asserts.
 *
 *   scripts/node-id            NEITHER. It compares two builds of the SAME
 *     -invisibility.mjs        strings against each other and holds no opinion
 *                               about any of them. It is the only check here
 *                               whose subject is a migration rather than a
 *                               tree, which is also why it is run on demand
 *                               rather than in CI: the violation it would need
 *                               planted cannot exist in the tree it reads.
 *
 *   scripts/variant-carry       HOUSE scope declared, because it reads packs/,
 *     -lint.mjs                 but it judges no one's wording: it asks
 *                               whether a listed base teacher-note is present
 *                               byte for byte in each condition variant
 *                               (#1210). Its findings are addresses, not
 *                               sentences, so the guard drops none of them and
 *                               the script fails if it ever does.
 *
 *   scripts/license-audit.mjs   NEITHER. Dependency metadata.
 *   scripts/sw-cache-lint.mjs   NEITHER. Service-worker routing rules.
 *   tsc --noEmit / next build   NEITHER.
 *
 *   scripts/commit-identity     NEITHER, and it is worth saying why it is not
 *     -check.mjs                THIS file despite the name. That check reads
 *                               `%(authorname)` off the commits a pull request
 *                               carries and refuses an automated worker's
 *                               branch that signs the founder's name to them
 *                               (#834). Same word, different provenance: this
 *                               module asks who wrote a STRING, that one asks
 *                               who wrote a COMMIT. It reads no prose at all,
 *                               so it declares no scope and calls nothing here.
 *
 * Adding a check? Say whose writing it touches, in its header, and add it
 * here. If it reads text at all, call declareScope() and let the answer be
 * enforced rather than remembered.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROWS_DIR = join(root, "fixtures", "source-rows");

// ---------------------------------------------------------------------------
// Who wrote it
// ---------------------------------------------------------------------------

/** Copy an agent wrote. The house voice governs this, and only this. */
export const HOUSE = "house";

/** Curriculum Johan authored. No style rule governs this. */
export const FOUNDER = "founder";

/**
 * Repo paths that hold founder-authored writing, or writing derived from it.
 * A check that reads any of these is reading his words whether it meant to or
 * not, and must say so in its scope declaration.
 */
const FOUNDER_TEXT_ROOTS = ["packs", "fixtures"];

// ---------------------------------------------------------------------------
// The founder's strings
// ---------------------------------------------------------------------------

let cached = null;

/**
 * Every string the founder authored, harvested from every source row on disk.
 *
 * Deliberately UNFILTERED: every string in the fixture counts, including short
 * structural values like `"Sight"`. The bias is one-directional on purpose. An
 * over-broad set means a house rule occasionally declines to judge a string
 * that was ours; an under-broad set means a house rule edits the founder. This
 * repo has the second failure three times over and the first not once.
 *
 * Growing automatically is the point. `fixtures/source-rows/spring.json` lands
 * with the spring restoration (#140) and its 694 strings are exempt the moment
 * the file exists, with no edit here.
 */
export function founderStrings() {
  if (cached) return cached;
  cached = new Set();
  if (!existsSync(SOURCE_ROWS_DIR)) return cached;

  const harvest = (node) => {
    if (typeof node === "string") {
      if (node.trim() !== "") cached.add(node);
      return;
    }
    if (Array.isArray(node)) return node.forEach(harvest);
    if (node && typeof node === "object") Object.values(node).forEach(harvest);
  };

  for (const file of readdirSync(SOURCE_ROWS_DIR).filter((f) => f.endsWith(".json"))) {
    harvest(JSON.parse(readFileSync(join(SOURCE_ROWS_DIR, file), "utf8")));
  }
  return cached;
}

/** Did Johan write this exact string? Byte for byte, the fidelity guard's test. */
export function isFounderText(text) {
  return typeof text === "string" && founderStrings().has(text);
}

// ---------------------------------------------------------------------------
// The scope declaration
// ---------------------------------------------------------------------------

const CONTRACT = [
  "  A house style rule governs copy WE wrote. It does not govern the founder's",
  "  curriculum, and pointing one at `packs/` or `fixtures/` points it at his",
  "  sentences: his em dashes, his emphasis, his punctuation, his phrasing.",
  "",
  "  If you are widening a style check onto content, declare",
  "  `guardsFounderText: true` and run every finding through `guard()` before",
  "  you report. Founder-authored strings are dropped there, by provenance,",
  "  not by anyone remembering to be careful.",
  "",
  "  If what you actually want is to assert something about the founder's",
  "  words, a style rule is the wrong tool. Compare them against the source",
  "  rows — that is `scripts/verbatim-fidelity.mjs`, and it is the only check",
  "  in this repo permitted to have an opinion about his text.",
].join("\n");

/**
 * Every check that reads text declares what it governs and what it reads.
 * Returns the guard the declaration obliges it to use.
 *
 * @param {object} decl
 * @param {string} decl.script  this file's name, for error messages
 * @param {string[]} decl.reads repo-relative directories the check scans
 * @param {string} decl.governs HOUSE. There is no other legal value.
 * @param {boolean} [decl.guardsFounderText] required when `reads` touches
 *        `packs/` or `fixtures/`
 */
export function declareScope({ script, reads, governs, guardsFounderText = false }) {
  if (governs !== HOUSE) {
    throw new Error(
      `${script}: a check may only declare \`governs: HOUSE\`.\n\n${CONTRACT}\n`
    );
  }

  const contentRoots = reads.filter((dir) =>
    FOUNDER_TEXT_ROOTS.some((r) => dir === r || dir.startsWith(`${r}/`))
  );

  if (contentRoots.length > 0 && !guardsFounderText) {
    throw new Error(
      `${script}: this check reads ${contentRoots.join(", ")}, which holds the ` +
        `founder's writing, but it has not declared \`guardsFounderText: true\`.` +
        `\n\n${CONTRACT}\n`
    );
  }

  if (guardsFounderText && founderStrings().size === 0) {
    throw new Error(
      `${script}: declares it guards the founder's text, but no source rows ` +
        `were found in fixtures/source-rows/.\n\n` +
        `  With no source rows there is no provenance, so the guard would exempt\n` +
        `  nothing and this check would judge his words while reporting that it\n` +
        `  had protected them. That silent-pass is worse than a red build.\n`
    );
  }

  let guarded = false;
  let skipped = [];

  return {
    /**
     * Drop every finding the founder authored. Findings are `{ text, ... }`.
     * Returns only the findings that are ours to judge.
     */
    guard(findings) {
      guarded = true;
      skipped = findings.filter((f) => isFounderText(f.text));
      return findings.filter((f) => !isFounderText(f.text));
    },

    /** The line the check prints about its own scope. */
    scopeLine() {
      if (guardsFounderText && !guarded) {
        throw new Error(
          `${script}: reads content but reported without calling guard().\n\n` +
            `  Findings must pass through guard() so founder-authored strings are\n` +
            `  dropped by provenance. A check that skips it is judging his words.\n`
        );
      }
      const scope = contentRoots.length > 0 ? "house-written copy in " : "";
      const where = reads.join(", ");
      const held = guardsFounderText
        ? `; ${skipped.length} founder-authored string(s) skipped, not ours to judge`
        : "";
      return `scope: ${scope}${where}${held}`;
    },

    /** What was skipped, for a check that wants to name it. */
    skippedFindings() {
      return skipped;
    },
  };
}

// ---------------------------------------------------------------------------
// Self-check: `node scripts/authorship.mjs`
// ---------------------------------------------------------------------------

/**
 * Run this file directly and it proves its own contract holds, then prints the
 * founder census. Not wired into CI — the two lints that import it exercise it
 * on every push, and a tripwire does not need to fire to be load-bearing. This
 * is here so a reviewer can watch it work in one command.
 */
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const must = (label, fn) => {
    try {
      fn();
    } catch (err) {
      console.log(`  refused: ${label}`);
      console.log(`    ${err.message.split("\n")[0]}`);
      return;
    }
    console.error(`  ALLOWED (it should not have): ${label}`);
    process.exitCode = 1;
  };

  console.log(`Founder strings on record: ${founderStrings().size}`);
  console.log("");
  console.log("The contract:");

  must("a check claiming to govern the founder's text", () =>
    declareScope({ script: "demo", reads: ["app"], governs: FOUNDER })
  );
  must("a style check widened onto packs/ without the guard", () =>
    declareScope({ script: "demo", reads: ["app", "packs"], governs: HOUSE })
  );
  must("a guarded check reporting without calling guard()", () =>
    declareScope({
      script: "demo",
      reads: ["packs"],
      governs: HOUSE,
      guardsFounderText: true,
    }).scopeLine()
  );

  const demo = declareScope({
    script: "demo",
    reads: ["packs"],
    governs: HOUSE,
    guardsFounderText: true,
  });
  // A real sentence of his, rather than the first entry — the set deliberately
  // holds short structural values too ("17", "act"), for the reason given in
  // the founderStrings() note above.
  const sample = [...founderStrings()].find((s) => s.length > 60) ?? "";
  const kept = demo.guard([
    { text: sample, reason: "a rule fired on the founder's sentence" },
    { text: "A sentence an agent wrote.", reason: "a rule fired on ours" },
  ]);
  console.log("");
  console.log(`Guarding two findings: ${kept.length} kept, ${demo.skippedFindings().length} dropped by provenance.`);
  console.log(`  dropped: ${JSON.stringify(sample.slice(0, 72))}`);
  console.log(`  kept:    ${JSON.stringify(kept[0]?.text)}`);
  console.log(`  ${demo.scopeLine()}`);
}

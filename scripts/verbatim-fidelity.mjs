#!/usr/bin/env node
/**
 * Verbatim fidelity: every string Johan authored in the source rows must
 * appear byte-identical in the pack it was ported into.
 *
 * WHY THIS EXISTS
 *
 * Three times now an agent convention has quietly overridden the founder's own
 * words. First a register lint invented a "how many" ban, which kept Counting
 * Life and Minibeast Hunting out of the product for months. Then the summer
 * port stripped the leading `If ` from every situational tip and capitalised
 * the next word — twelve of Johan's lines rewritten to match a convention no
 * one had authored — and dropped each session's driving `prompt` entirely
 * (#130). Then spring turned out to be the same story at four times the scale
 * and with the house style guide added to it: 136 strings rewritten, including
 * every tip prefix, every spoken line's punctuation and line breaks, his
 * emphasis lowercased, his em dashes swapped for commas, and one circle
 * question replaced outright with a different question (#140).
 *
 * Every one was a reasonable-looking local decision. None was anyone's to
 * make. Note the shape of the third: our own copy rules — no em dashes, never
 * all-caps — are OURS. They govern what we write. They do not govern what he
 * wrote, and applying them to his sentences is not tidying, it is editing the
 * author out.
 *
 * A reviewer cannot diff a 17,000-character JSON row against a 60,000-
 * character pack by eye. A machine can, byte for byte, on every push. This
 * script is that machine.
 *
 * WHAT IT ASSERTS
 *
 * For each source row: harvest every authored string (see NON_PROSE_FIELDS
 * for what is skipped and why), then require each one to be present, byte for
 * byte, somewhere in the ported session. Not normalised. Not trimmed. Not
 * case-folded. Present, exactly.
 *
 * Anything else fails, names the exact string, and names the file.
 *
 * IF THIS FAILS, FIX THE PACK.
 *
 * Reaching for the allowlist should feel like the wrong move, because it
 * almost always is. Read the ALLOWED_TRANSFORMS header before you touch it.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROWS_DIR = join(root, "fixtures", "source-rows");

// ---------------------------------------------------------------------------
// What is checked
// ---------------------------------------------------------------------------

/**
 * Source fixture -> shipped pack, and which row maps to which session.
 *
 * SPRING IS NOW CHECKED (#140). It was left out because rows 1-4 had not been
 * pulled, and the note here predicted what a pull would find: the same
 * signature as the damage this script was written for — no leading `If `,
 * next word capitalised, on all 48 tips. That was right, and it was the small
 * half of it. The port had also lowercased Johan's emphasis, replaced his em
 * dashes with commas, dropped every session's driving `prompt`, flattened the
 * line breaks and quote marks out of every spoken line, and — where the
 * register lint's old "how many" ban bit — replaced one of his circle
 * questions with a different question, leaving the teacher note that answered
 * the original ("Let children share their count") sitting under it.
 *
 * The lesson is the one this file already carries, so read it as evidence
 * rather than history: an unchecked port is not a port. Spring shipped on the
 * season shelf for months, in front of teachers, with its teaching depth
 * quietly rewritten, and nobody could see it because nothing compared the two.
 */
const CHECKS = [
  {
    fixture: "fixtures/source-rows/summer.json",
    pack: "packs/summer.json",
    // row id -> session id in the pack
    sessions: {
      17: "summer-w1-counting-life",
      18: "summer-w2-minibeast-hunting",
      19: "summer-w3-a5-leaf-collage",
      20: "summer-w4-our-earths-magnificent-trees",
    },
  },
  {
    fixture: "fixtures/source-rows/spring.json",
    pack: "packs/spring-term.json",
    // row id -> session id in the pack
    sessions: {
      1: "spring-w1-seed-bombs",
      2: "spring-w2-wildflower-investigation",
      3: "spring-w3-natural-paint-making",
      4: "spring-w4-bird-feeders",
    },
  },
];

/**
 * Row fields that hold no authored prose. Skipped before harvesting, each
 * with the reason it is not content. This list is about the SHAPE of the
 * database, not about any particular string being inconvenient — if you are
 * tempted to add a field here to silence a failure on a sentence, that
 * sentence is content and this is the wrong list.
 */
const NON_PROSE_FIELDS = {
  id: "database primary key",
  season_key: "database enum, not shown to anyone",
  week: "an ordinal the pack carries as session order",
  sort_order: "database ordering column",
  is_active: "database flag, replaced by the shelf in lib/pack.ts",
  date_label: "null on every row; the old prototype's fixed-date scheduling",
  audio_url: "null on every row; no session has audio",
  inserted_at: "database timestamp",
  updated_at: "database timestamp",
  label: "the old prototype's UI chrome (\"Say to your class\"), now the say-aloud renderer's own label",
  phase: "the old prototype's UI chrome (\"Engage · Step 1 of 4\"), now composed by the runner from phase order",
  type: "the old prototype's step taxonomy (engage/explore/observe/kinship); the pack keeps the step's own name instead",
  durationHint:
    "a quantity, not prose. Deliberately NOT filled in where the database left it null (#113) — see the Phase.durationMin note in schema/pack.ts",
  duration:
    "a quantity, not prose (\"20 min\"). Carried as session.durationMin and checked numerically below, which is stricter than a string match",
  senses:
    "a controlled vocabulary (\"Sight\", \"Touch\"), not a sentence. Carried as session.namedSkill through SENSE_WORDS below, which is checked",
  referenceImageUrl:
    "a pointer to a third-party asset, not a sentence Johan wrote. Three spring make-steps carry an images.unsplash.com URL with crop parameters. It is skipped here because the pack HAS NOWHERE TO PUT IT — the block union in schema/pack.ts has no image kind — and because a pack may not name a domain we do not control (the rule parentLine already states, and #87 settled for child sheets): a stock URL can 404 or change what it shows, in front of a class, with nobody watching. This is the one thing in the spring port that is genuinely dropped rather than restored, it is recorded here rather than left silent, and nature-class#147 holds the decision about whether reference images become a real block kind on our own storage. Do not read this entry as licence to skip prose: every other field on these rows is checked",
};

/**
 * The senses vocabulary -> the skill line the pack names. The database stores
 * a controlled two-item list; the pack names one skill in the product's own
 * voice. Every source sense must map through this table and land in the
 * shipped `namedSkill`, so the mapping is checked rather than assumed.
 */
const SENSE_WORDS = {
  Sight: "looking",
  Listening: "listening",
  Touch: "touching",
  // Spring names a fourth sense summer never did: three of its four sessions
  // are scented (wildflowers, crushed petals, an orange). Added when spring
  // came under the check (#140) — this table is a derivation, not an override,
  // so growing it is how the skill line stays tied to the source.
  Smell: "smelling",
};

// ---------------------------------------------------------------------------
// The allowlist
// ---------------------------------------------------------------------------

/**
 * TRANSFORMS THAT ARE GENUINELY INTENDED. Every entry is a decision someone
 * made about the founder's text, written down where a reviewer will see it.
 *
 * THE RULES, and they are the point of this file:
 *
 *  1. EXACT MATCH ONLY. `source` and `shipped` are compared with `===`. No
 *     regex, no prefix, no pattern. An entry covers one string and no other.
 *     A rule that generalises is a rule that rewrites text nobody looked at,
 *     which is exactly how twelve tips got rewritten at once.
 *
 *  2. AN ENTRY MUST NAME WHAT SHIPPED. `shipped` is asserted present in the
 *     pack, byte for byte. An entry cannot merely silence a missing string;
 *     it has to say what stands in its place, and be right about it.
 *
 *  3. AN UNUSED ENTRY FAILS THE RUN. If `source` is not a live string in the
 *     fixture, the entry is stale and the build breaks. The list cannot rot
 *     into cover for text that no longer exists.
 *
 *  4. `why` IS REQUIRED and must be a real sentence. An entry without one
 *     fails the run.
 *
 *  5. THE COUNT IS LOCKED. See ENTRY_COUNT_LOCK below. Adding an entry means
 *     changing a number in the same diff, so widening this list is visibly a
 *     decision in review and never an accident.
 *
 * The last escape hatch of this kind (HELD_VERBATIM) was reasonable too, and
 * it still ended up carrying founder text past a bad rule. Assume this one
 * will be misused unless it is hard to.
 */
const ALLOWED_TRANSFORMS = [
  // -- Titles: sentence case ------------------------------------------------
  // Johan's standing product rule is sentence case everywhere; the database
  // stored titles in headline case. This is the one place the product's own
  // typographic rule outranks the source string, it applies to a title and
  // nothing else, and each of the four is written out here rather than
  // derived, so the shipped title is reviewable beside the original.
  {
    field: "title",
    source: "Counting Life",
    shipped: "Counting life",
    why: "Sentence case: Johan's standing product rule, applied to titles only.",
  },
  {
    field: "title",
    source: "Minibeast Hunting",
    shipped: "Minibeast hunting",
    why: "Sentence case: Johan's standing product rule, applied to titles only.",
  },
  {
    field: "title",
    source: "A5 Leaf Collage",
    shipped: "A5 leaf collage",
    why: "Sentence case: Johan's standing product rule, applied to titles only.",
  },
  {
    field: "title",
    source: "Our Earth's Magnificent Trees",
    shipped: "Our Earth's magnificent trees",
    why: "Sentence case: Johan's standing product rule, applied to titles only. \"Earth\" stays capitalised: it is the planet's name, not a headline cap.",
  },

  // -- description -> objective: the "Objective: " label comes off ----------
  // The database packed a field label into the field's own value. The pack
  // has a named `objective` field, so the label is chrome and the sentence
  // starts where Johan's sentence starts. The first letter is capitalised
  // because it is now the start of a sentence rather than the middle of one.
  // Nothing else in the sentence moves.
  {
    field: "description",
    source:
      "Objective: notice everything that is alive around you and begin to work out what it means to be living - breathing, growing, reproducing, dying.",
    shipped:
      "Notice everything that is alive around you and begin to work out what it means to be living - breathing, growing, reproducing, dying.",
    why: "The \"Objective: \" label is the field name, carried as session.objective; the sentence now starts where it starts.",
  },
  {
    field: "description",
    source:
      "Objective: look closely at minibeasts and discover that all creatures have special roles to help our planet stay alive.",
    shipped:
      "Look closely at minibeasts and discover that all creatures have special roles to help our planet stay alive.",
    why: "The \"Objective: \" label is the field name, carried as session.objective; the sentence now starts where it starts.",
  },
  {
    field: "description",
    source:
      "Objective: create art with nature, taking influence from what the children see around them.",
    shipped:
      "Create art with nature, taking influence from what the children see around them.",
    why: "The \"Objective: \" label is the field name, carried as session.objective; the sentence now starts where it starts.",
  },
  {
    field: "description",
    source:
      "Objective: understand why trees matter for our existence (humans) and for the other creatures on our planet.",
    shipped:
      "Understand why trees matter for our existence (humans) and for the other creatures on our planet.",
    why: "The \"Objective: \" label is the field name, carried as session.objective; the sentence now starts where it starts.",
  },

  // -- preparation -> conditionNote: a clause that MOVED, not one rewritten --
  //
  // This is the only entry in this list that shortens one of Johan's own
  // sentences, so read it carefully before treating it as precedent.
  //
  // c86d631 promoted the rained-on consequence out of `preparation` into the
  // new `conditionNote { when: ["wet"], then: ... }`, which is the field the
  // app can actually resolve against today's weather. It did NOT cut the
  // clause from `preparation`, on the reasoning that `prompt` and
  // `preparation` are the founder's own text and are never edited. That
  // reasoning is right in general and was wrong here: part one of Today now
  // renders the hinge and the preparation on ONE SCREEN, so the reader gets
  // the same sentence twice. Johan, pointing at it: "redundant line".
  //
  // So the clause is not being rewritten, reworded or improved. It is being
  // removed from the place it was copied out of, and it still ships verbatim
  // in substance as the hinge the class actually sees. "Nothing to bring."
  // is Johan's, untouched, and it is the whole of what remains.
  //
  // NOT A PATTERN TO GENERALISE. Five other sessions carry a `conditionNote`
  // and keep their `preparation` exactly as authored, because theirs states a
  // weather PREFERENCE and a wrong-day fallback ("Best on a day with some
  // breeze. If calm, ...") rather than the same consequence the hinge states.
  // Nothing was moved out of those, so nothing is cut from them.
  {
    field: "preparation",
    source:
      "Nothing to bring. If it has rained, bark is darker and smells stronger: even better.",
    shipped: "Nothing to bring.",
    why: "The rained-on clause was MOVED into conditionNote by c86d631 and left behind here, so Today printed it twice on one screen. Removing the copy, not editing the sentence; the clause still ships as the hinge.",
  },
];

/**
 * The lock. This number must equal ALLOWED_TRANSFORMS.length.
 *
 * It is not a convenience — it is the mechanism. Widening the allowlist means
 * editing this line too, in the same commit, where a reviewer reads it. If you
 * are changing this number, you are changing the founder's words, and someone
 * other than you should agree.
 */
const ENTRY_COUNT_LOCK = 9;

// ---------------------------------------------------------------------------
// Harvest
// ---------------------------------------------------------------------------

/** Every authored string in a source row, with the path it came from. */
function harvestSource(node, path, out) {
  if (typeof node === "string") {
    if (node.trim() !== "") out.push({ path, text: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => harvestSource(v, `${path}[${i}]`, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key in NON_PROSE_FIELDS) continue;
    harvestSource(value, `${path}.${key}`, out);
  }
}

/** Every string anywhere in the shipped session, as a set for exact lookup. */
function shippedStrings(node, out = new Set()) {
  if (typeof node === "string") {
    out.add(node);
    return out;
  }
  if (Array.isArray(node)) {
    node.forEach((v) => shippedStrings(v, out));
    return out;
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) shippedStrings(value, out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const failures = [];
const fail = (file, headline, detail) => failures.push({ file, headline, detail });

// -- The allowlist checks itself first --------------------------------------

if (ALLOWED_TRANSFORMS.length !== ENTRY_COUNT_LOCK) {
  fail(
    "scripts/verbatim-fidelity.mjs",
    `The allowlist has ${ALLOWED_TRANSFORMS.length} entries but ENTRY_COUNT_LOCK says ${ENTRY_COUNT_LOCK}.`,
    "The lock is deliberate. If you are adding an entry, update the lock in the same commit so widening the allowlist is visible in review. If you are removing one, likewise."
  );
}

for (const [i, entry] of ALLOWED_TRANSFORMS.entries()) {
  for (const key of ["field", "source", "shipped", "why"]) {
    if (typeof entry[key] !== "string" || entry[key].trim() === "") {
      fail(
        "scripts/verbatim-fidelity.mjs",
        `Allowlist entry ${i} is missing "${key}".`,
        "Every entry names the field, the exact source string, the exact string that shipped instead, and why."
      );
    }
  }
  if (typeof entry.why === "string" && entry.why.trim().length < 20) {
    fail(
      "scripts/verbatim-fidelity.mjs",
      `Allowlist entry ${i} ("${entry.source}") has no real reason.`,
      "\"why\" is read by the next person deciding whether this transform was ever anyone's to make. Write a sentence."
    );
  }
}

const bySource = new Map(ALLOWED_TRANSFORMS.map((e) => [e.source, e]));
if (bySource.size !== ALLOWED_TRANSFORMS.length) {
  fail(
    "scripts/verbatim-fidelity.mjs",
    "Two allowlist entries claim the same source string.",
    "One string, one decision. Merge them."
  );
}
const usedEntries = new Set();
const allSourceStrings = new Set();

// -- CHECKS must cover every fixture, or its strings are never compared -----
//
// #221: a real divergence (PR#216's celebration copy) reached `main` even
// though this script correctly found it and exited 1 -- the merge did not
// wait for CI. This script cannot make GitHub's merge button wait. What it
// can do is close the one silent bypass that lives in its OWN configuration:
// CHECKS is a hand-maintained list of which fixture maps to which pack. Every
// string-level comparison below only ever looks at a row that is reachable
// through CHECKS. Delete a CHECKS entry -- by mistake, by a bad merge, by
// "simplifying" this file -- and that fixture's founder-authored strings stop
// being read at all: not one failure, just quiet non-coverage. A guard that
// silently checks nothing is exactly the false confidence this file exists to
// refuse, so the set of fixtures it declares must equal the set on disk.
const declaredFixtures = new Set(
  CHECKS.map((c) => c.fixture.replace(/^.*\//, ""))
);
const fixturesOnDisk = readdirSync(SOURCE_ROWS_DIR).filter((f) =>
  f.endsWith(".json")
);
for (const file of fixturesOnDisk) {
  if (!declaredFixtures.has(file)) {
    fail(
      `fixtures/source-rows/${file}`,
      "This fixture exists but no CHECKS entry in scripts/verbatim-fidelity.mjs reads it.",
      [
        `  Every founder-authored string in this file is invisible to the guard --`,
        `  not flagged, just never compared, because nothing in CHECKS points at it.`,
        ``,
        `  Add { fixture: "fixtures/source-rows/${file}", pack: ..., sessions: {...} }`,
        `  to CHECKS, or delete the fixture if it no longer backs a shipped pack.`,
      ].join("\n")
    );
  }
}

// -- Then the packs ---------------------------------------------------------

let rowsChecked = 0;
let stringsChecked = 0;

for (const check of CHECKS) {
  const rows = JSON.parse(readFileSync(join(root, check.fixture), "utf8"));
  const pack = JSON.parse(readFileSync(join(root, check.pack), "utf8"));

  for (const row of rows) {
    const sessionId = check.sessions[row.id];
    if (!sessionId) {
      fail(
        check.fixture,
        `Row ${row.id} ("${row.title}") is in the fixture but no session is mapped to it.`,
        "Add it to CHECKS.sessions, or take the row out of the fixture. A source row nobody checks is a source row nobody honours."
      );
      continue;
    }
    const session = pack.sessions.find((s) => s.id === sessionId);
    if (!session) {
      fail(
        check.pack,
        `Session "${sessionId}" is gone from the pack, but row ${row.id} ("${row.title}") still expects it.`,
        "A ported session cannot be removed while its source row is being checked."
      );
      continue;
    }

    rowsChecked += 1;
    const shipped = shippedStrings(session);
    const harvested = [];
    harvestSource(row, `row[${row.id}]`, harvested);

    for (const { path, text } of harvested) {
      stringsChecked += 1;
      allSourceStrings.add(text);
      if (shipped.has(text)) continue;

      const entry = bySource.get(text);
      if (!entry) {
        fail(
          check.pack,
          `${sessionId}: a source string is not in the pack.`,
          [
            `  at ${path}`,
            `  Johan wrote: ${JSON.stringify(text)}`,
            `  The pack does not contain that string anywhere in the session.`,
            ``,
            `  Fix the pack. Carry the string exactly as written — no trimming, no`,
            `  sentence-casing, no punctuation, no improving. If it reads like a typo,`,
            `  it ships and you flag it; that judgement is Johan's.`,
          ].join("\n")
        );
        continue;
      }

      usedEntries.add(entry.source);
      if (!shipped.has(entry.shipped)) {
        fail(
          check.pack,
          `${sessionId}: an allowed transform does not match what shipped.`,
          [
            `  at ${path}`,
            `  Johan wrote:        ${JSON.stringify(entry.source)}`,
            `  The allowlist says: ${JSON.stringify(entry.shipped)}`,
            `  The pack has neither.`,
            ``,
            `  An allowlist entry is a claim about what shipped, not a way to skip a`,
            `  string. Either the pack drifted again, or the entry is wrong.`,
          ].join("\n")
        );
      }
    }

    // Quantities the pack carries as structured data rather than prose. These
    // are excluded from the string sweep above, so they are checked here
    // instead — more strictly than a string match would.
    const sourceMinutes = Number.parseInt(row.duration, 10);
    if (Number.isFinite(sourceMinutes) && session.durationMin !== sourceMinutes) {
      fail(
        check.pack,
        `${sessionId}: the session length does not match the source row.`,
        `  row.duration = ${JSON.stringify(row.duration)} but session.durationMin = ${session.durationMin}`
      );
    }

    for (const sense of row.senses ?? []) {
      const word = SENSE_WORDS[sense];
      if (!word) {
        fail(
          check.fixture,
          `${sessionId}: the source names a sense with no word in SENSE_WORDS: ${JSON.stringify(sense)}.`,
          "Add it to SENSE_WORDS so the skill line stays derived from the source rather than written over it."
        );
        continue;
      }
      if (!(session.namedSkill ?? "").includes(word)) {
        fail(
          check.pack,
          `${sessionId}: the skill line lost a sense the source named.`,
          `  row.senses includes ${JSON.stringify(sense)} (${JSON.stringify(word)}) but session.namedSkill = ${JSON.stringify(session.namedSkill)}`
        );
      }
    }
  }
}

// -- The guard must have actually checked something -------------------------
//
// #221, same concern as the CHECKS-coverage assertion above, one layer
// further out: if CHECKS itself were ever emptied (not one entry dropped, all
// of them), the loop above simply never runs and this script would print
// "passed: 0 row(s), 0 string(s)" -- a green build asserting nothing at all.
// The allowlist's own unused-entry check happens to catch that today only
// because ALLOWED_TRANSFORMS is non-empty; this makes the requirement direct
// instead of incidental to a list someone could also empty.
if (rowsChecked === 0 || stringsChecked === 0) {
  fail(
    "scripts/verbatim-fidelity.mjs",
    `The guard finished having checked ${rowsChecked} row(s) and ${stringsChecked} string(s).`,
    "A pass with nothing checked is not a pass, it is a guard that stopped guarding. CHECKS is empty, or every fixture it points at resolved to zero rows -- fix CHECKS rather than let this report success."
  );
}

// -- Stale allowlist entries ------------------------------------------------

for (const entry of ALLOWED_TRANSFORMS) {
  if (usedEntries.has(entry.source)) continue;
  const stillInSource = allSourceStrings.has(entry.source);
  fail(
    "scripts/verbatim-fidelity.mjs",
    `Allowlist entry covers nothing: ${JSON.stringify(entry.source)}.`,
    [
      stillInSource
        ? `  The pack already ships that string verbatim, so no transform is being`
          + `\n  allowed. This is good news: delete the entry.`
        : `  No source row carries that string any more, so the entry covers nothing.`
          + `\n  Delete it.`,
      `  Drop ENTRY_COUNT_LOCK by one in the same commit. An allowlist that keeps`,
      `  dead entries is an allowlist nobody reads.`,
    ].join("\n")
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

if (failures.length > 0) {
  console.error(
    `\nVerbatim fidelity FAILED. ${failures.length} problem(s):\n`
  );
  for (const f of failures) {
    console.error(`  ${f.file}`);
    console.error(`  ${f.headline}`);
    if (f.detail) console.error(f.detail);
    console.error("");
  }
  console.error(
    "The founder's words are the source of truth. A convention that rewrites them\n" +
      "is not a convention, it is a bug — three times now (#140, #130, and the\n" +
      "register lint's \"how many\" ban before them). Our copy rules govern what we\n" +
      "write, not what he wrote. Fix the pack.\n"
  );
  process.exit(1);
}

console.log(
  `Verbatim fidelity passed: ${rowsChecked} source row(s), ${stringsChecked} authored string(s) ` +
    `byte-identical in the shipped packs, ${ALLOWED_TRANSFORMS.length} allowed transform(s).`
);

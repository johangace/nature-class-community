#!/usr/bin/env node
// Pack validation: the dedicated command #58 asks for. Two layers.
//
// SCHEMA — every packs/*.json must parse against schema/pack.ts. This is a
// thin wrapper around parsePack; zod already gives us the detailed failure.
//
// SEMANTIC — invariants zod's shape checking cannot see, because they are
// about the relationships BETWEEN sessions/phases, not one object's shape:
//   - pack ids unique across the catalogue
//   - session ids unique across the WHOLE catalogue (a session id is the
//     resolution key findSession() and sessionMinutes() use; a collision
//     would make one of two sessions permanently unreachable)
//   - phase keys unique WITHIN a session (the runner uses a phase's key to
//     track progress through it; a duplicate key makes two phases share state)
//   - abilityVariants only ever name the three real bands (schema already
//     enforces this via .strict(), kept here as a second, readable check)
//   - a phase's optional `stretch` line (#466) is well-formed where present.
//     Enforced at the SCHEMA layer above rather than repeated here, because
//     all three of its rules are about one phase object and zod can see them:
//     it must be a line rather than blank space; it must not repeat a line the
//     phase already carries (the note renders in addition to the blocks, so a
//     copy shows twice — move the line instead); and it may not sit on the
//     `settle` phase, which renders as paired cards and would drop it.
//   - a session's phases' durationMin, when authored, should not wildly
//     exceed the session's own durationMin (duration consistency)
//   - every session ships a non-empty childSheet (product law: "a session
//     without its printable is not finished" — schema.pack.ts's own words)
//   - every session.title is sentence case (#189): first word capitalised,
//     every other word lowercase unless it is a genuine proper noun (see
//     TITLE_PROPER_NOUNS below). Checks session.title only, never
//     childSheet's sheet-title — see the comment on TITLE_PROPER_NOUNS.
//   - no two sessions ship the same celebration line (#92). Compared per
//     field — headline against headline, keepsake against keepsake,
//     nextWeekTease against nextWeekTease — across the WHOLE catalogue, on a
//     folded key (see celebrationKey). The celebration is the warmest moment
//     in the session, and a teacher leading a term in order should never
//     hear the same one twice; a line that could be pasted onto another
//     session was never about this one. See KNOWN_CELEBRATION_COLLISIONS.
//   - no session ships a driving question that no surface can print, and no
//     two sessions ship the SAME driving question (#150). See "Driving
//     question integrity" below.
//
// DRIVING QUESTION INTEGRITY (#150) — two relational rules, neither of which
// has an opinion about anybody's wording:
//   - RESTATEMENT. `lib/lesson/driving-question.ts` suppresses a `prompt` that
//     restates the title or objective printed beside it, because stacked the
//     pair "reads as a rendering bug rather than as two fields". Suppression is
//     the honest thing for a RENDERER to do and it is also a silence: the shelf
//     row, the runner, the print sheet and the preview deck all fall back to
//     the objective, so the session ships a driving-question field that no
//     surface can print. That is a session with no driving question, dressed as
//     one, and nothing on disk says so. This check says so. It calls the
//     shipped `promptRestates` rather than restating its logic, so the guard
//     and the renderer can never disagree about which sessions are affected.
//     The three on disk are named in KNOWN_RESTATED_PROMPTS with their ticket
//     and the set RATCHETS: a listed session that stops violating, or whose id
//     disappears, fails here. Johan rewriting one of the three lines (nc#150
//     option (a)) deletes an entry; it can never leave permanent cover.
//   - COLLISION. No two sessions ship the same driving question, compared on
//     the same folded key celebration lines use, across the WHOLE catalogue.
//     Zero duplicates today, so KNOWN_PROMPT_COLLISIONS ships empty and exists
//     to keep it that way — the same move #92 made for the celebration.
//
// WHAT THIS DELIBERATELY DOES NOT CATCH, so it is a recorded fact rather than
// a later discovery: an objective that CONTAINS the prompt somewhere other than
// its start. Two spring sessions do it — "Using natural resources to create."
// under "About using natural resources to create.", and "Spreading wildflowers
// for pollinating insects." under "This session is about spreading wildflowers
// for pollinating insects." — and they render the same sentence twice today.
// They are a different defect (a lead-in glued to the front of the objective)
// from the truncation `promptRestates` was measured against, Johan has not
// ruled on them, and widening the renderer's `isPrefix` to `includes` would
// swallow them silently. Naming them here, and pinning the gap as an
// `expect: "green"` mutation in scripts/guard-mutation-check.mjs, is what this
// check can honestly do about a content call that is not a lint's to make.
//

// SHELF SEMANTICS — what /season actually shows a teacher, not just what
// parses:
//   - every session named in a seasonShelf `only` list actually exists in
//     its pack (a typo here silently drops a session with no error today)
//   - no two sessions ON THE SHELF share a title. This now fails the build.
//     #105 was the one accepted case (a5-leaf-collage vs
//     summer-w3-a5-leaf-collage: different ids, different content, same
//     title, both on the shelf) and it is resolved, so
//     KNOWN_SHELF_TITLE_COLLISIONS is empty and any duplicate is an error.
//     A future accepted collision goes in that set, by title, where a
//     reviewer reads it.
//
// THE RENAME GUARD (#543) — the one check here that is about what CHANGED
// rather than about what the files say today:
//   - every session id in the committed snapshot
//     (scripts/lib/session-ids.snapshot.json) is either still a live id, or
//     has a RETIRED_SESSION_IDS entry saying what it became. A rename with no
//     entry fails HERE, naming the entry that is missing, instead of failing
//     as collateral damage in whichever unrelated specs happen to hardcode
//     the id — which invites updating those ids and losing the map entry
//     altogether (exactly what #539 did across eight test files).
//   - RETIRED_SESSION_IDS itself stays honest: no key is also a live id, and
//     every target is one.
// `npm run packs:snapshot` refreshes the snapshot after a legitimate rename
// or a new session. It runs the SAME departure check first (#670), so the
// guard cannot be laundered by running the refresh before the check; a session
// that is genuinely deleted rather than renamed is named on the command line
// with `--allow-deleted-session-ids`. See "Layer 4" below.
//
// Exit 0 pack-valid + only known shelf collisions; exit 1 on anything else,
// including any duplicate title now that the set is empty.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parsePack, phaseSchema, readNodeId } from "../schema/pack.ts";
import { DEMO_MARK_IDS as DEMO_MARK_ID_LIST } from "../engine/demo-mark-ids.ts";
// The REAL map, imported rather than mirrored. The shelf literal below is
// duplicated on purpose (see its comment); this one must not be, because the
// whole point of the guard is to check the map the app actually resolves
// against. A copy here would pass while production 404s. Importing the const
// runs no disk read: lib/pack.ts reads packs lazily, inside its functions.
import { RETIRED_NODE_IDS, RETIRED_SESSION_IDS } from "../lib/pack.ts";
// The SHIPPED display rule, imported rather than reimplemented (#150). Which
// prompts the renderer must suppress is one question with one answer; a second
// copy of the comparison here would drift from the one the app runs, and the
// guard would then be protecting a rule nobody renders. Type-only in its own
// imports, so this costs no disk read either.
import { promptRestates } from "../lib/lesson/driving-question.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const packsDir = join(root, "packs");
const SNAPSHOT_FILE = join(root, "scripts", "lib", "session-ids.snapshot.json");
const SNAPSHOT_REL = "scripts/lib/session-ids.snapshot.json";
// `npm run packs:snapshot`. Refreshes the snapshot instead of diffing it —
// the deliberate, reviewable act that says "yes, this id really did change".
// It still runs the departure check first: see "Layer 4" below for why the
// refresh is not allowed to be the way around the guard (#670).
const WRITE_SNAPSHOT = process.argv.includes("--write-session-ids");

// `--allow-deleted-session-ids=<id>[,<id>…]` (#670).
//
// The ONE way a session id may leave the snapshot with no RETIRED_SESSION_IDS
// entry: the session was genuinely DELETED, not renamed, so there is no
// successor to forward an old link to. That is rare, and it is a decision —
// links and queued completions holding the id will 404 rather than resolve —
// so it is stated on the command line rather than reached by side effect.
//
// The ids are named individually on purpose. A bare "yes, go ahead" flag would
// also wave through whatever rename happened to be in the same change, which is
// exactly the accident this layer exists to catch. Anything not named here
// still fails.
//
//   npm run packs:snapshot -- --allow-deleted-session-ids=winter-w2-ice
const ALLOW_DELETED_FLAG = "--allow-deleted-session-ids";
const ALLOW_DELETED_ARGS = process.argv.filter(
  (arg) => arg === ALLOW_DELETED_FLAG || arg.startsWith(`${ALLOW_DELETED_FLAG}=`)
);
const DELETED_SESSION_IDS = new Set(
  ALLOW_DELETED_ARGS.flatMap((arg) => arg.slice(ALLOW_DELETED_FLAG.length + 1).split(","))
    .map((id) => id.trim())
    .filter(Boolean)
);

// Mirrors lib/pack.ts's seasonBrowseShelf. Not imported directly because lib/pack.ts
// is a .ts module that reads from process.cwd() via readFileSync — importing
// it here would work, but duplicating the tiny literal keeps this script a
// standalone CLI with no dependency on the app's runtime path assumptions.
// scripts/validate-packs.spec.ts (the vitest half of this same check) DOES
// import the real seasonShelf/shelfPacks from lib/pack.ts, so any drift
// between this literal and the real one fails that test instead of silently
// validating the wrong shelf.
const SEASON_BROWSE_SHELF = [
  {
    pack: "autumn-starter",
    tier: "community",
    only: [
      "seed-searchers",
      "animal-leaf-masks",
      "nature-recycling-system",
      "conker-acorn-maths-trail",
    ],
    // Borrowed from packs/summer.json (see `also` in lib/pack.ts).
    also: ["summer-w2-minibeast-hunting"],
  },
  // Winter, spring and summer are title-only drawers for now (Johan,
  // 2026-09-07); their sessions are archived. See lib/pack.ts.
  {
    pack: "winter-starter",
    tier: "community",
    only: ["bird-watching", "making-bird-feeders", "bark-rubbings", "winter-survival-sort"],
  },
  { pack: "spring-term", tier: "community", only: [] },
  { pack: "summer", tier: "community", only: [] },
];

// Empty since #105 was resolved: the autumn-starter rewrite is now "Leaves and
// their trees" and Johan's ported summer session keeps "A5 leaf collage". Any
// duplicate title on the shelf now fails the build. Keyed by title, so if a
// collision is ever accepted again it is named here and nowhere else.
const KNOWN_SHELF_TITLE_COLLISIONS = new Set([]);

const DEMO_MARK_IDS = new Set(DEMO_MARK_ID_LIST);

const ABILITY_BANDS = new Set(["reception", "y1", "y2"]);

// --- Celebration uniqueness (#92) ----------------------------------------
//
// The three prose fields of a session's celebration. `emoji` is deliberately
// NOT one of them: it is an accent, not a line, and two sessions about
// looking closely may honestly reach for the same 🔍 (spring week 2 and
// summer week 1 already do). Repeating a magnifying glass costs nothing;
// repeating the sentence a class hears at the end of its lesson costs the
// moment.
const CELEBRATION_FIELDS = ["headline", "keepsake", "nextWeekTease"];

/**
 * The comparison key for a celebration line. Folded, not exact.
 *
 * Two closes that differ only in a trailing full stop, a curly apostrophe or
 * a run of whitespace are the same line to the teacher reading them out, and
 * a check that only caught byte-identical copies would wave the near-copy
 * through — which is the shape a duplicate actually arrives in, because it
 * arrives by copying the neighbouring session and editing half of it.
 *
 * Only the MATCHING is folded. Every error below quotes the exact authored
 * strings, and nothing here rewrites or normalises a pack: several of these
 * lines are Johan's own and verbatim-guarded by scripts/verbatim-fidelity.mjs.
 */
function celebrationKey(value) {
  return value
    .normalize("NFC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,;:!?]+$/, "");
}

// Empty, and meant to stay that way. The #92 sweep across all 48 sessions
// found zero duplicate celebration lines under exact, folded and cross-field
// comparison: 12 sessions author a celebration and all 33 lines (12
// headlines, 12 keepsakes, 9 teases) are distinct. So this guard ships green
// on day one and exists to keep it that way — the ticket's own ask, "add the
// uniqueness check to the pack lint so it cannot come back".
//
// If a duplicate is ever deliberately accepted, name it here as
// `field::folded value` WITH ITS TICKET, the way KNOWN_SHELF_TITLE_COLLISIONS
// carried #105 until it was resolved — never by deleting the check.
const KNOWN_CELEBRATION_COLLISIONS = new Set([]);

/**
 * The driving questions the renderer has to swallow (#150), each with what it
 * restates. These are Johan's recovered curriculum, guarded byte for byte by
 * scripts/verbatim-fidelity.mjs, so rewriting them is his call and his alone
 * (nc#150 option (a)) — this check does not propose words, it refuses to let
 * the situation be invisible while he decides.
 *
 * Each of the three ships a `prompt` field that no surface prints:
 *
 *   spring-w4-bird-feeders        prompt IS the objective, byte for byte
 *   summer-w2-minibeast-hunting   prompt is the title with a full stop added
 *   summer-w3-a5-leaf-collage     prompt is the objective, cut short
 *
 * THE RATCHET, which is the point of a Map rather than a comment: the check
 * below fails if a listed session stops violating, if it starts violating a
 * DIFFERENT way, or if its id no longer exists. So the list can only shrink,
 * one deleted entry per line Johan writes, and it cannot rot into cover for a
 * session that has quietly become something else. A NEW session with a
 * restated prompt is not on the list and turns the build red the day it lands.
 */
const KNOWN_RESTATED_PROMPTS = new Map([
  ["spring-w4-bird-feeders", "objective"],
  ["summer-w2-minibeast-hunting", "title"],
  ["summer-w3-a5-leaf-collage", "objective"],
]);

/**
 * Empty, and meant to stay that way. The #150 sweep across all 61 sessions
 * found zero driving questions shared by two sessions under the folded
 * comparison below. So this ships green on day one and exists to keep it that
 * way: the driving question is how a teacher tells one shelf row from the
 * next, and a question that fits two lessons is not doing that job for either.
 *
 * If a duplicate is ever deliberately accepted, name it here as its folded
 * value WITH ITS TICKET — never by deleting the check.
 */
const KNOWN_PROMPT_COLLISIONS = new Set([]);

// Sentence case: Johan's standing product rule for every session title (see
// scripts/verbatim-fidelity.mjs's ALLOWED_TRANSFORMS header — "Sentence
// case: Johan's standing product rule, applied to titles only"). First word
// capitalised; every other word lowercase unless it is a genuine proper
// noun. #189 found six titles that had drifted into headline case with no
// check to catch it; this is that check, so the next one fails CI instead
// of shipping.
//
// Scoped to session.title ONLY — never childSheet's sheet-title. Some
// ported sessions (spring-term.json weeks 1-4, summer-term.json) show a
// deliberately different, sometimes headline-cased, sheet title by design
// (verbatim-fidelity.mjs does not touch childSheet at all), and #189 is not
// the ticket that settles that. Widening this check onto sheet-title would
// fail the build over content this check has no mandate to change.
const TITLE_PROPER_NOUNS = new Set([
  // "Our Earth's magnificent trees" (packs/summer.json) — "Earth" is the
  // planet's name, not a headline cap. Same exception verbatim-fidelity.mjs
  // carries for the identical reason; keep the two in sync if this grows.
  "Earth's",
]);

function titleCaseIssues(title) {
  const words = title.split(/\s+/).filter(Boolean);
  const issues = [];
  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    if (TITLE_PROPER_NOUNS.has(word)) continue;
    if (/^[A-Z]/.test(word)) issues.push(word);
  }
  return issues;
}

/** Every demo block anywhere under a session, at any nesting depth. */
function collectDemoBlocks(node, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectDemoBlocks(item, out);
  } else if (node && typeof node === "object") {
    if (node.type === "demo" && Array.isArray(node.steps)) out.push(node);
    for (const value of Object.values(node)) collectDemoBlocks(value, out);
  }
  return out;
}

function collectAbilityVariantKeys(node, out) {
  if (Array.isArray(node)) {
    node.forEach((v) => collectAbilityVariantKeys(v, out));
    return;
  }
  if (!node || typeof node !== "object") return;
  if (node.abilityVariants && typeof node.abilityVariants === "object") {
    for (const key of Object.keys(node.abilityVariants)) out.add(key);
  }
  for (const value of Object.values(node)) collectAbilityVariantKeys(value, out);
}

// packs/settle.json is NOT a pack: it is the shared settling phase, one
// object with { id, title, phase }, parsed by phaseSchema in lib/pack.ts's
// sharedSettle() and prepended to opted-in sessions. It gets its own check
// below rather than a skip, so a broken settle still fails CI.
const SETTLE_FILE = "settle.json";
const files = readdirSync(packsDir)
  .filter((f) => f.endsWith(".json") && f !== SETTLE_FILE)
  .sort();

{
  const raw = JSON.parse(readFileSync(join(packsDir, SETTLE_FILE), "utf8"));
  const parsed = phaseSchema.safeParse(raw?.phase);
  if (!parsed.success) {
    console.error(
      `Pack validation FAILED: ${SETTLE_FILE}'s phase does not parse against phaseSchema —`,
      JSON.stringify(parsed.error.issues, null, 2)
    );
    process.exit(1);
  }
}
const errors = [];
const packs = [];

// --- Layer 1: schema ---------------------------------------------------
for (const file of files) {
  const raw = JSON.parse(readFileSync(join(packsDir, file), "utf8"));
  try {
    const pack = parsePack(raw);
    packs.push({ file, pack });
  } catch (err) {
    errors.push(`${file}: schema FAILED — ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (errors.length > 0) {
  console.error("Pack validation FAILED at the schema layer:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

// --- Layer 2: semantic, catalogue-wide ----------------------------------
const packIds = new Map(); // id -> file
const sessionIds = new Map(); // id -> { file, title }
// `${field}::${folded line}` -> [{ field, value, id, file }]
const celebrationLines = new Map();
// `${folded prompt}` -> [{ value, id, file }] (#150)
const drivingQuestions = new Map();
// session id -> what its prompt restates, for the ratchet below (#150)
const restatedPrompts = new Map();

for (const { file, pack } of packs) {
  if (packIds.has(pack.id)) {
    errors.push(`duplicate pack id "${pack.id}": ${packIds.get(pack.id)} and ${file}`);
  }
  packIds.set(pack.id, file);

  for (const session of pack.sessions) {
    if (sessionIds.has(session.id)) {
      const prior = sessionIds.get(session.id);
      errors.push(
        `duplicate session id "${session.id}": ${prior.file} and ${file} — a duplicate id makes one session permanently unreachable via findSession()`
      );
    }
    sessionIds.set(session.id, { file, title: session.title });

    // Phase keys unique within a session (the runner tracks progress by key).
    const phaseKeys = new Set();
    for (const phase of session.phases) {
      if (phaseKeys.has(phase.key)) {
        errors.push(
          `${file} / ${session.id}: duplicate phase key "${phase.key}" — the runner would share progress state between two phases`
        );
      }
      phaseKeys.add(phase.key);

      // Duration consistency: an authored phase duration should not exceed
      // the session's own planned length. Equal-to is fine (a single-phase
      // session, or a session whose one long phase IS the session).
      if (phase.durationMin !== undefined && phase.durationMin > session.durationMin) {
        errors.push(
          `${file} / ${session.id}: phase "${phase.key}" duration (${phase.durationMin}m) exceeds the session's own durationMin (${session.durationMin}m)`
        );
      }
    }

    // Ability variants: only the three real bands, everywhere in the session
    // (schema.pack.ts's .strict() already rejects an unknown key at parse
    // time; this is a readable, session-scoped second look).
    const seenBands = new Set();
    collectAbilityVariantKeys(session, seenBands);
    for (const band of seenBands) {
      if (!ABILITY_BANDS.has(band)) {
        errors.push(`${file} / ${session.id}: unknown ability band "${band}" in abilityVariants`);
      }
    }

    // A primary topic must be one of the session's OWN tags (#339). The
    // schema can only check it is a valid tag; only this layer knows which
    // tags this session carries. A primary naming a tag the session does not
    // have would silently empty the introduce-today door, because the filter
    // would match nothing and the page would honestly show nothing — the
    // worst kind of bug, one that looks like thin data.
    if (session.primaryTopic) {
      const tags = session.topicTags ?? [];
      if (!tags.includes(session.primaryTopic)) {
        errors.push(
          `${file} / ${session.id}: primaryTopic "${session.primaryTopic}" is not in topicTags [${tags.join(", ")}]`
        );
      }
    }

    // A demo block's text is an array, so the two variant fields cannot reach
    // it (#252). Both rewrite a block's PRIMARY TEXT, and a demo has a move, a
    // list of steps and an optional closing beat rather than one primary text.
    // The schema still carries the fields, because every other consumer reads
    // them off the block union without narrowing — so without this check an
    // authored variant would validate cleanly and then never render, which is
    // the quiet kind of wrong. Fail loud at authoring time instead. Per-step
    // variants are the right shape if this is ever actually wanted.
    for (const block of collectDemoBlocks(session)) {
      for (const field of ["abilityVariants", "habitatVariants"]) {
        if (block[field]) {
          errors.push(
            `${file} / ${session.id}: demo block "${block.move}" carries ${field}, which cannot reach a step. ` +
              `Author the variant into the step text, or add per-step variants to demoStepSchema.`
          );
        }
      }
      for (const step of block.steps) {
        if (step.mark && !DEMO_MARK_IDS.has(step.mark)) {
          errors.push(
            `${file} / ${session.id}: demo block "${block.move}" names mark "${step.mark}", ` +
              `which is not drawn in engine/demo-marks.tsx. A step with no mark renders its numeral; ` +
              `a step with a WRONG mark renders nothing and looks broken.`
          );
        }
      }
    }

    // Child-sheet requirement: product law, every session ships one.
    if (session.childSheet.length === 0) {
      errors.push(`${file} / ${session.id}: no childSheet — every session must ship its printable`);
    }

    // Sentence case: see TITLE_PROPER_NOUNS above for what this does and does
    // not cover.
    const titleIssues = titleCaseIssues(session.title);
    if (titleIssues.length > 0) {
      errors.push(
        `${file} / ${session.id}: title "${session.title}" is not sentence case — capitalised word(s): ${titleIssues.join(", ")}. If one is a genuine proper noun, add it to TITLE_PROPER_NOUNS in scripts/validate-packs.mjs; otherwise fix the pack.`
      );
    }

    // Celebration lines, gathered for the catalogue-wide uniqueness check
    // below. Gathered from every pack, not only the shelf ones: an off-shelf
    // pack is a pack waiting for its term, and the duplicate would ship with
    // it. Same reasoning as session ids being unique catalogue-wide.
    // The driving question, gathered for the two catalogue-wide checks below
    // (#150). Same reasoning as the celebration lines for reading every pack
    // rather than only the shelf ones: an off-shelf pack is a pack waiting for
    // its term, and the defect would ship with it.
    const askedPrompt = typeof session.prompt === "string" ? session.prompt.trim() : "";
    if (askedPrompt !== "") {
      const restates = promptRestates(session);
      if (restates !== null) restatedPrompts.set(session.id, { restates, file, session });
      const key = celebrationKey(askedPrompt);
      const list = drivingQuestions.get(key) ?? [];
      list.push({ value: session.prompt, id: session.id, file });
      drivingQuestions.set(key, list);
    }

    if (session.celebration) {
      for (const field of CELEBRATION_FIELDS) {
        const value = session.celebration[field];
        if (value === undefined) continue;
        const key = `${field}::${celebrationKey(value)}`;
        const list = celebrationLines.get(key) ?? [];
        list.push({ field, value, id: session.id, file });
        celebrationLines.set(key, list);
      }
    }
  }
}

// Celebration uniqueness (#92): no two sessions close on the same line.
let celebrationLineCount = 0;
for (const [key, entries] of celebrationLines) {
  celebrationLineCount += entries.length;
  if (entries.length <= 1) continue;
  const where = entries.map((e) => `${e.id} (${e.file}): "${e.value}"`).join(" / ");
  if (KNOWN_CELEBRATION_COLLISIONS.has(key)) {
    console.log(`  (known, accepted) duplicate celebration ${entries[0].field}: ${where}`);
    continue;
  }
  errors.push(
    `duplicate celebration ${entries[0].field} shared by ${entries.length} sessions — ${where}. ` +
      `The celebration is the last thing the class hears; a line that fits two sessions was never about either. ` +
      `Rewrite one to name what THAT session did (the bar: "You just planted wildflowers for pollinators"), ` +
      `or, if the collision is genuinely accepted, name it in KNOWN_CELEBRATION_COLLISIONS in scripts/validate-packs.mjs with its ticket.`
  );
}

// --- Driving question integrity (#150) ------------------------------------
//
// See the header for what these two rules are and, just as important, what
// they deliberately leave alone.

// (1) RESTATEMENT. A prompt the renderer must suppress is a driving question
// no surface can print. Known ones are named; new ones fail.
for (const [id, { restates, file }] of restatedPrompts) {
  const known = KNOWN_RESTATED_PROMPTS.get(id);
  if (known === restates) {
    console.log(`  (known, open — #150) ${id} (${file}): prompt restates the ${restates}`);
    continue;
  }
  if (known !== undefined) {
    errors.push(
      `${file} / ${id}: prompt restates the ${restates}, but KNOWN_RESTATED_PROMPTS in scripts/validate-packs.mjs records it as restating the ${known}. ` +
        `The session changed under the exception; re-read it and update or delete the entry.`
    );
    continue;
  }
  errors.push(
    `${file} / ${id}: prompt restates the ${restates} printed beside it, so lib/lesson/driving-question.ts suppresses it and NO surface — shelf row, runner, print sheet, preview deck — shows this session a driving question. ` +
      `Give it a question of its own that is true to its steps (it must not assert what will be found or seen), ` +
      `or, if the restatement is genuinely accepted, name it in KNOWN_RESTATED_PROMPTS in scripts/validate-packs.mjs with its ticket.`
  );
}

// The ratchet: the list may only shrink, and only deliberately.
for (const [id, restates] of KNOWN_RESTATED_PROMPTS) {
  if (restatedPrompts.has(id)) continue;
  const stillExists = sessionIds.has(id);
  errors.push(
    stillExists
      ? `${id} no longer restates its ${restates} — good. Delete its entry from KNOWN_RESTATED_PROMPTS in scripts/validate-packs.mjs; the list is a ratchet and may not hold cover for a session that has been fixed.`
      : `KNOWN_RESTATED_PROMPTS in scripts/validate-packs.mjs names session "${id}", which is in no pack. Delete the stale entry (or restore the id, if this was an unintended rename).`
  );
}

// (2) COLLISION. No two sessions ask the same question.
let drivingQuestionCount = 0;
for (const [key, entries] of drivingQuestions) {
  drivingQuestionCount += entries.length;
  if (entries.length <= 1) continue;
  const where = entries.map((e) => `${e.id} (${e.file}): "${e.value}"`).join(" / ");
  if (KNOWN_PROMPT_COLLISIONS.has(key)) {
    console.log(`  (known, accepted) duplicate driving question: ${where}`);
    continue;
  }
  errors.push(
    `duplicate driving question shared by ${entries.length} sessions — ${where}. ` +
      `The driving question is how a teacher tells one shelf row from the next; a question that fits two lessons is not doing that job for either. ` +
      `Rewrite one to ask what THAT session's steps actually go and look at, ` +
      `or, if the collision is genuinely accepted, name it in KNOWN_PROMPT_COLLISIONS in scripts/validate-packs.mjs with its ticket.`
  );
}

// --- Layer 3: shelf semantics --------------------------------------------
for (const entry of SEASON_BROWSE_SHELF) {
  const found = packs.find((p) => p.pack.id === entry.pack);
  if (!found) {
    errors.push(`seasonShelf names pack "${entry.pack}" but no packs/${entry.pack}.json parsed`);
    continue;
  }
  // A borrowed session (`also`) must exist somewhere in the catalogue, and the
  // pack it lives in must not ALSO show it, or one title sits on the shelf
  // twice under two headings.
  for (const borrowed of entry.also ?? []) {
    const home = packs.find((p) => p.pack.sessions.some((s) => s.id === borrowed));
    if (!home) {
      errors.push(`seasonShelf's "also" for pack "${entry.pack}" borrows session "${borrowed}", which is in no pack`);
      continue;
    }
    const homeEntry = SEASON_BROWSE_SHELF.find((e) => e.pack === home.pack.id);
    const shownAtHome = homeEntry && (!homeEntry.only || homeEntry.only.includes(borrowed));
    if (shownAtHome) {
      errors.push(`session "${borrowed}" is borrowed onto "${entry.pack}" and still shown under "${home.pack.id}": narrow that pack's "only"`);
    }
  }
  if (entry.only) {
    const ids = new Set(found.pack.sessions.map((s) => s.id));
    for (const wanted of entry.only) {
      if (!ids.has(wanted)) {
        errors.push(
          `seasonShelf's "only" for pack "${entry.pack}" names session "${wanted}", which does not exist in packs/${entry.pack}.json — this session silently drops off the shelf`
        );
      }
    }
  }
}

// Duplicate titles among the sessions actually reachable on the shelf.
const shelfTitles = new Map(); // title -> [{ id, file }]
for (const entry of SEASON_BROWSE_SHELF) {
  const found = packs.find((p) => p.pack.id === entry.pack);
  if (!found) continue;
  const wanted = entry.only ? new Set(entry.only) : null;
  for (const session of found.pack.sessions) {
    if (wanted && !wanted.has(session.id)) continue;
    const list = shelfTitles.get(session.title) ?? [];
    list.push({ id: session.id, file: found.file });
    shelfTitles.set(session.title, list);
  }
}

const unexpectedTitleCollisions = [];
for (const [title, entries] of shelfTitles) {
  if (entries.length <= 1) continue;
  if (KNOWN_SHELF_TITLE_COLLISIONS.has(title)) {
    console.log(
      `  (known, open — #105) shelf title collision "${title}": ${entries.map((e) => `${e.id} (${e.file})`).join(" / ")}`
    );
    continue;
  }
  unexpectedTitleCollisions.push(
    `NEW shelf title collision "${title}": ${entries.map((e) => `${e.id} (${e.file})`).join(" / ")}`
  );
}
errors.push(...unexpectedTitleCollisions);

// --- Layer 5: node identity (#330 §4) -------------------------------------
//
// The session-id guard above, one level down. A `nid` is the address a
// worksheet, an audio clip, a prepared day or a proposed rewrite records what
// it was derived FROM, so the same rule applies to it that applies to a
// session id: it is not a name, it is a handle other people's data points at,
// and it may never come to mean a different line than it meant yesterday.
//
// Four properties, each of them a different way that stops being true.
//
//   PRESENT   every phase, block, condition variant and tip in a shipped pack
//             carries one, and every session carries its `nodeSeq` mark. The
//             schema has `nid` optional so a pack authored outside this repo
//             still parses; the catalogue we ship has no such excuse, and an
//             unminted node is a node no dependency can be recorded against.
//   UNIQUE    within a session, across all four kinds. Two nodes on one
//             address is the same failure as two sessions on one id: whichever
//             is found second is unreachable, and every recorded dependency
//             resolves to whichever the walk hits first.
//   IN RANGE  no number above the session's `nodeSeq`. This is what catches a
//             writer that assigned an id without bumping the mark — the Studio
//             mints new nodes too — because the next mint here would then hand
//             the same number out again.
//   NOT REUSED  no id listed in RETIRED_NODE_IDS (lib/pack.ts) is live again.
//             `nodeSeq` is the mechanism that keeps a deleted node's address
//             out of circulation; this is the ledger that proves it held
//             through a bad merge or a hand-edit.
//
// AND THE DEPARTURE CHECK, which is the one this file already knows is worth
// the trouble: `scripts/lib/node-ids.snapshot.json` records every live id, so
// an id LEAVING the catalogue shows up as a diff rather than as silence. A
// departure is legitimate — a block gets deleted — but it is a decision, so it
// is stated in RETIRED_NODE_IDS rather than reached by side effect. Same
// shape, same reasoning and the same failure mode as the session-id guard, and
// the refresh (`npm run packs:snapshot`) is the same deliberate act.
//
// `packs/settle.json` is out of scope and that is stated rather than silent:
// it is ONE shared phase that `loadPack` prepends to every session that opts
// in, so a single id on it would arrive inside eleven sessions at once and
// "unique within a session" could not be true of it. Addressing a shared node
// needs a namespace of its own. See scripts/mint-node-ids.mjs.
const NODE_SNAPSHOT_FILE = join(root, "scripts", "lib", "node-ids.snapshot.json");
const NODE_SNAPSHOT_REL = "scripts/lib/node-ids.snapshot.json";

/** Every id-carrying node in a session, in the mint's own order. */
function nodeIdSlots(session) {
  const found = [];
  const visitPhase = (phase, where) => {
    found.push({ node: phase, kind: "phase", where });
    (phase.tips ?? []).forEach((tip, i) => found.push({ node: tip, kind: "tip", where: `${where}.tips[${i}]` }));
    (phase.blocks ?? []).forEach((b, i) => found.push({ node: b, kind: "block", where: `${where}.blocks[${i}]` }));
    (phase.conditionVariants ?? []).forEach((v, i) => {
      found.push({ node: v, kind: "variant", where: `${where}.conditionVariants[${i}]` });
      visitPhase(v.phase, `${where}.conditionVariants[${i}].phase`);
    });
  };
  session.phases.forEach((phase, i) => visitPhase(phase, `phases[${i}]`));
  (session.childSheet ?? []).forEach((b, i) =>
    found.push({ node: b, kind: "block", where: `childSheet[${i}]` })
  );
  return found;
}

const liveNodeIds = {}; // session id -> sorted ids

for (const { file, pack } of packs) {
  for (const session of pack.sessions) {
    const slots = nodeIdSlots(session);
    const seen = new Map(); // nid -> where
    const unminted = [];

    for (const { node, kind, where } of slots) {
      const nid = node.nid;
      if (nid === undefined) {
        unminted.push(where);
        continue;
      }
      const read = readNodeId(nid);
      if (!read) {
        errors.push(
          `${file} / ${session.id}: node id "${nid}" at ${where} is not a well-formed id — ` +
            `one of p/b/v/t followed by digits (NODE_ID_PATTERN in schema/pack.ts).`
        );
        continue;
      }
      if (read.kind !== kind) {
        errors.push(
          `${file} / ${session.id}: node id "${nid}" at ${where} opens with the letter for a ` +
            `${read.kind}, but the node is a ${kind}. The letter says what the node IS; a ` +
            `dependency recorded against it would name the wrong kind of thing.`
        );
      }
      if (seen.has(nid)) {
        errors.push(
          `${file} / ${session.id}: duplicate node id "${nid}" — ${seen.get(nid)} and ${where}. ` +
            `Two nodes on one address makes the second unreachable, and every worksheet, clip ` +
            `or prepared day that recorded it resolves to the first.`
        );
      }
      seen.set(nid, where);
      if (session.nodeSeq === undefined || read.seq > session.nodeSeq) {
        errors.push(
          `${file} / ${session.id}: node id "${nid}" at ${where} is above the session's nodeSeq ` +
            `(${session.nodeSeq ?? "absent"}). Something assigned an id without bumping the ` +
            `high-water mark, so the next mint would hand that number out a second time.`
        );
      }
    }

    if (unminted.length > 0) {
      errors.push(
        `${file} / ${session.id}: ${unminted.length} node(s) carry no id (first: ${unminted[0]}). ` +
          `Run \`npm run packs:mint-node-ids\`. An unminted node is a node no output can record ` +
          `a dependency against, so a source edit to it can never find what went stale.`
      );
    }
    if (session.nodeSeq === undefined && slots.length > 0) {
      errors.push(
        `${file} / ${session.id}: no nodeSeq. Run \`npm run packs:mint-node-ids\`.`
      );
    }

    const retired = RETIRED_NODE_IDS[session.id] ?? [];
    for (const nid of retired) {
      if (seen.has(nid)) {
        errors.push(
          `${file} / ${session.id}: node id "${nid}" is listed in RETIRED_NODE_IDS (lib/pack.ts) ` +
            `and is LIVE again at ${seen.get(nid)}. A retired address names a line that was ` +
            `deleted; reissuing it points every dependency that recorded it at a new sentence.`
        );
      }
    }

    liveNodeIds[session.id] = [...seen.keys()].sort();
  }
}

// The departure check, and the same two-mode discipline as Layer 4: it runs
// before the write branch, so `packs:snapshot` cannot launder a departure.
let nodeSnapshot = null;
let nodeSnapshotError = null;
try {
  nodeSnapshot = JSON.parse(readFileSync(NODE_SNAPSHOT_FILE, "utf8"));
} catch (err) {
  nodeSnapshotError = err instanceof Error ? err.message : String(err);
}
const recordedNodeIds = nodeSnapshot?.nodeIds ?? null;

if (!recordedNodeIds && !WRITE_SNAPSHOT) {
  errors.push(
    `${NODE_SNAPSHOT_REL} ${nodeSnapshotError ? `could not be read (${nodeSnapshotError})` : "has no nodeIds"}, ` +
      `so nothing can tell whether a node id has left the catalogue. Regenerate it with ` +
      `\`npm run packs:snapshot\`.`
  );
} else if (recordedNodeIds) {
  for (const [sessionId, ids] of Object.entries(recordedNodeIds)) {
    const live = new Set(liveNodeIds[sessionId] ?? []);
    // A session that has gone entirely is Layer 4's finding, not this one's:
    // reporting every one of its thirty nodes as well would bury it.
    if (!liveNodeIds[sessionId]) continue;
    const retired = new Set(RETIRED_NODE_IDS[sessionId] ?? []);
    const gone = ids.filter((id) => !live.has(id) && !retired.has(id));
    if (gone.length > 0) {
      errors.push(
        `${sessionId}: node id(s) ${gone.join(", ")} are in ${NODE_SNAPSHOT_REL} and are no ` +
          `longer in the catalogue, with no RETIRED_NODE_IDS entry (lib/pack.ts). Deleting a ` +
          `node is fine; letting its address quietly become free is not. Add the id(s) under ` +
          `"${sessionId}" there, then refresh with \`npm run packs:snapshot\`.`
      );
    }
  }
}

// --- Layer 4: the rename guard (#543) -------------------------------------
//
// Every other check in this file reads the packs as they are now. This one
// reads them against what they WERE: `scripts/lib/session-ids.snapshot.json`
// is the committed list of every live session id, and the diff between it and
// the catalogue is precisely the set of renames and additions in a change.
//
// A session id is not a name, it is an address. It is written into
// `session_completion.sessionId` every time a class logs a lesson, it is the
// key a completion queued offline on an iPad carries until that iPad next has
// signal, and it is what sits in a link a teacher pasted into her planning.
// So a rename is a rename PLUS a RETIRED_SESSION_IDS entry, forever — and
// before this layer existed, forgetting the entry did not fail here at all.
// It failed later, in whichever unrelated specs happened to hardcode the id,
// with a message that reads like "update these ids" rather than "you dropped
// the map entry". That is the wrong lesson, and it has been learnt the wrong
// way once already (#539).
//
// THE DIFF RUNS IN BOTH MODES (#670). It used to live inside the `else` on
// WRITE_SNAPSHOT, so `npm run packs:snapshot` skipped it and rewrote the
// snapshot from whatever the catalogue now said — including an id that had
// vanished with no map entry. That made the guard's correctness depend on
// which of two documented commands you happened to type first: `validate:packs`
// first gave the error below, `packs:snapshot` first gave silence and a
// green build. Same tree, opposite verdicts. So the departure check happens
// before either branch, and the refresh REFUSES to drop an unmapped id.
const liveSessionIds = [...sessionIds.keys()].sort();
const liveSessionIdSet = new Set(liveSessionIds);

// The map's own integrity, checked against the same catalogue: a key that is
// live again is not retired, and a target that does not exist resolves an old
// link to nothing.
for (const [retired, current] of Object.entries(RETIRED_SESSION_IDS)) {
  if (liveSessionIdSet.has(retired)) {
    errors.push(
      `"${retired}" is listed in RETIRED_SESSION_IDS (lib/pack.ts) but is ALSO a live session id — ` +
        `canonicalSessionId() would rewrite it to "${current}", so the live session would be unreachable by its own id.`
    );
  }
  if (!liveSessionIdSet.has(current)) {
    errors.push(
      `RETIRED_SESSION_IDS (lib/pack.ts) points "${retired}" at "${current}", which is not a session in any pack — ` +
        `a saved link and an offline completion holding "${retired}" both resolve to nothing. ` +
        `Point it at the id that session has now.`
    );
  }
}

/**
 * The message an id leaving the snapshot with no forwarding entry earns.
 *
 * ONE message, reached by both modes (#670). `validate:packs` and
 * `packs:snapshot` are two ways of typing the same question about the same
 * tree, so the writer gets the identical instruction whichever one she typed —
 * and the mutation harness pins this exact wording from both commands.
 */
function missingRetiredEntry(id) {
  return (
    `session id "${id}" is in ${SNAPSHOT_REL} but is no longer a session in any pack, ` +
    `and RETIRED_SESSION_IDS (lib/pack.ts) has NO ENTRY for it. ` +
    `If it was renamed, add the entry — \`"${id}": "<the id it is now>"\` — and then refresh the ` +
    `snapshot with \`npm run packs:snapshot\`. ` +
    `Without that entry a link a teacher saved 404s, the minutes she already logged orphan under an ` +
    `id nothing resolves, and a completion queued offline on an iPad comes back 400 "unknown session" ` +
    `when it finally drains. Do NOT resolve this by editing "${id}" out of tests: the tests are not ` +
    `what breaks, her data is. ` +
    `If the session was genuinely DELETED rather than renamed — nothing for an old link to forward to — ` +
    `say so on the command line: \`npm run packs:snapshot -- ${ALLOW_DELETED_FLAG}=${id}\`.`
  );
}

if (ALLOW_DELETED_ARGS.some((arg) => arg === ALLOW_DELETED_FLAG)) {
  errors.push(
    `${ALLOW_DELETED_FLAG} was passed with no ids. It names the sessions that were deleted ` +
      `rather than renamed, one at a time — \`${ALLOW_DELETED_FLAG}=<id>[,<id>]\` — because a blanket ` +
      `"go ahead" would also drop whatever rename happened to be in the same change.`
  );
}

// --- The departure diff, run in BOTH modes (#670) -------------------------
let snapshot = null;
let snapshotReadError = null;
try {
  snapshot = JSON.parse(readFileSync(SNAPSHOT_FILE, "utf8"));
} catch (err) {
  snapshotReadError = err instanceof Error ? err.message : String(err);
}
const recorded = Array.isArray(snapshot?.sessionIds) ? snapshot.sessionIds : null;

if (!recorded) {
  const what = snapshotReadError
    ? `${SNAPSHOT_REL} could not be read (${snapshotReadError})`
    : `${SNAPSHOT_REL} has no \`sessionIds\` array`;
  if (WRITE_SNAPSHOT) {
    // Refresh mode is how you RECOVER from a snapshot that is missing or
    // corrupt, so it says what it could not check and writes a fresh one,
    // rather than refusing and leaving no way back.
    console.warn(
      `Warning: ${what}, so no departure was checked — this refresh is a fresh start, ` +
        `not a diff. Read the ids it writes before you commit them.`
    );
  } else {
    errors.push(
      `${what}. It is the rename guard's memory of every live session id; ` +
        `regenerate it with \`npm run packs:snapshot\`.`
    );
  }
}

// Ids leaving the snapshot that the writer has declared deleted outright.
let deletedOnPurpose = [];

if (recorded) {
  const recordedSet = new Set(recorded);
  const gone = recorded.filter((id) => !liveSessionIdSet.has(id));
  const added = liveSessionIds.filter((id) => !recordedSet.has(id));
  const mapped = gone.filter((id) => RETIRED_SESSION_IDS[id] !== undefined);
  const unaccounted = gone.filter((id) => RETIRED_SESSION_IDS[id] === undefined);
  deletedOnPurpose = unaccounted.filter((id) => DELETED_SESSION_IDS.has(id));
  const unmapped = unaccounted.filter((id) => !DELETED_SESSION_IDS.has(id));

  for (const id of unmapped) errors.push(missingRetiredEntry(id));

  // The flag stays honest too: an id named there that is not actually leaving
  // without a forwarding entry means the writer's picture of the change is
  // wrong, and accepting it quietly would teach her the flag "worked".
  for (const id of DELETED_SESSION_IDS) {
    if (unaccounted.includes(id)) continue;
    const because = liveSessionIdSet.has(id)
      ? `it is still a live session in the catalogue`
      : RETIRED_SESSION_IDS[id] !== undefined
        ? `RETIRED_SESSION_IDS points it at "${RETIRED_SESSION_IDS[id]}", so it is a rename, not a deletion`
        : `${SNAPSHOT_REL} does not record it, so nothing is being dropped`;
    errors.push(
      `${ALLOW_DELETED_FLAG} names "${id}", but ${because}. ` +
        `Name only the ids this change really deletes.`
    );
  }

  // Only nag about the snapshot being stale once every departure is accounted
  // for, so the message above is the whole story when an entry is missing —
  // and never in refresh mode, which is on its way to fixing exactly this.
  if (
    !WRITE_SNAPSHOT &&
    unmapped.length === 0 &&
    (gone.length > 0 || added.length > 0)
  ) {
    const parts = [];
    if (added.length > 0) parts.push(`${added.length} new: ${added.join(", ")}`);
    if (mapped.length > 0)
      parts.push(
        `${mapped.length} retired (mapped): ${mapped
          .map((id) => `${id} -> ${RETIRED_SESSION_IDS[id]}`)
          .join(", ")}`
      );
    if (deletedOnPurpose.length > 0)
      parts.push(`${deletedOnPurpose.length} deleted: ${deletedOnPurpose.join(", ")}`);
    errors.push(
      `${SNAPSHOT_REL} is out of date — ${parts.join("; ")}. ` +
        `Refresh it with \`npm run packs:snapshot\` and commit it in the same change: ` +
        `an id the snapshot never recorded is an id whose next rename nothing would notice.`
    );
  }
}

if (WRITE_SNAPSHOT) {
  // Refresh mode. Never writes a snapshot of a catalogue that does not
  // validate: a snapshot taken from a broken build would bless the breakage —
  // and, since #670, that includes an id dropping out of the snapshot with
  // nothing saying what became of it.
  if (errors.length === 0) {
    writeFileSync(
      SNAPSHOT_FILE,
      `${JSON.stringify(
        {
          _why:
            "Every live session id, committed, so that a rename shows up as a diff. " +
            "scripts/validate-packs.mjs fails when an id here has left the catalogue " +
            "without a RETIRED_SESSION_IDS entry (lib/pack.ts) saying what it became. " +
            "Refresh with `npm run packs:snapshot` and commit the result. The refresh " +
            "runs that same check first, so it cannot be the way around it: an id may " +
            "only leave with no entry when the session was deleted rather than renamed, " +
            "and then only by naming it — `npm run packs:snapshot -- " +
            "--allow-deleted-session-ids=<id>`.",
          sessionIds: liveSessionIds,
        },
        null,
        2
      )}\n`
    );
    writeFileSync(
      NODE_SNAPSHOT_FILE,
      `${JSON.stringify(
        {
          _why:
            "Every live node id, per session, committed, so that a node LEAVING the " +
            "catalogue shows up as a diff. A nid is the address an output records what " +
            "it was derived from, so an address that quietly becomes free is an address " +
            "the next mint can reissue — pointing every worksheet, clip and prepared day " +
            "that recorded it at a different line. scripts/validate-packs.mjs fails an id " +
            "here that has gone with no RETIRED_NODE_IDS entry (lib/pack.ts). Refresh " +
            "with `npm run packs:snapshot` and commit the result; the refresh runs the " +
            "same check first, so it cannot be the way around it. packs/settle.json is " +
            "excluded: one shared phase, no single session to be unique within.",
          nodeIds: liveNodeIds,
        },
        null,
        2
      )}\n`
    );
    console.log(
      `Session-id snapshot refreshed: ${liveSessionIds.length} live id(s) written to ${SNAPSHOT_REL}. Commit it.`
    );
    console.log(
      `Node-id snapshot refreshed: ${Object.values(liveNodeIds).reduce((n, ids) => n + ids.length, 0)} ` +
        `live id(s) across ${Object.keys(liveNodeIds).length} session(s) written to ${NODE_SNAPSHOT_REL}. Commit it.`
    );
    if (deletedOnPurpose.length > 0) {
      console.log(
        `  Forgotten on purpose (${ALLOW_DELETED_FLAG}): ${deletedOnPurpose.join(", ")}. ` +
          `Nothing resolves ${deletedOnPurpose.length === 1 ? "that id" : "those ids"} now — a saved link ` +
          `or a queued completion holding one 404s rather than forwards.`
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`Pack validation FAILED. ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const sessionCount = [...sessionIds.keys()].length;
console.log(
  `Pack validation passed: ${packs.length} pack(s), ${sessionCount} session(s), unique ids, unique phase keys, valid ability bands, duration-consistent, every session has a childSheet, every title is sentence case.`
);
console.log(
  `Celebration validation passed: ${celebrationLineCount} authored celebration line(s) across headline/keepsake/nextWeekTease, all distinct, ${KNOWN_CELEBRATION_COLLISIONS.size} accepted duplicate(s).`
);
console.log(
  `Driving-question validation passed: ${drivingQuestionCount} authored driving question(s), all distinct, ` +
    `${KNOWN_PROMPT_COLLISIONS.size} accepted duplicate(s), ` +
    `${KNOWN_RESTATED_PROMPTS.size} known restatement(s) awaiting a line from Johan (#150).`
);
console.log(
  `Shelf validation passed: ${SEASON_BROWSE_SHELF.length} visible entr${SEASON_BROWSE_SHELF.length === 1 ? "y" : "ies"} resolve, no duplicate session titles, ${KNOWN_SHELF_TITLE_COLLISIONS.size} accepted collision(s).`
);
if (!WRITE_SNAPSHOT) {
  console.log(
    `Rename guard passed: ${liveSessionIds.length} live session id(s) match ${SNAPSHOT_REL}, ` +
      `${Object.keys(RETIRED_SESSION_IDS).length} retired id(s) still resolve to a live session.`
  );
  console.log(
    `Node-id guard passed: ${Object.values(liveNodeIds).reduce((n, ids) => n + ids.length, 0)} ` +
      `node id(s) across ${Object.keys(liveNodeIds).length} session(s) — all present, unique within ` +
      `their session, at or below nodeSeq, none reused from RETIRED_NODE_IDS, none departed ` +
      `${NODE_SNAPSHOT_REL} unaccounted.`
  );
}

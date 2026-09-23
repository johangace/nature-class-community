#!/usr/bin/env node
/**
 * Register lint.
 *
 * WHAT IT USED TO DO, AND WHY IT DOESN'T
 *
 * It banned words. `count the`, `tally`, `score`, `test`, `measure`, and
 * before them `how many`. The theory was that child-facing text speaks in an
 * acquaintance register — meeting and noticing, never assessing — and that a
 * word list could hold the line.
 *
 * It could not. Johan, twice:
 *
 *   "they are stupid.. I dont know where you got that rule but this is
 *    precicesly why arbitrary rules dont work"
 *
 *   "i dont understand the bans remove the bans tarbitrary"
 *
 * The list is gone. It is not coming back in another spelling.
 *
 * `test` is the clearest evidence the mechanism itself was wrong. Johan's own
 * recovered curriculum reads:
 *
 *   "Four signs they can test anything against. Try them on a bird, a tree,
 *    a stone."
 *
 * That is a science lesson. A word list cannot tell it from an assessment, and
 * a check that cannot tell them apart is not enforcing a register — it is
 * deleting sentences it does not understand. The `how many` ban did exactly
 * that, keeping Counting Life and Minibeast Hunting out of the product for
 * months over a wondering question whose own teacher note read "No right
 * answer. Big guesses welcome."
 *
 * WHAT IT DOES NOW (#90)
 *
 * It reads SHAPE. A ported session is not identifiable by its vocabulary — the
 * old contemplative deck and a real Nature Class lesson use much the same
 * words. It is identifiable by its structure: nothing goes in a child's hands,
 * and its clock was stamped rather than budgeted. Those are countable facts
 * about the JSON, they need no opinion about anybody's sentences, and they are
 * exactly what the word list could not see. #90 is the ticket; #91 and #89 are
 * the content behind it.
 *
 * The lexical seam below (RULES / CHILD_FACING_TYPES) is kept and still empty.
 * A rule may go there only if it can tell a science lesson from an assessment,
 * which in practice means it is not a word list.
 *
 * THE RULE THAT REPLACED THE BANS
 *
 * If something in this repo needs guarding, guard it by comparing against
 * source truth, not against a list of forbidden words. `verbatim-fidelity.mjs`
 * is what that looks like: it holds every founder-authored string to the row
 * it came from, byte for byte, and has no opinions of its own. The shape rules
 * below are the other legitimate kind: they assert nothing about words at all.
 *
 * SCOPE
 *
 * This check reads `packs/`, which holds two kinds of writing: sessions ported
 * from Johan's curriculum, and sessions an agent authored. A house style rule
 * governs the second and never the first. `scripts/authorship.mjs` makes that
 * mechanical — every finding here passes through `guard()`, which drops any
 * string present byte-for-byte in `fixtures/source-rows/`. Read that file
 * before adding any rule below.
 *
 * The shape rules are house-governed in a way worth stating plainly: a
 * session's PHASE BUDGET and its KIT LIST are assembly decisions made by
 * whoever built the pack JSON, not sentences Johan wrote. Their findings still
 * pass through `guard()` (the contract requires it), and the check asserts
 * afterwards that the guard dropped none of them — if provenance ever silently
 * switched off a shape rule, that is a bug, not a pass. The one shape rule
 * whose evidence IS an authored sentence, `generated-parent-line`, is guarded
 * for real: if Johan ever wrote that sentence, it is his and this file has no
 * opinion about it.
 *
 * WHY THERE IS AN EXCEPTION LIST AND WHY IT CAN ONLY SHRINK
 *
 * These rules are true of the product as it should be and false of the product
 * as it is: of the 56 sessions on disk, 32 have no make beat, 33 have a stamped
 * clock, and 32 never say what the class comes away with.
 * Turning them on unqualified would paint main red and block every unrelated
 * PR in the repo until the content is rewritten, which is #91's and #89's job
 * and not a lint's.
 *
 * So each known-bad session is named below with the ticket that will fix it —
 * the same move `scripts/validate-packs.mjs` makes with its shelf-collision
 * set. The difference between that and a comment is the RATCHET: this check
 * also fails when a listed session STOPS violating its rule, or when a listed
 * id no longer exists. The list cannot grow quietly and it cannot rot into
 * permanent cover; the only way to change it is to delete from it.
 *
 * A NEW session that violates any rule is not on the list, so it turns the
 * build red the moment it lands. That is the whole point.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { declareScope, HOUSE } from "./authorship.mjs";

const packsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "packs");

// Child-facing kinds — runner blocks spoken to the class, and the child-sheet
// blocks a child reads and works on. Excluded: teacher-note (addresses the
// adult), sheet-title and parent-line (structural / addressed to the parent).
const CHILD_FACING_TYPES = new Set([
  "say-aloud",
  "circle-question",
  "collage-zone",
  "match-strip",
  "notice-line",
]);

/**
 * Lexical rules applied to house-written child-facing copy.
 *
 * STILL EMPTY, and that is deliberate. Word bans are what this file was, and
 * they are why two of Johan's sessions sat out of the product for months. The
 * protection now lives in SHAPE_RULES below, which needs no vocabulary.
 *
 * A rule returns findings shaped `{ path, text, reason }`.
 */
const RULES = [];

// ---------------------------------------------------------------------------
// Shape rules (#90)
// ---------------------------------------------------------------------------

/**
 * The kit sentinel: an entry that declares the session needs nothing.
 *
 * `"None required"` is the literal value #90 names. The ported packs also
 * carry it with a note attached — `"None required, hands only"`, `"None
 * required, binoculars optional"`, `"None required, do not disturb sleeping
 * creatures"` — which is the same sentinel with a comma after it, so the
 * match is anchored at the start and stops at a word boundary.
 *
 * WHAT THIS DELIBERATELY DOES NOT CATCH: `"Warm clothes recommended"` and
 * `"Warm clothes and gloves recommended"` (autumn-w8, winter-w2, winter-w5,
 * winter-w7). Those name clothing, not something a child handles, so by the
 * spirit of #91 they are empty kits too — but "is this a real object" is a
 * judgement, and encoding it means a blocklist of near-misses, which is the
 * exact mechanism this file exists to have stopped using. Four sessions pass
 * this rule that a human reading #91 would fail. That is the honest cost of
 * refusing to hand-roll a second word list, and it is written here rather
 * than discovered later.
 */
const NO_KIT_SENTINEL = /^none required\b/i;

/**
 * The machine-generated parent line #115 stripped from all 40 ported sessions.
 * `{topic}` was the only slot, so the wildcard is the whole variable part.
 *
 * This is not a word list: it is one exact template, matched whole, against a
 * known machine artefact — the same kind of assertion `verbatim-fidelity.mjs`
 * makes, pointed at a generator's output instead of a source row. It cannot
 * fire on a sentence somebody wrote, because a sentence somebody wrote does
 * not happen to be this template end to end.
 *
 * Zero sessions match it today. It is here so #116's remaining generated
 * filler cannot be re-stamped onto a pack by the next generator that runs.
 */
const GENERATED_PARENT_LINE =
  /^for home: we went outside for .+ today\. ask me what i noticed\.$/i;

/** See the `budgeted-time` rule comment for why this is four and not three. */
const UNIFORM_PHASE_THRESHOLD = 4;

/**
 * The session's own account of what the class just did, or null if it has none.
 *
 * `celebration.headline` is the only part of the celebration `schema/pack.ts`
 * makes mandatory, and it is the part that carries the claim: "You just planted
 * wildflowers for pollinators", "Your class found next year lying on the
 * ground", "You met the neighbours". The keepsake beside it names what they are
 * holding — "A wing, a cup, a shell, a skin. Every one of them a plan." — but
 * the schema marks it optional, and a lint has no business requiring a field
 * the schema says a session may leave out.
 *
 * This reads presence, never wording. It cannot fire on a sentence somebody
 * wrote, because it never looks at one.
 */
function celebrationHeadline(session) {
  const celebration = session.celebration;
  if (!celebration || typeof celebration !== "object" || Array.isArray(celebration)) return null;
  const headline = typeof celebration.headline === "string" ? celebration.headline.trim() : "";
  return headline === "" ? null : headline;
}

/** Every block reachable from a session's BASE phases (not condition variants). */
function basePhaseBlocks(session) {
  return (session.phases ?? []).flatMap((phase) => phase.blocks ?? []);
}

/**
 * How this repo writes the number in a `session <N>` cross-reference.
 *
 * #1095's first pass held a hand-written table stopping at `twelve`, sized to
 * the longest pack on the shelf (`spring-term`, 12 weeks). That fits exactly
 * until a 13-week pack ships, and then the rule goes quiet on the very packs
 * long enough to lose track of their own weeks (#1145). So the number is
 * parsed rather than enumerated: any English cardinal below a hundred, in
 * words or in digits.
 *
 * Digits are covered for the same reason. No pack writes `session 2` today —
 * `grep -rnoiE "session [0-9]+" packs/` is empty across all ten — but nothing
 * stops the next author from doing so, and a drift guard that only sees one
 * spelling of the same sentence is a guard with a spelling-shaped hole.
 */
const CARDINAL_UNITS = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const CARDINAL_TEENS = [
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];
const CARDINAL_TENS = [
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

/** `"fourteen"` -> 14, `"twenty-one"` -> 21, `"14"` -> 14, or null. */
function cardinalValue(token) {
  const word = String(token).toLowerCase().trim();
  if (/^\d+$/.test(word)) return Number(word);
  const [tens, unit] = word.split(/[-\s]+/);
  const tensAt = CARDINAL_TENS.indexOf(tens);
  if (tensAt !== -1) {
    const base = (tensAt + 2) * 10;
    if (unit === undefined) return base;
    const unitAt = CARDINAL_UNITS.indexOf(unit);
    return unitAt === -1 ? null : base + unitAt + 1;
  }
  if (unit !== undefined) return null;
  const teenAt = CARDINAL_TEENS.indexOf(word);
  if (teenAt !== -1) return teenAt + 10;
  const unitAt = CARDINAL_UNITS.indexOf(word);
  return unitAt === -1 ? null : unitAt + 1;
}

const CARDINAL_PATTERN = [
  `(?:${CARDINAL_TENS.join("|")})(?:[-\\s](?:${CARDINAL_UNITS.join("|")}))?`,
  CARDINAL_TEENS.join("|"),
  CARDINAL_UNITS.join("|"),
  "\\d{1,3}",
].join("|");

const SESSION_NUMBER_RE = new RegExp(`\\bsession\\s+(${CARDINAL_PATTERN})\\b`, "gi");

/**
 * Determiners and possessives: the closed grammatical class that marks the
 * noun after it as a common noun inside a noun phrase, rather than a name.
 *
 * This is the discrimination between "the leaf masks from session two" (a
 * cross-reference: `session two` is the lesson's NAME, and names in English
 * are anarthrous — nobody writes "from the session two") and "Allow the
 * session two full afternoons" (a quantity: `the session` is the head noun
 * and `two` counts the afternoons that follow). #1145 filed the second as a
 * false positive.
 *
 * It matters that this is a closed class and not a list of phrases. A banned
 * phrase — "the session two full afternoons", say — would have to grow by one
 * entry every time a teacher wrote a new sentence, and each entry would be an
 * assertion about lesson content that this file has no business making.
 * Determiners are finite, they are function words, and no lesson anyone
 * writes can add one. The rule decides on grammar it can see, not on wording
 * it has been told to dislike.
 */
const DETERMINERS = new Set([
  "a",
  "an",
  "the",
  "this",
  "that",
  "these",
  "those",
  "each",
  "every",
  "any",
  "no",
  "another",
  "some",
  "either",
  "neither",
  "per",
  "my",
  "your",
  "our",
  "their",
  "its",
  "his",
  "her",
  "whose",
]);

/**
 * Function words that end a noun phrase looking backwards. Hitting one means
 * the `session` we are standing on starts its own phrase and is therefore
 * un-determined: "the leaf masks FROM session two" is a reference, even
 * though a determiner sits earlier in the sentence.
 */
const PHRASE_BOUNDARIES = new Set([
  "in",
  "on",
  "at",
  "from",
  "of",
  "to",
  "for",
  "with",
  "within",
  "into",
  "during",
  "after",
  "before",
  "since",
  "until",
  "by",
  "about",
  "against",
  "across",
  "through",
  "and",
  "or",
  "but",
  "if",
  "than",
  "as",
  "like",
  "unless",
  "while",
  "when",
]);

/**
 * Is this `session <N>` mention a reference to a lesson, rather than the word
 * "session" followed by a count of something else?
 *
 * Walks backwards from the mention over at most a short run of words, because
 * a determiner three words back with no boundary between it and `session`
 * ("the next whole session two full afternoons") still governs it. A
 * determiner reached before any boundary means the quantity reading; a
 * boundary, punctuation or the start of the string means the name reading.
 * Anything else defaults to the name reading, because the job of this rule is
 * to check references, and a check that abstains whenever it is unsure stops
 * being a check.
 */
function isSessionReference(text, matchIndex) {
  const before = text.slice(0, matchIndex);
  const tail = before.match(/[A-Za-z'’-]+(?:\s+[A-Za-z'’-]+){0,2}\s*$/);
  if (!tail) return true; // start of string, or punctuation immediately before
  if (!/[A-Za-z'’-]\s*$/.test(before)) return true; // punctuation closes the phrase
  const words = tail[0].trim().toLowerCase().split(/\s+/).reverse();
  for (const word of words) {
    if (DETERMINERS.has(word)) return false;
    if (PHRASE_BOUNDARIES.has(word)) return true;
  }
  return true;
}

/** A session id's week number, e.g. `garden-w7-winter-ready` -> 7, or null. */
function weekNumberOf(sessionId) {
  const match = /-w(\d+)(?:-|$)/.exec(typeof sessionId === "string" ? sessionId : "");
  return match ? Number(match[1]) : null;
}

/**
 * Every week number a live session id claims in the given pack file. Reads
 * the file fresh rather than trusting `loadSessions()`'s in-memory copy,
 * because the rule must see the pack exactly as it ships, not as some other
 * step in the same process may have already mutated a working copy of it.
 *
 * An EMPTY set is the answer for a pack that does not number its weeks at
 * all, and callers must read it as "no ground truth here", never as "this
 * pack ships no weeks" — see the rule below (#1145).
 */
function weekNumbersInFile(file) {
  const pack = JSON.parse(readFileSync(join(packsDir, file), "utf8"));
  const weeks = new Set();
  for (const session of pack.sessions ?? []) {
    const week = weekNumberOf(session.id);
    if (week !== null) weeks.add(week);
  }
  return weeks;
}

/** Every block anywhere in a session, condition variants and child sheet included. */
function allBlocks(session) {
  const out = [];
  const visit = (node) => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || typeof node !== "object") return;
    if (typeof node.type === "string") out.push(node);
    Object.values(node).forEach(visit);
  };
  visit(session);
  return out;
}

/**
 * A rule is `{ id, ticket, describe, check }`. `check` returns
 * `{ text, reason }` when the session violates it, or null.
 *
 * `text` is what the authorship guard judges provenance on. For the two
 * structural rules it is machine-formed evidence (a list of numbers, a kit
 * dump) that is not a sentence and cannot be a founder string; for
 * `generated-parent-line` it is the authored line itself, which is what makes
 * the guard load-bearing there.
 */
export const SHAPE_RULES = [
  {
    id: "make-beat",
    ticket: "#91",
    describe:
      "a session must put something in a child's hands: a `demo` block in a " +
      "base phase, or a kit that names at least one real object",
    check(session) {
      // Two accepted forms of evidence, because the repo authors the make beat
      // two ways and both are real. `autumn-starter` declares an explicit
      // `demo` block; `spring-term` w1/w3/w4 (seed bombs, natural paint, bird
      // feeders) have no `demo` block at all and instead carry a `Make` phase
      // plus a kit of clay, seeds, string and fruit.
      //
      // #90 proposes the `demo` clause alone. Measured against the 48 sessions
      // on disk that fails 44 of them, TWELVE of which do have a make beat and
      // name the kit for it. Grandfathering a false positive would freeze it
      // into the exception list forever, because the ratchet below would then
      // demand it keep failing. So the two probes #90 lists as separate rules
      // are one rule with two evidences here, which fails 32 and no others.
      //
      // A `demo` that exists only inside a `conditionVariants` phase does not
      // count: the base phases are what happens on an ordinary day.
      const hasDemo = basePhaseBlocks(session).some((b) => b?.type === "demo");
      if (hasDemo) return null;

      const kit = Array.isArray(session.kit) ? session.kit : [];
      const named = kit.filter(
        (entry) =>
          typeof entry === "string" &&
          entry.trim() !== "" &&
          !NO_KIT_SENTINEL.test(entry.trim())
      );
      if (named.length > 0) return null;

      return {
        text: `kit: ${JSON.stringify(kit)}`,
        reason:
          "no make beat: no `demo` block in any base phase, and the kit names " +
          `no object (${kit.length === 0 ? "kit is empty" : JSON.stringify(kit)})`,
      };
    },
  },
  {
    id: "named-outcome",
    ticket: "#91",
    describe:
      "a session must say what the class comes away with: a `demo` block in a " +
      "base phase, or a `celebration` headline naming what they did",
    check(session) {
      // THE THIRD EVIDENCE (#553).
      //
      // `make-beat` and `budgeted-time` each have a documented edge, and #553
      // constructed the shape that walks between them: a session copied from
      // `autumn-w1-return`, given THREE body phases at 8 minutes plus a circle
      // at 6, and `kit: ["Warm clothes recommended"]`. Three-at-8 is under
      // budgeted-time's threshold of four; a clothing kit is not the "None
      // required" sentinel. It is a Four Directions port a human would name on
      // sight, and before this rule nothing in the repo saw it.
      //
      // The two fixes that suggest themselves are both wrong, and #553 says so:
      // lowering the threshold to three breaks `summer-w1-counting-life`
      // (5/4/3/4/4), which is genuinely hand-budgeted, and would freeze that
      // false positive into the exception list forever; turning the kit
      // sentinel into a blocklist of near-miss phrases is the exact mechanism
      // #160 removed from this file. The gap needed a third thing a machine can
      // see, not a bigger list or a smaller number.
      //
      // WHY THIS IS THAT THING, AND NOT A FOURTH SPELLING OF THE FIRST TWO.
      // `make-beat` asks what the teacher BROUGHT: a demo block, or a kit
      // naming an object. Both are provisioning, and both are decided before
      // the lesson starts. This asks the same question from the far end — when
      // it is over, does the session say what this class now has? A Nature
      // Class session answers in one of two places. It SHOWS it: a `demo`
      // block, the move a child then makes. Or it SAYS it: the celebration
      // headline. The ported contemplative deck has neither, and cannot pick
      // one up by accident, because the deck it came from ends on a thank-you
      // rather than on a thing.
      //
      // MEASURED, this fails 32 of the 56 sessions on disk, and they are
      // exactly the 32 #91 names — all of autumn-term, all of winter-term, all
      // of summer-term (summer-legacy.json), and spring weeks 5 to 12, one
      // whole ported deck per season and nothing else. Every session #546
      // identified as a false positive of #90's literal rule 1 and that has a
      // real make beat passes unaided: spring w1/w3/w4 (seed bombs, natural
      // paint, bird feeders), summer w2/w3 (minibeasts, leaf collage) and the
      // three in autumn.json all carry a celebration. So do the four crafted
      // `autumn-starter` sessions, by their demo blocks.
      //
      // The four this rule adds over `make-beat` are the four #553 flags as
      // living in the gap today — `autumn-w8-the-last-warmth`, `winter-w2-ice`,
      // `winter-w5-breath`, `winter-w7-dark`, the clothing-kit sessions that
      // pass make-beat on a technicality and are held only by their stamped
      // clock. They are grandfathered below against #91, which is their real
      // debt, so that when #89 rebudgets their clock and their `budgeted-time`
      // entries come out, they are still held by the rule that describes what
      // is actually wrong with them, rather than passing everything with
      // nothing in a child's hands.
      //
      // WHAT IT DOES NOT DO. An author who bolts a celebration onto a hollow
      // session passes, exactly as one who bolts on an empty `demo` block
      // passes `make-beat`. This is not unfakeable; it is unfakeable BY
      // COPYING, which is the failure mode the ported packs are. It raises the
      // price of a port from editing two numbers and a kit string to writing,
      // in the session's own voice, the sentence that says what thirty children
      // are holding at the end — and that sentence cannot be written truthfully
      // about a session whose answer is nothing. It cannot be copied either:
      // `scripts/validate-packs.mjs` fails the build on a celebration line
      // shared by two sessions (#92, folded comparison), so the bolt-on has to
      // be original prose about this lesson. That is a different guard holding
      // a different fact, and it is worth knowing it is there. The gap is
      // pinned as a
      // recorded blind spot in `scripts/guard-mutation-check.mjs`
      // (`register-lint/named-outcome-bolted-on`) rather than left to be
      // rediscovered.
      const hasDemo = basePhaseBlocks(session).some((b) => b?.type === "demo");
      if (hasDemo) return null;
      if (celebrationHeadline(session) !== null) return null;

      const has = session.celebration !== undefined && session.celebration !== null;
      return {
        text: `demo blocks in base phases: 0; celebration: ${has ? "no headline" : "absent"}`,
        reason:
          "the session never says what the class comes away with: no `demo` block " +
          `in any base phase, and ${
            has ? "a `celebration` with no headline" : "no `celebration`"
          }`,
      };
    },
  },
  {
    id: "budgeted-time",
    ticket: "#89",
    describe: "no four phases in a session may carry an identical durationMin",
    check(session) {
      // "Phase durations must not be uniform" needs a number, and the number
      // has to survive two shapes that are NOT defects:
      //
      //   - a short session with two phases at the same length. Two equal
      //     halves is a budget, not a stamp.
      //   - `summer-w1-counting-life`, budgeted 5/4/3/4/4. Three fours out of
      //     five phases, and it is hand-budgeted: the first beat is longest,
      //     the third is shortest. A "three identical" threshold fails it.
      //
      // Four is the smallest threshold that clears both. It is also the shape
      // that actually went wrong: the Four Directions port stamps 8/8/8/8 on
      // its four body phases and leaves the closing circle at 6, so "every
      // phase identical" would fire on nothing at all. Threshold four fails 33
      // sessions — the 32 at 8/8/8/8 plus spring-w2 at 10/10/10/10 — and no
      // hand-budgeted session in the repo.
      //
      // Phases with no authored durationMin are not counted. Four packs ship
      // durations on none of their phases; that is a different defect and not
      // this rule's to name.
      const durations = (session.phases ?? [])
        .map((p) => p.durationMin)
        .filter((d) => typeof d === "number");

      const counts = new Map();
      for (const d of durations) counts.set(d, (counts.get(d) ?? 0) + 1);

      for (const [value, count] of counts) {
        if (count >= UNIFORM_PHASE_THRESHOLD) {
          return {
            text: `phase durations: ${durations.join(", ")}`,
            reason:
              `stamped clock: ${count} phases are all ${value} minutes ` +
              `(durations ${durations.join("/")}). A budgeted session spends ` +
              `its minutes where the lesson needs them`,
          };
        }
      }
      return null;
    },
  },
  {
    id: "generated-parent-line",
    ticket: "#116",
    describe:
      "a parent-line must not be the machine-generated template #115 stripped",
    check(session) {
      for (const block of allBlocks(session)) {
        if (block.type !== "parent-line") continue;
        const text = typeof block.text === "string" ? block.text.trim() : "";
        if (GENERATED_PARENT_LINE.test(text)) {
          return {
            text: block.text,
            reason:
              "parent line is the generated template " +
              '("For home: we went outside for {topic} today. Ask me what I ' +
              'noticed."), which says nothing about this lesson',
          };
        }
      }
      return null;
    },
  },
  {
    id: "stale-session-reference",
    ticket: "#1095",
    describe:
      'a session must not say "session <N>" unless a session with week N ' +
      "still exists in the same pack file — the phrase surviving a rename " +
      "or a retirement is how a kit line ends up asking a teacher to bring " +
      "leaf masks nobody in this pack ever makes (judged only in packs that " +
      "number their weeks)",
    check(session) {
      // #1095: `garden-w7-winter-ready` kept telling teachers to dig out
      // "the leaf masks from session two" a full pack revision after session
      // two (`garden-w2-leaf-masks`) moved out to `autumn-starter.json` and
      // took its materials with it. The phrase did not lie when it was
      // written; it lied the day the session it pointed at left. This rule
      // reads the one fact a machine can check without any opinion about
      // wording: does a session claiming that week number still ship here?
      //
      // Scoped to the pack file a reference lives in, not the whole
      // catalogue, because "session two" inside `autumn-garden.json` and
      // "session two" inside `autumn-term.json` name different lessons —
      // each pack numbers its own weeks.
      //
      // WHAT IT STILL DOES NOT SEE, deliberately, so the next reader does not
      // have to rediscover it: a reference by TITLE ("the leaf-mask week")
      // rather than by number, a reference across pack files, and a reference
      // whose week still ships but whose lesson has been rewritten into
      // something the sentence no longer describes. Those need an opinion
      // about wording; this rule has none, and that is why it holds zero
      // exceptions.
      const file = typeof session.__file === "string" ? session.__file : null;
      if (!file) return null;

      const strings = [];
      const { __file, ...rest } = session;
      collectStrings(rest, "$", strings);

      const weeks = weekNumbersInFile(file);
      // #1145: three of the ten packs — `autumn-starter`, `winter-starter`
      // and `settle` — carry no `-wN-` in any session id, so this set comes
      // back empty for them. An empty set cannot tell "this pack ships no
      // session for that week" apart from "this pack does not number its
      // weeks", and the rule was reading it as the first: ANY ordinal
      // reference in those three packs flagged, a correct one included.
      // `autumn-starter` is the pack the leaf-mask lesson MOVED INTO, so it
      // is exactly where someone writes a legitimate cross-reference next and
      // gets a red they cannot explain — and an unexplainable red is how a
      // guard earns its first exception and stops meaning anything.
      //
      // With no week numbering there is no fact to check against, so the rule
      // says nothing. The narrower alternative — abstain unless EVERY session
      // in the pack is numbered — was considered and rejected: it would
      // switch the rule off across a fully numbered pack the day one
      // unnumbered bonus session lands, which is silent loss of exactly the
      // cover #1095 bought. Positional fallback ("the third session in file
      // order") was also considered and not built: no reference on the shelf
      // needs it, and pack order is not a promise these files make.
      if (weeks.size === 0) return null;
      const stale = new Set();
      for (const { text } of strings) {
        if (typeof text !== "string") continue;
        SESSION_NUMBER_RE.lastIndex = 0;
        let match;
        while ((match = SESSION_NUMBER_RE.exec(text))) {
          if (!isSessionReference(text, match.index)) continue;
          const spelling = match[1].toLowerCase();
          const week = cardinalValue(spelling);
          if (week !== null && !weeks.has(week)) {
            stale.add(`"session ${spelling}" (week ${week})`);
          }
        }
      }
      if (stale.size === 0) return null;

      const named = [...stale].join(", ");
      return {
        text: named,
        reason:
          `refers to ${named}, but ${file} ships no session whose id names ` +
          `that week — the session it once pointed at moved or was retired, ` +
          `and the reference needs updating to what the class actually has`,
      };
    },
  },
];

/**
 * KNOWN-BAD SESSIONS, BY RULE, EACH WITH THE TICKET THAT WILL FIX IT.
 *
 * Measured against packs/ as it stands, not guessed. Every id here fails its
 * rule TODAY; the ratchet in `auditGrandfathered()` fails the build the moment
 * one of them stops failing, or the moment an id here stops existing. Nothing
 * may be added to this list to make a new session pass — a new session that
 * needs an entry here is a session that should not have shipped.
 *
 * make-beat → #91 "The ported sessions have no make beat: nothing goes in a
 * child's hands". #91 scopes itself to autumn-term, winter-term, summer-term
 * and spring w5–w12. Four sessions here sit outside that scope and are the
 * same defect: `autumn-w2-why-leaves-turn`, `spring-w2-wildflower-
 * investigation`, `summer-w1-counting-life` and
 * `summer-w4-our-earths-magnificent-trees` — all four ship an empty kit, and
 * the last three are ON the season shelf, so they are what a teacher prints
 * today. They are filed against #91 because it is the ticket for this defect;
 * whoever picks it up should know its real reach is 32, not 30.
 *
 * named-outcome → #91 as well, and its 32 are #91's own scope read back
 * exactly: all of autumn-term, all of winter-term, all of summer-term
 * (summer-legacy.json) and spring weeks 5 to 12. It overlaps make-beat's list
 * on 28 and differs on eight, which is the point of having both. The four it
 * adds are the clothing-kit sessions #553 found living in the gap —
 * `autumn-w8-the-last-warmth`, `winter-w2-ice`, `winter-w5-breath`,
 * `winter-w7-dark` — held today only by their stamped clock; the four it drops
 * (`autumn-w2-why-leaves-turn`, `spring-w2-wildflower-investigation`,
 * `summer-w1-counting-life`, `summer-w4-our-earths-magnificent-trees`) ship an
 * empty kit but do name what the class did, so make-beat holds them alone.
 *
 * A session #91 fixes by adding a kit and nothing else will delete its
 * make-beat entry and keep its named-outcome one. That is correct: a lesson
 * that hands out materials and still never says what the class comes away with
 * is half-ported, and the list should say so until it is not.
 *
 * budgeted-time → #89 "Strip the Four Directions phase keys out of the ported
 * packs", which counts the same phases and names them "all uniformly 8/8/8/8
 * minutes". `spring-w2-wildflower-investigation` is the one sibling stamped
 * 10/10/10/10 rather than 8/8/8/8 — the same stamp with a different number,
 * and it is on the shelf.
 *
 * generated-parent-line has no entries: #115 already removed every instance.
 * The rule is preventive, and an empty exception list is what a rule that
 * holds looks like.
 *
 * stale-session-reference has no entries either: #1095 fixed the one session
 * that failed it (`garden-w7-winter-ready`, three references to session two)
 * in the same PR that added the rule, and it is the only "session <N>"
 * mention on disk that has ever gone stale.
 */
export const GRANDFATHERED = {
  "make-beat": {
    "autumn-w1-return": "#91",
    "autumn-w2-wind": "#91",
    "autumn-w3-falling": "#91",
    "autumn-w4-soil": "#91",
    "autumn-w5-colours": "#91",
    "autumn-w6-quiet": "#91",
    "autumn-w7-bulbs": "#91",
    "autumn-w2-why-leaves-turn": "#91",
    "spring-w2-wildflower-investigation": "#91",
    "spring-w5-first-signs": "#91",
    "spring-w6-underground": "#91",
    "spring-w7-blossom": "#91",
    "spring-w8-the-builders": "#91",
    "spring-w9-rain": "#91",
    "spring-w10-green": "#91",
    "spring-w11-seeds": "#91",
    "spring-w12-gratitude-walk": "#91",
    "summer-w1-warmth": "#91",
    "summer-w2-the-pollinators": "#91",
    "summer-w3-shade": "#91",
    "summer-w4-smell": "#91",
    "summer-w5-food": "#91",
    "summer-w6-flowers": "#91",
    "summer-w7-long-day": "#91",
    "summer-w8-abundance": "#91",
    "summer-w1-counting-life": "#91",
    "summer-w4-our-earths-magnificent-trees": "#91",
    "winter-w1-bare": "#91",
    "winter-w3-birds": "#91",
    "winter-w4-hibernation": "#91",
    "winter-w6-footprints": "#91",
    "winter-w8-promise": "#91",
  },
  "named-outcome": {
    "autumn-w1-return": "#91",
    "autumn-w2-wind": "#91",
    "autumn-w3-falling": "#91",
    "autumn-w4-soil": "#91",
    "autumn-w5-colours": "#91",
    "autumn-w6-quiet": "#91",
    "autumn-w7-bulbs": "#91",
    "autumn-w8-the-last-warmth": "#91",
    "spring-w5-first-signs": "#91",
    "spring-w6-underground": "#91",
    "spring-w7-blossom": "#91",
    "spring-w8-the-builders": "#91",
    "spring-w9-rain": "#91",
    "spring-w10-green": "#91",
    "spring-w11-seeds": "#91",
    "spring-w12-gratitude-walk": "#91",
    "summer-w1-warmth": "#91",
    "summer-w2-the-pollinators": "#91",
    "summer-w3-shade": "#91",
    "summer-w4-smell": "#91",
    "summer-w5-food": "#91",
    "summer-w6-flowers": "#91",
    "summer-w7-long-day": "#91",
    "summer-w8-abundance": "#91",
    "winter-w1-bare": "#91",
    "winter-w2-ice": "#91",
    "winter-w3-birds": "#91",
    "winter-w4-hibernation": "#91",
    "winter-w5-breath": "#91",
    "winter-w6-footprints": "#91",
    "winter-w7-dark": "#91",
    "winter-w8-promise": "#91",
  },
  "budgeted-time": {
    "autumn-w1-return": "#89",
    "autumn-w2-wind": "#89",
    "autumn-w3-falling": "#89",
    "autumn-w4-soil": "#89",
    "autumn-w5-colours": "#89",
    "autumn-w6-quiet": "#89",
    "autumn-w7-bulbs": "#89",
    "autumn-w8-the-last-warmth": "#89",
    "spring-w2-wildflower-investigation": "#89",
    "spring-w5-first-signs": "#89",
    "spring-w6-underground": "#89",
    "spring-w7-blossom": "#89",
    "spring-w8-the-builders": "#89",
    "spring-w9-rain": "#89",
    "spring-w10-green": "#89",
    "spring-w11-seeds": "#89",
    "spring-w12-gratitude-walk": "#89",
    "summer-w1-warmth": "#89",
    "summer-w2-the-pollinators": "#89",
    "summer-w3-shade": "#89",
    "summer-w4-smell": "#89",
    "summer-w5-food": "#89",
    "summer-w6-flowers": "#89",
    "summer-w7-long-day": "#89",
    "summer-w8-abundance": "#89",
    "winter-w1-bare": "#89",
    "winter-w2-ice": "#89",
    "winter-w3-birds": "#89",
    "winter-w4-hibernation": "#89",
    "winter-w5-breath": "#89",
    "winter-w6-footprints": "#89",
    "winter-w7-dark": "#89",
    "winter-w8-promise": "#89",
  },
  "generated-parent-line": {},
  "stale-session-reference": {},
};

/** Run every shape rule over one session. Returns `{ rule, ticket, text, reason }[]`. */
export function shapeFindings(session) {
  const out = [];
  for (const rule of SHAPE_RULES) {
    const hit = rule.check(session);
    if (hit) out.push({ rule: rule.id, ticket: rule.ticket, ...hit });
  }
  return out;
}

/**
 * THE RATCHET. Given every session on disk, report the exception entries that
 * have stopped earning their place. Two ways that happens:
 *
 *   fixed   the session no longer violates the rule. Good news, and the entry
 *           must come out in the same PR or the list starts to describe a
 *           product that no longer exists.
 *   absent  the id is not in packs/ any more. A renamed or deleted session
 *           leaves cover behind that a future session could inherit by name.
 *
 * Either fails the build. This is the difference between an exception list and
 * a comment: a comment survives being wrong.
 */
export function auditGrandfathered(sessions) {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const stale = [];

  for (const rule of SHAPE_RULES) {
    const entries = GRANDFATHERED[rule.id] ?? {};
    for (const [id, ticket] of Object.entries(entries)) {
      const session = byId.get(id);
      if (!session) {
        stale.push({
          rule: rule.id,
          session: id,
          ticket,
          why: "no session with this id exists in packs/ any more",
        });
        continue;
      }
      if (!rule.check(session)) {
        stale.push({
          rule: rule.id,
          session: id,
          ticket,
          why: `it satisfies \`${rule.id}\` now — delete this entry (${ticket})`,
        });
      }
    }
  }
  return stale;
}

// ---------------------------------------------------------------------------
// Lexical pass (unchanged; RULES is empty)
// ---------------------------------------------------------------------------

// Collect every string reachable from a child-facing block (text,
// abilityVariants, etc.) so variants get the same bar as the base line.
function collectStrings(value, path, out) {
  if (typeof value === "string") {
    out.push({ path, text: value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (k === "type") continue;
      collectStrings(v, `${path}.${k}`, out);
    }
  }
}

function walk(node, path, findings, file) {
  if (Array.isArray(node)) {
    node.forEach((v, i) => walk(v, `${path}[${i}]`, findings, file));
    return;
  }
  if (!node || typeof node !== "object") return;

  if (typeof node.type === "string" && CHILD_FACING_TYPES.has(node.type)) {
    const strings = [];
    collectStrings(node, path, strings);
    for (const { path: p, text } of strings) {
      for (const rule of RULES) {
        const reason = rule(text);
        if (reason) findings.push({ file, path: p, text, reason });
      }
    }
    return; // block scanned; no nested blocks inside a block
  }

  for (const [k, v] of Object.entries(node)) {
    walk(v, `${path}.${k}`, findings, file);
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Every session on disk, with the file it came from.
 *
 * `packs/settle.json` is not a pack — it is the shared settling phase, and it
 * has no `sessions`, so it contributes none. `packs/bioregion/` is a directory
 * and never matched the `.json` filter.
 */
export function loadSessions() {
  const out = [];
  for (const file of readdirSync(packsDir).filter((f) => f.endsWith(".json"))) {
    const pack = JSON.parse(readFileSync(join(packsDir, file), "utf8"));
    for (const session of pack.sessions ?? []) out.push({ ...session, __file: file });
  }
  return out;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const scope = declareScope({
    script: "scripts/register-lint.mjs",
    reads: ["packs"],
    governs: HOUSE,
    guardsFounderText: true,
  });

  const files = readdirSync(packsDir).filter((f) => f.endsWith(".json"));
  const raw = [];
  let blocksScanned = 0;

  for (const file of files) {
    const pack = JSON.parse(readFileSync(join(packsDir, file), "utf8"));
    walk(pack, "$", raw, file);
    const serialised = JSON.stringify(pack);
    for (const t of CHILD_FACING_TYPES) {
      blocksScanned += serialised.split(`"${t}"`).length - 1;
    }
  }

  const sessions = loadSessions();
  let grandfathered = 0;

  for (const session of sessions) {
    for (const finding of shapeFindings(session)) {
      const exempt = GRANDFATHERED[finding.rule]?.[session.id];
      if (exempt) {
        grandfathered += 1;
        continue;
      }
      raw.push({
        file: session.__file,
        path: `$.sessions[${JSON.stringify(session.id)}]`,
        text: finding.text,
        reason: `[${finding.rule}] ${finding.reason}`,
        shape: true,
      });
    }
  }

  // Provenance, not judgement: anything Johan wrote leaves here unexamined.
  const findings = scope.guard(raw);

  // A shape finding is about pack assembly, never about a sentence, so the
  // guard must never drop one. If it ever does, provenance has silently
  // switched off a structural rule and the pass below would be a lie.
  const droppedShape = scope.skippedFindings().filter((f) => f.shape);
  if (droppedShape.length > 0) {
    console.error(
      `Register lint ABORTED: the authorship guard dropped ${droppedShape.length} ` +
        `SHAPE finding(s). Shape evidence is machine-formed and cannot be founder ` +
        `text; a collision here means the evidence format needs changing, not that ` +
        `the rule should be skipped.`
    );
    for (const f of droppedShape) console.error(`  - ${f.file}: ${f.reason}`);
    process.exit(1);
  }

  const stale = auditGrandfathered(sessions);

  if (findings.length > 0 || stale.length > 0) {
    if (findings.length > 0) {
      console.error(`Register lint FAILED. ${findings.length} finding(s):`);
      for (const f of findings) {
        console.error(`  - ${f.file} at ${f.path}: ${f.reason}`);
        console.error(`      ${f.text.slice(0, 120)}${f.text.length > 120 ? "…" : ""}`);
      }
    }
    if (stale.length > 0) {
      console.error(
        `Register lint FAILED. ${stale.length} stale exception(s) in GRANDFATHERED ` +
          `— the list may only shrink:`
      );
      for (const s of stale) {
        console.error(`  - [${s.rule}] "${s.session}": ${s.why}`);
      }
      console.error(
        `  Delete the entr${stale.length === 1 ? "y" : "ies"} above from ` +
          `GRANDFATHERED in scripts/register-lint.mjs, in the same PR that fixed ` +
          `the session. An exception that no longer describes anything is cover.`
      );
    }
    process.exit(1);
  }

  console.log(
    `Register lint: ${SHAPE_RULES.length} shape rule(s) over ${sessions.length} ` +
      `session(s) in ${files.length} pack file(s); ${blocksScanned} child-facing ` +
      `block(s) read for the lexical pass (no lexical rules, by design); ` +
      `${scope.scopeLine()}.`
  );
  console.log(
    `  ${grandfathered} known violation(s) held by named exception (#91 make beat and ` +
      `named outcome, #89 stamped clock). The list is a ratchet: it fails if any ` +
      `listed session stops violating its rule, so it can only shrink.`
  );
  for (const rule of SHAPE_RULES) {
    const held = Object.keys(GRANDFATHERED[rule.id] ?? {}).length;
    console.log(`  - ${rule.id}: ${rule.describe} (${held} held)`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main();
}

/**
 * WHERE THIS STANDS
 *
 * #160 proposed deleting this file and its CI step, on the grounds that a
 * green check asserting nothing is worse than no check. That was correct while
 * RULES was empty. It no longer describes this file: four shape rules run on
 * every push, 97 known violations are named against the tickets that will fix
 * them, and the exception list fails the build if it stops being true. #160
 * should be closed against #90 rather than acted on.
 *
 * What this file still does NOT assert: anything about vocabulary. If a future
 * session is written in the wrong register but has a make beat, a real kit, a
 * named outcome and a budgeted clock, this check passes it. That is the
 * correct trade. The last
 * time an agent tried to catch register with a word list it cost two of
 * Johan's sessions and several months, and the shape rules exist because shape
 * is the part a machine can actually see.
 */

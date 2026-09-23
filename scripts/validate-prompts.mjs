/**
 * validate-prompts.mjs -- the prompt files, checked the way packs are.
 *
 * Mirrors scripts/validate-packs.mjs: authored content gets a validator that
 * runs before anyone can ship it, so a bad file fails a check instead of a
 * teacher's request.
 *
 *   npm run validate:prompts
 *
 * Also writes/checks prompts/lockfile.json, which pins each prompt's version
 * to the sha256 of its composed body. That is what makes "bump the version
 * when the text changes" enforceable rather than a request in a comment: the
 * version is the only thing a trace has to identify the text that ran, so a
 * silent edit at the same version makes every past trace a lie about what
 * produced it.
 *
 *   npm run validate:prompts -- --write   regenerate the lockfile
 *
 * #549 added two guards that read the text rather than hashing it. The
 * lockfile is a tripwire, not a reader: it proves an edit happened and forces
 * a version bump, and it was perfectly in step on the commit that broke the
 * house voice. What it cannot see is what the text now MEANS.
 *
 *   Guard 1 - required context keys. A prompt declares in its frontmatter
 *   which shared context fields it is guaranteed (`context: [topic,
 *   objective]`). Its text may not point at any other one. See
 *   `contextDeixis` below.
 *
 *   Guard 2 - contained-phrase contracts. A shared fragment reached by more
 *   than one prompt declares the promises it makes, in prompts/contracts.json,
 *   and must still keep them after any edit. See `missingContracts` below.
 *
 * The pure halves of both guards are exported so tests/unit/prompt-contracts
 * can watch them bite, rather than trusting that a green run means anything.
 * The script's own body runs only when it is the process entry point.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The registry itself, not a regex over its source. This script read
// `PROMPT_FILES` with a pattern that required a trailing comma on every entry,
// so a prompt added as the LAST property without one — valid TypeScript — was
// silently absent from the table. It was not wrong in practice only because
// the unnamed-file sweep further down happened to notice the dropped prompt
// from the other side, which is two checks overlapping by accident rather than
// a design, and stops being true after an ordinary refactor of either half
// (#1220). The same move #1218 made on `eval-coverage-lint.mjs`: the script
// therefore runs under tsx, like `validate:packs` does.
import { PROMPT_FILES } from "../lib/ai/prompt-registry.ts";

const root = process.cwd();
const dir = path.join(root, "prompts");
const lockPath = path.join(dir, "lockfile.json");
const contractsPath = path.join(dir, "contracts.json");
const write = process.argv.includes("--write");

/* ------------------------------------------------------------------ *
 * Guard 1 - required context keys.
 * ------------------------------------------------------------------ */

/**
 * The shared context fields a prompt can be TOLD. Mirrors CONTEXT_FIELDS in
 * lib/ai/prompts.ts, which is where the lines are actually composed. The two
 * lists are held together by an assertion in tests/unit/prompt-contracts.spec.ts
 * rather than by hope: add a context line there without adding its key here and
 * that suite fails. This file now runs under tsx and so CAN import TypeScript
 * (#1220) — collapsing this second list into an import of CONTEXT_FIELDS is a
 * real follow-up, and deliberately not done here, because that list is consumed
 * by the deixis guard below in a shape the composer does not export.
 */
export const CONTEXT_KEYS = ["topic", "objective", "class"];

/**
 * The nouns each key is spoken as, in prompt prose. Not the field names: a
 * prompt says "the class" and "the purpose", never "ageBand".
 */
const CONTEXT_NOUNS = {
  topic: ["topic", "theme"],
  objective: ["objective", "aim", "purpose", "learning intention"],
  class: ["class", "age band", "ageband", "year group", "age group", "cohort", "ability band"],
};

/**
 * The keys whose nouns name PEOPLE, and so can be the subject of a verb. Only
 * `class` is: a cohort can describe something, a topic cannot. Used by
 * `pointsAfter` to decide whether a clause-final `-ed` word is a pointer or an
 * ordinary past tense.
 */
const ANIMATE_KEYS = new Set(["class"]);

/**
 * DEIXIS, not the noun. This is the whole reason the guard is usable.
 *
 * "a line that tells the class what to FIND" and "one warm sentence a teacher
 * says aloud to her class" are ordinary prose about the audience, and every
 * read-aloud prompt in this repo is full of them. Flagging the bare noun would
 * have turned six prompts red on day one and the guard would have been deleted
 * within a week.
 *
 * What broke #538 was not the word "class". It was POINTING: "the class YOU
 * ARE TOLD ABOUT". A pointing phrase is a claim that the answer is somewhere
 * in the message, and that claim is either true or it is an instruction the
 * model cannot follow. So the guard matches a context noun bound, within at
 * most two intervening words, to a phrase that points at the message.
 *
 * Both directions, because English puts the pointer on either side:
 * "the class you are told about", "today's topic".
 */
/**
 * What a pointer claims was DONE to the field it names: handed over, or set
 * out somewhere the model can look. These never point on their own — they
 * point in the constructions assembled below.
 */
const HANDED =
  "(?:told|given|shown|written|sent|handed|passed|provided|supplied|attached|" +
  "named|stated|specified|described|chosen|listed|mentioned|set out)";

/**
 * The subset of those that CANNOT also be a simple past tense. English spells
 * the passive participle and the past tense the same for every regular verb,
 * so "the class described" is either "the class [that was] described [to you]"
 * — a pointer — or "the species the class described" — the class doing the
 * describing. No regex separates those. These four are the forms where the
 * past tense is a different word (gave, showed, chose, wrote), so the pointing
 * reading is the only reading available. See TERMINAL below for why that
 * matters.
 */
const PARTICIPLE_ONLY = "(?:given|shown|chosen|written)";

/**
 * The words a prompt uses for the message itself. `(?!\s+of)` because "in this
 * context of ours" is ordinary English, not deixis.
 *
 * Every one of these also has an innocent in-domain meaning — a text is
 * something the class reads, a section is part of a pack, a brief is what the
 * head wrote — so the word alone proves nothing. What makes it deixis is a
 * DEMONSTRATIVE ("in this message") or a POSITION ("in the context above").
 * "Set the topic in the text the children will read" has neither and is not
 * pointing at anything the caller must supply. Both required forms carry one
 * of the two cues, so requiring a cue costs nothing and closes nine lines.
 */
const CONTAINER = "(?:message|context|prompt|text|brief|instructions?|section|input)(?!\\s+of\\b)";
const IN_THE_MESSAGE =
  `(?:in|from) (?:(?:this|that) ${CONTAINER}|the ${CONTAINER}\\s+(?:above|below))`;

/**
 * Nothing but punctuation, a line break, or the end of the text follows.
 *
 * This is the whole of #608's item 1, and it is one rule rather than two. Bare
 * `above`/`below` used to be listed as pointers outright, which flagged "never
 * put the aim above the safety of the class" — a comparative preposition, not
 * a location. What separates the two readings is not the word, it is whether
 * anything follows: a preposition takes a complement ("above the safety",
 * "below two sentences"), and deixis does not ("serve the purpose below").
 *
 * The same test settles the past participles of item 2. "Write for the year
 * group given" ends on its participle because the rest of the clause — "given
 * to you" — is the part being left out, which is exactly what makes it a
 * pointer. "The age group given the most freedom" keeps its complement and is
 * ordinary prose.
 */
const TERMINAL = "(?=[^\\S\\n]*(?:[.,;:!?)\\]\"'”’]|\\n|$))";

/**
 * The pointing constructions that SPELL OUT their pointing, and so may sit a
 * word or two away from the noun ("the class, as you were told").
 *
 * Only the explicitly passive forms qualify. They name the model as the
 * RECIPIENT, so a word landing in the gap cannot turn them active the way it
 * can with a bare participle — which is why these two keep the filler window
 * and everything below lost it.
 */
function pointsAfter() {
  return [
    `you (?:are|were|have been) ${HANDED}`,
    `${HANDED} to you`,
  ];
}

/**
 * The ELLIPTICAL pointers, which must touch the noun. Nothing may intervene.
 *
 * "The year group given" points because the rest of it — "given TO YOU" — has
 * been left out, and a reduced relative leaves out everything between the noun
 * and the participle. That ellipsis is not a detail of the phrasing, it IS the
 * construction. So any word surviving in that slot is by definition not elided
 * material: it is a subject ("the purpose you stated", "the topic the teacher
 * named") or an auxiliary ("the purpose is stated"), and each of those makes
 * the clause an ordinary active or main-clause passive rather than a pointer
 * at something the model was handed. #608's first head shared the two-word
 * FILLER window across every alternative and flagged all four of those. The
 * fix is not a smaller window, it is no window: adjacency is what the
 * construction means.
 *
 * `animate` is the class key. A class, a cohort, a year group can be the
 * SUBJECT of "described", "named", "stated"; a topic cannot. That is a
 * different way to acquire a subject — from the context noun itself rather
 * than from an intervening word — so it needs its own answer: after an animate
 * noun only the forms that cannot also be a past tense count. Hence "note the
 * species the class described" stays green while "keep to the topic stated"
 * does not.
 *
 * Animacy governs bare `above`/`below` for a second reason: cohorts come in
 * ordered sequences, so "the year group above" is the year above, not the year
 * group named earlier in the message. Fields have no such sequence, so "serve
 * the purpose below" can only be locational.
 *
 * Both narrowings cost real catches — "match the cohort handed", "write for
 * the class above" — and both are taken deliberately. A guard that cries wolf
 * on ordinary prose gets deleted; a guard that misses one phrasing does not.
 */
function pointsAfterAdjacent(animate) {
  return [
    // "the year group named above", "the theme given below" — but not "the
    // topic you listed above", which is the model's own earlier output.
    `${HANDED}\\s+(?:above|below)`,
    // "the class described in this message", "the class in the message above".
    // The optional participle is the reduced relative's own — "the class [that
    // was] described in this message" — and it is the ONLY thing that may
    // stand there. A subject in that gap ("the topic you wrote in this
    // message") is the model's own output, not something it was handed.
    `(?:${HANDED}\\s+)?${IN_THE_MESSAGE}`,
    // "keep to the topic stated", "write for the year group given"
    `${animate ? PARTICIPLE_ONLY : HANDED}${TERMINAL}`,
    // "serve the purpose below" — but not "keep the topic below two sentences"
    ...(animate ? [] : [`(?:above|below)${TERMINAL}`]),
  ];
}

const POINTS_BEFORE = [
  "today's",
  "the given",
  "the stated",
  "the named",
  "the chosen",
  "the supplied",
  "the specified",
  "the provided",
  "the session's",
];

const FILLER = "(?:\\s+[a-z'’]+){0,2}";

function pointingPatterns(noun, animate) {
  const n = noun.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return [
    new RegExp(`\\b${n}\\b${FILLER}\\s+(?:${pointsAfter().join("|")})\\b`, "gi"),
    new RegExp(`\\b${n}\\b\\s+(?:${pointsAfterAdjacent(animate).join("|")})\\b`, "gi"),
    new RegExp(`(?:${POINTS_BEFORE.join("|")})${FILLER}\\s+\\b${n}\\b`, "gi"),
  ];
}

/**
 * Every place `text` points at a shared context field, as
 * `[{ key, phrase }]`. Pure, exported, and the thing a test can watch.
 */
export function contextDeixis(text) {
  const found = [];
  const seen = new Set();
  for (const key of CONTEXT_KEYS) {
    for (const noun of CONTEXT_NOUNS[key]) {
      for (const re of pointingPatterns(noun, ANIMATE_KEYS.has(key))) {
        for (const m of text.matchAll(re)) {
          const phrase = m[0].replace(/\s+/g, " ").trim();
          const id = `${key} ${phrase.toLowerCase()}`;
          if (seen.has(id)) continue;
          seen.add(id);
          found.push({ key, phrase });
        }
      }
    }
  }
  return found;
}

/**
 * The keys a prompt's text points at but is not guaranteed, as
 * `[{ key, phrase }]`. `declared` is the prompt's own `context:` frontmatter.
 */
export function unsupportedDeixis(text, declared) {
  const have = new Set(declared);
  return contextDeixis(text).filter((hit) => !have.has(hit.key));
}

/* ------------------------------------------------------------------ *
 * Guard 2 - contained-phrase contracts.
 * ------------------------------------------------------------------ */

/**
 * The promises in `requirements` that `text` does not keep, by name.
 *
 * A requirement is kept when ANY of its `anyOf` shapes matches. Each shape is
 * a within-sentence binding of two ideas rather than a sentence to preserve,
 * which is what lets the house voice be reworded without going red while still
 * refusing to be satisfied by a leftover keyword.
 */
export function missingContracts(text, requirements) {
  return requirements.filter(
    (req) => !req.anyOf.some((source) => new RegExp(source, "i").test(text))
  );
}

/* ------------------------------------------------------------------ *
 * The check itself.
 * ------------------------------------------------------------------ */

/**
 * The prompts the registry names, in the order it names them — read from the
 * exported object, so a prompt exists here on exactly the terms it exists for
 * the app. No syntax of the file (a trailing comma, a line break, a comment
 * between entries) can hide one from this check.
 *
 * Exported for the same reason the guards below are: so a test can watch it
 * see a prompt the old regex dropped, rather than trusting a green run.
 */
export function registryEntries() {
  return Object.entries(PROMPT_FILES).map(([id, file]) => ({ id, file }));
}

function main() {
  const ids = registryEntries();

  const problems = [];
  const lock = {};
  /** fragment name -> every prompt it is composed into, with that prompt's composed text. */
  const composedBy = new Map();

  if (ids.length === 0) problems.push("no prompts found in PROMPT_FILES");

  for (const { id, file } of ids) {
    const full = path.join(dir, file);
    if (!existsSync(full)) {
      problems.push(`${id}: PROMPT_FILES names ${file}, which does not exist`);
      continue;
    }
    const raw = readFileSync(full, "utf8");
    const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(raw);
    if (!m) {
      problems.push(`${id}: no frontmatter`);
      continue;
    }
    const head = m[1];
    const rawBody = m[2].replace(/\n+$/, "");

    // Hash what the MODEL is given, not what the file literally holds. The
    // registry expands {{> fragment}} before composing and the push script
    // expands it before publishing, so hashing the raw body let the entire
    // contents of prompts/_shared/house-rules.md be replaced with junk while
    // this script reported "lockfile in step" — and that paragraph opens two
    // prompts. A lock that cannot see the text is decoration.
    const reached = [];
    const included = [];
    const body = rawBody.replace(/\{\{>\s*([a-z][a-z0-9-]*)\s*\}\}/g, (_w, name) => {
      const f = path.join(dir, "_shared", `${name}.md`);
      if (!existsSync(f)) return _w;
      reached.push(name);
      included.push(name);
      return readFileSync(f, "utf8").replace(/\n+$/, "");
    });
    for (const name of new Set(included)) {
      composedBy.set(name, [...(composedBy.get(name) ?? []), { id, body }]);
    }

    // Sections are prompt text too — the ten lesson-support task rules reach the
    // model through loadSections, so they are part of what this version means
    // even though they never appear in the body.
    for (const name of (/^sections:\s*(\S+)$/m.exec(head)?.[1] ?? "").split(",").map((x) => x.trim()).filter(Boolean)) {
      const f = path.join(dir, "_shared", `${name}.md`);
      if (!existsSync(f)) { problems.push(`${id}: declares sections "${name}", which has no file`); continue; }
      reached.push(name);
    }

    const declaredId = /^id:\s*(\S+)$/m.exec(head)?.[1];
    if (declaredId !== id) problems.push(`${id}: frontmatter says id "${declaredId}"`);

    const version = Number(/^version:\s*(\S+)$/m.exec(head)?.[1]);
    // Langfuse rejects promptVersion 0 with a 400 nested inside a 207, which is
    // invisible unless something reads the batch results.
    if (!Number.isInteger(version) || version < 1) {
      problems.push(`${id}: version must be an integer >= 1`);
    }

    // GUARD 1 - the prompt's text may only point at context it is guaranteed.
    //
    // `context:` is required rather than optional, so a new prompt cannot skip
    // the question, and an empty list is a real answer ("this prompt is told
    // none of the shared fields"). Declaring FEWER keys than the callers pass
    // is allowed and only makes the guard stricter; declaring more than they
    // pass is the failure this whole ticket is about, and that direction is
    // caught by tests/unit/prompt-contracts.spec.ts, which builds each prompt
    // from its real callers' argument shapes.
    const contextLine = /^context:\s*\[(.*)\]$/m.exec(head);
    if (!contextLine) {
      problems.push(
        `${id}: no "context:" in frontmatter. List the shared context keys every caller supplies, ` +
          `or "context: []" if it is told none. Known keys: ${CONTEXT_KEYS.join(", ")}.`
      );
    } else {
      const ctx = contextLine[1].split(",").map((v) => v.trim()).filter(Boolean);
      for (const key of ctx) {
        if (!CONTEXT_KEYS.includes(key)) {
          problems.push(`${id}: declares context "${key}", which is not one of ${CONTEXT_KEYS.join(", ")}`);
        }
      }
      for (const { key, phrase } of unsupportedDeixis(body, ctx)) {
        problems.push(
          `${id}: its text points at the ${key} ("${phrase}") but "${key}" is not in its context: ` +
            `[${ctx.join(", ")}]. Either stop pointing at it, or make every caller supply it and ` +
            `declare it. A prompt told to consult something it is never given is an instruction ` +
            `the model cannot follow.`
        );
      }
    }

    const declared = new Set(
      (/^vars:\s*\[(.*)\]$/m.exec(head)?.[1] ?? "")
        .split(",").map((v) => v.trim()).filter(Boolean)
    );
    const used = new Set([...body.matchAll(/\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g)].map((x) => x[1]));
    for (const v of used) if (!declared.has(v)) problems.push(`${id}: uses {{${v}}} but does not declare it`);
    for (const v of declared) if (!used.has(v)) problems.push(`${id}: declares ${v} but never uses it`);

    for (const inc of body.matchAll(/\{\{>\s*([a-z][a-z0-9-]*)\s*\}\}/g)) {
      if (!existsSync(path.join(dir, "_shared", `${inc[1]}.md`))) {
        problems.push(`${id}: includes "${inc[1]}", which has no file in prompts/_shared`);
      }
    }

    // The reached fragments are folded in by name and content, sorted, so the
    // sha changes when any of them changes.
    const h = createHash("sha256").update(body);
    for (const name of [...new Set(reached)].sort()) {
      h.update(`\u0000${name}\u0000`);
      h.update(readFileSync(path.join(dir, "_shared", `${name}.md`), "utf8").replace(/\n+$/, ""));
    }
    lock[id] = { version, sha256: h.digest("hex") };
  }

  // A prompt file nobody names is a prompt nobody can reach.
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    if (!ids.some((e) => e.file === f)) problems.push(`prompts/${f} is not named in PROMPT_FILES`);
  }

  // GUARD 2 - what a shared fragment must still SAY.
  //
  // Checked against the FRAGMENT, not against each composed prompt. Composing
  // first looked stronger and is in fact strictly weaker: a consumer's own
  // body can satisfy the shape by accident and let the shared paragraph rot
  // underneath it. Measured, not guessed — with the register anchor cut out of
  // house-rules, lesson-support and ask-another-way went red while
  // nature-grounding-line stayed green on "use the general words a child
  // knows", a line about naming species. The one prompt the anchor matters
  // most to was the one the composed form excused.
  //
  // The promise belongs to the fragment. Every prompt that includes it
  // inherits the promise, and they are named in the failure so the blast
  // radius is on screen.
  const contracts = existsSync(contractsPath)
    ? JSON.parse(readFileSync(contractsPath, "utf8")).fragments ?? {}
    : (problems.push("prompts/contracts.json is missing"), {});

  for (const [name, requirements] of Object.entries(contracts)) {
    const consumers = composedBy.get(name) ?? [];
    // A contract naming a fragment nothing includes is a contract that has
    // silently stopped being checked. Renaming or retiring a fragment must
    // fail here rather than turn this file into decoration.
    if (consumers.length === 0) {
      problems.push(
        `contracts.json declares promises for "${name}", which no prompt includes. ` +
          `Retire the entry deliberately, or fix the name.`
      );
      continue;
    }
    const fragment = readFileSync(path.join(dir, "_shared", `${name}.md`), "utf8");
    for (const req of missingContracts(fragment, requirements)) {
      problems.push(
        `prompts/_shared/${name}.md: promises ${req.name} — ${req.shape} — and no longer keeps ` +
          `it. Inherited by ${consumers.map((c) => c.id).join(", ")}. Why it matters: ${req.why}`
      );
    }
  }

  // The anti-drift half. A fragment reaching more than one prompt is exactly
  // the shape #538 broke: edited for one consumer, silently wrong for another.
  // Such a fragment must declare at least one promise, so a future shared
  // paragraph inherits the guard instead of quietly opting out of it.
  for (const [name, consumers] of composedBy) {
    if (consumers.length > 1 && !(name in contracts)) {
      problems.push(
        `prompts/_shared/${name}.md is composed into ${consumers.length} prompts ` +
          `(${consumers.map((c) => c.id).join(", ")}) but promises nothing in contracts.json. ` +
          `Say what it must still contain after an edit.`
      );
    }
  }

  if (write) {
    writeFileSync(lockPath, JSON.stringify(lock, null, 2) + "\n");
    console.log(`Wrote lockfile for ${Object.keys(lock).length} prompts.`);
  } else if (existsSync(lockPath)) {
    const prev = JSON.parse(readFileSync(lockPath, "utf8"));
    for (const [id, now] of Object.entries(lock)) {
      const was = prev[id];
      if (!was) { problems.push(`${id}: not in the lockfile. Run: npm run validate:prompts -- --write`); continue; }
      // ANY sha mismatch, not only one at an unchanged version. Flagging only
      // the same-version case meant a bump without a re-lock left that prompt
      // unlocked forever: the recorded sha went stale and every later edit at
      // that version compared against a value nobody had refreshed. `pull` put
      // you in that state by design.
      if (was.sha256 !== now.sha256) {
        problems.push(
          was.version === now.version
            ? `${id}: text changed at version ${now.version}. Bump the version, then run: npm run validate:prompts -- --write`
            : `${id}: version ${was.version} -> ${now.version} but the lockfile was not regenerated. Run: npm run validate:prompts -- --write`
        );
      } else if (was.version !== now.version) {
        problems.push(`${id}: version changed to ${now.version} with identical text. Run: npm run validate:prompts -- --write`);
      }
    }
    for (const id of Object.keys(prev)) if (!(id in lock)) problems.push(`${id}: in the lockfile but no longer a prompt`);
  } else {
    problems.push("prompts/lockfile.json is missing. Run: npm run validate:prompts -- --write");
  }

  if (problems.length > 0) {
    console.error("Prompt validation failed:\n" + problems.map((p) => `  - ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(`Prompts valid: ${ids.length} checked, lockfile in step.`);
}

// Only when run as the check. Imported (by tests, to watch the guards
// above actually bite) this module must stay side-effect free.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();

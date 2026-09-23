import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMPT_FILES } from "@/lib/ai/prompt-registry";
import {
  CONTEXT_FIELDS,
  buildAskAnotherWay,
  buildGroundingLine,
  buildLessonSupport,
} from "@/lib/ai/prompts";
// The validator's own guards, imported rather than reimplemented. A second
// copy of a rule is a second rule, and the one a test watches go red would
// stop being the one CI runs.
import {
  CONTEXT_KEYS,
  contextDeixis,
  missingContracts,
  registryEntries,
  unsupportedDeixis,
  type DeixisHit,
} from "../../scripts/validate-prompts.mjs";

/**
 * #549 · The prompt contracts, and the code they are answerable to.
 *
 * `prompts/lockfile.json` proves a prompt's text CHANGED. Nothing proved what
 * it now MEANS, and on 2026-08-26 that gap shipped: PR #538's first head
 * (8d21077) rewrote the shared house voice to
 *
 *     "at a register the class you are told about understands"
 *
 * and three prompts include that paragraph. `buildGroundingLine`'s only caller
 * passes `{topic, objective}` and no class, so the one drafter whose output is
 * read aloud to children simultaneously lost its register anchor and gained a
 * sentence pointing at something it is never told. validate:prompts passed,
 * 1359 tests passed, next build passed, six lint scripts passed. A human
 * tracing the include through its three consumers caught it.
 *
 * Two guards live in scripts/validate-prompts.mjs. This suite is the half that
 * needs TypeScript: it holds each prompt's `context:` declaration to what its
 * REAL CALLERS actually pass, so the declaration cannot quietly become a
 * comment. A declaration nobody keeps true is another green that means nothing.
 */

const root = new URL("../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), "utf8");

/** `prompts/x.md` -> its `context:` frontmatter, as declared. */
function declaredContext(file: string): string[] {
  const head = /^---\n([\s\S]*?)\n---\n/.exec(read(`prompts/${file}`))?.[1] ?? "";
  const line = /^context:\s*\[(.*)\]$/m.exec(head);
  expect(line, `prompts/${file}: no "context:" in frontmatter`).not.toBeNull();
  return (line?.[1] ?? "").split(",").map((v) => v.trim()).filter(Boolean);
}

/** `HelperContext` field name -> the shared context key it stands for. */
const KEY_OF_FIELD = new Map(CONTEXT_FIELDS.map((f) => [f.field as string, f.key as string]));

/**
 * The top-level keys of the object literal passed at a call site.
 *
 * Deliberately fail-loud: if the call moves or is rewritten, this throws
 * "stale" rather than returning an empty set and passing. A source scan that
 * silently finds nothing is the worst kind of check.
 */
function callSiteKeys(file: string, call: string): string[] {
  const src = read(file);
  const at = src.indexOf(call);
  expect(at, `${file}: no call to "${call}" — this test is stale, not passing`).toBeGreaterThan(-1);
  const open = src.indexOf("{", at);
  expect(open, `${file}: "${call}" has no object literal`).toBeGreaterThan(-1);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  expect(end, `${file}: unbalanced object literal at "${call}"`).toBeGreaterThan(-1);
  const inner = src.slice(open + 1, end);
  const keys: string[] = [];
  let d = 0;
  for (const raw of inner.split("\n")) {
    const line = raw.trim();
    const m = d === 0 ? /^([A-Za-z_$][\w$]*)\s*:/.exec(line) : null;
    if (m?.[1]) keys.push(m[1]);
    d += (line.match(/[{[(]/g) ?? []).length - (line.match(/[}\])]/g) ?? []).length;
  }
  return keys;
}

/** Every file under these roots that mentions `needle`. */
function filesMentioning(needle: string, roots = ["lib", "app", "engine"]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries;
    try {
      entries = readdirSync(new URL(`${dir}/`, root), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === "node_modules") continue;
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (/\.(ts|tsx)$/.test(e.name) && read(`${dir}/${e.name}`).includes(needle)) {
        out.push(`${dir}/${e.name}`);
      }
    }
  };
  roots.forEach(walk);
  return out.sort();
}

describe("the guard vocabulary and the code that composes context stay in step", () => {
  it("knows exactly the keys lib/ai/prompts.ts can compose", () => {
    // CONTEXT_KEYS is still a second list, held to the first here. Add a
    // fourth context line to CONTEXT_FIELDS without teaching the validator the
    // nouns it is spoken as, and this fails rather than leaving a field the
    // guard cannot see. (The validator can import TypeScript since #1220;
    // collapsing this pair into an import is a separate change, because the
    // deixis guard needs the keys in a shape the composer does not export.)
    expect([...CONTEXT_KEYS].sort()).toEqual(CONTEXT_FIELDS.map((f) => f.key as string).sort());
  });

  it("every prompt declares its context, using only known keys", () => {
    for (const file of Object.values(PROMPT_FILES)) {
      for (const key of declaredContext(file)) {
        expect(CONTEXT_KEYS, `prompts/${file} declares "${key}"`).toContain(key);
      }
    }
  });
});

/**
 * #1220 · The validator reads the registry the app reads.
 *
 * `validate-prompts.mjs` used to find `PROMPT_FILES` with a regex requiring a
 * trailing comma on every entry, so a prompt added as the LAST property without
 * one — valid TypeScript, and what an editor leaves you — was dropped. It was
 * never wrong in practice, and only because the unnamed-file sweep in the same
 * script noticed the orphan from the other side. That is two checks overlapping
 * by accident, not a design, and it stops being true the moment either half is
 * refactored. `scripts/langfuse-prompts.mjs` carried the identical pattern with
 * NO second check beside it, so there the dropped prompt was simply never
 * published.
 */
describe("the prompt registry is read, not parsed", () => {
  it("sees exactly the prompts the app sees", () => {
    const entries = registryEntries();
    expect(entries.map((e) => e.id)).toEqual(Object.keys(PROMPT_FILES));
    expect(entries.map((e) => e.file)).toEqual(Object.values(PROMPT_FILES));
    // 13 today. A floor plus a known member, not a pinned list: an exact list
    // here would be the second hand-maintained registry this change removes.
    expect(entries.length).toBeGreaterThanOrEqual(13);
    expect(entries.map((e) => e.id)).toContain("lesson-support");
  });

  it("sees the last entry even when it has no trailing comma", () => {
    // The demonstration, kept so nobody reintroduces the pattern believing it
    // was equivalent: the retired regex, run over the real registry with its
    // final comma removed, drops exactly the last prompt. The import does not.
    const source = read("lib/ai/prompt-registry.ts");
    const ids = registryEntries().map((e) => e.id);
    const last = ids.at(-1)!;
    expect(
      source.includes(`"${last}"`),
      "the last registry entry must still be the last one this spec read"
    ).toBe(true);

    const withoutTrailingComma = source.replace(/",\n\} as const;/, '"\n} as const;');
    expect(withoutTrailingComma, "the registry's closing shape changed").not.toBe(source);
    const byRegex = [
      ...withoutTrailingComma.matchAll(/^\s*"([a-z][a-z0-9-]*)":\s*"([a-z0-9-]+\.md)",$/gm),
    ].map((m) => m[1]);
    expect(byRegex.length).toBe(ids.length - 1);
    expect(byRegex).not.toContain(last);
  });

  it("leaves no script parsing the registry's source for what it exports", () => {
    // The sweep #1220 asked for, kept as a test so it stays swept.
    //
    // What the sweep found, recorded honestly because the ticket asks for it:
    // three scripts read `lib/ai/prompt-registry.ts`. `eval-coverage-lint.mjs`
    // was already fixed by #1218; the two below are fixed here.
    //
    // It also found a SECOND instance of the same class, outside this ticket:
    // `scripts/analytics-lint.mjs` regexes `lib/analytics/events.ts` — itself a
    // pure module — for `ANALYTICS_EVENTS`, with the same trailing-comma
    // anchor, so an event added as the last property without a comma is
    // invisible to its declared-event count. That is NOT merely "how code is
    // written at its call sites", which the rest of that script does check.
    // Filed as #1251 rather than fixed here: the privacy-critical
    // half of that lint (the forbidden-property scan) is not comma-anchored
    // and was proven still to bite, so there is no live hole, and changing a
    // privacy lint's transport deserves its own review. #1251 has since had
    // that review and made the move: `analytics-lint.mjs` now imports the
    // lists and runs under tsx, and a guard mutation plants the comma-less
    // event it could not see.
    for (const file of ["scripts/validate-prompts.mjs", "scripts/langfuse-prompts.mjs"]) {
      const text = read(file);
      expect(text, `${file} reads the registry's source as text`).not.toMatch(
        /readFileSync\([^)]*prompt-registry\.ts/
      );
      expect(text, `${file} must import PROMPT_FILES`).toMatch(
        /import \{[^}]*PROMPT_FILES[^}]*\} from "\.\.\/lib\/ai\/prompt-registry\.ts"/
      );
    }
  });

  it("is never invoked by a bare node, now that it imports TypeScript", () => {
    // #1220 review finding 1. Moving the script to tsx in package.json left
    // `.githooks/pre-push` calling `node scripts/validate-prompts.mjs`
    // directly, which throws ERR_UNKNOWN_FILE_EXTENSION on any Node 22 patch
    // without unflagged type-stripping — on EVERY push, for every contributor
    // on that patch. .nvmrc pins only the major, CI never runs git hooks, and
    // nothing held the hook and package.json in step. This does.
    const hook = read(".githooks/pre-push");
    expect(hook, "pre-push must not run a tsx script under bare node").not.toMatch(
      /^\s*node\s+scripts\/(validate-prompts|langfuse-prompts)\.mjs/m
    );
    expect(hook, "pre-push must run the prompt validator through npm").toMatch(
      /npm run validate:prompts/
    );

    // And the npm scripts themselves must still be the tsx ones, or the hook
    // above is pointing at a command that went back to bare node.
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    for (const script of ["validate:prompts", "prompts:push"]) {
      expect(pkg.scripts[script], `${script} must run under tsx`).toMatch(/^tsx /);
    }
  });

  it("fails the push when the validator fails, rather than printing and passing", () => {
    // #1252, found while verifying the hook above and fixed here because the
    // hook line was already in this change. `sh` has no `set -e`, so the
    // script's exit status used to be whichever check ran LAST: a failing caps
    // lint or prompt validation printed its complaint and the push went out —
    // the one outcome nc#319 opened this hook to prevent. Every check now
    // records into `failed` and the hook exits on it, so all three still run
    // and report in one attempt.
    const hook = read(".githooks/pre-push");
    expect(hook, "the hook must end by exiting on the collected status").toMatch(
      /\nexit "\$failed"\s*$/
    );
    for (const check of [
      /node scripts\/caps-lint\.mjs \|\| failed=1/,
      /npm run validate:prompts --silent \|\| failed=1/,
      /node scripts\/commit-identity-check\.mjs \|\| failed=1/,
    ]) {
      expect(hook, `a check does not record its failure: ${check}`).toMatch(check);
    }
    // `set -e` would stop at the first failure and hide the rest, which is the
    // thing the collected flag exists to avoid.
    expect(hook, "set -e would report only the first failing check").not.toMatch(/^\s*set -e/m);
  });
});

describe("a prompt's declared context is what its callers actually pass", () => {
  it("nature-grounding-line declares exactly what lib/grounding.ts hands it", () => {
    // THE relationship this ticket is about: lib/ai/prompts.ts emits the class
    // line only `if (ctx.ageBand)`, and this call site is the only place the
    // grounding drafter is ever reached from. Equality, not subset, on
    // purpose — it must fail in BOTH directions. Add a class here and the
    // declaration is stale; drop the topic here and the prompt's "tied to
    // today's topic" becomes a pointer at nothing, which is precisely the
    // shape of the #538 defect.
    const passed = callSiteKeys("lib/grounding.ts", "draftGroundingLine(")
      .map((f) => KEY_OF_FIELD.get(f))
      .filter((k): k is string => Boolean(k));
    expect(passed.sort()).toEqual(declaredContext("nature-grounding-line.md").sort());
  });

  it("nature-grounding-line still has exactly one caller", () => {
    // The check above reads one call site. If a second appears, reading one is
    // no longer enough — so the count is pinned, and a new consumer of the
    // read-aloud drafter has to come here and say what it passes.
    expect(filesMentioning("groundingLine")).toEqual([
      "lib/ai/ask-another-way-contract.ts", // a comment referring to its dash swap
      "lib/ai/plate-draft.ts", // the seam
      "lib/grounding.ts", // the only caller
    ]);
  });

  it("builds each prompt from its callers' shape and finds every declared key in the message", () => {
    // The declaration says "the text may point at this". This asserts the
    // model is genuinely told it — built through the real builders, so a
    // change to contextLines() that stops emitting a line lands here.
    const grounding = buildGroundingLine("FACTS", {
      topic: "TOPIC-SENTINEL",
      objective: "OBJECTIVE-SENTINEL",
    });
    expect(grounding?.user).toContain("TOPIC-SENTINEL");
    expect(grounding?.user).toContain("OBJECTIVE-SENTINEL");
    // And the class really is absent, which is the whole finding.
    expect(grounding?.user.toLowerCase()).not.toContain("the class:");

    const support = buildLessonSupport({
      task: "age",
      context: {
        sessionTitle: "TOPIC-SENTINEL",
        objective: "OBJECTIVE-SENTINEL",
        ageBand: "CLASS-SENTINEL",
        childWork: "collect leaves",
        phaseTitles: ["Doorway"],
        safetyAndCare: [],
        localFacts: [],
      },
    });
    for (const sentinel of ["TOPIC-SENTINEL", "OBJECTIVE-SENTINEL", "CLASS-SENTINEL"]) {
      expect(support?.user).toContain(sentinel);
    }

    // ask-another-way declares [objective] and NOT the class, because its
    // route passes `ageBand: ... ?? null` — a class is likely, never certain.
    // Built without one, the objective must still be there.
    const another = buildAskAnotherWay({
      option: "simpler",
      question: "What can you hear?",
      objective: "OBJECTIVE-SENTINEL",
    });
    expect(another?.user).toContain("OBJECTIVE-SENTINEL");
    expect(declaredContext("ask-another-way.md")).not.toContain("class");
  });
});

/**
 * The exact text of PR #538's first head, prompts/_shared/house-rules.md at
 * commit 8d21077. Kept verbatim so the regression has a name and this guard
 * can be watched failing on the real thing rather than on a paraphrase.
 */
const HOUSE_RULES_8D21077 =
  "You are a quiet writing aid for a teacher leading a short outdoor lesson with her class. " +
  "You never speak to the children. You only draft words the teacher will choose to say in " +
  "their own voice. Write plainly, warmly, and briefly, at a register the class you are told " +
  "about understands. Punctuate with full stops, commas and colons, and use a colon where one " +
  "part of a sentence introduces the next. Never invent a fact. If something is uncertain, say " +
  'so honestly ("we think", "one thing people say") rather than stating it as certain. Return ' +
  "only what the schema asks for, nothing else.";

const HOUSE_RULES_NOW = read("prompts/_shared/house-rules.md").trim();

describe("guard 1 · a prompt may not point at context it is never given", () => {
  it("catches the 8d21077 text for a prompt that is told no class", () => {
    const hits = unsupportedDeixis(HOUSE_RULES_8D21077, ["topic", "objective"]);
    expect(hits.map((h: DeixisHit) => h.key)).toContain("class");
    expect(hits.find((h: DeixisHit) => h.key === "class")?.phrase.toLowerCase()).toContain(
      "you are told"
    );
  });

  it("leaves the same text alone for a prompt that IS told a class", () => {
    // lesson-support passes `Class: {ageBand}` in every call. The sentence was
    // never wrong everywhere — it was wrong for one consumer. A guard that
    // banned the phrase outright would be a style rule, not this finding.
    expect(unsupportedDeixis(HOUSE_RULES_8D21077, ["topic", "objective", "class"])).toEqual([]);
  });

  it("does not fire on ordinary prose about the audience", () => {
    // Every read-aloud prompt in this repo says "the class" and "the children".
    // Flagging the bare noun would have turned six prompts red on day one, and
    // the guard would have been deleted within the week. It is the POINTING
    // that is checked.
    for (const line of [
      "a line that tells the class what to FIND",
      "one warm sentence a teacher says aloud to her class",
      "at a register the children in front of you understand",
      "You never speak to the children.",
      "a teacher leading a short outdoor lesson with her class",
    ]) {
      expect(contextDeixis(line), line).toEqual([]);
    }
  });

  it("does fire on the ways a prompt actually points at the message", () => {
    for (const line of [
      "at a register the class you are told about understands",
      "write for the age band you are given",
      "keep to today's topic",
      "serve the purpose below",
      "the year group named above",
    ]) {
      expect(contextDeixis(line).length, line).toBeGreaterThan(0);
    }
  });

  // ---- #608 ----------------------------------------------------------------
  //
  // The guard shipped by #549 read `above` and `below` as pointers outright,
  // and read a bare past participle as nothing at all. Both readings are wrong
  // in the same way: they judge the WORD instead of the position. What makes
  // "serve the purpose below" a pointer and "keep the topic below two
  // sentences" a comparative is that the second one has a complement. The same
  // test tells "write for the year group given" from "the age group given the
  // most freedom". So this is one rule, and these two suites are the two sides
  // of it — widen one without the other and the pair fails.

  it("does not fire on above/below used as an ordinary comparative", () => {
    // Every one of these is a coherent line someone would write here, and none
    // of them points at anything. The first is the safety framing this repo's
    // prompts actually use. All three were red before #608.
    for (const line of [
      "Never put the aim above the safety of the class.",
      "Do not place the purpose above what the facts support.",
      "Keep the topic below two sentences.",
      "Keep the theme below the reading age of the group.",
      "Rank the objective above the activity.",
    ]) {
      expect(contextDeixis(line), line).toEqual([]);
    }
  });

  it("does not fire when a word in the gap supplies a subject or an auxiliary", () => {
    // #608's first head shared one two-word window across every pointing
    // shape, so anything could sit between the noun and the participle —
    // including the subject that makes the clause ACTIVE. "You are told" is
    // passive and points; "you stated" is active and points at the model's own
    // output. These are the six the evaluator found, plus the auxiliary form
    // and the same defect on `named above` and on `in this message`, which the
    // suggested repair would have left behind.
    for (const line of [
      "Do not contradict the purpose you stated.",
      "End on the theme you named.",
      "Check the line against the aim you set out.",
      "Rewrite it if it drifts from the objective you listed.",
      "Use the topic the teacher named.",
      "Repeat the topic Miss Ali mentioned.",
      "The purpose is stated.",
      "The topic was named.",
      "Do not repeat the topic you listed above.",
      "Use the topic the teacher named above.",
      "Do not repeat the topic you wrote in this message.",
    ]) {
      expect(contextDeixis(line), line).toEqual([]);
    }
  });

  it("does not fire on a container word used in its innocent sense", () => {
    // A text is what the class reads, a section is part of a pack, a brief is
    // what the head wrote. The word alone is not deixis — a demonstrative
    // ("in this message") or a position ("in the context above") is.
    for (const line of [
      "Set the topic in the text the children will read.",
      "Set the theme in the section about autumn.",
      "State the aim in the brief the head wrote.",
      "Keep the class in the context they know best.",
      "Ground the topic in the input the children give you.",
    ]) {
      expect(contextDeixis(line), line).toEqual([]);
    }
  });

  it("does not fire on a cohort's ordinal neighbour, or on `given` as a preposition", () => {
    // "The year group above" is the year above, not the year group named
    // earlier in the message: cohorts come in ordered sequences and fields do
    // not, which is why bare above/below still points after "purpose".
    for (const line of [
      "Teach the year group above.",
      "The age group below needs shorter words.",
      "Choose the theme given the season.",
      "The topic, given the weather, should be shelter.",
      "Keep the class outside provided the rain holds off.",
    ]) {
      expect(contextDeixis(line), line).toEqual([]);
    }
  });

  it("does not fire on a participle that keeps its complement, or is the class's own verb", () => {
    // Two ways an -ed word is not a pointer. Either it still governs what
    // follows it ("given the most freedom"), or the context noun is its
    // SUBJECT rather than what it was done to — which only animate nouns can
    // be, and is why the guard reads a bare clause-final `described` after
    // "class" differently from one after "topic".
    for (const line of [
      "The age group given the most freedom is usually the oldest.",
      "The class given a whole afternoon outdoors still notices three things.",
      "Note the species the class described.",
      "Record the tree the class named.",
      "Repeat the answer the class stated.",
      "Never invent a fact; use only the facts given.",
      "Set the topic in the context of the season, not the calendar.",
      "Explain the purpose of the message before the class goes out.",
    ]) {
      expect(contextDeixis(line), line).toEqual([]);
    }
  });

  it("fires on the realistic pointers #608 named as misses", () => {
    // All six are the #538 defect shape and all six passed green under #549.
    for (const line of [
      "at a register the class described in this message understands",
      "write for the age band in the context above",
      "write for the year group given",
      "match the cohort you have been handed",
      "the class in the message above",
      "keep to the topic stated",
      // The two vocabulary misses the evaluator added.
      "the theme you have been sent",
      "use the topic attached",
    ]) {
      expect(contextDeixis(line).length, line).toBeGreaterThan(0);
    }
  });

  it("still fires on the locational participles, which the comparative fix must not cost", () => {
    // The fix #608 suggested — require `named above` and drop bare `above` —
    // would have taken "serve the purpose below" with it, and that is a pinned
    // case above. Position, not vocabulary, is what keeps both.
    for (const line of [
      "the year group named above",
      "the class specified above",
      "use the theme given below",
      "the objective set out above",
      "draft to the aim provided to you",
    ]) {
      expect(contextDeixis(line).length, line).toBeGreaterThan(0);
    }
  });

  it("the shipped house voice points at nothing, so it stands alone in every caller", () => {
    expect(contextDeixis(HOUSE_RULES_NOW)).toEqual([]);
  });
});

describe("guard 2 · what the house voice must still say after an edit", () => {
  const contracts = JSON.parse(read("prompts/contracts.json")).fragments["house-rules"] as Array<{
    name: string;
    anyOf: string[];
  }>;
  const anchor = contracts.find((r) => r.name === "register-anchor");
  if (!anchor) throw new Error("contracts.json no longer declares a register-anchor for house-rules");

  it("the shipped house voice keeps every promise", () => {
    expect(missingContracts(HOUSE_RULES_NOW, contracts)).toEqual([]);
  });

  it("goes red when the register anchor is deleted", () => {
    // The other way the #538 sweep could have gone: not a wrong anchor, no
    // anchor. Nothing else in nature-grounding-line sets a register — it is
    // the one prompt with no age band of its own to fall back on.
    //
    // Built from the pinned 8d21077 text, not from the live file, so this
    // stays a statement about a deleted anchor rather than about today's
    // wording. Cutting the clause out of the current file is what the mutation
    // proof in the PR does; a unit test that has to know the shipped sentence
    // to construct its own input is the brittleness this guard exists to
    // avoid, reintroduced one level up.
    const gutted = HOUSE_RULES_8D21077.replace(
      ", at a register the class you are told about understands",
      ""
    );
    expect(gutted).not.toEqual(HOUSE_RULES_8D21077);
    expect(gutted).toContain("Write plainly, warmly, and briefly.");
    expect(missingContracts(gutted, [anchor]).map((r) => r.name)).toEqual(["register-anchor"]);
  });

  it("survives honest rewordings, which is the point of a shape and not a sentence", () => {
    // The brittleness tension, asserted rather than asserted-about. Each of
    // these keeps the contract — a register word bound inside one sentence to
    // the audience it is for — and none of them is the shipped wording.
    for (const wording of [
      "Write plainly, warmly, and briefly, at a register a young child understands.",
      "Use language the class can follow.",
      "Keep the vocabulary to words a six-year-old knows.",
      "Pitch it at the reading age of the children you are writing for.",
      "The children are five: keep the wording simple.",
      // #608: `level` is a register word and the contract used to refuse it.
      // `pitch` earns its place only in the verb frame that means "set the
      // level of" — see the $words note in contracts.json.
      "Write at a level a Reception child can follow.",
      "Keep the reading level to what a Year 1 child manages.",
      "Pitch it for a Reception class.",
    ]) {
      expect(missingContracts(wording, [anchor]), wording).toEqual([]);
    }
  });

  it("is not satisfied by a leftover keyword in a sentence that says nothing", () => {
    // The failure mode of a one-word assert. Both of these contain "register"
    // or "children" and neither anchors anything.
    for (const wording of [
      "Return only what the schema asks for, nothing else.",
      "Keep a register of every fact you were given, and never invent one.",
      "You never speak to the children.",
      // #608 asked for `tone`, `grade` and bare `pitch` as well. These are the
      // sentences that refuse them. Warmth is not register: admitting `tone`
      // would let an edit that REPLACED the anchor with a mood ship — deleting
      // it stays red either way, since "warmly" is not the token `tone`, so
      // replacement is the experiment that settles it. `grade` is a mark; the
      // reading sense lives in "grade level", which `level` covers. The bare
      // noun `pitch` is vocal frequency.
      "Keep a warm tone with the children.",
      "Grade the children's work kindly.",
      "Never speak to the children in a high pitch.",
    ]) {
      expect(missingContracts(wording, [anchor]).length, wording).toBe(1);
    }
  });
});

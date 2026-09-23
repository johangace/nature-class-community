import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROMPT_FILES, clearPromptCache, loadPrompt } from "@/lib/ai/prompt-registry";
import {
  contextDeixis,
  missingContracts,
  type PromptContract,
} from "../../scripts/validate-prompts.mjs";

/**
 * #756 · The two principles the first real teacher handed us, held to the text.
 *
 * On 2026-08-31 a land-based educator, not a simulated
 * persona — sat with the app and named two things
 * (`docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`):
 *
 *   GUIDE, NOT SCRIPT.   "not sure i want to be told what to do more to help
 *                         me run it", and "People like to learn from people".
 *                         She appreciated that the product already leans this
 *                         way, which makes it a thing to protect rather than a
 *                         thing to add and forget.
 *   FACTS < STORIES.     "children like a WOW factor, a fun fact.. Children
 *                         like storytelling.. turn the lessons into stories."
 *
 * Both are SOFT principles: they are expressed as a positive shape the drafter
 * writes toward, never as a list of words it may not use. This repo has paid
 * for the other kind twice — `register-lint`'s "how many" ban kept two of
 * Johan's own sessions out of the product for months, and
 * `nature-grounding-line` v2 named "beetles and woodlice" in a prohibition and
 * got exactly those two species in 15 of 26 runs.
 *
 * This suite is the half of the change that can go red. `prompts/lockfile.json`
 * proves the text moved; `prompts/contracts.json` says what it must still SAY;
 * and the assertions below watch those promises fail on the realistic damage,
 * because #554 is this repo's standing warning that a check nobody has seen go
 * red is not evidence of anything.
 */

const root = new URL("../../", import.meta.url);
const read = (rel: string) => readFileSync(new URL(rel, root), "utf8");

const CONTRACTS = JSON.parse(read("prompts/contracts.json")).fragments as Record<
  string,
  PromptContract[]
>;

const HOUSE_RULES_NOW = read("prompts/_shared/house-rules.md").trim();
const CHILD_WONDER_NOW = read("prompts/_shared/child-wonder.md").trim();

/**
 * The house voice exactly as it stood on `main` the hour before this ticket,
 * at 2d657dc. Pinned verbatim, and it is the load-bearing fixture here.
 *
 * A new contract is only worth adding if the text that predates it goes RED.
 * This paragraph already said "you only draft words the teacher will choose to
 * say in her own voice" — a promise about whose VOICE the words are — on the
 * day a real teacher told us the product still read as being told what to do.
 * So the `teacher-may-change-it` shape deliberately admits none of `choose`,
 * `own` or `voice`, and this constant is how that stays true rather than
 * remaining an intention in a comment.
 */
const HOUSE_RULES_BEFORE_756 =
  "You are a quiet writing aid for a teacher leading a short outdoor lesson with her class. " +
  "You never speak to the children. You only draft words the teacher will choose to say in " +
  "her own voice. Write plainly, warmly, and briefly, at a register the children in front of " +
  "you understand. Punctuate with full stops, commas and colons, and use a colon where one " +
  "part of a sentence introduces the next. Never invent a fact. If something is uncertain, " +
  'say so honestly ("we think", "one thing people say") rather than stating it as certain. ' +
  "Return only what the schema asks for, nothing else.";

function promise(fragment: string, name: string): PromptContract {
  const found = (CONTRACTS[fragment] ?? []).find((r) => r.name === name);
  if (!found) {
    throw new Error(`prompts/contracts.json declares no "${name}" for ${fragment}`);
  }
  return found;
}

/* ─────────────────────────────────────────────────────────────────────────
 * GUIDE, NOT SCRIPT
 * ───────────────────────────────────────────────────────────────────────── */

describe("guide, not script · the teacher may change what she is handed", () => {
  const anchor = promise("house-rules", "teacher-may-change-it");

  it("the shipped house voice keeps it", () => {
    expect(missingContracts(HOUSE_RULES_NOW, [anchor])).toEqual([]);
  });

  it("the paragraph this ticket found does NOT keep it", () => {
    // The whole justification for the contract, asserted rather than argued. If
    // a later edit widens the shape until this goes green, the promise has
    // become a description of what was already there and stops guarding
    // anything — which is exactly how `register-lint` spent months at exit 0.
    expect(missingContracts(HOUSE_RULES_BEFORE_756, [anchor]).map((r) => r.name)).toEqual([
      "teacher-may-change-it",
    ]);
  });

  it("goes red when the clause is cut out of the live fragment", () => {
    const gutted = HOUSE_RULES_NOW.replace(
      / She is running the lesson[^]*?passes an idea to another\./,
      ""
    );
    expect(gutted).not.toEqual(HOUSE_RULES_NOW);
    expect(gutted).toContain("Write plainly, warmly, and briefly");
    expect(missingContracts(gutted, [anchor]).map((r) => r.name)).toEqual([
      "teacher-may-change-it",
    ]);
  });

  it("survives honest rewordings, because it is a shape and not a sentence", () => {
    for (const wording of [
      "What you draft is hers to take or leave.",
      "Every suggestion here is one she may ignore.",
      "She is free to reshape anything you draft.",
      "Offer it, and she can drop it.",
      "The draft is a starting point she may rewrite.",
      "She may replace the suggestion with her own words.",
    ]) {
      expect(missingContracts(wording, [anchor]), wording).toEqual([]);
    }
  });

  it("is not satisfied by a leftover word in a sentence that hands her nothing", () => {
    for (const wording of [
      // The pre-#756 sentence, on its own. `choose`, `own` and `voice` are
      // refused for the reason recorded in contracts.json.
      "You only draft words the teacher will choose to say in her own voice.",
      "Return only what the schema asks for, nothing else.",
      // A change verb with no draft anywhere near it: this is about the lesson,
      // not about what the model handed her.
      "Adapt the lesson to the weather.",
      "She is free to take the class outside.",
      "Draft the line and stop.",
    ]) {
      expect(missingContracts(wording, [anchor]).length, wording).toBe(1);
    }
  });

  it("reaches every prompt that includes the house voice", () => {
    clearPromptCache();
    const vars: Record<string, Record<string, string>> = {
      "nature-grounding-line": {},
      "lesson-support": { taskRule: "RULE" },
      "ask-another-way": { optionRule: "RULE" },
    };
    for (const id of ["nature-grounding-line", "lesson-support", "ask-another-way"] as const) {
      expect(loadPrompt(id, vars[id]), id).not.toBeNull();
      expect(loadPrompt(id, vars[id])?.system, id).toContain(
        "free to take, reshape or set aside"
      );
    }
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * FACTS < STORIES, FOR CHILDREN
 * ───────────────────────────────────────────────────────────────────────── */

describe("facts < stories · the true thing reaches a child as a happening", () => {
  const forChildren = promise("child-wonder", "story-for-children");
  const fromFacts = promise("child-wonder", "story-made-of-given-facts");

  it("the shipped fragment keeps both promises", () => {
    expect(missingContracts(CHILD_WONDER_NOW, [forChildren, fromFacts])).toEqual([]);
  });

  it("goes red when a tidying pass turns the storytelling into a style note", () => {
    // The realistic damage, not a strawman. Nobody deletes this paragraph; they
    // "simplify" it, and the sentence that survives is about writing well
    // instead of about what a five-year-old carries home.
    const noStory = CHILD_WONDER_NOW.replace(
      "A child remembers a story and forgets a label.",
      "A child remembers a good line."
    ).replace("is one fact told as a story", "is one fact said well");
    expect(noStory).not.toEqual(CHILD_WONDER_NOW);
    expect(missingContracts(noStory, [forChildren]).map((r) => r.name)).toEqual([
      "story-for-children",
    ]);
    // And the sourcing half is untouched, so the two promises fail apart rather
    // than together — a single promise covering both would report one failure
    // for two very different edits.
    expect(missingContracts(noStory, [fromFacts])).toEqual([]);
  });

  it("goes red when the story keeps its colour and loses its source", () => {
    const unsourced = CHILD_WONDER_NOW.replace(
      / The living thing and what it does both come from the facts you were given, so the wonder is a true thing told well\./,
      ""
    );
    expect(unsourced).not.toEqual(CHILD_WONDER_NOW);
    expect(missingContracts(unsourced, [fromFacts]).map((r) => r.name)).toEqual([
      "story-made-of-given-facts",
    ]);
    expect(missingContracts(unsourced, [forChildren])).toEqual([]);
  });

  it("survives honest rewordings of both halves", () => {
    for (const wording of [
      "Children learn from stories, so tell it as one.",
      "Turn what you draft into a story a child would tell again.",
      "A five-year-old holds a story.",
    ]) {
      expect(missingContracts(wording, [forChildren]), wording).toEqual([]);
    }
    for (const wording of [
      "Everything in the story comes from the facts above.",
      "Build the story only from the facts you were given.",
      "The wonder is drawn from the facts, never from you.",
    ]) {
      expect(missingContracts(wording, [fromFacts]), wording).toEqual([]);
    }
  });

  it("is not satisfied by a leftover keyword", () => {
    for (const wording of [
      "You never speak to the children.",
      "Return only what the schema asks for, nothing else.",
      "Tell the story of how this pack was made.",
      "The children are five.",
    ]) {
      expect(missingContracts(wording, [forChildren]).length, wording).toBe(1);
    }
    for (const wording of [
      "Never invent a fact.",
      "The facts are true.",
      "Return only what the schema asks for, nothing else.",
    ]) {
      expect(missingContracts(wording, [fromFacts]).length, wording).toBe(1);
    }
  });

  it("names no living thing, so it cannot supply one", () => {
    // `nature-grounding-line` v2 put "beetles and woodlice" in a prohibition
    // and the model produced exactly those two in 15 of 26 runs
    // (docs/PROMPT_TEMPLATE.md). This fragment's exemplar is deliberately built
    // around a creature it refuses to name — "something ... far too small to
    // see" — so the shape is taught without an emittable species riding along.
    expect(CHILD_WONDER_NOW).toContain("Something has been eating that fallen log");
    expect(CHILD_WONDER_NOW).toContain("far too small to see");
  });

  it("points at no shared context, so it stands alone in both callers", () => {
    // Same standard the house voice is held to: a fragment reached by more than
    // one prompt may not refer to a topic, an aim or a class, because the
    // prompts it lands in are told different subsets of those (#549).
    expect(contextDeixis(CHILD_WONDER_NOW)).toEqual([]);
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * WHERE EACH PRINCIPLE IS COMPOSED, AND WHERE IT IS DELIBERATELY NOT
 * ───────────────────────────────────────────────────────────────────────── */

describe("the story fragment reaches the drafters whose words a child hears", () => {
  const includes = (file: string) =>
    [...read(`prompts/${file}`).matchAll(/\{\{>\s*([a-z][a-z0-9-]*)\s*\}\}/g)].map((m) => m[1]);

  it("is composed into exactly nature-grounding-line and lesson-support", () => {
    const carrying = Object.entries(PROMPT_FILES)
      .filter(([, file]) => includes(file).includes("child-wonder"))
      .map(([id]) => id)
      .sort();
    expect(carrying).toEqual(["lesson-support", "nature-grounding-line"]);
  });

  it("is kept out of ask-another-way on purpose", () => {
    // `ask-another-way` rephrases ONE circle question and its own text says
    // "add no fact. No creature, no number, no season, no place, no name that
    // is not already in the question". A storytelling instruction there would
    // pull against the guard that prompt is judged by: the material a story
    // wants is exactly the material this prompt is not allowed to introduce.
    // The registry's own note — "the temptation once includes exist is to
    // compose the house rules into all twelve; don't" — is the general form.
    expect(includes("ask-another-way.md")).toEqual(["house-rules"]);
  });

  it("really reaches the model in both, through the registry rather than by grep", () => {
    clearPromptCache();
    expect(loadPrompt("nature-grounding-line")?.system).toContain(
      "A child remembers a story and forgets a label."
    );
    expect(loadPrompt("lesson-support", { taskRule: "RULE" })?.system).toContain(
      "A child remembers a story and forgets a label."
    );
    expect(loadPrompt("ask-another-way", { optionRule: "RULE" })?.system).not.toContain(
      "A child remembers a story"
    );
  });
});

/* ─────────────────────────────────────────────────────────────────────────
 * HANDS ON THE THING, NOT JUST EYES ON IT
 *
 * #791 · The third principle from the same 2026-08-31 session, and the one
 * that fell on the floor. The teacher, in Johan's transcription:
 *
 *   "Nature is great for kinesthetic learners, working with the land,
 *    learning thru touch."
 *
 * #756 folded in what the ADULT should be saying. This is the one about what
 * the CHILDREN should be doing while she says it, and it is soft in the same
 * way: a shape the drafter writes toward, never a list of words it may not
 * use. The reason to be careful here specifically is measured rather than
 * felt — docs/PROMPT_TEMPLATE.md records that replacing door-line's safety
 * ban with a positive "this one is for looking at" scored 25/30 against a
 * 26/30 baseline and RAISED safety refusals from 3 to 5. So the fragment that
 * asks for hands carries its own deferral, and the two promises below fail
 * apart rather than together.
 * ───────────────────────────────────────────────────────────────────────── */

const HANDS_IN_NOW = read("prompts/_shared/hands-in.md").trim();

describe("hands in · what reaches a child's hands, and whose call it is", () => {
  const forHands = promise("hands-in", "hands-for-children");
  const deferred = promise("hands-in", "handling-deferred-to-the-authored-lesson");

  it("the shipped fragment keeps both promises", () => {
    expect(missingContracts(HANDS_IN_NOW, [forHands, deferred])).toEqual([]);
  });

  it("neither fragment that predates it already keeps the hands promise", () => {
    // The #756 discipline, applied to its own successor: a contract already
    // kept by the status quo asserts nothing. The house voice and the story
    // fragment were both on `main` the hour before this ticket, and both are
    // full of words about children — so if this promise were satisfiable by a
    // child word plus any nearby verb, it would have been green before it
    // existed and would be guarding nothing.
    expect(missingContracts(HOUSE_RULES_NOW, [forHands]).map((r) => r.name)).toEqual([
      "hands-for-children",
    ]);
    expect(missingContracts(CHILD_WONDER_NOW, [forHands]).map((r) => r.name)).toEqual([
      "hands-for-children",
    ]);
  });

  it("goes red when a tidying pass keeps the paragraph and loses the point", () => {
    // The realistic damage. Nobody deletes this fragment; they shorten the
    // opening claim into a sentence about learning styles that no longer says
    // anything reaches a hand. Only the first sentence carries this promise,
    // deliberately, so that edit is visible.
    const vague = HANDS_IN_NOW.replace(
      "Some children come to a thing by listening, and some come to it by holding it in their hands.",
      "Children come to a thing in more than one way."
    );
    expect(vague).not.toEqual(HANDS_IN_NOW);
    expect(vague).toContain("picked up, turned over");
    expect(missingContracts(vague, [forHands]).map((r) => r.name)).toEqual([
      "hands-for-children",
    ]);
    // And the deferral is untouched, so the two report separately.
    expect(missingContracts(vague, [deferred])).toEqual([]);
  });

  it("goes red when the invitation keeps its warmth and loses its deferral", () => {
    const undeferred = HANDS_IN_NOW.replace(
      " What may be picked up is the authored lesson's own call, and the care it states travels with anything you suggest.",
      ""
    );
    expect(undeferred).not.toEqual(HANDS_IN_NOW);
    expect(missingContracts(undeferred, [deferred]).map((r) => r.name)).toEqual([
      "handling-deferred-to-the-authored-lesson",
    ]);
    expect(missingContracts(undeferred, [forHands])).toEqual([]);
  });

  it("survives honest rewordings of both halves", () => {
    for (const wording of [
      "Give the children something to hold.",
      "A five-year-old learns it by picking it up.",
      "Let the pupils turn it over in their hands.",
      "What a child holds teaches more than what a child watches.",
      "Some children learn by doing, so give them something to hold.",
    ]) {
      expect(missingContracts(wording, [forHands]), wording).toEqual([]);
    }
    for (const wording of [
      "Whether it may be picked up is the authored lesson's call.",
      "The authored lesson decides what may be held.",
      "What the lesson says may be touched is what may be touched.",
    ]) {
      expect(missingContracts(wording, [deferred]), wording).toEqual([]);
    }
  });

  it("is not satisfied by contact without possession, which is the failure it exists for", () => {
    // "Let them touch it" is already true of a class standing still with a
    // flat palm on bark, and the 2026-09-14 audit
    // (docs/lesson-hands-audit-2026-09-14.md) found 20 of 294 shipped phases
    // are exactly that. A promise that could be kept by a touch word would be
    // kept by the curriculum this ticket was filed about.
    for (const wording of [
      "Let them touch it.",
      "The children feel the bark.",
      "Touch something that grew while we were gone.",
    ]) {
      expect(missingContracts(wording, [forHands]).length, wording).toBe(1);
    }
  });

  it("is not satisfied by contact without possession, or by figurative handling", () => {
    // The two refusals that are kept, because an honest edit really produces
    // them. "Let them touch it" is already true of a class standing still with
    // a palm on bark — 20 of 294 shipped phases are exactly that — and "Hold
    // the moment of change" is a real sentence in `autumn-w5-colours`, which
    // the audit scores EYES and calls the phase that most deserved a hands
    // label and did not earn it. A softening pass reaches for both registers.
    for (const wording of [
      "Let them touch it.",
      "The children feel the bark.",
      "Touch something that grew while we were gone.",
      "Children hold the moment of change.",
      "Children carry the story with them.",
    ]) {
      expect(missingContracts(wording, [forHands]).length, wording).toBe(1);
    }
  });

  it("does NOT catch a deliberate inversion, and that boundary is a decision on the record", () => {
    // Every wording below keeps its promise while meaning the opposite, and
    // that is deliberate. Seven review passes on PR #1212 spent four rounds
    // finding new ones — `lacks`, `relinquishes`, `delegates`, `while`,
    // `when`, `see`, `observed` — and each fix was right and the sequence did
    // not converge, because `missingContracts` evaluates regexes: it cannot
    // establish subjecthood and it cannot ask whether a noun names a thing.
    //
    // The $note at the top of prompts/contracts.json says what this mechanism
    // is for: on 2026-08-26 a SWEEP eroded the house voice's register anchor
    // and the lockfile was in step with the damage. An honest edit that drops
    // a promised idea is the threat. An author writing a fragment that says
    // the opposite of its own principle is stopped by review.
    //
    // These are asserted GREEN so the boundary cannot rot into a silent gap:
    // if a future change closes one, this test says so and the decision gets
    // made again on purpose.
    for (const wording of [
      "Children should watch while the teacher holds a leaf.",
      "Children see Alice hold a leaf.",
      "Children observed Alice holding a leaf.",
      "Children never hold anything in their hands.",
      // And the figurative wordings the named list does not reach. The
      // refusal is a fixed list of abstractions in object position, not a
      // semantic test, and `$words` now says exactly that.
      "Children hold on to the story.",
      "Children carry the lesson with them.",
      "Children lift the mood.",
    ]) {
      expect(missingContracts(wording, [forHands]), wording).toEqual([]);
    }
    for (const wording of [
      "The authored lesson has no authority over what children pick up.",
      "The authored lesson lacks authority over what may be held.",
      "The authored lesson relinquishes authority over what may be held.",
      "The authored lesson delegates its authority over what may be held.",
      "The authored lesson states that authority may be held by the assistant.",
    ]) {
      expect(missingContracts(wording, [deferred]), wording).toEqual([]);
    }
  });

  it("is not satisfied by a leftover keyword in either half", () => {
    for (const wording of [
      "You never speak to the children.",
      "Hold the line to twenty words.",
      "Return only what the schema asks for, nothing else.",
    ]) {
      expect(missingContracts(wording, [forHands]).length, wording).toBe(1);
    }
    for (const wording of [
      // A hand verb with no authority anywhere near it: this is the exact
      // shape of the reverted door-line variant.
      "Children may pick up what they like.",
      "The lesson is hers.",
      "Never invent a fact.",
    ]) {
      expect(missingContracts(wording, [deferred]).length, wording).toBe(1);
    }
  });

  it("points at no shared context, so it could be composed further without lying", () => {
    expect(contextDeixis(HANDS_IN_NOW)).toEqual([]);
  });
});

describe("the hands fragment reaches the one drafter that proposes what a class does", () => {
  const includes = (file: string) =>
    [...read(`prompts/${file}`).matchAll(/\{\{>\s*([a-z][a-z0-9-]*)\s*\}\}/g)].map((m) => m[1]);

  it("is composed into exactly lesson-support", () => {
    const carrying = Object.entries(PROMPT_FILES)
      .filter(([, file]) => includes(file).includes("hands-in"))
      .map(([id]) => id)
      .sort();
    expect(carrying).toEqual(["lesson-support"]);
  });

  it("is kept out of nature-grounding-line on purpose", () => {
    // nature-grounding-line drafts ONE line naming something to find, and it
    // is told no safety note about anything it names — its inputs are today's
    // verified nature facts, which carry presence and not hazard. A "pick it
    // up" nudge there would be an invitation onto a named living thing with
    // nothing in the prompt able to hold it back, which is precisely the
    // hazard door-line's HANDS guard exists for and precisely the substitution
    // PROMPT_TEMPLATE records as measured WORSE. lesson-support is the one
    // drafter whose own rules already refuse handling the unknown
    // (lib/ai/lesson-support-contract.ts), so it is the one that can carry
    // this.
    expect(includes("nature-grounding-line.md")).toEqual(["house-rules", "child-wonder"]);
  });

  it("is kept out of ask-another-way on purpose, for #756's reason", () => {
    // An action the question does not already contain is a fact, and that
    // prompt may add none.
    expect(includes("ask-another-way.md")).toEqual(["house-rules"]);
  });

  it("really reaches the model through the registry rather than by grep", () => {
    clearPromptCache();
    expect(loadPrompt("lesson-support", { taskRule: "RULE" })?.system).toContain(
      "picked up, turned over"
    );
    expect(loadPrompt("nature-grounding-line")?.system).not.toContain("picked up, turned over");
    expect(loadPrompt("ask-another-way", { optionRule: "RULE" })?.system).not.toContain(
      "picked up, turned over"
    );
  });
});

import { REACH_OPTIONS, SITE_FEATURES } from "@/app/start/vocab";
import type { AskAnotherWayOption } from "./ask-another-way-contract";
import type { LessonSupportTask } from "./lesson-support-contract";
import { loadPrompt, loadSections } from "./prompt-registry";

/**
 * The prompt store — versioned, in-repo, the source of truth.
 *
 * Every AI helper's prompt lives here as committed code, not pulled from a
 * network service, so this AGPL repo builds and runs the features with ZERO
 * external prompt config. When a Nature Class Langfuse project is configured
 * (see ./langfuse), each generation is TRACED to it for observability and
 * eval — but the prompt text a call actually uses is always the one committed
 * here. Langfuse observes; the repo owns.
 *
 * Bump a prompt's `version` whenever its text changes: the version travels
 * with every trace so a regression can be pinned to the exact prompt that
 * produced it.
 *
 * The three rules every helper prompt upholds (from epic #25):
 *   1. The AI never speaks to the class. It drafts words the teacher says.
 *   2. One tap, cold thumbs — the output must be usable at a glance, outside.
 *   3. Uncertainty is spoken honestly — never fake a confidence a teacher
 *      would then have to defend to a curious child.
 */


export interface HelperContext {
  /** The session's topic, e.g. "trees" — grounds the register, never invented. */
  topic?: string;
  /** The learning objective, so a rephrase keeps the lesson's intent. */
  objective?: string;
  /** The age band label, e.g. "Reception". */
  ageBand?: string;
}

export interface BuiltPrompt {
  id: string;
  /** The registry prompt this came from, when it differs from `id`. */
  name?: string;
  version: number;
  system: string;
  user: string;
}

export interface LessonSupportContext {
  sessionTitle: string;
  objective: string;
  ageBand: string;
  childWork: string;
  phaseTitles: string[];
  currentPhase?: string | null;
  authoredWords?: string | null;
  safetyAndCare: string[];
  localFacts: string[];
  /**
   * The region's calendar for this week, never a reading taken at this school
   * (#1281). Deliberately NOT part of `localFacts`: the prompt licenses a
   * presence claim from that list and only from that list, so a regional
   * expectation folded into it would license "there are blackberries here"
   * off a sentence that only ever said the region's blackberries are in
   * season. Optional so every existing caller and fixture is unchanged.
   */
  regionalExpectation?: string | null;
  materialFallback?: string | null;
}


/**
 * One prompt for preparation and live teaching support. The task changes the
 * overlay, never the lesson kernel. All factual and safety context is closed.
 */
export function buildLessonSupport(input: {
  task: LessonSupportTask;
  context: LessonSupportContext;
  constraint?: string | null;
}): BuiltPrompt | null {
  const { context, task } = input;
  const lines = [
    `Task: ${task}`,
    `Lesson: ${context.sessionTitle}`,
    `Purpose: ${context.objective}`,
    `Class: ${context.ageBand}`,
    `Authored child work: ${context.childWork}`,
    `Authored route: ${context.phaseTitles.join(" → ")}`,
    context.currentPhase ? `Current phase: ${context.currentPhase}` : null,
    context.authoredWords ? `Current authored words: ${context.authoredWords}` : null,
    context.materialFallback
      ? `Authored material fallback: ${context.materialFallback}`
      : "Authored material fallback: none.",
    `Safety and care:\n${context.safetyAndCare.length > 0 ? context.safetyAndCare.map((line) => `- ${line}`).join("\n") : "- No extra safety or care line is authored. Keep ordinary school boundaries and make no new hazard claim."}`,
    `Verified local facts:\n${context.localFacts.length > 0 ? context.localFacts.map((line) => `- ${line}`).join("\n") : "- None available. Do not make a local nature claim."}`,
    // Its own heading, carrying its own limit, because the line above is the
    // one the house rules let a presence claim rest on (#1293). Absent when
    // the read was thin, which is the common case and adds no line at all.
    context.regionalExpectation
      ? `Regional expectation for this week, which is NOT a local fact and can never establish that anything is present at this school:\n- ${context.regionalExpectation}`
      : null,
    input.constraint?.trim() ? `Teacher's immediate need: ${input.constraint.trim()}` : null,
  ].filter((line): line is string => Boolean(line));

  const rules = loadSections("lesson-support-tasks");
  const rule = rules?.[task];
  if (!rule) return null;
  const prompt = loadPrompt("lesson-support", { taskRule: rule });
  if (!prompt) return null;

  return {
    id: `lesson-support-${task}`,
    name: "lesson-support",
    version: prompt.version,
    system: prompt.system,
    user: lines.join("\n"),
  };
}

/**
 * #390 · Ask it another way. One circle question, one teacher-picked axis, one
 * other way to ask the SAME question.
 *
 * Built exactly like `buildLessonSupport` and for the same reason: a fixed set
 * of teacher-chosen options is one prompt file plus one sectioned rule file,
 * not a second machinery beside the one that already runs ten of these. The
 * option rides in the id (`ask-another-way-simpler`) so a trace can say which
 * axis teachers actually reach for, while `name` stays the registry prompt so
 * the trace's link to it resolves — the dangling-link bug the lesson-support
 * split already cost us once.
 *
 * The question is passed in from the authored pack by the route, never from
 * the client, which is what makes "always rephrases the ORIGINAL" structural.
 */
export function buildAskAnotherWay(input: {
  option: AskAnotherWayOption;
  question: string;
  objective: string;
  ageBand?: string | null;
}): BuiltPrompt | null {
  const rules = loadSections("ask-another-way-options");
  const rule = rules?.[input.option];
  if (!rule) return null;
  const prompt = loadPrompt("ask-another-way", { optionRule: rule });
  if (!prompt) return null;

  const lines = [
    `The question, exactly as it is written on the plate: ${input.question}`,
    `The lesson's aim, which your version must still serve: ${input.objective}`,
    input.ageBand?.trim() ? `The class: ${input.ageBand.trim()}` : null,
  ].filter((line): line is string => Boolean(line));

  return {
    id: `ask-another-way-${input.option}`,
    name: "ask-another-way",
    version: prompt.version,
    system: prompt.system,
    user: lines.join("\n"),
  };
}

/**
 * #549 · The shared context a prompt can be TOLD, as one table.
 *
 * This used to be three `if` statements. It is a table because the same three
 * facts are needed in two places that had no way to see each other:
 *
 *   - here, to compose the user message
 *   - in `scripts/validate-prompts.mjs`, to decide whether a prompt's TEXT is
 *     allowed to point at a class, a topic or an aim
 *
 * The #538 first head rewrote the shared house voice to say "at a register the
 * class you are told about understands", and three prompts include that
 * paragraph. `buildGroundingLine`'s only caller (`lib/grounding.ts`) passes
 * `{topic, objective}` and no class, so the read-aloud drafter was pointed at
 * something it is never given — and every mechanical check was green, because
 * the lockfile can see that the text CHANGED and nothing could see what the
 * text now MEANS.
 *
 * Each prompt declares in its own frontmatter which of these keys it is
 * guaranteed (`context: [topic, objective]`). The declaration lives in the
 * prompt file because that is the file a person is editing when they can break
 * it. It is held to the code by `tests/unit/prompt-contracts.spec.ts`, which
 * builds each prompt from its real callers' argument shapes and fails if a
 * declared key is not actually in the user message. Adding a fourth context
 * line here without teaching the validator its nouns fails that suite too.
 */
export const CONTEXT_FIELDS = [
  { key: "topic", field: "topic", label: "Today's topic" },
  { key: "objective", field: "objective", label: "The lesson's aim" },
  { key: "class", field: "ageBand", label: "The class" },
] as const satisfies ReadonlyArray<{
  key: string;
  field: keyof HelperContext;
  label: string;
}>;

/** A shared context key a prompt's text may be permitted to refer to. */
export type ContextKey = (typeof CONTEXT_FIELDS)[number]["key"];

function contextLines(ctx: HelperContext): string {
  const parts: string[] = [];
  for (const { field, label } of CONTEXT_FIELDS) {
    const value = ctx[field];
    if (value) parts.push(`${label}: ${value}.`);
  }
  return parts.join(" ");
}

/**
 * #126 · The grounding line. Turn today's verified nature facts into ONE
 * short line that tells the class what to FIND outside, tied to the session's
 * own topic — never a weather report beside the lesson, never an invented
 * species. The facts block is CLOSED: it is composed upstream (lib/grounding)
 * exclusively from tokens Pointmoon actually returned, and the prompt forbids
 * reaching past it. Empty facts never reach this prompt — the caller returns
 * the deterministic line instead.
 */
export function buildGroundingLine(facts: string, ctx: HelperContext = {}): BuiltPrompt | null {
  const context = contextLines(ctx);
  const prompt = loadPrompt("nature-grounding-line");
  if (!prompt) return null;
  return {
    ...prompt,
    user: `${context ? context + "\n\n" : ""}${facts}`,
  };
}

/**
 * #280 · The onboarding assistant. Read a teacher's free-form paragraph about
 * her own school grounds and propose candidate place facts, EACH tied to the
 * fragment of her own words it came from. This is the only prompt in the
 * product that reads a teacher's free-form sentence rather than a closed set
 * of authored facts, so it carries its own extra rules the other prompts do
 * not need:
 *
 *   - the model LISTENS, it does not KNOW: map what she said onto our
 *     vocabulary where it fits, keep her own words where it does not, and
 *     never add anything she did not say
 *   - every candidate MUST carry the exact words it was read from (`quote`),
 *     because `parseWorldExtractDraft` drops any candidate whose quote it
 *     cannot find in her own input, so a candidate with an invented quote is
 *     a wasted extraction, not a smuggled fact
 *   - never extract a child's name, a child's incident, or anything about a
 *     specific child. This is a place-facts extractor, not a class-facts one
 *     (#280's surface 2, the class, does not exist yet). If a sentence is
 *     about a child rather than the grounds, leave it out entirely
 */
export function buildWorldExtract(input: { text: string }): BuiltPrompt | null {
  const prompt = loadPrompt("world-extract", {
    featureList: SITE_FEATURES.map((f) => `"${f}"`).join(", "),
    reachList: REACH_OPTIONS.map((r) => `"${r.id}" (${r.label})`).join(", "),
  });
  if (!prompt) return null;
  return { ...prompt, user: input.text };
}

/**
 * #377 · The onboarding photograph. A teacher points her camera at a corner of
 * her own grounds and candidate place facts come back for her to confirm —
 * the same confirm-or-reject flow the paragraph path already runs.
 *
 * A photograph has no quote, so the quote-in-source guard that keeps the text
 * path honest cannot run here. The replacement invariant, which
 * `parseWorldPhotoDraft` enforces regardless of what this prompt is answered
 * with: only two kinds of candidate are admissible from a photo — a closed
 * SITE_FEATURES value (which cannot carry a name), or a species name that is
 * actually in the local seasonal record (the record standing in for her
 * words). Free text from a photograph never becomes a note.
 *
 * The prompt states the limits the guard enforces, because a guard the model
 * cannot see is a guard it will blunder into (#218's ruling).
 *
 * PRIVACY, absolute: if any person is visible the whole read is refused and
 * nothing is kept. This is the one place the model is asked to speak up
 * about a person — so the read can be rejected, never so it can be used.
 */
export function buildWorldPhotoExtract(input: {
  allowedSpecies: readonly string[];
}): BuiltPrompt | null {
  const prompt = loadPrompt("world-photo-extract", {
    featureList: SITE_FEATURES.map((f) => `"${f}"`).join(", "),
    speciesList:
      input.allowedSpecies.length > 0
        ? input.allowedSpecies.map((s) => `"${s}"`).join(", ")
        : "(none known for this place yet)",
  });
  if (!prompt) return null;
  return { ...prompt, user: "What does this photograph of the school grounds clearly show?" };
}

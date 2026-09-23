/**
 * The plate-draft primitive — the one shared AI path.
 *
 * Every mid-session helper (epic #25) works the same way: take an existing
 * plate's words, ask the model to draft new words INTO that plate, hand the
 * teacher the result to say in their own voice.
 *
 * The plumbing itself now lives in ./draft, which every model call in the
 * product shares. What is left here is the plate-facing half: which prompt,
 * which parser, which guard. A new helper is a `build*` prompt in ./prompts
 * and a parser here. Nothing in a route or a component reaches the model
 * directly.
 */

import {
  buildAskAnotherWay,
  buildGroundingLine,
  buildLessonSupport,
  buildWorldExtract,
  buildWorldPhotoExtract,
  type HelperContext,
  type LessonSupportContext,
} from "./prompts";
import {
  checkAskAnotherWay,
  parseAskAnotherWayDraft,
  type AskAnotherWayFacts,
  type AskAnotherWayOption,
} from "./ask-another-way-contract";
import { crossesSafetyBoundary, shortText } from "./lesson-support-contract";
import { draft } from "./draft";
import {
  parseLessonSupportDraft,
  type LessonSupportDraft,
  type LessonSupportTask,
} from "./lesson-support-contract";
import {
  parseWorldExtractDraft,
  parseWorldPhotoDraft,
  type WorldExtractDraft,
  type WorldPhotoDraft,
} from "./world-extract-contract";

export { isModelAvailable } from "./model";
export { parseLessonSupportDraft } from "./lesson-support-contract";
export { askAnotherWayOptions, askAnotherWayLabels } from "./ask-another-way-contract";
export type { AskAnotherWayOption } from "./ask-another-way-contract";
export type { LessonSupportDraft, LessonSupportTask } from "./lesson-support-contract";
export type { WorldExtractDraft, WorldFactCandidate, WorldFactKind } from "./world-extract-contract";

/**
 * #126 · The grounding line. One find-something line composed from a closed
 * block of verified Pointmoon facts, or null. A `{"line": null}` reply is the
 * model's honest "these facts don't support this topic" — it parses to null
 * here and the caller falls back to the deterministic line, exactly like a
 * miss. (The trace marks both the same way; the fallback tier tells them
 * apart server-side, which is where it matters.)
 */
export async function groundingLine(
  facts: string,
  ctx: HelperContext = {}
): Promise<string | null> {
  const prompt = buildGroundingLine(facts, ctx);
  if (!prompt) return null;

  return draft({
    prompt,
    facts: null,
    maxTokens: 200,
    parse: (json) => {
      // This line reaches a teacher through /api/conditions and is read
      // ALOUD to a class before they go outside, which is the read-aloud
      // path #244 was about. It was left off that pass by oversight
      // (office#332): nothing recorded a reason, and its own prompt calls it
      // "one warm sentence a teacher says aloud to her class". The
      // two other drafters #244 guarded, the rephrase and the held answer,
      // were deleted as dead code, so this is now the only read-aloud
      // drafter and the only place the guard runs. Backstop only: the prompt
      // already forbids this material and the closed fact block gives it
      // nothing to reach for.
      //
      // `shortText` is the SAME cap `parseLessonSupportDraft` puts on every
      // one of its own fields — length, no markup, no URL, the em-dash swap
      // — which #244 asked for here too ("plus the same caps") and the first
      // pass only half-delivered: it wired in `crossesSafetyBoundary` but
      // left the hand-rolled trim in place, so a line with a stray `<script>`
      // or a bare URL still passed. One cap, reused, closes that.
      const line = (json as { line?: unknown })?.line;
      const trimmed = shortText(line, 400);
      if (!trimmed) return null;
      if (crossesSafetyBoundary(trimmed)) return null;
      return trimmed;
    },
  });
}

/** One bounded overlay for preparation or the live teacher tool. */
export async function draftLessonSupport(input: {
  task: LessonSupportTask;
  context: LessonSupportContext;
  constraint?: string | null;
}): Promise<LessonSupportDraft | null> {
  const prompt = buildLessonSupport(input);
  if (!prompt) return null;

  return draft({
    prompt,
    facts: null,
    maxTokens: 500,
    parse: parseLessonSupportDraft,
  });
}

/**
 * #390 · Ask it another way. One rephrasing of the SAME circle question, on
 * the axis the teacher tapped, or null.
 *
 * Null on every kind of miss — no prompt, no model, unparseable, a guard
 * refusal, or the model's own `{"question": null}` when the axis cannot be
 * taken without asking something else. The caller shows nothing new and the
 * authored question stays on the plate, which is the acceptance criterion:
 * the failure is silent to the class.
 *
 * One rephrasing per tap, not two. #27 returned a pair for the teacher to
 * compare, which is a choice to make in a silence she is trying to end.
 */
export async function draftAskAnotherWay(input: {
  option: AskAnotherWayOption;
  question: string;
  objective: string;
  ageBand?: string | null;
}): Promise<string | null> {
  const prompt = buildAskAnotherWay(input);
  if (!prompt) return null;

  const facts: AskAnotherWayFacts = {
    question: input.question,
    objective: input.objective,
    option: input.option,
  };

  return draft({
    prompt,
    facts,
    maxTokens: 200,
    parse: parseAskAnotherWayDraft,
    check: checkAskAnotherWay,
  });
}

/**
 * #280 · The onboarding assistant. Read one free-form paragraph and propose
 * candidate place facts for the teacher to confirm — never written anywhere
 * by this call, which only drafts.
 *
 * `parseWorldExtractDraft` needs the raw input text as well as the reply, for
 * the quote-in-source guard and the person-reference backstop. That
 * requirement is why this used to hand-roll its own callModel and trace: the
 * old seam passed a parser the reply and nothing else. The seam now carries
 * the call's facts through to the parser, so the bypass is gone.
 */
export async function extractWorldFacts(text: string): Promise<WorldExtractDraft | null> {
  const prompt = buildWorldExtract({ text });
  if (!prompt) return null;

  return draft({
    prompt,
    facts: text,
    maxTokens: 700,
    parse: (json, source) => parseWorldExtractDraft(json, source),
  });
}

/**
 * #377 · The onboarding photograph. One photo of her own grounds in,
 * candidate place facts out — held to `parseWorldPhotoDraft`'s replacement
 * invariant (closed features, record-membered species, never free text),
 * because a photograph has no quote for the text path's guard to check.
 *
 * The image lives for this call and this call alone: it is not written, not
 * logged, and not traced. The trace records shape only, as everywhere else.
 */
export async function extractWorldFactsFromPhoto(input: {
  image: { mediaType: "image/jpeg" | "image/png" | "image/webp"; base64: string };
  allowedSpecies: readonly string[];
}): Promise<WorldPhotoDraft | null> {
  const prompt = buildWorldPhotoExtract({ allowedSpecies: input.allowedSpecies });
  if (!prompt) return null;

  return draft({
    prompt,
    facts: input.allowedSpecies,
    image: input.image,
    maxTokens: 500,
    parse: (json, allowed) => parseWorldPhotoDraft(json, allowed),
  });
}

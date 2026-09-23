/**
 * THE DRIVING QUESTION, AND WHEN NOT TO SHOW IT (nc#150).
 *
 * `session.prompt` is Johan's verbatim driving question and it is never
 * rewritten here. This module decides one thing only: whether showing it, on a
 * surface that is already showing the session's title or objective beside it,
 * tells the teacher anything she is not already reading.
 *
 * WHY A DISPLAY RULE AND NOT A CONTENT FIX
 *
 * Three shipped sessions carry a `prompt` that restates a neighbouring field:
 *
 *   - `spring-w4-bird-feeders` - prompt and objective are the SAME sentence,
 *     byte for byte ("Making bird feeders and encouraging wildlife in your
 *     school grounds.").
 *   - `summer-w3-a5-leaf-collage` - prompt is a truncation of the objective
 *     ("Create art with nature." above "Create art with nature, taking
 *     influence from what the children see around them.").
 *   - `summer-w2-minibeast-hunting` - prompt is the session TITLE with a full
 *     stop added ("Minibeast hunting." under "Minibeast hunting").
 *
 * All three are Johan's recovered curriculum, guarded byte for byte by
 * `scripts/verbatim-fidelity.mjs`. Rewriting the lines is his call and his
 * alone (nc#150 option (a)); until he writes them, the honest thing the
 * renderer can do is stop printing the same sentence twice. `app/read/page.tsx`
 * predicted this in a comment before anyone filed it: stacked, the pair "reads
 * as a rendering bug rather than as two fields."
 *
 * Nothing here edits a pack. Suppression is total (the line is absent, not
 * greyed or elided), so no half-sentence of Johan's ever renders.
 *
 * ── THE RULE, AND WHERE ITS BOUNDARY IS ────────────────────────────────────
 *
 * Compare WORDS, not bytes: NFC, case-folded, every run of punctuation and
 * whitespace treated as one separator. That is what lets "Create art with
 * nature." meet "Create art with nature, taking influence ..." at all.
 *
 * Then, in order:
 *
 *   0. A prompt ending in "?" is ALWAYS shown. The question mark is the
 *      author's own statement that this field is a real driving question, and
 *      it is the same crude, deliberate test `doorQuestion` already uses in
 *      `lib/lesson/door.ts`. Forty-seven of the fifty-six shipped prompts end
 *      in one; none of the three defects above does. This clause is what keeps
 *      the rule from ever eating an authored question.
 *
 *   1. TITLE RESTATEMENT - suppress when the prompt's words EQUAL the title's
 *      words. Equality only, no prefix tolerance: titles are two or three
 *      words, and a real driving question is allowed to open with them
 *      ("Bark rubbings" / "Every tree wears its own coat." must both survive,
 *      and would not under a prefix test on a two-word title).
 *
 *   2. OBJECTIVE COLLISION - suppress when the prompt's words are a PREFIX of
 *      the objective's words (equality included). Prefix, because truncation
 *      is the observed defect: the prompt is the objective's opening clause
 *      with a full stop dropped on it.
 *
 * The prefix boundary is the whole point. "Shares an opening clause" is NOT
 * enough to be suppressed - the prompt has to add no word at all. A genuinely
 * different question that happens to start the same way diverges at some token
 * ("Create art with nature and leave it where you found it." diverges at
 * "and"), and diverging at one token is enough to keep the line.
 *
 * Deliberately NOT covered: an objective that CONTAINS the prompt somewhere
 * other than its start. Two spring sessions do this - "Using natural resources
 * to create." under "About using natural resources to create." - and they are
 * a different defect (a lead-in glued to the front of the objective) that this
 * ticket did not measure and Johan did not rule on. Widening `isPrefix` to
 * `includes` would swallow them silently; they are named in nc#150 instead.
 */

import type { Session } from "@/schema/pack";

/** The fields this rule reads. Structural, so tests can pin it without a pack. */
export type DrivingQuestionInput = Pick<Session, "title" | "objective"> & {
  prompt?: string | undefined;
};

/** Why a prompt was suppressed, for tests and for anyone reading a diff. */
export type PromptRestatement = "title" | "objective";

/**
 * Words, for comparison only. Letters, digits and the apostrophes inside them
 * ("What's" stays one word); everything else separates. Never rendered.
 */
export function words(text: string): string[] {
  return text
    .normalize("NFC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}'’]+/u)
    .filter(Boolean);
}

export function sameWords(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((word, index) => word === b[index]);
}

function opensWith(whole: readonly string[], head: readonly string[]): boolean {
  return head.length > 0 && head.length <= whole.length && head.every((word, index) => word === whole[index]);
}

/**
 * Which neighbouring field this session's prompt restates, or null when it
 * says something of its own. Exported for tests and for diagnostics; renderers
 * want `drivingQuestion` below.
 */
export function promptRestates(session: DrivingQuestionInput): PromptRestatement | null {
  const prompt = session.prompt?.trim();
  if (!prompt) return null;
  // (0) An authored question is always the author's, whatever it overlaps.
  if (prompt.endsWith("?")) return null;

  const asked = words(prompt);
  if (asked.length === 0) return null;
  // (1) The title, restated. Equality only.
  if (sameWords(asked, words(session.title))) return "title";
  // (2) The objective, whole or truncated.
  if (opensWith(words(session.objective), asked)) return "objective";
  return null;
}

/**
 * The session's driving question as it should RENDER: Johan's string verbatim,
 * or null where printing it would print a neighbouring field twice.
 *
 * Every surface that shows the prompt next to the title or the objective goes
 * through this - /season's shelf, the lesson journey behind /session and
 * /today, the journal, the run screen, the printed flash cards - so the rule
 * lives in one place and moves in one place when Johan writes the two lines.
 */
export function drivingQuestion(session: DrivingQuestionInput): string | null {
  // Johan's string, exactly as the pack carries it. The trim above is for the
  // comparison only; what renders is never a version of his line.
  if (!session.prompt?.trim()) return null;
  return promptRestates(session) === null ? session.prompt : null;
}

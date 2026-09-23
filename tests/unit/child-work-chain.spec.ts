import { describe, expect, it } from "vitest";
import { loadAllPacks } from "@/lib/pack";
import { childWorkSummaryOf } from "@/lib/lesson/journey";
import type { Session } from "@/schema/pack";

/**
 * ONE CHAIN ANSWERS "WHAT DO THE CHILDREN DO" (#524).
 *
 * The lesson doorway used to carry its own version of this question —
 * `childWorkSummary ?? primer.summary` — while the lesson journey used the
 * child's sheet. Two chains for one question is how they came to disagree,
 * and the disagreement shipped: on most sessions the doorway answered with a
 * paragraph about the concept instead of a line about the children.
 */

/** The shipped shelf, through the loader the app itself uses. */
function everySession(): Session[] {
  return loadAllPacks().flatMap((pack) => pack.sessions);
}

describe("the child-work chain", () => {
  it("answers for every session on the shelf, so no surface needs a fallback paragraph", () => {
    const sessions = everySession();
    expect(sessions.length).toBeGreaterThan(40);
    const silent = sessions.filter((session) => childWorkSummaryOf(session) === null);
    expect(silent.map((session) => session.id)).toEqual([]);
  });

  it("answers in a line rather than an essay, wherever the answer is DERIVED", () => {
    // The defect this replaced was an 84-word primer paragraph standing in for
    // one sentence, so a ceiling is what stops prose returning by another
    // route — a chain step reaching for a paragraph would trip this.
    //
    // Only the derived steps are measured. `childWorkSummary` is authored, and
    // one of them runs to 43 words: the garden-to-table session, where Johan
    // wrote a long sentence on purpose. Length is his call on his own text,
    // and a test that failed on it would be this file deciding it knows better
    // than the author — which is the same instinct the verbatim guard exists
    // to refuse.
    const tooLong = everySession()
      .filter((session) => !session.childWorkSummary)
      .map((session) => ({ id: session.id, words: (childWorkSummaryOf(session) ?? "").split(/\s+/).length }))
      .filter((entry) => entry.words > 40);
    expect(tooLong).toEqual([]);
  });

  it("prefers the authored summary wherever one exists", () => {
    const authored = everySession().find((session) => session.childWorkSummary);
    expect(authored).toBeDefined();
    expect(childWorkSummaryOf(authored!)).toBe(authored!.childWorkSummary);
  });

  it("never reaches for the primer, which is about the concept and not the children", () => {
    const withPrimer = everySession().filter(
      (session) => !session.childWorkSummary && session.primer?.summary
    );
    expect(withPrimer.length).toBeGreaterThan(10);
    for (const session of withPrimer) {
      expect(childWorkSummaryOf(session)).not.toBe(session.primer?.summary);
    }
  });
});

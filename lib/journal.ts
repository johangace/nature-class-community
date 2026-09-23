import { reflectionWords } from "@/lib/reflection";

/**
 * What a term of reflection taps adds up to (#327).
 *
 * The four close questions have been collected since the runner shipped and
 * shown to nobody, not even the teacher who answered them. This turns them
 * back into a sentence she can read. It is arithmetic over her own class's
 * rows: no AI, no service, nothing pooled across schools, and nothing here
 * that is not already on the page one entry at a time.
 *
 * The honesty rules are the interesting part, and they are the reason this is
 * a pure function with tests rather than three counts inlined in the page:
 *
 *  - A question needs MIN_ANSWERS real answers before it says anything. Two
 *    taps are not a pattern, and "your class has asked for arts" off a single
 *    session would be a made-up finding printed in the product's own voice.
 *  - A leader must be a STRICT leader. Four arts and four making is not "your
 *    class asks for arts", so a tie says nothing at all rather than breaking
 *    itself on map order.
 *  - Every line carries its own denominator, so "5 of 9" can be checked by
 *    hand against the entries below it. A count without its total is the shape
 *    a dashboard takes, and this is a journal.
 */

/** Below this many answers to a question, that question stays silent. */
export const MIN_ANSWERS = 3;

export interface TapTally {
  /** The winning token, as words. */
  words: string;
  /** How many answers chose it. */
  count: number;
  /** How many answers that question has in total. */
  of: number;
}

export interface TermSignal {
  /** Sessions whose reflection has at least one tap. */
  reflected: number;
  mood: TapTally | null;
  happening: TapTally | null;
  timing: TapTally | null;
  moreOf: TapTally | null;
}

export interface ReflectionRecord {
  mood: string | null;
  happenings: string[];
  timing: string | null;
  moreOf: string | null;
}

/**
 * The strict leader among a question's answers, or null.
 *
 * Null when the question has fewer than MIN_ANSWERS answers, and null again
 * when the top two are level. `of` counts ANSWERS, not distinct tokens, so a
 * multi-select question (happenings) can report a count above its answer
 * total's share without lying about the denominator.
 */
function leader(values: string[]): TapTally | null {
  if (values.length < MIN_ANSWERS) return null;
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0];
  if (!top) return null;
  const runnerUp = ranked[1];
  if (runnerUp && runnerUp[1] === top[1]) return null;
  return { words: reflectionWords(top[0]), count: top[1], of: values.length };
}

/**
 * Read a term of completions. Rows with no taps at all are counted nowhere:
 * a skipped reflection is an absence of evidence, never a vote.
 */
export function termSignal(records: readonly ReflectionRecord[]): TermSignal {
  const withAny = records.filter(
    (r) => r.mood || r.happenings.length > 0 || r.timing || r.moreOf
  );
  return {
    reflected: withAny.length,
    mood: leader(records.flatMap((r) => (r.mood ? [r.mood] : []))),
    // One session can report several happenings; each is an answer of its own.
    happening: leader(records.flatMap((r) => r.happenings)),
    timing: leader(records.flatMap((r) => (r.timing ? [r.timing] : []))),
    moreOf: leader(records.flatMap((r) => (r.moreOf ? [r.moreOf] : []))),
  };
}

/** True when the summary has at least one line worth printing. */
export function hasSignal(signal: TermSignal): boolean {
  return Boolean(signal.mood || signal.happening || signal.timing || signal.moreOf);
}

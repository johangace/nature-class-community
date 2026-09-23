/**
 * THE HINGE — the one line that makes the app look like it read the day (#323).
 *
 * Sophia, on the home-screen sketch: *"If only one thing gets built from this
 * sheet, build the hinge. It is the only element here that makes the app look
 * like it read the day rather than fetched it, it needs no new integration,
 * and it is honest by construction."*
 *
 * ── WHAT IT DOES, AND WHAT IT REFUSES TO DO ────────────────────────────────
 *
 * The lesson's author writes a sentence and the condition it is true under.
 * This function decides whether today is that condition. That is all it does.
 * It does not compose the sentence, complete it, choose between fragments, or
 * soften it when the match is close, because every one of those is a way for
 * a line a teacher reads aloud to stop being a line a person wrote.
 *
 * ── ONE READING, THE ONE THE RUNNER ALREADY USES ───────────────────────────
 *
 * `presentConditions` reads the same Pointmoon payload the card and the
 * runner read and speaks every true kind in the pack's own vocabulary
 * (#1007: wet, windy, cold, hot, dry, still, bright). So a session that
 * authors a wet-weather phase variant AND a wet-day hinge fires both off one
 * reading, and there is no way for the two to disagree about whether it
 * rained.
 *
 * ── TWO REGISTERS (#1007) ──────────────────────────────────────────────────
 *
 * Every note carries a `teacher` line (the adult lane of the run's day screen,
 * the /outside brief) and may carry a `child` line, said to the class on the
 * board. Both are authored. The selector picks; it never writes.
 *
 * ── WHERE THE NOTE READS NOW (2026-09-08) ──────────────────────────────────
 *
 * Johan, on Today: *"the top slot can become smaller and less relevant. we can
 * add the lesson note on the runner inside with a conditions or something
 * label only when we have it"*.
 *
 * So the note left Today's top slot, where it had been one rung of a ladder
 * that made the same pixels advice on a wet Tuesday and a weather report on a
 * mild one. It reads in the RUNNER — the teacher-facing lane, on the day
 * screen the class is about to walk out of — under the label "Today's
 * conditions" with a drawn mark for the kind that matched. Today's top slot
 * now carries the composed read and nothing else, every morning.
 *
 * That is why the resolved note carries its `kind`. The mark is chosen from
 * the condition that actually fired, never from the day at large, so a wet
 * note that matched on `wet` cannot be drawn with the still line.
 *
 * ── SILENT IS THE COMMON CASE, AND THAT IS THE DESIGN ──────────────────────
 *
 * A mild day maps to no condition at all, so an ordinary Tuesday shows nothing.
 * Most sessions author no hinge yet, so most sessions show nothing. Both of
 * those are correct and neither is a gap to fill with a generated line: the
 * whole value of this element is that when it speaks, it is worth reading.
 */

import type { ConditionKind, Session } from "@/schema/pack";

/** The authored hinge for today, in both registers. `child` is null while a
 * note has only its teacher line. */
export interface Hinge {
  teacher: string;
  child: string | null;
  /**
   * The kind that MATCHED, which is what the runner's mark is drawn from.
   *
   * A note may be authored `when: ["wet", "windy"]`; this is the one of those
   * that is true today, in the author's own order, so the mark says what fired
   * rather than what the note is willing to fire on.
   */
  kind: ConditionKind;
}

/**
 * The notes to show today, or null.
 *
 * `present` is the day in the pack's vocabulary — `presentConditions(data)`,
 * every kind true of this moment — or one kind, or null for an ordinary day
 * and a failed read alike. The FIRST authored note whose `when` meets the day
 * wins, in the author's order, so an author who writes a wet note and then a
 * still note has said which matters more. Pure, so a test can walk every
 * session against every condition without a network. Nothing here composes:
 * the sentences are the author's, whole.
 */
export function resolveHinge(
  session: Pick<Session, "conditionNotes">,
  present: readonly ConditionKind[] | ConditionKind | null
): Hinge | null {
  const notes = session.conditionNotes;
  if (!notes || present === null) return null;
  const today = new Set(typeof present === "string" ? [present] : present);
  if (today.size === 0) return null;
  for (const note of notes) {
    // The author's order twice over: the first note that meets the day wins,
    // and within it the first of its own kinds that is true is the one the
    // mark is drawn from.
    const kind = note.when.find((k) => today.has(k));
    if (kind) return { teacher: note.teacher, child: note.child ?? null, kind };
  }
  return null;
}

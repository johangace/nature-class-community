import type { Hinge } from "@/lib/lesson/hinge";
import { ConditionMark } from "./ConditionMark";
import styles from "./conditions-note.module.css";

/**
 * TODAY'S CONDITIONS, AS ONE LABELLED NOTE (2026-09-08).
 *
 * Johan, on Today (2026-09-07): *"the top slot can become smaller and less
 * relevant. we can add the lesson note on the runner inside with a conditions
 * or something label only when we have it"*. Then, on the lesson page: *"i
 * said somewhere here i dont see the line"* — he went looking for the note
 * where he prepares the lesson and it was only on the run's day screen.
 *
 * ── ONE COMPONENT, THREE PLACEMENTS, AND TODAY IS NOT ONE OF THEM ──────────
 *
 *   the lesson page, under the facts line and above "Before class"
 *   the "Before class" pre-reading row, as one short line (see the session
 *     page's own component — that placement is a line, not this block)
 *   the runner's day screen, in the teacher-facing lane
 *
 * Today's top slot carries the composed read and nothing else, on purpose
 * (#1037): the ladder that made the same pixels advice on a wet Tuesday and a
 * weather report on a mild one is what this note leaving Today removed. It
 * does not come back here by another door.
 *
 * ── THE ABSENCE RULE IS THE FEATURE ────────────────────────────────────────
 *
 * There is no empty state, at any placement. A mild day maps to no condition,
 * most sessions author no note, and both are silence rather than a gap to
 * fill. The caller decides by having a hinge at all; this never renders a
 * placeholder, and it reserves no space when it does not draw.
 *
 * ── THE MARK IS LICENSED BY THE WORDS, NOT BY A CAPTION ────────────────────
 *
 * `ConditionMark` is `aria-hidden`, and Sophia's sketch specifies why: the
 * label and the authored note are both real text in the reading order before
 * it. A third announcement would read one fact to a screen-reader user that
 * nobody else is told twice. See app/ConditionMark.tsx.
 */
export function ConditionsNote({
  hinge,
  className,
}: {
  hinge: Hinge;
  /**
   * The surface's own measure and reading distance (2026-09-08).
   *
   * This component owns the note's IDENTITY -- the label, the mark, the ink,
   * the order. It does not own how wide the column is or how far away it is
   * read from, because those belong to the page, and a shared rule that
   * decided them was exactly what made this note narrower than the page it
   * had been dropped into. The lesson page passes nothing and takes the body
   * register; the runner passes its own.
   */
  className?: string;
}) {
  return (
    <div className={className ? `${styles.conditionNote} ${className}` : styles.conditionNote}>
      <p className={styles.conditionLabel}>
        <ConditionMark className={styles.conditionMark} kind={hinge.kind} />
        <span className={styles.conditionLabelText}>Today&rsquo;s conditions</span>
      </p>
      <p className={styles.note}>{hinge.teacher}</p>
    </div>
  );
}

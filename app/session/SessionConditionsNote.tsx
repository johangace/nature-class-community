import { resolveHinge } from "@/lib/lesson/hinge";
import { getTodayRead, type TodayReadQuery } from "@/lib/outside/today";
import type { Session } from "@/schema/pack";
import { ConditionsNote } from "../ConditionsNote";
import styles from "./session-modes.module.css";

/**
 * THE LESSON PAGE READS THE DAY (2026-09-08).
 *
 * Johan, on the "View session" screen: *"i said somewhere here i dont see the
 * line"*. The authored note had one placement, the run's day screen, and he
 * went looking for it on the page where he actually prepares the lesson.
 *
 * ── WHY THIS IS ITS OWN COMPONENT AND NOT A PROP ON `SessionModes` ─────────
 *
 * `SessionModes` is a synchronous composition of data the loader already has.
 * The note is the one thing on that page that needs Pointmoon, and Pointmoon's
 * own budget is ten seconds. Awaiting it in the loader would put the whole
 * lesson page behind the weather: a teacher standing at a door would wait for
 * a sentence that most days does not exist.
 *
 * So the note streams. These are async server components behind their own
 * Suspense boundaries, exactly as `TodayDay` streams into Today, and the page
 * paints without them.
 *
 * ── THE HOLD RESERVES NOTHING, AND THAT IS DELIBERATE ─────────────────────
 *
 * Today's read gets a shimmer because it is the top of the page and it almost
 * always resolves to something (#355). This is the opposite case on both
 * counts: it sits mid-page, and it resolves to NOTHING on most mornings, for
 * two independent reasons — a mild day matches no condition, and most sessions
 * author no note at all. A hold shaped like a note would therefore be a
 * promise the page usually breaks, and the collapse would push "Before class"
 * up the screen after it had already been read. `null` is the honest fallback:
 * nothing appears, then either a note appears or nothing does.
 *
 * ── IT SAYS IT ONCE (2026-09-08) ──────────────────────────────────────────
 *
 * There was a second placement for one day: the same sentence again as a
 * "Today: ..." line on the pre-reading row, under "What to bring". Johan, on
 * the shipped page: *"also remove from Today."* The block above it had already
 * said it, forty pixels up, and one fact printed twice on one screen is the
 * fault that has taken three elements off these surfaces already. It is gone
 * rather than reworded, and the query still reaches this file once.
 */

/** The block, under the facts line and above "Before class". */
export async function SessionConditionsNote({
  session,
  query,
}: {
  session: Pick<Session, "conditionNotes">;
  query: TodayReadQuery;
}) {
  const today = await getTodayRead(query);
  const hinge = resolveHinge(session, today.conditions);
  if (!hinge) return null;
  return (
    <section className={styles.conditions} aria-label="Today's conditions">
      <ConditionsNote hinge={hinge} />
    </section>
  );
}

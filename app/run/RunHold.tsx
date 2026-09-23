import styles from "./hold.module.css";

/**
 * THE ONE HOLD THE RUNNER USES, IN BOTH PLACES IT CAN BE BLANK (#355, #253).
 *
 * There are two different blanks on this journey and they were never the same
 * bug, which is why fixing one would not have fixed the other:
 *
 *   1. THE SERVER BLANK. `/run` has no Suspense boundary, so the browser holds
 *      the previous page or a white document for the whole render — measured
 *      at 7,480ms to first byte on a cold instance. `app/run/loading.tsx`
 *      renders this, which also makes it appear WITHIN A FRAME of the press:
 *      Enter is a `<Link>`, and the App Router paints a route segment's
 *      loading file immediately on navigation, before the server is asked
 *      anything. A button that appears to do nothing gets pressed again, and a
 *      second press here starts a second set of the same expensive reads.
 *
 *   2. THE CLIENT BLANK (#253). After all that, `Runner.tsx` returned a bare
 *      `<main className="run" />` until its mount effect flipped `ready` — the
 *      empty page reported on 16 August, one day before a live prototype, on
 *      the cold demo URL a stranger is most likely to open. That report has an
 *      open question about the effect's dependency array, and this does NOT
 *      close it: the blank is no longer blank, but if `ready` never flips this
 *      now shimmers forever instead. Whether it flips is #253's own fix.
 *
 * Both are the same thing to a teacher standing at a door, so both get the
 * same answer, and it is one component rather than two so they cannot drift.
 *
 * It holds the runner's own three-row frame — head, beat, control — so the
 * real screen lands where the hold was instead of jumping into place.
 */
export function RunHold() {
  return (
    <main className={styles.hold} role="status" aria-busy="true" aria-live="polite">
      {/* The only words, and they are about what is happening rather than
          about what is true. "Opening" is the press being acknowledged; it
          promises nothing about the sky, the species or the lesson. */}
      <span className={styles.srOnly}>Opening the lesson.</span>
      <div className={styles.bar} />
      <div className={styles.body} />
      <div className={styles.control} />
    </main>
  );
}

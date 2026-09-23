/**
 * The way back into a live lesson from a page it opened (#874).
 *
 * A teacher mid-run taps the bird her class has just pointed at. The species
 * profile is its own page, so the trip is a navigation; the run saves its
 * exact position in localStorage on every step, so coming back is a resume.
 * What was missing was the return path: the profile's back link went to
 * Today, and a fresh /run mount holds a saved run for an explicit "pick up"
 * choice rather than re-entering it. Both are right for a teacher who
 * reopened the app; both are wrong for one who left the lesson two seconds
 * ago to read a name.
 *
 * So a species link opened FROM a run carries the session, the profile links
 * back to that run with `resume=1`, and the runner treats that flag as the
 * teacher's choice already made: the saved position is applied silently, on
 * the same beat she left, with the clock still running.
 */

export const RESUME_PARAM = "resume";

/** The href a page opened from a run uses to return to it, on the same beat. */
export function returnToRunHref(sessionId: string): string {
  return `/run?session=${encodeURIComponent(sessionId)}&${RESUME_PARAM}=1`;
}

/** Whether a /run request asked to re-enter its saved position without asking. */
export function shouldAutoResume(value: string | string[] | undefined): boolean {
  return value === "1";
}

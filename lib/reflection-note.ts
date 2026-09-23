/**
 * "Anything else?" — the teacher's own words at the close (#347).
 *
 * The prototype's notebook ended with a free box ("What worked? What surprised
 * you?") and this build deliberately left it out; it is back on Johan's call.
 * One function, used by every path that writes it, so the note is normalised
 * the same way whether it arrives from the finish, from the journal days
 * later, or from an iPad's offline queue draining a week on.
 *
 * The rules, and why each one:
 *
 *  - TRIMMED, and empty becomes null. A teacher who opens the box, thinks
 *    better of it and deletes what she wrote leaves NULL, not "". "She wrote
 *    nothing" and "she cleared it" are the same fact and should not be two
 *    states in the database.
 *  - BOUNDED at 2000 characters. Long enough for anything anyone writes
 *    standing in a playground with a class going in; short enough that the
 *    column cannot become a document store. Over-long input is REJECTED by
 *    the API rather than silently truncated — losing the end of a teacher's
 *    sentence without telling her is worse than refusing it.
 *  - NEVER COUNTED. lib/journal.ts reads the four tap fields and not this, so
 *    the term summary cannot surface a sentence she wrote about one child.
 *    Nothing in this repository aggregates, indexes, or sends this text.
 *
 * This is the only open field on the close. It is the one to answer for first
 * if anything ever exports this table.
 */

export const NOTE_MAX = 2000;

/**
 * A note as it should be stored: trimmed, with empty read as absent.
 * Returns undefined for input that is not a string at all.
 */
export function normaliseNote(note: unknown): string | null | undefined {
  if (note === null) return null;
  if (typeof note !== "string") return undefined;
  const trimmed = note.trim();
  return trimmed === "" ? null : trimmed;
}

/** Whether a note is within the stored bound, measured after trimming. */
export function noteWithinBound(note: string): boolean {
  return note.trim().length <= NOTE_MAX;
}

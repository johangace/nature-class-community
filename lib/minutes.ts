/**
 * A phase's length has a zero case, and like the kit's zero case it is where
 * the product starts inventing.
 *
 * The source database carries a per-step `durationHint` on some sessions and
 * null on the others. The first port filled the nulls by dividing the session
 * total evenly across its phases, which is how Minibeast Hunting shipped an
 * "Explore" phase headed 5 min directly above its own say-aloud line, "give
 * children 10 minutes to explore". The words were real; the number beside them
 * was arithmetic dressed up as a decision.
 *
 * So an unknown length is now absent rather than guessed, and every surface
 * that shows a phase heading asks here rather than reaching for the field. One
 * helper instead of a truthy check copied into five files, because the next
 * renderer should not have to rediscover that this number is optional.
 */

/**
 * The minute badge for a phase, or null when nobody authored its length.
 * Callers render the string as-is and skip the element entirely on null —
 * never a bare "min" with the number missing in front of it.
 */
export function phaseMinutes(phase: { durationMin?: number }): string | null {
  return typeof phase.durationMin === "number" ? `${phase.durationMin} min` : null;
}

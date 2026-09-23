// The cast module's public face. Pure re-exports; no I/O of its own.

/**
 * ── THE STORAGE LAYER IS GONE (#284) ───────────────────────────────────────
 *
 * This file used to hold `resolveAndStoreCast`, `storeCast`, `getStoredCast`
 * and `hasCast`: the machinery that resolved a class's cast once, at the
 * onboarding location step, wrote a `CastMember` row per species, and then
 * left it alone until a teacher pressed "refresh nearby nature".
 *
 * It was careful machinery. It was idempotent, it was ownership-scoped, it
 * refused to replace a real cast with an empty one, and it had a
 * `requireRecentEvidence` guard so a deliberate refresh could not downgrade a
 * class to a regional-only list. None of that was the problem. The problem was
 * that it wrote anything down at all: a species list resolved in March is
 * still on screen in August, a row written on a photographless night carries
 * `photoUrl: null` forever, and neither state is distinguishable on screen
 * from a fresh one.
 *
 * Johan's ruling on 2026-08-17 replaced the whole model. The cast is resolved
 * from the current Pointmoon payload at read time (lib/cast/live.ts) and is
 * never persisted. The `CastMember` table itself is left in place and simply
 * unread — dropping a table is a one-way door and belongs in its own change,
 * with its own migration and its own approval.
 *
 * `resolveCast` is untouched and still exported: it was always pure, and
 * running it every morning instead of once is the entire change.
 */

export { resolveCast, hasRecentObservationEvidence } from "./resolve";
export type { ResolvedCast, ResolvedCastMember, HonestyTier } from "./resolve";
export { resolveLiveCast, type LiveCast, type LiveCastQuery } from "./live";

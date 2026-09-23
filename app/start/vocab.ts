/**
 * The /start flow's two small vocabularies: the year bands a class can be, and
 * the grounds a school can have.
 *
 * They live here rather than in actions.ts because actions.ts is a
 * `"use server"` module, and such a module may only export async functions. A
 * plain array exported from one does not reach the client as an array: Next
 * replaces it with a server reference, so `YEAR_GROUPS[0]` is undefined and
 * `GROUNDS.map(...)` throws "map is not a function" the moment screen 3
 * renders. The build does not catch it and neither does the typechecker; it
 * only shows up in a browser, which is how onboarding came to be dead at
 * screen 3 in production.
 *
 * Both the client flow and the server actions import from here, so there is
 * one list of each and the zod schemas still validate against exactly what the
 * teacher was offered.
 */

// Agnostic year bands — the small neutral set the build already ships. Kept
// deliberately not a UK ladder (grant-repo rule); grows when the pilot needs.
export { GROUP_TYPES, GROUP_OPTIONS, AGE_RANGES, type GroupType, type AgeRange } from "@/lib/group-profile";

export const YEAR_GROUPS = ["Reception", "Year 1", "Year 2"] as const;

// The grounds vocabulary offered on screen 5. Sentence-case, universal, short.
// Stored verbatim on the class; consumed by Outside-now's look-fors.
export const GROUNDS = ["trees", "meadow", "hedgerow", "pond", "playground", "coast"] as const;

// ---------------------------------------------------------------------------
// The school's own world (#277)
// ---------------------------------------------------------------------------

/**
 * Zoom three: the things inside a schoolyard that no map can see.
 *
 * A satellite reads canopy and water bodies. It cannot read a pond in a
 * courtyard, a log pile behind the shed, or a corner nobody mows. Those are
 * exactly the features that decide whether a lesson can happen, so they are
 * the teacher's to give and nobody else's.
 *
 * Sentence case, universal, and deliberately concrete: every entry is a thing
 * a teacher can walk to and point at. Nothing here is a category.
 *
 * This list is NOT the whole answer and is not meant to be. Our vocabulary is
 * short and a schoolyard is not, which is why `siteNotes` exists alongside it
 * and keeps her own words for whatever we have no box for.
 */
export const SITE_FEATURES = [
  "a pond",
  "a vegetable garden",
  "raised beds",
  "a log pile",
  "a bug hotel",
  "bird feeders",
  "a compost heap",
  "a wild corner nobody mows",
  "old walls",
  "one big tree",
  "a bit that floods in winter",
] as const;

export type SiteFeature = (typeof SITE_FEATURES)[number];

/**
 * Zoom four: how far a class can actually get.
 *
 * This is the one that decides what a lesson may ASK FOR. A school that can
 * only go onto hard surface must never be offered a session that needs a
 * meadow, and today nothing anywhere knows the difference.
 *
 * Ordered widest first. `hard-surface` last, because it is the tightest and
 * the one most likely to be missed by a form that assumed a field.
 */
export const REACH_OPTIONS = [
  { id: "beyond", label: "Further afield, with a walk" },
  { id: "grounds", label: "Our own grounds" },
  { id: "doorstep", label: "Just outside the door" },
  { id: "hard-surface", label: "Hard surface only" },
] as const;

export type ReachId = (typeof REACH_OPTIONS)[number]["id"];

export const REACH_IDS = REACH_OPTIONS.map((r) => r.id) as readonly ReachId[];

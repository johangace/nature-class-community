/**
 * The captions that carry the honesty claim on every "outside now" surface.
 *
 * Client-safe by construction: plain strings, no imports, nothing server-only,
 * so the Today card and the onboarding bloom can both read them. They live
 * together because the whole point is that they cannot drift apart — the
 * difference between "someone photographed this here" and "the season usually
 * brings this to the region" is the claim itself, and it was lost once already
 * when two surfaces each carried their own copy of one caption (#172).
 *
 * Register: sentence case, no possessive claim over what is out there, no em
 * dashes.
 */

/** Photographed observations, at these coordinates, recently. The strong claim. */
export const SEEN_CAPTION = {
  school: "Seen near your school lately",
  sample: "Seen lately near the sample patch",
  /**
   * The third register (#877): a signed-out visitor who answered "where is
   * your school?" on /start. It is her spot, so "the sample patch" would be
   * false; it is not a saved school, so "your school" would claim a row that
   * does not exist. The caption says exactly what it is.
   */
  chosen: "Seen lately near the place you chose",
} as const;

export type OutsideScope = keyof typeof SEEN_CAPTION;

/**
 * Whose patch a surface is about to caption, decided once (#877). Three
 * states, and the order matters: a read anchored on a class's coordinates is
 * "school", a signed-out visitor's chosen spot is "chosen", everything else is
 * the sample patch and says so. Lives here, pure, because every composer that
 * reads a surface cast needs the same answer and a test that mocks the cast
 * must not have to mock this too.
 */
export function outsideScope(surface: { located: boolean; chosen?: boolean }): OutsideScope {
  if (!surface.located) return "sample";
  return surface.chosen ? "chosen" : "school";
}

/**
 * `SEEN_CAPTION`, honest about WHICH sample patch (#463).
 *
 * "Seen lately near the sample patch" was true and unhelpful in the same
 * breath: eight personas in #454 all read live conditions for an unnamed
 * point in Canonbury and had no way to tell it was not their own school. The
 * geocoder already names the point for the regional claim
 * (`usuallyAroundCaption`, #350); this is the same zoom applied to the
 * strong, recorded claim. Falls back to the unnamed `SEEN_CAPTION.sample`
 * exactly as `usuallyAroundCaption` falls back to `USUALLY_AROUND_CAPTION` —
 * a point the geocoder could not name is a real state, not a gap to guess at.
 *
 * `SEEN_CAPTION.school` is untouched and reused verbatim: a place name must
 * never reach the school's own claim (introduce-today-door-line.spec.ts
 * pins this for `resolveDoor`, and the rule is the same claim here).
 */
export function seenCaption(scope: OutsideScope, placeName?: string | null): string {
  if (scope === "school") return SEEN_CAPTION.school;
  const name = placeName?.trim();
  if (scope === "chosen") return name ? `Seen lately near ${name}` : SEEN_CAPTION.chosen;
  return name ? `Seen lately near ${name}, the sample patch` : SEEN_CAPTION.sample;
}

export const OUTSIDE_DOOR_CAPTION: Record<OutsideScope, string> = {
  school: "See what’s happening around your school",
  sample: "See what’s happening near the sample patch",
  chosen: "See what’s happening near the place you chose",
};

export const REGIONAL_GAP_CAPTION: Record<OutsideScope, string> = {
  school: "Nobody has recorded these on your grounds. They are what the season brings to this region.",
  sample: "Nobody has recorded these near the sample patch. They are what the season brings to this region.",
  chosen: "Nobody has recorded these near the place you chose. They are what the season brings to this region.",
};

/**
 * THE RUNNER'S TWO CLAIMS (#370).
 *
 * #373 scoped Today and the door and said so on its own body: it "advances
 * #370" and deliberately did not close it. What it did not touch was
 * `app/run`, where two strings went on asserting a school outright — the
 * entity sheet's empty line and the assistant's unchecked-hazards line. The
 * runner is the surface a lesson is actually delivered from, so a signed-out
 * visitor with no school and no grounds was told about both while holding the
 * phone in a field.
 *
 * Whole sentences per scope rather than an interpolated fragment, exactly as
 * `REGIONAL_GAP_CAPTION` above: the claim is the thing under review, and a
 * reviewer has to be able to read all three of them side by side without
 * assembling any of them in their head.
 *
 * `school` is byte-identical to what shipped, which is not tidiness. The US
 * rendering swaps "grounds" for "schoolyard" by word-boundary rule
 * (`lib/localization.ts`), so an edit to that row is an unreviewed change to
 * American copy. The other two rows avoid the word entirely and take no swap.
 */
export const NO_RECORD_CAPTION: Record<OutsideScope, string> = {
  school:
    "Nothing has been recorded near your school this week, and no local note has been written for this species yet. Rather than guess, this stays quiet.",
  sample:
    "Nothing has been recorded near the sample patch this week, and no local note has been written for this species yet. Rather than guess, this stays quiet.",
  chosen:
    "Nothing has been recorded near the place you chose this week, and no local note has been written for this species yet. Rather than guess, this stays quiet.",
};

/** The hazards we have not checked, for a patch we can actually name (#370). */
export const HAZARDS_UNCHECKED_CAPTION: Record<OutsideScope, string> = {
  school: "We have not checked hazards for your grounds yet. Your own risk assessment leads.",
  sample: "We have not checked hazards for the sample patch yet. Your own risk assessment leads.",
  chosen:
    "We have not checked hazards for the place you chose yet. Your own risk assessment leads.",
};

/**
 * The region's seasonal record. Says what the season brings, and never that
 * anyone reported it at this school. Carries no photos by construction, so it
 * is rendered as plain names rather than in the sighting circles.
 */
export const USUALLY_AROUND_CAPTION = "Usually around here now";

/**
 * The same claim, zoomed in as far as the geocoder got (#350).
 *
 * Johan: *"as convention we zoom in as much as we can.. If we only know the
 * area we do that.. if we know their terrain we can do that."*
 *
 * THIS IS NOT A SECOND BAR. `lib/lesson/door.ts` records that a tighter
 * distance-and-recency test was proposed and ruled out on purpose, because two
 * vocabularies for one idea is how this repo ended up with two conditions
 * vocabularies. Nothing here tests anything new: it is the regional read, at
 * the radius it was always read at, with the name of the place we already
 * asked the geocoder for. "Usually around Canonbury now" is strictly more
 * specific than "Usually around here now" and exactly as true, because "here"
 * and "Canonbury" are the same coordinate.
 *
 * Falls back to the unnamed caption whenever the geocoder returned no name,
 * which is a real state and not a gap: an unnamed point still has a region.
 */
export function usuallyAroundCaption(placeName: string | null | undefined): string {
  const name = placeName?.trim();
  return name ? `Usually around ${name} now` : USUALLY_AROUND_CAPTION;
}

/**
 * The same regional claim, under a day that is not today (#755).
 *
 * "now" is a word about the present, and on a page a teacher has pointed at
 * next Thursday it is simply the wrong one: the entries below it come from the
 * phenology week containing THAT day, not this one. So the tense moves and
 * nothing else does. The claim, the radius and the source are untouched.
 *
 * "that week" rather than "on Thursday" because a phenology file has weekly
 * resolution and naming the day would be a precision we do not hold. This
 * caption never appears without the page heading that names the day, so
 * "that" always has an antecedent on screen.
 *
 * Offset 0 is the existing caption, word for word.
 */
export function usuallyAroundCaptionFor(
  placeName: string | null | undefined,
  offsetDays: number
): string {
  if (!(offsetDays > 0)) return usuallyAroundCaption(placeName);
  const name = placeName?.trim();
  return name ? `Usually around ${name} that week` : "Usually around here that week";
}

/* USUALLY_AROUND_NOTE retired by founder ruling: a caption that needs a
   disclaimer sentence under it is the wrong caption. "Usually around here
   now" already states the tier in the teacher's own words. */

/* ------------------------------------------------------------------ #305 */

/**
 * Which of the two claims a surface is about to make.
 *
 * "recorded" means Pointmoon holds photographed observations at these
 * coordinates. "regional" means the seasonal file for a region that can be a
 * continent wide, and it is the weaker claim by a long way.
 */
export type LookForTier = "recorded" | "regional";

/** A reaction line, with the label that states which claim it is making. */
export interface ReactionLine {
  tier: LookForTier | null;
  /** The small label above the line. Never outruns `tier`. */
  label: string;
  /** The sentence itself. */
  line: string;
}

/**
 * The onboarding reaction line, composed from whichever source is actually
 * available, with the wording changing to match (#305).
 *
 * WHY THIS IS NOT A TEMPLATE STRING IN THE COMPONENT. It used to be, and it
 * said "Now looking for Apple, European Garden Spider, Common Pear near you
 * this week" to a class whose coordinates resolved to `western-europe` — one
 * file covering Portugal to Poland, five species a week. "Near you" was a
 * local claim made over continental data, at the exact moment a teacher is
 * deciding whether to trust the product.
 *
 * The rest of the app had already settled this: SEEN_CAPTION for what was
 * photographed here, USUALLY_AROUND_CAPTION for what the region's season
 * brings, and #172's ruling that regional is never spoken as recorded. The
 * onboarding line was simply the one surface that had not been brought under
 * it, because it was written inline. It reads the same two captions now, and
 * lives here so the next surface cannot re-invent a third register.
 *
 * ORDER IS THE POINT. Recorded observations first, regional only when there
 * are none, and neither upgraded to fill the other's slot. A class with no
 * observations and no phenology gets the invite, not a borrowed list.
 */
export function composeReactionLine(input: {
  /** Photographed nearby records, from Pointmoon. The strong claim. */
  sightings?: readonly { name: string }[];
  /** The region's seasonal names. The weak claim. */
  lookFors?: readonly { species: string }[];
  /** Whether the teacher has picked any grounds yet, for the empty states. */
  hasGrounds?: boolean;
  /** How many names the line carries. */
  limit?: number;
}): ReactionLine {
  const { sightings = [], lookFors = [], hasGrounds = false, limit = 3 } = input;

  const seen = sightings
    .map((s) => s.name?.trim())
    .filter((n): n is string => Boolean(n))
    .slice(0, limit);

  if (seen.length > 0) {
    return {
      tier: "recorded",
      label: "seen near your school lately",
      line: `Now looking for ${seen.join(", ")}, ${lowerFirst(SEEN_CAPTION.school)}.`,
    };
  }

  const regional = lookFors
    .map((l) => l.species?.trim())
    .filter((s): s is string => Boolean(s))
    .slice(0, limit);

  if (regional.length > 0) {
    return {
      tier: "regional",
      label: "usually around here now",
      line: `Now looking for ${regional.join(", ")}, ${lowerFirst(USUALLY_AROUND_CAPTION)}.`,
    };
  }

  return {
    tier: null,
    label: "what to look for",
    line: hasGrounds
      ? "Tuning what to look for around your grounds."
      : "Pick what's out there and we'll tune what to look for.",
  };
}

/** The caption reused mid-sentence, so the two copies cannot drift apart. */
function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

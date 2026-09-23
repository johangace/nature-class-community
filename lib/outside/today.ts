// Server-only: one Pointmoon read, the cast, and one Wikimedia read, composed
// into everything the home screen shows. Never import from a client component.

/**
 * TODAY'S READ — the morning, composed once (#323).
 *
 * Johan, after reading Sophia's three directions: *"agree starting with
 * weather similar to A. but it has to be more visual like B. i think there is
 * a world where these 2 could coexist and be even better than what it is
 * showing right now.. build it."*
 *
 * So the home screen is A's structure — one column, no cards, the read leads
 * and ends by handing over the lesson it changes.
 *
 * THE WINDOW IS GONE (#341). B's photograph was promoted to the top of this
 * page and Johan rejected it on sight: "I dont understand the purpose of the
 * image here... remove it". A photograph of somewhere NEAR is not a photograph
 * of what the lesson is about, and on the morning it resolved to a carved
 * church door it was worse than nothing. It was about our data reach rather
 * than about her morning, which is the test this screen is now held to. #296
 * stays solved and stays on /world.
 *
 * ── WHY THIS IS A COMPOSER AND NOT A COMPONENT'S OWN FETCHING ──────────────
 *
 * Two reads, and both are usually free. `readSurfaceCast` and
 * `fetchFieldTruth` both go through the same fifteen-minute per-location memo,
 * so asking for the sky here costs no extra network call. The third,
 * Wikimedia's geosearch, is its own hour-long cache and is bounded at five
 * seconds: a teacher is standing at this screen, and a slow photograph must
 * never be the reason the lesson is late.
 *
 * ── AND WHY THE READ IS PROSE ──────────────────────────────────────────────
 *
 * The conditions used to arrive as a tile: a number, a sky word, a wind word,
 * side by side. Sophia's argument for a sentence is that intelligence reads as
 * intelligence when it is written as a consequence, and a tile cannot carry a
 * consequence. What makes that safe is that the sentence is COMPOSED from two
 * clauses the producer returned (`dayRead`) rather than written by a model.
 *
 * The instrument row survives underneath it, because a sentence is slower to
 * read in glare than a number and she is often only checking one thing.
 *
 * ── EVERY PIECE DIES ALONE ─────────────────────────────────────────────────
 *
 * The read, the adjustment, the hinge and the facts each test their
 * own data and disappear on their own. Nothing here reserves
 * space, and there is no state of this that returns a placeholder: when the
 * whole read failed, the page is the lesson, one honest sentence at the
 * bottom, and nothing else.
 */

import { cache } from "react";
import { cardCondition, feltTemperature, skyPhrase, type CardCondition } from "@/lib/cast/conditions";
import { readSurfaceCast, CAST_DEPTH } from "@/lib/cast/surface";
import { outsideScope, type OutsideScope } from "./captions";
import { displayPhotoAsset, type CastMember } from "@/lib/cast/member";
import type { Locale } from "@/lib/localization";
import type { HabitatTag } from "./types";
import type { ConditionKind, TopicTag } from "@/schema/pack";
import { conditionsBucket, presentConditions, suggestedCondition } from "./bucket";
import { dayRead } from "./day-read";
import { fetchFieldTruth, type FieldTruth } from "./pointmoon";
import { groundPhrase, skyFacts, upcomingSky, type SkyFact } from "./sky";
import { skyMarkKind, type SkyMarkKind } from "./sky-mark";

export interface TodayRead {
  /** Whose patch this is. "school" only when the class carries coordinates. */
  scope: OutsideScope;
  /** The class's name, when there is one. */
  className: string | null;
  /** The school's name, when we know it. */
  school: string | null;

  /** This morning as one sentence, or null when nothing came back. */
  read: string | null;
  /** The day's shape and its one adjustment line. Null on a fine day. */
  condition: CardCondition | null;
  /**
   * The same day in the PACK's vocabulary, which is what an authored
   * `conditionNote` is written against. Null on an ordinary day and on a
   * failed read, and both of those are silence.
   */
  conditionKind: ConditionKind | null;
  /** Every kind true of this morning, primary first — what the hinge reads (#1007). */
  conditions: ConditionKind[];
  /** The felt temperature with its unit, in her scale. */
  temperature: string | null;
  /** "a clear sky · a light breeze", without the temperature. */
  sky: string | null;

  /* ── THE SKY BLOCK (#341) ───────────────────────────────────────────────
   * Three readings, and the split between them is the rule the block is built
   * on: A GLYPH NAMES A STATE, A NUMBER STATES A QUANTITY. The sky is a small
   * closed set, so it gets the mark. Light left and the ground are quantities
   * and amounts, so they stay as digits and words — a glyph for either would
   * have been a downgrade dressed as consistency. */

  /** Which of the eight marks this morning gets. Null draws none. */
  skyMark: SkyMarkKind | null;
  /**
   * THE MARK'S LICENCE IS NOW THE SENTENCE, AND `skyLabel` IS GONE (#355).
   *
   * Rule 2 of #341 — no glyph ships on this screen without the word that says
   * what it is — is not repealed, it is paid by a different element. The read
   * sits directly above this block and its opening clause names the sky in
   * words ("The sky is a soft grey"), and the two are ONE DECISION: the mark
   * is drawn from `skyCondition` and the clause is looked up on the same
   * value, over the same six keys plus rain, so there is no payload that draws
   * a mark and writes no clause. `today-sky-licence.spec.ts` asserts that.
   *
   * What it removes is an echo Johan is looking at right now: "Overcast · a
   * light breeze" printed under a sentence that has just said the sky is a
   * soft grey and there is a light breeze. Two registers, one fact, twice.
   *
   * The screen reader keeps its word: `app/SkyMark.tsx` carries the label as
   * its accessible name instead of relying on a visible sibling.
   */
  /** "damp underfoot". The fact that decides whether thirty children sit down. */
  ground: string | null;
  /** Sunrise, sunset, light left, moon, ground. Only what came back. */
  facts: SkyFact[];
  /**
   * THE DOOR'S PREVIEW — up to three photographed members from the full local
   * read (#355).
   *
   * Johan: *"fix the terible button... maybe with 2-3 avatars... of the
   * animals pics"*. Overlapping faces say "there is more of this behind me" in
   * a way an arrow cannot, so the control stops being navigation and becomes a
   * preview of the room it opens.
   *
   * Same filter as the row, and that is load-bearing rather than tidy: a drawn
   * taxon mark beside a photograph reads as a photograph that failed to load,
   * and at 28px it reads as one even on its own. No photograph, no face.
   */
  doorFaces: CastMember[];
  /** True when the local nature room is available from this read. */
  outsideAvailable: boolean;
}

const EMPTY: TodayRead = {
  scope: "sample",
  className: null,
  school: null,
  read: null,
  condition: null,
  conditionKind: null,
  conditions: [],
  temperature: null,
  sky: null,
  skyMark: null,
  ground: null,
  facts: [],
  doorFaces: [],
  outsideAvailable: false,
};

export interface TodayReadQuery {
  topicTags?: readonly TopicTag[];
  locale?: Locale;
  date?: Date;
  /**
   * The active class's grounds, mapped to habitat tags (#54). Undefined or
   * empty shows everything in season, exactly as this read behaved before
   * grounds existed — a filter is only ever a narrowing, never a new gate a
   * class with nothing set could fail.
   */
  habitats?: HabitatTag[];
}

/**
 * How deeply the local nature read looks for the doorway preview.
 *
 * DEPTH IS TWELVE, AND IT IS THE WHOLE REASON THE DOOR CAN PREVIEW ANYTHING.
 * Twelve is the depth the species profile already reads.
 *
 * IT COSTS NO NEW NETWORK AND IT CANNOT LEAK, and both were checked in the
 * source rather than assumed, because a memo that baked in the first caller's
 * limit would mean the first page a teacher opened decided how many everyone
 * got:
 *   - `lib/outside/pointmoon.ts` memoises the RAW payload per ~100m cell for
 *     fifteen minutes. It has no limit in its key because it slices nothing,
 *     and the historical species tier travels in that same Pointmoon payload.
 *   - `lib/cast/live.ts` memoises the RESOLVED cast for sixty seconds and its
 *     key includes `q.limit`, so the four call sites at eight and this one at
 *     twelve are separate entries rather than one racing the other.
 */
const DEPTH = CAST_DEPTH;

/**
 * How many faces the door previews, and why it is a preview rather than a
 * decoration (#355).
 *
 * Three overlapping crops from the full photographed record. The doorway now
 * sits with the weather, outside the lesson card, so it previews the room it
 * opens rather than trying to be the remainder of the lesson-specific row.
 */
const DOOR_FACES = 3;

/**
 * The two readings the sky block shows.
 *
 * IT USED TO BE THREE. The middle one was `skyLabel` — "Overcast · a light
 * breeze" — and it is deleted rather than reworded, because both of its facts
 * are already in the sentence directly above the block. See `TodayRead` for
 * how rule 2 is still paid without it.
 *
 * What is left is the split by OWNER that `lib/outside/day-read.ts` prescribes
 * in its own header and this block had stopped honouring: the sentence owns
 * the sky and the air, the block owns the temperature and the ground. Nothing
 * on this screen now says one fact twice.
 */
function skyBlock(data: FieldTruth | null): {
  skyMark: SkyMarkKind | null;
  ground: string | null;
} {
  const current = data?.facts?.fieldSnapshot?.weather?.current;
  return {
    skyMark: skyMarkKind({
      skyCondition: current?.skyCondition,
      skyCover: current?.skyCover,
      cloudCoverPct: current?.cloudCoverPct,
      precipitationRateMmPerHour: current?.precipitationRateMmPerHour,
    }),
    ground: groundPhrase(data),
  };
}

/**
 * Composed once per request.
 *
 * The home renders the day and the local-nature doorway in separate Suspense
 * boundaries and therefore has two callers. React's `cache` keys
 * on the ARGUMENT IDENTITY, so the page builds one query object and hands the
 * same one to both: two callers, one composition, and no way for the top of
 * the page and the bottom of it to disagree about what was seen this morning.
 * Pass a fresh object literal from each caller and this silently does the work
 * twice.
 */
export const getTodayRead = cache(composeTodayRead);

/**
 * Does the SEASON have anything on `/outside`, asked in `/outside`'s own scope.
 *
 * THIS IS NOT `members.length > 0`, AND THE DIFFERENCE IS A WHOLE CLASS OF
 * TEACHERS. Today reads the cast through the class's grounds (`habitats`, #54);
 * `lib/outside/brief.ts` reads it without them, and calls `getOutsideNow`
 * without them too. So the list this composition holds is a SUBSET of the one
 * behind the door, and for a class that has configured its grounds the subset
 * can be empty while the page is full. Deciding the door on the narrow list
 * would take the door away from exactly the teachers who told us most about
 * their patch. Codex round 1 on PR #1262 caught this; the comment it replaced
 * called the state "close to unreachable", which was wrong.
 *
 * So when the narrow list is empty AND grounds are set, this asks the question
 * again in the target's scope. That second call is the rare path, not the
 * ordinary one — the hour answers first on any morning Pointmoon replies — and
 * it is cheap where it happens: the Pointmoon payload behind it is the same
 * memoised per-cell read, and the taxon references are process-cached, so what
 * it costs is the curated-entries read and the resolve, not a new network trip.
 *
 * WHAT IS STILL UNCOUNTED is `/outside`'s look-fors, which come from
 * `getOutsideNow` — a third read this screen does not make for a flag. With the
 * grounds filter off both sides, that gap is the narrow one the first version
 * claimed: the cast's regional tier and those look-fors are filled from the same
 * phenology for the same place on the same day. If a place is ever seen with
 * look-fors and no cast at all, the fix is to carry that count here, never to
 * widen this back to `true`.
 */
async function seasonShows(
  members: readonly CastMember[],
  query: {
    topicTags: readonly TopicTag[];
    habitats: HabitatTag[] | undefined;
    date: Date | undefined;
  }
): Promise<boolean> {
  if (members.length > 0) return true;
  if (!query.habitats?.length) return false;
  const wider = await readSurfaceCast({
    topicTags: query.topicTags,
    limit: DEPTH,
    date: query.date,
  });
  return wider.cast.members.length > 0;
}

async function composeTodayRead(query: TodayReadQuery = {}): Promise<TodayRead> {
  const { topicTags = [], locale = "uk", date, habitats } = query;

  try {
    // The cast first: it is the one read that tells us where this teacher is.
    const surface = await readSurfaceCast({ topicTags, habitats, limit: DEPTH, date });
    const { lat, lng } = surface.place;

    const data = await fetchFieldTruth({
      lat: typeof lat === "number" ? lat : undefined,
      lng: typeof lng === "number" ? lng : undefined,
    });

    const members = surface.cast.members;
    const facts = skyFacts(data);

    const photographed = members.filter(
      (m) => !m.absent && displayPhotoAsset(m) !== null
    );
    // THE DOOR IS THE PLACE'S, NOT THE LESSON'S, so it previews the whole
    // photographed record rather than the topic's slice of it. It opens
    // /outside, which is captioned by scope and shows every tier; previewing
    // it with a topic-filtered stack would promise a narrower room than the
    // one behind it.
    const doorFaces = photographed.slice(0, DOOR_FACES);

    const bucket = conditionsBucket(data);
    const read = dayRead(data);
    const condition = cardCondition(data);

    /**
     * IS THERE ANYTHING BEHIND THIS DOOR (#1239)?
     *
     * This used to be the literal `true` on every success path, so beneath the
     * honest "we could not see outside today, so there is nothing new to
     * report" sentence the teacher was still offered a door into a page that
     * prints its own version of the same nothing.
     *
     * The one-line fix, `data !== null`, is wrong, and
     * `tests/unit/today-door-photographs.spec.ts` says why: a cast with
     * members and no photographs has real content on `/outside` and its door
     * must stay open. So the flag is not about field truth.
     *
     * ── WHAT THE HOUR ACTUALLY PUTS ON THE PAGE ────────────────────────────
     *
     * The first version of this read `/outside`'s quiet-line guard — no
     * condition, no read, no facts — and Codex round 1 on PR #1262 showed that
     * guard is not the same question. It says when the page APOLOGISES; it does
     * not say when the page has something. The two come apart at both ends:
     *
     *   `condition` is not content. `conditionsBucket` answers "mild" for any
     *   `weather.current` at all, even one whose readings this build cannot
     *   use, and `ADJUSTMENTS.fine` is null on purpose. So a payload carrying
     *   only an unusable `current` gives `/outside` a non-null condition, which
     *   SUPPRESSES its quiet line while rendering nothing in its place — a
     *   blank page the door was promising a room behind. What a condition puts
     *   on that page is its `adjustment`, through `brief.context` (the door
     *   always links with `?session=`) and through `quietWord`. So the term is
     *   the adjustment, which is exactly the four non-fine states.
     *
     *   `upcoming` IS content and was missing. `app/outside/page.tsx` names it
     *   in `hasDay` beside the read and the facts, and it comes off the same
     *   payload already in hand, so counting it costs nothing.
     *
     * The remaining hour-only gap is a lesson's authored hinge, which needs the
     * session this composition does not have. It is bounded rather than argued
     * away: every kind `resolveHinge` can match either carries an adjustment
     * (wet, windy, cold, hot) or implies a clause the read prints anyway —
     * `still` needs a wind reading and `bright` a sky reading, and `dayRead`
     * writes a sentence from either.
     */
    const hourShows =
      read !== null ||
      facts.length > 0 ||
      upcomingSky(data) !== null ||
      condition?.adjustment != null;

    return {
      scope: outsideScope(surface),
      className: surface.className,
      school: surface.school,
      read,
      condition,
      conditionKind: suggestedCondition(bucket),
      conditions: presentConditions(data),
      temperature: feltTemperature(data, locale),
      sky: skyPhrase(data),
      ...skyBlock(data),
      facts,
      doorFaces,
      outsideAvailable:
        hourShows || (await seasonShows(members, { topicTags, habitats, date })),
    };
  } catch {
    // The home screen opens even when everything behind it is shut.
    return EMPTY;
  }
}

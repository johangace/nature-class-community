// Server-only: reads the signed-in teacher's active class and its cast.
// Never import from a client component.

/**
 * The cast, for a surface that is not the daily card.
 *
 * The daily card composes its own read (lib/cast/card.ts) because it also
 * needs the conditions and wants both fetches in one Promise.all. The species
 * profile, the in-lesson speak-and-show and the print path need the cast and
 * nothing else, and all three need the same three things around it: whose
 * patch this is, whether we may say "your school", and the class's climate tag
 * so every surface reads the same phenology region.
 *
 * One function, so those three surfaces cannot drift into three slightly
 * different answers about who is about today. That is the same reason
 * `getClassCast` exists at all — the door, the lesson and the paper agreeing
 * is the product promise, not an implementation detail.
 */

import { getClassCast, type ClassCast } from "./read";
import { withLivePhotos } from "./enrich";
import { getOutsideNow } from "@/lib/outside";
import { samplePatchLocation } from "@/lib/outside/pointmoon";
import { getActiveClass, getTeacher } from "@/lib/teacher";
import { getTryPlace } from "@/lib/try-place-server";
import { isClimateGroup, type ClimateGroup } from "@/lib/outside/climate";
import type { HabitatTag } from "@/lib/outside";
import type { TopicTag } from "@/schema/pack";

/**
 * HOW DEEP A SURFACE READS THE CAST, AND WHY IT IS ONE NUMBER (#355).
 *
 * Today's door previews the species its row is not showing, as three circular
 * crops of their real photographs. A crop is a photograph, and the rule this
 * product holds is that a photograph may appear without its credit only as a
 * LINK WHOSE TARGET CARRIES THAT CREDIT. The door's target is `/outside`.
 *
 * So the depth is shared rather than per-caller. Today reading twelve while
 * `/outside` read eight would put a photograph on the home screen whose credit
 * existed on no page in the product — a licence breach created by a number in
 * a different file, which is exactly the kind nobody would ever find.
 *
 * Twelve is the depth the species profile already reads, and it costs no new
 * network: `lib/outside/pointmoon.ts` memoises the raw payload per location
 * with no limit in its key, including the historical species tier, and
 * `lib/cast/live.ts` keys its own memo on the limit so callers at different
 * depths cannot poison one another.
 */
export const CAST_DEPTH = 12;

/** The stored tag, if it is one we recognise; null otherwise. */
function climateOf(stored: string | null | undefined): ClimateGroup | null {
  return typeof stored === "string" && isClimateGroup(stored) ? stored : null;
}

export interface SurfaceCast {
  cast: ClassCast;
  /** True when the read is anchored on real coordinates: a class's, or the
   * spot a signed-out visitor chose on /start (#877). */
  located: boolean;
  /**
   * True only for that visitor's chosen spot. Located, but not a school: the
   * captions say "the place you chose" rather than "your school" or "the
   * sample patch", because it is neither.
   */
  chosen: boolean;
  /** The school's name, when we know it. For the print masthead. */
  school: string | null;
  /** The class's name, when we know it. */
  className: string | null;
  /** Where the cast was read for, so a caller can ask a second question about
   * the same place without re-deriving it. */
  place: {
    lat: number | null;
    lng: number | null;
    climate: ClimateGroup | null;
    /**
     * What the geocoder called this point, e.g. "Canonbury" (#463). Read
     * regardless of `located`: a signed-out visitor's read still resolves to
     * a real point (the sample patch), and every surface this feeds — the
     * print sheet, the runner's door — owes a reader the same honest name
     * `getOutsideNow` already carries for a located class. Null when the
     * geocoder named nothing, which is a real state, not a gap.
     */
    name: string | null;
  };
}

const EMPTY: SurfaceCast = {
  cast: { members: [], absences: [], source: "live" },
  located: false,
  chosen: false,
  school: null,
  className: null,
  place: { lat: null, lng: null, climate: null, name: null },
};

/**
 * Today's cast for the signed-in teacher's active class.
 *
 * Signed out, this is the cold-URL demo: the composed sample patch, with
 * `located` false so every caller says "the sample patch" rather than claiming
 * a school it does not know. That distinction is enforced by the callers, but
 * it is only possible because this returns it.
 *
 * Never throws. A failure is an empty cast, and every surface reading one is
 * written to be whole without it.
 */
export async function readSurfaceCast(options: {
  topicTags?: readonly TopicTag[];
  primaryTopic?: TopicTag | null;
  /** A species profile target to keep inside the resolved display cast. */
  profileSlug?: string | null;
  /**
   * Strict topic filter (nc#233) — see `lib/cast/resolve.ts`'s
   * `ResolveCastQuery.topicFilter` for the full contract. Leave unset for a
   * general surface (Today, the species profile): the cast still leads with
   * `primaryTopic` but a thin match is filled from the wider neighbourhood.
   * Set true for a surface that claims "who THIS LESSON is about" — the
   * in-lesson speak-and-show, the door's evidence, the printed reference
   * cards — so an unrelated species can never fill the cap, and no match
   * resolves to no cast rather than a mismatched one.
   */
  topicFilter?: boolean;
  /**
   * The school's habitats, when the caller has resolved its grounds (#54).
   * Undefined shows the same everything-in-season cast this always has —
   * every caller that has not been taught about grounds keeps working
   * unchanged.
   */
  habitats?: HabitatTag[];
  /**
   * How many members this surface can lay out, when it has a layout reason to
   * ask for fewer. Unset — the ordinary case — means the count follows the
   * context (#1030). See `lib/cast/live.ts`'s `LiveCastQuery.limit`.
   */
  limit?: number;
  date?: Date;
} = {}): Promise<SurfaceCast> {
  const {
    topicTags = [],
    primaryTopic = null,
    profileSlug = null,
    topicFilter,
    habitats,
    limit,
    date,
  } = options;

  try {
    const teacher = await getTeacher();
    const active = teacher ? await getActiveClass(teacher.id) : null;
    // Signed out, the visitor's chosen spot stands where the class's
    // coordinates would (#877). Only signed out: a teacher's class is the
    // place of record even with a leftover cookie in the jar.
    const chosen = teacher ? null : await getTryPlace();
    const lat = active?.lat ?? chosen?.lat ?? null;
    const lng = active?.lng ?? chosen?.lng ?? null;
    const located = typeof lat === "number" && typeof lng === "number";
    // Where this surface READS, which is not the same question as whether it
    // may claim a school. `located` stays the honest flag every caller gates
    // its wording on; `readAt` is the point the producer is asked about, and
    // unlocated that point is the sample patch — asked for here now rather
    // than arriving because a data fetcher defaulted (#1234). Nothing about
    // the read changes; the request simply says out loud what it is reading,
    // which is the claim `captions.ts` already makes on this surface's behalf
    // ("Seen lately near {name}, the sample patch", #463). `fetchFieldTruth`
    // no longer hands that point to callers that cannot name it, which is why
    // the run page's sentence goes quiet instead of reading north London.
    const readAt = located ? { lat: lat as number, lng: lng as number } : samplePatchLocation();

    const cast = await getClassCast(active?.id ?? null, {
      lat: readAt.lat,
      lng: readAt.lng,
      // A stored tag is a plain string column, so it is validated rather than
      // trusted: a class saved before the tag existed, or one carrying a value
      // from an older vocabulary, falls back to deriving the climate from the
      // coordinates exactly as every surface did before the tag.
      climate: climateOf(active?.climate),
      habitats,
      topicTags,
      primaryTopic,
      profileSlug,
      topicFilter,
      limit,
      date,
    });

    // A stored or regional cast member carries no photograph of its own by
    // construction, so it renders as a drawn plate even when the same species
    // was photographed near here this week. One read of today's observations
    // lays the real photograph over it where the species matches. Doing this
    // here rather than in each surface is the same reason readSurfaceCast
    // exists at all: the door, the lesson and the paper must agree.
    //
    // READ REGARDLESS OF `located` (#463). A signed-out or unlocated read
    // still resolves to a real point — the sample patch — and this read is
    // what carries its name (`outside.place.name`) to the print sheet, the
    // runner's door and every other caller of this file. Only the PHOTO
    // OVERLAY below stays gated on `located` — naming the point is not the
    // same claim as attaching a live photograph to a stored member.
    //
    // THIS IS A SECOND NETWORK READ, not the same memo cell (nc#808). The
    // paragraph that stood here said the opposite — "it costs no new network
    // call in production… the same cell, not a second read of it" — and it is
    // wrong, which is worth saying plainly because it is the kind of claim a
    // reader trusts instead of measuring. `fetchFieldTruth` keys its memo on
    // location AND observation scope, and `getOutsideNow` derives that scope
    // from `primaryTopic`. `getClassCast` above is given `primaryTopic`, so it
    // reads Pointmoon under a taxon scope; this call passes only `topicTags`,
    // so `pointmoonObservationTaxa(null)` is undefined and it reads under the
    // unscoped key. Two keys, two round trips, sequentially. Instrumenting the
    // whole deterministic suite caught it: rendering /cast issued
    //   …/api/moon?audience=facts&lat=51.546&lng=-0.105&observationTaxa=Plantae
    //   …/api/moon?audience=facts&lat=51.546&lng=-0.105
    // and those two, at Pointmoon's ordinary latency, were the flake in #808.
    //
    // Left as it is on purpose. Making the keys agree changes WHICH sightings
    // reach `withLivePhotos` — a scoped read returns fewer — so it is a change
    // to what a teacher sees, not a refactor, and it wants its own ticket and
    // its own before/after on a real class. This comment is only the record
    // that the cost is real and known.
    const outside = await getOutsideNow({
      lat: readAt.lat,
      lng: readAt.lng,
      climate: climateOf(active?.climate) ?? undefined,
      topicTags,
      limit: 24,
      date,
    }).catch(() => null);

    return {
      cast:
        located && outside
          ? { ...cast, members: withLivePhotos(cast.members, outside.sightings) }
          : cast,
      located,
      chosen: active === null && chosen !== null,
      school: active?.school ?? null,
      className: active?.name ?? null,
      place: {
        lat,
        lng,
        climate: climateOf(active?.climate),
        name: outside?.place?.name ?? null,
      },
    };
  } catch {
    return EMPTY;
  }
}

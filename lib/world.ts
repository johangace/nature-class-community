import { curatedEntries } from "@/lib/outside/curated-phenology";
import "server-only";
import { weekOfYear } from "@/lib/outside/phenology";
import { rankHabitats, readPlace, suggestedFrom, type PlaceRead } from "@/lib/outside/place";
import { fetchFieldTruth } from "@/lib/outside/pointmoon";
import { resolveClimate, type ClimateGroup } from "@/lib/outside/climate";
import { resolvePhenologyRegionOrNull } from "@/lib/outside/regions";
import type { PhenologyEntry, RegionId } from "@/lib/outside/types";

/**
 * The school's world, composed as four zooms (#277).
 *
 * Johan, 2026-08-17: *"in a way this is world building... first we zoom in the
 * world they already are.. eg they are in london .. we know what london is
 * like this time of the year what is around"*, then *"we go deeper in their
 * schoolground"*.
 *
 * So the order is outside-in, and each zoom is a different KIND of knowing:
 *
 *   1 the world   what this region is doing this week. Told, not asked. She is
 *                 being shown where she is standing.
 *   2 around      what a map can see. Shown so she can CORRECT it, because
 *                 maps go stale and a park polygon can be tarmac.
 *   3 inside      what no map can see. Hers alone, and the only source.
 *   4 reach       how far a class can get. Decides what a lesson may ask for.
 *
 * Every zoom degrades to silence independently. A school with no coordinates
 * still gets zooms 3 and 4, because those never needed a location; a school
 * whose Pointmoon read is thin loses zoom 2 alone and nothing else. That is
 * the declared-empty rule applied to a screen: show less, never invent.
 */

export interface WorldZoomOne {
  regionId: RegionId;
  week: number;
  /** What is about here this week. Real rows, never generated. */
  entries: PhenologyEntry[];
  /** The habitats those things actually occupy, commonest first. */
  habitats: string[];
}

export interface SchoolWorld {
  /** Null when we do not know where the school is. Zooms 3 and 4 still work. */
  world: WorldZoomOne | null;
  /** What the map saw. `answered: false` means say nothing about it. */
  place: PlaceRead;
  /** Grounds values the map suggests, for prefilling her answers. */
  suggested: string[];
  climate: ClimateGroup | null;
}

export interface WorldQuery {
  lat?: number | null;
  lng?: number | null;
  climate?: string | null;
  date?: Date;
}

/**
 * Compose the world for one school. Never throws, and every part is optional:
 * a failure in one zoom must not take the others down, because a teacher
 * halfway through onboarding cannot be shown an error page.
 */
export async function schoolWorld(query: WorldQuery): Promise<SchoolWorld> {
  const { lat, lng, date = new Date() } = query;
  const located =
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng);

  if (!located) {
    return { world: null, place: { observations: [], answered: false }, suggested: [], climate: null };
  }

  const climate =
    (typeof query.climate === "string" && query.climate.trim().length > 0
      ? (query.climate.trim() as ClimateGroup)
      : null) ?? resolveClimate(lat as number, lng as number);
  const regionId = resolvePhenologyRegionOrNull(lat, lng, climate);
  const week = weekOfYear(date);

  const fieldTruth = await fetchFieldTruth({ lat: lat as number, lng: lng as number }).catch(() => null);
  const entries = await curatedEntries(fieldTruth, date, undefined, 6);

  const place = readPlace(fieldTruth);

  return {
    world:
      regionId !== null && entries.length > 0
        ? { regionId, week, entries, habitats: rankHabitats(entries) }
        : null,
    place,
    suggested: suggestedFrom(place),
    climate,
  };
}

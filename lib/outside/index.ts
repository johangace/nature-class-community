// Server-only: composes observations and explicitly curated producer expectations.
import { resolveClimate, type ClimateGroup } from "./climate";
import { crossesSafetyBoundary } from "@/lib/ai/lesson-support-contract";
import { summarizeConditions } from "./conditions";
import { nearbySightings, pointmoonObservationTaxa } from "./observations";
import { liveRegionalEntries, speciesKey } from "./live-lookfors";
import { weekOfYear } from "./phenology";
import { curatedEntries } from "./curated-phenology";
import { readResolvedPlace } from "./place";
import { fetchFieldTruth } from "./pointmoon";
import { resolvePhenologyRegion, resolvePhenologyRegionOrNull } from "./regions";
import type { Locale } from "@/lib/localization";
import type { TopicTag } from "@/schema/pack";
import type { HabitatTag, LookFor, OutsideNow, SeasonalName, Sighting } from "./types";

export type {
  OutsideNow,
  Sighting,
  SeasonalName,
  LookFor,
  ConditionsSummary,
  HabitatTag,
  RegionId,
  ResolvedPlace,
} from "./types";
export {
  resolveRegion,
  resolveRegionOrNull,
  resolvePhenologyRegion,
  resolvePhenologyRegionOrNull,
  DEFAULT_REGION,
} from "./regions";
export { resolveClimate, DEFAULT_CLIMATE, isClimateGroup, type ClimateGroup } from "./climate";
export {
  POINTMOON_NATURE_CONTRACT_VERSION,
  POINTMOON_SOURCE_SCHEMA_VERSION,
  parsePointmoonNatureProjection,
} from "./pointmoon-contract";
export type {
  ParsePointmoonNatureOptions,
  PointmoonNatureProjection,
  PointmoonNatureReady,
  PointmoonNatureThin,
  PointmoonNatureThinReason,
  PointmoonObservation,
  PointmoonObservationSource,
  PointmoonOpenPhotoLicense,
  PointmoonPhotoAsset,
  PointmoonPhotoRole,
  PointmoonPresenceEvidence,
} from "./pointmoon-contract";

export interface OutsideNowQuery {
  /** School coordinates, when known; falls back to the demo location. */
  lat?: number | null;
  lng?: number | null;
  /** School habitats, when known; empty shows everything in season. */
  habitats?: HabitatTag[];
  /** The moment to read for; defaults to now. Injectable for tests. */
  date?: Date;
  /** How many species to surface on the card. */
  limit?: number;
  /** Today's lesson's topic tags: the card leads with the matching cast (#161). */
  topicTags?: readonly TopicTag[];
  /** The lesson subject used to narrow Pointmoon's producer-side observation pool. */
  primaryTopic?: TopicTag | null;
  /** The reader's own scale, for the composed conditions. Defaults to the
   * product's native UK voice; every caller that reads `conditions` should
   * pass the same locale its other surfaces resolved. */
  locale?: Locale;
  /**
   * The class's stored climate tag, when it has one. Absent means "work it out
   * from the coordinates" — a class saved before the tag existed reads exactly
   * as it would have, and a stored tag is trusted over a re-derivation so a
   * class's seasonal expectations do not shift under it between reads.
   */
  climate?: ClimateGroup | null;
}

export function safeLookForNote(entry: {
  species: string;
  childFriendlyNote?: string | null;
  description: string;
}): string {
  const preferred = entry.childFriendlyNote?.trim();
  if (preferred && !crossesSafetyBoundary(preferred)) return preferred;

  return `Look closely at ${entry.species}. What do you notice?`;
}

/**
 * One producer read supplies weather, observations and regional expectations.
 * Only its current, explicitly curated calendar supplies look-for teaching notes.
 * Historical observations can add regional species where that calendar is thin.
 * Local files classify exact identities only: they never create membership.
 */
export async function getOutsideNow(query: OutsideNowQuery = {}): Promise<OutsideNow> {
  const {
    lat,
    lng,
    habitats,
    date = new Date(),
    limit = 5,
    topicTags = [],
    primaryTopic = null,
    climate,
    locale = "uk",
  } = query;
  // The class's stored tag when it has one, otherwise derived from where it is.
  // The climate then corrects the phenology file where the coordinate box map
  // and the actual climate disagree (a Sonoran school stops reading the Rockies).
  const climateGroup = climate ?? resolveClimate(lat, lng);

  // Coordinates resolve to a region or to nothing. Nothing is a real answer
  // (#305): the 15 files cover the British Isles, Europe and North America,
  // and a school outside them used to be handed `uk-south` in silence — a
  // northern late-summer calendar to a Sydney classroom in its late winter.
  // A school with NO coordinates is different, and since #1234 the difference
  // is made by the CALLER: a surface that can name what it read asks for the
  // sample patch explicitly (lib/cast/surface.ts), and one that cannot passes
  // nothing and gets nothing. `regionId` below still resolves for an
  // unlocated read, but with no field truth behind it nothing downstream
  // composes from it.
  const located =
    typeof lat === "number" && typeof lng === "number" &&
    Number.isFinite(lat) && Number.isFinite(lng);
  const regionId = located
    ? resolvePhenologyRegionOrNull(lat, lng, climateGroup)
    : resolvePhenologyRegion(lat, lng, climateGroup);

  const data = await fetchFieldTruth({
    lat: typeof lat === "number" ? lat : undefined,
    lng: typeof lng === "number" ? lng : undefined,
    observationTaxa: pointmoonObservationTaxa(primaryTopic),
  });
  const entries = await curatedEntries(data, date, habitats, limit);

  const conditions = summarizeConditions(data, locale);

  // Recorded observations from Pointmoon, and only those. No observations
  // means no sightings — the season's names stay in `lookFors`, where they are
  // captioned as the region's expectation rather than as this patch's record.
  const sightings: Sighting[] = nearbySightings(data, limit, topicTags);

  // The same regional entries, twice, for two jobs. `usuallyAround` is the
  // bare names the card shows on its face under "usually around here now";
  // `lookFors` is the same species with a teaching note, behind the tap. Its
  // own type carries no photoUrl, so it cannot reach a seen list even by
  // accident — the honesty here is structural, not remembered.
  //
  // NOT THE SAME ENTRIES ANY MORE, in one respect (#1020): a row authored
  // `kind: "event"` reaches `lookFors` and not `usuallyAround`. Everything
  // downstream of `usuallyAround` treats a name on it as a findable specimen —
  // `subjectMediaFor` looks the scientific name up to put a photograph under a
  // lesson, `brief.ts` resolves it into a cast member, `buildNoteIndex` keys
  // the child-language note on it so a RECORDED creature of the same species
  // inherits that note, which is how "Swallows massing on wires before
  // migration" could end up as the line under a barn swallow somebody
  // photographed on the field. A gathering is not a specimen, so it is not
  // offered as one; it keeps its note, its phase and its place in the "what to
  // look for" panel, which is the list of what to NOTICE.
  const usuallyAround: SeasonalName[] = entries
    .filter((e) => e.kind !== "event")
    .map((e) => ({
      id: e.id,
      name: e.species,
      scientificName: e.scientificName,
    }));

  const lookFors: LookFor[] = entries.map((e) => ({
    id: e.id,
    species: e.species,
    note: safeLookForNote(e),
    phase: e.narrativePhase,
    // Carried, not inferred: `brief.ts` rebuilds a member out of a look-for and
    // must be able to ask what the row is rather than guess from a taxon it
    // cannot see from there.
    kind: e.kind,
  }));

  // A species already shown as a sighting or curated expectation is not a
  // second fact in the historical tier. Events reserve only their own name.
  const covered = new Set([
    ...entries.map((e) =>
      speciesKey({
        scientificName: e.kind === "event" ? undefined : e.scientificName,
        name: e.species,
      })
    ),
    ...sightings.map((s) => speciesKey({ scientificName: s.scientificName, name: s.name })),
  ]);
  const live = liveRegionalEntries(data, covered, 3);
  usuallyAround.push(...live.usuallyAround);
  lookFors.push(...live.lookFors);

  return {
    conditions,
    // From the same payload the conditions came out of, so the name and the
    // sky are guaranteed to be about one point. Reading it here rather than at
    // a surface is what stops a second reverse geocode being bolted on later
    // and quietly disagreeing with this one (#315).
    place: readResolvedPlace(data),
    sightings,
    usuallyAround,
    lookFors,
    regionId,
    week: weekOfYear(date),
  };
}

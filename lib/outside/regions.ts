import type { ClimateGroup } from "./climate";
import type { RegionId } from "./types";

/**
 * Region resolution — which phenology window fits a school's coordinates.
 *
 * Agnostic by design: the product ships worldwide, so this is a coarse
 * lat/lng → biome-region map, not a UK-specific lookup. It is deliberately
 * simple and total (every point resolves to *some* region); it can grow into
 * a real geo lookup without any surface above it changing.
 */

const REGIONS: RegionId[] = [
  "uk-south",
  "uk-north",
  "uk-scotland",
  "ireland",
  "western-europe",
  "us-southeast",
  "us-mid-atlantic",
  "us-new-england",
  "us-midwest",
  "us-south-central",
  "us-mountain-west",
  "us-california",
  "us-pacific-nw",
  "canada-east",
  "canada-west",
];

export function isRegionId(value: string): value is RegionId {
  return (REGIONS as string[]).includes(value);
}

/** The demo default: a south-of-England primary school. */
export const DEFAULT_REGION: RegionId = "uk-south";

/**
 * Eastern Canada's populated southern edge does not follow the 49th parallel.
 * These ordered boxes are a deliberately coarse corridor overlay, not a claim
 * to be a country-border lookup: they reach Windsor, the Great Lakes / St
 * Lawrence corridor and Atlantic Canada while leaving nearby US city centres
 * in their existing phenology regions.
 */
const EASTERN_CANADA_CORRIDOR: ReadonlyArray<
  readonly [minLat: number, minLng: number, maxLng: number]
> = [
  [42.2, -83.04, -82.4],
  [42.4, -82.95, -79],
  [43.5, -79, -76],
  [45, -76, -67],
  [45.1, -67, -66],
  [44.5, -66, -52],
];

function isInEasternCanadaCorridor(lat: number, lng: number): boolean {
  return EASTERN_CANADA_CORRIDOR.some(
    ([minLat, minLng, maxLng]) =>
      lat >= minLat && lat < 49 && lng >= minLng && lng <= maxLng
  );
}

/**
 * Coarse coordinate → region, or null when no box actually covers the point.
 *
 * THE NULL IS THE POINT (#305). The 15 files cover the British Isles, Europe
 * and North America and nothing else. The resolver used to be total: every
 * unmatched coordinate fell to DEFAULT_REGION, so a school in Sydney, Cape
 * Town, Auckland, Nairobi, Mumbai, Tokyo or Singapore silently read
 * `uk-south` — for the southern-hemisphere ones, a northern late-summer
 * calendar during their late winter. Buenos Aires and Santiago fell inside
 * the North America longitude band and read `us-southeast`, a Georgia
 * calendar. Nothing anywhere said so.
 *
 * That is the honesty rule broken at the source: an absent thing is omitted,
 * never filled from the nearest thing that happens to exist. So the match is
 * now falsifiable, and a caller that gets null shows less rather than
 * borrowing a hemisphere.
 *
 * Boxes are intentionally broad and ordered most-specific-first. Never throws.
 */
export function resolveRegionOrNull(
  lat?: number | null,
  lng?: number | null
): RegionId | null {
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  // British Isles & Ireland
  if (lat >= 49 && lat <= 61 && lng >= -11 && lng <= 2) {
    // Ireland's own latitude band, not "everything west of -5.5". The old
    // test had no southern bound, so west Cornwall and the Isles of Scilly
    // (Penzance -5.54, Land's End -5.71, Scilly -6.32, all below 50.2) read
    // Ireland's file. Ireland's southernmost point is Mizen Head at 51.45.
    if (lng <= -5.5 && lat >= 51.3 && lat <= 55.5) return "ireland";
    if (lat >= 55.5) return "uk-scotland";
    if (lat >= 53) return "uk-north";
    return "uk-south";
  }

  // Continental / western Europe
  if (lat >= 36 && lat <= 71 && lng >= -10 && lng <= 40) return "western-europe";

  // North America. Bounded south at the Mexican border rather than run to the
  // equator: the longitude band alone reaches Buenos Aires and Santiago.
  if (lng >= -170 && lng <= -52 && lat >= 25 && lat <= 72) {
    if (lat >= 49) return lng <= -95 ? "canada-west" : "canada-east";
    if (isInEasternCanadaCorridor(lat, lng)) return "canada-east";
    if (lng <= -114) return lat >= 42 ? "us-pacific-nw" : "us-california";
    if (lng <= -100) return "us-mountain-west";
    if (lng <= -90) return lat <= 36 ? "us-south-central" : "us-midwest";
    if (lat >= 40) return "us-new-england";
    if (lat >= 36) return "us-mid-atlantic";
    return "us-southeast";
  }

  return null;
}

/**
 * The total form, kept for every caller that legitimately has no coordinates
 * to work from: the signed-out demo and the sample patch, which are labelled
 * as a sample on their face and so are not making a claim about anyone's
 * school. A caller that DOES hold coordinates should read
 * `resolveRegionOrNull` and show less on a null, not call this.
 */
export function resolveRegion(lat?: number | null, lng?: number | null): RegionId {
  return resolveRegionOrNull(lat, lng) ?? DEFAULT_REGION;
}

/**
 * Which phenology region a climate group should read when the box map above
 * disagrees with the climate — the relabelling half of "keep lat/lng
 * resolution, add a climate tag" (#167 CIO finding).
 *
 * The box map is geographic: it sorts by continent and longitude band. That is
 * right until climate and geography part company. Phoenix sits in the same
 * longitude band as Denver, so the box map calls it us-mountain-west and a
 * Sonoran desert school reads elk, quaking aspen and prairie grasses. This
 * table is the correction, and only the correction: a climate that agrees with
 * its box is absent here and changes nothing.
 *
 * The mapping is a placeholder against real bioregion packs. There is no
 * desert phenology file yet (it belongs to the bioregion pack work, pointmoon#14
 * and nature-class#167, not to this workstream), so an arid school reads
 * us-south-central — Texas sage, prickly pear, mexican free-tailed bat — which
 * is genuinely its nearest hot-and-dry neighbour among the files that exist.
 * That is a closer read than mountain-west, and it is honest about being a
 * neighbour rather than a match. When the desert pack lands, this one entry
 * changes and nothing above it does.
 */
const CLIMATE_REGION_CORRECTIONS: Partial<Record<ClimateGroup, RegionId>> = {
  arid: "us-south-central",
};

/**
 * The phenology region to read for a school: the coordinate box, corrected by
 * the climate tag where the two disagree. Total, never throws, and a no-op for
 * every climate whose box was already right.
 *
 * Corrections are scoped to the continent whose boxes they were written for.
 * An arid school in North America reads the hot-dry neighbour; an arid school
 * in Spain keeps western-europe, because the correction table was not written
 * about Spain and guessing beyond its evidence is exactly what this layer is
 * meant to stop.
 */
export function resolvePhenologyRegion(
  lat?: number | null,
  lng?: number | null,
  climate?: ClimateGroup | null
): RegionId {
  return resolvePhenologyRegionOrNull(lat, lng, climate) ?? DEFAULT_REGION;
}

/**
 * The same resolution, but null when the coordinates fall outside every file
 * we actually have (#305). This is the form a class with a real location
 * should read: a school in Nairobi has no phenology file, and saying so by
 * showing nothing is the honest answer. `resolvePhenologyRegion` above stays
 * for the sample patch, which has no coordinates and says it is a sample.
 */
export function resolvePhenologyRegionOrNull(
  lat?: number | null,
  lng?: number | null,
  climate?: ClimateGroup | null
): RegionId | null {
  const boxed = resolveRegionOrNull(lat, lng);
  if (boxed === null) return null;
  if (!climate) return boxed;

  const inNorthAmerica =
    typeof lng === "number" && Number.isFinite(lng) && lng >= -170 && lng <= -52;
  if (!inNorthAmerica) return boxed;

  return CLIMATE_REGION_CORRECTIONS[climate] ?? boxed;
}

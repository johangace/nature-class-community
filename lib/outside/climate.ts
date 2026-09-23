// Server-and-shared-safe: a pure, deterministic coordinate to climate group.
// No I/O, no external API, no disk read. Callable from anywhere.

/**
 * Climate tag — the Koppen-style group a school sits in.
 *
 * The 15-region spine (lib/outside/regions.ts) resolves a phenology FILE by
 * continent and latitude box. That is right most of the time and wrong in the
 * places climate and geography disagree: Phoenix and Denver share a longitude
 * band, so the box map calls them both us-mountain-west, but a Sonoran desert
 * summer and a Rocky-mountain summer are nothing alike. Miami and Atlanta both
 * fall in us-southeast, but subtropical south Florida is not the temperate
 * southeast.
 *
 * So a class also carries a climate tag, derived here from its coordinates.
 * The tag is coarse on purpose — the top Koppen groups (A tropical, B arid,
 * C temperate, D continental, E polar), split only where a split changes which
 * seasonal expectations a school should read. It is a compact embedded rule
 * set, not a lookup table and not an API: total (every point resolves), cheap,
 * and reproducible. It selects the phenology pack; it never invents a fact.
 *
 * This is a first-approximation classifier. It reads latitude, a hemisphere-
 * aware temperate/continental split, and a small set of known arid and
 * subtropical boxes (the four evaluation climates and their neighbours). It is
 * deliberately conservative: an unrecognised point falls to the latitude-only
 * group rather than guessing a desert or a monsoon it cannot see.
 */

/**
 * The climate groups Nature Class distinguishes. The letter pairs follow
 * Koppen at group granularity where a finer letter would carry precision this
 * classifier does not actually have:
 *
 *   tropical      — Koppen A: hot, wet, no real winter (south Florida, Hawaii).
 *   arid          — Koppen B: deserts and steppe (Sonoran/Phoenix, the SW).
 *   subtropical   — Koppen Cfa/Cwa: hot humid summers, mild winters (US SE).
 *   mediterranean — Koppen Csa/Csb: dry summers, wet mild winters (California).
 *   oceanic       — Koppen Cfb/Cfc: cool, damp, small range (Britain, PNW).
 *   continental   — Koppen D: cold winters, warm summers (US midwest, Canada).
 *   polar         — Koppen E: no warm season (high latitudes).
 */
export type ClimateGroup =
  | "tropical"
  | "arid"
  | "subtropical"
  | "mediterranean"
  | "oceanic"
  | "continental"
  | "polar";

/** The demo default: lowland Britain reads oceanic. Matches DEFAULT_REGION. */
export const DEFAULT_CLIMATE: ClimateGroup = "oceanic";

/** True for a value that came back from the classifier or an older stored row. */
export function isClimateGroup(value: string): value is ClimateGroup {
  return (
    value === "tropical" ||
    value === "arid" ||
    value === "subtropical" ||
    value === "mediterranean" ||
    value === "oceanic" ||
    value === "continental" ||
    value === "polar"
  );
}

/** A rectangular coordinate box, min/max inclusive, with the group it names. */
interface ClimateBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  group: ClimateGroup;
}

/**
 * Named climate boxes, ordered most-specific-first. These carve out the places
 * where the latitude-only fallback would be wrong. Boxes are broad but honest:
 * each covers a region that genuinely shares seasonal expectations, and a point
 * outside all of them falls through to the latitude rule below.
 *
 * North America is where continent and climate diverge most, so it carries the
 * most boxes. The four evaluation climates each sit inside one and are checked
 * by the tests: Phoenix (arid), Miami (tropical), Berkeley (mediterranean),
 * London (oceanic, via the latitude fallback for the British Isles).
 */
const BOXES: readonly ClimateBox[] = [
  // South Florida and the Gulf tip: subtropical-to-tropical, no real winter.
  { minLat: 24, maxLat: 28, minLng: -83, maxLng: -80, group: "tropical" },
  // Hawaii.
  { minLat: 18, maxLat: 23, minLng: -161, maxLng: -154, group: "tropical" },
  // The arid US southwest: the Sonoran, Mojave, and Chihuahuan deserts and the
  // Great Basin — Phoenix, Tucson, Las Vegas, Albuquerque, Salt Lake City.
  { minLat: 31, maxLat: 42, minLng: -120, maxLng: -103, group: "arid" },
  // Interior southern California and the low deserts west of the above box.
  { minLat: 32, maxLat: 35.5, minLng: -118, maxLng: -114, group: "arid" },
  // Coastal and central California: mediterranean, dry summers. Kept south and
  // west of the arid box so the desert wins where they meet.
  { minLat: 32, maxLat: 42, minLng: -124.5, maxLng: -118, group: "mediterranean" },
  // The Pacific northwest coast: oceanic, wet and mild — Seattle, Portland.
  { minLat: 42, maxLat: 49, minLng: -125, maxLng: -120, group: "oceanic" },
  // The US southeast: hot humid summers, mild winters — Atlanta, the Carolinas,
  // north Florida, the Gulf coast east of Texas.
  { minLat: 28, maxLat: 37, minLng: -95, maxLng: -75, group: "subtropical" },
  // The Mediterranean basin proper: dry-summer southern Europe.
  { minLat: 30, maxLat: 45, minLng: -10, maxLng: 40, group: "mediterranean" },
];

/**
 * Coordinate to climate group. Total and never throws: a missing or malformed
 * coordinate is the demo default, a named box wins over the latitude rule, and
 * anything unboxed falls to a hemisphere-aware latitude band.
 *
 * The latitude fallback is intentionally plain — it cannot tell a wet coast
 * from a dry interior on latitude alone, so it names the temperate band
 * "oceanic" (the conservative, mild reading) rather than guessing continental
 * dryness it has no evidence for. Boxes are where real dryness is asserted.
 */
export function resolveClimate(lat?: number | null, lng?: number | null): ClimateGroup {
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ) {
    return DEFAULT_CLIMATE;
  }

  for (const box of BOXES) {
    if (lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng) {
      return box.group;
    }
  }

  const absLat = Math.abs(lat);
  if (absLat >= 66.5) return "polar";
  if (absLat <= 23.5) return "tropical";
  // Continental interiors sit deep inside the big landmasses at mid latitude.
  // North America east of the Rockies and away from the coasts, and interior
  // Eurasia, read continental; everything else in the temperate band reads
  // oceanic. The longitude bands below are the coarse "interior" test.
  const interiorNorthAmerica = lng >= -100 && lng <= -70 && absLat >= 38 && absLat <= 55;
  const interiorEurasia = lng >= 40 && lng <= 140 && absLat >= 40 && absLat <= 60;
  if (interiorNorthAmerica || interiorEurasia) return "continental";
  return "oceanic";
}

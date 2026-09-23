import { resolveClimate, type ClimateGroup } from "@/lib/outside/climate";
import { GLOBAL_PACK_KEY } from "@/lib/habitat";
import type { PackKey } from "@/schema/bioregion";

/**
 * The pack-key fallback chain: a place, resolved down to the keys that can
 * answer for it, coarsest last.
 *
 * J4 (Johan, 2026-08-12): the polygon FRAMEWORK is deferred and the CHAIN
 * ships — polygon → koppen → latitude → global, resolver-version stamped. EPA
 * level-III declined. The one-way door is not the framework, it is content
 * authored per key, so the standing instruction to authors is to write at the
 * coarsest key that still changes the teaching.
 *
 * ── THE POLYGON LINK IS ABSENT, AND SAYS SO ────────────────────────────────
 *
 * There is no polygon framework and no polygon data, because J4 deferred both.
 * So this chain has three real links, not four, and it does not manufacture a
 * fourth out of a bounding box. A chain that quietly skipped a link would look
 * complete and be wrong in the one way that matters: it would claim a
 * resolution it does not have, which is the exact bug the `resolvedBy` stamp
 * exists to catch. When polygons arrive they insert at the front and every
 * consumer keeps working, because consumers take a chain rather than a key.
 *
 * ── WHY THE STAMP IS NOT DECORATION ────────────────────────────────────────
 *
 * The live Phoenix and Miami spine mislabels were invisible for months because
 * nothing recorded which rule had picked the file a school was reading. Every
 * key this returns carries the rule that produced it, so a wrong pack in front
 * of a class is traceable in one read rather than reconstructed from guesses.
 */

/** Bump when the rules below change, so old stamps stay readable. */
export const PACK_KEY_RESOLVER_VERSION = "pack-key@1";

/**
 * Coarse absolute-latitude bands, hemisphere-agnostic.
 *
 * Deliberately NUMERIC rather than named. "Tropical" is already a Koppen group
 * on the link above, and a latitude band that borrowed the word would produce
 * two different keys spelled the same — a Sao Paulo school and a Singapore
 * school would collide on a key that means different things at different links
 * of the same chain. Numbers cannot do that.
 *
 * This link exists for the case the Koppen classifier cannot serve: a point it
 * declines to classify still sits at a latitude, and a latitude is a real, if
 * blunt, thing to know about a place.
 */
export function latitudeBand(lat: number): string {
  const abs = Math.abs(lat);
  if (abs < 23.5) return "lat-00-23";
  if (abs < 35) return "lat-23-35";
  if (abs < 50) return "lat-35-50";
  if (abs < 66.5) return "lat-50-66";
  return "lat-66-90";
}

export interface PlaceForPackKey {
  lat?: number | null;
  lng?: number | null;
  /** The class's stored climate group, when it has one. */
  climate?: string | null;
}

const KNOWN_CLIMATES: ReadonlySet<string> = new Set<ClimateGroup>([
  "tropical",
  "arid",
  "subtropical",
  "mediterranean",
  "oceanic",
  "continental",
  "polar",
]);

/**
 * Resolve a place to its chain of keys, most specific first, `global` last.
 *
 * TOTAL AND NEVER THROWING, like every resolver in lib/outside: a place with
 * no coordinates and no climate tag still gets a chain, and that chain is
 * `[global]`, which resolves to whatever was authored for everywhere — in
 * practice the London base text. That is a known gap rather than a guess about
 * a school we cannot locate.
 *
 * The stored climate tag WINS over one derived from coordinates. It was
 * computed at the location save and is what every other surface reads, and a
 * class must not meet a desert cast on the daily card and a mountain one in
 * its lesson because two code paths classified the same point twice.
 */
export function resolvePackKeyChain(place: PlaceForPackKey): PackKey[] {
  const chain: PackKey[] = [];

  // 1. POLYGON — deferred by J4. Deliberately never populated, and left here
  //    named so the gap is visible in the code rather than only in a ticket.

  // 2. KOPPEN GROUP — the level J4 told authors to work at.
  const stored = typeof place.climate === "string" ? place.climate.trim() : "";
  const climate = KNOWN_CLIMATES.has(stored)
    ? stored
    : hasCoordinates(place)
      ? resolveClimate(place.lat as number, place.lng as number)
      : null;
  if (climate) {
    chain.push({
      resolution: "koppen",
      value: climate,
      resolvedBy: `${PACK_KEY_RESOLVER_VERSION}/${stored === climate ? "stored" : "derived"}`,
    });
  }

  // 3. LATITUDE BAND — blunt, but real, and available whenever coordinates are.
  if (hasCoordinates(place)) {
    chain.push({
      resolution: "latitude",
      value: latitudeBand(place.lat as number),
      resolvedBy: `${PACK_KEY_RESOLVER_VERSION}/coordinates`,
    });
  }

  // 4. GLOBAL — the floor. Always present, so every chain terminates and no
  //    caller ever has to handle an empty one.
  chain.push({
    resolution: "global",
    value: GLOBAL_PACK_KEY,
    resolvedBy: `${PACK_KEY_RESOLVER_VERSION}/floor`,
  });

  return chain;
}

function hasCoordinates(place: PlaceForPackKey): boolean {
  return (
    typeof place.lat === "number" &&
    typeof place.lng === "number" &&
    Number.isFinite(place.lat) &&
    Number.isFinite(place.lng)
  );
}

/** The chain as bare lookup keys, which is what the habitat seam consumes. */
export function packKeyValues(chain: readonly PackKey[]): string[] {
  return chain.map((key) => key.value);
}

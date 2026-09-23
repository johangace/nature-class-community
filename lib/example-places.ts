import { roundTryPlace, type TryPlace } from "@/lib/try-place";

/**
 * NAMED EXAMPLE PLACES (#877, third slice).
 *
 * Cohort reviewer 2, 2026-09-01: "It would be nice to see some content without
 * an account. Maybe have a few example locations?" The first two slices gave a
 * signed-out visitor the real thing — the demo run (#910) and then her own spot
 * through one question (#920). What stayed open on the ticket, in Johan's own
 * words and again in the 2026-09-13 content-lane pass, is this: named example
 * locations with a live read for each, a US one first.
 *
 * A visitor who will not type where her school is still gets to see the product
 * work on ground that is not hers, and the three places are chosen to show its
 * range rather than to flatter it: a Californian bay city, a desert city where
 * the honest instruction is NOT to look under logs (README, the bioregion
 * layer's whole reason), and the north London patch the packs were written for.
 *
 * WHERE THE COORDINATES COME FROM, AND WHY NOT FROM MY HEAD. Every pair below
 * is the point a recorded Pointmoon payload in this repository was actually
 * read at (`axes.place.coordinate` in each fixture named beside it), or the
 * sample patch this codebase already ships. Nothing here is a plausible number
 * typed from memory: a wrong coordinate is a true reading of somewhere else,
 * presented as this place, which is the exact defect #1234 existed to remove.
 *
 * WHAT IS READ IS THE ROUNDED PAIR, NOT THE RECORDED ONE, and deliberately.
 * Picking an example stores it the way a visitor's own spot is stored — two
 * decimals, about a kilometre — so Phoenix reads at 33.45,-112.07 rather than
 * at the 33.4484,-112.074 the fixture was taken at. That is the public-read
 * precision rule from the second slice, and exempting three places from it
 * would fan the reads out and give the recognition below nothing exact to
 * match on. The recorded pair is provenance that the place is real and was
 * read once; it is not a promise about which square kilometre serves today.
 * `exampleTryPlace` is what a visitor actually gets, and the tests assert
 * both: the constants against the fixtures, and the stored pair against the
 * literal it rounds to (raised in review of PR #1246).
 *
 * WHAT MAKES A PLACE AN EXAMPLE IS ITS COORDINATE, not a second cookie or a
 * flag. `openExamplePlace` writes the ordinary `nc-try-place` cookie, so every
 * signed-out fallback that already asks for the chosen spot keeps working
 * untouched, and `examplePlaceAt` recognises the place again by rounding the
 * pair the same way the cookie does. The cost of that choice, stated rather
 * than hidden: a visitor who types a spot that rounds onto one of these three
 * is told she is reading an example. She would be inside the same square
 * kilometre as it, so the sentence stays true, and no state has to be invented
 * to carry the distinction.
 */
export interface ExamplePlace {
  /** Stable id in a form action; never shown. */
  slug: string;
  /** What the visitor picked it by, and what every surface calls it after. */
  name: string;
  /** One line saying what this place shows that the others do not. */
  shows: string;
  lat: number;
  lng: number;
}

/**
 * US first, per the ticket. The order is the order she sees.
 */
export const EXAMPLE_PLACES: readonly ExamplePlace[] = [
  {
    slug: "berkeley-ca",
    name: "Berkeley, California",
    shows: "a Pacific bay city",
    // tests/fixtures/pointmoon/berkeley_ca.json — axes.place.coordinate
    lat: 37.8715,
    lng: -122.273,
  },
  {
    slug: "phoenix-az",
    name: "Phoenix, Arizona",
    shows: "a desert, where looking under logs is the wrong instruction",
    // tests/fixtures/pointmoon/phoenix_az.json — axes.place.coordinate
    lat: 33.4484,
    lng: -112.074,
  },
  {
    slug: "canonbury-london",
    name: "Canonbury, London",
    shows: "the north London patch the sessions were written for",
    // lib/outside/pointmoon.ts — SAMPLE_PATCH, the sample school's patch
    lat: 51.546,
    lng: -0.105,
  },
];

/** The example with this slug, or null. Anything unrecognised is nobody. */
export function examplePlaceBySlug(slug: unknown): ExamplePlace | null {
  if (typeof slug !== "string") return null;
  return EXAMPLE_PLACES.find((place) => place.slug === slug) ?? null;
}

/** An example as the cookie keeps it: rounded, and named by the list. */
export function exampleTryPlace(place: ExamplePlace): TryPlace {
  // Non-null: every pair above is a real coordinate, and a test pins that.
  return roundTryPlace(place.lat, place.lng, place.name)!;
}

/**
 * The example a spot IS, or null when it is somebody's own place.
 *
 * Compares what the cookie holds, so a stored spot and a listed example meet at
 * the same precision rather than at whichever one happened to be rounded.
 */
export function examplePlaceAt(
  place: { lat?: number | null; lng?: number | null } | null | undefined
): ExamplePlace | null {
  if (!place) return null;
  const here = roundTryPlace(place.lat, place.lng);
  if (!here) return null;
  return (
    EXAMPLE_PLACES.find((candidate) => {
      const there = roundTryPlace(candidate.lat, candidate.lng)!;
      return there.lat === here.lat && there.lng === here.lng;
    }) ?? null
  );
}

// Server-only: calls an outside geocoder over HTTP; never import from a client.

import { USER_AGENT } from "@/lib/source";

/**
 * Forward geocoding — a teacher types where the school is, we turn it into
 * coordinates.
 *
 * WHY THIS EXISTS. Onboarding's location step had exactly one route through
 * it: tap the button, allow the browser's geolocation prompt. A teacher
 * setting up from home in the evening, or on a desktop with no usable
 * position, or who simply declined the prompt, had nowhere to go (#56).
 *
 * PROVIDER. Nominatim (OpenStreetMap), the same geocoder Pointmoon already
 * calls for its place resolution, so this adds no new upstream to the org.
 * Free, no account, no key, no spend, ODbL data. `GEOCODER_API_URL` swaps it
 * for anything that speaks the same search shape (a self-hosted Nominatim, or
 * a paid provider later) without touching a caller.
 *
 * PRIVACY. Called from the server, never the browser: the teacher's IP and
 * user agent never reach OpenStreetMap, only the place text she typed. That
 * text is a school or a town, entered by an adult about a building. No child,
 * no account identifier, and nothing about who asked travels with it. Nothing
 * is stored here beyond the short-lived cache below; what the class keeps is
 * the rounded coordinate, exactly as the geolocation path stores it.
 *
 * MANNERS. OSM's usage policy asks for an identifying User-Agent and no more
 * than one request a second from one source. Both are honoured below, plus a
 * per-query cache so a teacher retrying the same search does not re-ask.
 *
 * ── WHY THERE IS NO `countrycodes` BIAS, AND WHY IT STAYS THAT WAY (#315) ───
 *
 * Nominatim takes a `countrycodes` parameter that narrows a search to one or
 * more jurisdictions. It is the obvious answer to "Richmond" and "Cambridge"
 * and "Boston" matching in several countries at once, and this search
 * deliberately does not pass it.
 *
 * We do not know the jurisdiction here. Screen 3 collects a class name, a year
 * group and a school name; the location step is where a country is first
 * learned at all. So any bias would be a guess about the teacher, hardcoded at
 * the one moment she has told us least about herself. A `gb` default would
 * help a British teacher pick between two Richmonds and would silently remove
 * the correct answer for a Berkeley or a Phoenix class, which this repo treats
 * as ordinary rather than exceptional.
 *
 * It would also fail in the shape #315 is about: not a visible error, but a
 * list quietly missing the true row, with no way for her to tell that the
 * filter, rather than the world, is what left it out.
 *
 * The ambiguity it would solve is already solved, honestly. Nominatim's
 * `display_name` ends in the country, `toResult` keeps the whole string, and
 * the step renders every candidate in full. Two Richmonds come back as two
 * clearly different rows and she picks the one she lives in. The disambiguator
 * is the teacher reading a complete label, which is the same principle the
 * located confirmation on that screen now runs on.
 *
 * If a bias is ever wanted, the honest version is a country the class has
 * actually told us about, applied as a re-ranking she can see past rather than
 * as a filter she cannot.
 */

const HOSTED_NOMINATIM = "https://nominatim.openstreetmap.org/search";
/** Same budget as the Pointmoon read: a teacher is standing at this screen. */
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 10 * 60 * 1_000;
/** OSM asks for no more than one request a second. */
const MIN_INTERVAL_MS = 1_000;
const MAX_RESULTS = 5;

/**
 * How we identify ourselves to OSM, per their usage policy. Deliberately a
 * real, contactable thing rather than a browser string.
 */
/** One candidate place, in the shape the location step renders. */
export interface GeocodeResult {
  /** Stable within a response; the list's React key and the pick handle. */
  id: string;
  /** What the teacher reads, e.g. "St Mary's Primary School, Ealing, London". */
  label: string;
  /**
   * Rounded to ~100m on the way out, the same rule the class store applies:
   * finer than weather varies, and no more precision than the job needs. A
   * school's coordinate never leaves here at full resolution.
   */
  lat: number;
  lng: number;
}

interface NominatimRow {
  place_id?: number | string;
  osm_id?: number | string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
}

const cache = new Map<string, { results: GeocodeResult[]; at: number }>();
/** One lookup per query at a time: concurrent askers share the promise. */
const inFlight = new Map<string, Promise<GeocodeResult[]>>();
let lastCallAt = 0;

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function normalize(query: string): string {
  return query.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Wait out the remainder of the courtesy interval, if any. */
async function pace(): Promise<void> {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastCallAt);
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastCallAt = Date.now();
}

/**
 * A row is only usable when it carries a name and a real coordinate. Anything
 * else is dropped rather than shown: an unpickable row in the list is worse
 * than a shorter list.
 */
function toResult(row: NominatimRow, index: number): GeocodeResult | null {
  const label = (row.display_name ?? row.name ?? "").trim();
  const lat = Number(row.lat);
  const lng = Number(row.lon);
  if (!label) return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    id: String(row.place_id ?? row.osm_id ?? `${index}:${lat},${lng}`),
    label,
    lat: round(lat),
    lng: round(lng),
  };
}

/**
 * Look a place up. Returns the candidates, or an empty list when the geocoder
 * found nothing.
 *
 * THROWS when the geocoder itself could not be reached or answered badly, and
 * that distinction is the whole point: "we searched and there is no such
 * place" and "we could not search" are different things to a teacher standing
 * at this screen, and the step says which one happened. Compare the Pointmoon
 * client, which resolves null on failure because a quiet sky and an
 * unreachable sky look the same to a card that simply shows less.
 */
export async function geocodePlace(query: string): Promise<GeocodeResult[]> {
  const key = normalize(query);
  if (key.length === 0) return [];

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.results;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const lookup = (async (): Promise<GeocodeResult[]> => {
    await pace();

    const base = process.env.GEOCODER_API_URL ?? HOSTED_NOMINATIM;
    const url = new URL(base);
    url.searchParams.set("q", query.trim());
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", String(MAX_RESULTS));

    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`geocoder responded ${res.status}`);

    const payload: unknown = await res.json();
    if (!Array.isArray(payload)) throw new Error("geocoder returned no list");

    const results = payload
      .map((row, index) => toResult(row as NominatimRow, index))
      .filter((r): r is GeocodeResult => r !== null)
      .slice(0, MAX_RESULTS);

    cache.set(key, { results, at: Date.now() });
    return results;
  })().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, lookup);
  return lookup;
}

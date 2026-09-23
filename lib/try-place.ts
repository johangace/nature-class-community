/**
 * THE PLACE A VISITOR CHOSE BEFORE SIGNING IN (#877, second slice).
 *
 * Cohort reviewer 2: "It would be nice to see some content without an
 * account." Johan's ruling, 2026-09-02: one question, where her school is,
 * and then the real thing for that spot, first session open, the account door
 * after it rather than in front of it.
 *
 * Pure by design, so the client, the server and a test can all read it. The
 * cookie itself is written by a server action and read by
 * `lib/try-place-server.ts`; this file only knows what a valid value is.
 *
 * TWO DECIMALS, ON PURPOSE. A class row keeps three. A visitor's spot is
 * rounded to about a kilometre so that two visitors in the same town share
 * one fifteen-minute Pointmoon read, which is what keeps a public surface from
 * fanning out into a bill. It is also the honest precision for a point nobody
 * has confirmed as a school yet.
 */

export const TRY_PLACE_COOKIE = "nc-try-place";

/** Thirty days: long enough to come back to, short enough to forget. */
export const TRY_PLACE_MAX_AGE = 60 * 60 * 24 * 30;

export interface TryPlace {
  lat: number;
  lng: number;
  /**
   * The name she picked or was shown when she chose the spot (#922). Kept
   * because the coordinates alone cannot give it back: rounding moves the
   * point a few hundred metres and the reverse geocoder then names the next
   * neighbourhood along, so a teacher who chose Ealing came back to "Park
   * Royal" and, on a bad day, to a pair of raw coordinates.
   */
  label?: string;
}

/** Enough for a school and its town, never a paragraph. */
const LABEL_MAX = 120;

/** A label fit to keep: trimmed, bounded, and free of the cookie's own separators. */
export function cleanTryLabel(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const text = raw.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, LABEL_MAX);
  return text ? text : undefined;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** A valid, rounded spot, or null when the numbers cannot be a place on earth. */
export function roundTryPlace(lat: unknown, lng: unknown, label?: unknown): TryPlace | null {
  const a = typeof lat === "number" ? lat : Number(lat);
  const b = typeof lng === "number" ? lng : Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  const name = cleanTryLabel(label);
  return name ? { lat: round2(a), lng: round2(b), label: name } : { lat: round2(a), lng: round2(b) };
}

/** The cookie value: "51.55,-0.11" or "51.55,-0.11|Ealing%2C%20London". */
export function serializeTryPlace(place: TryPlace): string {
  const coords = `${place.lat},${place.lng}`;
  return place.label ? `${coords}|${encodeURIComponent(place.label)}` : coords;
}

/** The cookie value read back, strictly. Anything odd is no place at all. */
export function parseTryPlace(raw: string | null | undefined): TryPlace | null {
  if (typeof raw !== "string") return null;
  const match = /^(-?\d{1,3}(?:\.\d{1,2})?),(-?\d{1,3}(?:\.\d{1,2})?)(?:\|([^|]{1,400}))?$/.exec(raw.trim());
  if (!match) return null;
  let label: string | undefined;
  if (match[3]) {
    try {
      label = decodeURIComponent(match[3]);
    } catch {
      label = undefined;
    }
  }
  return roundTryPlace(match[1], match[2], label);
}

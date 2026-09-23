import "server-only";
import { iso1A2Code } from "@rapideditor/country-coder";
import type { Locale } from "./localization";
import { validLocale } from "./locale-links";

/** Country boundaries, not the phenology regions. No network call and no
 * teacher location sent upstream. Country-coder is intentionally server-only:
 * neither the browser nor middleware needs the world boundary dataset.
 * The dataset generalizes some coastlines/borders; a saved preference wins.
 */
export function countryForCoords(lat?: number | null, lng?: number | null): string | null {
  if (typeof lat !== "number" || typeof lng !== "number" ||
      !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return iso1A2Code([lng, lat], { level: "territory" }) ?? null;
}

/** Two supported English editions. This is not a language or curriculum
 * classification of a country's residents. Other countries retain UK spelling
 * until a teacher chooses otherwise. US territories use the US edition.
 */
export function localeForCoords(lat?: number | null, lng?: number | null): Locale {
  return localeForCountry(countryForCoords(lat, lng)) ?? "uk";
}

export function resolveLocale(override: string | undefined,
  coords: { lat?: number | null; lng?: number | null } | null): Locale {
  return validLocale(override) ?? localeForCoords(coords?.lat, coords?.lng);
}

/** Missing or malformed IP country falls back to browser language. */
export function localeForCountry(country?: string | null): Locale | undefined {
  const code = country?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code) || code === "XX") return undefined;
  return ["US", "PR", "VI", "GU", "AS", "MP", "UM"].includes(code) ? "us" : "uk";
}

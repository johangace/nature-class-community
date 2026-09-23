import "server-only";
import { localeForCoords, localeForCountry } from "./location-locale";
import { localeForLanguageTag, type Locale } from "./localization";
import { validLocale } from "./locale-links";

/** Language is a preference; it never selects the school's nature or curriculum.
 * A regional landing is explicit. Once a school is known, its location outranks
 * the visitor's landing choice. A saved class override belongs above location.
 */
export function preferredLocale(input: {
  explicit?: unknown;
  saved?: unknown;
  location?: { lat?: number | null; lng?: number | null } | null;
  visitor?: unknown;
  language?: string | null;
  country?: string | null;
}): Locale {
  const explicit = validLocale(input.explicit);
  if (explicit) return explicit;
  const saved = validLocale(input.saved);
  if (saved) return saved;
  const { lat, lng } = input.location ?? {};
  if (typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng)) {
    return localeForCoords(lat, lng);
  }
  return validLocale(input.visitor) ?? localeForCountry(input.country) ?? localeForLanguageTag(input.language);
}

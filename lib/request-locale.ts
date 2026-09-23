import "server-only";
import { cookies, headers } from "next/headers";
import { getActiveClassLocation, getActiveEnglishLocale } from "./teacher";
import { preferredLocale } from "./locale-policy";
import { validLocale, VISITOR_LOCALE_COOKIE } from "./locale-links";

/** One request fallback for public pages and unlocated teachers. */
export async function requestLocaleChoice(explicit?: string, knownLocation?: { lat?: number | null; lng?: number | null } | null, savedPreference?: string | null) {
  const requested = validLocale(explicit);
  if (requested) return { locale: requested, automatic: false };
  const saved = validLocale(savedPreference === undefined ? await getActiveEnglishLocale() : savedPreference);
  if (saved) return { locale: saved, automatic: true };
  const location = knownLocation === undefined ? await getActiveClassLocation() : knownLocation;
  if (typeof location?.lat === "number" && typeof location?.lng === "number") {
    return { locale: preferredLocale({ location }), automatic: true };
  }
  const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);
  const visitor = explicit === "auto" ? undefined : validLocale(jar.get(VISITOR_LOCALE_COOKIE)?.value);
  return {
    locale: preferredLocale({ visitor, country: requestHeaders.get("x-vercel-ip-country"), language: requestHeaders.get("accept-language") }),
    automatic: !visitor,
  };
}

export async function requestLocale(...args: Parameters<typeof requestLocaleChoice>) {
  return (await requestLocaleChoice(...args)).locale;
}

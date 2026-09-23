import type { Locale } from "./localization";

export const VISITOR_LOCALE_COOKIE = "nc-visitor-locale";
export function validLocale(value: unknown): Locale | undefined {
  return value === "us" || value === "uk" ? value : undefined;
}

/** Preserve existing query parameters and fragments on same-origin product links. */
export function localeHref(href: string, locale: Locale, automatic = false): string {
  const url = new URL(href, "https://natureclass.education");
  if (automatic) url.searchParams.delete("locale");
  else url.searchParams.set("locale", locale);
  return `${url.pathname}${url.search}${url.hash}`;
}

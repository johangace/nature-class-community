import type { Metadata } from "next";
import type { Locale } from "@/lib/localization";

import { publicMetadata, LANGUAGE_ALTERNATES } from "@/lib/seo";
export function landingMetadata(locale?: Locale): Metadata {
  const path = locale ? `/${locale}` : "/";
  const description =
    "Ready-to-lead outdoor lessons for educators, shaped by your school’s location, season, weather and nearby nature.";
  const title = "Outdoor lessons for educators | Nature Class";
  const metadata = publicMetadata(path, title, description);
  return {
    ...metadata,
    alternates: { ...metadata.alternates, languages: LANGUAGE_ALTERNATES },
    openGraph: { ...metadata.openGraph,
      locale: locale === "us" ? "en_US" : "en_GB",
      alternateLocale: locale === "us" ? "en_GB" : "en_US",
    },
  };
}

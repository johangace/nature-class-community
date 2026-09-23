import type { MetadataRoute } from "next";
import { SITE_ORIGIN, LANGUAGE_ALTERNATES } from "@/lib/seo";
import { TEACHING_RESOURCES } from "@/lib/teaching-resources";

export default function sitemap(): MetadataRoute.Sitemap {
  // No synthetic lastModified: builds and requests are not editorial updates.
  return [
    ...["/", "/uk", "/us"].map((path) => ({ url: `${SITE_ORIGIN}${path}`, alternates: { languages: LANGUAGE_ALTERNATES } })),
    { url: `${SITE_ORIGIN}/schools` },
    { url: `${SITE_ORIGIN}/schools/nature-park` },
    { url: `${SITE_ORIGIN}/parents` },
    { url: `${SITE_ORIGIN}/children` },
    { url: `${SITE_ORIGIN}/resources` },
    { url: `${SITE_ORIGIN}/privacy` },
    { url: `${SITE_ORIGIN}/terms` },
    ...TEACHING_RESOURCES.map(({ slug }) => ({ url: `${SITE_ORIGIN}/resources/${slug}` })),
  ];
}

import type { Metadata } from "next";
import { SOURCE_REPOSITORY_URL } from "./source";

/** Public identity is independent of request hosts, preview URLs and auth origins. */
export const SITE_ORIGIN = "https://natureclass.education";
export const SITE_NAME = "Nature Class";
export const PUBLIC_ROBOTS = { index: true, follow: true, "max-image-preview": "large" as const };
export const SOCIAL_IMAGE = {
  url: `${SITE_ORIGIN}/opengraph-image?v=seed-logo-1`, width: 1200, height: 630,
  alt: "Nature Class — Teach with nature.",
};
export const LANGUAGE_ALTERNATES = {
  "en-US": `${SITE_ORIGIN}/us`, "en-GB": `${SITE_ORIGIN}/uk`, "x-default": `${SITE_ORIGIN}/`,
};

export function publicMetadata(path: string, title: string, description: string): Metadata {
  const url = `${SITE_ORIGIN}${path}`;
  return {
    title, description, robots: PUBLIC_ROBOTS,
    alternates: { canonical: url },
    openGraph: { type: "website", siteName: SITE_NAME, title, description, url, images: [SOCIAL_IMAGE] },
    twitter: { card: "summary_large_image", title, description, images: [SOCIAL_IMAGE.url] },
  };
}

/** Escape the HTML parser's script terminator, including in authored text. */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export const SITE_GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", "@id": `${SITE_ORIGIN}/#organization`, name: SITE_NAME,
      url: SITE_ORIGIN, email: "hi@natureclass.education",
      sameAs: [SOURCE_REPOSITORY_URL] },
    { "@type": "WebSite", "@id": `${SITE_ORIGIN}/#website`, name: SITE_NAME,
      url: SITE_ORIGIN, inLanguage: ["en-GB", "en-US"],
      publisher: { "@id": `${SITE_ORIGIN}/#organization` } },
  ],
};

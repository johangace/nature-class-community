import type { MetadataRoute } from "next";
import { SITE_ORIGIN } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // Applies equally to Googlebot, Bingbot, OAI-SearchBot, Claude-SearchBot
    // and PerplexityBot. Separate groups would replace this group's rules.
    // Let page crawlers read noindex on classroom screens. Auth protects data.
    rules: { userAgent: "*", allow: "/", disallow: ["/api/"] },
    sitemap: `${SITE_ORIGIN}/sitemap.xml`,
  };
}

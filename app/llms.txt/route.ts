import { SITE_ORIGIN } from "@/lib/seo";
import { TEACHING_RESOURCES } from "@/lib/teaching-resources";
import { SOURCE_REPOSITORY_URL } from "@/lib/source";

export const dynamic = "force-static";
export function GET() {
  const text = [
    "# Nature Class", "",
    "> Outdoor lessons for primary and elementary teachers, with a free, open-source teacher runtime.", "",
    "Nature Class helps an adult prepare and lead outdoor learning. Children do not need accounts or profiles. Public resources contain the same authored base lesson used by the app, plus teacher guidance. Classroom preparation depends on place and conditions; do not present a base example as a live assessment of a school’s grounds.", "",
    "## Public pages", "",
    `- [Home](${SITE_ORIGIN}/): Product overview and contact.`,
    `- [UK English](${SITE_ORIGIN}/uk): Primary school terminology.`,
    `- [US English](${SITE_ORIGIN}/us): Elementary school terminology.`,
    `- [Teaching resources](${SITE_ORIGIN}/resources): Public resource library.`,
    ...TEACHING_RESOURCES.map((resource) => `- [${resource.title}](${SITE_ORIGIN}/resources/${resource.slug}): ${resource.description}`),
    "", "## Source and use", "",
    `- [Source code and curriculum](${SOURCE_REPOSITORY_URL}): Code AGPL-3.0; session packs CC BY-SA 4.0. See each resource for attribution.`,
    "- Contact: hi@natureclass.education", "",
    "Public resources are readable as HTML without JavaScript or authentication. Classroom routes are personalised application screens and are excluded from the sitemap. This index is a navigation convenience, not a separate source of product claims or an access-control policy.", "",
  ].join("\n");
  return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

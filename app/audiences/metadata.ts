import { publicMetadata } from "@/lib/seo";
import type { Audience } from "./AudiencePage";

export function audienceMetadata(audience: Audience) {
  return publicMetadata(`/${audience}`,
    audience === "schools" ? "Outdoor learning for your school | Nature Class" : "Discover nature together | Nature Class",
    audience === "schools" ? "Make more of your school grounds with prepared outdoor lessons, practical teacher guidance and learning connected to nature." : "Explore and learn about nature together with outdoor lessons, background notes and pictures. Includes resources for home education and homeschooling.");
}

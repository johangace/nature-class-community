import Link from "next/link";
import { TEACHING_RESOURCES } from "@/lib/teaching-resources";
import { publicMetadata, SITE_ORIGIN, jsonLd } from "@/lib/seo";
import styles from "./resources.module.css";

export const metadata = publicMetadata("/resources", "Outdoor learning resources for teachers | Nature Class", "Free outdoor teaching resources for primary and elementary teachers: a complete science lesson and a practical guide to your first class outside.");

export default function ResourcesPage() {
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
      "@context": "https://schema.org", "@type": "CollectionPage",
      name: "Outdoor learning resources for teachers", url: `${SITE_ORIGIN}/resources`,
      mainEntity: { "@type": "ItemList", itemListElement: TEACHING_RESOURCES.map((resource, index) => ({
        "@type": "ListItem", position: index + 1, name: resource.title, url: `${SITE_ORIGIN}/resources/${resource.slug}`,
      })) },
    }) }} />
    <h1 className={styles.title}>Outdoor learning resources for teachers</h1>
    <p className={styles.lead}>A lesson you can lead and a plan for taking your first class outside. Written for primary and elementary teachers working in their own school grounds.</p>
    <p>Read these resources without signing in. The lesson uses the same authored script as Nature Class; open the classroom version when you want to prepare it for your place.</p>
    <ul className={styles.cards}>{TEACHING_RESOURCES.map((resource) => <li key={resource.slug}>
      <p>{resource.kind}</p><h2><Link href={`/resources/${resource.slug}`}>{resource.title}</Link></h2><p>{resource.description}</p>
    </li>)}</ul>
  </>;
}

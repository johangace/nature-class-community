import Link from "next/link";
import { notFound } from "next/navigation";
import { TEACHING_RESOURCES, findTeachingResource } from "@/lib/teaching-resources";
import { publicMetadata, SITE_ORIGIN, jsonLd } from "@/lib/seo";
import styles from "../resources.module.css";

type Props = { params: Promise<{ slug: string }> };
export const dynamicParams = false;
export function generateStaticParams() { return TEACHING_RESOURCES.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: Props) {
  const resource = findTeachingResource((await params).slug);
  if (!resource) notFound();
  return publicMetadata(`/resources/${resource.slug}`, `${resource.title} | Nature Class`, resource.description);
}

export default async function ResourcePage({ params }: Props) {
  const resource = findTeachingResource((await params).slug);
  if (!resource) notFound();
  const url = `${SITE_ORIGIN}/resources/${resource.slug}`;
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd({
      "@context": "https://schema.org", "@graph": [
        { "@type": "LearningResource", "@id": `${url}#resource`, url, name: resource.title,
          description: resource.description, learningResourceType: resource.kind,
          inLanguage: "en", audience: { "@type": "EducationalAudience", educationalRole: "teacher" },
          isAccessibleForFree: true,
          ...(resource.durationMin ? { timeRequired: `PT${resource.durationMin}M` } : {}),
          ...(resource.source ? { isBasedOn: resource.source.url, license: "https://creativecommons.org/licenses/by-sa/4.0/" } : {}),
          publisher: { "@type": "Organization", name: "Nature Class", url: SITE_ORIGIN },
        },
        { "@type": "BreadcrumbList", itemListElement: [
          { "@type": "ListItem", position: 1, name: "Nature Class", item: SITE_ORIGIN },
          { "@type": "ListItem", position: 2, name: "Teaching resources", item: `${SITE_ORIGIN}/resources` },
          { "@type": "ListItem", position: 3, name: resource.title, item: url },
        ] },
      ],
    }) }} />
    <nav className={styles.breadcrumb} aria-label="Breadcrumb"><Link href="/">Nature Class</Link> / <Link href="/resources">Teaching resources</Link> / <span aria-current="page">{resource.title}</span></nav>
    <article>
      <h1 className={styles.title}>{resource.title}</h1>
      <p className={styles.lead}>{resource.description}</p>
      <p>From Nature Class’s teaching resources.</p>
      {resource.sections.map((section, index) => <section key={section.heading} aria-labelledby={`section-${index}`}>
        <h2 id={`section-${index}`}>{section.heading}</h2>
        {section.paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
      </section>)}
      {resource.source && <p>Source: <a href={resource.source.url}>{resource.source.label}</a>. The base script is reproduced with added preparation and curriculum commentary under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</p>}
    </article>
    <aside aria-label="Continue teaching">
      <h2>Prepare a lesson for your class</h2>
      <p><Link href="/start">Start with your place and today’s lesson →</Link></p>
      {TEACHING_RESOURCES.filter((item) => item.slug !== resource.slug).map((item) => <p key={item.slug}><Link href={`/resources/${item.slug}`}>{item.title}</Link></p>)}
    </aside>
  </>;
}

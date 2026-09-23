import Image from "next/image";
import Link from "next/link";
import { INTL_LOCALE, type Locale } from "@/lib/localization";
import { localeHref } from "@/lib/locale-links";
import { Wordmark } from "../Wordmark";
import { PreparationGlyph } from "../session/PreparationGlyph";
import { AudienceLinks } from "./AudienceLinks";
import { PublicHeader } from "./PublicHeader";
import styles from "./audiences.module.css";

export const NATURE_PARK_CONTACT = "mailto:hi@natureclass.education?subject=Nature%20Park%20package";
const CRITERIA = "https://www.gov.uk/government/publications/national-education-nature-park-grant-funding/national-education-nature-park-2026-to-2027-academic-year-funding-criteria-guidance";

// Grouped from Johan's package list (2026-09-14). The grant pays for grounds work,
// equipment and specialist support; the lessons stay free, so the page never says
// the grant buys Nature Class.
const stages = [
  {
    glyph: "place",
    title: "Plan",
    items: [
      "A grounds assessment to find practical spots for planting and habitats.",
      "A baseline survey of what already lives on site.",
      "A simple biodiversity action plan: what to improve, why, and what pupils can watch for.",
    ],
  },
  {
    glyph: "life",
    title: "Improve",
    items: [
      "Planting and habitat work, with landscape and ecology partners where needed.",
      "Pupils help investigate, improve and care for their own grounds.",
    ],
  },
  {
    glyph: "season",
    title: "Learn all year",
    items: [
      "A year of free Nature Class lessons for your grounds, season and weather.",
      "Simple repeat observations so pupils see how the site changes.",
      "Guidance for teachers with no outdoor specialism.",
    ],
  },
] as const;

export function NatureParkPackage({ locale, automatic = false }: { locale: Locale; automatic?: boolean }) {
  return <div className={`${styles.page} ${styles.schoolPage}`} lang={INTL_LOCALE[locale]}>
    <a className={styles.skip} href="#content">Skip to content</a>
    <PublicHeader locale={locale} automatic={automatic} page="schools" />
    <main id="content">
      <section className={styles.schoolHero}>
        <div className={styles.schoolHeroCopy}>
          <p className={styles.kicker}><Link href={localeHref("/schools", locale, automatic)}>Schools</Link> · National Education Nature Park</p>
          <h1>Nature Park funding, <span>made practical.</span></h1>
          <p className={styles.lead}>Selected schools in England can apply for up to £5,000 through the National Education Nature Park for grounds improvements. We help plan and deliver the project, and pair it with free Nature Class lessons all year.</p>
          <div className={styles.heroActions}>
            <a className={styles.action} href={NATURE_PARK_CONTACT}>Ask us about the package <span aria-hidden="true">→</span></a>
          </div>
          <p className={styles.caption}>The Department for Education selects eligible schools and the RHS contacts them. <a href={CRITERIA}>Funding criteria</a></p>
        </div>
        <figure className={styles.schoolHeroPhoto}><Image src="/landing/bug-hotel-boots.jpg" alt="A small insect hotel made from wood and hollow stems" fill priority sizes="(max-width: 760px) 90vw, 46vw" /></figure>
      </section>

      <section className={styles.section} aria-labelledby="package-title">
        <h2 id="package-title">What the package includes</h2>
        <p>Built around the programme’s goals: more biodiversity, pupils taking part, and nature learning as part of school life. The grant is for grounds improvements, equipment and specialist support. Nature Class lessons are free for teachers.</p>
        <ol className={styles.stages}>
          {stages.map(({ glyph, title, items }) => <li key={title}>
            <PreparationGlyph name={glyph} size={28} />
            <h3>{title}</h3>
            <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
          </li>)}
        </ol>
        <div className={styles.stageNotes}>
          <p className={styles.stageNote}><strong>Help with the application.</strong> We shape the project and budget around the grant criteria with you.</p>
          <p className={styles.stageNote}><strong>Climate Action Plan evidence.</strong> Your sustainability lead gets a record of what changed and what pupils observed, to draw on for the school’s plan.</p>
        </div>
      </section>

      <section className={styles.close}>
        <div><h2>One project, from funding to delivery.</h2><p>From “we can get this funding” to a nature project children learn from throughout the year.</p></div>
        <a className={styles.closeAction} href={NATURE_PARK_CONTACT}>Ask us about the package <span aria-hidden="true">→</span></a>
      </section>
    </main>
    <footer className={styles.footer}>
      <Wordmark />
      <nav aria-label="Footer"><AudienceLinks locale={locale} automatic={automatic} /><Link href="/resources">Teaching resources</Link><Link href={localeHref("/sign-in", locale, automatic)}>Sign in</Link></nav>
    </footer>
  </div>;
}

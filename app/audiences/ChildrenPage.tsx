import Link from "next/link";
import { INTL_LOCALE, type Locale } from "@/lib/localization";
import { localeHref } from "@/lib/locale-links";
import { Wordmark } from "../Wordmark";
import { ChildrenLearning } from "../welcome/ChildrenLearning";
import landing from "../welcome/Landing.module.css";
import { AudienceLinks } from "./AudienceLinks";
import { PublicHeader } from "./PublicHeader";
import styles from "./audiences.module.css";

/** What children do and learn outside, told through real activities and teacher voices. */
export function ChildrenPage({ locale, automatic = false }: { locale: Locale; automatic?: boolean }) {
  const href = (value: string) => localeHref(value, locale, automatic);
  return <div className={styles.page} lang={INTL_LOCALE[locale]}>
    <a className={styles.skip} href="#content">Skip to content</a>
    <PublicHeader locale={locale} automatic={automatic} page="children" />
    <main id="content" className={landing.page}>
      <section className={`${landing.shell} ${styles.childrenHero}`} aria-labelledby="children-title">
        <p className={styles.kicker}>Nature Class for children</p>
        <h1 id="children-title">What children learn by <span>doing.</span></h1>
        <p className={styles.lead}>They plant, build, paint and look closely at the living things around them, then talk about what they found.</p>
      </section>
      <ChildrenLearning locale={locale} labelledBy="children-title" />
      <section className={styles.close} aria-labelledby="children-close">
        <div><h2 id="children-close">Find a lesson to try outside.</h2><p>Every lesson is prepared for the adult leading it, with the words, pictures and materials ready.</p></div>
        <Link className={styles.closeAction} href={href("/season")}>See the lessons <span aria-hidden="true">→</span></Link>
      </section>
    </main>
    <footer className={styles.footer}>
      <Wordmark />
      <nav aria-label="Footer"><AudienceLinks locale={locale} automatic={automatic} /><Link href="/resources">Teaching resources</Link><Link href={href("/sign-in")}>Sign in</Link></nav>
    </footer>
  </div>;
}

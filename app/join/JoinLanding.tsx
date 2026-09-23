import Link from "next/link";
import { Wordmark } from "../Wordmark";
import { joinHeadline } from "@/lib/join";
import { RememberSchool } from "./RememberSchool";
import styles from "./Join.module.css";

/**
 * Where an invited teacher lands (#529).
 *
 * She did not come looking for us. Someone she works with sent her a link, and
 * the first thing this page owes her is proof it is about her school and not a
 * mailshot: her school's name, in the headline, said back to her.
 *
 * Everything else is subtraction. /welcome is the page that argues the case to
 * a stranger; she has already been told what this is by a colleague she
 * trusts, so this page says what she gets, in three lines, and then gets out of
 * the way of the one action. No second call to action, no pricing, no tour.
 *
 * The name is untrusted text. It arrives sanitised (lib/join.ts) and is
 * rendered as a text child, never as markup, never into an attribute that
 * could be a URL.
 */
export function JoinLanding({
  school,
  cohort = null,
}: {
  school: string | null;
  /** The invite link's cohort code (#821). Remembered, never shown. */
  cohort?: string | null;
}) {
  return (
    <main className={styles.page}>
      {(school !== null || cohort !== null) && (
        <RememberSchool school={school} cohort={cohort} />
      )}

      <header className={styles.header}>
        <div className={`${styles.shell} ${styles.headerInner}`}>
          <Link className={styles.brand} href="/welcome" aria-label="Nature Class home">
            <Wordmark />
          </Link>
          <Link className={styles.signIn} href="/sign-in">
            Sign in
          </Link>
        </div>
      </header>

      <section className={`${styles.shell} ${styles.hero}`} aria-labelledby="join-title">
        <p className={styles.kicker}>
          <span className={styles.leafMark} aria-hidden="true" />
          You have been invited
        </p>
        <h1 id="join-title" className={styles.heroTitle}>
          {joinHeadline(school)}
        </h1>
        <p className={styles.heroLead}>
          Nature Class puts one ready lesson on your iPad: what to say, what to do
          with the weather and life around your school today, and what to carry.
        </p>

        <dl className={styles.gets}>
          <div className={styles.getsItem}>
            <dt>A shelf of lessons</dt>
            <dd>Ready to lead with your class, with nothing to plan first.</dd>
          </div>
          <div className={styles.getsItem}>
            <dt>Today, at your school</dt>
            <dd>The weather, the season and what has been seen nearby, read for your grounds.</dd>
          </div>
          <div className={styles.getsItem}>
            <dt>A sheet to print</dt>
            <dd>One A4 page for the class. No child accounts or profiles.</dd>
          </div>
        </dl>

        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/sign-in">
            Continue to sign in
            <span aria-hidden="true">→</span>
          </Link>
          <p className={styles.reassurance}>
            We email you a link, so there is no password to make. Free for teachers.
          </p>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={`${styles.shell} ${styles.footerInner}`}>
          <Wordmark />
          <p>Free for teachers. No child accounts or profiles.</p>
        </div>
      </footer>
    </main>
  );
}

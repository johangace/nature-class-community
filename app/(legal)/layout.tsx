import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "../Wordmark";
import styles from "../resources/resources.module.css";

/** Privacy and terms share one plain reading layout (#61). */
export default function LegalLayout({ children }: { children: ReactNode }) {
  return <div className={styles.page}><div className={styles.shell}>
    <header className={styles.nav}>
      <Link href="/" aria-label="Nature Class home"><Wordmark /></Link>
    </header>
    <main id="main-content">{children}</main>
    <footer className={styles.footer}>
      <p><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p>
      <a href="mailto:hi@natureclass.education">hi@natureclass.education</a>
    </footer>
  </div></div>;
}

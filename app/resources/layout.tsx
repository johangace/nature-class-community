import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "../Wordmark";
import styles from "./resources.module.css";

export default function ResourcesLayout({ children }: { children: ReactNode }) {
  return <div className={styles.page}><div className={styles.shell}>
    <header className={styles.nav}>
      <Link href="/" aria-label="Nature Class home"><Wordmark /></Link>
      <Link href="/start">Try today’s lesson →</Link>
    </header>
    <main id="main-content">{children}</main>
    <footer className={styles.footer}>
      <p><Link href="/resources">All teaching resources</Link> · <Link href="/season">Browse the curriculum</Link></p>
      <p>Nature Class · Free for teachers. Open source. No child accounts or profiles.</p>
      <p><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link> · <a href="mailto:hi@natureclass.education">Contact Nature Class</a></p>
    </footer>
  </div></div>;
}

import Link from "next/link";
import { PreparationGlyph } from "../PreparationGlyph";
import { lessonHref } from "../lesson-links";
import styles from "./start.module.css";

export function StartChoices({ sessionId, title, locale }: {
  sessionId: string;
  title: string;
  locale?: string;
}) {
  return (
    <main className={styles.page}>
      <Link className={styles.back} href={lessonHref("/session", sessionId, locale)}>← Back to lesson</Link>
      <section className={styles.content} aria-labelledby="start-heading">
        <p className={styles.lesson}>{title}</p>
        <h1 id="start-heading">Where are we starting?</h1>
        <div className={styles.choices}>
          <Link className={styles.choice} href={`${lessonHref("/run", sessionId, locale)}&start=indoors`}>
            <PreparationGlyph name="present" size={28} />
            <span className={styles.label}><strong>Indoors</strong><span>Present on the classroom screen</span></span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link className={styles.choice} href={`${lessonHref("/run", sessionId, locale)}&start=outside`}>
            <PreparationGlyph name="conditions" size={28} />
            <span className={styles.label}><strong>Outside</strong><span>Follow along in teacher view</span></span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
        <p className={styles.note}>Introduce today’s lesson together, then begin the outdoor activity.</p>
        <p className={styles.switchNote}>
          <span className={styles.toggleExample}><PreparationGlyph name="present" size={16} /> Present / Guide</span>
          <span>Switch views at any point during the introduction. Your place is kept.</span>
        </p>
      </section>
    </main>
  );
}

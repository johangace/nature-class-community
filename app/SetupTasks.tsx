import Link from "next/link";
import { setupProgress, type SetupInput } from "@/lib/setup-progress";
import { localizeText, type Locale } from "@/lib/localization";
import styles from "./today.module.css";

/**
 * The work that improves personalisation after the teacher has reached the
 * product. Class and Grounds are existing, durable profiles; this is only a
 * short path back to them, not a second onboarding system or a badge ledger.
 *
 * Only what is still open is listed. A detail she has recorded is visible on
 * its own page already, so a ticked line here would restate it; Johan,
 * 2026-09-02: "once they are checked they should disappear". And the list no
 * longer sits on Today at all, for the same reason: Today is the lesson, and
 * the class's own card is where what it knows and does not know belongs.
 *
 * MOUNTED NOWHERE, ON PURPOSE. #918 took it off Today and left the third part
 * of the answer — the open lines as one quiet "Add" line on the place card —
 * to #916. It is kept whole and unrendered so that #916 is one import rather
 * than a rebuild. Nothing on any page breaks visibly while it sleeps, so
 * `tests/unit/setup-tasks.spec.tsx` is what keeps it consumable: it pins the
 * heading, the open-only filter, and that every class here still exists in
 * today.module.css.
 */
export function SetupTasks({ locale = "uk", ...input }: SetupInput & { locale?: Locale }) {
  const progress = setupProgress(input);
  const t = (text: string) => localizeText(text, locale);

  // Once every optional detail is recorded the list goes quiet. The
  // permanent Class and Grounds homes remain available from navigation.
  if (progress.complete) return null;
  const open = progress.tasks.filter((task) => task.state === "open");

  return (
    <section className={styles.setupTasks} aria-labelledby="setup-tasks-title">
      <h2 className={styles.setupTitle} id="setup-tasks-title">
        Still to add
      </h2>
      <ul className={styles.setupList}>
        {open.map((task) => (
          <li className={styles.setupTask} key={task.id}>
            <span className={styles.setupCopy}>
              <strong>{t(task.title)}</strong>
              <span>{t(task.status)}</span>
            </span>
            <Link href={task.href}>Add</Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

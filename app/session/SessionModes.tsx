import Link from "next/link";
import { Suspense } from "react";
import { Wordmark } from "@/app/Wordmark";
import { carriesNothing, NOTHING_TO_CARRY } from "@/lib/kit";
import type { LessonViewProps } from "./PlanPageFrame";
import { lessonHref } from "./lesson-links";
import {
  LessonConnectionProvider,
  SessionOfflineControl,
  SessionPrintLink,
} from "./LessonConnection";
import { PreparationGlyph } from "./PreparationGlyph";
import { SessionConditionsNote } from "./SessionConditionsNote";
import type { TodayReadQuery } from "@/lib/outside/today";
import styles from "./session-modes.module.css";

export type SessionModesProps = LessonViewProps & {
  offlineAvailable: boolean;
  previewSeconds: number | null;
  /**
   * The day's read, as a query rather than a read (2026-09-08). Built once by
   * `loadLessonPreparation` and handed to both conditions placements, because
   * `getTodayRead` is cached on argument identity. See
   * `app/session/SessionConditionsNote.tsx` for why the page streams it.
   */
  todayQuery: TodayReadQuery;
};

/**
 * The lesson page IS the preparation surface (#832, superseding the two-door
 * framing on #750): "Before class" is a state the teacher is already in, not
 * another mode to enter. Preparation sits in the open as direct destinations,
 * and the introduction can begin indoors on the board or outside in teacher view.
 *
 * ── THE SHAPE, AFTER #870 ─────────────────────────────────────────────────
 *
 * That structure shipped as a four-column strip and Johan turned the strip
 * down on 2 September. Verbatim: "I do NOT like the horizontal presentation..
 * I am not statisfied with its shape it looks like we went backgward.. would
 * rather have them horizontal. and clear with icons the buttons on pre walk".
 *
 * Those two halves are about two different things, and the reading was
 * confirmed before this was drawn. The ARRANGEMENT was horizontal — four
 * tools strung across the page, cut by vertical hairlines, the only table row
 * in a product that bans chrome edges. The BUTTONS were not: each was an
 * upright column with its supporting line wrapping under it. So the strip
 * goes, and each tool becomes one horizontal bar: glyph, name, the single
 * fact that decides whether she taps it, chevron.
 *
 * The rows are the SAME SHAPE AT EVERY WIDTH. That is the point of them, not
 * a side effect. The old strip collapsed to a stack on a phone anyway, so its
 * horizontal arrangement was a desktop-only design that a teacher standing in
 * a corridor on the morning of a walk never saw. What is reviewed is now what
 * she gets.
 *
 * The lesson title stays at its full display size: Johan's call, taken
 * separately from the strip.
 */
export function SessionModes({
  activeClass,
  hazards,
  journey,
  homeHref: requestedHomeHref,
  locale,
  offlineAvailable,
  previewSeconds,
  session,
  todayQuery,
  weekOf,
}: SessionModesProps) {
  const className = activeClass?.name ?? "Your class";
  const homeHref = requestedHomeHref ?? (activeClass ? "/today" : "/");
  const homeLabel = homeHref === "/today" ? "back to today" : "back to landing";

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href={homeHref} className="app-shell-brand" aria-label={`Nature Class, ${homeLabel}`}>
          <Wordmark seed />
        </Link>
        <span>{className}</span>
      </header>

      <section className={styles.lessonHead}>
        <p className={styles.eyebrow}>{journey.packTitle} · {weekOf}</p>
        <h1>{journey.title}</h1>
        <p className={styles.summary}>{journey.childWork.summary}</p>
        <p className={styles.facts}>
          {journey.durationMinutes} min · {session.namedSkill}
        </p>
      </section>

      {/* TODAY'S CONDITIONS, WHERE SHE PREPARES (2026-09-08). Johan, on this
          screen: "i said somewhere here i dont see the line". The authored
          note read only on the run's day screen, which is after she has
          already decided what to carry.

          It sits between the facts and the lesson actions: the block
          above is what this lesson IS on any day, the rows below are what to
          do about today, and the note is the hinge between them — the reason
          today changes the doing. Absent on every day that authored no note
          and every day that matched none, with nothing held for it. */}
      <Suspense fallback={null}>
        <SessionConditionsNote query={todayQuery} session={session} />
      </Suspense>

      <LessonConnectionProvider offlineAvailable={offlineAvailable}>
        <section className={styles.threshold} aria-label="With your class">
          <div className={styles.thresholdHead}>
            <h2 className={styles.thresholdLabel}>With your class</h2>
            <SessionOfflineControl
              homeHref={homeHref}
              rowClassName={styles.doorOffline}
              sessionId={session.id}
            />
          </div>
          <div className={styles.doorRow}>
            <Link className={styles.start} href={lessonHref("/session/start", session.id, locale)}>
              <PreparationGlyph name="door" />
              <span>Start lesson</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>

        </section>

        <section className={styles.prepRows} aria-label="Prepare this lesson">
          {/* THE STATE LABEL SITS ON THE ROWS IT NAMES (2026-09-02). Johan:
              "put Before class above preview and make it clear". It opened the
              page as a small green eyebrow above the term line, three blocks
              away from the preparation it describes, and read as a tag on the
              title. Here it is the twin of "With your class" above: the two
              halves of the page, each named once, directly above its own
              rows. */}
          <p className={styles.stateLabel}>Before class</p>
          {previewSeconds !== null && (
            <div className={styles.prepRow}>
              <span className={`${styles.glyph} ${styles.glyphSpoken}`}>
                <PreparationGlyph name="preview" />
              </span>
              <div className={styles.rowText}>
                <Link
                  className={styles.rowAction}
                  href={lessonHref("/session/preview", session.id, locale)}
                >
                  Preview lesson
                </Link>
                <p>{Math.max(1, Math.round(previewSeconds / 60))} min, spoken through</p>
              </div>
              <span className={styles.chevron}>
                <PreparationGlyph name="chevron" size={20} />
              </span>
            </div>
          )}

          {/* PRE-READING, NOT "Read key ideas" (Johan, #870: "Pre-read? or
              preparation material?"). The runner's own intro already opens a
              door called Pre-reading onto this same primer, and /field labels
              the sheet the same way, so a second name for one destination was
              the product spelling itself two ways. "Preparation material" was
              the other candidate and is not used: this row sits inside a
              section already called "Prepare this lesson", under the state
              "Before class", so it would restate its own surroundings.
              What to bring lives here now, as ruled. The kit is what decides
              whether she opens the thing she reads the night before, and
              globals.css already describes this pairing — PREPARE "fronts the
              pre-reading and the kit". */}
          <div className={styles.prepRow}>
            <span className={styles.glyph}>
              <PreparationGlyph name="primer" />
            </span>
            <div className={styles.rowText}>
              <Link
                className={styles.rowAction}
                href={lessonHref("/session/primer", session.id, locale)}
              >
                Pre-reading
              </Link>
              <p>
                <strong>What to bring:</strong>{" "}
                {carriesNothing(session.kit)
                  ? session.preparation || NOTHING_TO_CARRY
                  : session.kit.join(", ")}
              </p>
            </div>
            <span className={styles.chevron}>
              <PreparationGlyph name="chevron" size={20} />
            </span>
          </div>
          <div className={styles.prepRow}>
            <span className={styles.glyph}>
              <PreparationGlyph name="safety" />
            </span>
            <div className={styles.rowText}>
              <Link className={styles.rowAction} href={lessonHref("/session/safety", session.id, locale)}>
                Safety
              </Link>
              {hazards && hazards.entries.length > 0 && (
                <p>{hazards.entries.length} safety {hazards.entries.length === 1 ? "check" : "checks"}</p>
              )}
            </div>
            <span className={styles.chevron}>
              <PreparationGlyph name="chevron" size={20} />
            </span>
          </div>

          <div className={styles.prepRow}>
            <span className={styles.glyph}>
              <PreparationGlyph name="print" />
            </span>
            <div className={styles.rowText}>
              <SessionPrintLink
                className={styles.rowAction}
                homeHref={homeHref}
                printHref={lessonHref("/print", session.id, locale)}
                sessionId={session.id}
              />
            </div>
            <span className={styles.chevron}>
              <PreparationGlyph name="chevron" size={20} />
            </span>
          </div>
        </section>


      </LessonConnectionProvider>
    </main>
  );
}

import { asLocale, localizeText } from "@/lib/localization";
import Link from "next/link";
import { Wordmark } from "@/app/Wordmark";
import { lessonHref } from "../lesson-links";
import type { LessonViewProps } from "../PlanPageFrame";

/**
 * BEFORE YOU GO OUT. The hazards, on their own page (#417).
 *
 * Johan, 2026-08-24, looking at the band on the brief: *"why are they not in a
 * hazards page. or safety page"*.
 *
 * The band was on the brief deliberately — a warning first seen in a field is a
 * warning that arrived late — and that reasoning is not wrong, it is just
 * outgrown. #388 grew hazards from a short universal core into three tiers, and
 * a good list got long: six entries, each a bold name over two lines, running
 * further down the brief than the lesson itself. A safety list that pushes the
 * lesson off the screen is a safety list she scrolls past, and the moment it
 * becomes furniture it has stopped working. It reads better as a page she
 * actually reads.
 *
 * ── SO THE DOOR CARRIES THE WARNING, NOT JUST THE LINK ─────────────────────
 *
 * The one thing a cut like this must not do is make the hazards quiet. The
 * brief's door names the count and the reach ("six things for grounds like
 * yours"), so the fact that there IS something to read survives on the screen
 * where she decides how the class goes out. A door reading only "Safety" would
 * have been the silent version of this change.
 *
 * ── NOT CHECKED IS NOT SAFE ────────────────────────────────────────────────
 *
 * `hazards === null` means nothing resolved, and this page says exactly that.
 * It is the oldest rule in lib/lesson/hazards.ts and the easiest to lose in a
 * move: an empty page that looks calm reads as "there is nothing out there",
 * which is the one sentence this product must never accidentally say.
 */
export function SafetyPage(props: LessonViewProps) {
  const { journey, session, hazards } = props;
  const homeHref = props.homeHref ?? (props.activeClass ? "/today" : "/");
  const homeLabel = homeHref === "/today" ? "back to today" : "back to landing";

  return (
    <main className="primer-page">
      <div className="plan-topbar">
        <Link href={homeHref} className="plan-home" aria-label={`Nature Class, ${homeLabel}`}>
          <Wordmark />
        </Link>
        <Link
          className="plan-pack primer-back"
          href={lessonHref("/session", session.id, props.locale)}
        >
          ← {journey.title}
        </Link>
      </div>

      <h1 className="primer-title">Before you go out</h1>

      {hazards ? (
        <>
          <section className="primer-section">
            <p className="primer-body">
              {hazards.source === "pack"
                ? "Written for your region."
                : localizeText("A general list for grounds like yours, not a survey of your patch.", asLocale(props.locale))}{" "}
              Your own risk assessment leads.
            </p>
          </section>

          <section className="primer-section">
            <dl className="primer-glossary">
              {hazards.entries.map((hazard) => (
                <div key={hazard.id}>
                  <dt>{hazard.name}</dt>
                  <dd>{hazard.note}</dd>
                  {/* The receipt a record-selected entry stands on. A universal
                      entry claims only "grounds like yours" and shows nothing,
                      which is the difference between the two tiers made
                      visible rather than described. */}
                  {hazard.recordedAs && (
                    <dd className="primer-glossary-spoken">
                      Recorded near this school: {hazard.recordedAs}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </section>
        </>
      ) : (
        <section className="primer-section">
          <p className="primer-body">
            {localizeText("Nothing has been checked for these grounds. That is not the same as nothing being out there, so walk the route yourself before the class does.", asLocale(props.locale))}
          </p>
        </section>
      )}
    </main>
  );
}

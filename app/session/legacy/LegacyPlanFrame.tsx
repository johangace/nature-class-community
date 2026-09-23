import type { ReactNode } from "react";
import Link from "next/link";
import { LessonMediaStrip } from "../LessonMediaStrip";
import { legacyHref, type LessonPreparationPath } from "../lesson-links";
import type { LessonViewProps } from "../PlanPageFrame";

export type { LessonViewProps };

/**
 * THE OLD FIVE-PAGE PLAN, kept alive as a second mode for prototyping only.
 *
 * Johan, 16 August: "if feasible mauybe we can have 2 modes.. but only if it is
 * feasible and easy,.. for prototyping reasons". It was easy, because the whole
 * thing was one `git show` away, so both can be looked at in the live app
 * side by side rather than argued about from screenshots.
 *
 * Reached ONLY via `?plan=legacy`. The scroll (nc#232) is the default, and this
 * is not a supported second product: it exists so a real teacher flow can be
 * compared against the real alternative, and it should be deleted the moment
 * that comparison has been made. Every link inside it carries `plan=legacy`
 * forward, so entering the mode keeps you in it until you leave the plan.
 */

type PageLink = {
  label: string;
  path: LessonPreparationPath | "/";
};

/**
 * The whole journey, visible from every page: a teacher can see where she is,
 * what's left, and jump straight to the one page she needs — the ten-minutes
 * teacher goes Ready → Place in one tap, not three page loads.
 */
const PREPARATION_STEPS: { label: string; path: LessonPreparationPath }[] = [
  { label: "Ready", path: "/session" },
  { label: "Primer", path: "/session/primer" },
  { label: "Place", path: "/session/place" },
  { label: "Route", path: "/session/route" },
  { label: "Take", path: "/session/take" },
];

export function LegacyPlanFrame({
  activeClass,
  back,
  children,
  current,
  journey,
  homeHref: requestedHomeHref,
  locale,
  media = [],
  next,
  session,
  title,
  weekOf,
  withContext = false,
}: LessonViewProps & {
  back: PageLink;
  children: ReactNode;
  current: LessonPreparationPath;
  next?: PageLink;
  title: string;
  withContext?: boolean;
}) {
  const homeHref = requestedHomeHref ?? (activeClass ? "/today" : "/");
  const hrefFor = (link: PageLink) =>
    link.path === "/" ? homeHref : legacyHref(link.path, session.id, locale);

  return (
    <main className="plan-page">
      <div className="plan-topbar">
        <Link href={hrefFor(back)} className="plan-back">
          ← {back.label}
        </Link>
        <span className="plan-pack">
          {journey.packTitle} · {weekOf}
        </span>
      </div>

      <nav className="plan-steps" aria-label="Lesson preparation steps">
        <ol>
          {PREPARATION_STEPS.map((step, index) => (
            <li key={step.path}>
              {step.path === current ? (
                <span aria-current="page">
                  <span className="plan-step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  {step.label}
                </span>
              ) : (
                <Link href={legacyHref(step.path, session.id, locale)}>
                  <span className="plan-step-number" aria-hidden="true">
                    {index + 1}
                  </span>
                  {step.label}
                </Link>
              )}
            </li>
          ))}
        </ol>
      </nav>

      <header className="plan-heading">
        <h1 className="plan-question">{title}</h1>
        <p className="plan-session-title">{journey.title}</p>
        {withContext && (
          <ul className="plan-context" aria-label="Class, age and lesson time">
            <li>
              <span>Class</span>
              <strong>{activeClass?.name ?? "Demo class"}</strong>
            </li>
            <li>
              <span>Age</span>
              <strong>
                {activeClass ? activeClass.yearGroup + " · " : ""}ages {journey.ageBand}
              </strong>
            </li>
            <li>
              <span>Time</span>
              <strong>{journey.durationMinutes} min</strong>
            </li>
          </ul>
        )}
      </header>

      <nav className="plan-actions" aria-label="Lesson action">
        <Link href={legacyHref("/run", session.id, locale)} className="btn-start">
          Lead now →
        </Link>
      </nav>

      <div className="plan-page-content">{children}</div>

      <LessonMediaStrip items={media} heading="Photo references" />

      {next && (
        <nav className="plan-page-nav" aria-label="Continue lesson preparation">
          <Link href={hrefFor(next)}>{next.label}</Link>
        </nav>
      )}
    </main>
  );
}

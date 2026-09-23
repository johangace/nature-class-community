import type { Locale } from "@/lib/localization";
import { localeHref } from "@/lib/locale-links";
import Link from "next/link";
import type { ShelfTier } from "@/lib/pack";
import { fieldHref, type FieldHomeHref } from "@/lib/offline/field-location";

export type SeasonPackView = {
  id: string;
  title: string;
  collection?: { id: string; label: string };
  sessions: Array<{
    id: string;
    title: string;
    prompt?: string;
    /** One or two subject labels, sentence-cased for display here. */
    labels?: readonly string[];
    durationMin: number;
  }>;
};

interface SeasonPackSectionProps {
  locale?: Locale;
  pack: SeasonPackView;
  tier: ShelfTier;
  led: ReadonlySet<string>;
  nextUp: string | null;
  offline?: boolean;
  homeHref?: FieldHomeHref;
  /** Signed out: the only session that opens. Null opens every included one. */
  openOnly?: string | null;
  /**
   * False for a season that has not come round yet (Johan, 2026-09-06: "just
   * keep the titles but say unlocks December"). The sessions are listed by
   * title, nothing links anywhere, and the heading says the month.
   */
  open?: boolean;
  opensIn?: string | null;
  /**
   * Titles a closed season will carry once its lessons are written. Listed
   * after the sessions it already has, numbered on, with no minutes: a title
   * is a promise of a lesson, not a lesson. Ignored when the season is open.
   */
  planned?: readonly string[];
}

/**
 * The labels as small pills, one each, sentence case: "Sustainability"
 * "Science". Johan asked for pills on 2026-09-06 ("the tags could be more
 * elegant, maybe look like pills"), which overrides the July art direction's
 * no-pills rule for this one element. They are drawn in that direction's
 * register all the same: a hairline on paper, no colour fill, the small text
 * size, and nothing to press.
 */
function LabelPills({ labels }: { labels: readonly string[] }) {
  return (
    <span className="shelf-labels">
      {labels.map((label) => (
        <span key={label} className="shelf-label">
          {label.charAt(0).toUpperCase() + label.slice(1)}
        </span>
      ))}
    </span>
  );
}

/** One visible pack on /season, with product availability kept out of pack data. */
export function SeasonPackSection({
  pack,
  locale,
  tier,
  led,
  nextUp,
  offline = false,
  homeHref = "/",
  openOnly = null,
  open = true,
  opensIn = null,
  planned = [],
}: SeasonPackSectionProps) {
  if (pack.sessions.length === 0 && planned.length === 0) return null;
  const premium = tier === "premium";
  const unlocks = !open && opensIn ? `Unlocks ${opensIn}` : null;

  // A season that has not come round yet is a closed drawer (Johan,
  // 2026-09-06: "the inactive seasons could be less prominent, closed in
  // behind drawers"): the heading, the count and the month show; the titles
  // wait behind a tap. Native disclosure, so it works with no JavaScript and
  // in the offline shell, and the markup below is unchanged for a test that
  // reads it.
  if (!open) {
    return (
      <details className="shelf shelf-season-locked">
        <summary className="shelf-head shelf-drawer">
          <h2 className="shelf-heading">{pack.title}</h2>
          <p className="shelf-pack-meta">
            <span>
              {pack.sessions.length + planned.length}{" "}
              {pack.sessions.length + planned.length === 1 ? "session" : "sessions"}
            </span>
            {unlocks && <span className="shelf-unlocks">{unlocks}</span>}
            <span className="shelf-drawer-mark" aria-hidden="true" />
          </p>
        </summary>
        <ol className="shelf-list">
          {pack.sessions.map((session, index) => (
            <li key={session.id} className="shelf-card shelf-card-locked">
              <div className="shelf-row">
                <span className="shelf-line">
                  <span className="shelf-title">{session.title}</span>
                  {session.labels && session.labels.length > 0 && (
                    <LabelPills labels={session.labels} />
                  )}
                </span>
                <span className="shelf-card-foot">
                  <span className="shelf-meta">
                    <span className="shelf-n">Session {index + 1}</span>
                    <span aria-hidden="true">·</span>
                    <span className="shelf-mins">{session.durationMin} min</span>
                  </span>
                  {unlocks && <span className="shelf-locked">{unlocks}</span>}
                </span>
              </div>
            </li>
          ))}
          {planned.map((title, index) => (
            <li key={title} className="shelf-card shelf-card-locked shelf-card-planned">
              <div className="shelf-row">
                <span className="shelf-line">
                  <span className="shelf-title">{title}</span>
                </span>
                <span className="shelf-card-foot">
                  <span className="shelf-meta">
                    <span className="shelf-n">Session {pack.sessions.length + index + 1}</span>
                  </span>
                  {unlocks && <span className="shelf-locked">{unlocks}</span>}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </details>
    );
  }

  return (
    <section className="shelf">
      <header className="shelf-head">
        <h2 className="shelf-heading">{pack.title}</h2>
        <p className="shelf-pack-meta">
          <span>
            {pack.sessions.length}{" "}
            {pack.sessions.length === 1 ? "session" : "sessions"}
          </span>
          {premium && <span className="shelf-tier">Premium</span>}
          {pack.collection && (
            <span className="shelf-collection">{pack.collection.label}</span>
          )}
        </p>
      </header>
      <ol className="shelf-list">
        {pack.sessions.map((session, index) => {
          // Signed out, one session opens and the rest are the sign-in door
          // (#877). The row still says what the session is, so she sees the
          // whole programme before she decides. Offline, a lesson already
          // saved on the device opens from here as it always did: the door
          // is a nudge toward an account, and a class with no signal is not
          // the moment to nudge.
          const waits =
            !premium &&
            !offline &&
            openOnly !== null &&
            session.id !== openOnly;
          const lessonHref = waits
            ? "/sign-in"
            : offline
              ? fieldHref(session.id, "run", homeHref)
              : `/session?session=${session.id}`;
          const highlighted =
            !premium &&
            (openOnly === null
              ? session.id === nextUp && !led.has(session.id)
              : session.id === openOnly);
          const status = premium
            ? "Premium"
            : led.has(session.id)
              ? "led"
              : highlighted
                ? openOnly === null
                  ? "next up"
                  : "open"
                : waits
                  ? "sign in to open"
                  : "open lesson";
          const cardClassName = [
            "shelf-card",
            highlighted ? "next-up" : null,
            premium ? "shelf-card-premium" : null,
            waits ? "shelf-card-locked" : null,
          ]
            .filter(Boolean)
            .join(" ");
          const row = (
            <>
              <span className="shelf-line">
                <span className="shelf-title">{session.title}</span>
                {session.prompt && (
                  <span className="shelf-prompt">{session.prompt}</span>
                )}
                {session.labels && session.labels.length > 0 && (
                  <LabelPills labels={session.labels} />
                )}
              </span>
              <span className="shelf-card-foot">
                <span className="shelf-meta">
                  <span className="shelf-n">Session {index + 1}</span>
                  <span aria-hidden="true">·</span>
                  <span className="shelf-mins">{session.durationMin} min</span>
                  {!waits && (
                    <span
                      className={
                        premium
                          ? "shelf-premium"
                          : led.has(session.id)
                            ? "shelf-led"
                            : "shelf-next"
                      }
                    >
                      {status}
                    </span>
                  )}
                </span>
                {!premium &&
                  (waits ? (
                    <span className="shelf-lock-action">
                      <span className="shelf-locked">{status}</span>
                      <span
                        className="shelf-action shelf-action-lock"
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 24 24">
                          <rect
                            x="6.5"
                            y="10"
                            width="11"
                            height="9"
                            rx="2"
                          />
                          <path d="M9 10V7.5a3 3 0 0 1 6 0V10" />
                        </svg>
                      </span>
                    </span>
                  ) : (
                    <span
                      className="shelf-action shelf-action-play"
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="m9.5 7 7 5-7 5Z" />
                      </svg>
                    </span>
                  ))}
              </span>
            </>
          );

          return (
            <li key={session.id} className={cardClassName}>
              {premium ? (
                <div className="shelf-row">{row}</div>
              ) : (
                <Link
                  href={locale && !offline ? localeHref(lessonHref, locale) : lessonHref}
                  onClick={
                    offline && !waits
                      ? (event) => {
                          event.preventDefault();
                          window.location.assign(lessonHref);
                        }
                      : undefined
                  }
                >
                  {row}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

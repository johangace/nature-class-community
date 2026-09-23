import type { ReactNode } from "react";
import Link from "next/link";
import type { LessonHazards } from "@/lib/lesson/hazards";
import type { LessonJourney } from "@/lib/lesson/journey";
import type { LessonMediaItem } from "@/lib/lesson/media";
import type { Session } from "@/schema/pack";
import type { RememberedFact } from "@/lib/world-memory";
import { Wordmark } from "@/app/Wordmark";

export type PlanClass = { name: string; yearGroup: string; abilityBand?: string | null };

export type LessonViewProps = {
  journey: LessonJourney;
  /**
   * Authored hazards for these grounds and this month (#376), resolved by the
   * shared server helper (#417). `null` means NOT CHECKED, never "safe" — the
   * surfaces that read this must say the difference out loud.
   */
  hazards?: LessonHazards | null;
  assistantAvailable?: boolean;
  media?: LessonMediaItem[];
  weekOf: string;
  session: Session;
  activeClass: PlanClass | null;
  /** The active class's id, when there is one, for writes from a lesson page. */
  activeClassId?: string | null;
  /**
   * What we remember about her grounds (#509), already composed server-side.
   * Empty for the demo path and for a teacher who has told us nothing, and an
   * empty list renders nothing at all rather than an empty frame.
   */
  remembered?: RememberedFact[];
  /** The last retire on the memory strip did not write (#509). */
  retireFailed?: boolean;
  /** Explicit because signed-in teachers can exist before their first class. */
  homeHref?: "/" | "/today";
  locale?: string;
};

/**
 * THE DOORWAY. The ten-second read, standing, coat on.
 *
 * Johan: "first screen when u enter is minimalist jsust few lines + larning
 * objectives", after twice rejecting what was here — "things are so cramed..
 * no ui hierarchy there is too much text on the screen".
 *
 * Before this, the entry screen carried the whole lesson: five sections, four
 * closed folds, two hero-size lines shouting at each other, and 82 words in the
 * first viewport alone. It was trying to be three reads at once.
 *
 * The architecture is now three surfaces, split by READ rather than by content
 * type — which is why this is not a return to the five-page rail it replaced:
 *
 *   the doorway (here)  ten seconds, standing, deciding whether today works
 *   the paper (/print)  one tap, one choice, then the OS dialog
 *   the primer          ten minutes, seated, the night before
 *
 * Folding the primer into this page was wrong in both directions: it taxed the
 * doorway with the primer's weight, and demoted background knowledge to a fold,
 * which for background knowledge means unread. This amends ruling R1.2 and is
 * recorded as such rather than left to fight it silently.
 *
 * The threshold is the only green surface in the entire pre-leading
 * architecture. Nothing else here is allowed to compete with the door.
 */
export function PlanPageFrame({
  children,
  activeClass,
  homeHref: requestedHomeHref,
  journey,
  weekOf,
}: LessonViewProps & { children: ReactNode }) {
  const homeHref = requestedHomeHref ?? (activeClass ? "/today" : "/");
  const homeLabel = homeHref === "/today" ? "back to today" : "back to landing";

  return (
    <main className="plan-page plan-doorway">
      <div className="plan-topbar">
        <Link href={homeHref} className="plan-home" aria-label={`Nature Class, ${homeLabel}`}>
          <Wordmark />
        </Link>
        <span className="plan-pack">
          {journey.packTitle} · {weekOf}
        </span>
      </div>
      {children}
    </main>
  );
}

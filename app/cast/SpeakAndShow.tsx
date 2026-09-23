"use client";

import { CastFace } from "@/app/CastFace";
import { castSlug, type CastMember } from "@/lib/cast/member";
import type { TopicTag } from "@/schema/pack";

/** The shape this surface needs, named so the runner can hold it as a prop
 * without importing the whole cast module into its own signature. */
export type SpeakCastMember = CastMember;
import { hasSafety } from "@/lib/cast/speak";

interface SpeakAndShowBaseProps {
  members: CastMember[];
  /** Read-aloud lines, composed server-side and indexed with `members`. */
  lines: string[];
  /** The lesson this cast belongs to, for the bar across the top. */
  sessionTitle: string;
  /** The producer scope that selected this lesson cast. */
  profileTopic?: TopicTag | null;
  /**
   * The lesson's session id, in a run. Every face then links to its profile
   * WITH the way back into this run (#874); browsing surfaces never pass it.
   */
  sessionId?: string | null;
}

type SpeakAndShowProps = SpeakAndShowBaseProps &
  (
    | {
        /** Standalone browsing keeps the existing species-profile links. */
        mode?: "browse";
        onBack?: never;
        onContinue?: never;
      }
    | {
        /** A live run owns navigation and must always provide a way out. */
        mode: "run";
        onBack: () => void;
        onContinue: () => void;
      }
  );

/**
 * Speak and show — the lesson's small field-guide list.
 *
 * The run used to carry a weather readout, which #168 correctly called a
 * poster. This is what replaces it: the lesson's topic-filtered cast, all in
 * view together, each with one thumbnail, one name and one line to say. The
 * entities are links to their species notes; the photographs never become the
 * page or hide the rest of the cast behind paging (#233).
 */
export function SpeakAndShow({
  members,
  lines,
  sessionTitle,
  profileTopic = null,
  sessionId = null,
  mode = "browse",
  onBack,
  onContinue,
}: SpeakAndShowProps) {
  if (members.length === 0) return null;

  const inRun = mode === "run";

  return (
    <section
      className="speak"
      aria-label={`${sessionTitle}, ${members.length} to look for`}
    >
      <div className="speak-head">
        <p className="speak-kicker">What to look for</p>
        <h2 className="speak-title">{sessionTitle}</h2>
      </div>

      <ul className="speak-list">
        {members.map((member, index) => (
          <li
            key={castSlug(member)}
            className={hasSafety(member) ? "speak-item-safe" : undefined}
          >
            <CastFace
              member={{ ...member, line: lines[index] ?? "" }}
              size="tile"
              profileTopic={profileTopic}
              fromRun={inRun ? sessionId : null}
            />
          </li>
        ))}
      </ul>

      {inRun && (
        <nav className="speak-nav" aria-label="Lesson navigation">
          <button type="button" onClick={onBack}>
            <span aria-hidden="true">&larr;</span>
            <span>Back</span>
          </button>
          <button type="button" onClick={onContinue}>
            <span>Continue</span>
            <span aria-hidden="true">&rarr;</span>
          </button>
        </nav>
      )}
    </section>
  );
}

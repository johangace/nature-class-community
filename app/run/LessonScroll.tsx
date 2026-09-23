import type { ReactElement } from "react";
import Link from "next/link";
import type { AbilityBand, Session } from "@/schema/pack";
import { resolvePhases } from "@/lib/resolve";
import { groupMoments } from "@/lib/moments";
import { phaseBlocks } from "@/lib/lesson/stretch";
import { thresholdConditions } from "@/lib/run/threshold-conditions";
import { renderBlock } from "@/engine/registry";
import { LessonFinish } from "./LessonFinish";
import { RunningHead } from "./RunningHead";
import type { LogTarget } from "./Runner";
import { Wordmark } from "@/app/Wordmark";
import { LessonMediaStrip } from "@/app/session/LessonMediaStrip";
import type { LessonMediaItem } from "@/lib/lesson/media";

/**
 * THE LESSON, as one surface with SECTIONS THAT OWN THEIR OWN LIGHT
 * (nc#285, #286, #288 — adapted from the Claude Design teacher journey,
 * templates/teacher-journey/TeacherJourney.dc.html).
 *
 * Johan's rulings, 2026-08-17: each section gets its own UI ("eg settle,
 * circle"); reaching the end of a section offers a threshold naming the next
 * one; the finishing experience comes off the scroll; the settle is the same
 * everywhere by default, and a pack that authors its own settle overrides it.
 *
 * The journey the design draws, carried here:
 *   arrival (paper)  — gather at the door: title, conditions, the parts at a
 *                      glance, one threshold in.
 *   settle (dusk)    — the default ritual, every lesson, unless the pack
 *                      authored its own settle phase.
 *   the body (night) — a teleprompter, not a dashboard. Dark ground, the
 *                      spoken line in big display type, teacher notes a step
 *                      back. Eyes on the children, not the screen.
 *   circle (paper)   — a guide, not a script: back to the light, questions
 *                      held together.
 *   close (paper)    — the celebration the packs author, the skill named, and
 *                      the thirty-second reflection. Its own destination at
 *                      the foot, never the last paragraph of the scroll.
 *
 * Each section ends on ONE threshold naming the next ("Next · The circle").
 * The thresholds are anchors on the same surface, so scroll remains the
 * position and nothing pages (R12/R14 hold); they give the sectional pacing
 * back to the teacher's thumb without hiding anything behind a turn.
 *
 * STILL A SERVER COMPONENT — the lesson can never render blank (nc#253). The
 * two client shells (RunningHead, LessonFinish) enhance; they are not load
 * bearing.
 *
 * Not yet carried from the legacy runner (still at ?run=legacy for the
 * side-by-side Johan asked to keep): resume, the ability-band switch, the
 * cast beat, outdoor mode.
 */

/**
 * The default settle, per Johan's ruling: "the same settle for now...
 * everywhere.. as default then if packs have their own settle great." The
 * words are a universal quieting ritual — they claim nothing about the place,
 * the season or the species, so they can never be wrong outside any door.
 */
const DEFAULT_SETTLE = [
  { lead: "Stand still", line: "Feet on the ground, hands by your sides." },
  { lead: "Three slow breaths", line: "In through the nose, out like a sigh." },
  { lead: "Listen", line: "Catch the farthest sound you can hear. Keep it to yourself." },
];

export function LessonScroll({
  ability,
  homeHref = "/",
  locale,
  logTo,
  media = [],
  nextTitle,
  session,
}: {
  /**
   * The class's band, or absent when nobody knows it (#860). Absent renders
   * every block's text as written — the same answer a band with no authored
   * variant gets — rather than picking a real band on the class's behalf.
   */
  ability?: AbilityBand;
  homeHref?: "/" | "/today";
  locale?: string;
  /** Present only for a signed-in teacher with an active class. */
  logTo?: LogTarget | null;
  /** Rights-complete, topic-filtered images for this lesson. */
  media?: LessonMediaItem[];
  nextTitle?: string | null;
  session: Session;
}): ReactElement {
  const phases = resolvePhases(session, null);
  const total = phases.reduce((sum, phase) => sum + (phase.durationMin ?? 0), 0);

  // A pack-authored settle overrides the default ritual outright.
  const authoredSettle = phases.find((phase) => phase.key === "settle");
  const bodyPhases = phases.filter((phase) => phase !== authoredSettle);

  // A circle is any phase gathered around circle questions — the named-skill
  // beat and teacher notes ride along without changing what the section is.
  const isCirclePhase = (phase: (typeof phases)[number]) =>
    phase.blocks.some((block) => block.type === "circle-question");

  // Say the conditions once, at arrival — ambience, not a moment.
  //
  // The rule moved into `lib/run/threshold-conditions.ts` with #672, unchanged:
  // the first conditions-line of the plan as written, hoisted to the one screen
  // before the teaching and filtered out of every moment below. It is shared
  // now because the default runner does the same at its threshold, and two
  // surfaces answering "which line is the day's line" separately is how they
  // drift apart.
  const arrivalConditions = thresholdConditions(session);

  const headParts = [
    { id: "settle", title: authoredSettle?.title ?? "Settle" },
    ...bodyPhases.map((phase) => ({ id: phase.key, title: phase.title })),
    { id: "close", title: "Close" },
  ];

  /** The one threshold out of each section, naming where it leads. */
  const threshold = (href: string, label: string, dark = false) => (
    <div className="tj-threshold">
      <a className={dark ? "tj-next tj-next-dark" : "tj-next"} href={href}>
        {label}
      </a>
    </div>
  );

  const closeLabel = session.celebration ? "Finish · celebration" : "Finish the lesson";

  return (
    <main className="run run-scroll">
      <div className="run-topbar">
        <Link href={homeHref} className="run-home" aria-label="Nature Class, back to today">
          <Wordmark />
        </Link>
        <Link
          href={`/session?session=${session.id}${locale ? `&locale=${locale}` : ""}`}
          className="run-back"
        >
          ← Before the lesson
        </Link>
        {total > 0 && <span className="run-total">{total} min</span>}
      </div>

      {/* ARRIVAL — gather at the door (nc#288). The lesson's name is the
          largest thing on the page (nc#287: its class no longer shares a name
          with the legacy topbar label, so no cascade can shrink it), then the
          day's conditions, then the whole session glanceable as parts and
          minutes before she commits to the first one. */}
      <section className="tj-arrival" id="arrival">
        <h1 className="run-lesson-title">{session.title}</h1>
        {arrivalConditions && (
          <div className="run-arrival">{renderBlock(arrivalConditions, ability)}</div>
        )}
        <div className="tj-overview" aria-label="The parts of this lesson">
          {bodyPhases.map((phase) => (
            <div className="tj-overview-part" key={phase.key}>
              <span className="tj-overview-title">{phase.title}</span>
              {phase.durationMin ? (
                <span className="tj-overview-min">{phase.durationMin} min</span>
              ) : null}
            </div>
          ))}
        </div>
        {/* "Settle everyone", not "Settle the class" (#467). Six of the eight
            personas in the #454 report are not UK primary teachers, and the
            runner told every one of them so. The rest of this file's
            audience language is NOT neutralised here on purpose: the repo's
            own answer is `groupNoun(groupType)` (`lib/group-profile.ts`),
            which keeps "class" for a school and says "family" or "group"
            otherwise — and the runner cannot reach `groupType`, so using it
            is a data-flow change #467 rules out. The remaining thirteen sites
            are inventoried on #1214 rather than flattened to a word that costs
            the teacher surface what #467 promises it will not. */}
        {threshold("#settle", `Settle everyone`)}
      </section>

      <RunningHead parts={headParts} />
      <div className="run-head-fade" aria-hidden="true" />

      {/* SETTLE — its own screen, every lesson (nc#285). Pack-authored where
          one exists; the universal ritual otherwise. */}
      <section className="tj-settle" id="settle">
        <div className="run-crest">
          <span className="run-phase-title">{authoredSettle?.title ?? "Settle"}</span>
          {authoredSettle?.durationMin ? (
            <span className="run-phase-min">{authoredSettle.durationMin} min</span>
          ) : null}
        </div>
        {authoredSettle ? (
          groupMoments(authoredSettle.blocks).map((moment, momentIndex) => (
            <div className="run-moment" key={momentIndex}>
              {moment.blocks
                .filter((block) => block.type !== "conditions-line")
                .map((block, blockIndex) => (
                  <div className="block-slot" key={blockIndex}>
                    {renderBlock(block, ability)}
                  </div>
                ))}
            </div>
          ))
        ) : (
          <ol className="tj-settle-steps">
            {DEFAULT_SETTLE.map((step) => (
              <li key={step.lead}>
                <span className="tj-settle-lead">{step.lead}</span>
                <span className="tj-settle-line">{step.line}</span>
              </li>
            ))}
          </ol>
        )}
        {bodyPhases[0] &&
          threshold(`#${bodyPhases[0].key}`, `Begin · ${bodyPhases[0].title}`)}
      </section>

      {/* THE BODY — a teleprompter, not a dashboard. One moment allotted its
          room; the spoken line is the largest thing under this sky. The circle
          steps back into the light, questions held together as a guide. */}
      <ol className="run-phases">
        {bodyPhases.map((phase, index) => {
          const isCircle = isCirclePhase(phase);
          const next = bodyPhases[index + 1];
          const moments = groupMoments(phaseBlocks(phase));
          return (
            <li
              key={phase.key}
              className={isCircle ? "run-phase tj-circle" : "run-phase tj-dark"}
              id={phase.key}
            >
              <div className="run-crest">
                <span className="run-phase-title">{phase.title}</span>
                <span className="tj-part-count">
                  Part {index + 1} of {bodyPhases.length}
                  {phase.durationMin ? ` · ${phase.durationMin} min` : ""}
                </span>
              </div>
              {moments.map((moment, momentIndex) => {
                const blocks = moment.blocks.filter(
                  (block) => block.type !== "conditions-line"
                );
                if (blocks.length === 0) return null;
                return (
                  <div className="run-moment" key={momentIndex}>
                    {blocks.map((block, blockIndex) => (
                      <div className="block-slot" key={blockIndex}>
                        {renderBlock(block, ability)}
                      </div>
                    ))}
                  </div>
                );
              })}
              {next
                ? threshold(`#${next.key}`, `Next · ${next.title}`, !isCircle)
                : threshold("#close", closeLabel, !isCircle)}
            </li>
          );
        })}
      </ol>

      <LessonMediaStrip items={media} heading="Who this lesson is about" />

      {/* CLOSE — off the scroll's tail and onto its own ground (nc#286).
          Not the pack-authored celebration line: its headline and keepsake
          are specific claims about what the class found and did
          ("You met the neighbours." / "Legs were counted. Wings were
          found..."), and this surface can be reached with any phase skipped
          via the folio and no observation ever recorded (nc#458). THE APP
          DOES NOT KNOW WHAT THE CLASS FOUND, so it does not say. The lines
          are Johan's own and verbatim-guarded (scripts/verbatim-fidelity.mjs)
          — they stay in the pack untouched — but the renderer stops
          asserting them, same as `HybridJourney` and the legacy `Runner`
          (tests/unit/walk-blockers.spec.tsx). What survives unconditionally:
          the session finished, the skill this lesson is built to grow (a
          fact about the plan, not a claim it landed), and next week (a fact
          about the shelf). */}
      <section className="tj-close" id="close">
        <div className="tj-celebration">
          {session.celebration?.emoji && (
            <span className="tj-celebration-emoji" aria-hidden="true">
              {session.celebration.emoji}
            </span>
          )}
          <p className="tj-celebration-eyebrow">that was today</p>
          <p className="tj-celebration-headline">{session.title} is done.</p>
          <div className="tj-skill">
            <span className="tj-skill-eyebrow">the skill we grow</span>
            <span className="tj-skill-name">{session.namedSkill}</span>
          </div>
          {(session.celebration?.nextWeekTease ?? nextTitle) && (
            <p className="tj-celebration-tease">
              {session.celebration?.nextWeekTease ?? `Next week: ${nextTitle}.`}
            </p>
          )}
        </div>
        <nav className="run-foot" aria-label="Finish or leave the lesson">
          {logTo ? (
            <LessonFinish
              classId={logTo.classId}
              className={logTo.className}
              homeHref={homeHref}
              nextTitle={nextTitle}
              sessionId={session.id}
            />
          ) : (
            <Link href={homeHref} className="run-leave">
              Back to today
            </Link>
          )}
        </nav>
      </section>
    </main>
  );
}

import { requestLocale } from "@/lib/request-locale";
import { localeForCoords } from "@/lib/location-locale";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { canonicalSessionId, loadAllPacks, shelfPacks } from "@/lib/pack";
import { activePlaceContext, shelfForPlace } from "@/lib/place-context";
import { classMinutesOutside, getActiveClass, getTeacher } from "@/lib/teacher";
import { hasSignal, termSignal } from "@/lib/journal";
import { drivingQuestion } from "@/lib/lesson/driving-question";

import { AppNav } from "../AppNav";
import { EntryReflection } from "./EntryReflection";

/**
 * Journal (/journal) — the teacher's own record of the term.
 *
 * The prototype called this the notebook, and it was more than a log: it
 * showed the shape of the term, carried each session's driving question, set
 * the reflection taps as chips, and let a teacher answer the close's questions
 * days later from her sofa. This page kept the honest data and lost all four
 * (#327). They are back here, on our data model rather than the prototype's.
 *
 * Three parts, in the order a teacher wants them:
 *
 *  1. THE TALLY. Cumulative child-minutes outside, the north-star number, and
 *     the one figure Nature Class reports to its funder.
 *  2. WHAT THE TAPS SAY. A term of close answers read back as a few plain
 *     lines (lib/journal.ts, which holds the honesty rules: a question stays
 *     silent under three answers, and a tie says nothing).
 *  3. EVERY SESSION LED, most recent first — one entry per COMPLETION, not per
 *     session, so a lesson led twice is two entries with two dates and two
 *     reflections. Under them, what is still ahead on the shelf.
 *
 * Teacher-reported only, no child PII, no free text: every word on this page
 * is a date, a number, authored pack copy, or a token from the closed
 * vocabulary in lib/reflection.ts. That holds for the reflection form too —
 * it renders the same four lists the runner's finish does.
 */
export const dynamic = "force-dynamic";

export default async function JournalPage() {
  const teacher = await getTeacher();
  if (!teacher) redirect("/sign-in");

  const active = await getActiveClass(teacher.id);
  const sessions = new Map(
    loadAllPacks().flatMap((p) =>
      // Driving question through the same rule the shelf uses (#150): the
      // entry already carries the title, so a prompt that restates it adds a
      // duplicate line rather than a second fact.
      p.sessions.map(
        (s) => [s.id, { title: s.title, prompt: drivingQuestion(s) ?? undefined }] as const
      )
    )
  );

  const [tally, led] = active
    ? await Promise.all([
        classMinutesOutside(active.id),
        prisma.sessionCompletion.findMany({
          where: { classId: active.id, endedAt: { not: null } },
          orderBy: { endedAt: "desc" },
          take: 50,
          select: {
            id: true,
            sessionId: true,
            endedAt: true,
            headcount: true,
            mood: true,
            happenings: true,
            timing: true,
            moreOf: true,
            note: true,
          },
        }),
      ])
    : [null, []];

  // Dates in the class's own voice: a school in Ohio should not read its own
  // journal in day-month order (the same rule Today's date line follows).
  const locale = await requestLocale(undefined, active);
  const dateFormat = locale === "us" ? "en-US" : "en-GB";

  const signal = termSignal(led);

  // What is still ahead: the same shelf /season shows, narrowed to this place,
  // minus everything already led. Named plainly rather than dressed as a
  // to-do list — a session not yet led is not an overdue task.
  const place = await activePlaceContext();
  // Through the retired-id map (#468), so a lesson led under an old id is not
  // listed as still ahead of a class that has already been out and done it.
  const ledIds = new Set(led.map((c) => canonicalSessionId(c.sessionId)));
  const ahead = active
    ? shelfForPlace(
        shelfPacks({
          lat: active.lat ?? null,
          declaredSeasons: place.pack.seasonOntology.seasons,
        }),
        place
      )
        .flatMap((pack) => pack.sessions)
        .filter((s) => !ledIds.has(s.id))
    : [];

  return (
    <main className="journal">
      <AppNav />
      <header className="journal-head">
        <p className="journal-eyebrow">Your journal</p>
        <h1>What you noticed</h1>
        {!active ? (
          <p className="journal-intro">
            <Link href="/classes">Set up a class</Link> to start a journal.
          </p>
        ) : (
          <p className="journal-intro">
            A quiet record of every session with {active.name}, kept for you.
          </p>
        )}
        {tally && tally.sessionsLed > 0 && (
          <p className="journal-tally">
            {tally.countedSessions > 0 && (
              <>{tally.minutes.toLocaleString()} child-minutes outside so far · </>
            )}
            {tally.sessionsLed}{" "}
            {tally.sessionsLed === 1 ? "session" : "sessions"} led
          </p>
        )}
      </header>

      {/* Nothing led yet: say what will land here, and where to start. */}
      {active && led.length === 0 && (
        <section className="journal-empty">
          <h2>Nothing noted yet</h2>
          <p>
            Lead a session with {active.name} and it lands here: the date and
            whatever you chose to keep at the close.
          </p>
          <Link href="/season">Look at the season</Link>
        </section>
      )}

      {/* The taps, read back. Silent until there is enough to be honest about. */}
      {hasSignal(signal) && (
        <section className="journal-signal">
          <h2>What your taps say</h2>
          <ul>
            {signal.mood && (
              <li>
                Most often it felt <strong>{signal.mood.words}</strong> ·{" "}
                {signal.mood.count} of {signal.mood.of}
              </li>
            )}
            {signal.happening && (
              <li>
                What happened most: <strong>{signal.happening.words}</strong> ·{" "}
                {signal.happening.count} of {signal.happening.of}
              </li>
            )}
            {signal.timing && (
              <li>
                On time: <strong>{signal.timing.words}</strong> ·{" "}
                {signal.timing.count} of {signal.timing.of}
              </li>
            )}
            {signal.moreOf && (
              <li>
                Your class has asked for <strong>{signal.moreOf.words}</strong>{" "}
                · {signal.moreOf.count} of {signal.moreOf.of}
              </li>
            )}
          </ul>
          <p className="journal-signal-foot">
            From {signal.reflected}{" "}
            {signal.reflected === 1 ? "reflection" : "reflections"} you tapped
            at the close. Yours only, counted here and nowhere else.
          </p>
        </section>
      )}

      {active && led.length > 0 && (
        <ol className="journal-log">
          {led.map((c) => {
            const sessionId = canonicalSessionId(c.sessionId);
            const session = sessions.get(sessionId);
            const reflection = {
              mood: c.mood,
              happenings: c.happenings,
              timing: c.timing,
              moreOf: c.moreOf,
              note: c.note,
            };
            return (
              <li key={c.id} className="journal-entry">
                <span className="entry-mark" aria-hidden="true">
                  {/* Led. The mark is a tick because the record is of
                      something done, not of a box on a list. */}
                  ✓
                </span>
                <div className="entry-body">
                  <h2 className="entry-title">
                    <Link href={`/session?session=${sessionId}`}>
                      {session?.title ?? sessionId}
                    </Link>
                  </h2>
                  <p className="entry-meta">
                    {c.endedAt?.toLocaleDateString(dateFormat, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                    {c.headcount !== null && (
                      <>
                        {" · "}
                        {c.headcount} {c.headcount === 1 ? "child" : "children"}
                      </>
                    )}
                  </p>
                  {/* The session's driving question, where /season shows it:
                      the line that tells one session from another a term on. */}
                  {session?.prompt && (
                    <p className="entry-prompt">{session.prompt}</p>
                  )}
                  <EntryReflection
                    completionId={c.id}
                    reflection={reflection}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {active && led.length > 0 && ahead.length > 0 && (
        <section className="journal-ahead">
          <h2>Still to lead</h2>
          <ul>
            {ahead.map((s) => {
              const question = drivingQuestion(s);
              return (
                <li key={s.id}>
                  <Link href={`/session?session=${s.id}`}>{s.title}</Link>
                  {question && <span className="entry-prompt">{question}</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </main>
  );
}

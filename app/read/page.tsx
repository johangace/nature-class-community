import { requestLocale } from "@/lib/request-locale";
import Link from "next/link";
import { localizeDeep } from "@/lib/localization";
import { SeenNearby } from "@/app/SeenNearby";
import { notFound } from "next/navigation";
import { findSession, leadPack } from "@/lib/pack";
import { activePlaceContext, sessionForPlace } from "@/lib/place-context";
import { getActiveClassLocation, getTeacher } from "@/lib/teacher";
import { phaseMinutes } from "@/lib/minutes";
import { spokenLine } from "@/lib/text";
import { carriesNothing, NOTHING_TO_CARRY } from "@/lib/kit";
import { primaryTopicOf } from "@/lib/lesson/door";
import { phaseBlocks } from "@/lib/lesson/stretch";

/**
 * Read first: the teacher's five quiet minutes before going out. Composed
 * entirely from the session's own data — the objective, the skill, the
 * primer depth (summary, why, key words, child-friendly phrasings), the
 * bridge from last time, how to get ready, and every teacher-note in phase
 * order — so a teacher can walk the whole session in her head at breaktime,
 * then leave the reading behind and lead. No new content lives here; this
 * is another renderer of the pack.
 */
export default async function ReadPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; locale?: string }>;
}) {
  const home = leadPack();
  const { session: wanted, locale: localeParam } = await searchParams;
  const found = wanted ? findSession(wanted) : { pack: home, session: home.sessions[0] };
  if (!found?.session) notFound();
  // The localization layer (#142): what renders is the reader's English; the
  // source stays Johan's. Locale derives from the class's own coordinates,
  // with ?locale=us|uk as the explicit override.
  const [teacher, classLocation] = await Promise.all([
    getTeacher(),
    getActiveClassLocation(),
  ]);
  const homeHref = teacher ? "/today" : "/";
  const homeLabel = teacher ? "Back to today" : "Back to Nature Class";
  const locale = await requestLocale(localeParam, classLocation);
  // Habitat before localization, same order and same reason as lesson-data.ts:
  // the seam picks the instruction, localization puts it in the reader's
  // English. "Space:" below is the field a teacher reads BEFORE deciding to
  // run the lesson, so a London answer in a desert wastes their preparation.
  const place = await activePlaceContext();
  const session = localizeDeep(await sessionForPlace(found.session, place), locale);

  return (
    <main className="read">
      <p className="read-eyebrow">Read first · {session.durationMin} min outside</p>
      <h1>{session.title}</h1>
      {/* The session's driving question (`session.prompt`) is deliberately NOT
          here. It renders on /season, where a teacher picks a session by it,
          and on /session, where a rule and the meta line separate it from the
          objective. On this page the two lines stack adjacent in the same
          register, and for A5 leaf collage the prompt is a truncation of the
          objective under it ("Create art with nature." above "Create art with
          nature, taking influence from what the children see around them."),
          which reads as a rendering bug rather than as two fields.

          That last observation turned out to be a bug on the surfaces that DO
          show both, not an argument for this page alone: `drivingQuestion`
          (lib/lesson/driving-question.ts) now suppresses a prompt that merely
          restates the title or opens the objective, so /season, /session,
          /journal, /run and the printed cards stop stacking the pair. This
          page still omits the question on its own grounds. */}
      <p className="read-objective">{session.objective}</p>
      <p className="read-skill">
        The skill this session grows: {session.namedSkill}.
      </p>
      {session.connectionToLast && (
        <p className="read-bridge">Last time: {session.connectionToLast}</p>
      )}

      <SeenNearby
        topicTags={session.topicTags}
        primaryTopic={primaryTopicOf(session)}
        sessionId={session.id}
      />

      {session.primer && (
        <section className="read-phase read-primer">
          <h2>Before the steps</h2>
          <p className="primer-summary">{session.primer.summary}</p>
          {session.primer.why && (
            <>
              <h3 className="primer-label">Why it matters</h3>
              <p>{session.primer.why}</p>
            </>
          )}
          {session.primer.glossary && session.primer.glossary.length > 0 && (
            <>
              <h3 className="primer-label">Words to have ready</h3>
              <dl className="read-glossary">
                {session.primer.glossary.map((entry) => (
                  <div key={entry.term}>
                    <dt>{entry.term}</dt>
                    <dd>
                      <p>{entry.definition}</p>
                      {entry.forChildren && (
                        <p className="read-forchildren">
                          &ldquo;{spokenLine(entry.forChildren)}&rdquo;
                        </p>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {session.primer.childFriendlyExamples &&
            session.primer.childFriendlyExamples.length > 0 && (
              <>
                <h3 className="primer-label">Ways to say it</h3>
                <ul className="read-examples">
                  {session.primer.childFriendlyExamples.map((line) => (
                    <li key={line}>&ldquo;{spokenLine(line)}&rdquo;</li>
                  ))}
                </ul>
              </>
            )}
        </section>
      )}

      {(session.preparation || session.spaceNeeded) && (
        <section className="read-phase">
          <h2>Get ready</h2>
          {session.preparation && <p>{session.preparation}</p>}
          {session.spaceNeeded && <p>Space: {session.spaceNeeded}</p>}
        </section>
      )}

      {session.phases.map((phase) => {
        const notes = phaseBlocks(phase).filter((b) => b.type === "teacher-note");
        return (
          <section className="read-phase" key={phase.key}>
            <h2>
              {phase.title}{" "}
              {phaseMinutes(phase) && <span className="mins">{phaseMinutes(phase)}</span>}
            </h2>
            {notes.length > 0 ? (
              notes.map((note, i) => <p key={i}>{note.text}</p>)
            ) : (
              <p className="read-quiet">
                No notes for this part: it runs off the spoken lines alone.
              </p>
            )}
            {phase.conditionVariants?.map((v) => (
              <p className="read-variant" key={v.when}>
                If {v.when}: the plan swaps to {v.phase.title.toLowerCase()}.
              </p>
            ))}
          </section>
        );
      })}

      <section className="read-phase">
        <h2>Carry outside</h2>
        {/* The zero case says so in a sentence, the same one the printed plan
            uses. Wildflower investigation genuinely needs nothing carried, and
            its source row says so with an empty list; joining that list gave
            a heading over a blank line. */}
        <p>{carriesNothing(session.kit) ? NOTHING_TO_CARRY : session.kit.join(" · ")}</p>
      </section>

      <div className="read-actions">
        {/* Same words as /session's button: one verb the whole way in (#149). */}
        <Link href={`/run?session=${session.id}`} className="btn-start">
          Enter
        </Link>
        <Link href={homeHref}>{homeLabel}</Link>
      </div>
    </main>
  );
}

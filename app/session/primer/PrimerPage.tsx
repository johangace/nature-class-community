import Link from "next/link";
import { PreparationGlyph } from "../PreparationGlyph";
import styles from "./primer.module.css";
import { Wordmark } from "@/app/Wordmark";
import { lessonHref } from "../lesson-links";
import { spokenLine } from "@/lib/text";
import { standardsSystemNames } from "@/schema/pack";
import { groupStandardsCitations } from "@/lib/standards";
import { LessonPreparationAssistant } from "../LessonPreparationAssistant";
import { RememberedGrounds } from "./RememberedGrounds";
import type { LessonViewProps } from "../PlanPageFrame";

/**
 * THE PRIMER. Ten minutes, seated, the night before.
 *
 * Johan, ruling on Sophia's first cut of this page: "As for the primer it
 * should not be as much bold and what to say, more to give the teacher context
 * in teacher readabla form as an assistant material the runner is for what to
 * say."
 *
 * So this page carries NO spoken lines and no script column. That was the
 * proposal and he cut it: the words she says live in the runner, on the surface
 * she holds while teaching, and duplicating them here would create two sources
 * for one sentence — the exact drift the one-component rule exists to prevent.
 *
 * It is also deliberately NOT set in display type. This is the one surface in
 * the product where a wall of text is correct: it is read seated, in one sitting,
 * the way you read a page of a book. So it is body prose at a comfortable
 * measure, quiet heads, and almost no bold — the opposite of every other
 * surface here, and correct for exactly that reason.
 *
 * "Keywords" needed no schema change: `primer.glossary` already exists and is
 * richly authored, each term carrying its own child-facing phrasing. Since #409
 * that phrasing renders here too, and it is worth naming why it is not the
 * exception to the no-script rule below: a term's `forChildren` is what the
 * WORD means said out loud, not a line in the lesson. It has no place in the
 * running order, the runner never speaks it as a step, and it is the only form
 * of a definition a five-year-old can hold. The rule is about the script.
 *
 * `primer.childFriendlyExamples` is deliberately NOT rendered here, and a test
 * guards that. Despite the name it holds SPOKEN LINES — "When a leaf on the
 * ground catches your eye, say hello to it. Turn it over and meet both sides."
 * — which is script, and script lives in the runner. I had it on this page and
 * the test caught it, which is the whole reason the guard is written against
 * the pack's own say-aloud text rather than against a class name.
 *
 * Where a session's primer is thin, this page runs SHORT rather than padded.
 * Most sessions are the thin case, and an honest short page is better than a
 * long one that invents context the author never wrote.
 */
export function PrimerPage(props: LessonViewProps) {
  const { journey, session } = props;
  const homeHref = props.homeHref ?? (props.activeClass ? "/today" : "/");
  const homeLabel = homeHref === "/today" ? "back to today" : "back to landing";
  const primer = session.primer;
  const glossary = primer?.glossary ?? [];
  // Grouped by the reference cited, in `lib/standards.ts` so this surface and
  // the printable cannot drift into grouping the same citation two ways.
  const citations = groupStandardsCitations(session.standards ?? []);

  return (
    <main className={`primer-page ${styles.page}`}>
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

      <h1 className="primer-title">Pre-reading</h1>

      {/*
       * WHAT WE REMEMBER, BEFORE THE LESSON'S OWN SECTIONS (#509).
       *
       * It leads because the order is the argument: she reads what this place
       * is before she reads what the hour is for, and a fact she has stopped
       * recognising is cheapest to correct the moment she meets it rather than
       * after she has planned around it. The component renders nothing at all
       * when there is nothing remembered, so the demo path and a first-run
       * teacher see the page exactly as they did before.
       */}
      {props.activeClassId && (props.remembered?.length ?? 0) > 0 && (
        <RememberedGrounds
          classId={props.activeClassId}
          facts={props.remembered ?? []}
          sessionId={session.id}
          locale={props.locale}
          retireFailed={props.retireFailed}
        />
      )}

      <section className="primer-section">
        <h2 className="primer-head">Learning objective</h2>
        <p className="primer-body">{journey.objective}</p>
      </section>

      {citations.length > 0 && (
        <section className="primer-section">
          <h2 className="primer-head">Curriculum links</h2>
          {/*
           * THE LINE THAT GETS THE SIGNOFF (#464).
           *
           * Both teacher personas in #454 stopped at the same missing thing.
           * Dana, on her own state's code: "if they'd just print those seven
           * characters I'd have signoff by Friday". The crosswalk was her
           * homework, and her head's approval was waiting on that homework.
           * So the citation is printed, not implied — and it is FREE, because
           * a teacher who cannot justify these sessions cannot use them.
           *
           * IT IS QUOTED, NOT SUMMARISED. `text` is the jurisdiction's own
           * published wording carried verbatim, which is what lets a wrong
           * mapping show up as a visible mismatch against the lesson instead
           * of hiding behind a paraphrase that flatters it. It is set in the
           * quoted register for the same reason a term's `forChildren` is:
           * so it reads as somebody else's sentence, not ours.
           *
           * EVERY SYSTEM AUTHORED IS SHOWN, each named. Filtering to the
           * class's own jurisdiction is the better page and it is NOT done
           * here, because jurisdiction is a field a class mostly has not set
           * yet (bioregion dimension 25, learner half, still a declared-empty
           * slot). Choosing by locale instead is precisely the mistake that
           * field exists to make impossible — Phoenix and Sacramento share a
           * locale and differ on standards. Showing both, labelled, is honest
           * today; filtering lands when jurisdiction is really populated.
           *
           * The slot is England-only and optional even there, because the US
           * has no half-term grid to claim a place in. Absent means absent.
           */}
          <dl className="primer-standards">
            {citations.map((citation) => (
              <div key={`${citation.system}-${citation.code}`}>
                <dt>
                  <span className="primer-standards-system">
                    {standardsSystemNames[citation.system]}
                  </span>{" "}
                  <span className="primer-standards-code">{citation.code}</span>
                </dt>
                {citation.texts.map((text) => (
                  <dd key={text}>&ldquo;{text}&rdquo;</dd>
                ))}
                {citation.slot && (
                  <dd className="primer-standards-slot">{citation.slot}</dd>
                )}
              </div>
            ))}
          </dl>
        </section>
      )}

      {primer?.summary && (
        <section className="primer-section">
          <h2 className="primer-head">Overview</h2>
          <p className="primer-body">{primer.summary}</p>
        </section>
      )}

      {primer?.why && (
        <section className="primer-section">
          <h2 className="primer-head">Learning benefits</h2>
          <p className="primer-body">{primer.why}</p>
        </section>
      )}

      {glossary.length > 0 && (
        <section className="primer-section">
          <h2 className="primer-head">Key words</h2>
          {/*
           * A definition list, not cards, and now the WHOLE entry (#409).
           *
           * This page used to print the definition and drop `forChildren` on
           * the floor, on the reasoning that a spoken line is script and script
           * lives in the runner. That reasoning survived until the brief lost
           * its own copy of these words: the phrasing she says to a seven-year-
           * old was then authored, paid for, and rendered nowhere she reads
           * before the lesson. It is set in the quoted register so it is
           * visibly a sentence to say rather than a second definition.
           *
           * AND THIS IS THE ONLY NEW HOME THEY GET. #409 first built the words
           * a page of their own behind a third door. Johan, looking at it:
           * *"key words can be part of the pre read.. they can be section"*.
           * He is right, and the page was the more expensive answer to a
           * question a section already answers: nobody walks to a page to read
           * three definitions, and a door that thin makes the two doors beside
           * it cheaper. It was deleted rather than left standing.
           */}
          <dl className="primer-glossary">
            {glossary.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>{entry.definition}</dd>
                {/*
                 * BOTH, not one or the other. The brief used to print
                 * `forChildren ?? definition`, which threw the meaning away
                 * for every term an author had taken the trouble to write both
                 * for. They are different jobs: one is what the word means, the
                 * other is that meaning said to a seven-year-old.
                 */}
                {entry.forChildren && (
                  <dd className="primer-glossary-spoken">
                    &ldquo;{spokenLine(entry.forChildren)}&rdquo;
                  </dd>
                )}
              </div>
            ))}
          </dl>
        </section>
      )}

      <section className="primer-section">
        <h2 className="primer-head">Lesson plan</h2>
        {/*
         * Part names and minutes only. The spoken lines belong to the runner —
         * this is the shape of the hour, so she knows what is coming, not a
         * second copy of the script.
         */}
        <ol className="primer-route">
          {journey.route.map((phase) => (
            <li key={phase.key}>
              <span>{phase.title}</span>
              {phase.durationMinutes && <span>{phase.durationMinutes} min</span>}
            </li>
          ))}
        </ol>
      </section>

      <section className="primer-section">
        <h2 className="primer-head">Safety</h2>
        <p className="primer-body">
          <Link className={styles.safetyLink} href={lessonHref("/session/safety", session.id, props.locale)}>
            <PreparationGlyph name="safety" />
            Read the safety warnings
          </Link>
        </p>
      </section>

      {/*
       * The preparation assistant lives here rather than on the doorway. A
       * doorway that must be readable in ten seconds cannot also host a helper,
       * and this is where a teacher is actually sitting down with the lesson —
       * which is the only moment "explain this to me" is a real question. It
       * hides itself when no model is configured, so it costs nothing when off.
       */}
      <LessonPreparationAssistant
        enabled={Boolean(props.assistantAvailable)}
        locale={props.locale}
        sessionId={session.id}
        tasks={["explain", "age"]}
      />

      <nav className="primer-foot" aria-label="Back to the lesson">
        <Link href={lessonHref("/session", session.id, props.locale)}>
          ← Back to the lesson
        </Link>
      </nav>
    </main>
  );
}

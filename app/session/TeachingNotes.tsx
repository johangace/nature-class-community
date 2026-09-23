import { phaseBlocks } from "@/lib/lesson/stretch";
import { phaseMinutes } from "@/lib/minutes";
import { spokenLine } from "@/lib/text";
import type { Session } from "@/schema/pack";

export function PrimerContent({ session }: { session: Session }) {
  return (
    <div className="plan-notes-body plan-primer-body">
      <section aria-labelledby="plan-before-heading">
        <h2 id="plan-before-heading">Overview</h2>
        <p className="plan-skill">The skill we grow: {session.namedSkill}.</p>
        {session.connectionToLast && (
          <p className="plan-bridge">Last time: {session.connectionToLast}</p>
        )}
        {session.primer ? (
          <>
            <p>{session.primer.summary}</p>
            {session.primer.why && (
              <>
                <h3>Learning benefits</h3>
                <p>{session.primer.why}</p>
              </>
            )}
            {session.primer.glossary && session.primer.glossary.length > 0 && (
              <>
                <h3>Key words</h3>
                <dl className="plan-glossary">
                  {session.primer.glossary.map((entry) => (
                    <div key={entry.term}>
                      <dt>{entry.term}</dt>
                      <dd>
                        <p>{entry.definition}</p>
                        {entry.forChildren && (
                          <p className="plan-spoken">
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
                  <h3>Ways to say it</h3>
                  <ul className="plan-phrasing">
                    {session.primer.childFriendlyExamples.map((line) => (
                      <li key={line}>&ldquo;{spokenLine(line)}&rdquo;</li>
                    ))}
                  </ul>
                </>
              )}
          </>
        ) : (
          <p className="plan-quiet">No primer has been authored for this lesson.</p>
        )}
      </section>
    </div>
  );
}

/**
 * The legacy plan page's "Notes by phase" panel — the same panel `/read` builds
 * at `app/read/page.tsx`, one page-mode over.
 *
 * It reads each stage through `phaseBlocks` (#466, #668) so a stage's
 * age-stretch line arrives here with the rest of its teacher notes. This panel
 * `filter`s where `app/run/WorkPhase.tsx` `find`s, which is the whole
 * difference: here the stretch is one more note among the stage's notes, so it
 * ACCOMPANIES the authored cues instead of displacing the first of them, and
 * wiring it costs nothing but the line showing up. The legacy plan exists to be
 * compared against the scroll side by side (`LegacyPlanFrame`), so a stage that
 * quietly carried fewer notes here than on `/read` would make that comparison
 * lie about the product.
 */
export function PhaseNotesContent({ session }: { session: Session }) {
  const notedPhases = session.phases
    .map((phase) => ({
      phase,
      notes: phaseBlocks(phase).filter((block) => block.type === "teacher-note"),
    }))
    .filter(
      ({ phase, notes }) => notes.length > 0 || (phase.conditionVariants?.length ?? 0) > 0
    );

  return (
    <section className="plan-phase-notes-section" aria-labelledby="plan-phase-notes-heading">
      <h2 id="plan-phase-notes-heading">Notes by phase</h2>
      {notedPhases.length > 0 ? (
        <div className="plan-phase-notes">
          {notedPhases.map(({ phase, notes }) => (
            <article key={phase.key}>
              <h3>
                {phase.title}
                {phaseMinutes(phase) && (
                  <span className="plan-note-minutes"> · {phaseMinutes(phase)}</span>
                )}
              </h3>
              {notes.map((note, index) => (
                <p key={phase.key + "-" + index}>{note.text}</p>
              ))}
              {phase.conditionVariants?.map((variant) => (
                <p className="plan-variant" key={variant.when}>
                  If {variant.when}: the plan swaps to {variant.phase.title.toLowerCase()}.
                </p>
              ))}
            </article>
          ))}
        </div>
      ) : (
        <p className="plan-quiet">
          This lesson runs from its spoken lines without separate teacher notes.
        </p>
      )}
    </section>
  );
}

/** Kept for the compatible /read surface while live Plan uses separate pages. */
export function TeachingNotes({ session }: { session: Session }) {
  return (
    <details className="plan-notes">
      <summary>
        <span>Teaching notes</span>
        <span className="plan-notes-summary">Primer, phrasing and notes by phase</span>
      </summary>
      <PrimerContent session={session} />
      <PhaseNotesContent session={session} />
    </details>
  );
}

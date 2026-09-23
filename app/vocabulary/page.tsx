import Link from "next/link";
import { distinct, matchVocabulary, splitList } from "@/lib/vocab/match";
import { loadVocabIndex } from "@/lib/vocab/term-index";

/**
 * Her words, our sessions (/vocabulary), #563.
 *
 * A teacher already holds the list this page needs: the Key vocabulary column
 * of the unit she is planning, sitting in her own planning file. She pastes
 * it, and gets back the sessions that actually carry those words — with the
 * overlap shown term by term, never a bare score.
 *
 * The matcher landed in PR #667 and nothing rendered it. This is the thin
 * surface its own scoping note asked for, and it adds no matching logic of
 * its own: `splitList` splits, `matchVocabulary` decides, this file only
 * prints what came back.
 *
 * THREE THINGS THIS PAGE IS NOT ALLOWED TO DO, inherited from the matcher:
 *
 * 1. It never rewrites her word. Every place one of her words appears, it is
 *    `TermResult.input` — her string, her case, her hyphen. Her vocabulary
 *    list is her document; "improve the teacher's words" is explicitly not
 *    what this is.
 * 2. A miss stays a miss. A word we do not carry is printed as a miss with
 *    nothing under it. An empty answer is the honest one and is never padded
 *    with a near match to look useful.
 * 3. A near match is printed as near, with the matcher's own reason, and is
 *    never counted in a session's overlap.
 *
 * And it always prints the coverage it was measured against: sessions with no
 * authored glossary are invisible to every word she types, so a result read
 * without that gap overstates itself.
 *
 * GET rather than a server action, deliberately: her list stays in the URL, so
 * a result is a link she can keep in her planning file or send to a colleague,
 * and the page works with no client JavaScript. Noindex, like the other app
 * surfaces — it answers a question about her unit, it is not a landing page.
 */

export const metadata = {
  title: "Match your key vocabulary — Nature Class",
  robots: { index: false, follow: false },
};

/** Long enough for a whole unit's vocabulary column, short enough not to be a paste bomb. */
const MAX_INPUT = 4000;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default async function VocabularyPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = first(params?.words).slice(0, MAX_INPUT);
  const entries = splitList(raw);
  const index = loadVocabIndex();
  const report = entries.length > 0 ? matchVocabulary(entries, index) : null;
  const coverage = report?.coverage ?? index.coverage;

  return (
    <main className="classes">
      <h1>Your words, our sessions</h1>

      <p className="classes-intro">
        Paste the key vocabulary for the unit you are planning. You get back
        the sessions that actually teach those words, and exactly which of your
        words each one covers. Your list is matched, never rewritten, and never
        saved to your account. It does travel in the web address, so it shows up
        in your browser history and in ordinary server logs like any other page
        you open.
      </p>

      {/*
        Label and field are siblings, not nested: `.signin-label` carries
        typography only, so a label wrapping a textarea lays the two out on one
        line. `.class-new` is already a column, which is the stack this wants.
      */}
      <form method="get" className="class-new">
        <label className="signin-label" htmlFor="words">
          Your key vocabulary
        </label>
        <textarea
          id="words"
          className="signin-input"
          name="words"
          rows={8}
          maxLength={MAX_INPUT}
          defaultValue={raw}
          placeholder={"micro-habitat\ndetritivore\nroot hairs\nimpermeable"}
        />
        <p className="class-meta">
          One word or phrase per line. Commas, semicolons and tabs separate too,
          so a column pasted straight out of your planning file works as it is.
          A space never separates: “leaf litter” is one term.
        </p>
        <button className="signin-submit" type="submit">
          Match my words
        </button>
      </form>

      {report && (
        <section aria-live="polite">
          <h2>
            {report.counts.hit} of {report.counts.asked}{" "}
            {report.counts.asked === 1 ? "word" : "words"} matched
          </h2>

          {report.sessions.length === 0 ? (
            <p className="class-meta">
              No session carries any of these words. That is the honest answer
              rather than a near miss dressed up as a match — the closest
              spellings we hold, if there are any, are listed under your words
              below.
            </p>
          ) : (
            <>
              <h3>Sessions that cover your words</h3>
              <ul>
                {report.sessions.map(({ session, words }) => (
                  <li key={session.sessionId}>
                    {/*
                      A link, not bare text: an off-shelf pack's only way in is
                      this page, so a title she cannot open is a dead end (Codex
                      review of #1209). `findSession` is catalogue-wide, so the
                      link resolves whether or not the session is on the shelf.
                    */}
                    <Link href={`/session?session=${encodeURIComponent(session.sessionId)}`}>
                      <strong>{session.sessionTitle}</strong>
                    </Link>{" "}
                    — {session.packTitle}
                    {/*
                      "off the shelf", never "not on the shelf YET": `onShelf`
                      is one boolean and cannot tell a session waiting for its
                      season from a pack retired for good (winter-term is off
                      the shelf permanently). "Yet" would promise a teacher a
                      lesson that is never coming. Same word the CLI uses.
                    */}
                    {session.onShelf ? "" : " (off the shelf)"}
                    <br />
                    covers {distinct(words)} of your words:{" "}
                    {words.map((word, at) => (
                      <span key={`${word.input}-${word.term}`}>
                        {at > 0 && ", "}
                        <strong>{word.input}</strong>
                        {word.kind === "inflection" && (
                          <> (our “{word.term}”)</>
                        )}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </>
          )}

          <h3>Your words, one by one</h3>
          <ul>
            {report.terms.map((term, at) => (
              <li key={`${term.input}-${at}`}>
                <strong>{term.input}</strong>
                {term.status === "hit" && (
                  <>
                    {" — taught in "}
                    {term.hits
                      .flatMap((hit) => hit.sessions.map((s) => s.sessionTitle))
                      .join(", ")}
                  </>
                )}
                {term.status === "near" && (
                  <ul>
                    {term.near.map((near) => (
                      <li key={near.term}>
                        not a match: {near.because}
                      </li>
                    ))}
                  </ul>
                )}
                {term.status === "miss" && <> — no session teaches this word</>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="class-meta">
        Measured against {coverage.sessionsWithTerms} of {coverage.sessions}{" "}
        sessions: the other {coverage.sessionsWithoutTerms} carry no authored
        glossary yet and cannot match any word, whatever you type.{" "}
        {coverage.distinctTerms} distinct words are searchable today.
      </p>

      <p className="classes-foot">
        <Link href="/">Back to Nature Class →</Link>
      </p>
    </main>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { findSession, leadPack } from "@/lib/pack";
import { CastBoard } from "./CastBoard";

/**
 * /cast — the speak-and-show surface, reached from the run's doorstep and from
 * the get-ready page.
 *
 * It remains its own route so a teacher can open the lesson's field-guide list
 * while preparing, without starting or moving the live lesson clock.
 *
 * `?session=` picks the lesson off the shelf, the same contract /run, /read
 * and /print honour. The cast is STRICTLY topic-filtered (nc#233): this is
 * the surface a teacher holds up in front of the class and says "here is who
 * we're looking for", so it must never show a species the lesson is not
 * about. See `lib/cast/resolve.ts`'s `ResolveCastQuery.topicFilter`.
 *
 * THIS FILE IS THE PART THAT NEEDS NO READ (nc#845). The shelf lookup is a
 * file read, so the heading and the way back are HTML immediately; the board
 * arrives under the boundary below when its reads come back.
 *
 * WHAT THAT IS WORTH, AND WHAT IT IS NOT. It was never a blank screen.
 * `app/loading.tsx` renders `DandelionTransition message="Opening Nature
 * Class."` and a root `loading.tsx` covers every segment below it, so a hard
 * load of `/cast` already got a hold — the ticket's own premise was checked
 * and retracted on the issue in September. What changes is WHAT a teacher is
 * held by while `activePlaceContext` and two sequential Pointmoon reads run
 * (each allowed 10s against a measured ~8.3s cold response): the product mark
 * and no way out, or the page she asked for with a working way back to the
 * session she was in the middle of. The duration is unchanged. What she can
 * do during it is not. Same shape as /today's day and door holds (#355,
 * #634), for the same reason.
 */
export const dynamic = "force-dynamic";

/**
 * What the boundary paints while the board reads.
 *
 * It says that something is loading and it never says a value: no placeholder
 * names, no portrait-shaped fills that resolve into different portraits. A
 * cast that resolves to nothing at all collapses it the same way a full one
 * does, because this IS the fallback rather than a state anyone has to clear.
 *
 * WHAT IT OUTLIVES WITHOUT JAVASCRIPT, measured rather than reasoned about
 * (nc#1273). Once the shell has flushed, React does not send the resolved
 * boundary in place: it sends it in a `<div hidden>` followed by the `$RC`
 * script that moves it. That is how streaming SSR works, and it means the
 * swap is JavaScript's to make. So for a reader without it this shimmer is
 * not a hold at all — it is the page, for the whole visit, and that is true
 * of a board that resolved perfectly as much as one that threw.
 * `tests/unit/cast-board-failure.spec.tsx` pins both halves against the real
 * `renderToReadableStream`.
 *
 * Hence the `<noscript>` below. It cannot make the cast appear — nothing
 * server-side can, once the shell is on the wire — so it says so plainly and
 * leaves her the way back the shell already rendered above it, rather than an
 * `aria-busy` that never clears. The throw case is separately handled where
 * the reads are, in `CastBoard`, so that a reader WITH JavaScript gets an
 * honest sentence instead of a client error page.
 */
function CastHold() {
  return (
    <>
      <div className="cast-hold" role="status" aria-busy="true" aria-live="polite">
        <span className="sr-only">Finding today&rsquo;s cast.</span>
      </div>
      <noscript>
        <p className="cast-noscript">
          Today&rsquo;s cast needs JavaScript to appear on this page. The link
          above goes back to the session.
        </p>
      </noscript>
    </>
  );
}

export default async function CastPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; locale?: string }>;
}) {
  const { session: wanted, locale: localeParam } = await searchParams;

  const home = leadPack();
  const found = wanted ? findSession(wanted) : { pack: home, session: home.sessions[0] };
  if (!found?.session) notFound();

  // The session this links back to is the one off the shelf, before the place
  // seam and localization run inside the board. Both preserve `id` — the seam
  // spreads the session and rewrites only `spaceNeeded` and `phases`, and
  // `localizeDeep` holds `id` out of its walk — so the link is the same one
  // this page has always rendered, minus the wait. `tests/unit/cast-shell.spec.tsx`
  // asserts both, so if either ever stops being true this link cannot quietly
  // start pointing somewhere else.
  const session = found.session;

  return (
    <main className="cast-page">
      {/* The list below already announces "{session title}, N to look for" on
          its own aria-label (SpeakAndShow's `section`), and the session title
          is also visible in its own list heading. A visible h1 here would repeat
          one of those verbatim or crowd a screen she is holding up for a
          class. This is the honest middle: a heading that names what the page
          IS ("speak and show", not the runner, not the profile) without
          echoing either the region's label or the lesson's name (nc#619). */}
      <h1 className="sr-only">Speak and show</h1>
      <div className="cast-topbar">
        <Link href={`/run?session=${session.id}`} className="cast-back">
          <span aria-hidden="true">&larr;&ensp;</span>Back to the session
        </Link>
      </div>

      <Suspense fallback={<CastHold />}>
        <CastBoard session={session} localeParam={localeParam} />
      </Suspense>
    </main>
  );
}

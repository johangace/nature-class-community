import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { requestLocale } from "@/lib/request-locale";
import { activePlaceContext, sessionForPlace } from "@/lib/place-context";
import { readSurfaceCast } from "@/lib/cast/surface";
import { readAloudLine } from "@/lib/cast/speak";
import { localizeDeep } from "@/lib/localization";
import { getActiveClassLocation } from "@/lib/teacher";
import { primaryTopicOf } from "@/lib/lesson/door";
import type { Session } from "@/schema/pack";
import { SpeakAndShow } from "./SpeakAndShow";

/**
 * The board itself: everything on /cast that has to wait for a read.
 *
 * It lives apart from `page.tsx` so the route's shell — the heading and the
 * way back to the session — is HTML before any of this starts (nc#845). The
 * reads it makes are unchanged in number, order and scope; what moved is when
 * the teacher first sees the page, not what the page says.
 *
 * WHAT IS ACTUALLY BEING WAITED ON, measured on the issue: `activePlaceContext`
 * reads this week's alive habitats through `fetchFieldTruth`, and
 * `readSurfaceCast` makes two more sequential Pointmoon round trips — one
 * taxon-scoped, one not. `lib/outside/pointmoon.ts` allows each 10s before it
 * aborts, against a measured ~8.3s cold response. Twelve samples of one read
 * ran 1102ms min, 1447ms median, 2976ms max, and this makes three.
 *
 * WHAT A FAILED READ LOOKS LIKE (nc#1273). It looks like a sentence, not like
 * a shimmer that never clears. Since the shell streams, a throw from here no
 * longer reaches a server-rendered error page: the response is already a 200
 * carrying the hold, and `app/error.tsx` picks it up on the client. So the
 * reads are caught here and answered with `CastTrouble`. The path is real
 * rather than defensive — `getActiveClass` (lib/teacher.ts:187) has no
 * try/catch around its Prisma calls, so a database blip for a signed-in
 * teacher throws, while `activePlaceContext` and `readSurfaceCast` both
 * swallow into an honest empty. What this cannot reach is a reader without
 * JavaScript, because the swap that replaces the hold is a script; that half
 * is answered by the `<noscript>` in the boundary's own fallback.
 *
 * Not a blank screen, and the ticket says so: `app/loading.tsx` covered the
 * route all along, so what a teacher held was a full-page "Opening Nature
 * Class." for that whole stretch. The wait is the same length now. It is
 * spent on the page she asked for, with the way back to her session live.
 *
 * DELIBERATELY NOT FIXED HERE. The two round trips stay two, sequential, and
 * scoped exactly as they are. Collapsing them is the other half of nc#845 and
 * it is a product call, not a refactor: a taxon-scoped second read returns
 * fewer sightings and `withLivePhotos` overlays those sightings, so some cast
 * members would lose their live photograph. Making the pair concurrent was
 * proposed, reviewed and killed — johangace/pointmoon#272 established that the
 * scoped and unscoped reads never share a cache entry (so the first cannot
 * warm the second) and that two simultaneous fan-outs at one cell feed a
 * single four-failure breaker with a sixty-second blackout. Johan's note of
 * 2026-09-13 records that the producer-side profile is unamortised and is not
 * evidence to parallelise either.
 */
export async function CastBoard({
  session: found,
  localeParam,
}: {
  session: Session;
  localeParam?: string;
}) {
  let read: Awaited<ReturnType<typeof readBoard>>;
  try {
    read = await readBoard(found, localeParam);
  } catch (error) {
    // Next's own control flow arrives here as a throw — `notFound()`,
    // `redirect()`, a dynamic bailout — and swallowing any of it would turn a
    // 404 into a page that says the cast is missing. `unstable_rethrow` knows
    // that set and re-throws it; everything it returns from is a real read
    // failure and is ours to answer.
    unstable_rethrow(error);
    // And answering it is not the same as hiding it. Before this catch, a
    // throw here reached Next's own server-side error reporting; a recovery
    // that returns a 200 takes it back out, and a database outage that shows
    // up only as user reports is worse than the hold this replaces. Same
    // `[tag] sentence, error` shape the rest of the server code logs in.
    console.error("[cast] the board's reads failed; serving the recovery section", error);
    return <CastTrouble sessionId={found.id} />;
  }

  const { session, members, lines, primaryTopic } = read;

  return members.length > 0 ? (
    <SpeakAndShow
      members={members}
      lines={lines}
      sessionTitle={session.title}
      profileTopic={primaryTopic}
    />
  ) : (
    /* No cast is an ordinary morning, not a failure. One sentence, and a
       way back. Never a placeholder gallery. */
    <section className="cast-empty">
      <p>
        We have nothing to show you for today. Go and look anyway, and tell each
        other what you find.
      </p>
      <Link href={`/run?session=${session.id}`} className="btn-start">
        Back to the session
      </Link>
    </section>
  );
}

/**
 * Everything on /cast that has to wait for a read, in one place so the catch
 * above covers all of it and nothing else.
 *
 * It returns values rather than JSX on purpose. A child element is rendered by
 * React after `CastBoard` has returned, so a throw inside `SpeakAndShow` would
 * be outside any `try` here whatever this function returned — the boundary is
 * the reads, and saying so in the shape of the code keeps the next reader from
 * assuming a catch reaches further than it does.
 */
async function readBoard(found: Session, localeParam: string | undefined) {
  const locale = await requestLocale(localeParam, await getActiveClassLocation());
  // Habitat before localization, as on /read and in lesson-data.ts: the seam
  // picks the instruction for this school's pack key, localization puts the
  // surviving sentence into the reader's English (#207, #265).
  const session = localizeDeep(sessionForPlace(found, await activePlaceContext()), locale);
  const primaryTopic = primaryTopicOf(session);

  // NO COUNT HERE, ON PURPOSE (#1030). This read used to ask for four and then
  // slice to four, and Johan called it what it was: a limit standing in where
  // relevance belongs. Some days the lesson and the place hold two creatures
  // and some days nine, and the honest board is the one that says so. The only
  // ceiling left is `CAST_LAYOUT_MAX` in `lib/cast/resolve.ts`, which is about
  // what a screen held up in front of a class can hold and nothing else.
  //
  // The cast is already STRICTLY topic-filtered, so a longer board is a longer
  // list of creatures this lesson is actually about, never a wider net.
  const { cast, located } = await readSurfaceCast({
    topicTags: session.topicTags,
    primaryTopic,
    topicFilter: true,
  });
  const members = cast.members;

  // Absences deliberately do NOT ride this surface. A not-seen-yet card is
  // honest on the profile, where a teacher reads it alone; held up in front of
  // a class it becomes "here is one we will not find", which is a strange
  // thing to open a hunt with.

  const lines = members.map((member) =>
    readAloudLine(member, {
      locality: located ? "recorded-nearby" : "sample",
    })
  );

  return { session, members, lines, primaryTopic };
}

/**
 * A read that failed, said plainly (nc#1273).
 *
 * NOT the empty-cast sentence. "We have nothing to show you for today" is true
 * about a quiet day and false about a database blip, and a teacher who is told
 * the first when the second happened will stop looking for the lesson she can
 * still reach by reloading.
 *
 * The link is built from the session off the shelf rather than from the
 * localized one, because the localized one is what the failed read was going
 * to produce. Both carry the same `id` — `sessionForPlace` and `localizeDeep`
 * are both id-preserving, which `tests/unit/cast-shell.spec.tsx` holds — so
 * this is the same destination the shell's own back link already points at.
 *
 * `role="alert"` because of WHERE this arrives. It does not render with the
 * page: it replaces the fallback, whose `role="status" aria-live="polite"` is
 * removed along with it, and focus is wherever the reader left it. Without a
 * role of its own the swap is silent, so someone using a screen reader hears
 * "Finding today's cast" and then nothing, for good. `alert` rather than
 * `status` because this one is a failure she can act on by reloading, and it
 * is the sibling of a hold that already claimed politely to be working on it.
 */
function CastTrouble({ sessionId }: { sessionId: string }) {
  return (
    <section className="cast-trouble" role="alert">
      <p>
        We could not read today&rsquo;s cast. Try this page again in a moment,
        or go back and carry on with the session.
      </p>
      <Link href={`/run?session=${sessionId}`} className="btn-start">
        Back to the session
      </Link>
    </section>
  );
}

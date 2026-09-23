import { requestLocaleChoice } from "@/lib/request-locale";
import { localizeDeep } from "@/lib/localization";
import { leadPack, seasonBrowse } from "@/lib/pack";
import { activePlaceContext, shelfForPlace } from "@/lib/place-context";
import { completedSessionIds, getActiveClass, getTeacher } from "@/lib/teacher";
import { AppNav } from "../AppNav";
import { PublicHeader } from "../audiences/PublicHeader";
import Link from "next/link";
import { getTryPlace } from "@/lib/try-place-server";
import { examplePlaceAt } from "@/lib/example-places";
import { SeasonShelf } from "./SeasonShelf";
import { shelfSessionView } from "./shelf-view";

/**
 * Season (/season) — the year's sessions, on their own page.
 *
 * The shelf used to be crammed under Today; it belongs here, a page a teacher
 * comes to on purpose to browse. It shows the four seasons in calendar order
 * from the one the class is standing in: the open season's sessions ready to
 * lead, and the other three by title with the month each unlocks (Johan,
 * 2026-09-06). Premium lessons stay discoverable without entering Community
 * progression. Led sessions carry a mark, and the next one up is called out,
 * so a teacher sees where the class is at a glance.
 */
export const dynamic = "force-dynamic";

export default async function SeasonPage({ searchParams }: { searchParams?: Promise<{ locale?: string }> }) {
  const { locale, automatic } = await requestLocaleChoice((await searchParams)?.locale);
  const teacher = await getTeacher();
  const active = teacher ? await getActiveClass(teacher.id) : null;
  const led = active ? await completedSessionIds(active.id) : new Set<string>();
  // Signed out, the spot she chose on /start, if she chose one (#877). It
  // decides the shelf's region below through `activePlaceContext`; here it
  // only decides what the page says about itself.
  const chosen = teacher ? null : await getTryPlace();
  // One of the named example places, when that is what she picked (#877).
  const example = examplePlaceAt(chosen);

  // The shelf, narrowed to what is TRUE where this class is, with each
  // session's habitat instructions resolved for the same place (#206, #207).
  //
  // A no-op today, and honestly so: no bioregion pack file exists yet (the
  // data waves are #209-#215), and an empty season ontology excludes nothing
  // by design — an unfilled slot is not evidence of absence. What is real is
  // the wiring, so the day a Miami pack lands, Miami stops being offered the
  // autumn leaf lesson without another line of code here.
  const place = await activePlaceContext();
  // The shelf opens the season this class is standing in, and asks the place
  // first: a pack that declared its own seasons overrules the calendar,
  // because a monsoon pack has no autumn to open (#274).
  const lat = active?.lat ?? chosen?.lat ?? null;
  const seasons = seasonBrowse({
    lat,
    declaredSeasons: place.pack.seasonOntology.seasons,
  });
  const placed = new Map(
    shelfForPlace(
      seasons.map((s) => s.pack),
      place
    ).map((pack) => [pack.id, pack])
  );
  const entries = seasons.flatMap((s) => {
    const pack = placed.get(s.pack.id);
    // A title-only season (planned titles, no sessions yet: winter, spring
    // and summer since 2026-09-07) has nothing for the place to narrow, and
    // `shelfForPlace` drops a pack with no sessions. Keep the drawer; it is
    // the shelf saying what is coming, which is true everywhere.
    if (!pack && s.pack.sessions.length === 0 && s.planned.length > 0) {
      return [localizeDeep(s, locale)];
    }
    return pack ? [localizeDeep({ ...s, pack }, locale)] : [];
  });
  // The next session up = the first in the open season the class hasn't led.
  const open = entries.find((s) => s.open && s.tier === "community");
  const nextUp = open?.pack.sessions.find((s) => !led.has(s.id))?.id ?? null;
  // Signed out, the one session that opens is the season's lead session: the
  // same one `/run` opens with no parameter, so "See today's session" and the
  // shelf agree on what today's session is (#877, #115).
  const openOnly = teacher
    ? null
    : (leadPack({ lat: chosen?.lat ?? null }).sessions[0]?.id ?? nextUp);

  return (
    <>
      {!teacher && <PublicHeader locale={locale} automatic={automatic} page="season" />}
    <main className="season">
      {teacher && <AppNav />}
      <header className="season-head">
        <h1>The season</h1>
        {teacher ? (
          <p className="season-intro">
            This season&apos;s sessions are ready to lead. The other seasons are
            listed with the month each one unlocks.
          </p>
        ) : (
          // The signed-out shelf says what is open and why (#877): the first
          // session runs in full for the place she chose, or for the sample
          // school if she skipped the question. The rest wait behind sign-in.
          <p className="season-intro">
            {example
              ? // A named example she picked off the list (#877): say where it
                // is reading and, in the same breath, that it is not hers. The
                // examples are patches, not schools — there is no school at
                // these coordinates and claiming one would be an invented fact.
                `This season, read live for ${example.name} — an example patch, not your own. `
              : chosen
                ? chosen.label
                  ? `This season, read for ${chosen.label}. `
                  : "This season, read for the place you chose. "
                : "This season, read for a sample school. "}
            The first session is open to run in full. Sign in to lead the rest
            with your own class.
          </p>
        )}
      </header>

      <SeasonShelf
        locale={locale}
        entries={entries.map((s) => ({
          pack: {
            id: s.pack.id,
            title: s.pack.title,
            collection: s.pack.collection,
            sessions: s.pack.sessions.map(shelfSessionView),
          },
          tier: s.tier,
          open: s.open,
          opensIn: s.opensIn,
          planned: s.planned,
        }))}
        ledIds={[...led]}
        homeHref={teacher ? "/today" : "/"}
        nextUp={nextUp}
        openOnly={openOnly}
      />
      {!teacher && (
        // The account door, after she has seen it work rather than in front of
        // it (#877). One link, in plain words.
        <p className="season-door">
          <Link className="start-pill wide" href="/sign-in">
            Make it your school. Sign in
          </Link>
        </p>
      )}
    </main>
    </>
  );
}

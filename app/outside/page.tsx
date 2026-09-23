import styles from "./conditions.module.css";
import { Wordmark } from "../Wordmark";
import { PreparationGlyph } from "../session/PreparationGlyph";
import { lessonHref } from "../session/lesson-links";
import { tideStations } from "@/lib/outside/tide-stations";
import { CoastalTides } from "./CoastalTides";
import { noaaReferenceEnabled } from "@/lib/outside/coastal-tides";
import { requestLocale } from "@/lib/request-locale";
import Link from "next/link";
import { SeasonalObservations } from "./SeasonalObservations";
import { AppNav } from "../AppNav";
import { CastFace } from "../CastFace";
import { displayPhotoAsset } from "@/lib/cast/member";
import { getOutsideBrief } from "@/lib/outside/brief";
import { findSession, leadPack } from "@/lib/pack";
import { getActiveClassLocation, getTeacher } from "@/lib/teacher";
import { localizeText } from "@/lib/localization";
import { seenCaption, usuallyAroundCaptionFor } from "@/lib/outside/captions";
import { examplePlaceAt } from "@/lib/example-places";
import { getTryPlace } from "@/lib/try-place-server";
import {
  outOfReachLine,
  resolveSessionDay,
  sessionDayOptions,
  type SessionDay,
} from "@/lib/outside/session-day";

/**
 * The complete read behind Today's small outside window.
 *
 * ── IT IS NO LONGER ONLY ABOUT TODAY (#755) ────────────────────────────────
 *
 * The first real teacher to hold this app (2026-08-31): the
 * weather she can get from any screen; what would help is the card pointed at
 * the day she actually runs the class. She pre-walks the ground the day before.
 *
 * So this page takes `?for=YYYY-MM-DD` and serves that day. The chooser at the
 * top is the whole interaction, and it is links rather than a control: the
 * page is a server read, every day is its own address, and a teacher planning
 * Thursday can send the address to a colleague.
 *
 * ── WHAT CHANGES WHEN THE DAY IS NOT TODAY, AND WHY IT IS SUBTRACTION ──────
 *
 * There is no forecast anywhere in the Pointmoon contract. The sky, the felt
 * temperature, the ground, the light left, sunrise, sunset and the moon are
 * all read for the hour they are asked for, so under Thursday's heading they
 * are ABSENT and one sentence says so. Nothing is greyed out, nothing is
 * relabelled, and specifically this morning's numbers are not shown under
 * another day's name — a teacher would have no way to see that seam.
 *
 * What is left is what actually holds for that day: the species this region
 * shows in that week (phenology, resolved on the chosen date rather than on
 * today), what has been photographed near the school lately, and any sky event
 * that has not already happened by then. That is a shorter page and a more
 * useful one, which is the answer to her "did not find much usefulness here".
 *
 * The partition lives in `lib/outside/session-day.ts`, not here, so a second
 * surface cannot invent its own version of which readings survive a date.
 */
export const dynamic = "force-dynamic";

export default async function OutsidePage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string; session?: string; for?: string; tideStation?: string }>;
}) {
  const resolvedSearchParams: Promise<{
    locale?: string;
    session?: string;
    for?: string;
    tideStation?: string;
  }> = searchParams ?? Promise.resolve({});
  const [teacher, params, classLocation] = await Promise.all([
    getTeacher(),
    resolvedSearchParams,
    getActiveClassLocation(),
  ]);
  const locale = await requestLocale(params.locale, classLocation);
  const homeHref = teacher ? "/today" : "/";
  const homeLabel = teacher ? "Back to today" : "Back to Nature Class";
  const requested = params.session ? findSession(params.session) : null;
  const session = requested?.session ?? leadPack().sessions[0];

  // Resolved ONCE and handed to the brief, because the chooser and the read
  // must agree about which day this is. Two resolutions is how they drift.
  const day = resolveSessionDay({ requested: params.for, locale });
  const days = sessionDayOptions({ locale });
  const ahead = day.offsetDays > 0;
  const tideStation = noaaReferenceEnabled() && tideStations.some(s => s.id === params.tideStation) ? tideStations.find(s => s.id === params.tideStation)!.id : undefined;
  const showTideChoice = noaaReferenceEnabled() && (session?.topicTags?.includes("water") || tideStation);

  const brief = await getOutsideBrief({
    topicTags: session?.topicTags ?? [],
    locale,
    session,
    sessionDay: day,
    ...(tideStation ? { tideStation } : {}),
  });
  // A named example place reads live like any chosen spot; the label below
  // says which one it is, so the page never passes it off as hers (#877).
  const example = brief.scope === "chosen" ? examplePlaceAt(await getTryPlace()) : null;
  const picturedSpecies = new Map(
    brief.lookForMembers.map((member) => [
      member.commonName.trim().toLowerCase(),
      member,
    ])
  );
  for (const member of [...brief.around, ...brief.seen]) {
    if (displayPhotoAsset(member)) {
      picturedSpecies.set(member.commonName.trim().toLowerCase(), member);
    }
  }

  // Split by WHICH CLAIM is empty rather than by one flat "nothing". Under a
  // chosen day the hour is expected to be empty and says so on its own, so
  // folding the two together would print "we could not see outside" about a
  // day nobody could have seen.
  const seasonEmpty =
    brief.seen.length === 0 &&
    brief.around.length === 0 &&
    brief.lookFors.length === 0 &&
    // Counted with the season, not the hour (#1292): it is the state of the
    // region's week. Left out, the page could print "there is nothing more to
    // report" directly above the one seasonal sentence it did have.
    brief.seasonalNote === null;
  const hourEmpty =
    brief.condition === null && brief.read === null && brief.facts.length === 0;
  const hasDay =
    brief.read !== null || brief.facts.length > 0 || brief.upcoming !== null;

  const dayHref = (option: SessionDay) => {
    const query = new URLSearchParams();
    if (params.session) query.set("session", params.session);
    if (tideStation) query.set("tideStation", tideStation);
    if (params.locale) query.set("locale", params.locale);
    if (option.offsetDays > 0) query.set("for", option.iso);
    const suffix = query.toString();
    return suffix ? `/outside?${suffix}` : "/outside";
  };

  const tideChoice = new URLSearchParams();
  if (params.session) tideChoice.set("session", params.session);
  if (params.locale) tideChoice.set("locale", params.locale);
  if (day.offsetDays > 0) tideChoice.set("for", day.iso);
  const noTideHref = `/outside?${tideChoice}`;


  return (
    <main className={`brief ${styles.page}`}>
      {teacher && <AppNav />}
      <div className={styles.topbar}>
        <Link href={homeHref} aria-label="Nature Class"><Wordmark /></Link>
        <Link href={session ? lessonHref("/session", session.id, params.locale) : homeHref}>
          ← {session ? "Back to lesson" : homeLabel}
        </Link>
      </div>
      <header className={styles.header}>
        <span className={styles.icon}><PreparationGlyph name="conditions" size={28} /></span>
        <div>
          <h1>Conditions</h1>
          <p>{brief.place?.name ?? "Local conditions"} · {day.label}</p>
        </div>
      </header>

      {/* THE DAY CHOOSER (#755). Links, not a control: each day is its own
          address, so a teacher planning Thursday can bookmark it or send it,
          and the page stays a plain server read with no client bundle. The
          current day carries `aria-current` rather than only a tint, because
          the tint is the one thing a screen reader cannot see. */}
      <nav className="brief-days" aria-label="Which day this read is for">
        <ul>
          {days.map((option) => (
            <li key={option.iso}>
              <Link
                className={
                  option.iso === day.iso
                    ? "brief-day-chip brief-day-chip-on"
                    : "brief-day-chip"
                }
                aria-current={option.iso === day.iso ? "page" : undefined}
                href={dayHref(option)}
              >
                {option.chipLabel}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* A refused request is stated, never silently swapped for today. */}
      {outOfReachLine(day) && (
        <p className="brief-refused">{outOfReachLine(day)}</p>
      )}

      {/* THE PLAIN LABEL (#463). Every reading below — the sky, the light
          left, the moon, the ground, the species — is about ONE point, and
          eight personas in #454 read this page with no way to tell which
          one: an Ohio teacher printed cards for a Canonbury swift, a
          Manchester parent was told the swifts near her were leaving a
          borough she had never stood in. So the page says where it is
          reading before it says anything about what is there. Silent when
          the geocoder named nothing at all — an unnamed point is a real
          state, never guessed at. */}
      {(example || brief.place?.name) && (
        <p className="brief-place">
          {example
            ? // One of the named example places off /start (#877). Both names
              // are true and neither is dropped: the geocoder names the point
              // it read, the list names the place she picked it by, and the
              // sentence says it is not hers. "Patch" and not "school",
              // because there is no school at these coordinates to speak for.
              brief.place?.name
              ? `Every reading on this page is for ${brief.place.name}, in ${example.name} — an example patch rather than your own. Sign in and every reading is for your own school.`
              : `Every reading on this page is for ${example.name}, an example patch rather than your own. Sign in and every reading is for your own school.`
            : brief.scope === "sample"
              ? `Every reading on this page is for ${brief.place?.name}, our sample patch. It is not your own location.`
              : brief.scope === "chosen"
                ? `Every reading on this page is for ${brief.place?.name}, the place you chose. Sign in to keep it as your school.`
                : `Every reading on this page is for ${brief.place?.name}.`}
        </p>
      )}

      {/* THE HONEST ABSENCE, AND IT IS THE POINT OF THE TICKET (#755). Under a
          chosen day this block replaces the sky and the numbers rather than
          dressing them in a warning. It names what is missing, why, and what
          on the page is still true. */}
      {ahead && brief.noForecast && (
        <section className="brief-block brief-day brief-noforecast">
          <h2 className="brief-heading">Weather forecast</h2>
          {/* THE FORECAST, LABELLED (pointmoon#125). It sits ABOVE the line
              that qualifies it, because a teacher scanning this page reads the
              readings and the qualifier is what she checks second — and
              because the line itself now names these ("the sky and the
              temperature above are a forecast"), which only works if they are
              above it.

              EVERY PART IS OPTIONAL AND EACH DIES ALONE, the same rule the
              rest of this page runs on. A day with a sky and no rain figure
              shows a sky. */}
          {brief.forecast && (
            <p className="brief-forecast">
              {[
                brief.forecast.sky,
                brief.forecast.temperature,
                brief.forecast.rain,
                brief.forecast.wind,
              ]
                .filter((part): part is string => Boolean(part))
                .join(" · ")}
            </p>
          )}
          <p className="brief-noforecast-line">{brief.noForecast}</p>
          {brief.holdsForDay && (
            <p className="brief-holds-line">{brief.holdsForDay}</p>
          )}
          {brief.upcoming && (
            <p className="brief-upcoming">
              <strong>{brief.upcoming.label}</strong> {brief.upcoming.when}
              {brief.upcoming.note ? `. ${brief.upcoming.note}` : "."}
            </p>
          )}
        </section>
      )}

      {!ahead && hourEmpty && seasonEmpty && (
        <p className="daily-quiet-line">
          We could not see outside today, so there is nothing new to report.
          Your plan is unchanged.
        </p>
      )}

      {ahead && seasonEmpty && (
        <p className="daily-quiet-line">
          We hold no seasonal record for that week here either, so there is
          nothing more to report. Your plan is unchanged.
        </p>
      )}

      {!ahead && hasDay && (
        <section className="brief-block brief-day">
          <h2 className="brief-heading">Weather and daylight</h2>
          {brief.read && (
            <p className="brief-day-read">{localizeText(brief.read, locale)}</p>
          )}
          {brief.facts.length > 0 && (
            <dl className="brief-facts">
              {brief.facts.map((fact) => (
                <div className="brief-fact" key={fact.label}>
                  <dt>{fact.label.charAt(0).toUpperCase() + fact.label.slice(1)}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {brief.upcoming && (
            <p className="brief-upcoming">
              <strong>{brief.upcoming.label}</strong> {brief.upcoming.when}
              {brief.upcoming.note ? `. ${brief.upcoming.note}` : "."}
            </p>
          )}
        </section>
      )}

      {brief.context && (
        <section className="brief-block brief-context">
          <h2 className="brief-context-heading">
            {brief.context.source === "lesson.conditionNotes"
              ? `Lesson notes: ${localizeText(brief.context.lessonTitle, locale)}`
              : "Outdoor notes"}
          </h2>
          <p>{localizeText(brief.context.line, locale)}</p>
        </section>
      )}

      {(brief.lookFors.length > 0 || brief.seasonalNote) && (
        <section className="brief-block">
          {/* "that week" and not "on Thursday": phenology has weekly
              resolution, and the heading above already names the day. */}
          <h2 className="brief-heading">
            {ahead ? "Seasonal highlights that week" : "Seasonal highlights"}
          </h2>
          {/* THE CAPTION OVER THE LIST, not a row in it (#1292). The same
              regional calendar the species below come from, said as a state:
              whether they are emerging, at their peak or going over is what
              decides whether this week is the week to walk out and look. It
              reads as a sentence because it is one, which is why it is not a
              `brief-facts` row beside sunrise and the moon. */}
          {brief.seasonalNote && (
            <p className="brief-seasonal-note">
              {localizeText(brief.seasonalNote, locale)}
            </p>
          )}
          {brief.lookFors.length > 0 && (
          <ul className="brief-lookfors">
            {brief.lookFors.slice(0, 8).map((lookFor) => {
              const member = picturedSpecies.get(
                lookFor.species.trim().toLowerCase()
              );
              return (
                <li
                  className={member ? "brief-lookfor-pictured" : undefined}
                  key={lookFor.id}
                >
                  {member && (
                    <div className="brief-lookfor-picture">
                      <CastFace member={member} size="prompt" showPhotoCredit={false} />
                    </div>
                  )}
                  <div className="brief-lookfor-copy">
                    <span className="brief-lookfor-species">
                      {lookFor.species}
                    </span>
                    <span className="brief-lookfor-note">
                      {localizeText(lookFor.note, locale)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
          )}
        </section>
      )}

      {/* The recorded claim is about the PAST, so it needs no tense change: it
          is as true on a page pointed at Thursday as on one pointed at today,
          and it is the strongest thing a pre-walk can carry. */}
      {showTideChoice && <nav className="brief-block" aria-label="Tide station reference"><h2 className="brief-heading">Choose a tide reference</h2><p>Study a named coastal station independently of your school location.</p>{tideStations.map(station => { const choice = new URLSearchParams(tideChoice); choice.set("tideStation", station.id); return <span key={station.id}><Link prefetch={false} href={`/outside?${choice}`} aria-current={tideStation === station.id ? "page" : undefined}>{station.label}, NOAA {station.id}</Link>{" · "}</span>; })}{tideStation && <> · <Link href={noTideHref}>Remove tide reference</Link></>}</nav>}
      <CoastalTides reference={brief.coastalTides} />

      <SeasonalObservations report={brief.seasonalObservations} plannedDay={ahead ? day.label : undefined} />

      {brief.seen.length > 0 && (
        <section className="brief-block">
          <h2 className="brief-heading">{seenCaption(brief.scope, brief.place?.name)}</h2>
          <ul className="cast-faces brief-faces">
            {brief.seen.map((member) => (
              <li key={member.sortRank}>
                <CastFace member={member} showPhotoCredit={false} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.around.length > 0 && (
        <section className="brief-block">
          <h2 className="brief-heading">
            {usuallyAroundCaptionFor(brief.place?.name, day.offsetDays)}
          </h2>
          <ul className="cast-faces brief-faces">
            {brief.around.map((member) => (
              <li key={member.sortRank}>
                <CastFace member={member} showPhotoCredit={false} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief.quietWord && (
        <p className="brief-quiet">
          <span className="brief-quiet-label">Conditions note:</span>{" "}
          {localizeText(brief.quietWord, locale)}
        </p>
      )}

      <p className="brief-source">
        {/* THE PROVENANCE LINE FOLLOWS THE READING (pointmoon#125). It said "no
            conditions are shown, because tomorrow has not happened yet", which
            became half false the moment a forecast could appear above it — the
            sky and the temperature ARE shown, from a model rather than from an
            instrument. Two futures now, and the split is the same one the
            block above it makes: a day with a forecast names the forecast as
            the source of those two readings, a day past the horizon says the
            old thing, which is still exactly true of it. */}
        {ahead
          ? brief.forecast
            ? `Sightings and the season read live for ${
                brief.place?.name ?? "this location, which the map could not name"
              }. The sky and the temperature are forecast for ${day.shortLabel}; nothing else on this page is.`
            : `Sightings and the season read live for ${
                brief.place?.name ?? "this location, which the map could not name"
              }. No conditions are shown, because ${day.shortLabel} has not happened yet.`
          : `Conditions and sightings read live for ${
              brief.place?.name ?? "this location, which the map could not name"
            }.`}{" "}
        Open a photograph for its source and credit.
      </p>
      <Link className="brief-back" href={homeHref}>
        {homeLabel}
      </Link>
    </main>
  );
}

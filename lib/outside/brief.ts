import type { TideStationId } from "./tide-stations";
import { lessonPlaceSources, lessonReferences, type TeacherReference } from "./place-evidence";
import { noaaReferenceEnabled, type CoastalTides } from "./coastal-tides";
// Server-only: composes one Pointmoon read, the cast and the phenology notes
// into the full outside brief. Never import from a client component.

/**
 * THE BRIEF — everything we read this morning, in one place (#304).
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Johan, 17 August, holding the old Schools prototype next to this app: *"it
 * only returns 2 species.. in the old prototype we have full info whereas in
 * the new prototype it is broken.... and worse experience .. pls bring back the
 * rich card from pointmoon"*.
 *
 * He was right about the experience and wrong about the cause, and the cause
 * matters. Pointmoon was not broken: read live that evening, London returned
 * fifteen nearby species, nineteen provenance-gated photographs, sunrise,
 * sunset, the moon's phase and illumination, how many minutes of usable light
 * were left, what the ground was doing, and a partial lunar eclipse eleven days
 * out. The daily card showed two of the species and none of the rest, because
 * the daily card is `slice(0, 2)` by design.
 *
 * That design is right. The card is the door, and a door that speaks on an
 * ordinary Tuesday has no register left for the thirty-seven degree one. What
 * was missing was the room BEHIND the door: somewhere the whole read lands, so
 * the card's restraint is a choice about emphasis rather than the ceiling on
 * what this product knows.
 *
 * ── WHAT IT IS NOT ─────────────────────────────────────────────────────────
 *
 * It is not a second, louder claim. The honesty split is carried through
 * exactly as the card carries it: a photographed observation near this school
 * and the region's seasonal record are different claims and never share a
 * caption, absences ship as absences, and no tier is upgraded to fill a
 * section. The brief shows MORE OF WHAT WE ALREADY READ. It does not know one
 * thing the card does not.
 *
 * Every block tests its own data and disappears on its own. A school whose
 * Pointmoon read failed still gets the season's names and the look-fors; a
 * school in a region with no phenology rows still gets its sky and its
 * sightings. There is no state of this that renders a placeholder, and no
 * state that renders a heading over an empty section.
 */

import { outsideScope, type OutsideScope } from "./captions";
import { cardCondition, feltTemperature, skyPhrase, type CardCondition } from "@/lib/cast/conditions";
import { conditionsBucket, suggestedCondition, presentConditions } from "./bucket";
import { dayRead } from "./day-read";
import { readSurfaceCast, CAST_DEPTH } from "@/lib/cast/surface";
import type { CastMember } from "@/lib/cast/member";
import { resolvePhenologyReference } from "@/lib/cast/resolve";
import type { Locale } from "@/lib/localization";
import { resolveHinge } from "@/lib/lesson/hinge";
import type { ConditionKind, Session, TopicTag } from "@/schema/pack";
import { getOutsideNow } from "./index";
import { dayForecast, type DayForecast } from "./forecast";
import { lessonSeasonalObservations, seasonalObservationsEnabled, type SeasonalObservations } from "./seasonal-observations";
import { fetchFieldTruth } from "./pointmoon";
import { sameProducerWeek } from "./producer-week";
import {
  holdsForDayLine,
  noForecastLine,
  reaches,
  resolveSessionDay,
  type SessionDay,
} from "./session-day";
import { taxonReferences } from "./taxon-reference";
import { skyFacts, upcomingSky, lightLeft, type SkyFact, type UpcomingSky } from "./sky";
import type { LookFor, ResolvedPlace } from "./types";

export interface OutsideBrief {
  coastalTides?: CoastalTides | null;
  teacherReferences?: TeacherReference[];
  /** Dated nearby site reports matching this lesson, never a forecast. */
  seasonalObservations?: SeasonalObservations | null;
  /**
   * THE DAY THIS BRIEF IS FOR (#755).
   *
   * Today unless the surface asked for another one. Everything below is
   * resolved against it, and the readings that cannot honestly be resolved for
   * it are ABSENT rather than borrowed from this morning — see
   * `lib/outside/session-day.ts` for the partition and why it exists.
   */
  day: SessionDay;
  /**
   * Why the hour's readings are not on this page, in her words, and what is
   * still true. Both null on today, where nothing is withheld.
   *
   * They are carried here rather than composed at the surface so the /outside
   * page and anything that renders this brief next cannot each invent their
   * own account of the same absence.
   */
  noForecast: string | null;
  /**
   * The chosen day's own sky and temperature, when there is a forecast for it
   * (pointmoon#125). Null on today, which has real readings, and null past the
   * forecast horizon. A forecast, and the surface must label it as one.
   */
  forecast: DayForecast | null;
  holdsForDay: string | null;

  /** Whose patch this is. "school" only when the class carries coordinates. */
  scope: OutsideScope;
  /** The class's name, when there is one. */
  className: string | null;
  /** The school's name, when we know it. */
  school: string | null;
  /**
   * Where this whole read is anchored, when the geocoder named it (#463).
   * Every fact on this page — the sky, the light, the moon, the ground, the
   * species — is about this one point, and this is what lets the surface say
   * so plainly instead of leaving a signed-out visitor to guess. Null when
   * the payload carried no place at all, which is a real state and not a gap
   * (`ResolvedPlace` itself may still carry a null `name`).
   */
  place: ResolvedPlace | null;

  /** The day's shape and its adjustment line, or null when we could not see. */
  condition: CardCondition | null;
  /** The Pointmoon read in the curriculum's small condition vocabulary. */
  conditionKind: ConditionKind | null;
  /**
   * This morning as one sentence — the composed weather read (#341).
   *
   * It used to live on Today and was cut from here as a duplicate of it. Today
   * now carries the sky as a MARK with its label, so the sentence has nowhere
   * else to be, and the room it is true in is this one: /outside is the record
   * behind the morning. Johan's approved register line — "Clouds are drifting
   * over and there is a light breeze" — survives verbatim here.
   */
  read: string | null;
  /** The felt temperature with its unit, in her scale. */
  temperature: string | null;
  /** "a clear sky · a light breeze", without the temperature. */
  sky: string | null;
  /** Sunrise, sunset, light left, moon, ground. Only what came back. */
  facts: SkyFact[];
  /** The nearest sky event worth planning around, within half a term. */
  upcoming: UpcomingSky | null;

  /** Photographed observations near this school. The strong claim. */
  seen: CastMember[];
  /** The region's seasonal record. Never spoken as recorded. */
  around: CastMember[];
  /** A strong record here that this read did not return. Never findable. */
  absences: CastMember[];

  /**
   * HOW THE REGION'S WEEK IS RUNNING, in Pointmoon's own terms (#1292).
   *
   * Composed by `summarizeConditions` from the live
   * `nature.phenology.dominant_phase` / `season_progress` signals and, under
   * the confidence floor #1281 measured, Pointmoon's own headline sentence.
   * It is the caption over `lookFors`: the same regional calendar, said as a
   * state rather than as a list, which is what tells a teacher whether the
   * species below are worth walking out to look for this week or are already
   * going over.
   *
   * IT IS A CLAIM ABOUT ONE WEEK, AND THAT IS WHY IT DOES NOT TRAVEL LIKE ITS
   * LIST DOES. `lookFors` are resolved on the chosen day's own week, so they
   * are that day's. This sentence is read out of the live payload, which
   * `readPhenologyCondition` only admits when its phenology block is the
   * CURRENT week — so under a day in a later week it would be this week's
   * state printed under that week's heading, which is the borrowing #755
   * forbids. It is therefore null for a day outside the read's own producer
   * week rather than relabelled, and `reaches("the-season", day)` is
   * deliberately not the gate here: that answers a broader question than this
   * field can.
   *
   * Never a stored or authored claim, and never a local fact: what the region
   * usually brings cannot establish that anything is present at this school
   * (the rule `lib/lesson/support-context.ts` states for the same sentence on
   * the model's side).
   */
  seasonalNote: string | null;
  /** This week's phenology, with its teaching note. */
  lookFors: LookFor[];
  /** Identification pictures for those prompts, independent of cast depth. */
  lookForMembers: CastMember[];
  /** Why this particular day changes this particular lesson. */
  context:
    | {
        lessonId: string;
        lessonTitle: string;
        line: string;
        source: "lesson.conditionNotes";
      }
    | {
        line: string;
        source: "conditions.adjustment";
      }
    | null;
  /**
   * The one thing worth saying to the adult holding the door, composed from
   * the day's own numbers. Null when the day gave us nothing to say.
   */
  quietWord: string | null;
}

const emptyBrief = (day: SessionDay): OutsideBrief => ({
  day,
  noForecast: noForecastLine(day),
  forecast: null,
  holdsForDay: holdsForDayLine(day),
  scope: "sample",
  className: null,
  school: null,
  place: null,
  condition: null,
  conditionKind: null,
  read: null,
  temperature: null,
  sky: null,
  facts: [],
  upcoming: null,
  seen: [],
  around: [],
  absences: [],
  seasonalNote: null,
  lookFors: [],
  lookForMembers: [],
  context: null,
  quietWord: null,
});

export interface OutsideBriefQuery {
  tideStation?: TideStationId;
  topicTags?: readonly TopicTag[];
  locale?: Locale;
  date?: Date;
  session?: Pick<Session, "id" | "title" | "conditionNotes">;
  /**
   * The day the class is actually planned for (#755). Already resolved by the
   * surface, because the surface needs it for its own chooser and two
   * independent resolutions of "which day is this" is how they drift apart.
   *
   * Omitted means today, which is exactly what every caller did before this
   * existed. When it is a future day it also becomes the moment the SEASONAL
   * reads resolve on, so the phenology below is that week's rather than this
   * one's.
   */
  sessionDay?: SessionDay;
}

/**
 * Compose the brief.
 *
 * Three reads, and two of them are usually free: `readSurfaceCast` and
 * `getOutsideNow` both go through `fetchFieldTruth`, which memoises per
 * location for fifteen minutes, so asking for the sky here costs no extra
 * network call. Never throws — a failure is the empty brief, and the surface
 * renders the honest nothing.
 */
/**
 * Drop from the regional cast anything the look-fors already name.
 *
 * Pure and exported so the rule can be tested without standing up a
 * Pointmoon read. Matching is on the common name, trimmed and lowercased,
 * which is the same key the surfaces already use to pair a species with its
 * picture; a species the look-fors do not name is untouched.
 */
export function withoutLookFors(
  around: readonly CastMember[],
  lookFors: readonly { species: string }[]
): CastMember[] {
  const named = new Set(
    lookFors
      .map((l) => l.species?.trim().toLowerCase())
      .filter((s): s is string => Boolean(s))
  );
  if (named.size === 0) return [...around];
  return around.filter((m) => !named.has(m.commonName.trim().toLowerCase()));
}

export async function getOutsideBrief(
  query: OutsideBriefQuery = {}
): Promise<OutsideBrief> {
  const { topicTags = [], locale = "uk", date, session } = query;
  const day = query.sessionDay ?? resolveSessionDay({ locale });
  /**
   * THE ONE READING MOMENT FOR EVERYTHING SEASONAL (#755).
   *
   * An explicit `date` still wins, because that is the injection point the
   * existing tests and callers use. Otherwise the chosen day IS the date: the
   * phenology week and the cast's season resolve on the day the class runs,
   * not on the day the teacher happens to be holding the phone.
   *
   * TODAY STAYS UNDEFINED rather than becoming a synthesised "today". Both
   * callees default an absent date to `new Date()`, and handing them a
   * constructed instant instead would be a behaviour change on every existing
   * caller in exchange for nothing. A future day is the only case that needs a
   * date it did not have before.
   */
  const seasonalDate = date ?? (day.offsetDays === 0 ? undefined : day.date);
  /**
   * Whether THIS MORNING'S readings may appear at all. See session-day.ts.
   *
   * Still false for every future day, and that is unchanged by pointmoon#125:
   * a forecast for Thursday is Thursday's own reading, composed separately in
   * `dayForecast`. What this gate governs is the borrowing of the current hour
   * — `dayRead`, `feltTemperature`, `skyPhrase`, `skyFacts`, `quietWord` — and
   * none of those may ever appear under a day that is not today.
   */
  const hourHolds = reaches("the-hour", day);
  /**
   * Whether a signal read live out of THIS week's payload may appear under
   * the chosen day. See `seasonalNote` on `OutsideBrief` for why this is a
   * narrower question than `reaches("the-season", day)` answers.
   */
  const weekHolds = sameProducerWeek(day.date, new Date());

  try {
    // The cast first: it is the one read that tells us where this teacher is.
    // Eight members, which is the resolver's own maximum — the brief is the
    // surface that is allowed to show all of them.
    // THE SAME DEPTH TODAY READS (#355). Today's door shows three crops of
    // species from the tail of this same cast, uncredited, on the promise that
    // this page carries their credit. It only does if this page reads at least
    // as deep as Today does.
    const surface = await readSurfaceCast({
      topicTags,
      limit: CAST_DEPTH,
      date: seasonalDate,
    });
    const { lat, lng, climate } = surface.place;

    const [data, outside, references] = await Promise.all([
      fetchFieldTruth({
        lat: typeof lat === "number" ? lat : undefined,
        lng: typeof lng === "number" ? lng : undefined,
        ...(lessonPlaceSources(topicTags).length ? { placeSources: lessonPlaceSources(topicTags) } : {}),
        ...(query.tideStation && noaaReferenceEnabled() ? { tideStation: query.tideStation, tideDate: day.iso } : {}),
        ...(typeof lat === "number" && typeof lng === "number" && seasonalObservationsEnabled(lat, lng) ? { seasonalObservations: true } : {}),
      }),
      getOutsideNow({
        lat,
        lng,
        climate,
        topicTags,
        date: seasonalDate,
        locale,
        // Enough phenology rows that the look-fors are a week's worth rather
        // than the card's handful.
        limit: 10,
      }).catch(() => null),
      // Static, generated identification pictures. This is a process-cached
      // disk read, not another Pointmoon or iNaturalist request.
      taxonReferences().catch(() => ({})),
    ]);

    /* ── THE HOUR, AND WHERE IT STOPS (#755) ────────────────────────────────
       Read once and then GATED ONCE, here, rather than at each of the eight
       fields it feeds. `cardCondition` is a read of the current hour, and so
       is everything downstream of it: the condition kind, the authored hinge
       that keys off that kind, the adjustment line, the quiet word. On a day
       that is not today the whole chain is null at its source, which is why
       there is no branch further down that could accidentally let one of them
       through. */
    const condition = hourHolds ? cardCondition(data) : null;
    const conditionKind = hourHolds ? suggestedCondition(conditionsBucket(data)) : null;
    const authoredContext = session
      ? resolveHinge(session, hourHolds ? presentConditions(data) : null)?.teacher ?? null
      : null;
    let context: OutsideBrief["context"] = null;
    if (session && authoredContext) {
      context = {
        lessonId: session.id,
        lessonTitle: session.title,
        line: authoredContext,
        source: "lesson.conditionNotes",
      };
    } else if (session && condition?.adjustment) {
      context = {
        line: condition.adjustment,
        source: "conditions.adjustment",
      };
    }

    // The same split the daily card makes, over the WHOLE cast rather than
    // over the two or three faces the door has room for.
    const members = surface.cast.members;
    const seen = members.filter((m) => m.honestyTier === "recorded" && !m.absent);
    const lookFors = outside?.lookFors ?? [];
    // ONE CLAIM, RENDERED ONCE.
    //
    // `lookFors` and `around` are both the REGIONAL claim, drawn from the same
    // seasonal read, so /outside was printing the same six species twice on one
    // page: once under "What to look for" with the authored note and the photo,
    // and again under "Usually around here now" with a shortened line and the
    // same photograph. Every tester in the persona studies (#454, #455) read the
    // repeat as a broken page, and they were right to — it is one thing said
    // twice, not two things.
    //
    // The look-for wins because it is the richer of the two: the authored note
    // rather than the calmed one-liner. A region whose whole seasonal list is
    // already in the look-fors correctly renders no second section at all.
    const around = withoutLookFors(
      members.filter((m) => m.honestyTier !== "recorded" || m.absent),
      lookFors
    );
    /* THE CHOSEN DAY'S OWN SKY (pointmoon#125). Read from the same payload
       everything else on this page came out of, matched on the ISO day rather
       than on an offset counted from the server's own morning. Null on today,
       which has measurements and does not need a model's opinion beside them. */
    const forecast = dayForecast(data, day, locale);

    const seasonalById = new Map(
      (outside?.usuallyAround ?? []).map((entry) => [entry.id, entry])
    );
    const lookForMembers = lookFors.flatMap((lookFor, index) => {
      const seasonal = seasonalById.get(lookFor.id);
      const member = resolvePhenologyReference(
        {
          species: lookFor.species,
          scientificName: seasonal?.scientificName,
          // An event row is not in `seasonalById` at all (#1020), so this
          // would already resolve without a taxon. It is said out loud anyway:
          // the resolver must be told what the row IS, not left to conclude it
          // from a scientific name that happens to be missing. That inference
          // is the one this ticket removed.
          kind: lookFor.kind,
        },
        references
      );
      return member ? [{ ...member, sortRank: index, line: lookFor.note }] : [];
    });

    return {
      day,
      // COMPOSED BEFORE THE LINE THAT DESCRIBES IT, because that line now says
      // a different thing depending on whether the sky resolved for this day.
      noForecast: noForecastLine(day, forecast !== null),
      forecast,
      holdsForDay: holdsForDayLine(day),
      scope: outsideScope(surface),
      className: surface.className,
      school: surface.school,
      // From the same Pointmoon read the conditions and the cast came out
      // of, so the name and everything else on the page are guaranteed to be
      // about one point (#463, following #315's `readResolvedPlace`).
      place: outside?.place ?? null,
      condition,
      conditionKind,
      /* THE HOUR'S OWN READINGS. Every one of these is composed from
         `weather.current`, `ground`, `astronomy` or `time.windows`, all of
         which describe the moment the payload was fetched. Under a day that is
         not today they are ABSENT, not stale and not relabelled: showing this
         morning's 21 degrees under Thursday's heading is the invention this
         repo's cardinal rule forbids, and a teacher would have no way to see
         the seam. */
      read: hourHolds ? dayRead(data) : null,
      temperature: hourHolds ? feltTemperature(data, locale) : null,
      sky: hourHolds ? skyPhrase(data) : null,
      facts: hourHolds ? skyFacts(data) : [],
      /* THE ONE READING THAT TRAVELS. A sky event carries `daysOffset`, a
         count rather than a state of the current hour, so it is as true for
         Thursday as for this morning. It is re-worded from the chosen day so
         "in 3 days" cannot be read as three days after Thursday. */
      upcoming: upcomingSky(data, day.offsetDays),
      seen,
      around,
      absences: surface.cast.absences,
      /* THE WEEK'S STATE, AND ONLY ITS OWN WEEK'S (#1292). `lookFors` below
         are resolved on the chosen day's week and therefore travel; this
         sentence is read out of the live payload's current week, so it is
         absent under a day in a later one rather than relabelled.

         `conditions` is optional-chained although the type says it is always
         there: this whole block is inside one `try` whose `catch` returns the
         EMPTY brief, so a reader that throws on a thin `outside` would take
         the species, the place and the cast down with it and look like a
         Pointmoon outage. */
      seasonalNote: weekHolds ? outside?.conditions?.seasonalNote ?? null : null,
      lookFors,
      lookForMembers,
      teacherReferences: typeof lat === "number" && typeof lng === "number" ? lessonReferences(data?.facts?.fieldSnapshot?.placeEvidence, { lat, lng, sources: lessonPlaceSources(topicTags) }, lookFors.flatMap(lookFor => { const name = seasonalById.get(lookFor.id)?.scientificName; return name ? [name] : []; })) : [],
      coastalTides: data?.facts?.fieldSnapshot?.coastalTides ?? null,
      seasonalObservations: lessonSeasonalObservations(data?.facts?.fieldSnapshot?.seasonalObservations, lookFors.map((lookFor) => ({ scientificName: seasonalById.get(lookFor.id)?.scientificName }))),
      context,
      // The context block already owns the adjustment. Keep the later quiet
      // word for a real light constraint instead of printing the same advice
      // twice on one page.
      quietWord: hourHolds ? quietWord(data, context ? null : condition) : null,
    };
  } catch {
    return emptyBrief(day);
  }
}

/**
 * A quiet word — the old prototype's teacher tip, rebuilt on our own numbers.
 *
 * The prototype's version read *"You have about 35 minutes of usable light
 * before civil twilight ends"*, and that is the shape worth keeping: a real
 * number she can plan against, in a sentence she can act on, addressed to the
 * adult rather than the class.
 *
 * It leads with the light, because running out of light is the thing that ends
 * a lesson badly and the only one of these she cannot see through a window. The
 * day's adjustment line follows when there is one, and on a mild day with plenty
 * of light there is no quiet word at all, which is the same silence the card
 * keeps.
 *
 * Composed, not drafted by a model: these are two facts and a join, and putting
 * a model between a teacher and a number she is going to plan around adds a
 * failure mode without adding a word she needs.
 */
function quietWord(
  data: Parameters<typeof lightLeft>[0],
  condition: CardCondition | null
): string | null {
  const parts: string[] = [];

  const left = lightLeft(data);
  const minutes = data?.facts?.fieldSnapshot?.time?.windows?.daylightMinutesRemaining;
  // Only worth saying when the light is actually a constraint. "About six
  // hours" at nine in the morning is not advice, it is noise.
  if (left && typeof minutes === "number" && minutes > 0 && minutes <= 120) {
    parts.push(`You have ${left} of usable light left.`);
  } else if (left && minutes === 0) {
    parts.push("The light has gone for today.");
  }

  if (condition?.adjustment) parts.push(condition.adjustment);

  return parts.length > 0 ? parts.join(" ") : null;
}

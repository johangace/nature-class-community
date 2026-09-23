import { requestLocale } from "@/lib/request-locale";
import "server-only";
import { isModelAvailable } from "@/lib/ai/model";
import { localizeDeep } from "@/lib/localization";
import { hazardsForClass } from "@/lib/lesson/class-hazards";
import { projectLessonJourney } from "@/lib/lesson/journey";
import { projectLessonMedia } from "@/lib/lesson/media";
import { subjectMediaFor } from "@/lib/lesson/subject-media";
import { getOutsideNow, isClimateGroup } from "@/lib/outside";
import { asHabitatTags } from "@/lib/outside/grounds";
import { findSession, leadPack } from "@/lib/pack";
import { activePlaceContext, sessionForPlace } from "@/lib/place-context";
import { getActiveClass, getActiveClassLocation, getTeacher } from "@/lib/teacher";
import { rememberedFactsForClass } from "@/lib/world-memory";
import { notFound } from "next/navigation";
import { primaryTopicOf } from "@/lib/lesson/door";
import type { TodayReadQuery } from "@/lib/outside/today";

export type LessonSearchParams = Promise<{
  session?: string;
  locale?: string;
  /**
   * `legacy` opens the retired five-page plan instead of the scroll. A
   * prototyping affordance for comparing the two in the live app (nc#232), not
   * a supported second product — see `app/session/legacy/LegacyPlanFrame.tsx`.
   */
  plan?: string;
  /**
   * `failed` when the last retire on the memory strip did not write (#509).
   * The route handler sets it; the primer turns it into one honest line. It is
   * a report about the previous request, never state the page trusts.
   */
  retire?: string;
}>;

/** One server-side source for every page in the lesson preparation journey. */
export async function loadLessonPreparation(searchParams: LessonSearchParams) {
  // Same no-param fallback as Today and /run: the shelf's lead pack. A
  // hardcoded pack id here is how the app once offered autumn in August.
  const home = leadPack();
  const { session: wanted, locale: localeParam, retire } = await searchParams;
  const found = wanted ? findSession(wanted) : { pack: home, session: home.sessions[0] };
  if (!found?.session) notFound();

  const teacher = await getTeacher();
  const active = teacher ? await getActiveClass(teacher.id) : null;
  const classLocation =
    active && typeof active.lat === "number" && typeof active.lng === "number"
      ? { lat: active.lat, lng: active.lng }
      : await getActiveClassLocation();
  const locale = await requestLocale(localeParam, classLocation);
  // Habitat first, THEN localize. The seam swaps whole instructions for the
  // school's pack key; localization then puts the surviving sentence into the
  // reader's English. In the other order a Phoenix variant would keep UK
  // spelling, because the localizer would already have run on the London text
  // it replaced. Both layers leave the pack on disk untouched (#142).
  //
  // `activePlaceContext` rather than the bare `placeContextFor` it used to
  // call, because only the async one carries `lookFor` — what this class can
  // actually reach. Ready is the pre-read of the lesson she is about to lead,
  // and it was resolving instructions from a thinner place than `/run` used,
  // so the sentence she rehearsed at breaktime could differ from the one the
  // runner put in front of her an hour later. The pre-read and the lead must
  // resolve identically or the pre-read is not a pre-read.
  const place = await activePlaceContext();
  const session = localizeDeep(await sessionForPlace(found.session, place), locale);
  /** Her grounds and site features. Empty filters nothing; the region answers. */
  const reachableTags = asHabitatTags(place.lookFor?.reachable ?? []);
  const reachable = reachableTags.length ? reachableTags : undefined;
  const outside =
    teacher && !classLocation
      ? null
      : await getOutsideNow({
          lat: classLocation?.lat,
          lng: classLocation?.lng,
          habitats: reachable,
          climate:
            typeof active?.climate === "string" && isClimateGroup(active.climate)
              ? active.climate
              : null,
          topicTags: session.topicTags,
          primaryTopic: primaryTopicOf(session),
          limit: 4,
          locale,
        }).catch(() => null);
  /** The lesson's own subject, both producers, same as the runner (#1019). */
  const lessonTopic = primaryTopicOf(session);
  const recorded = projectLessonMedia(
    outside?.sightings ?? [],
    lessonTopic ? [lessonTopic] : session.topicTags,
    3
  );
  /**
   * The same floor the runner has: when nothing has been photographed near
   * this school, show a picture of what the week is about rather than an empty
   * row. Ready and the run must agree about this, or she prepares from one set
   * of pictures and leads with another — which is why the topic gate is passed
   * here too and not only in `app/run/page.tsx`.
   */
  const media =
    recorded.length > 0
      ? recorded
      : await subjectMediaFor({
          names: (outside?.usuallyAround ?? []).map((n) => ({
            name: n.name,
            scientificName: n.scientificName,
          })),
          topic: session.topic,
          primaryTopic: lessonTopic,
          ageBand: active?.yearGroup,
          limit: 3,
        }).catch(() => []);

  /**
   * The same hazards the runner resolves, from the same function (#417). The
   * safety page under this loader and the field she walks into must agree
   * about what is out there; two resolutions of one warning list is the bug
   * this shares a resolver to prevent.
   */
  const hazards = await hazardsForClass({
    pack: place.pack,
    habitats: reachableTags,
    lat: classLocation?.lat,
    lng: classLocation?.lng,
  });

  const index = found.pack.sessions.findIndex((candidate) => candidate.id === session.id);
  const weekOf =
    found.pack.sessions.length > 1
      ? "week " + (index + 1) + " of " + found.pack.sessions.length
      : "one lesson";

  /**
   * THE DAY'S READ, AS A QUERY RATHER THAN A READ (2026-09-08).
   *
   * Johan, on the lesson page: *"i said somewhere here i dont see the line"*.
   * The authored conditions note needs today's conditions, and this loader
   * deliberately does NOT fetch them: Pointmoon's own budget is ten seconds
   * and this loader is what the lesson page awaits before it paints anything.
   * So the loader hands down the QUERY and the page streams the read behind
   * its own Suspense boundary (`app/session/SessionConditionsNote.tsx`).
   *
   * Built exactly ONCE, here, because `getTodayRead` is wrapped in React's
   * `cache` and keys on ARGUMENT IDENTITY. Both placements on the page take
   * this same object, so one composition serves them and they cannot disagree
   * about the morning. Build a fresh literal at either call site and the whole
   * composition silently runs twice.
   *
   * It carries no coordinates, and it does not need to: `getTodayRead` reads
   * the active class's own place through `readSurfaceCast`, and an unlocated
   * or failed read returns no conditions at all — which resolves to no hinge,
   * which renders nothing. The location gate is the absence rule, not a
   * separate check.
   */
  const todayQuery: TodayReadQuery = {
    topicTags: session.topicTags ?? [],
    locale,
    habitats: reachable,
  };

  /**
   * What we remember about her grounds (#509). Read here rather than in the
   * primer so every page under this loader sees the same answer, and gated on
   * a signed-in teacher with a class: the demo path has no world to quote and
   * must stay database-free.
   */
  const remembered =
    teacher && active ? await rememberedFactsForClass(teacher.id, active.id, locale) : [];

  return {
    activeClass: active ? { name: active.name, yearGroup: active.yearGroup, abilityBand: active.abilityBand } : null,
    activeClassId: active?.id ?? null,
    retireFailed: retire === "failed",
    assistantAvailable: Boolean(teacher) && isModelAvailable(),
    remembered,
    hazards,
    homeHref: teacher ? ("/today" as const) : ("/" as const),
    journey: projectLessonJourney(found.pack, session),
    locale,
    media,
    session,
    todayQuery,
    weekOf,
  };
}

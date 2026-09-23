import { requestLocale } from "@/lib/request-locale";
import { notFound } from "next/navigation";
import { resolveAbility } from "@/lib/ability";
import { curriculumPosition, nextInSequence } from "@/lib/curriculum";
import { localizeDeep } from "@/lib/localization";
import { isModelAvailable } from "@/lib/ai/model";
import { findSession, leadPack } from "@/lib/pack";
import { activePlaceContext, sessionForPlace } from "@/lib/place-context";
import { getActiveClassLocation } from "@/lib/teacher";
import { getActiveClass, getTeacher } from "@/lib/teacher";
import { getTryPlace } from "@/lib/try-place-server";
import { examplePlaceAt } from "@/lib/example-places";
import { hazardsForClass } from "@/lib/lesson/class-hazards";
import { projectLessonMedia } from "@/lib/lesson/media";
import { subjectMediaFor } from "@/lib/lesson/subject-media";
import { getOutsideNow } from "@/lib/outside";
import { resolveHinge } from "@/lib/lesson/hinge";
import { asHabitatTags } from "@/lib/outside/grounds";
import { readSurfaceCast } from "@/lib/cast/surface";
import { primaryTopicOf, resolveDoor } from "@/lib/lesson/door";
import { doorLineFacts, draftDoorLine } from "@/lib/ai/door-line";
import { shouldShowDoorEvidence } from "@/lib/lesson/media-visibility";
import { speciesLexicon } from "@/lib/outside/taxon-reference";
import { withLivePhotos } from "@/lib/cast/enrich";
import { getGroundedConditions } from "@/lib/grounding";
import { groundSessionConditions } from "@/lib/run/ground-conditions";
import { sayConditionsOnce } from "@/lib/run/conditions-once";
import { readAloudLine } from "@/lib/cast/speak";
import { spokenAudioForSession } from "@/lib/lesson/spoken-audio";
import { previewForSession } from "@/lib/lesson/preview-audio";
import { Runner, type LogTarget } from "./Runner";
import { shouldAutoResume } from "./return-to-run";
import { GlossaryProvider } from "./Glossary";
import { GroupNounProvider } from "./GroupNoun";
import { RunScopeProvider } from "./RunScope";
import { groupNoun } from "@/lib/group-profile";
import { outsideScope } from "@/lib/outside/captions";
import { LessonScroll } from "./LessonScroll";
import { HybridJourney } from "./HybridJourney";

/**
 * The teleprompter. Loads the pack on the server, runs it on the client.
 * `?session=` picks a session off the shelf; no param means the shelf's lead
 * pack's first session, so the cold demo URL always opens on the season we
 * are actually in. A signed-in teacher with an active class also gets the
 * finish-page logging line; signed out, the runner is byte-for-byte the
 * cold-URL demo.
 */
/**
 * What a signed-out visitor is told on the doorstep (#877). The run is the
 * real thing, but the patch it reads is a sample school's, not hers, and the
 * captions inside already say "the sample patch". One sentence here, before
 * she starts, so the honesty is not left to a caption she may not read.
 */
const EXAMPLE_NOTE =
  "This is an example, run for a sample school's patch rather than yours. Sign in and every reading is for your own school.";

/**
 * The same doorstep when she answered the one question on /start (#877): the
 * readings are for the spot she chose, and the only thing sign-in adds is
 * keeping it.
 */
const CHOSEN_NOTE =
  "This run reads for the place you chose, not a saved school yet. Sign in and it becomes your school's own.";

/**
 * And the same doorstep for one of the named example places (#877, third
 * slice). It names what it is reading, because it can: the reading is live for
 * that patch, and "an example patch" rather than "an example school" is the
 * honest half — there is no school at these coordinates to speak for.
 */
function namedExampleNote(name: string): string {
  return `This is an example, run live for ${name} rather than your own patch. Sign in and every reading is for your own school.`;
}

export default async function RunPage({
  searchParams,
}: {
  searchParams: Promise<{
    session?: string;
    locale?: string;
    run?: string;
    resume?: string;
    start?: string;
  }>;
}) {
  const {
    session: wanted,
    locale: localeParam,
    run: runMode,
    resume,
    start,
  } = await searchParams;
  // The season a no-param visitor lands on is decided in `seasonShelf` and
  // nowhere else (#115). A hardcoded pack id here is how the app offered
  // autumn in August.
  const pack = leadPack();
  const found = wanted ? findSession(wanted) : { pack, session: pack.sessions[0] };
  if (!found?.session) notFound();
  const classLocation = await getActiveClassLocation();
  const locale = await requestLocale(localeParam, classLocation);
  // Habitat before localization, as on /read and in lesson-data.ts: the seam
  // picks the instruction for this school's pack key, localization puts the
  // surviving sentence into the reader's English (#207, #265).
  //
  // Resolved once and kept, rather than awaited inline: the same place that
  // picks the instruction also knows which habitats this class can reach, and
  // both halves of the lesson should answer to the same school.
  const place = await activePlaceContext();
  const session = localizeDeep(await sessionForPlace(found.session, place), locale);
  const primaryTopic = primaryTopicOf(session);
  /**
   * Her grounds and her site features, merged and narrowed to the tags the
   * corpus uses. Empty means she has not told us yet, and empty filters
   * nothing: the region answers instead of the week going silent.
   */
  const reachableTags = asHabitatTags(place.lookFor?.reachable ?? []);
  const reachable = reachableTags.length ? reachableTags : undefined;

  /**
   * Hazards for these grounds, this month (#376, grown in #388). Resolved
   * here, server-side, from authored data plus the occurrence record — never
   * a model, never an API call at run time — so the card is in the payload
   * and works in a field with no signal. The record read rides the same
   * cached field-truth payload the species guards already pay for; a school
   * with no coordinates gets the universal core and nothing regional, which
   * is the honest answer.
   */
  const hazards = await hazardsForClass({
    pack: place.pack,
    habitats: reachableTags,
    lat: classLocation?.lat,
    lng: classLocation?.lng,
  });

  let logTo: LogTarget | null = null;
  const teacher = await getTeacher();
  const chosenPlace = teacher ? null : await getTryPlace();
  // A named example off the /start list reads live, and says where (#877).
  const examplePlace = examplePlaceAt(chosenPlace);
  const exampleNote = teacher
    ? null
    : examplePlace
      ? namedExampleNote(examplePlace.name)
      : chosenPlace
        ? CHOSEN_NOTE
        : EXAMPLE_NOTE;
  const homeHref = teacher ? "/today" : "/";
  let ownerScope: string | null = teacher ? null : "demo:public";
  /**
   * The class's own band, not a guess. `LessonScroll` used to render a
   * hardcoded `y1` for everyone, so a Reception class heard Year 1 wording
   * with nothing on screen to say so. Null when signed out or when the stored
   * yearGroup is not one we recognise, and the component decides what that
   * means rather than this file quietly picking a band.
   */
  let classBand = resolveAbility().band;
  /**
   * The word the runner uses for the people in front of her (#1214). The
   * active class record already carries `groupType`; `app/run` simply never
   * read it, so a family in a garden was told to gather its class. Null here
   * means no stored audience, and `groupNoun` resolves that to "class" — the
   * documented default, because a missing audience is an existing school
   * record rather than an inferred family.
   */
  let groupType: string | null = null;
  if (teacher) {
    const active = await getActiveClass(teacher.id);
    if (active) {
      logTo = { classId: active.id, className: active.name };
      ownerScope = `class:${active.id}`;
      classBand = resolveAbility({ classBand: active.abilityBand, yearGroup: active.yearGroup }).band;
      groupType = active.groupType ?? null;
    }
  }
  const runGroupNoun = groupNoun(groupType);

  const outside =
    teacher && !classLocation
      ? null
      : await getOutsideNow({
          lat: classLocation?.lat,
          lng: classLocation?.lng,
          habitats: reachable,
          topicTags: session.topicTags,
          primaryTopic,
          limit: 4,
          locale,
        }).catch(() => null);
  /**
   * ONE TOPIC PARAMETER, THE LESSON'S OWN SUBJECT (#1019). Both producers of
   * this row are given `primaryTopicOf` — the same single tag the door has
   * narrowed to since #339 — rather than one of them taking the union of the
   * session's tags and the other taking nothing at all. A lesson tagged
   * `["animals", "trees", "art", "seasons"]` scored a swallow exactly as
   * highly as an oak while it fell back to whatever the week held.
   */
  const recorded = projectLessonMedia(
    outside?.sightings ?? [],
    primaryTopic ? [primaryTopic] : session.topicTags,
    3
  );
  /**
   * Nothing photographed near this school. Rather than an empty row, go and
   * find a picture of what the week says is about — an oak, a blackberry, a
   * river — preferring one taken near her and captioned so it never reads as
   * a sighting. A real observation always wins, so this only runs when there
   * is none. Filtered to the lesson's subject, and empty when nothing on it
   * survives: see `subjectMediaFor`.
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
          primaryTopic,
          ageBand: classBand,
          limit: 3,
        }).catch(() => []);

  // The conditions line, made true of this day and this place.
  //
  // A grounded line has been composed for months and served at
  // /api/conditions, and no client ever fetched it — so every lesson has been
  // showing its generic authored fallback ("look at the sky, name what it is
  // doing") whatever was actually outside. Resolving it HERE, server-side,
  // and freezing it into the session the runner receives is what lets it be
  // both contextual and safe: the renderer's law is that a client must never
  // replace a sentence while a teacher is reading it aloud, and a line frozen
  // before the run starts never does. When there is nothing true to say, the
  // authored line stands.
  const grounded = await getGroundedConditions({
    lat: classLocation?.lat,
    lng: classLocation?.lng,
    sessionId: session.id,
    topic: session.topic,
    objective: session.objective,
    topicTags: session.topicTags,
    habitats: reachable,
    locale,
  }).catch(() => ({ line: null, suggestedCondition: null, conditions: [] }));
  // …and then said ONCE (#270). Grounding writes the one frozen sentence into
  // every groundable conditions-line, and four autumn-starter sessions author
  // two of them — settle, then the phase after it. Both then read byte-for-byte
  // the same, so a teacher meets "right now it feels like 24 degrees" a second
  // time minutes later, live in front of a class. `sayConditionsOnce` drops a
  // repeat that has already been said in the same walk and nothing else: a
  // conditions-line still carrying different words is left where the author put
  // it. Applied here, once, so every surface this page feeds — the hybrid
  // journey, the legacy runner, the scroll — reads the same session.
  const groundedSession = sayConditionsOnce(groundSessionConditions(session, grounded.line));

  // The curriculum's next session after this one, for the finish page's tease
  // (#55). Sequence-wide rather than scoped to this pack's own shelf, so
  // finishing starter session 4 teases spring's first session instead of
  // silently having nothing to say. A session outside the sequence (a
  // held-back pack reached by direct link) honestly has no tease.
  const nextTitle = nextInSequence(session.id)?.session.title ?? null;

  // Today's lesson cast, for the meet-the-cast beat inside the run. Four is
  // the ceiling: this is a thing she holds up between other things, and a
  // class can hold two or three creatures in mind and go look for them.
  // Resolved here rather than in the client so the runner needs no fetch and
  // the beat is present on the first paint.
  /*
   * THE GATE CAME OFF (#350), and it is the whole reason the door was empty.
   *
   * Johan, looking at Counting life: *"why we say we dont know your school
   * here? cant we show LIFE??"*
   *
   * We can, and we always could. This line used to read `hasAuthoredTeachingFlow
   * ? null : await readSurfaceCast(...)`, and that gate was written for the
   * LEGACY runner's meet-the-cast beat, which a session with an authored
   * teaching flow skips. The hybrid journey has no such beat — grep it, there
   * is no `castBeat` in the file — and it reads this same cast for two other
   * things: the tappable species entities, and the door's evidence.
   *
   * So for every session with an authored teaching flow, roughly thirty of the
   * forty-eight, the door said "we do not know your patch yet" about a patch
   * nobody had asked about. That sentence was not a hedge, it was a report on
   * a question that was never put. One gate, two consumers, and the one it was
   * written for defends itself anyway (`Runner.tsx` re-derives it for its own
   * beat).
   *
   * The limit rises with it: four is the ceiling for the compact meet-the-cast
   * list. The door picks a SPREAD across kinds out of this wider source list,
   * and it can only do that if the list is long enough to contain more than
   * one kind.
   */
  const surfaceCast = await readSurfaceCast({
    topicTags: session.topicTags,
    primaryTopic,
    // STRICT (nc#233): this cast is "who THIS LESSON is about" — the
    // meet-the-cast beat, the tappable entities and the door's evidence. A
    // ranked-but-unfiltered cast let a minibeast lesson with little local
    // evidence fill out with birds and trees to reach six; strict mode
    // returns only what matches the topic, and nothing at all rather than a
    // mismatched cast when the topic maps to a taxon and none does.
    topicFilter: true,
    habitats: reachable,
    limit: 8,
  });
  // A stored cast written before the provenance contract renders plates while
  // this week's live read holds releasable photographs of the same species.
  // Graft those on at the seam so the beat shows the real photo when one
  // exists (lib/cast/enrich.ts).
  const castMembers = withLivePhotos(
    surfaceCast?.cast.members.slice(0, 8) ?? [],
    outside?.sightings ?? []
  );
  const lessonCast =
    castMembers.length > 0
      ? {
          members: castMembers,
          lines: castMembers.map((member) =>
            readAloudLine(member, {
              locality: surfaceCast?.located ? "recorded-nearby" : "sample",
            })
          ),
          located: Boolean(surfaceCast?.located),
          // The geocoder already named this point for the conditions read
          // (#350). The door spends it on the regional caption, which is the
          // cheapest zoom we own: "Usually around Canonbury now".
          placeName: outside?.place?.name ?? null,
        }
      : null;

  /**
   * Whose patch this run is about (#370). The same three-way answer every
   * other outside surface already asks for — `lib/outside/brief.ts` and
   * `lib/outside/today.ts` both call `outsideScope` on this exact shape — so
   * the runner cannot drift from Today about whether there is a school here.
   *
   * `readSurfaceCast` answers `EMPTY` rather than throwing when the read
   * fails, and `EMPTY` is unlocated, so an unreadable cast says "the sample
   * patch" exactly as Today does. Claiming a school we could not read for
   * would be the failure this ticket is about.
   */
  const runScope = outsideScope(surfaceCast ?? { located: false, chosen: false });

  /**
   * THE DOOR'S JOINING SENTENCE (#342), resolved here and frozen into the page.
   *
   * Same law as the conditions line twenty lines up: a client must never
   * replace a sentence while a teacher is reading it aloud, and a line settled
   * before the run starts never does. Server-side is also the only place the
   * model boundary exists at all.
   *
   * The evidence is resolved TWICE — here, and again in `HybridJourney` when
   * the door renders — because `resolveDoor` is pure and client-safe and the
   * runner needs it without a fetch. Two resolutions of the same inputs agree,
   * but "agree" is a thing to check rather than assume, so the line travels
   * with the names it was written over and `DoorSlot` drops it if the screen
   * is showing anything else. A joining sentence about creatures that are not
   * up there is worse than no sentence.
   *
   * NEVER DRAFTED FOR AN OPEN-COUNT SESSION (nc#403, reopened): the door
   * withholds its evidence entirely on those sessions
   * (`shouldShowDoorEvidence`, `HybridJourney`), so a sentence written over
   * creatures the class will never be shown is a model call spent on nothing
   * — `doorLineFacts` already returns null for empty evidence; this is the
   * same "nothing to show, no model call" law, applied before the evidence is
   * even resolved rather than after.
   */
  const doorLine = lessonCast && shouldShowDoorEvidence(groundedSession)
    ? await draftDoorLine(
        doorLineFacts({
          evidence: resolveDoor({
            members: lessonCast.members,
            located: lessonCast.located,
            placeName: lessonCast.placeName,
            topic: primaryTopic,
          }),
          lessonTitle: groundedSession.title,
          lexicon: await speciesLexicon(),
        }),
        // The reader's own English, the same one the session above was
        // localized into (#393). Without it the page renders an authored
        // lesson saying "bugs" beside a drafted sentence saying "minibeasts".
        locale
      ).catch(() => null)
    : null;

  /**
   * The lesson is one scrolled screen now (nc#232, ruling R14). Johan: "this
   * should likeluy be 2 screens 1 pre class with all the info and 1 the lesson
   * screen where this and other things are found".
   *
   * REVERTED TO THE PAGED PATH, Johan 2026-08-17 evening: "Can we revert to
   * the old path with next buttons instead of the scroll?" after walking both.
   * The paged runner (clock, resume, settle ritual, completion logging) is the
   * default again; the scrolled journey stays reachable at `?run=scroll` for
   * the side-by-side while Sophia prototypes the page-per-section hybrid
   * (next button starts a new page: settle → runner → circle → close).
   */
  /**
   * The session's glossary, live in every mode (#350).
   *
   * Wrapped HERE rather than inside a runner, because there are three of them:
   * the hybrid journey is the default, the legacy paged runner is
   * `?run=legacy`, and the scrolled journey is `?run=scroll`. Wiring the
   * provider into one of those would have shipped the feature to the mode
   * nobody uses — the first pass of this did exactly that, into `Runner`.
   *
   * Ambient rather than a `renderBlock` argument, so the engine registry stays
   * "one schema entry plus one renderer file". A session with no glossary
   * provides an empty list, which every renderer already handles by rendering
   * its text plain.
   */
  const glossary = groundedSession.primer?.glossary;

  /**
   * The recordings this lesson's spoken lines have (nc#358). Resolved here, on
   * the server, from a manifest keyed on the lines themselves: the runner gets
   * a handful of entries rather than the whole corpus, and the client never
   * hashes or matches anything. Absent lines are simply absent, which is what
   * a lesson looks like before the synthesis script has been run for it.
   *
   * Given the GROUNDED session on purpose, so what is looked up is what the
   * page will actually render.
   */
  const spokenAudio = spokenAudioForSession(groundedSession);

  /**
   * The narrated preview for this lesson (nc#515), or null when none of it has
   * been voiced — in which case the doorway shows no Preview row at all.
   *
   * Resolved from the GROUNDED, localized, place-adapted session on purpose,
   * so what is looked up is what the deck will actually put on screen. The
   * clip key is content-addressed over the words, so a place pack that swaps
   * an instruction retires that card's recording rather than speaking the
   * London version over the Miami one.
   */
  const preview = previewForSession(groundedSession);

  if (runMode === "scroll") {
    return (
      <GlossaryProvider terms={glossary}>
      <GroupNounProvider noun={runGroupNoun}>
      <RunScopeProvider scope={runScope}>
      <LessonScroll
        ability={classBand ?? undefined}
        homeHref={homeHref}
        session={groundedSession}
        locale={locale}
        logTo={logTo}
        media={media}
        nextTitle={nextTitle}
      />
      </RunScopeProvider>
      </GroupNounProvider>
      </GlossaryProvider>
    );
  }

  /**
   * THE HYBRID JOURNEY IS THE DEFAULT (nc#302, Johan's pick after the
   * three-way walk): a next button starts each section's own page. The two
   * predecessors stay for the side-by-side he asked to keep — the paged
   * legacy runner at `?run=legacy`, the scrolled journey at `?run=scroll`.
   */
  if (runMode !== "legacy") {
    return (
      <GlossaryProvider terms={glossary}>
      <GroupNounProvider noun={runGroupNoun}>
      <RunScopeProvider scope={runScope}>
      <HybridJourney
        key={`${ownerScope ?? "unowned"}:${session.id}:${start === "indoors" || start === "outside" ? start : "default"}`}
        introductionSetting={start === "indoors" || start === "outside" ? start : undefined}
        exampleNote={exampleNote}
        autoResume={shouldAutoResume(resume)}
        ability={classBand ?? undefined}
        assistEnabled={Boolean(teacher) && isModelAvailable()}
        audio={spokenAudio}
        cast={lessonCast}
        doorLine={doorLine}
        // The hinge (#323): the authored line for a day like this one, or
        // null on an ordinary day. Read off the same grounded reading the
        // conditions line came from, so the two can never disagree about the
        // weather. Shown on the introduction's day screen (#1004, beat 2).
        hinge={resolveHinge(session, grounded.conditions ?? [])}
        hazards={hazards}
        homeHref={homeHref}
        locale={locale}
        logTo={logTo}
        media={media}
        nextTitle={nextTitle}
        offlineAvailable={curriculumPosition(session.id) !== null}
        ownerScope={ownerScope}
        previewSeconds={preview?.seconds ?? null}
        session={groundedSession}
      />
      </RunScopeProvider>
      </GroupNounProvider>
      </GlossaryProvider>
    );
  }

  return (
    <GlossaryProvider terms={glossary}>
    <GroupNounProvider noun={runGroupNoun}>
    <RunScopeProvider scope={runScope}>
    {/*
     * `key` is the fix for #125, and it is load-bearing.
     *
     * `/run?session=A` and `/run?session=B` are the SAME route. When only the
     * search param changes, React reconciles the same `Runner` element in the
     * same position and KEEPS its state: the stage, the page position, the
     * stopwatch's start, the ability band, the condition variant and the
     * settled beat. The teacher picks a different session and gets
     * its words wearing the last session's run — the doorstep skipped, the
     * clock still counting from the session before, dropped into the middle of
     * a lesson that has not begun. Worse, the position-saving effect then
     * writes the OLD session's place under the NEW session's storage key, so
     * the wrong place sticks across reloads.
     *
     * Keying on the session id makes a session change an unmount and a fresh
     * mount, which is what a session change is. It also means `session.id` can
     * never change inside a mounted Runner, so every effect in that file gets
     * to assume one session for its whole life.
     *
     * Do not reach for a state-reset effect instead: that is the same bug with
     * more places to forget a field.
     */}
    <Runner
      key={`${ownerScope ?? "unowned"}:${session.id}`}
      session={groundedSession}
      ownerScope={ownerScope}
      logTo={logTo}
      nextTitle={nextTitle}
      cast={lessonCast}
      profileTopic={primaryTopic}
      assistantAvailable={Boolean(teacher) && isModelAvailable()}
      classBand={classBand}
      homeHref={homeHref}
      locale={locale}
      media={media}
      autoResume={shouldAutoResume(resume)}
    />
    </RunScopeProvider>
    </GroupNounProvider>
    </GlossaryProvider>
  );
}

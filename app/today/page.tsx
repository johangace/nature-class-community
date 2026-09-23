import { requestLocale } from "@/lib/request-locale";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { curriculumSequence, nextUnled } from "@/lib/curriculum";
import { groundsToHabitats } from "@/lib/outside/grounds";
import {
  formatLocaleDate,
  localizeDeep,
} from "@/lib/localization";
import { abilityLabel, resolveAbility } from "@/lib/ability";
import { projectLessonJourney } from "@/lib/lesson/journey";
import type { TodayReadQuery } from "@/lib/outside/today";
import {
  completedSessionIds,
  getActiveClass,
  getTeacher,
} from "@/lib/teacher";
import { TodayDay, TodayDoor } from "../TodayDay";
import { TodayClock } from "./TodayClock";
import { approximateLocalTime, greetingFor } from "@/lib/greeting";
import { AppNav } from "../AppNav";
import { IdentifyTeacher } from "../Analytics";
import { isInternalTeacher } from "@/lib/analytics/events";
import { teacherInviteCohort } from "@/lib/invite-cohort";
import { CompletionQueueDrain } from "../run/CompletionQueueDrain";
import { PreparationGlyph } from "../session/PreparationGlyph";
import { lessonHref } from "../session/lesson-links";
import styles from "../today.module.css";

/**
 * TODAY (/today) — the teacher home, rebuilt on nc#323 and given its own
 * address on nc#871 so the public landing remains available at `/`.
 *
 * Johan, after reading Sophia's three directions: *"agree starting with
 * weather similar to A. but it has to be more visual like B. i think there is
 * a world where these 2 could coexist and be even better than what it is
 * showing right now.. build it. then the second part could be more"*.
 *
 * So this is A's structure with B's window on top of it, in one column, in the
 * order of the thought:
 *
 *   1. THE WINDOW. A photograph of somewhere within a couple of kilometres,
 *      at a size that makes the app about a place instead of about a
 *      schedule. It falls to a photographed observation near this school,
 *      then to a drawing of the readings, then to nothing at all, and every
 *      step down rewrites its own claim rather than inheriting the one above.
 *   2. THE READ. This morning as a sentence, the one adjustment worth making,
 *      and THE HINGE — the authored line that only exists on days when the day
 *      and the lesson actually meet. Then the instrument row, because a
 *      sentence is slower to read in glare than a number.
 *   3. THE LESSON, on its own ground. Johan: "the second part could be more".
 *      More presence from a ground and the air around it, more substance from
 *      pack fields this screen has never shown, and no more chrome.
 *   4. What has been seen near here, one claim and one caption, then the way
 *      through to the rest of the read, then the tally.
 *
 * ── WHAT THIS DELETES ──────────────────────────────────────────────────────
 *
 * The two-card stack and the idea that the read and the lesson are separate
 * objects. The "outside now" eyebrow on both the card and the invite. The
 * paired "seen near your school" / "usually around here" captions, replaced by
 * showing one claim rather than by captioning two neutrally. The wordmark row,
 * which spent the most valuable line on the screen telling a teacher which app
 * she had opened.
 *
 * ── THE STREAMING TRADE, STATED ────────────────────────────────────────────
 *
 * The read is behind a Suspense boundary with a NULL fallback, so the lesson
 * paints immediately and the window arrives above it. Pointmoon's own budget
 * is ten seconds and Wikimedia's is five, and a blank home screen for either
 * of those is not a trade worth making for a teacher standing at a door.
 *
 * The fallback is null rather than a hold, because every hold available here
 * is a placeholder: a reserved 300px collapses to nothing when no photograph
 * came back, and a "checking outside" line is furniture about our instruments
 * on the row she reads first. Both reads are cached (fifteen minutes and an
 * hour), so the shift is a cold-path event, not the ordinary morning. If that
 * turns out to be wrong in front of a real teacher, the fix is to reserve the
 * window's height, not to add a skeleton.
 */
export const dynamic = "force-dynamic";

/**
 * THE HOLD, AND WHY IT REPLACED `fallback={null}` (#355).
 *
 * Johan, on the running app: *"the experience refreshes and is empty on every
 * reload.. and looks broken"*, then *"just like shimmering cards if you are in
 * doubt"*.
 *
 * MEASURED, NOT ASSUMED, BECAUSE THE TWO CAUSES HAVE OPPOSITE FIXES. If the
 * reads were failing, a shimmer would turn a visible bug into a permanent
 * pretty spinner. They are not: the page answers 200 with a real composed
 * sentence, real species and their credits intact. Timed against a cold dev
 * process, the shell (date and lesson) arrived at 15.39s and the streamed read
 * at 16.81s — so for that window the page WAS the date and the lesson with two
 * zero-height holes above them, and the lesson then jumped down when they
 * filled. That is exactly what "empty on every reload and looks broken"
 * describes, and it is wider on a real class: Pointmoon's own budget is ten
 * seconds and the seasonal read is seventeen API calls.
 *
 * The doc comment on this file pre-registered this fix and then guessed wrong
 * about whether it would be needed: *"If that turns out to be wrong in front
 * of a real teacher, the fix is to reserve the height."* It was wrong, in
 * front of the only teacher we have.
 *
 * WHAT KEEPS IT HONEST. A shimmer says something is loading; it never says a
 * value. No bar shaped like a temperature that resolves into a different
 * temperature, no placeholder names. And it cannot outlive the data, by
 * construction rather than by care: these ARE the Suspense fallbacks, so they
 * are gone the instant the boundary resolves — whether it resolved to a block
 * or to nothing at all. A block with nothing to say still collapses.
 *
 * It is not a return of card fills. `.hold*` is a transient tone on the
 * ground with the finished blocks' own radii and gaps, and nothing on the
 * resolved page has a ground of its own.
 */
function DayHold() {
  return (
    <div className={styles.hold} role="status" aria-busy="true" aria-live="polite">
      <span className={styles.srOnlyHold}>Reading the day.</span>
      <div className={styles.holdDay} />
    </div>
  );
}

function DoorHold() {
  return (
    <div className={styles.doorHold} role="status" aria-busy="true">
      <span className={styles.srOnlyHold}>Opening the local nature read.</span>
    </div>
  );
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams?: Promise<{ locale?: string }>;
}) {
  const teacher = await getTeacher();

  // Today is a teacher workspace. Keep this guard before every curriculum,
  // class and outside read so a signed-out request cannot reach teacher data.
  // The public explanation now has one stable address at `/` (#871).
  if (!teacher) redirect("/sign-in");

  const active = await getActiveClass(teacher.id);

  // First run: a signed-in teacher with no class is sent into the /start flow
  // to wake up their patch, not left on a settings-linking welcome card.
  if (!active) redirect("/start");

  const led = await completedSessionIds(active.id);

  // THE ONE CURRICULUM SEQUENCE (#55). Today used to pick the first unled
  // session out of `leadPack()`'s single season pack and wrap straight back
  // to that pack's own session one once its four were led — the other two
  // shelf packs, eight more sessions, were never reachable from here. This
  // walks every shelf pack end to end (lib/curriculum.ts) and takes the
  // first stop this class has not led, wherever in the year that actually is.
  const sequence = curriculumSequence({ lat: active.lat ?? null });
  const { entry: upNext } = nextUnled(led, sequence);
  // Every session led is a real, honest state, not a bug to paper over: it
  // still needs a session on screen to enter, so the sequence's own first
  // stop stands in — Season is where she'd pick a deliberate repeat instead.
  const stop = upNext ?? sequence[0] ?? null;
  if (!stop) throw new Error("Curriculum has no sessions");
  const { pack, session } = stop;

  const located = typeof active.lat === "number" && typeof active.lng === "number";
  // The read follows today's lesson (#161): a bugs day leads with insects, a
  // trees day with plants. Untagged sessions get the ungrouped read.
  const topicTags = session.topicTags ?? [];

  // Her grounds, as deterministic habitat filters on what's eligible to show
  // (#54). `getActiveClass` already carries them in `learnerContext.siteProfile`
  // — the same field `reachableHabitatsFor` (lib/place-context.ts) reads for
  // the runner — so this costs no extra query. Empty/undefined habitats filter
  // nothing, exactly as before grounds existed.
  const reachable = groundsToHabitats(
    active.learnerContext.siteProfile?.grounds ?? []
  );

  const locale = await requestLocale(
    (await searchParams)?.locale,
    located ? { lat: active.lat, lng: active.lng } : null
  );
  const localizedSession = localizeDeep(session, locale);
  const lesson = projectLessonJourney(pack, localizedSession);
  const activeBand = resolveAbility({ classBand: active.abilityBand, yearGroup: active.yearGroup }).band;
  const classLevel = activeBand ? abilityLabel(activeBand, locale) : null;

  // The first paint's clock: the school's, approximated from its longitude,
  // never the server's. The device takes over on mount (TodayClock).
  const schoolNow = approximateLocalTime(new Date(), located ? active.lng : null);
  const greeting = greetingFor(schoolNow.getUTCHours());
  const dateLine = formatLocaleDate(schoolNow, locale, "UTC");

  // ONE query object, handed to every read boundary. `getTodayRead` is wrapped in
  // React's `cache`, which keys on argument identity: build this twice and the
  // whole composition runs twice.
  const todayQuery: TodayReadQuery = {
    topicTags,
    locale,
    habitats: reachable.length > 0 ? reachable : undefined,
  };

  return (
    <main className={styles.today}>
      <CompletionQueueDrain classId={active.id} />
      <IdentifyTeacher
        teacherId={teacher.id}
        hasClass
        locale={locale}
        internal={isInternalTeacher(teacher.email)}
        inviteCohort={await teacherInviteCohort(teacher.id)}
      />
      <AppNav place={{ id: active.id, groupType: active.groupType, name: active.name, groundsName: located ? active.groundsName : "location not set" }} />

      {/* THE LANDSCAPE LAYOUT, AND ITS ENTIRE MARKUP COST (#341).
          `.nc-main` is a plain block in portrait, so nothing here changes the
          portrait page at all. In landscape one media query turns it into two
          columns — what it is like out there on the left, what you are doing
          about it on the right — and part two spans both underneath, which is
          why it is a direct child of `.nc-main` rather than living inside the
          second column. A landscape iPad is short and wide: this is 299px of
          clear air under the lesson instead of fourteen. */}
      {/* THE ARRANGEMENT JOHAN ASKED FOR (#341).
          "the Daily lesson card should be big and its own.. swap places with
          the species card.. so species should be on the right of the weather
          and the lesson card big under".

          The previous pass put the day beside the LESSON to solve a landscape
          height problem, and that cost the lesson its status — it read as a
          column, one of two equal things. It is the only object on this page a
          teacher acts on, so it is the largest.

          Row one is the two small reads side by side; row two is the lesson,
          full width, its own. DOM order is the visual order in both
          orientations, so nothing depends on a grid reordering that a screen
          reader would not follow. */}
      {/* THE ARRANGEMENT, FROM THE OLD PROTOTYPE (#355).
          Johan: "maybe the sentence above then weather then the species
          smaller with the button". The sentence leads at full width, the two
          smaller reads sit beneath it, and the lesson keeps the full width and
          the page's primary outline.

          The prototype's ARRANGEMENT only. It puts each block in its own
          tinted card; the one-ground ruling is what got this redesign accepted
          and it stands, so the grounds stay one and only the placement moves.

          The day and the row are direct grid children rather than wrapped in
          columns, because the sentence above them has to span both and a
          wrapper would trap it in one. DOM order is the visual order in every
          orientation. */}
      <div className={styles.main}>
        {/* ONE LINE: THE GREETING LEFT, THE WEATHER RIGHT (2026-09-02).
            Johan: "put this in one line, weather on the right". The greeting
            and the date moved in here from above `.main` so they and the sky
            block can share one flex row; the sentence under the weather wraps
            to the full measure beneath both. */}
        <div className={styles.top}>
        {/* THE GREETING AND THE DATE ARE READ, NOT TYPED (2026-09-07).
            Johan, at noon: "good morning is stale now is midday". The server
            paints its best guess from the school's longitude; the device in
            her hand corrects it on mount and keeps it right while the page
            stays open across a morning. See lib/greeting.ts. */}
        <TodayClock locale={locale} greeting={greeting} dateLine={dateLine} />
        {!located ? (
          /* A class exists but has no coordinates: invite, never borrow. */
          <section className={styles.invite}>
            <h2 className={styles.inviteHead}>
              Add your location to see today&rsquo;s conditions and recorded
              local observations.
            </h2>
          </section>
        ) : (
          <Suspense fallback={<DayHold />}>
            <TodayDay query={todayQuery} showReadLabel={false} />
          </Suspense>
        )}
        </div>

        {/* This is a doorway into the live local read, so it sits with the
            weather rather than inside the lesson card. The compact face stack
            previews what is behind the button without becoming another row. */}
        {located && (
          <Suspense fallback={<DoorHold />}>
            <TodayDoor query={todayQuery} sessionId={session.id} />
          </Suspense>
        )}

        <section className={styles.lesson}>
          <p className={styles.eyebrow}>Today's session</p>
          <h1 className={styles.title}>{lesson.title}</h1>
          <div className={styles.lessonMeta}>
            <p className={styles.meta}>
              {lesson.durationMinutes} min{classLevel ? ` · ${classLevel}` : ""}
            </p>
            {localizedSession.labels?.length ? (
              <ul className={styles.subjectTags} aria-label="Subjects">
                {localizedSession.labels.map((label) => (
                  <li key={label}>{label.charAt(0).toUpperCase() + label.slice(1)}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <p className={styles.topic}>
            {localizedSession.childWorkSummary || localizedSession.topic}
          </p>
          <div className={styles.sessionActions}>
            <Link className={styles.start} href={lessonHref("/session", session.id, locale)}>
              <PreparationGlyph name="primer" />
              <span>View session</span>
            </Link>
            <Link className={styles.runSession} href={lessonHref("/run", session.id, locale)}>
              <PreparationGlyph name="door" />
              <span>Run session</span>
            </Link>
          </div>
        </section>

        {/* The tally is gone from this screen: it was our impact number, not
            her morning. It reads on /classes under the active class's name. */}
      </div>

      {/* Temporary while real teachers test (#644): the one quiet door to
          /feedback on the daily surface. Removing the feature = this line,
          the Classes twin, and the /feedback folder. */}
      <p className={styles.feedbackFoot}>
        <Link href="/feedback">Send feedback</Link>
      </p>
    </main>
  );
}

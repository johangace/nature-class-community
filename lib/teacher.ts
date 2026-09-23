import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { fixtureLocation } from "@/lib/outside/pointmoon";
import { getTryPlace } from "@/lib/try-place-server";
import { learnerContextForClass } from "@/lib/learner-context";
import { packKeyValues, resolvePackKeyChain } from "@/lib/pack-key";
import { canonicalSessionId, loadAllPacks, RETIRED_SESSION_IDS } from "@/lib/pack";
import type { LearnerContext } from "@/schema/bioregion";
import { groundsPlaceForClass, groundsPlaceSelect } from "@/lib/grounds";

/**
 * Server-side helpers for the signed-in teacher: who is here, which class is
 * active, and the class's running total of child-minutes outside.
 *
 * The active class is one httpOnly cookie holding a class id — never trusted
 * on its own: every read joins it back to the signed-in teacher, so a stale
 * or foreign cookie resolves to null instead of someone else's class. The
 * cold-URL demo path calls none of this; every helper returns null cleanly
 * when signed out, and the public surfaces render exactly as before.
 */

export const ACTIVE_CLASS_COOKIE = "nc-class";

/**
 * The /start flow's "I am mid-flow" marker: the id of the class this flow
 * created on its location step.
 *
 * /start bounces a teacher who already has a class, because the flow is
 * first-run only. But the flow creates the class two screens before it ends,
 * and that write refreshes the route the teacher is standing on, so the guard
 * fired on the class the flow itself had just made and ejected them to Today
 * with screens 5 and 6 never rendered (#94). This marker is how the guard
 * tells "arrived fresh, already has a class" from "mid-flow, just made one".
 *
 * It holds a class id rather than a flag, so it cannot wedge anyone: if it
 * points at anything other than the current active class, the guard bounces
 * exactly as it always did. It is short-lived for the same reason, so an
 * abandoned flow stops being mid-flow on its own within the sitting.
 */
export const START_FLOW_COOKIE = "nc-start-flow";

/** One sitting, generously. Long enough to set up a class, short enough to heal. */
export const START_FLOW_MAX_AGE = 60 * 60 * 2;

export interface Teacher {
  id: string;
  email: string;
  name: string | null;
}

export async function getTeacher(): Promise<Teacher | null> {
  // The demo path must survive everything: if the session lookup fails for
  // any reason (database unreachable, stale cookie), the page renders
  // signed-out rather than crashing. Paper-grade resilience, on screen.
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return null;
    const { id, email, name } = session.user;
    return { id, email, name: name ?? null };
  } catch {
    return null;
  }
}

/**
 * Whether this teacher already has a passkey saved. The offer surfaces used to
 * gate on `window.PublicKeyCredential` alone, so a teacher who turned it on
 * during onboarding was offered it again on Today; Better Auth then sends the
 * existing credentials as excludeCredentials, the browser refuses the
 * duplicate, and the offer silently reset. Asking the server first means we
 * stop offering rather than fail interestingly.
 *
 * One indexed lookup on a table with one row per device. Failure answers
 * false, in the same paper-grade spirit as getTeacher above: the worst case is
 * offering an enrolment the teacher can decline, never a broken Today.
 */
export async function teacherHasPasskey(): Promise<boolean> {
  try {
    const saved = await auth.api.listPasskeys({ headers: await headers() });
    return Array.isArray(saved) && saved.length > 0;
  } catch {
    return false;
  }
}

export interface ActiveClass {
  /** Stored choice before year-group derivation, for resolution provenance. */
  abilityBand?: string | null;
  /** Null/absent means follow the school location. */
  englishLocale?: string | null;
  id: string;
  name: string;
  yearGroup: string;
  groupType?: string | null;
  ageRange?: string | null;
  school: string;
  /** The reusable Grounds profile currently supplying this class's place. */
  groundsName: string;
  lat: number | null;
  lng: number | null;
  /**
   * The class's stored climate tag, when it has one. Carried so every surface
   * reads the same phenology region: a Sonoran school whose coordinates fall
   * inside a Rockies box must not meet a mountain cast on the daily card and a
   * desert one in the lesson. Null for a class saved before the tag existed,
   * and then the region is derived from the coordinates exactly as before.
   */
  climate: string | null;
  /** Optional setup detail carried from the same Grounds read as location. */
  siteFeatures: string[];
  /** How far this class can actually travel during a lesson, when recorded. */
  reach: string | null;
  /**
   * The class's LearnerContext (#205): who is being taught and under what
   * rules, composed once here so every surface reads the same answer instead
   * of re-deriving an ability band from a year group in three places.
   *
   * In wave 1 most of it is null, and null is a declared-empty slot rather
   * than a missing one — the surfaces render silence for it, which is what
   * they already do everywhere else honesty is at stake.
   */
  learnerContext: LearnerContext;
  /**
   * The lookup chain a habitat-bearing instruction resolves through for this
   * class, most specific key first, `global` last (#207, and the full chain
   * from J4's fallback resolver in lib/pack-key.ts).
   *
   * Koppen group, then latitude band, then global. The polygon link is absent
   * because J4 deferred the framework, and it is absent rather than faked. A
   * class with no coordinates and no climate tag gets `["global"]`, which
   * resolves to the authored base text.
   */
  packKeyChain: string[];
}

/**
 * How recently a class was TOUCHED, as a millisecond stamp, for the
 * cookie-less fallback below (#653).
 *
 * Nothing in the schema records "last opened" — there is no lastUsedAt column
 * and adding one is a migration, so this is composed from the two stamps that
 * already exist and already mean something:
 *
 *   - the most recent session this class LED (`SessionCompletion.startedAt`),
 *     which is the only row in the whole schema written by using a class
 *     rather than by editing one; and
 *   - `Class.updatedAt`, which every teacher-driven write to the class row
 *     moves — created in /start, renamed, located, its grounds and its world
 *     saved (app/start/actions.ts, app/classes/actions.ts). Nothing background
 *     writes to a class row today, so this is her edit, not a cron's.
 *
 * The later of the two wins. Neither alone is enough: a class made this
 * morning has led nothing, and a class led every week since September has not
 * been edited since September. `updatedAt` is never null and defaults to
 * `createdAt` on a row nobody has edited, so a brand-new class still has an
 * honest stamp — createdAt is the floor of this value rather than a separate
 * case to handle.
 */
function lastTouched(row: {
  updatedAt: Date;
  completions: { startedAt: Date }[];
}): number {
  const edited = row.updatedAt.getTime();
  const led = row.completions[0]?.startedAt.getTime();
  return led !== undefined && led > edited ? led : edited;
}

/**
 * The teacher's active class: the cookie joined to ownership, or — when there
 * is no valid cookie — the class she most recently touched.
 *
 * WHY THE FALLBACK IS NOT "HER ONLY CLASS" ANY MORE (#653). Sign-out drops the
 * cookie on purpose, because a shared iPad must not carry one teacher's class
 * into the next teacher's morning. This fell back to a class only when the
 * teacher had EXACTLY ONE, so a teacher with two or more got `null` on every
 * single sign-in — and `null` is what `/` reads as "first run", so it sent her
 * into the /start wizard, world builder and all, every time she signed in.
 * Worse, /start's own guard reads the same `null`, so it did not bounce her
 * back out, and finishing the flow minted a DUPLICATE CLASS.
 *
 * `null` now means what `/` has always thought it meant: this teacher has no
 * classes at all. The cookie stays authoritative whenever it is present and
 * resolves to a class she owns, so choosing a class, deleting one, and
 * switching between them are all untouched.
 */
export async function getActiveClass(teacherId: string): Promise<ActiveClass | null> {
  const select = {
    id: true,
    name: true,
    yearGroup: true,
    groupType: true,
    ageRange: true,
    englishLocale: true,
    school: true,
    lat: true,
    lng: true,
    climate: true,
    grounds: true,
    siteFeatures: true,
    siteNotes: true,
    reach: true,
    placeRead: true,
    placeReadAt: true,
    groundsProfile: { select: groundsPlaceSelect },
    abilityBand: true,
    jurisdiction: true,
    sessionShape: true,
  } as const;

  /** One row becomes one ActiveClass. The learner context is composed, never stored. */
  const withLearnerContext = (
    row: {
      id: string;
      name: string;
      yearGroup: string;
      groupType?: string | null;
      ageRange?: string | null;
      englishLocale?: string | null;
      school: string;
      lat: number | null;
      lng: number | null;
      climate: string | null;
      grounds: string[];
      siteFeatures: string[];
      siteNotes: string[];
      reach: string | null;
      placeRead: unknown;
      placeReadAt: Date | null;
      groundsProfile: {
        id: string;
        name: string;
        school: string;
        lat: number | null;
        lng: number | null;
        climate: string | null;
        habitats: string[];
        siteFeatures: string[];
        siteNotes: string[];
        reach: string | null;
        placeRead: unknown;
        placeReadAt: Date | null;
      } | null;
      abilityBand: string | null;
      jurisdiction: string | null;
      sessionShape: string | null;
    } | null
  ): ActiveClass | null => {
    if (!row) return null;
    const place = groundsPlaceForClass(row);
    const {
      grounds,
      siteFeatures,
      siteNotes,
      reach,
      placeRead,
      placeReadAt,
      groundsProfile,
      abilityBand,
      jurisdiction,
      sessionShape,
      ...rest
    } = row;
    return {
      ...rest,
      abilityBand,
      groundsName: place.name,
      lat: place.lat,
      lng: place.lng,
      climate: place.climate,
      siteFeatures: place.siteFeatures,
      reach: place.reach,
      packKeyChain: packKeyValues(
        resolvePackKeyChain({ lat: place.lat, lng: place.lng, climate: place.climate })
      ),
      learnerContext: learnerContextForClass({
        yearGroup: row.yearGroup,
        abilityBand,
        jurisdiction,
        sessionShape,
        grounds: place.habitats,
      }),
    };
  };
  const jar = await cookies();
  const cookieId = jar.get(ACTIVE_CLASS_COOKIE)?.value;
  if (cookieId) {
    const found = await prisma.class.findFirst({
      where: { id: cookieId, teacherId },
      select,
    });
    if (found) return withLearnerContext(found);
  }
  // No (valid) cookie: the class she most recently touched, whichever that is.
  // A teacher has a handful of classes, not a page of them, so this reads them
  // all and picks — the ordering that decides the answer is a max over two
  // stamps (see `lastTouched`), which no single `orderBy` can express. The
  // `orderBy` below is still the tiebreak: rows tied on last-touched keep the
  // most recently edited, then the most recently made, so the answer is stable
  // across requests rather than left to the database's row order.
  const mine = await prisma.class.findMany({
    where: { teacherId },
    select: {
      ...select,
      updatedAt: true,
      completions: {
        select: { startedAt: true },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  // No classes at all — and only this, now, is what `null` means. `/` reads it
  // as first run and opens /start, which is the correct and only first run.
  let best = mine[0];
  if (!best) return null;
  let bestAt = lastTouched(best);
  for (const row of mine) {
    const at = lastTouched(row);
    if (at > bestAt) {
      best = row;
      bestAt = at;
    }
  }
  // The extra stamps are for choosing, never for carrying: ActiveClass is the
  // shape every surface reads, and it does not gain fields because the picker
  // needed them.
  const { updatedAt, completions, ...chosen } = best;
  return withLearnerContext(chosen);
}

/**
 * The location conditions should ground to right now: the signed-in teacher's
 * active class, if it has one set. Null means no signed-in class with a
 * location, and since #1234 that is the end of it: the conditions layer reads
 * nothing rather than falling back to a demo place it could not name. Read
 * server-side only; a class's coordinates are the school's, never a child's.
 */
export async function getActiveClassLocation(): Promise<{
  lat: number;
  lng: number;
} | null> {
  const teacher = await getTeacher();
  // A signed-out visitor who answered the one question on /start reads for
  // the spot she chose (#877). Only signed out: a teacher's class is the
  // place of record, and a leftover cookie must never out-rank it.
  if (!teacher) return (await getTryPlace()) ?? fixtureLocation();
  const active = await getActiveClass(teacher.id);
  if (active && typeof active.lat === "number" && typeof active.lng === "number") {
    return { lat: active.lat, lng: active.lng };
  }
  // DEMO MODE HAS A PLACE, EVEN WITHOUT A CLASS.
  // Production's URL of record is signed out, so this returned null and every
  // locale fell back to the product's native UK voice — the deployed demo
  // showed a Berkeley cast at 23 degrees Celsius, and only ?locale=us fixed
  // it. When a fixture is being served the payload is a read of a real place,
  // so the surfaces read for that place. Null on live traffic, unchanged.
  return fixtureLocation();
}

/**
 * One logged session's real length in minutes, or null if the row cannot say.
 *
 * Null is the honest answer, not zero. It means the stored window is unusable:
 * a missing timestamp, or an end at or before the start (clock skew, a device
 * whose time moved, a runner that reached the finish page without ever having
 * started its clock and posted `startedAt = endedAt`). The caller decides what
 * an unusable window falls back to; it must never be read as "nobody went out".
 */
function elapsedMinutes(completion: {
  startedAt: Date | null;
  endedAt: Date | null;
}): number | null {
  const start = completion.startedAt?.getTime();
  const end = completion.endedAt?.getTime();
  if (start === undefined || end === undefined) return null;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const ms = end - start;
  // Zero and negative are both unusable. Guarding on `> 0` also rejects NaN.
  if (!(ms > 0)) return null;
  return ms / 60_000;
}

/**
 * The child-minutes one logged session credits: minutes outside times the
 * optional headcount the teacher entered, rounded to a whole minute. A blank
 * headcount credits no child-minutes: absence is never guessed or backfilled.
 *
 * The minutes outside are ELAPSED, CAPPED AT PLANNED — `min(elapsed, planned)`.
 * See `classMinutesOutside` below for what that means and why.
 *
 * Exported so the completions route can tell the teacher exactly what her
 * session added: the number on the finish screen is this function, and the
 * class total is the same function summed, so "added N" and the total moving
 * by N can never disagree.
 */
export function completionMinutes(
  completion: {
    startedAt: Date | null;
    endedAt: Date | null;
    headcount: number | null;
  },
  plannedMin: number | undefined
): number {
  if (completion.headcount === null) return 0;
  const elapsed = elapsedMinutes(completion);
  // No usable window: credit what the row has always meant, its planned length.
  if (elapsed === null) return Math.round((plannedMin ?? 0) * completion.headcount);
  // No planned length to cap against: credit the honest elapsed time.
  if (plannedMin === undefined) return Math.round(elapsed * completion.headcount);
  return Math.round(Math.min(elapsed, plannedMin) * completion.headcount);
}

/**
 * THE NORTH-STAR NUMBER, per class: cumulative child-minutes outside. This is
 * the figure Nature Class reports to its funder, so its definition lives here
 * in plain words and does not change without someone reading them first.
 *
 * WHAT IT MEANS. One child, outside, for one minute of a Nature Class session
 * is one child-minute. When a teacher adds a headcount, the logged session
 * credits the minutes the class was actually outside multiplied by that count,
 * rounded to a whole minute. A blank count is excluded rather than guessed.
 *
 * HOW A SESSION'S MINUTES ARE COUNTED: elapsed, capped at planned.
 * `min(elapsed, planned)`, where elapsed is the runner's own honest clock —
 * `endedAt` minus `startedAt` on the completion row, a window the runner has
 * already pushed forward by every paused span before it posts, and the API has
 * already clamped to a length a real lesson can be.
 *
 * WHY IT IS CAPPED, in both directions:
 *  - Capped ABOVE at the session's planned length, so a teacher who forgets to
 *    tap End and closes the tab an hour later does not credit the hour. The
 *    planned length is what she set out to lead; it is a fair ceiling.
 *  - Held DOWN to elapsed when a session ends early, because "End session" is
 *    now one tap away. A thirty-second session credits about half a minute per
 *    child, not the full planned lesson. Before this, it credited the lesson:
 *    a 35-minute session ended at 0:33 recorded 840 child-minutes.
 * A session that runs long is not punished, and a session that barely ran is
 * not rewarded. Neither direction of inflation survives.
 *
 * ROWS WITHOUT USABLE TIMESTAMPS fall back to the session's PLANNED minutes —
 * never to zero. Planned minutes is exactly what such a row has always meant,
 * so an old completion credits today what it credited yesterday and the total
 * cannot visibly drop for a reason nobody can see. A row is unusable when a
 * timestamp is missing or the end is at or before the start.
 *
 * SESSIONS NO LONGER IN THE CATALOGUE have no planned length to cap against,
 * so they credit their elapsed time uncapped. (`packOrder` is append-only for
 * this reason: nothing leaves the shelf, so a teacher's led minutes hold.)
 *
 * Deterministic and ours: no AI, no analytics service, one query over our own
 * table, arithmetic anyone can check by hand.
 */
export async function classMinutesOutside(classId: string): Promise<{
  minutes: number;
  sessionsLed: number;
  countedSessions: number;
}> {
  const completions = await prisma.sessionCompletion.findMany({
    where: { classId, endedAt: { not: null } },
    select: { sessionId: true, headcount: true, startedAt: true, endedAt: true },
  });
  const minutesBySession = sessionMinutes();
  let minutes = 0;
  let countedSessions = 0;
  for (const c of completions) {
    if (c.headcount !== null) countedSessions += 1;
    minutes += completionMinutes(c, minutesBySession.get(c.sessionId));
  }
  return { minutes, sessionsLed: completions.length, countedSessions };
}

/** Session ids this class has logged at least once. Feeds the shelf's led-marks. */
export async function completedSessionIds(classId: string): Promise<Set<string>> {
  const rows = await prisma.sessionCompletion.findMany({
    where: { classId, endedAt: { not: null } },
    select: { sessionId: true },
    distinct: ["sessionId"],
  });
  // Canonicalised (#468): a class that led a session under its old id has led
  // it, and must not be offered it again as the next unled stop.
  return new Set(rows.map((r) => canonicalSessionId(r.sessionId)));
}

/**
 * Planned minutes for every session in the CATALOGUE (not just the shelf),
 * keyed by session id. The session's own `durationMin` — the number a teacher
 * plans around, and the only authored duration on a session — is the cap the
 * minutes-outside tally holds each logged session to. A session held back from
 * the shelf still answers here, so a session led last term keeps its minutes.
 */
export function sessionMinutes(): Map<string, number> {
  const map = new Map<string, number>();
  for (const pack of loadAllPacks()) {
    for (const session of pack.sessions) {
      map.set(session.id, session.durationMin);
    }
  }
  // Retired ids answer with their successor's planned length (#468). Rows
  // written before a rename still carry the old id, and so does a completion
  // queued offline on an iPad that has not reloaded since; both have to find
  // a planned length here or their minutes go uncapped and the completions
  // route calls a real session "unknown".
  for (const [retired, current] of Object.entries(RETIRED_SESSION_IDS)) {
    const planned = map.get(current);
    if (planned !== undefined) map.set(retired, planned);
  }
  return map;
}

/** A saved class preference is independent of whether its school is located. */
export async function getActiveEnglishLocale(): Promise<string | null> {
  const teacher = await getTeacher();
  if (!teacher) return null;
  return (await getActiveClass(teacher.id))?.englishLocale ?? null;
}

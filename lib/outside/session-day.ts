/**
 * THE DAY THIS READ IS FOR (#755).
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * The first real teacher to hold this app (session of
 * 2026-08-31, `docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`):
 * *"weather and stuff like that she can just look from the screen but if the
 * nature card was more steered towards when she is gonna run the class
 * tomorrow or in another day might be more beneficial"*. She walks the terrain
 * the day BEFORE the class. The daily card was answering a question she had
 * already answered by looking out of a window, and not answering the one she
 * came with.
 *
 * ── THE TRAP THIS MODULE EXISTS TO CLOSE ───────────────────────────────────
 *
 * `getOutsideBrief` and `getOutsideNow` already take a `date`, and it already
 * moves the seasonal read: phenology resolves on the week of that date. But
 * `fetchFieldTruth` has NO date. It reads one point at one moment, and there
 * is no forecast anywhere in the contract (`lib/outside/pointmoon.ts` —
 * `weather.current`, `time.windows.daylightMinutesRemaining`, one
 * `astronomy` block for the day being asked about).
 *
 * So the naive version of this ticket — pass next Thursday's date to the
 * brief — produces the exact failure this repo forbids: Thursday's phenology
 * under Thursday's name, with THIS MORNING'S temperature, ground, sunset and
 * light-left printed beside it as though they were Thursday's. Nobody would
 * see the seam. That is inventing nature, and the fix is not a warning label,
 * it is a partition.
 *
 * ── THE PARTITION ──────────────────────────────────────────────────────────
 *
 * Every reading on the outside surfaces is one of two things, and this module
 * is where that is written down:
 *
 *   `the-hour`   read for the moment it was asked for, at one point. The sky,
 *                the felt temperature, the ground underfoot, minutes of light
 *                left, sunrise, sunset, the moon, and everything composed from
 *                them (the day read, the adjustment, the authored hinge that
 *                keys off the condition). NONE of it survives being pointed at
 *                a day that is not today.
 *
 *   `the-season` read for a WEEK and a region. Regional phenology, and the
 *                record of what has actually been photographed near the school
 *                lately. Both hold for a day next week as well as for this
 *                one, because neither was ever a claim about an hour.
 *
 * A future day therefore gets a SHORTER page, and it says why. Not a hedge,
 * not a greyed-out tile with today's number in it: the readings are absent,
 * and one sentence names what is absent and what is not.
 *
 * ── SIX DAYS, AND THE REASON IS THE WEEKDAY NAME ───────────────────────────
 *
 * The horizon is today plus six, which is one full week of DISTINCT weekday
 * names. At seven the label would read "Monday" on a Monday and mean the other
 * Monday, and a day chooser whose labels repeat is a chooser that can be
 * misread. A request beyond the horizon is refused rather than clamped to the
 * furthest day we do hold: snapping "the 30th" onto "Friday" would answer a
 * question nobody asked, in silence.
 *
 * ── LOCAL DAYS, STATED ─────────────────────────────────────────────────────
 *
 * All arithmetic here is on the reader's LOCAL calendar day, which is the same
 * basis `app/page.tsx` already prints its date line on. The school's own
 * timezone travels in the Pointmoon payload (`time.timezone`) and is not
 * consulted, so a server in one zone and a school in another can disagree
 * about which day "today" is by a few hours either side of midnight. That is
 * a known and bounded limit, recorded rather than papered over; closing it
 * means keying the day off the class's stored location, which is its own
 * ticket.
 */

import {
  formatLocaleDate,
  INTL_LOCALE,
  type Locale,
} from "@/lib/localization";

/**
 * How far ahead a teacher may point this read. Today plus six, which is one
 * week of distinct weekday names. See the header for why not seven.
 */
export const SESSION_DAY_HORIZON_DAYS = 6;

const MS_PER_DAY = 24 * 60 * 60 * 1_000;

/** One day this read can be pointed at, already named in the reader's words. */
export interface SessionDay {
  /** Local NOON of the day. What the seasonal reads are resolved on, and noon
   *  rather than midnight for the reason `atNoon` below records. */
  date: Date;
  /** "2026-09-03". What a link carries, and the only shape `?for=` accepts. */
  iso: string;
  /** Whole local calendar days from the reader's today. 0 is today. */
  offsetDays: number;
  /** How a sentence names it: "today", "tomorrow", "Thursday". */
  shortLabel: string;
  /** How a clause names it: "today", "tomorrow", "on Thursday". */
  whenLabel: string;
  /** How a heading names it: "today", "tomorrow", "Thursday 3 September". */
  label: string;
  /** How the chooser names it: "Today", "Tomorrow", "Thu 3". */
  chipLabel: string;
  /**
   * True when a day WAS asked for and this is not it, because it had already
   * gone or was past the horizon. The surface says so rather than quietly
   * serving today under a heading the teacher did not choose.
   */
  outOfReach: boolean;
}

/** What a reading is OF, and therefore which days it may be shown under. */
export type ReadingReach = "the-hour" | "the-season";

/** Local midnight of whatever day this instant falls in. */
export function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

/** "2026-09-03" from a local date. Never a UTC slice of an ISO string. */
export function toIsoDay(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * "2026-09-03" back to a local date, or null.
 *
 * Null for anything that is not exactly that shape, and null for a date that
 * does not exist: `new Date(2026, 1, 31)` rolls into March without complaint,
 * which is how "31 February" would come back as a real day with a real
 * phenology week behind it. A day nobody can stand in is not a day.
 */
export function parseIsoDay(raw: string | null | undefined): Date | null {
  if (typeof raw !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function weekday(date: Date, locale: Locale): string {
  return date.toLocaleDateString(INTL_LOCALE[locale], { weekday: "long" });
}

function named(date: Date, locale: Locale): string {
  return formatLocaleDate(date, locale);
}

function chip(date: Date, locale: Locale): string {
  return date.toLocaleDateString(INTL_LOCALE[locale], {
    weekday: "short",
    day: "numeric",
  });
}

/**
 * LOCAL NOON, NOT LOCAL MIDNIGHT, AND IT IS NOT A DETAIL.
 *
 * `SessionDay.date` is handed to the seasonal reads, and `weekOfYear`
 * (lib/outside/phenology.ts) counts days in UTC. Local midnight in any zone
 * east of UTC serialises to 23:00 on the PREVIOUS UTC day, so a Monday could
 * resolve the previous week's phenology on a server that is not in UTC. Noon
 * has twelve hours of slack either way, which also carries it through a clock
 * change unharmed.
 */
function atNoon(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
}

function describe(
  date: Date,
  offsetDays: number,
  locale: Locale,
  outOfReach: boolean
): SessionDay {
  const base = {
    date: atNoon(date),
    iso: toIsoDay(date),
    offsetDays,
    outOfReach,
  };
  if (offsetDays === 0) {
    return {
      ...base,
      shortLabel: "today",
      whenLabel: "today",
      label: "today",
      chipLabel: "Today",
    };
  }
  if (offsetDays === 1) {
    return {
      ...base,
      shortLabel: "tomorrow",
      whenLabel: "tomorrow",
      label: "tomorrow",
      chipLabel: "Tomorrow",
    };
  }
  const day = weekday(date, locale);
  return {
    ...base,
    shortLabel: day,
    whenLabel: `on ${day}`,
    label: named(date, locale),
    chipLabel: chip(date, locale),
  };
}

export interface ResolveSessionDayInput {
  /** `?for=` as it arrived, or a date a caller already holds. */
  requested?: string | Date | null;
  /** The instant "today" is measured from. Injectable so this is testable. */
  now?: Date;
  locale?: Locale;
  horizonDays?: number;
}

/**
 * Which day this read is for.
 *
 * Nothing is guessed. An unparseable, past or too-distant request resolves to
 * today and says it was refused; it never becomes the nearest day we happen to
 * hold.
 */
export function resolveSessionDay(input: ResolveSessionDayInput = {}): SessionDay {
  const {
    requested = null,
    now = new Date(),
    locale = "uk",
    horizonDays = SESSION_DAY_HORIZON_DAYS,
  } = input;

  const today = startOfLocalDay(now);
  const asked =
    requested instanceof Date
      ? Number.isFinite(requested.getTime())
        ? startOfLocalDay(requested)
        : null
      : parseIsoDay(requested);

  if (!asked) return describe(today, 0, locale, false);

  const offsetDays = Math.round((asked.getTime() - today.getTime()) / MS_PER_DAY);
  if (offsetDays === 0) return describe(today, 0, locale, false);
  if (offsetDays < 0 || offsetDays > horizonDays) {
    return describe(today, 0, locale, true);
  }
  return describe(asked, offsetDays, locale, false);
}

/**
 * The day after today.
 *
 * Its own function rather than `sessionDayOptions(...)[1]` because that index
 * is only tomorrow while the horizon is greater than zero, and a surface
 * linking to "tomorrow" should not depend on the length of a list it did not
 * ask for. The date arithmetic goes through the local calendar so a clock
 * change does not make tomorrow arrive twice or not at all.
 */
export function nextDay(
  input: Omit<ResolveSessionDayInput, "requested" | "horizonDays"> = {}
): SessionDay {
  const { now = new Date(), locale = "uk" } = input;
  const today = startOfLocalDay(now);
  const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return describe(date, 1, locale, false);
}

/** Today and every day inside the horizon, in order, for the day chooser. */
export function sessionDayOptions(
  input: Omit<ResolveSessionDayInput, "requested"> = {}
): SessionDay[] {
  const { now = new Date(), locale = "uk", horizonDays = SESSION_DAY_HORIZON_DAYS } = input;
  const today = startOfLocalDay(now);
  const days: SessionDay[] = [];
  for (let offset = 0; offset <= horizonDays; offset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    days.push(describe(date, offset, locale, false));
  }
  return days;
}

/**
 * May a reading of this kind be shown under this day?
 *
 * The whole honesty rule of #755, in one line, so no surface has to remember
 * it: the hour reaches today and nothing else, the season reaches every day
 * this module will resolve.
 */
export function reaches(reach: ReadingReach, day: SessionDay): boolean {
  return reach === "the-season" || day.offsetDays === 0;
}

/**
 * What is still missing for a future day, in her words. Null on today, where
 * nothing is missing.
 *
 * ── IT NARROWED, AND WHAT IT NARROWED TO IS THE RULING (pointmoon#125) ─────
 *
 * This used to say we had no forecast at all, so the sky, the temperature, the
 * ground and the light were left out. Two of those four now have a reading of
 * their own for the chosen day: our producer had been fetching a 14-day daily
 * forecast on every read and reducing it to trend adjectives, and it carries
 * the days now.
 *
 * THE GROUND AND THE LIGHT ARE NOT COMING, and this line exists to say so.
 * They are read for the hour they are asked for, and a forecast day has no
 * hour — there is no version of this where "damp underfoot" or "35 minutes of
 * usable light" is true of Thursday. #755's rule is untouched: this morning's
 * reading may not appear under Thursday's heading. What changed is that
 * Thursday has two readings of its own, not that we relaxed about borrowing.
 *
 * `hasForecast` is the caller's answer to whether the sky and the temperature
 * actually resolved for this day. When they did not — past the horizon, or a
 * thin read — the line says the whole old thing again, because then the whole
 * old thing is true.
 */
export function noForecastLine(day: SessionDay, hasForecast = false): string | null {
  if (reaches("the-hour", day)) return null;
  if (!hasForecast) {
    return (
      `We have no forecast for ${day.shortLabel}, so nothing on this page is ` +
      `${day.shortLabel}'s weather. The sky, the temperature, the ground and the ` +
      "light are read for the hour they are asked for, so they are left out " +
      `rather than printed under ${day.shortLabel}'s name.`
    );
  }
  return (
    `The sky and the temperature above are a forecast for ${day.shortLabel}, not a reading. ` +
    "The ground and the light are not forecast at all: they are read for the hour " +
    `they are asked for, so they are left out rather than printed under ${day.shortLabel}'s name.`
  );
}

/** What is still true for that day, said plainly. Null on today. */
export function holdsForDayLine(day: SessionDay): string | null {
  if (reaches("the-hour", day)) return null;
  return (
    `What is below does hold for ${day.shortLabel}: the species this region ` +
    "shows in that week, and what has actually been photographed near the school."
  );
}

/** Said only when a day was asked for and refused. Null otherwise. */
export function outOfReachLine(
  day: SessionDay,
  horizonDays: number = SESSION_DAY_HORIZON_DAYS
): string | null {
  if (!day.outOfReach) return null;
  return (
    `We read as far ahead as ${horizonDays} days. That day is further off, or ` +
    "already gone, so this is today."
  );
}

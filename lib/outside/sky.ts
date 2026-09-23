/**
 * The sky, the day and the ground, in a teacher's words.
 *
 * The brief (#304) is the surface that gives back what the old Schools
 * prototype had and this app quietly stopped saying: sunrise and sunset, the
 * moon's phase and how lit it is, how much usable light is actually left, what
 * the ground is doing underfoot, and the one sky event worth telling a class
 * about. Every one of those already arrives in the Pointmoon payload and, until
 * now, nothing read them.
 *
 * ── READ THE PRODUCER'S OWN VOCABULARY, NOT A GUESS AT IT ──────────────────
 *
 * Every field here was read off a live London payload before it was typed, and
 * that is not ceremony. Five of six place-signal reads in this app were wrong
 * for weeks (#284) because they were written against a vocabulary the producer
 * never returned — `managed_level` and `landcover_type` did not exist, and
 * three 0-to-1 numbers were read as words, so a London school was told it had a
 * pond. The tests passed the whole time, because a producer that never returns
 * a field never contradicts a reader that misunderstands it.
 *
 * So: `astronomy.sunriseIso` is a LOCAL WALL CLOCK with no zone on it
 * ("2026-08-17T05:49"), not a UTC instant, and is read as written rather than
 * parsed and re-zoned. `time.windows.daylightMinutesRemaining` is a whole
 * number of minutes and is zero after sunset, not null.
 *
 * ── NOTHING IS COMPOSED WHEN NOTHING WAS READ ──────────────────────────────
 *
 * Every function returns null rather than a hedge. A line about how the moon is
 * "probably" somewhere is worse than no line: it teaches a teacher that this
 * surface guesses, and then she stops believing the parts that do not.
 */

import type { FieldTruth } from "./pointmoon";

/** One labelled fact for the brief's instrument rows. */
export interface SkyFact {
  /** What it is, in her words: "sunset", "moon", "light left". */
  label: string;
  /** What it says: "8:19 pm", "waxing crescent, 28% lit". */
  value: string;
}

function astronomy(data: FieldTruth | null) {
  return data?.facts?.fieldSnapshot?.astronomy;
}

/**
 * "05:49" out of "2026-08-17T05:49" — the wall clock, as written.
 *
 * Deliberately a slice and not a Date. The producer already resolved this into
 * the school's own timezone (`time.timezone` says which), so parsing it would
 * re-interpret a local time as UTC on a server running in UTC and shift every
 * sunrise by an hour in British summer. The string is the answer.
 */
function wallClock(iso: string | null | undefined): string | null {
  if (typeof iso !== "string") return null;
  const match = iso.match(/T(\d{2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = match[2];
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return null;
  const suffix = hours < 12 ? "am" : "pm";
  const twelve = hours % 12 === 0 ? 12 : hours % 12;
  return `${twelve}:${minutes} ${suffix}`;
}

/** Sunrise and sunset, as a teacher reads a clock. Null when unreported. */
export function sunTimes(data: FieldTruth | null): { sunrise: string | null; sunset: string | null } {
  const sky = astronomy(data);
  return { sunrise: wallClock(sky?.sunriseIso), sunset: wallClock(sky?.sunsetIso) };
}

/**
 * The moon in one phrase: "waxing crescent, 28% lit".
 *
 * The percentage is dropped rather than rounded to zero at new moon, because
 * "new moon, 0% lit" is a sentence that reads like a broken readout even
 * though it is true.
 */
export function moonPhrase(data: FieldTruth | null): string | null {
  const sky = astronomy(data);
  const label = typeof sky?.moonPhaseLabel === "string" ? sky.moonPhaseLabel.trim() : "";
  if (!label) return null;
  const lit = sky?.moonIlluminationPct;
  if (typeof lit !== "number" || !Number.isFinite(lit) || lit < 1) return label;
  return `${label}, ${Math.round(lit)}% lit`;
}

/**
 * How much usable light is left, in the unit she plans in.
 *
 * Zero is a real answer and is reported as one ("the light has gone"), because
 * on a winter afternoon that is the whole decision. Null only when the producer
 * did not say.
 */
export function lightLeft(data: FieldTruth | null): string | null {
  const minutes = data?.facts?.fieldSnapshot?.time?.windows?.daylightMinutesRemaining;
  if (typeof minutes !== "number" || !Number.isFinite(minutes) || minutes < 0) return null;
  if (minutes < 1) return "the light has gone";
  if (minutes < 90) return `about ${Math.round(minutes)} minutes`;
  const hours = minutes / 60;
  const whole = Math.floor(hours);
  const half = hours - whole >= 0.5;
  return half ? `about ${whole} and a half hours` : `about ${whole} hours`;
}

/**
 * The moon as a shape rather than as a phrase, for the drawn window (#323).
 *
 * `moonPhrase` above is the sentence. This is the same two readings for a
 * surface that has to DRAW the moon: how much of it is lit, and which limb.
 * Separate rather than parsed back out of the phrase, because a display string
 * is not an API — the moment someone rewords "28% lit" the drawing would
 * silently start lying about the sky.
 *
 * Null when the producer did not say, and null draws no moon at all. A drawn
 * field with a moon in it that nobody reported is exactly the invention that
 * state exists to avoid.
 */
export function moonShape(
  data: FieldTruth | null
): { illuminationPct: number; waning: boolean } | null {
  const sky = astronomy(data);
  const lit = sky?.moonIlluminationPct;
  if (typeof lit !== "number" || !Number.isFinite(lit)) return null;
  const label = typeof sky?.moonPhaseLabel === "string" ? sky.moonPhaseLabel.toLowerCase() : "";
  return {
    illuminationPct: Math.min(Math.max(lit, 0), 100),
    // Waning is stated by the producer's own label. An unlabelled moon is
    // drawn waxing rather than guessed at from a date.
    waning: label.includes("waning") || label.includes("last quarter"),
  };
}

const GROUND_WORDS: Record<string, string> = {
  dry: "dry underfoot",
  damp: "damp underfoot",
  wet: "wet underfoot",
  saturated: "waterlogged",
  frozen: "frozen hard",
  snow: "under snow",
};

/** What the ground is doing. Only the states the producer actually names. */
export function groundPhrase(data: FieldTruth | null): string | null {
  const state = data?.facts?.fieldSnapshot?.ground?.state;
  if (typeof state !== "string") return null;
  return GROUND_WORDS[state.trim()] ?? null;
}

/**
 * The instrument row: only the readings that came back.
 *
 * Ordered the way she would ask: when does the light go, how long have I got,
 * what is the moon doing, what am I walking on. A missing reading leaves no
 * gap and no placeholder — the row is simply shorter, which is the same rule
 * the daily card is built on.
 */
export function skyFacts(data: FieldTruth | null): SkyFact[] {
  const facts: SkyFact[] = [];
  const { sunrise, sunset } = sunTimes(data);
  if (sunrise) facts.push({ label: "sunrise", value: sunrise });
  if (sunset) facts.push({ label: "sunset", value: sunset });
  const left = lightLeft(data);
  if (left) facts.push({ label: "light left", value: left });
  const moon = moonPhrase(data);
  if (moon) facts.push({ label: "moon", value: moon });
  const ground = groundPhrase(data);
  if (ground) facts.push({ label: "ground", value: ground });
  return facts;
}

/**
 * The one sky event worth telling a class about, in Pointmoon's own words.
 *
 * ONE, and the nearest one. A list of four things happening over the next
 * three months is an almanac, and she is planning Thursday. Anything further
 * out than a school half-term is not a plan, it is trivia, so it is dropped.
 */
export interface UpcomingSky {
  label: string;
  note: string | null;
  /** "in 10 days", "tomorrow", "tonight" — or, from a chosen day, "that night". */
  when: string;
}

/**
 * A sky event is one of the few readings that DOES survive being pointed at
 * another day (#755).
 *
 * `daysOffset` is a count from the read, not a state of the current hour, so
 * an eclipse eleven days out is as true when a teacher is planning Thursday as
 * it is this morning. What must move is the WORDING: "in 3 days" read on a
 * page headed Thursday means three days after today, and a teacher planning
 * Thursday will read it as three days after Thursday.
 *
 * So the phrasing is measured from `fromDaysOffset`, the day the page is for,
 * and an event that has already happened by then is dropped rather than
 * described in the past tense on a planning page.
 *
 * `fromDaysOffset` of 0 is the original behaviour, word for word.
 */
export function upcomingSky(
  data: FieldTruth | null,
  fromDaysOffset = 0
): UpcomingSky | null {
  const events = astronomy(data)?.upcomingEvents;
  if (!Array.isArray(events)) return null;

  const from =
    Number.isFinite(fromDaysOffset) && fromDaysOffset > 0 ? Math.round(fromDaysOffset) : 0;

  let best: UpcomingSky | null = null;
  let bestOffset = Number.POSITIVE_INFINITY;

  for (const event of events) {
    const label = typeof event?.label === "string" ? event.label.trim() : "";
    const offset = event?.daysOffset;
    if (!label) continue;
    if (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0) continue;
    // Already over by the day being planned. Not news, and not a plan.
    if (offset < from) continue;
    // Beyond half a term it is trivia, not a plan.
    if (offset > 45 || offset >= bestOffset) continue;

    const days = Math.round(offset) - from;
    bestOffset = offset;
    best = {
      label,
      note: typeof event.note === "string" && event.note.trim() ? event.note.trim() : null,
      when: whenPhrase(days, from > 0),
    };
  }

  return best;
}

function whenPhrase(days: number, fromAnotherDay: boolean): string {
  if (!fromAnotherDay) {
    return days === 0 ? "tonight" : days === 1 ? "tomorrow" : `in ${days} days`;
  }
  if (days === 0) return "that night";
  if (days === 1) return "the night after";
  return `${days} days later`;
}

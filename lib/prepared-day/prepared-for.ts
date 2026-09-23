import type { ContextRevision, WeatherSnapshot } from "@/schema/prepared-day";

/**
 * WHAT A PREPARED DAY WAS PREPARED FOR, in the two sentences a sheet can carry.
 *
 * A printed rain plan carried into sun is the costliest trust failure
 * available to us (#1092). Paper has no tooltip and no second screen, so the
 * only place a sheet can say which day and which weather it was made for is
 * the sheet itself — the same argument the sample-patch label on `/print`
 * already makes for place (#463).
 *
 * ── THREE RULES, and each one is a way this could have been written wrong ──
 *
 *   IT READS THE SAVED CONTEXT, NEVER TODAY. Every value here comes from the
 *   `ContextRevision` frozen when the day was prepared. A notice that resolved
 *   the weather live, or formatted the date in the server's zone, would
 *   describe the moment the paper came out of the printer rather than the
 *   moment the day was made for — which is the exact confusion it exists to
 *   prevent.
 *
 *   AN ABSENCE IS SAID, NOT OMITTED. `conditionKind` is null on most days
 *   prepared in advance, and null is an answer: nothing turns a daily forecast
 *   into an hour's bucket honestly. So the conditions sentence is never empty
 *   and never filled in with the nearest plausible word — it names which
 *   absence this is, from the snapshot's own `reasonCode`. A sheet that simply
 *   dropped the line would read as a day prepared for nothing in particular.
 *
 *   IT CARRIES NO VERDICT. There is no "too wet to go out" here, and there
 *   cannot be: `WeatherSnapshot` deliberately holds no go/no-go field, and
 *   inventing one at the render layer would put a machine's judgment on paper
 *   in the teacher's name. This says what was read. What to do about it is
 *   hers.
 */

/** What the conditions half of the notice is, for callers that want the fact. */
export type PreparedForConditions =
  | { state: "read"; kind: string }
  | { state: "absent"; reason: WeatherSnapshot["reasonCode"] };

export type PreparedForNotice = {
  /** "Prepared for Thursday 11 September 2026, 14:00 (Europe/London)." */
  preparedForLine: string;
  /** The conditions sentence. Always present — an absence is a sentence too. */
  conditionsLine: string;
  conditions: PreparedForConditions;
};

/**
 * What a reading is OF, said as a phrase rather than as a class name.
 *
 * ONLY `the-planned-hour` MAY CLAIM THE LESSON HOUR, and this is the whole
 * reason the phrases are not interchangeable. `lib/outside/session-day.ts` is
 * exact about it: `the-hour` is "read for the moment it was asked for, at one
 * point… NONE of it survives being pointed at a day that is not today". A
 * preparation made at 08:04 for a 14:30 lesson therefore holds an 08:04 sky,
 * and a sheet that called it a reading of the lesson hour would print this
 * morning's ground and light under the afternoon's name. That is the invented
 * nature this notice exists to prevent, arriving through the notice itself.
 *
 * `the-season` is the same argument one step wider: a seasonal reading is true
 * of a week and a region, and letting it pass as "the weather" would claim an
 * hour's precision it never had.
 */
const REACH_PHRASE: Record<WeatherSnapshot["reach"], string> = {
  "the-hour": "The reading is of the moment it was taken, not of the lesson hour",
  "the-planned-hour": "The reading is of that planned hour",
  "the-season": "The reading is of the season and the region, not of an hour",
};

/** Which absence this is, in her words rather than in the code's. */
const ABSENCE_PHRASE: Record<
  NonNullable<WeatherSnapshot["reasonCode"]>,
  string
> = {
  "out-of-reach": "the reading we held did not reach that hour",
  "no-signal": "nothing answered when we looked",
  "not-asked": "no reading was asked for",
};

/**
 * `en-GB` rather than the reader's locale, and the IANA zone printed as
 * itself. The sheet must say the same thing in the staff room it says in the
 * yard, and a zone abbreviation that means two different hours in two
 * different countries is worse than the identifier nobody has to guess at.
 */
function dayAndTime(instant: string, timeZone: string): string {
  const at = new Date(instant);
  // The weekday is formatted apart from the date so the sentence reads
  // "Thursday 10 September 2026" rather than the comma-heavy run `en-GB` gives
  // for the two together. The parts are the formatter's; only the join is ours.
  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "long" }).format(at);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(at);
  return `${weekday} ${day} at ${clockTime(instant, timeZone)}`;
}

function clockTime(instant: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(instant));
}

function shortDayAndTime(instant: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "long",
  }).format(new Date(instant));
  return `${day} at ${clockTime(instant, timeZone)}`;
}

/**
 * The provenance clauses, and every one of them is optional in the schema
 * because a snapshot can honestly lack it. Absent ones are left out rather
 * than filled: "from an unknown source" is a claim, and silence is not.
 */
function readingClauses(weather: WeatherSnapshot, timeZone: string): string[] {
  const clauses: string[] = [];
  if (weather.observedAt) {
    clauses.push(`taken ${shortDayAndTime(weather.observedAt, timeZone)}`);
  }
  if (weather.source) clauses.push(`from ${weather.source}`);
  return clauses;
}

/**
 * WHETHER THE LESSON HAS MOVED UNDER THE PREPARATION, said on the sheet.
 *
 * This exists because printing the frozen source created the need for it.
 * While a prepared sheet rendered today's pack, an author's correction to the
 * kit or the safety wording reached paper the moment it was made; now that the
 * sheet is the day as it was prepared, that correction does NOT reach it, and
 * without this line nothing on the page would say so. The store already
 * computes the answer — `sourceFreshness`, from the dependencies recorded at
 * preparation — so the only thing missing was saying it.
 *
 * `fresh` is silence, and that is not a gap: nothing has changed, so there is
 * nothing to tell her. `source-unavailable` is its own sentence rather than
 * silence, because "we could not check" and "nothing changed" are different
 * facts and a sheet that printed them the same way would be the more
 * comfortable of the two standing in for the other.
 *
 * It carries no instruction. Whether a sheet whose lesson has moved is still
 * the right sheet to teach from is hers.
 */
export function sourceSinceLine(
  state: "fresh" | "stale" | "source-unavailable" | undefined,
): string | null {
  if (state === "stale") {
    // "though not necessarily anything on this sheet" is not a hedge, it is the
    // limit of what the signal knows. `sessionDependencies` walks the WHOLE
    // session with no allowlist, so an author editing `authorNotes` — which no
    // print surface renders — moves this state exactly as a kit edit does.
    // Saying "the lesson has been edited" alone would be true and would still
    // imply the page in her hand changed, which the signal cannot support. The
    // coarseness is the composer's dependency tracker's and is deliberate
    // there: it over-warns and never under-warns.
    return (
      "The lesson has been edited since this was prepared, though not " +
      "necessarily anything on this sheet. This sheet is the day as it was " +
      "prepared, not as the lesson reads now."
    );
  }
  if (state === "source-unavailable") {
    return "Whether the lesson has been edited since this was prepared could not be checked.";
  }
  return null;
}

/**
 * The same three rules, in the millimetres a CARD has (#1245).
 *
 * The A4 is read at the printer with a screen beside it. The clip-and-carry
 * deck goes on a lanyard and leaves the building, so it is the artefact most
 * likely to be read alone, days after it was prepared, with nothing to check
 * it against — which makes it the one that most needs to say what it was for,
 * and the one with the least room to say it. `preparedForNotice` returns two
 * to three full sentences and will not fit a card's folio.
 *
 * WHAT IS DROPPED, and why each is an omission rather than a claim:
 *
 *   the provenance clauses  who said it and when the reading was taken
 *                           (`source`, `observedAt`). They answer "how do you
 *                           know", which is the A4's question. Leaving them
 *                           out says less; it does not say anything untrue.
 *   the weekday in full     "Thu" rather than "Thursday", and no year. The
 *                           deck is carried within days of the preparation, so
 *                           the short form is unambiguous in the window it is
 *                           actually read in.
 *
 * WHAT IS NOT DROPPED, because dropping either would print a falsehood:
 *
 *   the reach              `the-hour` means the reading is of the moment it
 *                          was taken and NOT of the lesson hour. A card that
 *                          said "dry" beside the lesson time with that clause
 *                          removed would put this morning's sky under the
 *                          afternoon's name, which is the exact invention the
 *                          notice exists to prevent.
 *   `validUntil`           when the reading stops being a reading of anything.
 *                          The A4 can afford to treat this as a footnote; the
 *                          object that travels for days cannot.
 *   the absence            a null `conditionKind` is still said, from its own
 *                          `reasonCode`, and still never filled in.
 *   the zone               printed as its IANA identifier, for the same reason
 *                          as the long form: the card says the same thing in
 *                          the staff room and in the yard.
 *
 * And there is still no verdict here. Nothing on this line says whether to go
 * out.
 */
const SHORT_REACH: Record<WeatherSnapshot["reach"], (kind: string) => string> = {
  "the-hour": (kind) => `${kind} when the reading was taken, not at that hour`,
  "the-planned-hour": (kind) => `${kind} at that hour`,
  "the-season": (kind) => `${kind} for the season and the region, not for that hour`,
};

export function preparedForFolio(context: ContextRevision): string {
  const timeZone = context.plannedTimeZone;
  new Intl.DateTimeFormat("en-GB", { timeZone });

  const weekday = new Intl.DateTimeFormat("en-GB", { timeZone, weekday: "short" }).format(
    new Date(context.plannedAt),
  );
  const head = `Prepared for ${weekday} ${shortDayAndTime(context.plannedAt, timeZone)} (${timeZone}).`;
  const weather = context.weather;

  if (weather.conditionKind === null) {
    const because = weather.reasonCode
      ? ABSENCE_PHRASE[weather.reasonCode]
      : "no reason was recorded for the gap";
    return `${head} No weather was read: ${because}.`;
  }

  // The conditions clause is a fragment rather than a sentence of its own
  // precisely so the authored `conditionKind` is never capitalised on its way
  // to paper. A card that sentence-cased it would be editing a stored value to
  // fit a layout, which is how a small rewording becomes a small untruth.
  const limit = weather.validUntil
    ? ` Not a reading past ${shortDayAndTime(weather.validUntil, timeZone)}.`
    : "";
  return `${head} Conditions: ${SHORT_REACH[weather.reach](weather.conditionKind)}.${limit}`;
}

/**
 * The notice for one saved context.
 *
 * Throws on a time zone `Intl` cannot resolve rather than falling back to the
 * server's own. A sheet headed with the wrong hour is the failure this whole
 * file is about, so the render stops instead of printing one; `snapshotInput`
 * already refuses such a zone on the way in, which is what makes this the
 * unreachable case rather than the common one.
 */
export function preparedForNotice(context: ContextRevision): PreparedForNotice {
  const timeZone = context.plannedTimeZone;
  // Resolve the zone once, up front, so an unusable one fails before half a
  // notice has been built out of it.
  new Intl.DateTimeFormat("en-GB", { timeZone });

  const preparedForLine = `Prepared for ${dayAndTime(context.plannedAt, timeZone)} (${timeZone}).`;
  const weather = context.weather;

  if (weather.conditionKind !== null) {
    const clauses = readingClauses(weather, timeZone);
    const provenance = clauses.length ? `, ${clauses.join(", ")}` : "";
    // `validUntil` gets its own sentence rather than a fourth comma clause,
    // and it is phrased as the schema phrases it — when the reading stops
    // being a reading of anything — because "good until" would read as a
    // verdict on the day rather than a fact about the reading.
    const limit = weather.validUntil
      ? ` It does not reach past ${shortDayAndTime(weather.validUntil, timeZone)}.`
      : "";
    return {
      preparedForLine,
      conditionsLine:
        `Prepared for ${weather.conditionKind}. ` +
        `${REACH_PHRASE[weather.reach]}${provenance}.${limit}`,
      conditions: { state: "read", kind: weather.conditionKind },
    };
  }

  // No bucket. Which absence it is comes from the snapshot; when even that is
  // missing, the sheet says so rather than picking the flattering one.
  const because = weather.reasonCode
    ? ABSENCE_PHRASE[weather.reasonCode]
    : "no reason was recorded for the gap";
  return {
    preparedForLine,
    conditionsLine: `No weather was read for it: ${because}.`,
    conditions: { state: "absent", reason: weather.reasonCode },
  };
}

// Server-only: one Pointmoon read plus the cast accessor. Never import from a
// client component.

/**
 * Everything the daily card needs, composed once.
 *
 * The card is the door. It is the first thing a teacher sees each morning and
 * often the only thing she reads before deciding whether thirty children are
 * going outside, so it gets one server-side composition and no client fetching.
 *
 * TWO READS, ONE OF THEM USUALLY FREE. `fetchFieldTruth` is memoised per
 * location for fifteen minutes, so asking for the conditions here and asking
 * for a composed cast underneath costs one network call, not two. A class with
 * a stored cast costs one call total, because the stored path never touches
 * Pointmoon at all.
 *
 * ── THE STATES, AND WHICH ONE IS PRIMARY ───────────────────────────────────
 *
 * `condition` null is NOT a fine day and is not an error. It means we could
 * not see outside, and the card says exactly that. This is the state the card
 * was built from first, because it is the one a pilot school will hit on a bad
 * morning and the one that used to render a confident, empty-headed card.
 *
 * `cast.members` empty is likewise ordinary, not broken. A school in a quiet
 * recording area with a thin phenology week has no cast, and the card then
 * shows conditions and the session and nothing else. It never shows a row of
 * placeholders waiting for data that is not coming.
 */

import { fetchFieldTruth } from "@/lib/outside/pointmoon";
import { resolveClimate, type ClimateGroup } from "@/lib/outside/climate";
import type { Locale } from "@/lib/localization";
import type { HabitatTag } from "@/lib/outside";
import type { TopicTag } from "@/schema/pack";
import { cardCondition, feltTemperature, skyPhrase, type CardCondition } from "./conditions";
import { dailySummary } from "./summary";
import { getClassCast, type ClassCast } from "./read";
import { withLivePhotos } from "./enrich";
import { nearbySightings } from "@/lib/outside/observations";

export interface DailyCardData {
  /**
   * The day's shape and its one adjustment line, or null when there was no
   * read. Null renders the quiet card, never an invented fine day.
   */
  condition: CardCondition | null;
  /** The felt temperature with its unit, in the teacher's own scale. */
  temperature: string | null;
  /** "a clear sky · a light breeze", without the temperature. */
  sky: string | null;
  /** Today's cast, from the stored cast or composed. Possibly empty. */
  cast: ClassCast;
  /** What today holds, in one or two short lines. Null when there is nothing
   * worth saying — an ordinary morning with no session says nothing. */
  summary: string | null;
}

export interface DailyCardQuery {
  /** The active class, when there is one. Null composes without a stored cast. */
  classId?: string | null;
  lat?: number | null;
  lng?: number | null;
  habitats?: HabitatTag[];
  /** Today's lesson's topic tags: the cast leads with the matching species. */
  topicTags?: readonly TopicTag[];
  /** The class's stored climate tag, when it has one. */
  climate?: ClimateGroup | null;
  /** Drives the temperature unit. Derived upstream from the class's location. */
  locale?: Locale;
  /** How many members to resolve. The card shows fewer than it asks for. */
  limit?: number;
  /** The moment to read for; defaults to now. Injectable for tests. */
  date?: Date;
  /** Today's session title, so the summary can name what the class is doing.
   * This is usability I1's fix: the session block is below the fold. */
  sessionTitle?: string | null;
}

/** An honest nothing. What every failure path resolves to. */
const EMPTY: DailyCardData = {
  condition: null,
  temperature: null,
  sky: null,
  cast: { members: [], absences: [], source: "live" },
  summary: null,
};

export async function getDailyCard(query: DailyCardQuery = {}): Promise<DailyCardData> {
  const {
    classId = null,
    lat,
    lng,
    habitats,
    topicTags = [],
    climate,
    locale = "uk",
    limit = 6,
    date,
    sessionTitle = null,
  } = query;

  try {
    // Both reads at once. The cast read is the slower of the two on the
    // composed path and does not depend on the conditions read, so serialising
    // them would put a Pointmoon round trip in front of the first paint of the
    // one card a teacher opens every morning.
    const [data, cast] = await Promise.all([
      fetchFieldTruth({
        lat: typeof lat === "number" ? lat : undefined,
        lng: typeof lng === "number" ? lng : undefined,
      }),
      getClassCast(classId, {
        lat,
        lng,
        habitats,
        topicTags,
        limit,
        date,
        climate: climate ?? resolveClimate(lat, lng),
      }),
    ]);

    const condition = cardCondition(data);
    // The card already holds today's read, and that read carries
    // rights-complete photographs. A stored or regional cast member has no
    // photograph of its own by construction, so it renders as a drawn plate
    // even when the very same species was photographed near here this week.
    // Lay the real one over it where the species matches; everything else is
    // unchanged, and the plate stays underneath as the floor.
    const castWithPhotos: ClassCast = {
      ...cast,
      members: withLivePhotos(cast.members, nearbySightings(data, 24, topicTags)),
    };
    return {
      condition,
      temperature: feltTemperature(data, locale),
      sky: skyPhrase(data),
      cast: castWithPhotos,
      summary: dailySummary({
        state: condition?.state ?? null,
        sessionTitle,
        members: castWithPhotos.members,
      }),
    };
  } catch {
    // The card is the door. It opens even when everything behind it is shut.
    return EMPTY;
  }
}

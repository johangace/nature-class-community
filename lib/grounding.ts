import { localeForCoords } from "@/lib/location-locale";
// Server-only: composes the session-grounded conditions line (#126).

/**
 * The grounding line — the answer to "the conditions line is a weather
 * template, not grounding".
 *
 * Three tiers, best available wins, absence ships as absence at every one:
 *
 *   1. MODEL (online, signed-in, key set): one find-something line composed
 *      by the model from a CLOSED block of verified Pointmoon facts, tied to
 *      the session's topic, cached per (session × location × conditions
 *      bucket × day). The model never sees a fact Pointmoon didn't return,
 *      so it cannot name what it wasn't given.
 *   2. DETERMINISTIC: the plain weather sentence (composeConditionsLine)
 *      plus, when a real photographed sighting exists, one appended clause
 *      naming ONE creature and who observed it — grounded by construction.
 *   3. NOTHING: null; the renderer keeps the block's authored fallbackText.
 *
 * The teacher's register contract (schools PM, 2026-08-10): observation,
 * never promise. "Someone photographed X near here", never "you will find".
 */

import type { ConditionKind, TopicTag } from "@/schema/pack";
import { composeConditionsLine } from "@/lib/conditions";
import { groundingLine as draftGroundingLine } from "@/lib/ai/plate-draft";
import { displayPhotoAsset } from "@/lib/cast/member";
import { isModelAvailable } from "@/lib/ai/model";
import { getOutsideNow } from "@/lib/outside";
import { localizeText, type Locale } from "@/lib/localization";
import { conditionsBucket, presentConditions, suggestedCondition } from "@/lib/outside/bucket";
import { asHabitatTags } from "@/lib/outside/grounds";
import { formatFeltTemperature } from "@/lib/outside/conditions";
import { matchesTopic } from "@/lib/outside/observations";
import { fetchFieldTruth, type FieldTruth } from "@/lib/outside/pointmoon";

/**
 * Coarse fingerprint of the day's conditions. Keys the composed-line cache,
 * seeds the runner's variant suggestion, and picks the daily card's condition
 * state. It moved to lib/outside/bucket (pure: a payload in, a word out) once
 * a third caller appeared, and is re-exported here so every existing import of
 * it keeps working unchanged.
 */
export { conditionsBucket, suggestedCondition } from "@/lib/outside/bucket";
export type { ConditionsBucket } from "@/lib/outside/bucket";

/**
 * Distil the day's read into the CLOSED fact block the model receives.
 * Every line is a token Pointmoon (or the regional phenology file) actually
 * returned; nothing else exists as far as the model is concerned. Returns
 * null when there is nothing worth grounding to — the model is then never
 * called at all.
 */
function distilFacts(
  data: FieldTruth | null,
  lookFors: Array<{ species: string; note: string; phase?: string | null }>,
  seenNearby: string[],
  locale: Locale
): string | null {
  const lines: string[] = [];

  if (seenNearby.length > 0) {
    lines.push(`- seen near here this week (photographed): ${seenNearby.join(", ")}`);
  }
  for (const item of lookFors.slice(0, 4)) {
    const phase = item.phase ? ` (${item.phase})` : "";
    lines.push(`- around now in this region: ${item.species}${phase} — ${item.note}`);
  }

  const current = data?.facts?.fieldSnapshot?.weather?.current;
  if (current) {
    const weather: string[] = [];
    const apparentC = current.felt?.apparentC;
    if (typeof apparentC === "number" && Number.isFinite(apparentC)) {
      // Through the single conversion owner, in the teacher's own scale. This
      // was the last hardcoded Celsius in the product, and it was the worst
      // place for one: the fact block is what the MODEL reads, so a US teacher
      // could be handed an AI-composed line speaking Celsius while every
      // deterministic surface around it spoke Fahrenheit. A model told "feels
      // like 13°C" will say 13 degrees, and it will be wrong in the one
      // register a teacher reads aloud to a class.
      weather.push(`feels like ${formatFeltTemperature(apparentC, locale)}`);
    }
    if (typeof current.skyCondition === "string") weather.push(current.skyCondition);
    const rain = current.precipitationRateMmPerHour;
    if (typeof rain === "number" && rain > 0.1) weather.push("rain falling");
    if (typeof current.windKph === "number" && current.windKph >= 20) weather.push("fresh wind");
    if (weather.length > 0) lines.push(`- conditions: ${weather.join(", ")}`);
  }

  // Weather alone is not grounding — that is the whole ticket. Without at
  // least one living thing to point at, the model has nothing to add over
  // the deterministic weather sentence, so it is not asked.
  if (seenNearby.length === 0 && lookFors.length === 0) return null;

  return [
    "GROUNDING (verified facts for this place and week — the ONLY nature facts you may use):",
    ...lines,
    "If a fact you would want is not in this list, it is NOT available — do not name it.",
  ].join("\n");
}

/** The deterministic floor: the weather sentence, extended with real
 * photographed sightings when they exist. Grounded by construction — every
 * word traces to a returned token. */
function deterministicLine(
  data: FieldTruth | null,
  seenNearby: string[],
  locale: Locale
): string | null {
  const weather = data ? composeConditionsLine(data, locale) : null;
  const first = seenNearby[0];
  if (!first) return weather;
  // One creature, told as something a person did.
  //
  // This clause used to print three comma-separated names after a colon, which
  // reads as a query result rather than as a teacher speaking — Johan's
  // objection, and the shape was the cause rather than the words. Naming who
  // did the observing keeps the register contract exactly as it was (an
  // observation someone made, never a promise the class will find it) and
  // makes the sentence sayable out loud. The other names are not lost: they
  // are the cast, which the surfaces show as species in their own right.
  const seen = `Someone photographed ${first} near here this week.`;
  return weather ? `${weather} ${seen}` : seen;
}

/** One composed line per session, place, weather-shape and day. */
const lineCache = new Map<string, { line: string | null; at: number }>();
const LINE_TTL_MS = 15 * 60 * 1_000;

export interface GroundedConditions {
  line: string | null;
  suggestedCondition: ConditionKind | null;
  /** Every kind true of this reading, primary first (#1007). The hinge reads this. */
  conditions: ConditionKind[];
}

export interface GroundingQuery {
  lat?: number | null;
  lng?: number | null;
  /** Session identity + intent; absent for surfaces with no session. */
  sessionId?: string;
  topic?: string;
  objective?: string;
  /** The session's closed topic vocabulary: the facts lead with the matching
   * cast so the model's line starts from the right species (#161). */
  topicTags?: readonly TopicTag[];
  /** True only for a signed-in teacher: the model is never spent on the
   * public cold-URL demo, matching the other AI helpers' gate. */
  teacher?: boolean;
  /** The reader's own scale. Reaches the model's fact block, so the composed
   * line speaks the same units as every deterministic surface beside it. */
  locale?: Locale;
  /**
   * The habitats this class can actually reach: her grounds and the site
   * features she told us about, already merged by `activePlaceContext`.
   *
   * Without it the line was composed from the whole region's week, so a school
   * with a pond and a wild corner read the same sentence as a school on bare
   * tarmac two streets away. What she told us about her own grounds reached
   * the cast and reached nothing else.
   *
   * An empty list filters nothing, deliberately. Unfilled is not evidence, the
   * same rule the validity resolver and the look-for seam already run on: a
   * teacher who skipped the question gets the region, not an empty week.
   */
  habitats?: readonly string[];
}

/**
 * The one entry point: the best grounded line available for this session,
 * this place, today — plus the day's suggested variant. Never throws; every
 * failure path degrades one tier.
 */
export async function getGroundedConditions(query: GroundingQuery): Promise<GroundedConditions> {
  const lat = typeof query.lat === "number" && Number.isFinite(query.lat) ? query.lat : undefined;
  const lng = typeof query.lng === "number" && Number.isFinite(query.lng) ? query.lng : undefined;

  // Derived from the class's own coordinates unless the caller states it, the
  // same rule Today and the onboarding bloom follow.
  const locale: Locale = query.locale ?? localeForCoords(lat, lng);

  const topicTags = query.topicTags ?? [];
  // Narrowed, then emptied to undefined rather than travelling as `[]`. An
  // empty array would read as "filter to nothing" downstream, and the honest
  // meaning of a teacher who has not answered yet is "no filter", not "no
  // habitats". Narrowing before the length check matters: a list of values we
  // no longer recognise must degrade to the region, not to silence.
  const narrowed = asHabitatTags(query.habitats ?? []);
  const habitats = narrowed.length ? narrowed : undefined;
  const [data, outside] = await Promise.all([
    fetchFieldTruth({ lat, lng }),
    getOutsideNow({ lat, lng, habitats, limit: 4, topicTags, locale }),
  ]);

  const bucket = conditionsBucket(data);
  const suggestion = suggestedCondition(bucket);
  const conditions = presentConditions(data);

  // Real photographed observations only. getOutsideNow no longer backfills
  // regional names into `sightings` at all (#172), so this filter now narrows
  // recorded-with-a-photo out of recorded, rather than guarding against a
  // seasonal guess. The regional names still reach the model, but through
  // `outside.lookFors` and phrased as "around now", never as a sighting.
  // Matching taxa lead (#161): nearbySightings already ranked them first for
  // a tagged session, so keeping order here keeps the fact block's cast right.
  // Gate B, not Gate A: the model is told "photographed" only for records the
  // release gate would actually show — a bare photoUrl that renders as a drawn
  // plate must not reach the model as a photograph.
  const seenNearby = outside.sightings
    .filter((s) => displayPhotoAsset({ photo: s.photo ?? null }) !== null)
    .sort(
      (a, b) =>
        Number(matchesTopic(b.iconicTaxon, topicTags, b.scientificName)) -
        Number(matchesTopic(a.iconicTaxon, topicTags, a.scientificName))
    )
    .map((s) => s.name)
    .filter((name): name is string => typeof name === "string" && name.length > 0);

  const floor = deterministicLine(data, seenNearby, locale);

  /**
   * The line leaves in the reader's own English, whichever tier produced it
   * (#393).
   *
   * This one is frozen into the session by `groundSessionConditions` AFTER
   * `localizeDeep` has run over the pack, so it is the one sentence on the run
   * screen that the localization layer could never see. A US class read an
   * authored lesson about bugs in the fall and then, in the block beneath it,
   * a composed line about minibeasts in autumn.
   */
  const spoken = (line: string | null): string | null =>
    line === null ? null : localizeText(line, locale);

  const wantModel = Boolean(query.teacher) && Boolean(query.sessionId) && isModelAvailable();
  if (!wantModel) return { line: spoken(floor), suggestedCondition: suggestion, conditions };

  const day = new Date().toISOString().slice(0, 10);
  const place = `${(lat ?? 0).toFixed(3)},${(lng ?? 0).toFixed(3)}`;
  // The locale is part of the key: without it the first class to warm this
  // entry decides the units for every class that shares its session and place.
  //
  // The habitats are part of it for the same reason, one step sharper. Two
  // schools can share a coordinate to three decimal places and not share a
  // pond, so without this the first class to warm the entry would decide what
  // the OTHER school's class goes looking for. Sorted so that the same set
  // chosen in a different order is the same key.
  const patch = habitats ? [...habitats].sort().join(",") : "region";
  const cacheKey = `${query.sessionId}|${place}|${patch}|${locale}|${bucket ?? "none"}|${day}`;

  const hit = lineCache.get(cacheKey);
  if (hit && Date.now() - hit.at < LINE_TTL_MS) {
    return { line: spoken(hit.line ?? floor), suggestedCondition: suggestion, conditions };
  }

  const facts = distilFacts(data, outside.lookFors, seenNearby, locale);
  let composed: string | null = null;
  if (facts) {
    composed = await draftGroundingLine(facts, {
      topic: query.topic,
      objective: query.objective,
    });
  }

  lineCache.set(cacheKey, { line: composed, at: Date.now() });
  return { line: spoken(composed ?? floor), suggestedCondition: suggestion, conditions };
}

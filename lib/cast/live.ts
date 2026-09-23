// Server-only: one Pointmoon read per request, resolved into today's cast.
// Never import from a client component.

/**
 * TODAY'S CAST, RESOLVED FROM TODAY (#284).
 *
 * ── THE RULING ─────────────────────────────────────────────────────────────
 *
 * Johan, 2026-08-17: "I dont want stored stuff we have hardcoded phenology etc
 * CIO to build a smart system pick up signals and show real time stuff."
 *
 * That overrides the "never silent" rule this file's predecessor was built on.
 * The old model resolved a class's cast ONCE, at the onboarding location step,
 * wrote a `CastMember` row per species, and then never looked again unless a
 * teacher pressed refresh. The reasoning was sound in the abstract — a class
 * that learnt to find a thing keeps that thing on its list — and wrong in
 * practice for three reasons the audit found on 2026-08-17:
 *
 *   1. A row written on a night Pointmoon had no photograph carried
 *      `photoUrl: null` FOREVER. Not until tomorrow. Forever, for that class,
 *      for every species in that generation (#275).
 *   2. A cast resolved in March is still on screen in August, describing a
 *      season that ended. Stability and truth pull in opposite directions and
 *      the stored model always chose stability.
 *   3. Nobody could tell. A stale cast and a fresh one render identically,
 *      which is precisely the "stale data presented as now" the product's own
 *      honesty discipline forbids everywhere else.
 *
 * ── WHAT REPLACES IT ───────────────────────────────────────────────────────
 *
 * The cast is now resolved per request from the current Pointmoon payload. The
 * resolver (./resolve) is pure and already reads the recurrence, absence and
 * photo-provenance fields the live payload has always carried. It runs at read
 * time, not onboarding, and nothing writes the result down.
 *
 * ── WHY A CACHE IS NOT A DATABASE ──────────────────────────────────────────
 *
 * There is a cache here, and the distinction matters. Latency and a wobbly
 * network are the only legitimate reasons to hold this data, and a cache with
 * a short TTL serves exactly those: it expires, it is per-process, and nothing
 * reads it after it goes stale. A `CastMember` row is a permanent record of an
 * intelligence decision, and a permanent record cannot expire. One is a
 * performance detail; the other is a claim about the world that outlives the
 * moment it was true.
 *
 * The transport underneath (`fetchFieldTruth`) already memoises per location
 * and observation scope for fifteen minutes, so this layer's cache only stops the daily
 * card and the surface cast re-running the pure resolution twice inside one
 * page render. It is small, bounded and short.
 *
 * ── WHAT HAPPENS WHEN WE CANNOT SEE OUTSIDE ────────────────────────────────
 *
 * `thin` is true when Pointmoon returned nothing usable. The honest answer is
 * a SHORTER cast or none, and a surface that says it could not see outside.
 * There is no stale generation to fall back to any more, and that is the
 * point: silence is a true statement about a failed read, and last March's
 * species list is not.
 */

import { prisma } from "@/lib/db";
import { groundsPlaceSelect } from "@/lib/grounds";
import { learnerContextForClass } from "@/lib/learner-context";
import { resolveClimate, type ClimateGroup } from "@/lib/outside/climate";
import { matchesTopic, pointmoonObservationTaxa } from "@/lib/outside/observations";
import { curatedEntries } from "@/lib/outside/curated-phenology";
import { fetchFieldTruth } from "@/lib/outside/pointmoon";
import { resolvePhenologyRegion } from "@/lib/outside/regions";
import { taxonReferences } from "@/lib/outside/taxon-reference";
import type { HabitatTag } from "@/lib/outside/types";
import type { TopicTag } from "@/schema/pack";
import { castSlug } from "./member";
import { resolveCast, type ResolvedCast } from "./resolve";

export interface LiveCastQuery {
  lat?: number | null;
  lng?: number | null;
  habitats?: HabitatTag[];
  topicTags?: readonly TopicTag[];
  /** The one lesson subject to protect from the mixed-taxon cast cap. */
  primaryTopic?: TopicTag | null;
  /** A species profile target to protect from that same cap. */
  profileSlug?: string | null;
  /**
   * Strict topic filter (nc#233): passed straight through to `resolveCast`.
   * See that file's `ResolveCastQuery.topicFilter` for the full contract —
   * off by default, and it does nothing unless `primaryTopic` maps to a taxon.
   */
  topicFilter?: boolean;
  climate?: ClimateGroup | null;
  /** The moment to resolve for; defaults to now. Injectable for tests. */
  date?: Date;
  /**
   * How many members to resolve, when a surface has a LAYOUT reason to ask for
   * fewer — the door's face strip is four wide however rich the day is.
   *
   * Unset is the ordinary case and means the count follows the context: the
   * resolver returns what the place and the lesson actually hold, bounded only
   * by `CAST_LAYOUT_MAX`. It used to default to eight, which is how a fixed
   * count came to stand in for relevance on surfaces that never asked for one
   * (#1030).
   */
  limit?: number;
  /** The class's year group, for the youngest-years safety exclusion. */
  yearGroup?: string | null;
  /** The class's ability band; decides the exclusion when it is set. */
  abilityBand?: string | null;
}

export interface LiveCast extends ResolvedCast {
  /**
   * True when Pointmoon returned nothing usable for this place. The cast may
   * still be non-empty from the regional tier; `thin` is about the READ, so a
   * surface can say "we could not see outside" without inferring it from a
   * short list.
   */
  thin: boolean;
}

const EMPTY: LiveCast = { members: [], absences: [], thin: true };

/**
 * The learner half of a class, read from its row.
 *
 * This IS legitimately stored data and is not what the ruling is about. Which
 * year group a class is, and what band it reads at, is a fact about the people
 * in the room that a school tells us once. It is not an observation about the
 * world that goes stale overnight. The ruling is about the second kind.
 */
export async function classLearnerFields(
  classId: string
): Promise<{ yearGroup: string | null; abilityBand: string | null; grounds: string[] }> {
  try {
    const klass = await prisma.class.findUnique({
      where: { id: classId },
      select: {
        yearGroup: true,
        abilityBand: true,
        grounds: true,
        groundsProfile: { select: groundsPlaceSelect },
      },
    });
    if (!klass) return { yearGroup: null, abilityBand: null, grounds: [] };
    const habitats = klass.groundsProfile?.habitats ?? klass.grounds;
    const learner = learnerContextForClass({ ...klass, grounds: habitats });
    return {
      yearGroup: klass.yearGroup ?? null,
      abilityBand: learner.abilityBand ?? null,
      grounds: Array.isArray(habitats) ? habitats : [],
    };
  } catch {
    return { yearGroup: null, abilityBand: null, grounds: [] };
  }
}

/** How deep producer-curated expectations are read for the board. */
const PHENOLOGY_DEPTH = 8;

/* ------------------------------------------------------------------- cache */

/**
 * A short, bounded, per-process memo of the pure resolution.
 *
 * Sixty seconds, because that is long enough to cover one page render's worth
 * of repeated asks and short enough that nobody could mistake it for a record.
 * The cap exists so a server that sees many locations cannot grow this without
 * bound; the oldest entry goes first, which is the right one to lose.
 */
const RESOLVE_TTL_MS = 60_000;
const RESOLVE_CACHE_MAX = 200;
const resolved = new Map<string, { cast: LiveCast; at: number }>();

function remember(key: string, cast: LiveCast): LiveCast {
  if (resolved.size >= RESOLVE_CACHE_MAX) {
    const oldest = resolved.keys().next().value;
    if (oldest !== undefined) resolved.delete(oldest);
  }
  resolved.set(key, { cast, at: Date.now() });
  return cast;
}

/** Everything that can change the answer, and nothing that cannot. */
function cacheKey(q: LiveCastQuery, region: string, day: string): string {
  return [
    typeof q.lat === "number" ? q.lat.toFixed(3) : "-",
    typeof q.lng === "number" ? q.lng.toFixed(3) : "-",
    region,
    day,
    q.limit ?? "context",
    q.yearGroup ?? "-",
    q.abilityBand ?? "-",
    [...(q.habitats ?? [])].sort().join("+"),
    [...(q.topicTags ?? [])].sort().join("+"),
    q.primaryTopic ?? "-",
    q.profileSlug ?? "-",
    q.topicFilter ? "strict" : "-",
  ].join("|");
}

/* ----------------------------------------------------------------- resolve */

/**
 * Resolve today's cast for a place, from today's read.
 *
 * Never throws. A failed read is an empty, `thin` cast; every surface that
 * reads one is written to be whole without it.
 */
export async function resolveLiveCast(query: LiveCastQuery = {}): Promise<LiveCast> {
  const profileSlug = query.profileSlug?.trim() || null;
  const {
    lat,
    lng,
    habitats,
    topicTags = [],
    primaryTopic = null,
    date = new Date(),
    limit,
  } = query;

  try {
    const climate = query.climate ?? resolveClimate(lat, lng);
    const region = resolvePhenologyRegion(lat, lng, climate);
    const key = cacheKey(
      { ...query, profileSlug },
      region,
      date.toISOString().slice(0, 10)
    );

    const hit = resolved.get(key);
    if (hit && Date.now() - hit.at < RESOLVE_TTL_MS) return hit.cast;

    const [data, references] = await Promise.all([
      fetchFieldTruth({
        lat: typeof lat === "number" ? lat : undefined,
        lng: typeof lng === "number" ? lng : undefined,
        observationTaxa: pointmoonObservationTaxa(primaryTopic),
      }),
      // What each producer-curated species IS and looks like (#321). Read once per
      // server instance from a generated file, so this is free after the first
      // request and resolves to {} if the file is missing — in which case every
      // regional member keeps its drawn plate, exactly as before.
      taxonReferences().catch(() => ({})),
    ]);

    // Pointmoon owns the upstream observation reads. Its historical tier is
    // already in the same response as today's sightings, so the cast does not
    // make a second iNaturalist request and wait for another cache/budget.
    const historical = data?.facts?.fieldSnapshot?.observations?.historical?.nearby ?? [];

    const phenology = await curatedEntries(data, date, habitats, limit === undefined ? PHENOLOGY_DEPTH : Math.max(limit, PHENOLOGY_DEPTH));
    const cast = resolveCast({
      data,
      historical,
      phenology,
      taxonReferences: references,
      yearGroup: query.yearGroup,
      abilityBand: query.abilityBand,
      topic: primaryTopic,
      profileSlug,
      topicFilter: query.topicFilter,
      // The observed line is phrased against the lesson's date, the same
      // instant phenology and the cache key use, so a replayed or future
      // lesson reads "seen 2 days ago" the same way every time (Codex review
      // on PR #960, round six).
      now: date,
    });

    // A caller's limit is a layout constraint and trims the ranked list; no
    // limit means the context decides how many there are (#1030).
    const ranked = leadWithTopic(cast.members, topicTags);
    const answer: LiveCast = {
      members: typeof limit === "number" ? ranked.slice(0, limit) : ranked,
      absences: cast.absences,
      thin: data === null,
    };

    // Unknown public slugs still resolve the generic inputs so the route can
    // prove the 404, but they must not each claim one of the bounded cache's
    // 200 slots. Cache only generic reads or a profile whose requested member
    // actually survived into the answer.
    const profileMatched =
      profileSlug === null ||
      [...answer.members, ...answer.absences].some(
        (member) => castSlug(member) === profileSlug
      );
    return profileMatched ? remember(key, answer) : answer;
  } catch {
    return EMPTY;
  }
}

/**
 * Today's lesson first (#161), the resolver's findability order underneath.
 *
 * A stable partition rather than a sort: everything the topic matches keeps
 * its relative order and moves ahead of everything it does not. The resolver
 * already ranked by how likely a child is to find the thing, and a topic day
 * should not throw that ranking away, only re-anchor it.
 *
 * A tag taxonomy cannot express (seasons, senses, weather, art) matches
 * nothing, so the order is exactly the resolver's — which is what we want,
 * not an emptied list.
 */
function leadWithTopic<T extends { iconicTaxon: string | null; scientificName: string | null }>(
  members: T[],
  topicTags: readonly TopicTag[]
): T[] {
  if (topicTags.length === 0) return members;
  const lead: T[] = [];
  const rest: T[] = [];
  for (const member of members) {
    (matchesTopic(member.iconicTaxon ?? undefined, topicTags, member.scientificName) ? lead : rest).push(member);
  }
  return lead.length === 0 ? members : [...lead, ...rest].map((m, i) => ({ ...m, sortRank: i }));
}

/** Test seam: drop the memo so a spec can resolve twice against two payloads. */
export function __clearLiveCastCache(): void {
  resolved.clear();
}

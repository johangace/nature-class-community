import { bioregionPackFor, type BioregionPackLookup } from "@/lib/bioregion-pack";
import { countryForCoords } from "./location-locale";
import { resolveSessionForPlace } from "@/lib/habitat";
import { habitatsFromFeatures, type LookForContext } from "@/lib/look-for";
import { packKeyValues, resolvePackKeyChain } from "@/lib/pack-key";
import { prisma } from "@/lib/db";
import { groundsPlaceForClass, groundsPlaceSelect } from "@/lib/grounds";
import { groundsToHabitats } from "@/lib/outside/grounds";
import { rankHabitats } from "@/lib/outside/place";
import { curatedEntries } from "@/lib/outside/curated-phenology";
import { fetchFieldTruth } from "@/lib/outside/pointmoon";
import { getActiveClass, getTeacher } from "@/lib/teacher";
import { getTryPlace } from "@/lib/try-place-server";
import { admissibleSessions } from "@/lib/validity";
import type { BioregionPack, PackKey } from "@/schema/bioregion";
import type { Pack, Session } from "@/schema/pack";

/**
 * One place, resolved once, for a whole request.
 *
 * Every surface that shows a lesson needs the same three things: which keys
 * answer for this school, which bioregion pack that lands on, and the lookup
 * array the habitat seam consumes. Composing them in one server helper is what
 * keeps the resolution out of the render tree entirely — a page calls this,
 * hands the result to two pure functions, and passes the ordinary `Session`
 * and `Pack` shapes down as it always did.
 *
 * That indirection is deliberate and is what makes this survive the #242
 * rework: no lesson surface knows the bioregion layer exists, so no lesson
 * surface can break it by being rebuilt.
 *
 * SIGNED OUT, OR WITH NO CLASS, resolves to the global chain and the empty
 * pack. Nothing filters, nothing rewrites, and every public and cold-URL
 * surface renders exactly as it did before this layer existed.
 */
export interface PlaceContext {
  chain: PackKey[];
  /** The chain as bare keys, most specific first, `global` last. */
  keys: string[];
  pack: BioregionPack;
  /** The key of the pack file that answered, or null when none did. */
  source: string | null;
  /**
   * The country the coordinates fall in, ISO 3166-1 alpha-2, or null when
   * there are no coordinates. Read by `requiresCountry` on a session's
   * validity (2026-09-08) and by nothing else.
   */
  country: string | null;
  /**
   * What is alive this week and what this class can reach, for the composed
   * "where to look" instruction (#266). Undefined when we know neither, and
   * then every such instruction renders its authored base text.
   */
  lookFor?: LookForContext;
}

/**
 * The place context for a coordinate and climate pair. Pure, no I/O beyond the
 * pack file. `lookup` exists so a guard can prove this against a pack that
 * EXISTS — see lib/bioregion-pack.ts.
 */
export function placeContextFor(
  place: { lat?: number | null; lng?: number | null; climate?: string | null },
  lookup?: BioregionPackLookup
): PlaceContext {
  const chain = resolvePackKeyChain(place);
  const resolved = bioregionPackFor(chain, lookup);
  return {
    chain,
    keys: packKeyValues(chain),
    pack: resolved.pack,
    source: resolved.source,
    country: countryForCoords(place.lat, place.lng),
  };
}

/**
 * The signed-in teacher's active class, as a place. Never throws and never
 * requires a class: a signed-out visitor gets the global context.
 */
export async function activePlaceContext(): Promise<PlaceContext> {
  try {
    const teacher = await getTeacher();
    const active = teacher ? await getActiveClass(teacher.id) : null;
    // Signed out, the place is the one the visitor chose on /start, when she
    // did (#877). No class, so no grounds: the shelf narrows by region only.
    const chosen = teacher ? null : await getTryPlace();
    const base = placeContextFor({
      lat: active?.lat ?? chosen?.lat ?? null,
      lng: active?.lng ?? chosen?.lng ?? null,
      climate: active?.climate ?? null,
    });
    if (!active) return base;

    // What is alive this week, and what this class can actually reach. Both
    // halves are allowed to be empty, and an empty half filters nothing —
    // unfilled is not evidence, the same rule the validity resolver runs on.
    const [aliveIn, reachable] = await Promise.all([
      aliveHabitatsFor(active.lat, active.lng, active.climate),
      reachableHabitatsFor(active.id, teacher!.id),
    ]);
    return { ...base, lookFor: { aliveIn, reachable } };
  } catch {
    // Paper-grade: a place we cannot resolve renders the authored base text,
    // which is the same thing every surface showed before this layer landed.
    return placeContextFor({});
  }
}

/**
 * A session with its habitat-bearing instructions resolved for this place.
 * Same shape in, same shape out.
 */
export function sessionForPlace(session: Session, place: PlaceContext): Session {
  return resolveSessionForPlace(session, place.keys);
}

/**
 * A shelf narrowed to the sessions that are TRUE here, each with its habitat
 * instructions resolved.
 *
 * Both halves are no-ops today and that is the honest shipped state: the
 * bioregion pack is empty until #209 writes the first file, and an empty
 * season ontology excludes nothing by design. What has changed is that the
 * wiring is real, so the day a Miami pack lands, Miami stops being offered the
 * autumn leaf lesson with no further code.
 */
export function shelfForPlace(packs: readonly Pack[], place: PlaceContext): Pack[] {
  return packs
    .map((pack) => ({
      ...pack,
      sessions: admissibleSessions(pack.sessions, place.pack, place.country).map((session) =>
        sessionForPlace(session, place)
      ),
    }))
    .filter((pack) => pack.sessions.length > 0);
}

/**
 * The habitats this week's regional phenology actually puts life in, commonest
 * first. Empty when we cannot locate the school or the week is thin.
 *
 * This is the half that makes the instruction know about TIME. "Look under
 * logs" is a damp-spring line, and in week 33 in southern England woodland
 * appears once in seven rows while grassland and hedgerow carry the week.
 */
async function aliveHabitatsFor(
  lat: number | null,
  lng: number | null,
  _climate: string | null
): Promise<string[]> {
  if (typeof lat !== "number" || typeof lng !== "number") return [];
  try {
    const data = await fetchFieldTruth({ lat, lng });
    const entries = await curatedEntries(data, new Date(), undefined, 8);
    return rankHabitats(entries);
  } catch {
    return [];
  }
}

/**
 * The habitats this class can reach: their grounds, plus the features inside
 * the fence they told us about (#277).
 *
 * A log pile is woodland for this purpose even in a tarmac yard, which is
 * exactly the kind of thing no map and no climate group could ever know, and
 * exactly why the teacher's half of the world matters.
 */
async function reachableHabitatsFor(classId: string, teacherId: string): Promise<string[]> {
  try {
    const row = await prisma.class.findFirst({
      where: { id: classId, teacherId },
      select: {
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
      },
    });
    if (!row) return [];
    const place = groundsPlaceForClass(row);
    return [
      ...new Set([
        ...groundsToHabitats(place.habitats),
        ...habitatsFromFeatures(place.siteFeatures),
      ]),
    ];
  } catch {
    return [];
  }
}

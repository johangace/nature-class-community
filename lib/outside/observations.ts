import type { TopicTag } from "@/schema/pack";
import type {
  FieldTruth,
  ObservationEntry,
  PointmoonObservationTaxon,
} from "./pointmoon";
import type { Sighting } from "./types";
import { isTreeGenus, needsTreeGenus } from "./tree-genera";

/**
 * Which iNaturalist iconic taxa a topic tag means (#161). A bugs day leads
 * with insects, a trees day with plants. Tags with no taxon mapping (art,
 * weather, senses...) simply do not reorder the card.
 */
const TAXA_BY_TAG: Partial<Record<TopicTag, readonly string[]>> = {
  minibeasts: ["Insecta", "Arachnida", "Mollusca"],
  birds: ["Aves"],
  // `trees` is Plantae AND a tree genus: see matchesTopic and tree-genera.ts
  // (nc#962). To the feed an oak and a thistle are the same kingdom.
  trees: ["Plantae"],
  plants: ["Plantae"],
  // The creatures a child pretends to be (nc#962): a mask lesson is about
  // foxes and owls, and before this tag nothing in the enum could say so.
  animals: ["Mammalia", "Aves", "Amphibia", "Reptilia"],
  // Decomposition (nc#1012): the fungi and the small life doing the breaking
  // down, AND the trees the leaves fell from. Plantae here is gated to a tree
  // genus (see tree-genera.ts) so "From leaf to soil" can name the oak
  // overhead without a thistle arriving with it.
  soil: ["Fungi", "Insecta", "Plantae"],
  water: ["Amphibia", "Actinopterygii", "Mollusca"],
};

/**
 * True when a sighting belongs to any of the session's tags.
 *
 * The scientific name is required, not optional, because the Plantae leg of
 * some tags cannot be answered by the iconic taxon alone: `trees` (nc#962) and
 * `soil` (nc#1012) are Plantae narrowed to a tree genus. A caller that has no
 * scientific name passes null and those lessons drop the sighting rather than
 * showing a thistle. Every other leg is unaffected.
 */
export function matchesTopic(
  taxon: string | undefined,
  tags: readonly TopicTag[],
  scientificName: string | null | undefined
): boolean {
  if (!taxon) return false;
  return tags.some((tag) => {
    if (!TAXA_BY_TAG[tag]?.includes(taxon)) return false;
    return needsTreeGenus(tag, taxon) ? isTreeGenus(scientificName) : true;
  });
}

/**
 * True when a tag can be answered by a taxon at all.
 *
 * Roughly 40% of sessions are tagged for things taxonomy cannot express —
 * seasons, senses, weather, art. For those, "does this sighting match the
 * topic?" has no meaningful answer, so filtering on it would empty the row for
 * no reason. Callers use this to tell "nothing nearby matched" (worth showing
 * nothing) from "this topic was never about species" (rank, do not filter).
 */
export function hasTaxa(tag: TopicTag): boolean {
  return TAXA_BY_TAG[tag] !== undefined;
}

const POINTMOON_OBSERVATION_TAXA = new Set<string>([
  "Plantae",
  "Insecta",
  "Aves",
  "Fungi",
  "Amphibia",
  "Mammalia",
  "Reptilia",
]);

/** The part of a lesson topic Pointmoon's observation API can express. */
export function pointmoonObservationTaxa(
  topic: TopicTag | null | undefined
): PointmoonObservationTaxon[] | undefined {
  if (!topic) return undefined;
  const taxa = (TAXA_BY_TAG[topic] ?? []).filter(
    (taxon): taxon is PointmoonObservationTaxon => POINTMOON_OBSERVATION_TAXA.has(taxon)
  );
  return taxa.length > 0 ? taxa : undefined;
}

/**
 * Photographed sightings near the school, from Pointmoon's field observations
 * (iNaturalist-backed). These are real, recent, geolocated records — the
 * "seen near your school this week" row, with real photos. Ranked by how many
 * were logged nearby, deduped by species, and only entries that actually carry
 * a name are kept. Birds fold in behind the general nearby list.
 */

function toSighting(e: ObservationEntry, i: number): Sighting | null {
  const name = e.name?.trim();
  if (!name) return null;
  return {
    id: e.scientificName?.trim() || `${name}-${i}`,
    name,
    scientificName: e.scientificName?.trim() || undefined,
    photo: e.photo ?? null,
    // Absent stays absent: a species Pointmoon sent one picture of is not the
    // same as one it sent a gallery of, and `[]` here would erase that.
    ...(e.photos?.length ? { photos: e.photos } : {}),
    presence: e.presence ?? null,
    // Compatibility only, and derived from the validated asset. A legacy bare
    // URL is intentionally lost at the Pointmoon boundary.
    photoUrl: e.photo?.url ?? null,
    count: typeof e.count === "number" ? e.count : undefined,
    iconicTaxon: e.iconicTaxon?.trim() || undefined,
  };
}

/**
 * The species worth showing on the card: the most-observed nearby records,
 * photos first. Returns [] when Pointmoon returned no observations — the
 * caller then falls back to the seasonal phenology names.
 */
export function nearbySightings(
  data: FieldTruth | null,
  limit = 5,
  topicTags: readonly TopicTag[] = []
): Sighting[] {
  const obs = data?.facts?.fieldSnapshot?.observations;
  if (!obs) return [];

  const pool = [...(obs.nearby ?? []), ...(obs.birds?.notable ?? [])];
  const seen = new Set<string>();
  const sightings: Sighting[] = [];

  pool.forEach((entry, i) => {
    const s = toSighting(entry, i);
    if (!s) return;
    const key = (s.scientificName ?? s.name).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    sightings.push(s);
  });

  // Today's lesson first (#161), then photos, then by how many were logged
  // nearby. Ranking runs over the WHOLE pool before the slice, so a matching
  // species deep in the list still surfaces on a tagged day — and on an
  // untagged day the order is exactly what it always was.
  return sightings
    .sort((a, b) => {
      const topic =
        Number(matchesTopic(b.iconicTaxon, topicTags, b.scientificName)) -
        Number(matchesTopic(a.iconicTaxon, topicTags, a.scientificName));
      if (topic !== 0) return topic;
      const photo = Number(Boolean(b.photo)) - Number(Boolean(a.photo));
      if (photo !== 0) return photo;
      return (b.count ?? 0) - (a.count ?? 0);
    })
    .slice(0, limit);
}

import { displayPhotoAsset, type DisplayPhotoAsset } from "@/lib/cast/member";
import { hasTaxa, matchesTopic } from "@/lib/outside/observations";
import type { Sighting } from "@/lib/outside/types";
import type { TopicTag } from "@/schema/pack";

export interface LessonMediaItem {
  id: string;
  name: string;
  scientificName: string | null;
  kind: "hyperlocal" | "reference";
  radiusKm: number | null;
  observedAt: string | null;
  sourceUrl: string;
  /**
   * Set only on a subject photograph fetched because no observation existed:
   * "here" was taken near the school, "anywhere" was not. Absent on a real
   * sighting, whose locality is already carried by `kind` and `radiusKm`.
   */
  locality?: "here" | "anywhere";
  /**
   * One sentence saying what this thing IS, for the moment a child asks.
   *
   * Never composed. Either the encyclopaedia's own opening sentence or that
   * sentence put into plainer words by the model and checked, word by word,
   * against it. Absent when we have a picture and no article.
   */
  definition?: string | null;
  /** The article the sentence came from, so she can check before she says it. */
  definitionSource?: string | null;
  /** True when the model rephrased it, so the surface can credit honestly. */
  photo: DisplayPhotoAsset;
}

/**
 * Build the small, rights-complete image set shared by preparation and run.
 * A nearby claim only travels when a five-kilometre presence receipt travels
 * with an exact observation photo. Every other complete image is labelled as
 * a reference, never promoted into evidence for the school grounds.
 */
export function projectLessonMedia(
  sightings: Sighting[],
  topicTags: readonly TopicTag[] = [],
  limit = 3
): LessonMediaItem[] {
  const seenSources = new Set<string>();

  /**
   * Rank, then FILTER — the second half was missing, and it is the whole bug
   * (inventory A9). Sorting matching taxa to the front only helps while enough
   * of them exist: at a thinly-recorded school a minibeasts lesson quietly fell
   * through to whatever else was nearby, so the row under a lesson about
   * insects could show a pear tree. Ranking made that rare rather than
   * impossible, which is worse, because it means it surfaces exactly where
   * nobody is testing.
   *
   * Only filter when the session is tagged for something a taxon can answer.
   * About 40% of sessions are tagged seasons / senses / weather / art, where
   * the question has no taxonomic answer at all and filtering would empty the
   * row for no reason. For those, ranking stays as it was.
   *
   * When a taxa-bearing lesson genuinely has no match nearby, this returns
   * nothing, and LessonMediaStrip already renders nothing — which is the
   * honest answer, and the one the four-material system is built on: absent is
   * a real state, not a gap to fill with something irrelevant.
   */
  const filterable = topicTags.some(hasTaxa);

  return [...sightings]
    .filter(
      (sighting) => !filterable || matchesTopic(sighting.iconicTaxon, topicTags, sighting.scientificName)
    )
    .sort(
      (a, b) =>
        Number(matchesTopic(b.iconicTaxon, topicTags, b.scientificName)) -
        Number(matchesTopic(a.iconicTaxon, topicTags, a.scientificName))
    )
    .flatMap((sighting) => {
      const photo = displayPhotoAsset({ photo: sighting.photo });
      if (!photo || seenSources.has(photo.sourceUrl)) return [];
      seenSources.add(photo.sourceUrl);

      const radius = sighting.presence?.radiusKm;
      const hyperlocal =
        photo.role === "observation" &&
        typeof radius === "number" &&
        Number.isFinite(radius) &&
        radius > 0 &&
        radius <= 5;

      return [{
        id: sighting.id,
        name: sighting.name,
        scientificName: sighting.scientificName ?? null,
        kind: hyperlocal ? "hyperlocal" as const : "reference" as const,
        radiusKm: hyperlocal ? radius : null,
        observedAt: sighting.photo?.observedAt ?? null,
        sourceUrl: photo.sourceUrl,
        photo,
      }];
    })
    .slice(0, Math.max(0, limit));
}

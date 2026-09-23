import { displayPhotoAsset, type CastMember } from "./member";
import type { Sighting } from "@/lib/outside/types";

/**
 * Lay today's real photograph over a cast member whose own image cannot be
 * released.
 *
 * A stored cast is written at onboarding and deliberately never re-reads
 * Pointmoon (lib/cast/read.ts), so a class whose cast predates the provenance
 * contract carries members whose bare `photoUrl` fails the release gate and
 * renders as a drawn plate — while the same species, observed this week, has
 * a rights-complete photograph sitting in the caller's live read. This graft
 * closes that gap at the presentation seam: WHO is in the cast is still the
 * stored answer, and a photograph is added only when today's live read holds
 * a releasable one for the very same species. The photo carries its own
 * provenance, so every downstream gate still judges it on its merits.
 */
export function withLivePhotos(
  members: readonly CastMember[],
  sightings: readonly Sighting[]
): CastMember[] {
  const liveByName = new Map<string, Sighting>();
  for (const sighting of sightings) {
    if (!sighting.photo) continue;
    for (const key of [sighting.scientificName, sighting.name]) {
      const normalized = key?.trim().toLowerCase();
      if (normalized && !liveByName.has(normalized)) liveByName.set(normalized, sighting);
    }
  }

  return members.map((member) => {
    if (displayPhotoAsset(member)) return member;
    const live =
      liveByName.get(member.scientificName?.trim().toLowerCase() ?? "") ??
      liveByName.get(member.commonName.trim().toLowerCase());
    const photo = live?.photo;
    if (!photo) return member;
    return {
      ...member,
      photoUrl: photo.url,
      photoCreator: photo.creator ?? null,
      photoRole: photo.role,
      photoAttribution: photo.attribution,
      photoLicense: photo.license,
      photoSourceUrl: photo.sourceUrl,
      photoObservationId: photo.observationId ?? null,
      // The whole gallery, not only the portrait (#984). A member reached
      // here because it had NO releasable picture of its own, so grafting one
      // and withholding the other seven would leave the species door showing
      // a single specimen for exactly the members this graft exists to fix.
      ...(live.photos?.length ? { photos: live.photos } : {}),
    };
  });
}

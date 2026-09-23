import { describe, expect, it } from "vitest";
import { resolveCast } from "@/lib/cast/resolve";
import { displayPhotoAsset, displayPhotoGallery } from "@/lib/cast/member";
import { withLivePhotos } from "@/lib/cast/enrich";
import type { CastMember } from "@/lib/cast/member";
import { parsePointmoonNatureProjection } from "@/lib/outside/pointmoon-contract";
import type { FieldTruth } from "@/lib/outside/pointmoon";

/**
 * SEVERAL SPECIMENS PER SPECIES (#984, pointmoon#153).
 *
 * The species door has wanted three specimens since #233 and could only show
 * one. These tests hold the two halves of why: that the gallery survives the
 * whole chain from payload to member, and that a deeper gallery never becomes
 * a stronger claim on the way.
 */

const near = (id: number) => ({
  url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpg`,
  role: "observation",
  creator: "Martha K.",
  attribution: "(c) Martha K., some rights reserved (CC BY)",
  license: "cc-by",
  sourceUrl: `https://www.inaturalist.org/photos/${id}`,
  observationId: "84",
  observedAt: "2026-08-14T08:30:00.000Z",
});

const elsewhere = (id: number) => ({
  url: `https://static.inaturalist.org/photos/${id}/medium.jpg`,
  role: "taxon-reference",
  creator: "Reference Photographer",
  attribution: "(c) Reference Photographer, some rights reserved (CC BY-NC)",
  license: "cc-by-nc",
  sourceUrl: `https://www.inaturalist.org/photos/${id}`,
});

function fieldTruth(photos: unknown[] | undefined): FieldTruth {
  return {
    schemaVersion: "field-truth@1.1.0",
    facts: {
      fieldSnapshot: {
        observations: {
          recentWindowDays: 7,
          nearby: [
            {
              name: "Honey bee",
              scientificName: "Apis mellifera",
              count: 4,
              iconicTaxon: "Insecta",
              yearsObserved: 3,
              sampledYears: 3,
              historicalAvgCount: 4,
              ratioToHistorical: 1,
              presence: {
                provider: "inaturalist",
                taxonId: "47219",
                observationCount: 4,
                radiusKm: 20,
                windowStart: "2026-08-07",
                windowEnd: "2026-08-14",
              },
              photo: near(42),
              ...(photos ? { photos } : {}),
            },
          ],
        },
      },
    },
  } as unknown as FieldTruth;
}

const bee = (payload: FieldTruth) =>
  resolveCast({ data: payload, phenology: [], yearGroup: "Year 1" }).members.find(
    (member) => member.scientificName === "Apis mellifera"
  );

describe("several specimens per species (#984)", () => {
  it("carries the whole gallery from payload to resolved member", () => {
    const member = bee(fieldTruth([near(42), near(43), elsewhere(900)]));
    expect(member?.photos?.map((photo) => photo.url)).toEqual([
      near(42).url,
      near(43).url,
      elsewhere(900).url,
    ]);
  });

  it("leaves `photo` and the flat fields exactly as they were", () => {
    // The whole point of an additive field: a surface that never reads
    // `photos` renders precisely what it rendered before this existed.
    const withGallery = bee(fieldTruth([near(42), near(43), elsewhere(900)]));
    const without = bee(fieldTruth(undefined));

    expect(withGallery?.photoUrl).toBe(without?.photoUrl);
    expect(withGallery?.photoRole).toBe(without?.photoRole);
    expect(withGallery?.photoLicense).toBe(without?.photoLicense);
    expect(displayPhotoAsset(withGallery!)).toEqual(displayPhotoAsset(without!));
  });

  it("a payload with no gallery leaves the member with no key at all", () => {
    // Absent, never empty. Most members are this — every regional and
    // historical one — and `[]` would make a renderer's `in` check disagree
    // with its length check.
    expect(bee(fieldTruth(undefined))).not.toHaveProperty("photos");
    expect(bee(fieldTruth([]))).not.toHaveProperty("photos");
  });

  it("renders element zero as the portrait, once", () => {
    const member = bee(fieldTruth([near(42), near(43), elsewhere(900)]))!;
    const gallery = displayPhotoGallery(member as unknown as CastMember);

    // The hero shows [0]; the strip shows the rest. If these disagreed, the
    // species door would print the same photograph twice under two headings
    // that say different things about it.
    expect(gallery[0]).toEqual(displayPhotoAsset(member));
    expect(new Set(gallery.map((photo) => photo.url)).size).toBe(gallery.length);
    expect(gallery).toHaveLength(3);
  });

  it("keeps upstream's order, so the strongest claim stays first", () => {
    // Sorting by role here would promote a picture of the species over a
    // picture of the animal somebody actually saw this week.
    const member = bee(fieldTruth([near(42), elsewhere(900), near(43)]))!;
    const gallery = displayPhotoGallery(member as unknown as CastMember);
    expect(gallery.map((photo) => photo.role)).toEqual([
      "observation",
      "taxon-reference",
      "observation",
    ]);
  });

  it("never lets a gallery upgrade what the member claims", () => {
    // A regional member with eight pictures is still regional. #33 and #233
    // are both, at bottom, about this sentence.
    const one = bee(fieldTruth([near(42)]))!;
    const many = bee(fieldTruth([near(42), near(43), elsewhere(900), elsewhere(901)]))!;
    expect(many.honestyTier).toBe(one.honestyTier);
    expect(many.lastSeenWindow).toBe(one.lastSeenWindow);
    expect(many.yearsObserved).toBe(one.yearsObserved);
  });

  it("refuses a gallery element with no usable address, at both gates", () => {
    // TWO GATES, and this asserts the one that renders. The Pointmoon
    // boundary (`projectPhotos`) drops an insecure address before a payload
    // becomes a projection, and `resolveCast` is deliberately downstream of
    // it — this test hands the resolver an unprojected payload, so the
    // element survives into `member.photos` exactly as `photoUrl` survives
    // into a legacy row. What must be true regardless of how a bad element
    // got there is that NOTHING RENDERS IT, and that is `displayPhotoAsset`,
    // one gate shared by the portrait and every element beside it.
    const member = bee(fieldTruth([near(42), { ...near(43), url: "http://insecure.test/x.jpg" }]))!;
    const gallery = displayPhotoGallery(member as unknown as CastMember);
    expect(gallery.map((photo) => photo.url)).toEqual([near(42).url]);
  });

  it("projects a gallery at the Pointmoon boundary and drops what it cannot stand behind", () => {
    const projection = parsePointmoonNatureProjection(
      fieldTruth([near(42), { ...near(43), url: "http://insecure.test/x.jpg" }, near(44)])
    );
    expect(projection.status).toBe("ready");
    const observation =
      projection.status === "ready" ? projection.observations[0] : undefined;
    expect(observation?.photos?.map((photo) => photo.url)).toEqual([near(42).url, near(44).url]);
  });

  it("the live graft lays a whole gallery over a member that had none", () => {
    // A member reaches the graft because it has no releasable picture at all;
    // giving it one and withholding the rest would leave the species door
    // showing a single specimen for exactly the members the graft is for.
    const bare = {
      commonName: "Honey bee",
      scientificName: "Apis mellifera",
      photoUrl: null,
      iconicTaxon: "Insecta",
      honestyTier: "regional",
      lastSeenWindow: null,
      yearsObserved: null,
      historicalAvgCount: null,
      safetyNote: null,
      sortRank: 0,
      absent: false,
      line: "",
    } as unknown as CastMember;

    const grafted = withLivePhotos([bare], [
      {
        id: "Apis mellifera",
        name: "Honey bee",
        scientificName: "Apis mellifera",
        photo: near(42) as never,
        photos: [near(42), near(43)] as never,
        photoUrl: near(42).url,
      },
    ])[0]!;

    expect(grafted.photoUrl).toBe(near(42).url);
    expect(displayPhotoGallery(grafted)).toHaveLength(2);
  });
});

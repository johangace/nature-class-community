import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCast } from "@/lib/cast/resolve";
import type { FieldTruth } from "@/lib/outside/pointmoon";

const openObservationPhoto = {
  url: "https://inaturalist-open-data.s3.amazonaws.com/photos/42/large.jpg",
  role: "observation",
  creator: "Martha K.",
  attribution: "(c) Martha K., some rights reserved (CC BY)",
  license: "cc-by",
  sourceUrl: "https://www.inaturalist.org/photos/42",
  observationId: "84",
  observedAt: "2026-08-14T08:30:00.000Z",
};

function fieldTruth(): FieldTruth {
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
              photo: openObservationPhoto,
              // Compatibility may remain in Pointmoon, but it is never the
              // source of authority in Nature Class.
              photoUrl: openObservationPhoto.url,
            },
          ],
        },
      },
    },
  } as unknown as FieldTruth;
}

describe("photo provenance survives the signed-in cast pipeline", () => {
  it("maps a complete observation asset into the resolved cast without reinterpreting it", () => {
    const resolved = resolveCast({ data: fieldTruth(), phenology: [], yearGroup: "Year 1" });
    const bee = resolved.members.find((member) => member.scientificName === "Apis mellifera");

    expect(bee).toMatchObject({
      photoUrl: openObservationPhoto.url,
      photoRole: "observation",
      photoAttribution: openObservationPhoto.attribution,
      photoLicense: "cc-by",
      photoSourceUrl: openObservationPhoto.sourceUrl,
      photoObservationId: openObservationPhoto.observationId,
    });
  });

  it("carries every release field through the live member contract", () => {
    // The storage layer is gone (#284): a cast resolves live per request, so
    // the release fields must ride the member type the surfaces consume, not
    // a database row.
    const member = readFileSync(path.join(process.cwd(), "lib/cast/member.ts"), "utf8");
    const resolver = readFileSync(path.join(process.cwd(), "lib/cast/resolve.ts"), "utf8");

    for (const field of [
      "photoRole",
      "photoAttribution",
      "photoLicense",
      "photoSourceUrl",
      "photoObservationId",
    ]) {
      expect(member).toMatch(new RegExp(`\\b${field}\\b`));
      expect(resolver).toMatch(new RegExp(`\\b${field}\\b`));
    }
  });

  it("never promotes a legacy bare URL to a releaseable stored asset", () => {
    const payload = fieldTruth() as unknown as {
      facts: { fieldSnapshot: { observations: { nearby: Array<Record<string, unknown>> } } };
    };
    payload.facts.fieldSnapshot.observations.nearby[0] = {
      name: "Honey bee",
      scientificName: "Apis mellifera",
      yearsObserved: 3,
      ratioToHistorical: 1,
      photoUrl: "https://legacy.example.test/bee.jpg",
    };

    const resolved = resolveCast({ data: payload as unknown as FieldTruth, phenology: [] });
    expect(resolved.members[0]).toMatchObject({
      photoUrl: null,
      photoRole: null,
      photoAttribution: null,
      photoLicense: null,
      photoSourceUrl: null,
      photoObservationId: null,
    });
  });
});

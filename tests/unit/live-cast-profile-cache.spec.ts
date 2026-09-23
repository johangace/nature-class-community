import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchFieldTruth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
  prisma: { class: { findUnique: vi.fn() } },
}));
vi.mock("@/lib/outside/pointmoon", () => ({ fetchFieldTruth }));
vi.mock("@/lib/outside/phenology", () => ({
  getPhenologyEntries: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/outside/taxon-reference", () => ({
  taxonReferences: vi.fn().mockResolvedValue({}),
}));

import { __clearLiveCastCache, resolveLiveCast } from "@/lib/cast/live";

const payload = {
  facts: {
    fieldSnapshot: {
      observations: {
        recentWindowDays: 7,
        nearby: [
          {
            name: "Honey bee",
            scientificName: "Apis mellifera",
            iconicTaxon: "Insecta",
            count: 12,
            yearsObserved: 4,
          },
        ],
      },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  __clearLiveCastCache();
  fetchFieldTruth.mockResolvedValue(payload);
});

describe("species profile live-cast caching", () => {
  it("does not let arbitrary missing slugs evict the hot generic cast", async () => {
    const base = { lat: 51.546, lng: -0.105, date: new Date("2026-08-27T12:00:00Z") };

    await resolveLiveCast(base);
    for (let index = 0; index < 200; index += 1) {
      await resolveLiveCast({ ...base, profileSlug: `missing-species-${index}` });
    }
    await resolveLiveCast(base);

    expect(fetchFieldTruth).toHaveBeenCalledTimes(201);
  });
});

describe("observed line clock (Codex review on PR #960, round six)", () => {
  it("phrases the observed line against the requested lesson date, not the wall clock", async () => {
    fetchFieldTruth.mockResolvedValue({
      facts: {
        fieldSnapshot: {
          observations: {
            recentWindowDays: 7,
            nearby: [
              {
                name: "Borage",
                scientificName: "Borago officinalis",
                iconicTaxon: "Plantae",
                count: 3,
                yearsObserved: 2,
                phenophase: {
                  provider: "inaturalist",
                  flowering: { recordCount: 1, latestObservedAt: "2026-08-15T09:00:00.000Z", license: "cc-by" },
                  fruiting: null,
                  flowerBudding: null,
                  noFlowersOrFruits: null,
                  leaves: null,
                  sampledRecordCount: 1,
                  epistemicType: "observed",
                },
              },
            ],
          },
        },
      },
    });
    const cast = await resolveLiveCast({ lat: 51.5, lng: -0.1, date: new Date("2026-08-17T12:00:00Z") });
    const borage = cast.members.find((m) => m.scientificName === "Borago officinalis");
    expect(borage?.observed).toBe("In flower, seen 2 days ago");
  });
});

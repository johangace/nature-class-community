import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("POINTMOON_FIXTURE_PATH", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("fetchFieldTruth strict observation boundary", () => {
  it("keeps weather while returning only projected observation evidence", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: "field-truth@1.1.0",
        facts: {
          fieldSnapshot: {
            weather: { current: { skyCondition: "soft rain" } },
            observations: {
              recentWindowDays: 7,
              nearby: [
                {
                  name: "Monarch",
                  scientificName: "Danaus plexippus",
                  photoUrl: "https://legacy.example.test/never-display.jpg",
                  latitude: 51.5,
                  longitude: -0.1,
                  presence: {
                    provider: "inaturalist",
                    taxonId: "48662",
                    observationCount: 3,
                    radiusKm: 10,
                    windowStart: "2026-08-06",
                    windowEnd: "2026-08-13",
                    latitude: 51.5,
                    longitude: -0.1,
                  },
                  photo: {
                    url: "https://images.example.test/monarch.jpg",
                    role: "observation",
                    creator: "A. Observer",
                    attribution: "Photo by A. Observer",
                    license: "cc-by",
                    sourceUrl: "https://source.example.test/observations/42",
                    observationId: "42",
                  },
                },
              ],
              birds: { notable: [] },
              absent: [],
            },
          },
        },
      }),
    });

    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const result = await fetchFieldTruth({ lat: 51.501, lng: -0.101 });
    const entry = result?.facts?.fieldSnapshot?.observations?.nearby?.[0];

    expect(result?.facts?.fieldSnapshot?.weather?.current?.skyCondition).toBe("soft rain");
    expect(entry).toMatchObject({
      name: "Monarch",
      scientificName: "Danaus plexippus",
      presence: {
        provider: "inaturalist",
        taxonId: "48662",
        observationCount: 3,
      },
      photo: {
        url: "https://images.example.test/monarch.jpg",
        creator: "A. Observer",
        license: "cc-by",
      },
    });
    expect(entry).not.toHaveProperty("photoUrl");
    expect(entry).not.toHaveProperty("latitude");
    expect(entry?.presence).not.toHaveProperty("latitude");
    expect(JSON.stringify(result)).not.toContain("legacy.example.test");
  });

  it("removes a stale observation slice without throwing away current weather", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: "field-truth@1.1.0",
        facts: {
          fieldSnapshot: {
            weather: { current: { skyCondition: "clear" } },
            observations: {
              validUntil: "2020-01-01T00:00:00.000Z",
              nearby: [{ name: "Stale species" }],
              birds: { notable: [] },
              absent: [],
            },
          },
        },
      }),
    });

    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
    const result = await fetchFieldTruth({ lat: 40.701, lng: -74.001 });

    expect(result?.facts?.fieldSnapshot?.weather?.current?.skyCondition).toBe("clear");
    expect(result?.facts?.fieldSnapshot?.observations).toBeUndefined();
  });
});

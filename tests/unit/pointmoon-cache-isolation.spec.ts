import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pointmoonObservationTaxa } from "@/lib/outside/observations";

/**
 * Checkpoint A on #65: "Two different school locations can never receive
 * each other's cached Outside-now data."
 *
 * HISTORY: this began as a REPRODUCING test for the #49 defect — the cache
 * was a single module-level variable, so whichever school populated it
 * first was served to every other school for 15 minutes. PR #154 fixed it
 * with a location-keyed cache, this test failed exactly as its own comment
 * predicted, and it was inverted (2026-08-10) into the guard it was always
 * meant to become: two schools, two fetches, two distinct payloads — and a
 * repeat call from school A inside the TTL still hits A's cache.
 */

const fetchMock = vi.fn();

it("maps only taxonomy-expressible lesson topics to producer scopes", () => {
  expect(pointmoonObservationTaxa("plants")).toEqual(["Plantae"]);
  expect(pointmoonObservationTaxa("seasons")).toBeUndefined();
});

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("GUARDS #49: each school gets its own fetch and its own payload, and the cache still holds per location", async () => {
  fetchMock.mockImplementation((url: string) => {
    const parsed = new URL(url);
    const lat = parsed.searchParams.get("lat");
    return Promise.resolve({
      ok: true,
      json: async () => ({ facts: { fieldSnapshot: { weather: { current: { skyCondition: `sky-for-${lat}` } } } } }),
    });
  });

  const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

  const schoolA = await fetchFieldTruth({ lat: 51.5, lng: -0.1 });
  const schoolB = await fetchFieldTruth({ lat: 40.7, lng: -74.0 }); // a different school, same process

  expect(fetchMock).toHaveBeenCalledTimes(2); // each location fetches for itself
  expect(schoolA?.facts?.fieldSnapshot?.weather?.current?.skyCondition).toBe("sky-for-51.5");
  expect(schoolB?.facts?.fieldSnapshot?.weather?.current?.skyCondition).toBe("sky-for-40.7");

  // And the cache is still a cache: school A again, inside the TTL, no new fetch.
  const schoolAAgain = await fetchFieldTruth({ lat: 51.5, lng: -0.1 });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(schoolAAgain).toEqual(schoolA);
});

it("scopes the producer request and cache by observation taxon", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ facts: { fieldSnapshot: {} } }),
  });

  const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");
  const scoped = { lat: 51.5, lng: -0.1, observationTaxa: ["Plantae"] } as const;

  await fetchFieldTruth(scoped);
  await fetchFieldTruth({ lat: 51.5, lng: -0.1 });

  expect(fetchMock).toHaveBeenCalledTimes(2);
  const scopedUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
  expect(scopedUrl.searchParams.get("observationTaxa")).toBe("Plantae");
});

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The other half of nc#1234, and the half that nearly went out wrong.
 *
 * Removing the coordinate default from `fetchFieldTruth` is right for the run
 * page, whose sentence is read aloud with no room to name a place. It is wrong
 * for the cast, which already names what it read — "Seen lately near {name},
 * the sample patch" (`lib/outside/captions.ts:63`) — and which #463 built to
 * read the sample patch ON PURPOSE for a signed-out visitor.
 *
 * Production's URL of record is signed out. So a fix that only deleted the
 * default would have emptied the public /cast and /outside, retiring a
 * deliberate design as a side effect of a bug fix, and the PR would have said
 * nothing about it because nothing in the suite was watching.
 *
 * Hence this file. The sample patch is now ASKED FOR by the surface that can
 * name it, and that request is what is pinned here — not the resulting markup,
 * which would pass just as well if the read quietly drifted somewhere else.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: {} } }),
  });
  vi.stubGlobal("fetch", fetchMock);
  // Fixture mode OFF: this is the LIVE path, which is where the regression
  // would have lived. With a fixture configured the read answers regardless
  // and the defect is invisible — which is exactly how it was nearly missed.
  vi.stubEnv("POINTMOON_FIXTURE_PATH", "");
  vi.stubEnv("CONDITIONS_LAT", "");
  vi.stubEnv("CONDITIONS_LNG", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function askedCoordinates(): Array<{ lat: string | null; lng: string | null }> {
  return fetchMock.mock.calls.map(([url]) => {
    const q = new URL(String(url)).searchParams;
    return { lat: q.get("lat"), lng: q.get("lng") };
  });
}

describe("a signed-out cast still reads the sample patch (nc#1234 / #463)", () => {
  it("asks the producer about the sample patch rather than about nowhere", async () => {
    const { readSurfaceCast } = await import("@/lib/cast/surface");
    const { SAMPLE_PATCH } = await import("@/lib/outside/pointmoon");

    const surface = await readSurfaceCast({});

    // Still honest about what it may CLAIM: no class, so no school.
    expect(surface.located, "a signed-out read must not claim to be located").toBe(false);

    const asked = askedCoordinates();
    expect(asked.length, "the signed-out cast asked about no place at all").toBeGreaterThan(0);
    for (const { lat, lng } of asked) {
      expect(Number(lat)).toBeCloseTo(SAMPLE_PATCH.lat, 3);
      expect(Number(lng)).toBeCloseTo(SAMPLE_PATCH.lng, 3);
    }
  });

  it("follows CONDITIONS_LAT/LNG when a demo is configured elsewhere", async () => {
    vi.stubEnv("CONDITIONS_LAT", "42.36");
    vi.stubEnv("CONDITIONS_LNG", "-71.06");
    const { readSurfaceCast } = await import("@/lib/cast/surface");

    await readSurfaceCast({});

    const asked = askedCoordinates();
    expect(asked.length).toBeGreaterThan(0);
    for (const { lat, lng } of asked) {
      expect(Number(lat)).toBeCloseTo(42.36, 2);
      expect(Number(lng)).toBeCloseTo(-71.06, 2);
    }
  });
});

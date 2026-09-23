import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression proof for nc#1234: a class with no coordinates must not be read
 * at somebody else's.
 *
 * `fetchFieldTruth` used to end a missing coordinate with
 * `?? Number(process.env.CONDITIONS_LAT ?? 51.546)`, so a grounding query that
 * carried no place still produced a complete, true reading — of a north London
 * grid square. The teacher's sentence and the species beside it were then a
 * real reading of somewhere that could be thousands of km from her classroom,
 * presented as hers, with nothing on screen naming the place.
 *
 * What is asserted here is the absence of a request, not the shape of a
 * response. A test that only checked the returned value would pass just as
 * happily against a silent producer, and the defect was never that the producer
 * said the wrong thing — it was that we asked it about the wrong place. So each
 * case below pins whether the network was reached at all.
 */

const fetchMock = vi.fn();

beforeEach(() => {
  vi.resetModules();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("POINTMOON_FIXTURE_PATH", "");
  vi.stubEnv("CONDITIONS_LAT", "");
  vi.stubEnv("CONDITIONS_LNG", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function okBody() {
  return {
    ok: true,
    json: async () => ({
      schemaVersion: "field-truth@1.1.0",
      facts: { fieldSnapshot: { weather: { current: { skyCondition: "soft rain" } } } },
    }),
  };
}

describe("a read with no place (nc#1234)", () => {
  it("asks nobody and returns null when the class has no coordinates", async () => {
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    await expect(fetchFieldTruth({})).resolves.toBeNull();
    await expect(fetchFieldTruth({ lat: undefined, lng: undefined })).resolves.toBeNull();

    expect(fetchMock, "a placeless read reached the producer anyway").not.toHaveBeenCalled();
  });

  it("does not read a half-known place", async () => {
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    // One coordinate is not a location, and the missing half used to be filled
    // in from the literal — which put the class on a north London meridian or
    // parallel rather than nowhere.
    await expect(fetchFieldTruth({ lat: 42.36 })).resolves.toBeNull();
    await expect(fetchFieldTruth({ lng: -71.06 })).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a non-finite coordinate as no place, not as zero", async () => {
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    await expect(fetchFieldTruth({ lat: Number.NaN, lng: Number.NaN })).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still reads the place the class does have", async () => {
    fetchMock.mockResolvedValue(okBody());
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    await expect(fetchFieldTruth({ lat: 42.36, lng: -71.06 })).resolves.not.toBeNull();

    expect(fetchMock).toHaveBeenCalled();
    const asked = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(asked).toContain("42.36");
    expect(asked, "read the class's place, not the old default").not.toContain("51.546");
  });

  it("reads 0,0 rather than calling the Atlantic nowhere", async () => {
    fetchMock.mockResolvedValue(okBody());
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    // `??` and not `||`. Null Island is a real coordinate and a falsy one, and
    // the whole defect here was a place quietly becoming a different place.
    await expect(fetchFieldTruth({ lat: 0, lng: 0 })).resolves.not.toBeNull();

    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).not.toContain("51.546");
  });

  it("keeps the configured demo place, which is the explicit way to ask for one", async () => {
    // README describes CONDITIONS_LAT/LNG as the demo school location. That
    // stays: someone configuring a demo answers "where is this?" on purpose.
    // What #1234 removed is the implicit answer when nobody did.
    vi.stubEnv("CONDITIONS_LAT", "51.546");
    vi.stubEnv("CONDITIONS_LNG", "-0.105");
    fetchMock.mockResolvedValue(okBody());
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    await expect(fetchFieldTruth({})).resolves.not.toBeNull();

    expect(fetchMock).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain("51.546");
  });
});

describe("the seam the whole argument rests on (nc#1234)", () => {
  it("leaves the authored line standing when grounding returned nothing", async () => {
    // Everything above only matters because of this: a null read has to reach
    // the teacher as the sentence the author wrote, not as a blank. Pinned
    // here because the claim "the authored line stands" is the PR's central
    // safety argument and it lives in a different file from the change.
    const { groundSessionConditions } = await import("@/lib/run/ground-conditions");
    const session = {
      id: "s1",
      topic: "trees",
      phases: [
        {
          blocks: [
            { type: "conditions-line", text: "Look at the sky and name what it is doing." },
          ],
        },
      ],
    } as never;

    expect(groundSessionConditions(session, null)).toBe(session);
  });

  it("treats a genuinely unset variable the same as a blank one", async () => {
    // Every other case here stubs the pair to "", which `envCoord` maps to NaN
    // just as it maps undefined. This is the path the helper is actually named
    // for, so it gets its own case rather than riding on that equivalence.
    vi.stubEnv("CONDITIONS_LAT", undefined);
    vi.stubEnv("CONDITIONS_LNG", undefined);
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    await expect(fetchFieldTruth({})).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a half-known place even when the demo pair is configured", async () => {
    // The half-known-place case above blanks the env, so it could not see this:
    // resolving the axes independently completed a caller's single coordinate
    // from the demo location, giving 42.36,-0.105 — a Boston latitude on a
    // London meridian, a place that is neither. Found in review (Codex, #1238).
    vi.stubEnv("CONDITIONS_LAT", "51.546");
    vi.stubEnv("CONDITIONS_LNG", "-0.105");
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    await expect(fetchFieldTruth({ lat: 42.36 })).resolves.toBeNull();
    await expect(fetchFieldTruth({ lng: -71.06 })).resolves.toBeNull();

    expect(fetchMock, "half a place resolved to a whole one").not.toHaveBeenCalled();
  });
});

describe("fixture mode is the one exception, on purpose (nc#1234)", () => {
  it("still serves the recorded payload when the caller named no place", async () => {
    // Fixture mode is dev-only — `fixturePath()` is null without
    // POINTMOON_FIXTURE_PATH, so production never takes this branch — it is
    // switched on by hand, and the recorded payload knows where it was taken
    // ("In fixture mode the payload itself knows where it was taken", the
    // fixtureLocation doc above it). Failing it closed would have bought no
    // honesty and cost the offline suite its /cast render, which is how this
    // carve-out was found: nc#808's spec went red before it existed.
    vi.stubEnv("POINTMOON_FIXTURE_PATH", "tests/fixtures/pointmoon/london_uk.json");
    const { fetchFieldTruth } = await import("@/lib/outside/pointmoon");

    await expect(fetchFieldTruth({})).resolves.not.toBeNull();

    // And it is still not a live read.
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the archive payload reader with no place (nc#1234)", () => {
  it("returns null rather than recording a corpus of the wrong place", async () => {
    const { fetchFieldTruthArchivePayload } = await import("@/lib/outside/pointmoon");

    // The nightly replay corpus is judged against later. A night recorded at a
    // default coordinate would be a real reading filed under the wrong school.
    await expect(fetchFieldTruthArchivePayload({})).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

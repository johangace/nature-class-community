import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DailyCard } from "@/app/DailyCard";
import { cardCondition, skyPhrase, feltTemperature } from "@/lib/cast/conditions";
import { getClassCast } from "@/lib/cast/read";
import { USUALLY_AROUND_CAPTION } from "@/lib/outside/captions";
import { getOutsideNow } from "@/lib/outside";
import { fetchFieldTruth } from "@/lib/outside/pointmoon";

/**
 * The honesty spine for the "outside now" read (#172), extending the #165
 * replay discipline: assert against the state the product actually launches
 * in, not the happy one.
 *
 * DAY ONE HAS NO OBSERVATIONS. A school in a quiet recording area, or one
 * whose Pointmoon read failed, gets a payload with an empty observations list
 * — which is exactly the state a demo runs on. `getOutsideNow` used to fill
 * the gap by copying the regional phenology entries into `sightings`, and the
 * card captioned them "Seen near your school lately". That is a regional guess
 * spoken as a local record, the one thing lib/cast/resolve.ts forbids:
 * "regional is never spoken as recorded".
 *
 * Every read below goes through the real client (cache, validation, ranking).
 * Each test uses its own coordinates so the location-keyed cache in
 * lib/outside/pointmoon.ts cannot serve one test's payload to another.
 */

/** The shape Pointmoon returns for a place nobody has logged anything in. */
function zeroObservationPayload() {
  return {
    schemaVersion: "field-truth@1.1.0",
    facts: {
      fieldSnapshot: {
        weather: {
          current: {
            skyCondition: "clear",
            windKph: 6,
            felt: { apparentC: 21 },
          },
        },
        // The read succeeded. There is simply nothing recorded here.
        observations: { nearby: [], birds: { notable: [] } },
      },
    },
  };
}

function stubFetchWith(payload: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("a read with zero observations never borrows the region's names", () => {
  // Berkeley, and a week the California phenology file actually carries.
  const date = new Date("2026-08-11T09:00:00Z");

  it("leaves both species lists empty without producer evidence", async () => {
    stubFetchWith(zeroObservationPayload());

    const outside = await getOutsideNow({ lat: 37.871, lng: -122.272, date });

    // The regression: not one regional entry may reach the recorded list.
    expect(outside.sightings).toEqual([]);
    // And the regional names are not lost — they are carried honestly.
    expect(outside.lookFors).toEqual([]);

    const lookForNames = new Set(outside.lookFors.map((lf) => lf.species));
    for (const sighting of outside.sightings) {
      expect(lookForNames.has(sighting.name)).toBe(false);
    }
  });

  it("renders no 'Seen near' claim when nothing was actually seen", async () => {
    // Ported from the OutsideNowCard this replaced (#172 workstream B). The
    // assertion is the same invariant against the surface that now ships: the
    // regional tier must never reach the card wearing a sighting's words.
    stubFetchWith(zeroObservationPayload());

    const data = await fetchFieldTruth({ lat: 37.881, lng: -122.282 });
    const cast = await getClassCast(null, { lat: 37.881, lng: -122.282, date });

    const markup = renderToStaticMarkup(
      createElement(DailyCard, {
        data: {
          condition: cardCondition(data),
          temperature: feltTemperature(data),
          sky: skyPhrase(data),
          cast,
          summary: null,
        },
        scope: "school" as const,
      })
    );

    expect(markup).not.toContain("Seen near");
    // No producer species evidence means a complete empty state.
    expect(cast.members).toEqual([]);
    expect(markup).not.toContain(USUALLY_AROUND_CAPTION);
    expect(markup).not.toContain("cast-portrait-plate");
    expect(markup).not.toContain("cast-portrait-seen");
  });

  it("still surfaces real observations when the read has them", async () => {
    // The other half of the contract: subtraction must not cost the good case.
    stubFetchWith({
      schemaVersion: "field-truth@1.1.0",
      facts: {
        fieldSnapshot: {
          observations: {
            nearby: [
              { name: "Monarch", scientificName: "Danaus plexippus", count: 9, photoUrl: "https://example.test/m.jpg" },
              { name: "Western Fence Lizard", scientificName: "Sceloporus occidentalis", count: 4 },
            ],
          },
        },
      },
    });

    const outside = await getOutsideNow({ lat: 37.891, lng: -122.292, date });

    expect(outside.sightings.map((s) => s.name)).toEqual(["Monarch", "Western Fence Lizard"]);
  });
});

describe("the demo fixture flag", () => {
  const fixture = "tests/fixtures/pointmoon/berkeley_ca.json";

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("serves the recorded payload off disk and never touches the network", async () => {
    const fetchMock = stubFetchWith({ facts: { fieldSnapshot: {} } });
    vi.stubEnv("POINTMOON_FIXTURE_PATH", fixture);

    const data = await fetchFieldTruth({ lat: 10.001, lng: 10.001 });

    expect(fetchMock).not.toHaveBeenCalled();
    // The real Berkeley corpus: observations, not an empty stub.
    expect(data?.facts?.fieldSnapshot?.observations?.nearby?.length).toBeGreaterThan(0);
    // Loud by construction: a recorded payload always says so in the log.
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("FIXTURE MODE"));
  });

  it("leaves the live path completely untouched when the flag is absent", async () => {
    const fetchMock = stubFetchWith({ schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: { observations: { nearby: [{ name: "Live Gull" }] } } } });

    const data = await fetchFieldTruth({ lat: 10.002, lng: 10.002 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe("Live Gull");
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("refuses the flag in production", async () => {
    const fetchMock = stubFetchWith({ schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: { observations: { nearby: [{ name: "Live Gull" }] } } } });
    vi.stubEnv("POINTMOON_FIXTURE_PATH", fixture);
    vi.stubEnv("NODE_ENV", "production");

    const data = await fetchFieldTruth({ lat: 10.003, lng: 10.003 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe("Live Gull");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("REFUSING"));
  });

  /**
   * THE ISOLATING FIXTURE for #284's first half.
   *
   * This is the exact environment `.env.local` carried for weeks: the Berkeley
   * corpus pinned, `DEMO_MODE=1` alongside it, a production build. The old
   * fence read that pair as permission and served Berkeley to every location.
   *
   * The mutation proof is direct: restore `&& process.env.DEMO_MODE !== "1"`
   * to the guard in lib/outside/pointmoon.ts and this test goes red on the
   * fetch count while every other test in this file stays green — no other
   * assertion in the suite distinguishes the two versions of the fence.
   */
  it("refuses the flag in production even when DEMO_MODE=1 accompanies it", async () => {
    const fetchMock = stubFetchWith({ schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: { observations: { nearby: [{ name: "Live Gull" }] } } } });
    vi.stubEnv("POINTMOON_FIXTURE_PATH", fixture);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_MODE", "1");

    const data = await fetchFieldTruth({ lat: 10.004, lng: 10.004 });

    // The network was read. Not the recording. That is the whole assertion:
    // the refusal LOG is a once-per-process latch already spent by the test
    // above, so behaviour is the only honest thing to check here.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe("Live Gull");
  });

  it("refuses a path that climbs out of the app directory", async () => {
    const fetchMock = stubFetchWith({ schemaVersion: "field-truth@1.1.0", facts: { fieldSnapshot: { observations: { nearby: [{ name: "Live Gull" }] } } } });
    vi.stubEnv("POINTMOON_FIXTURE_PATH", "../../etc/passwd");

    const data = await fetchFieldTruth({ lat: 10.005, lng: 10.005 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(data?.facts?.fieldSnapshot?.observations?.nearby?.[0]?.name).toBe("Live Gull");
  });

  it("serves nothing rather than quietly reverting to live when the fixture is broken", async () => {
    const fetchMock = stubFetchWith({ facts: { fieldSnapshot: {} } });
    vi.stubEnv("POINTMOON_FIXTURE_PATH", "tests/fixtures/pointmoon/does-not-exist.json");

    const data = await fetchFieldTruth({ lat: 10.006, lng: 10.006 });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(data).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("FIXTURE MODE"));
  });
});

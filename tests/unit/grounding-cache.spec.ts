import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A LONGER PER-TEST BUDGET, BECAUSE THE CLOCK IS MEASURING THE MACHINE (#593).
 *
 * Every test in this file reaches its subject through `await import(...)`
 * inside the test body — the mocks have to be in place before the module
 * graph is built, so the import cannot be hoisted out. That makes each test's
 * elapsed time mostly COMPILATION, and compilation time depends on what else
 * the suite is doing rather than on what this test asserts.
 *
 * In isolation these files run in about seven seconds. In a full parallel run
 * the same imports take orders of magnitude longer, and tests began failing
 * the 5s default intermittently — a different one each run, which is the tell
 * that it is contention and not a defect. Confirmed by stashing the branch
 * under test: the same failures on unmodified main.
 *
 * The number is deliberately generous and deliberately per-file rather than
 * global. Raising the default everywhere would hide a genuinely slow test
 * somewhere else; this says only that THIS file's clock is dominated by a
 * bundler, not by the work being measured.
 *
 * It buys time, it does not hide a hang: a test that never resolves still
 * fails, twenty seconds later.
 */
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });


/**
 * THE COMPOSED-LINE CACHE IS KEYED BY LOCALE.
 *
 * `getGroundedConditions` caches the model's line per session, place, weather
 * shape and day, so one lesson does not pay for a model call on every page
 * that mounts a conditions block. The locale was not part of that key.
 *
 * Two classes can share a session and a place and NOT share a locale — a US
 * school and a UK school on the same lesson, or the same school read with an
 * explicit `?locale=` override. Whichever one warmed the entry first decided
 * the units for the other, and the wrong one would have been served a line
 * saying "thirteen degrees" to a class expecting Fahrenheit, in the register a
 * teacher reads ALOUD. Fifteen minutes of it, silently, with nothing in the
 * logs to say why.
 *
 * The fix was one string. It shipped in #196 with no test, which is what this
 * file is: the pin for the risk, not a new claim about it.
 *
 * Every test drives the real `getGroundedConditions`. Only the two genuine
 * outside edges are stubbed: the model (never called for real in a test) and
 * Pointmoon's fetch. The cache, the key, the fact block and the locale
 * derivation are all the shipping code.
 */

const draftGroundingLine = vi.fn();
const isModelAvailable = vi.fn(() => true);

vi.mock("@/lib/ai/plate-draft", () => ({
  groundingLine: (...args: unknown[]) => draftGroundingLine(...args),
}));
vi.mock("@/lib/ai/model", () => ({
  isModelAvailable: () => isModelAvailable(),
}));

/**
 * A read with a photographed observation in it, so the fact block is never
 * empty and the model is genuinely reached. Berkeley's real morning
 * temperature: 12.8C is 13C and 55F, two numbers nobody confuses.
 */
function payload() {
  return {
    schemaVersion: "field-truth@1.1.0",
    facts: {
      fieldSnapshot: {
        weather: {
          current: {
            skyCondition: "clear",
            windKph: 6.3,
            felt: { apparentC: 12.8 },
          },
        },
        observations: {
          nearby: [
            {
              name: "Monarch",
              scientificName: "Danaus plexippus",
              count: 9,
              iconicTaxon: "Insecta",
              photo: {
                url: "https://images.example.test/monarch.jpg", role: "observation",
                creator: "A. Observer", attribution: "Photo by A. Observer", license: "cc-by",
                sourceUrl: "https://source.example.test/observations/42", observationId: "42",
              },
            },
          ],
        },
      },
    },
  };
}

/** A place nobody else in the suite uses, so the Pointmoon cache is ours. */
const PLACE = { lat: 41.101, lng: -73.101 };

/** Fresh session id per test: the line cache is module-level and long-lived. */
let n = 0;
const session = () => `cache-spec-${++n}`;

async function grounded(sessionId: string, locale: "uk" | "us") {
  const { getGroundedConditions } = await import("@/lib/grounding");
  return getGroundedConditions({
    ...PLACE,
    sessionId,
    topic: "minibeasts",
    teacher: true,
    locale,
  });
}

/** The fact block handed to the model on the nth call. */
const factsOnCall = (i: number) => String(draftGroundingLine.mock.calls[i]?.[0] ?? "");

beforeEach(() => {
  draftGroundingLine.mockReset();
  draftGroundingLine.mockImplementation(async (facts: string) =>
    facts.includes("°F") ? "A US line." : "A UK line."
  );
  isModelAvailable.mockReturnValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(payload()), { status: 200 }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("two locales, one session and place, are cached independently", () => {
  it("composes once per locale rather than serving the first one's units to both", async () => {
    const id = session();

    const uk = await grounded(id, "uk");
    const us = await grounded(id, "us");

    // The whole point: the second locale is a MISS, so it gets its own line.
    expect(draftGroundingLine).toHaveBeenCalledTimes(2);
    expect(uk.line).toBe("A UK line.");
    expect(us.line).toBe("A US line.");
    expect(uk.line).not.toBe(us.line);
  });

  it("hands the model each locale's own units, not just its own cache slot", async () => {
    // A key that separates the entries but a fact block that still says 13°C
    // would be the same bug with an extra cache miss. Assert the payload.
    const id = session();
    await grounded(id, "uk");
    await grounded(id, "us");

    expect(factsOnCall(0)).toContain("13°C");
    expect(factsOnCall(0)).not.toContain("°F");
    expect(factsOnCall(1)).toContain("55°F");
    expect(factsOnCall(1)).not.toContain("°C");
  });

  it("does not care which locale arrives first", async () => {
    const id = session();
    const us = await grounded(id, "us");
    const uk = await grounded(id, "uk");

    expect(draftGroundingLine).toHaveBeenCalledTimes(2);
    expect(us.line).toBe("A US line.");
    expect(uk.line).toBe("A UK line.");
  });
});

describe("the cache still caches", () => {
  it("serves a repeat of the SAME locale without calling the model again", async () => {
    const id = session();

    const first = await grounded(id, "uk");
    expect(draftGroundingLine).toHaveBeenCalledTimes(1);

    const second = await grounded(id, "uk");
    // Still one call: the locale key must not have turned the cache off.
    expect(draftGroundingLine).toHaveBeenCalledTimes(1);
    expect(second.line).toBe(first.line);
  });

  it("keeps caching each locale after both are warm", async () => {
    const id = session();
    await grounded(id, "uk");
    await grounded(id, "us");
    expect(draftGroundingLine).toHaveBeenCalledTimes(2);

    const ukAgain = await grounded(id, "uk");
    const usAgain = await grounded(id, "us");

    expect(draftGroundingLine).toHaveBeenCalledTimes(2);
    expect(ukAgain.line).toBe("A UK line.");
    expect(usAgain.line).toBe("A US line.");
  });

  it("keeps different sessions apart, as it always did", async () => {
    const a = session();
    const b = session();
    await grounded(a, "uk");
    await grounded(b, "uk");
    expect(draftGroundingLine).toHaveBeenCalledTimes(2);
  });
});

describe("the locale reaching the cache is the one the caller meant", () => {
  it("derives it from the coordinates when the caller does not state it", async () => {
    const { getGroundedConditions } = await import("@/lib/grounding");
    const id = session();

    // Berkeley: US by coordinates, with no explicit locale passed.
    await getGroundedConditions({
      lat: 37.871,
      lng: -122.273,
      sessionId: id,
      teacher: true,
    });

    expect(factsOnCall(0)).toContain("55°F");
  });

  it("never spends the model when there is no teacher behind the request", async () => {
    // The cold-URL demo gate, unchanged by any of this.
    const { getGroundedConditions } = await import("@/lib/grounding");
    await getGroundedConditions({ ...PLACE, sessionId: session(), teacher: false });
    expect(draftGroundingLine).not.toHaveBeenCalled();
  });

  it("falls back to the deterministic line in the caller's units when the model is off", async () => {
    isModelAvailable.mockReturnValue(false);
    const { getGroundedConditions } = await import("@/lib/grounding");

    const us = await getGroundedConditions({
      ...PLACE,
      sessionId: session(),
      teacher: true,
      locale: "us",
    });

    expect(draftGroundingLine).not.toHaveBeenCalled();
    expect(us.line).toContain("55 degrees");
  });
});

/**
 * THE SAME KEY, ONE DIMENSION SHARPER: THE CLASS'S OWN HABITATS.
 *
 * The grounded line is now composed from what this class can actually reach —
 * her grounds plus the site features she told us about — rather than from the
 * whole region's week. Before that, a school with a pond and a wild corner
 * read the same sentence as a school on bare tarmac two streets away, and
 * everything she said about her own grounds reached the cast and nothing else.
 *
 * That fix creates exactly the bug the locale tests above pin, one step
 * sharper. Two schools can share a coordinate to three decimal places and NOT
 * share a pond. Without the habitats in the cache key, the first class to warm
 * the entry decides what the OTHER school's class goes looking for, for
 * fifteen minutes, silently.
 *
 * ISOLATION. These tests carry their own payload, whose observation is
 * rights-complete, so `seenNearby` is never empty and the model is reached on
 * every call whatever the habitat filter does to the regional week. Without
 * that, the assertions would be measuring the phenology corpus for whatever
 * week the suite happens to run in — a filter that legitimately empties the
 * week is not a cache miss, and a test that cannot tell the two apart passes
 * in August and fails in January.
 *
 * MUTATION PROOF: drop `patch` from the cache key in lib/grounding.ts and the
 * first test fails on the call count, because the second school is served the
 * first school's line.
 */
describe("two schools, one place, different grounds", () => {
  /** Rights-complete, so it survives the release gate and always reaches the facts. */
  const photo = {
    url: "https://inaturalist-open-data.s3.amazonaws.com/photos/77/large.jpg",
    role: "observation",
    creator: "Martha K.",
    attribution: "(c) Martha K., some rights reserved (CC BY)",
    license: "cc-by",
    sourceUrl: "https://www.inaturalist.org/photos/77",
    observedAt: "2026-08-14T08:30:00.000Z",
  };

  function photographedPayload() {
    return {
      schemaVersion: "field-truth@1.1.0",
    facts: {
        fieldSnapshot: {
          weather: {
            current: { skyCondition: "clear", windKph: 6.3, felt: { apparentC: 12.8 } },
          },
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
                photo,
                photoUrl: photo.url,
              },
            ],
          },
        },
      },
    };
  }

  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(photographedPayload()), { status: 200 }))
    );
  });

  /**
   * Its own coordinate, not the shared `PLACE`.
   *
   * `fetchFieldTruth` caches per place for the life of the module, so a block
   * that reused `PLACE` would be served whatever payload the locale tests
   * above warmed it with, and this block's rights-complete observation would
   * never load. That is what made the first draft of these tests measure the
   * phenology corpus instead of the cache key.
   */
  const OWN_PLACE = { lat: 51.501, lng: -0.141 };

  async function groundedWith(sessionId: string, habitats: string[] | undefined) {
    const { getGroundedConditions } = await import("@/lib/grounding");
    return getGroundedConditions({
      ...OWN_PLACE,
      sessionId,
      topic: "minibeasts",
      teacher: true,
      locale: "uk",
      habitats,
    });
  }

  it("composes once per set of habitats rather than serving the first school's line to both", async () => {
    const id = session();

    await groundedWith(id, ["pond", "woodland"]);
    await groundedWith(id, ["playing_field"]);

    // The second school is a MISS. Without the habitats in the key it is a
    // hit, and a tarmac school is told to go and look at a pond.
    expect(draftGroundingLine).toHaveBeenCalledTimes(2);
  });

  it("treats the same habitats in a different order as the same school", async () => {
    const id = session();

    await groundedWith(id, ["pond", "woodland"]);
    await groundedWith(id, ["woodland", "pond"]);

    // Sorted into the key: a set is a set. Otherwise every reordering of the
    // same answers pays for another model call and can hand a teacher who
    // changed nothing a different line.
    expect(draftGroundingLine).toHaveBeenCalledTimes(1);
  });

  it("keeps a school that has answered apart from one that has not", async () => {
    const id = session();

    await groundedWith(id, undefined);
    await groundedWith(id, ["pond"]);

    expect(draftGroundingLine).toHaveBeenCalledTimes(2);
  });

  it("still composes a line for a teacher who has told us nothing", async () => {
    // Unfilled is not evidence. A teacher who skipped the question gets the
    // region's week, never an empty one — the same rule the validity resolver
    // and the look-for seam run on. This is the guard against an empty list
    // being read downstream as "filter to nothing".
    const empty = await groundedWith(session(), []);

    expect(draftGroundingLine).toHaveBeenCalledTimes(1);
    expect(empty.line).toBe("A UK line.");
  });

  it("degrades to the region when every stored habitat is one we no longer recognise", async () => {
    // A value that stops being a tag must fall back to the region, not filter
    // the week to nothing and render as a school with no wildlife.
    const line = await groundedWith(session(), ["carpark", "not_a_habitat"]);

    expect(draftGroundingLine).toHaveBeenCalledTimes(1);
    expect(line.line).toBe("A UK line.");
  });
});

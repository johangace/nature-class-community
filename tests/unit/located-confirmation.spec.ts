import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmLocation } from "@/app/start/location-state";
import { readResolvedPlace } from "@/lib/outside/place";
import type { FieldTruth } from "@/lib/outside/pointmoon";

/**
 * The location step says which place it landed on (#315).
 *
 * ── THE BUG THESE COVER ────────────────────────────────────────────────────
 *
 * Onboarding's location step took coordinates from `navigator.geolocation`,
 * handed them to `/api/outside`, and rendered the sky and species that came
 * back. Nothing on the screen named the place. A teacher on a desktop behind a
 * VPN, or on a school network whose carrier gateway exits in another country,
 * got a card about somewhere she has never been, drawn pixel for pixel like a
 * correct one. She is standing in the real place, so she is the only person
 * who could have caught it, and the screen gave her nothing to catch it with.
 *
 * That is why a class read Albanian phenology (#305) for as long as it did.
 * The wrong file was one half; a location nobody could contradict was the
 * other, and the second half is what made the first half invisible.
 *
 * The invariant under test is falsifiability, not prettiness. Every located
 * state must put something on screen that a teacher standing in her own
 * playground can disagree with, and no state may invent one.
 */

const LONDON = { lat: 51.5461234, lng: -0.1054321 };

describe("readResolvedPlace", () => {
  it("reads the name and the full address off a Pointmoon payload", () => {
    // The shape Pointmoon actually serves: the name on `placeName`, the
    // address buried in the geocoder's evidence lines.
    const data: FieldTruth = {
      facts: {
        fieldSnapshot: {
          place: {
            placeName: "Canonbury",
            evidence: [
              "placeKind=unknown",
              "access=public",
              "displayName=Highbury Corner, Canonbury, London Borough of Islington, Greater London, England, N5 1RA, United Kingdom",
              "category=amenity",
            ],
          },
        },
      },
    };

    expect(readResolvedPlace(data)).toEqual({
      name: "Canonbury",
      address:
        "Highbury Corner, Canonbury, London Borough of Islington, Greater London, England, N5 1RA, United Kingdom",
    });
  });

  it("keeps the name when the evidence carries no address", () => {
    const data: FieldTruth = {
      facts: { fieldSnapshot: { place: { placeName: "Downtown Berkeley", evidence: [] } } },
    };

    expect(readResolvedPlace(data)).toEqual({ name: "Downtown Berkeley", address: null });
  });

  it("keeps the address when the point has no name", () => {
    const data: FieldTruth = {
      facts: {
        fieldSnapshot: {
          place: {
            placeName: null,
            evidence: ["displayName=Rruga e Dibrës, Tirana, Albania"],
          },
        },
      },
    };

    expect(readResolvedPlace(data)).toEqual({
      name: null,
      address: "Rruga e Dibrës, Tirana, Albania",
    });
  });

  it("says nothing rather than inventing a place when the read carried none", () => {
    // The rule the rest of lib/outside/place.ts runs on: it reads, it never
    // infers. A thin payload means the surface says it could not name the
    // point, which is a falsifiable sentence. A guessed name is not.
    expect(readResolvedPlace(null)).toBeNull();
    expect(readResolvedPlace({})).toBeNull();
    expect(readResolvedPlace({ facts: { fieldSnapshot: { weather: {} } } })).toBeNull();
    expect(
      readResolvedPlace({ facts: { fieldSnapshot: { place: { placeName: "  ", evidence: [] } } } })
    ).toBeNull();
  });
});

describe("confirmLocation", () => {
  it("names the place the browser landed on, and the coordinates behind it", () => {
    const said = confirmLocation({
      route: "browser",
      ...LONDON,
      place: {
        name: "Canonbury",
        address: "Canonbury, London Borough of Islington, Greater London, England, United Kingdom",
      },
      pickedLabel: null,
    });

    expect(said.headline).toBe("Canonbury");
    expect(said.label).toBe("Canonbury");
    // Three decimals: the precision the class row actually keeps.
    expect(said.provenance).toBe("Your browser gave us this position, at 51.546, -0.105.");
    expect(said.address).toContain("United Kingdom");
    expect(said.unnamed).toBeNull();
  });

  it("restates the label she picked, rather than the map's name for the same point", () => {
    // The typed route was already better than the tapped one, because she
    // chose a labelled result. What it never did was say the label back: it
    // dropped it into the input field, where it is text she can type over and
    // the next search wipes.
    const said = confirmLocation({
      route: "typed",
      lat: 51.513,
      lng: -0.305,
      place: { name: "Canonbury", address: null },
      pickedLabel: "St Mary's Primary School, Ealing, London, W5, England",
    });

    expect(said.headline).toBe("St Mary's Primary School, Ealing, London, W5, England");
    expect(said.provenance).toBe("You picked this from the search, at 51.513, -0.305.");
  });

  it("falls back to the map's name when the browser found the place and nobody typed", () => {
    const said = confirmLocation({
      route: "browser",
      ...LONDON,
      place: { name: "Canonbury", address: null },
    });

    expect(said.headline).toBe("Canonbury");
  });

  it("shows the coordinates and admits it when the point cannot be named", () => {
    // The state that must not be silent. Coordinates alone are a weak label
    // and a real one: a teacher who knows her school is not at 41.3 north can
    // act on them, and she can do nothing at all with a blank card.
    const said = confirmLocation({
      route: "browser",
      lat: 41.3275,
      lng: 19.8187,
      place: null,
    });

    expect(said.headline).toBe("The point at 41.328, 19.819");
    // Nothing to label the map with either, and it says so rather than
    // captioning the tiles with a guess.
    expect(said.label).toBeNull();
    expect(said.unnamed).toContain("could not put a place name to it");
    expect(said.address).toBeNull();
  });

  it("does not say the same address twice when it is already the headline", () => {
    const address = "Rruga e Dibrës, Tirana, Albania";
    const said = confirmLocation({
      route: "browser",
      lat: 41.3275,
      lng: 19.8187,
      place: { name: null, address },
    });

    expect(said.headline).toBe(address);
    expect(said.address).toBeNull();
    expect(said.unnamed).toBeNull();
  });

  it("does not claim a provenance it cannot know for a resumed class", () => {
    // A reload mid-flow lands back on this step holding coordinates from an
    // earlier run. Saying "your browser gave us this" there would be a guess
    // about provenance, which is the one thing this confirmation exists to
    // stop making.
    const said = confirmLocation({
      route: "restored",
      ...LONDON,
      place: { name: "Canonbury", address: null },
    });

    expect(said.provenance).toBe(
      "This is your saved position, at 51.546, -0.105."
    );
  });

  it("says something falsifiable in every located state", () => {
    const states = [
      { route: "browser" as const, place: null },
      { route: "browser" as const, place: { name: "Canonbury", address: null } },
      { route: "typed" as const, place: null, pickedLabel: "Ealing, London" },
      { route: "restored" as const, place: { name: null, address: "Tirana, Albania" } },
    ];

    for (const state of states) {
      const said = confirmLocation({ ...LONDON, ...state });
      // The coordinates are on screen in every state, because they are the
      // one thing always known.
      expect(said.provenance).toContain("51.546, -0.105");
      // And the place is either named, or the failure to name it is said out
      // loud. Never neither, which is what the step did before.
      const named = state.place?.name ?? state.place?.address ?? state.pickedLabel ?? null;
      if (named) {
        expect(said.headline).toContain(named);
        expect(said.unnamed).toBeNull();
      } else {
        expect(said.unnamed).not.toBeNull();
      }
    }
  });
});

describe("the recorded Pointmoon corpus", () => {
  it("names every city in the fixture corpus that carries a place", async () => {
    // Read against the payloads actually recorded from the producer, not a
    // shape we invented. The unit tests in #284 passed for months against a
    // vocabulary Pointmoon does not speak, and the lesson taken there applies
    // to every new reader of this payload.
    const { readFile } = await import("node:fs/promises");
    const expected: Record<string, string> = {
      london_uk: "Canonbury",
      berkeley_ca: "Downtown Berkeley",
      phoenix_az: "Central City",
    };

    for (const [file, name] of Object.entries(expected)) {
      const raw: unknown = JSON.parse(
        await readFile(`tests/fixtures/pointmoon/${file}.json`, "utf8")
      );
      const read = readResolvedPlace(raw as FieldTruth);
      expect(read?.name, file).toBe(name);
      expect(read?.address, file).toContain(",");
    }
  });

  it("stays silent on the thin payload, which carries no place at all", async () => {
    const { readFile } = await import("node:fs/promises");
    const raw: unknown = JSON.parse(
      await readFile("tests/fixtures/pointmoon/thin_patch.json", "utf8")
    );
    expect(readResolvedPlace(raw as FieldTruth)).toBeNull();
  });
});

describe("the house style holds in what this step says", () => {
  it("uses no em dashes and no all-caps in any composed line", () => {
    const said = confirmLocation({
      route: "browser",
      ...LONDON,
      place: { name: "Canonbury", address: "Canonbury, Greater London, United Kingdom" },
    });
    const unnamed = confirmLocation({ route: "browser", ...LONDON, place: null });

    for (const line of [
      said.headline,
      said.provenance,
      said.address,
      unnamed.headline,
      unnamed.unnamed,
    ]) {
      expect(line ?? "").not.toContain("—");
      // A shouted word of three letters or more, ignoring the place names we
      // quote verbatim from the geocoder.
      expect(/\b[A-Z]{3,}\b/.test((line ?? "").replace(/Canonbury|London|United Kingdom/g, ""))).toBe(
        false
      );
    }
  });
});

describe("the wiring actually reaches the screen", () => {
  /**
   * A reach guard, in the spirit of place-wiring-coverage.spec.ts. Every piece
   * below was correct on its own for months and connected to nothing, which is
   * the failure mode a behavioural test cannot see: the reader worked, the
   * payload carried the data, and no surface asked for it.
   */
  const read = (file: string) => readFileSync(file, "utf8");

  it("forwards the place from /api/outside instead of composing it twice", () => {
    expect(read("app/api/outside/route.ts")).toContain("place: outside.place");
  });

  it("labels the fix on the location step, by both routes in", () => {
    const flow = read("app/start/StartFlow.tsx");
    expect(flow).toContain("confirmLocation(");
    // The picture beside the words: the step confirms the place with a map of
    // it, not with the day's weather and species. Answering "where do you go
    // outside?" with today's conditions buried the one claim a teacher
    // standing in her own playground could catch.
    expect(flow).toContain("<PlaceMap");
    expect(flow).not.toContain("LiveOutside");
    // The picked label is held in state, not left in the input field where
    // the next search wipes it.
    expect(flow).toContain("setPicked(match.label)");
    // And the label comes with a way to disagree with it.
    expect(flow).toContain("clearLocation");
  });

  it("composes the place inside the one server-side read", () => {
    expect(read("lib/outside/index.ts")).toContain("readResolvedPlace(data)");
  });

  it("still passes no country bias to the geocoder", () => {
    // #315 weighed `countrycodes` and declined it: the class's jurisdiction is
    // not known at this point in the flow, so any bias is a guess that removes
    // the true row from a list she cannot see the reasoning behind. If this
    // ever changes it should change deliberately, with the reasoning in the
    // module header updated to match.
    const geocode = read("lib/outside/geocode.ts");
    expect(geocode).not.toContain('searchParams.set("countrycodes"');
    expect(geocode).toContain("countrycodes");
  });
});

describe("the projection carries a place across the client boundary", () => {
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

  it("keeps the name and the address, and drops the rest of the place object", () => {
    // `validateFieldTruth` projected weather and observations and dropped
    // everything else, which is why the place data was on the wire and
    // invisible for months. Two fields cross, and only two.
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: "field-truth@1.1.0",
        facts: {
          fieldSnapshot: {
            weather: { current: { skyCondition: "soft rain" } },
            place: {
              placeName: "Canonbury",
              provider: "osm",
              resolutionStatus: "partial",
              canopyProxy: 0.14,
              nearbyPlaces: [],
              evidence: ["displayName=Highbury Corner, Canonbury, England, United Kingdom"],
            },
          },
        },
      }),
    });

    return import("@/lib/outside/pointmoon").then(async ({ fetchFieldTruth }) => {
      const result = await fetchFieldTruth({ lat: 51.546, lng: -0.105 });
      const place = result?.facts?.fieldSnapshot?.place;

      expect(place?.placeName).toBe("Canonbury");
      expect(place).not.toHaveProperty("provider");
      expect(place).not.toHaveProperty("canopyProxy");
      expect(place).not.toHaveProperty("nearbyPlaces");
      // The weather slice is untouched by the addition.
      expect(result?.facts?.fieldSnapshot?.weather?.current?.skyCondition).toBe("soft rain");

      expect(readResolvedPlace(result)).toEqual({
        name: "Canonbury",
        address: "Highbury Corner, Canonbury, England, United Kingdom",
      });
    });
  });

  it("omits the place entirely when the payload has nothing to say about one", () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        schemaVersion: "field-truth@1.1.0",
        facts: { fieldSnapshot: { weather: { current: { skyCondition: "clear" } } } },
      }),
    });

    return import("@/lib/outside/pointmoon").then(async ({ fetchFieldTruth }) => {
      const result = await fetchFieldTruth({ lat: 40.701, lng: -74.001 });
      expect(result?.facts?.fieldSnapshot?.place).toBeUndefined();
      expect(readResolvedPlace(result)).toBeNull();
    });
  });
});

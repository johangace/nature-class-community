import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cast/surface", () => ({ readSurfaceCast: vi.fn(), CAST_DEPTH: 12 }));
vi.mock("@/lib/outside/pointmoon", () => ({ fetchFieldTruth: vi.fn() }));

import { getTodayRead } from "@/lib/outside/today";
import { readSurfaceCast } from "@/lib/cast/surface";
import { fetchFieldTruth } from "@/lib/outside/pointmoon";
import type { CastMember } from "@/lib/cast/member";

function member(over: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Blackberry",
    scientificName: "Rubus fruticosus",
    photoUrl: "https://inat.example/a.jpg",
    photoRole: "taxon-reference",
    iconicTaxon: "Plantae",
    honestyTier: "regional",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "",
    ...over,
  };
}

const EMPTY_CAST = {
  cast: { members: [], absences: [], source: "live" },
  located: true,
  school: "Beech",
  className: "Beech class",
  place: { lat: 51.5, lng: -0.12, climate: null },
};

/** No cast at all, and whatever field truth the case is about. */
function withFieldTruthOnly(snapshot: unknown) {
  vi.mocked(readSurfaceCast).mockResolvedValue(EMPTY_CAST as never);
  vi.mocked(fetchFieldTruth).mockResolvedValue(
    (snapshot === null ? null : { facts: { fieldSnapshot: snapshot } }) as never
  );
}

function withMembers(members: CastMember[]) {
  vi.mocked(readSurfaceCast).mockResolvedValue({
    cast: { members, absences: [], source: "live" },
    located: true,
    school: "Beech",
    className: "Beech class",
    place: { lat: 51.5, lng: -0.12, climate: null },
  } as never);
  vi.mocked(fetchFieldTruth).mockResolvedValue(null as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Today's local-nature doorway", () => {
  it("previews only present members with photographs", async () => {
    withMembers([
      member({ commonName: "Blackberry", sortRank: 0 }),
      member({ commonName: "Dawn Chorus", photoUrl: null, sortRank: 1 }),
      member({ commonName: "Swift", absent: true, sortRank: 2 }),
      member({ commonName: "Common Starling", sortRank: 3 }),
    ]);

    const today = await getTodayRead({ topicTags: ["plants"] });

    expect(today.doorFaces.map((item) => item.commonName)).toEqual([
      "Blackberry",
      "Common Starling",
    ]);
  });

  it("keeps both honesty tiers in resolver order and caps the stack at three", async () => {
    withMembers([
      member({ commonName: "Grasshopper", honestyTier: "recorded", sortRank: 0 }),
      member({ commonName: "Wild Marjoram", honestyTier: "regional", sortRank: 1 }),
      member({ commonName: "Garden Spider", honestyTier: "recorded", sortRank: 2 }),
      member({ commonName: "Common Starling", honestyTier: "regional", sortRank: 3 }),
    ]);

    const today = await getTodayRead({ topicTags: ["minibeasts"] });

    expect(today.doorFaces.map((item) => item.commonName)).toEqual([
      "Grasshopper",
      "Wild Marjoram",
      "Garden Spider",
    ]);
    expect(today.doorFaces.map((item) => item.honestyTier)).toEqual([
      "recorded",
      "regional",
      "recorded",
    ]);
  });

  it("keeps the local-nature door available even when there is no avatar", async () => {
    withMembers([member({ photoUrl: null })]);

    const today = await getTodayRead({});

    expect(today.doorFaces).toEqual([]);
    expect(today.outsideAvailable).toBe(true);
  });
});

/**
 * THE DOOR SAYS WHETHER THERE IS ANYTHING BEHIND IT (#1239).
 *
 * `outsideAvailable` was the literal `true` on every success path, so under
 * the honest "we could not see outside today" sentence the teacher was still
 * offered a door into a page that prints the same nothing.
 *
 * The rows below are what `/outside` RENDERS, which is not the same list as
 * the one guarding its apology — see `lib/outside/today.ts` for the two ends
 * where they come apart, both of them found by Codex round 1 on PR #1262. The
 * case above — members, no photographs — is the one that refused the one-line
 * `data !== null` fix and it still passes, which is the point: this flag is
 * not about field truth.
 */
describe("whether the door has anything behind it", () => {
  it("closes the door when the read failed and there is no cast either", async () => {
    withMembers([]);

    const today = await getTodayRead({});

    // The state the ticket is about: this is the read that renders the honest
    // empty sentence, and `app/TodayDay.tsx` gates `OutsideDoor` on this flag.
    expect(today.read).toBeNull();
    expect(today.condition).toBeNull();
    expect(today.facts).toEqual([]);
    expect(today.outsideAvailable).toBe(false);
  });

  it("opens the door on a cast alone, whatever the sky did", async () => {
    withMembers([member({ honestyTier: "regional" })]);

    expect((await getTodayRead({})).outsideAvailable).toBe(true);
  });

  it("opens the door on an hour alone, with no cast at all", async () => {
    withFieldTruthOnly({
      weather: { current: { skyCondition: "clear", windKph: 11 } },
    });

    const today = await getTodayRead({});

    expect(today.read).not.toBeNull();
    expect(today.doorFaces).toEqual([]);
    expect(today.outsideAvailable).toBe(true);
  });

  /**
   * A `weather.current` this build cannot read is not an hour.
   *
   * `conditionsBucket` answers "mild" for any `current` at all, so `condition`
   * is non-null here — which is precisely what suppresses `/outside`'s quiet
   * line. `ADJUSTMENTS.fine` is null, so nothing takes its place: the page is
   * blank, and a door onto a blank page is the bug this ticket is about
   * wearing a different hat.
   */
  it("closes the door on a condition that puts no line on the page", async () => {
    withFieldTruthOnly({
      weather: {
        current: { temperatureC: 12, source: "open-meteo-forecast-model" },
      },
    });

    const today = await getTodayRead({});

    expect(today.condition).toEqual({ state: "fine", adjustment: null });
    expect(today.read).toBeNull();
    expect(today.facts).toEqual([]);
    expect(today.outsideAvailable).toBe(false);
  });

  /** The same shape one degree colder: now there is a line to read. */
  it("opens the door on a condition that does", async () => {
    withFieldTruthOnly({
      weather: { current: { felt: { apparentC: 2 } } },
    });

    const today = await getTodayRead({});

    expect(today.condition?.adjustment).toBeTruthy();
    expect(today.outsideAvailable).toBe(true);
  });

  /** The third of `hasDay`'s terms: a sky fact with no weather behind it. */
  it("opens the door on the day's own times alone", async () => {
    withFieldTruthOnly({
      astronomy: { sunriseIso: "2026-09-15T06:31", sunsetIso: "2026-09-15T19:12" },
    });

    const today = await getTodayRead({});

    expect(today.read).toBeNull();
    expect(today.condition).toBeNull();
    expect(today.facts.map((fact) => fact.label)).toEqual(["sunrise", "sunset"]);
    expect(today.outsideAvailable).toBe(true);
  });

  /** `app/outside/page.tsx` names `upcoming` in `hasDay` beside read and facts. */
  it("opens the door on an upcoming sky event alone", async () => {
    withFieldTruthOnly({
      astronomy: {
        upcomingEvents: [{ label: "Total lunar eclipse", daysOffset: 9 }],
      },
    });

    const today = await getTodayRead({});

    expect(today.read).toBeNull();
    expect(today.condition).toBeNull();
    expect(today.facts).toEqual([]);
    expect(today.outsideAvailable).toBe(true);
  });

  /**
   * THE GROUNDS FILTER NARROWS THIS READ AND NOT THE TARGET'S.
   *
   * `lib/outside/brief.ts` calls `readSurfaceCast` with no habitats, so a class
   * that has configured its grounds can hold an empty list here while `/outside`
   * is full. The door belongs to the place, so the question is asked again in
   * the place's scope.
   */
  it("opens the door when the grounds filter emptied this read but not the page's", async () => {
    vi.mocked(fetchFieldTruth).mockResolvedValue(null as never);
    vi.mocked(readSurfaceCast).mockImplementation(async (options) =>
      (options?.habitats?.length
        ? EMPTY_CAST
        : { ...EMPTY_CAST, cast: { members: [member()], absences: [], source: "live" } }) as never
    );

    const today = await getTodayRead({ habitats: ["woodland"] });

    // Narrow here — no faces to preview — and yet a room behind the door.
    expect(today.doorFaces).toEqual([]);
    expect(today.outsideAvailable).toBe(true);
  });

  it("does not ask twice when the class has set no grounds", async () => {
    withMembers([]);

    expect((await getTodayRead({})).outsideAvailable).toBe(false);
    expect(vi.mocked(readSurfaceCast)).toHaveBeenCalledTimes(1);
  });
});

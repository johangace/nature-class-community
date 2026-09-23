import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE DAY THE CLASS ACTUALLY RUNS (#755).
 *
 * The first real teacher to hold this app, 2026-08-31
 * (`docs/research/real-sessions/2026-08-31-kelly-mcdonald.md`): the weather she
 * can look up on any screen, and what would help is the nature card pointed at
 * the day she runs the class. She pre-walks the terrain the day before.
 *
 * ── WHAT THIS FILE IS GUARDING ─────────────────────────────────────────────
 *
 * The obvious way to serve that ticket is to hand the brief next Thursday's
 * date, because `getOutsideBrief` and `getOutsideNow` already take one. Do
 * only that and the page comes back with Thursday's phenology, Thursday's
 * heading, and THIS MORNING'S felt temperature, ground, sunset and light-left
 * printed underneath as though they were Thursday's. Those numbers describe
 * the hour the payload was fetched and nothing else.
 *
 * THE CONTRACT MOVED UNDER THIS FILE, AND THE SEAM DID NOT (pointmoon#125).
 * Pointmoon now carries a dated per-day forecast, so Thursday HAS a sky and a
 * temperature of its own — read from `weather.outlook`, matched on Thursday's
 * ISO day. That changes nothing here: the gate these tests guard is the
 * BORROWING of the current hour, and this morning's 21 degrees is still
 * forbidden under Thursday's name whether or not Thursday has a forecast of
 * its own. The fixture below therefore carries no outlook, and the tests that
 * exercise one build it explicitly.
 *
 * A teacher has no way to see that seam, which makes it exactly the invention
 * this repo forbids. The tests below are written against the seam rather than
 * against the copy: they hand the brief a payload that is FULL of real,
 * non-null hour readings and then assert that none of them survives a day
 * that is not today, while the season, the record and the sky event do.
 */

const readSurfaceCast = vi.hoisted(() => vi.fn());
const getOutsideNow = vi.hoisted(() => vi.fn());
const fetchFieldTruth = vi.hoisted(() => vi.fn());
const taxonReferences = vi.hoisted(() => vi.fn());
const findSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cast/surface", () => ({ readSurfaceCast, CAST_DEPTH: 12 }));
vi.mock("@/lib/outside/index", () => ({ getOutsideNow }));
vi.mock("@/lib/outside/pointmoon", () => ({ fetchFieldTruth }));
vi.mock("@/lib/outside/taxon-reference", () => ({ taxonReferences }));
vi.mock("@/lib/pack", () => ({
  findSession,
  leadPack: () => ({ sessions: [] }),
}));
vi.mock("@/lib/teacher", () => ({
  getActiveEnglishLocale: vi.fn().mockResolvedValue(null),

  getActiveClassLocation: vi.fn().mockResolvedValue({ lat: 51.54, lng: -0.1 }),
  getTeacher: vi.fn().mockResolvedValue({ id: "teacher-1" }),
}));
vi.mock("@/app/AppNav", () => ({ AppNav: () => null }));

import OutsidePage from "@/app/outside/page";
import { usuallyAroundCaptionFor } from "@/lib/outside/captions";
import { getOutsideBrief } from "@/lib/outside/brief";
import {
  SESSION_DAY_HORIZON_DAYS,
  nextDay,
  noForecastLine,
  parseIsoDay,
  reaches,
  resolveSessionDay,
  sessionDayOptions,
} from "@/lib/outside/session-day";
import { upcomingSky } from "@/lib/outside/sky";
import type { ConditionKind } from "@/schema/pack";

/** A Tuesday, so today + 2 is a Thursday and today + 7 is a Tuesday again. */
const TUESDAY = new Date(2026, 8, 1, 9, 30);

const session = {
  id: "summer-w1-counting-life",
  title: "Counting life",
  topicTags: ["minibeasts"],
  conditionNotes: [{ when: ["windy"] as ConditionKind[], teacher: "Begin with looking along a sheltered edge." }],
};

/**
 * A morning with something to say in EVERY hour-scoped slot: a felt
 * temperature, a wind strong enough to fire the session's own windy hinge, a
 * named ground, a sunset, a moon, and a countable number of minutes of light
 * left. If any of these came back null the assertions below would pass for the
 * wrong reason.
 */
function fullMorning() {
  return {
    facts: {
      fieldSnapshot: {
        time: { windows: { daylightMinutesRemaining: 45 } },
        astronomy: {
          sunriseIso: "2026-09-01T06:15",
          sunsetIso: "2026-09-01T19:44",
          moonPhaseLabel: "waxing gibbous",
          moonIlluminationPct: 72,
          upcomingEvents: [
            { label: "Partial lunar eclipse", daysOffset: 3, note: "Best after nine." },
          ],
        },
        ground: { state: "damp" },
        weather: {
          current: { skyCondition: "clear", windKph: 45, felt: { apparentC: 21 } },
        },
      },
    },
  };
}

/**
 * The same morning, plus a forecast for Thursday 3 September.
 *
 * Overrides land on the ONE day the tests point at, so a test can change a
 * single reading without restating the payload — which is what keeps each of
 * them about the rule it names.
 */
function withOutlook(over: Record<string, unknown> = {}) {
  const payload = fullMorning();
  (payload.facts.fieldSnapshot.weather as Record<string, unknown>).outlook = {
    days: [
      {
        date: "2026-09-03",
        offsetDays: 2,
        skyCondition: "overcast",
        cloudCoverMeanPct: 92,
        temperatureMinC: 12.4,
        temperatureMaxC: 18.6,
        precipitationProbabilityMaxPct: 70,
        windMaxKph: 26,
        ...over,
      },
    ],
  };
  return payload;
}

beforeEach(() => {
  vi.clearAllMocks();
  readSurfaceCast.mockResolvedValue({
    cast: { members: [], absences: [], source: "live" },
    located: true,
    school: "Willow Primary",
    className: "Willow class",
    place: { lat: 51.54, lng: -0.1, climate: null },
  });
  getOutsideNow.mockResolvedValue({
    place: { name: "Canonbury" },
    lookFors: [
      { id: "blackberry", species: "Blackberry", note: "Compare green and black fruit on one cane." },
    ],
    usuallyAround: [{ id: "blackberry", name: "Blackberry", scientificName: null }],
  });
  taxonReferences.mockResolvedValue({});
  fetchFieldTruth.mockResolvedValue(fullMorning());
  findSession.mockReturnValue({ pack: { id: "summer" }, session });
});

describe("resolving which day this read is for", () => {
  it("is today when nothing was asked for", () => {
    const day = resolveSessionDay({ now: TUESDAY });
    expect(day.offsetDays).toBe(0);
    expect(day.label).toBe("today");
    expect(day.outOfReach).toBe(false);
  });

  it("names a chosen weekday in the reader's own words", () => {
    const day = resolveSessionDay({ requested: "2026-09-03", now: TUESDAY });
    expect(day.offsetDays).toBe(2);
    expect(day.shortLabel).toBe("Thursday");
    expect(day.whenLabel).toBe("on Thursday");
    expect(day.label).toBe("Thursday 3 September");
    expect(day.iso).toBe("2026-09-03");
  });

  it("says tomorrow rather than a weekday, because that is what she calls it", () => {
    expect(resolveSessionDay({ requested: "2026-09-02", now: TUESDAY }).label).toBe(
      "tomorrow"
    );
    expect(nextDay({ now: TUESDAY }).iso).toBe("2026-09-02");
  });

  /**
   * The refusals. Each of these could plausibly be "helpfully" snapped onto the
   * nearest day we do hold, and every one of those would answer a question
   * nobody asked, in silence.
   */
  it("refuses a day already gone, a day past the horizon, and a date that never existed", () => {
    for (const requested of ["2026-08-30", "2026-10-30", "2026-02-31", "next thursday", ""]) {
      const day = resolveSessionDay({ requested, now: TUESDAY });
      expect(day.offsetDays).toBe(0);
    }
    // A rejected SHAPE is not a refused request: nothing was asked for that we
    // could recognise, so the page simply is today and says nothing.
    expect(resolveSessionDay({ requested: "not-a-date", now: TUESDAY }).outOfReach).toBe(false);
    // A real day we will not serve IS a refused request, and is stated.
    expect(resolveSessionDay({ requested: "2026-10-30", now: TUESDAY }).outOfReach).toBe(true);
    expect(parseIsoDay("2026-02-31")).toBeNull();
  });

  it("offers one week of days whose names cannot be confused with each other", () => {
    const options = sessionDayOptions({ now: TUESDAY });
    expect(options).toHaveLength(SESSION_DAY_HORIZON_DAYS + 1);
    expect(new Set(options.map((o) => o.chipLabel)).size).toBe(options.length);
    expect(options.map((o) => o.chipLabel).slice(0, 3)).toEqual([
      "Today",
      "Tomorrow",
      "Thu 3",
    ]);
  });

  it("lets the season travel and holds the hour to today", () => {
    const thursday = resolveSessionDay({ requested: "2026-09-03", now: TUESDAY });
    const today = resolveSessionDay({ now: TUESDAY });
    expect(reaches("the-season", thursday)).toBe(true);
    expect(reaches("the-hour", thursday)).toBe(false);
    expect(reaches("the-hour", today)).toBe(true);
    expect(noForecastLine(today)).toBeNull();
    expect(noForecastLine(thursday)).toContain("no forecast");
  });
});

describe("the brief, pointed at the day the class runs", () => {
  it("reports the hour in full when the day is today", async () => {
    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ now: TUESDAY }),
    });

    // The control. Every one of these is non-null on this payload, which is
    // what makes their absence below mean something.
    expect(brief.temperature).toBe("21°C");
    expect(brief.read).not.toBeNull();
    expect(brief.sky).not.toBeNull();
    expect(brief.conditionKind).toBe("windy");
    expect(brief.context?.source).toBe("lesson.conditionNotes");
    expect(brief.quietWord).not.toBeNull();
    expect(brief.facts.map((f) => f.label)).toEqual([
      "sunrise",
      "sunset",
      "light left",
      "moon",
      "ground",
    ]);
    expect(brief.noForecast).toBeNull();
  });

  /**
   * THE ONE THAT FAILS WITHOUT THIS CHANGE.
   *
   * Same payload, same everything, pointed at Thursday. Before #755 the brief
   * had no idea a day other than today existed, so every assertion in this
   * block came back with Tuesday morning's reading under Thursday's name.
   */
  it("withholds every reading that is only true of this hour", async () => {
    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ requested: "2026-09-03", now: TUESDAY }),
    });

    expect(brief.temperature).toBeNull();
    expect(brief.sky).toBeNull();
    expect(brief.read).toBeNull();
    expect(brief.condition).toBeNull();
    expect(brief.conditionKind).toBeNull();
    // The authored hinge keys off the condition, so it goes with it: "begin
    // along a sheltered edge" is a claim about Thursday's wind.
    expect(brief.context).toBeNull();
    expect(brief.quietWord).toBeNull();
    expect(brief.facts).toEqual([]);

    expect(brief.noForecast).toContain("Thursday's weather");
    expect(brief.holdsForDay).toContain("Thursday");
  });

  /* THE FORECAST (pointmoon#125). Our producer had been fetching a 14-day
     daily forecast on every read and reducing it to trend adjectives, so the
     page could say nothing at all about Thursday's sky. It carries the days
     now, and the refusal narrows to the two readings that genuinely cannot be
     forecast rather than disappearing. */
  it("gives the chosen day its own sky and temperature, labelled as a forecast", async () => {
    fetchFieldTruth.mockResolvedValue(withOutlook());

    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ requested: "2026-09-03", now: TUESDAY }),
    });

    expect(brief.forecast).toEqual({
      sky: "A soft grey sky",
      temperature: "12° to 19°C",
      rain: "70% chance of rain",
      wind: "A fresh wind",
    });

    // THE HOUR IS STILL WITHHELD. A forecast for Thursday is not a licence to
    // print Tuesday morning's readings beside it.
    expect(brief.temperature).toBeNull();
    expect(brief.read).toBeNull();
    expect(brief.sky).toBeNull();
    expect(brief.facts).toEqual([]);

    // And the line says which two are the forecast, and which two are simply
    // not forecast at all.
    expect(brief.noForecast).toContain("forecast for Thursday, not a reading");
    expect(brief.noForecast).toContain("ground and the light");
  });

  it("bands a forecast day's cloud rather than taking the render enum at its word", async () => {
    // #368 is not repealed by a forecast: `skyCondition` collapses everything
    // below overcast into "clear", so a 78%-cloud Thursday would be read out
    // as clear all over again if the cover were dropped on the way in.
    fetchFieldTruth.mockResolvedValue(
      withOutlook({ skyCondition: "clear", cloudCoverMeanPct: 78 })
    );

    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ requested: "2026-09-03", now: TUESDAY }),
    });

    expect(brief.forecast?.sky).toBe("A cloudy sky");
  });

  it("says nothing about rain a teacher should not move a lesson on", async () => {
    fetchFieldTruth.mockResolvedValue(withOutlook({ precipitationProbabilityMaxPct: 20 }));

    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ requested: "2026-09-03", now: TUESDAY }),
    });

    expect(brief.forecast?.rain).toBeNull();
  });

  it("matches the day on its date, never on an offset counted from the server's morning", async () => {
    // `offsetDays` counts from the day the READ was made. A cached payload that
    // crosses local midnight would slide every offset by one and hand
    // Thursday's sky to Wednesday, silently, for exactly the class whose
    // morning straddled the boundary.
    fetchFieldTruth.mockResolvedValue(withOutlook({ date: "2026-09-03", offsetDays: 99 }));

    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ requested: "2026-09-03", now: TUESDAY }),
    });

    expect(brief.forecast?.sky).toBe("A soft grey sky");
  });

  it("keeps the whole old refusal when the day is past the forecast's reach", async () => {
    fetchFieldTruth.mockResolvedValue(withOutlook({ date: "2026-09-02" }));

    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ requested: "2026-09-03", now: TUESDAY }),
    });

    expect(brief.forecast).toBeNull();
    expect(brief.noForecast).toContain("no forecast for Thursday");
    expect(brief.noForecast).toContain("Thursday's weather");
  });

  it("offers today measurements, never a model's opinion beside them", async () => {
    fetchFieldTruth.mockResolvedValue(withOutlook({ date: "2026-09-01", offsetDays: 0 }));

    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ now: TUESDAY }),
    });

    expect(brief.forecast).toBeNull();
    expect(brief.temperature).toBe("21°C");
  });

  it("keeps what actually holds for that day, and resolves it ON that day", async () => {
    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ requested: "2026-09-03", now: TUESDAY }),
    });

    // The season is read for the class's day, not for the day she is holding
    // the phone: a Thursday five days into a new phenology week must not show
    // last week's species.
    const seasonal = getOutsideNow.mock.calls[0]?.[0];
    expect(seasonal.date).toBeInstanceOf(Date);
    expect(seasonal.date.getDate()).toBe(3);
    expect(readSurfaceCast.mock.calls[0]?.[0].date.getDate()).toBe(3);
    // NOON, not midnight. `weekOfYear` counts days in UTC, so local midnight
    // in any zone east of UTC lands on the previous UTC day and could resolve
    // the wrong phenology week on a server that is not in UTC.
    expect(seasonal.date.getHours()).toBe(12);

    expect(brief.lookFors.map((l) => l.species)).toEqual(["Blackberry"]);
    // A sky event carries a day count rather than a state of the hour, so it
    // survives, re-worded from the day being planned.
    expect(brief.upcoming).toEqual({
      label: "Partial lunar eclipse",
      note: "Best after nine.",
      when: "the night after",
    });
  });

  it("leaves the existing callers exactly where they were", async () => {
    const brief = await getOutsideBrief({ session });
    expect(brief.day.offsetDays).toBe(0);
    expect(brief.temperature).toBe("21°C");
    expect(brief.upcoming?.when).toBe("in 3 days");
    // Today hands the seasonal reads NO date, exactly as before this existed,
    // so both of them keep defaulting to `new Date()`. Synthesising a "today"
    // here would be a behaviour change on every caller in exchange for
    // nothing.
    expect(getOutsideNow.mock.calls[0]?.[0].date).toBeUndefined();
    expect(readSurfaceCast.mock.calls[0]?.[0].date).toBeUndefined();
  });
});

describe("the sky event, measured from the day being planned", () => {
  const data = fullMorning();

  it("counts from today when no day was chosen", () => {
    expect(upcomingSky(data)?.when).toBe("in 3 days");
  });

  it("counts from the chosen day instead", () => {
    expect(upcomingSky(data, 3)?.when).toBe("that night");
    expect(upcomingSky(data, 2)?.when).toBe("the night after");
    expect(upcomingSky(data, 1)?.when).toBe("2 days later");
  });

  it("drops an event that has already happened by the day she is planning", () => {
    expect(upcomingSky(data, 5)).toBeNull();
  });
});

describe("the regional caption's tense", () => {
  it("says now for today and that week for a chosen day", () => {
    expect(usuallyAroundCaptionFor("Canonbury", 0)).toBe("Usually around Canonbury now");
    expect(usuallyAroundCaptionFor("Canonbury", 2)).toBe(
      "Usually around Canonbury that week"
    );
    expect(usuallyAroundCaptionFor(null, 2)).toBe("Usually around here that week");
  });
});

describe("the /outside surface", () => {
  // The page resolves `?for=` against the real clock, so the clock is pinned:
  // "2026-09-03" has to keep meaning "two days out" for this file to stay
  // meaningful next month.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(TUESDAY);
    return () => vi.useRealTimers();
  });

  it("prints no temperature under a day it cannot read, and says why", async () => {
    const markup = renderToStaticMarkup(
      await OutsidePage({
        searchParams: Promise.resolve({
          session: session.id,
          for: "2026-09-03",
        }),
      })
    );

    // The three shapes this morning's hour could have leaked in: the composed
    // sentence, the instrument row, and the quiet word about the light.
    expect(markup).not.toContain("The sky&#x27;s clear");
    expect(markup).not.toContain("brief-facts");
    expect(markup).not.toContain("damp underfoot");
    expect(markup).not.toContain("7:44 pm");
    expect(markup).not.toContain("usable light left");
    expect(markup).toContain("no forecast");
    expect(markup).toContain("Thursday");
    // The season is still there, and still captioned as the season.
    expect(markup).toContain("Seasonal highlights that week");
    expect(markup).toContain("Blackberry");
  });

  it("is unchanged for today, and offers the week as addresses", async () => {
    const markup = renderToStaticMarkup(
      await OutsidePage({
        searchParams: Promise.resolve({ session: session.id }),
      })
    );

    expect(markup).toContain("Weather and daylight");
    expect(markup).toContain("damp underfoot");
    expect(markup).toContain("7:44 pm");
    expect(markup).toContain("usable light left");
    expect(markup).not.toContain("no forecast");
    // Every day in the chooser is its own address, so a planned day can be
    // bookmarked or sent to a colleague.
    expect(markup).toContain('href="/outside?session=summer-w1-counting-life"');
    expect(markup).toMatch(/href="\/outside\?session=summer-w1-counting-life&amp;for=\d{4}-\d{2}-\d{2}"/);
  });
});

/**
 * THE REGION'S WEEK, SAID AS A STATE (#1292).
 *
 * `seasonalNote` was composed on every Pointmoon read from #284 and rendered
 * on no surface at all until this ticket: a repo-wide search for it outside
 * tests returned the function that wrote it, the type that declared it, and
 * the route that carried it. #1281 then gave it a reader on the model's side
 * (`regionalExpectation`), which is what settled the ticket's other branch —
 * a sentence the lesson prompt depends on cannot be uncomposed — leaving only
 * the question of whether it also earns a teacher's pixels.
 *
 * It does, on /outside, as the caption over "Seasonal highlights": the same
 * regional calendar those species come from, said as a state rather than as a
 * list, which is what tells her whether this is the week to walk out.
 *
 * AND IT DOES NOT TRAVEL THE WAY ITS OWN LIST DOES, which is the seam these
 * tests are written against. `lookFors` are resolved on the chosen day's week.
 * This sentence is read out of the live payload, and `readPhenologyCondition`
 * only admits a phenology block whose week is the CURRENT one — so under a day
 * in a later week it would be this week's state under that week's heading,
 * which is exactly the borrowing #755 forbids.
 */
describe("the regional week's state, and how far it travels", () => {
  const AT_PEAK = "The regional calendar describes seasonal signs as at their peak.";

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(TUESDAY);
    getOutsideNow.mockResolvedValue({
      place: { name: "Canonbury" },
      conditions: { line: null, meta: null, seasonalNote: AT_PEAK },
      lookFors: [
        { id: "blackberry", species: "Blackberry", note: "Compare green and black fruit on one cane." },
      ],
      usuallyAround: [{ id: "blackberry", name: "Blackberry", scientificName: null }],
    });
    return () => vi.useRealTimers();
  });

  it("rides a chosen day inside the week it was actually read for", async () => {
    // Tuesday the 1st and Thursday the 3rd are the same ISO week, so the state
    // of that week is as true under Thursday's heading as under this morning's.
    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ requested: "2026-09-03", now: TUESDAY }),
    });
    expect(brief.seasonalNote).toBe(AT_PEAK);
  });

  it("is absent under a day in a later week, while its species list survives", async () => {
    // Monday the 7th is the horizon's last day AND the next ISO week. The
    // look-fors are re-resolved on that week and travel; this sentence was
    // never about that week, so it is left out rather than relabelled.
    const brief = await getOutsideBrief({
      session,
      sessionDay: resolveSessionDay({ requested: "2026-09-07", now: TUESDAY }),
    });
    expect(brief.day.offsetDays).toBe(6);
    expect(brief.seasonalNote).toBeNull();
    expect(brief.lookFors.map((l) => l.species)).toEqual(["Blackberry"]);
  });

  it("survives a thin read rather than taking the whole brief down with it", async () => {
    // The shape three other suites already mock: an `outside` with no
    // `conditions` at all. Reading it unguarded would throw inside the brief's
    // one try/catch and return the EMPTY brief, so a missing sentence would
    // present as a Pointmoon outage that took the species and the place too.
    getOutsideNow.mockResolvedValue({
      place: { name: "Canonbury" },
      lookFors: [{ id: "blackberry", species: "Blackberry", note: "Compare the fruit." }],
      usuallyAround: [],
    });
    const brief = await getOutsideBrief({ session });
    expect(brief.seasonalNote).toBeNull();
    expect(brief.lookFors.map((l) => l.species)).toEqual(["Blackberry"]);
    expect(brief.place?.name).toBe("Canonbury");
  });

  it("prints it over the species on today, and not over next week's", async () => {
    const today = renderToStaticMarkup(
      await OutsidePage({
        searchParams: Promise.resolve({ session: session.id }),
      })
    );
    expect(today).toContain("Seasonal highlights");
    expect(today).toContain("at their peak");
    // Over the list, not a reading inside the instrument row beside sunrise
    // and the moon: it is a sentence, and every value in that row is not.
    expect(today).toContain("brief-seasonal-note");
    expect(today.indexOf("brief-seasonal-note")).toBeLessThan(
      today.indexOf("brief-lookfors")
    );

    const nextWeek = renderToStaticMarkup(
      await OutsidePage({
        searchParams: Promise.resolve({ session: session.id, for: "2026-09-07" }),
      })
    );
    expect(nextWeek).toContain("Seasonal highlights that week");
    expect(nextWeek).toContain("Blackberry");
    expect(nextWeek).not.toContain("at their peak");
  });

  it("gives the sentence its section when it is the only seasonal thing we have", async () => {
    getOutsideNow.mockResolvedValue({
      place: { name: "Canonbury" },
      conditions: { line: null, meta: null, seasonalNote: AT_PEAK },
      lookFors: [],
      usuallyAround: [],
    });
    const markup = renderToStaticMarkup(
      await OutsidePage({
        searchParams: Promise.resolve({ session: session.id }),
      })
    );
    expect(markup).toContain("Seasonal highlights");
    expect(markup).toContain("at their peak");
    // The heading is there without a list under it, and the page does not
    // report an empty season directly above the one seasonal claim it holds.
    expect(markup).not.toContain("brief-lookfors");
    expect(markup).not.toContain("there is nothing new to report");
  });
});

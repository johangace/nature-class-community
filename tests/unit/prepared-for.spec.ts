import { describe, expect, it } from "vitest";
import {
  contextRevisionSchema,
  weatherReachClasses,
  type ContextRevision,
  type WeatherSnapshot,
} from "@/schema/prepared-day";
import { preparedForFolio, preparedForNotice, sourceSinceLine } from "@/lib/prepared-day/prepared-for";

/**
 * What a printed day says it was prepared for (#1092).
 *
 * The ticket's whole argument is one sentence: a printed rain plan carried
 * into sun is the costliest trust failure available to us. So these tests are
 * not about wording, they are about the four ways a sheet could lie —
 *
 *   by printing the WRONG HOUR, because the date was formatted somewhere the
 *   class is not;
 *   by printing a PLAUSIBLE SKY that nobody read;
 *   by printing a reading as though it were of that hour when it is of the
 *   season and the region;
 *   by SAYING NOTHING, which reads as a day prepared for nothing in particular
 *   rather than as a day nobody could read a sky for.
 *
 * Every context here is parsed through `contextRevisionSchema` first, so a
 * fixture cannot drift from the record the surface will actually be handed.
 */

const PLANNED = "2026-09-10T13:30:00.000Z";
const OBSERVED = "2026-09-10T07:04:00.000Z";
const UNTIL = "2026-09-10T15:00:00.000Z";

const weather = (over: Partial<WeatherSnapshot> = {}): WeatherSnapshot => ({
  reach: "the-hour",
  conditionKind: "wet",
  reasonCode: null,
  observedAt: OBSERVED,
  validUntil: UNTIL,
  source: "pointmoon@2026-09-10",
  ...over,
});

const context = (over: Partial<ContextRevision> = {}): ContextRevision =>
  contextRevisionSchema.parse({
    revisionId: "ctx-1",
    placeKey: { resolution: "koppen", value: "Cfb", resolvedBy: "pack-key@1" },
    ability: { band: "y1", resolvedBy: "ability@1/class-row" },
    weather: weather(),
    siteProfile: null,
    plannedAt: PLANNED,
    plannedTimeZone: "Europe/London",
    jurisdiction: "england",
    locale: "en-GB",
    teacherNotes: [],
    capturedAt: OBSERVED,
    ...over,
  });

describe("the prepared-for line", () => {
  it("names the day and the hour the class was planned for", () => {
    const notice = preparedForNotice(context());
    expect(notice.preparedForLine).toBe(
      "Prepared for Thursday 10 September 2026 at 14:30 (Europe/London).",
    );
  });

  it("reads the hour in the class's own zone, not the server's", () => {
    // 13:30Z is 14:30 in London, 06:30 in Los Angeles and 22:30 in Tokyo. The
    // same saved instant under three zones must print three different hours,
    // or the sheet is describing the machine that printed it.
    const hours = ["Europe/London", "America/Los_Angeles", "Asia/Tokyo"].map(
      (plannedTimeZone) =>
        preparedForNotice(context({ plannedTimeZone })).preparedForLine,
    );
    expect(hours).toEqual([
      "Prepared for Thursday 10 September 2026 at 14:30 (Europe/London).",
      "Prepared for Thursday 10 September 2026 at 06:30 (America/Los_Angeles).",
      "Prepared for Thursday 10 September 2026 at 22:30 (Asia/Tokyo).",
    ]);
  });

  it("names the zone it formatted in, so the sheet reads the same anywhere", () => {
    expect(preparedForNotice(context({ plannedTimeZone: "Europe/Tirane" })).preparedForLine)
      .toContain("(Europe/Tirane)");
  });

  it("crosses a date boundary rather than printing the instant's own day", () => {
    // 23:30 in Tokyo on the 10th is still the 10th there and the 9th in
    // London. A sheet printed for the Tokyo class must say the day that class
    // teaches on.
    const notice = preparedForNotice(
      context({ plannedAt: "2026-09-10T14:30:00.000Z", plannedTimeZone: "Asia/Tokyo" }),
    );
    expect(notice.preparedForLine).toBe(
      "Prepared for Thursday 10 September 2026 at 23:30 (Asia/Tokyo).",
    );
  });

  it("refuses a time zone it cannot resolve instead of falling back to the server's", () => {
    expect(() =>
      preparedForNotice(context({ plannedTimeZone: "Mars/Olympus_Mons" })),
    ).toThrow();
  });
});

describe("the conditions it was prepared for", () => {
  it("names the bucket, what the reading was of, and who said it", () => {
    const notice = preparedForNotice(context());
    expect(notice.conditions).toEqual({ state: "read", kind: "wet" });
    expect(notice.conditionsLine).toBe(
      "Prepared for wet. The reading is of the moment it was taken, not of " +
        "the lesson hour, taken 10 September at 08:04, from " +
        "pointmoon@2026-09-10. It does not reach past 10 September at 16:00.",
    );
  });

  it("says a seasonal reading is of the season, never of that hour", () => {
    const notice = preparedForNotice(
      context({ weather: weather({ reach: "the-season" }) }),
    );
    expect(notice.conditionsLine).toContain(
      "The reading is of the season and the region, not of an hour",
    );
  });

  it("lets only the-planned-hour claim the lesson hour", () => {
    // `lib/outside/session-day.ts`: `the-hour` is "read for the moment it was
    // asked for, at one point… NONE of it survives being pointed at a day that
    // is not today". A preparation made at 08:04 for a 14:30 lesson holds an
    // 08:04 sky, and calling that a reading of the lesson hour would print this
    // morning's ground under the afternoon's name — the invented nature this
    // notice exists to prevent, arriving through the notice itself.
    const hour = preparedForNotice(context({ weather: weather({ reach: "the-hour" }) }));
    expect(hour.conditionsLine).toContain("not of the lesson hour");

    const planned = preparedForNotice(
      context({ weather: weather({ reach: "the-planned-hour" }) }),
    );
    expect(planned.conditionsLine).toContain("of that planned hour");

    const season = preparedForNotice(context({ weather: weather({ reach: "the-season" }) }));
    expect(season.conditionsLine).toContain("not of an hour");

    // Only one of the three may say the reading is of the hour she teaches.
    const claims = [hour, planned, season].filter((notice) =>
      /is of that planned hour/.test(notice.conditionsLine),
    );
    expect(claims).toHaveLength(1);
  });

  it("has a phrase for every reach class the schema declares", () => {
    for (const reach of weatherReachClasses) {
      const notice = preparedForNotice(context({ weather: weather({ reach }) }));
      expect(notice.conditionsLine).toMatch(/The reading is of/);
      expect(notice.conditionsLine).not.toContain("undefined");
    }
  });

  it("leaves out the provenance it does not have rather than inventing it", () => {
    const notice = preparedForNotice(
      context({
        weather: weather({ observedAt: null, validUntil: null, source: null }),
      }),
    );
    expect(notice.conditionsLine).toBe(
      "Prepared for wet. The reading is of the moment it was taken, not of " +
        "the lesson hour.",
    );
    expect(notice.conditionsLine).not.toMatch(/unknown|unavailable|null/i);
  });
});

describe("a day nobody could read a sky for", () => {
  // The common case for a day prepared the night before: nothing turns a daily
  // forecast into an hour's bucket honestly, so `conditionKind` is null and the
  // sheet must say which absence this is.
  const absences: Array<[NonNullable<WeatherSnapshot["reasonCode"]>, string]> = [
    ["out-of-reach", "No weather was read for it: the reading we held did not reach that hour."],
    ["no-signal", "No weather was read for it: nothing answered when we looked."],
    ["not-asked", "No weather was read for it: no reading was asked for."],
  ];

  for (const [reasonCode, line] of absences) {
    it(`says so, and why, for ${reasonCode}`, () => {
      const notice = preparedForNotice(
        context({ weather: weather({ conditionKind: null, reasonCode }) }),
      );
      expect(notice.conditions).toEqual({ state: "absent", reason: reasonCode });
      expect(notice.conditionsLine).toBe(line);
    });
  }

  it("never fills an absent reading with a plausible sky", () => {
    for (const [reasonCode] of absences) {
      const notice = preparedForNotice(
        context({ weather: weather({ conditionKind: null, reasonCode }) }),
      );
      for (const bucket of ["wet", "windy", "cold", "hot", "dry", "still", "bright"]) {
        expect(notice.conditionsLine).not.toContain(bucket);
      }
    }
  });

  it("says the reason is missing rather than choosing the flattering one", () => {
    const notice = preparedForNotice(
      context({ weather: weather({ conditionKind: null, reasonCode: null }) }),
    );
    expect(notice.conditionsLine).toBe(
      "No weather was read for it: no reason was recorded for the gap.",
    );
    expect(notice.conditions).toEqual({ state: "absent", reason: null });
  });

  it("still says which day and hour it was prepared for", () => {
    // The absence is of the sky, never of the date. A sheet that dropped both
    // is a sheet that says nothing about what it is.
    const notice = preparedForNotice(
      context({ weather: weather({ conditionKind: null, reasonCode: "no-signal" }) }),
    );
    expect(notice.preparedForLine).toContain("Thursday 10 September 2026 at 14:30");
  });
});

describe("what it will not put on paper", () => {
  it("carries no go/no-go verdict, on a read day or an unread one", () => {
    const verdicts = /too (wet|windy|cold|hot)|stay (in|inside)|indoors|unsafe|safe to|recommend|cancel/i;
    const days = [
      context(),
      context({ weather: weather({ reach: "the-season" }) }),
      context({ weather: weather({ conditionKind: null, reasonCode: "out-of-reach" }) }),
    ];
    for (const day of days) {
      const notice = preparedForNotice(day);
      expect(notice.preparedForLine).not.toMatch(verdicts);
      expect(notice.conditionsLine).not.toMatch(verdicts);
    }
  });
});

describe("whether the lesson moved under the preparation", () => {
  // Printing the frozen source is what created the need for this. While a
  // prepared sheet rendered today's pack, an author's correction reached paper
  // the moment it was made; now it does not, so the sheet says so.
  it("says nothing when the lesson has not been edited", () => {
    expect(sourceSinceLine("fresh")).toBeNull();
    expect(sourceSinceLine(undefined)).toBeNull();
  });

  it("says the lesson has been edited, and which of the two the sheet is", () => {
    expect(sourceSinceLine("stale")).toBe(
      "The lesson has been edited since this was prepared, though not " +
        "necessarily anything on this sheet. This sheet is the day as it was " +
        "prepared, not as the lesson reads now.",
    );
  });

  it("does not claim the page in her hand changed", () => {
    // `sessionDependencies` walks the whole session with no allowlist, so an
    // edit to `authorNotes` — which no print surface renders — moves this state
    // exactly as a kit edit does. The sentence may not imply more than that.
    expect(sourceSinceLine("stale")).toContain("not necessarily anything on this sheet");
  });

  it("tells a failed check apart from nothing having changed", () => {
    // The comfortable one must not stand in for the other.
    expect(sourceSinceLine("source-unavailable")).toBe(
      "Whether the lesson has been edited since this was prepared could not be checked.",
    );
    expect(sourceSinceLine("source-unavailable")).not.toBe(sourceSinceLine("fresh"));
  });

  it("gives no instruction about whether to teach from it", () => {
    const verdicts = /do not|don't|should|must|reprint|unsafe|invalid|out of date/i;
    for (const state of ["stale", "source-unavailable"] as const) {
      expect(sourceSinceLine(state)).not.toMatch(verdicts);
    }
  });
});

/**
 * THE SAME FOUR LIES, on the object that travels (#1245).
 *
 * The deck goes on a lanyard and leaves the building, so it is read days later
 * with nothing beside it. It is also the surface with the least room, and the
 * temptation a short form carries is to buy millimetres by dropping a clause —
 * which is how "dry" ends up beside a lesson hour whose sky nobody read.
 *
 * So these tests are about what the short form is NOT ALLOWED to shed, not
 * about its wording. What it may shed — the provenance clauses, the year, the
 * long weekday — is asserted too, because an omission that nobody wrote down
 * is an omission the next person will read as a bug and restore.
 */
describe("the prepared-for line a card carries", () => {
  it("names the day, the hour and the zone, short", () => {
    expect(preparedForFolio(context())).toContain(
      "Prepared for Thu 10 September at 14:30 (Europe/London).",
    );
  });

  it("reads the hour in the class's own zone, not the server's", () => {
    const hours = ["Europe/London", "America/Los_Angeles", "Asia/Tokyo"].map((plannedTimeZone) =>
      preparedForFolio(context({ plannedTimeZone })),
    );
    expect(hours[0]).toContain("Thu 10 September at 14:30 (Europe/London)");
    expect(hours[1]).toContain("Thu 10 September at 06:30 (America/Los_Angeles)");
    expect(hours[2]).toContain("Thu 10 September at 22:30 (Asia/Tokyo)");
  });

  it("keeps the reach, which is the clause a short form is most tempted to drop", () => {
    // `the-hour` is a reading of the moment it was taken. A card that printed
    // "wet" beside a 14:30 lesson without saying so would put a 07:04 sky under
    // the afternoon's name — the invention the notice exists to prevent,
    // arriving through the notice itself.
    expect(preparedForFolio(context({ weather: weather({ reach: "the-hour" }) }))).toContain(
      "Conditions: wet when the reading was taken, not at that hour.",
    );
    expect(
      preparedForFolio(context({ weather: weather({ reach: "the-planned-hour" }) })),
    ).toContain("Conditions: wet at that hour.");
    expect(preparedForFolio(context({ weather: weather({ reach: "the-season" }) }))).toContain(
      "Conditions: wet for the season and the region, not for that hour.",
    );
  });

  it("says something different for every reach class the schema has", () => {
    // Guards the record rather than the three strings above: a fourth reach
    // added to the schema must be given its own phrase here, not silently fall
    // through to another class's claim.
    const lines = weatherReachClasses.map((reach) =>
      preparedForFolio(context({ weather: weather({ reach }) })),
    );
    expect(new Set(lines).size).toBe(weatherReachClasses.length);
  });

  it("keeps the limit, because this is the sheet most likely to be read late", () => {
    expect(preparedForFolio(context())).toContain("Not a reading past 10 September at 16:00.");
    expect(
      preparedForFolio(context({ weather: weather({ validUntil: null }) })),
    ).not.toContain("Not a reading past");
  });

  it("says the absence rather than filling it in", () => {
    for (const [reasonCode, said] of [
      ["out-of-reach", "the reading we held did not reach that hour"],
      ["no-signal", "nothing answered when we looked"],
      ["not-asked", "no reading was asked for"],
    ] as const) {
      const line = preparedForFolio(
        context({ weather: weather({ conditionKind: null, reasonCode }) }),
      );
      expect(line).toContain(`No weather was read: ${said}.`);
    }
  });

  it("says so when even the reason is missing", () => {
    expect(
      preparedForFolio(context({ weather: weather({ conditionKind: null, reasonCode: null }) })),
    ).toContain("No weather was read: no reason was recorded for the gap.");
  });

  it("gives no verdict about whether to go out", () => {
    const verdicts = /do not|don't|should|must|unsafe|too wet|stay in|go out|cancel/i;
    for (const reach of weatherReachClasses) {
      expect(preparedForFolio(context({ weather: weather({ reach }) }))).not.toMatch(verdicts);
    }
    expect(
      preparedForFolio(context({ weather: weather({ conditionKind: null, reasonCode: "no-signal" }) })),
    ).not.toMatch(verdicts);
  });

  it("prints the stored condition word as it was stored", () => {
    // The clause is a fragment on purpose, so `conditionKind` never lands at
    // the start of a sentence and never has to be capitalised on the way to
    // paper. Editing a stored value to fit a layout is how a small rewording
    // becomes a small untruth.
    expect(
      preparedForFolio(context({ weather: weather({ conditionKind: "heavy rain, easing" }) })),
    ).toContain("Conditions: heavy rain, easing when the reading was taken");
  });

  it("drops the provenance the A4 carries, and nothing else", () => {
    // Who said it and when it was taken answer "how do you know", which is the
    // question the artefact at the printer is for. Leaving them off a card says
    // less; it does not say anything untrue.
    const line = preparedForFolio(context());
    expect(line).not.toContain("pointmoon@2026-09-10");
    expect(line).not.toContain("07:04");
    expect(line).not.toContain("2026");
    expect(line).not.toContain("Thursday");
  });

  it("refuses a zone it cannot resolve rather than falling back to the server's", () => {
    expect(() => preparedForFolio(context({ plannedTimeZone: "Mars/Olympus_Mons" }))).toThrow();
  });
});

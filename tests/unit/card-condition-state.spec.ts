import { describe, expect, it } from "vitest";
import {
  cardCondition,
  cardConditionFromBucket,
  feltTemperature,
  type CardConditionState,
} from "@/lib/cast/conditions";
import { conditionsBucket } from "@/lib/outside/bucket";
import type { FieldTruth } from "@/lib/outside/pointmoon";

/**
 * Condition-state selection (#172 workstream B, stage 2/3).
 *
 * The daily card's whole claim is that it shapes the outing: a hot day says
 * one thing about the heat, a wet day one thing about the wet, and an ordinary
 * day says NOTHING. These tests pin the selection and, more importantly, pin
 * the two silences that the design rests on:
 *
 *   - a fine day has no adjustment line at all (mild-says-little)
 *   - a payload with no weather is null, which is NOT a fine day
 *
 * The #168 screenshot regression is pinned directly: 37 degrees must select
 * `hot` and must carry heat guidance, where the live card gave none.
 */

function payload(current: Record<string, unknown> | null): FieldTruth {
  return current === null
    ? { facts: { fieldSnapshot: {} } }
    : { facts: { fieldSnapshot: { weather: { current } } } };
}

const felt = (apparentC: number, rest: Record<string, unknown> = {}) => ({
  felt: { apparentC },
  ...rest,
});

describe("cardCondition — the five states", () => {
  const cases: Array<[string, Record<string, unknown>, CardConditionState]> = [
    ["a hot desert morning", felt(37, { skyCondition: "clear", windKph: 8 }), "hot"],
    ["right on the hot threshold", felt(26), "hot"],
    ["rain falling", felt(15, { precipitationRateMmPerHour: 3.2, windKph: 22 }), "rain"],
    ["the lightest real rain", felt(18, { precipitationRateMmPerHour: 0.2 }), "rain"],
    ["a frost morning", felt(2, { skyCondition: "clear" }), "cold"],
    ["right on the cold threshold", felt(6), "cold"],
    ["a gale", felt(14, { windKph: 45 }), "wind"],
    ["an ordinary fine day", felt(19, { skyCondition: "partly-cloudy", windKph: 11 }), "fine"],
  ];

  for (const [name, current, expected] of cases) {
    it(`reads ${name} as ${expected}`, () => {
      expect(cardCondition(payload(current))?.state).toBe(expected);
    });
  }
});

describe("exactly one adjustment line, and none on a fine day", () => {
  it("gives a fine day no adjustment at all", () => {
    const fine = cardCondition(payload(felt(19, { windKph: 10 })));
    expect(fine?.state).toBe("fine");
    // The benchmark. Not an empty string, not a reassurance: nothing.
    expect(fine?.adjustment).toBeNull();
  });

  it("gives every other state exactly one line", () => {
    const states: Array<Record<string, unknown>> = [
      felt(37),
      felt(15, { precipitationRateMmPerHour: 3 }),
      felt(1),
      felt(14, { windKph: 50 }),
    ];
    for (const current of states) {
      const got = cardCondition(payload(current));
      expect(got?.adjustment).toBeTruthy();
      // One LINE: a single string she reads in one glance with a coat in her
      // hand, never a stacked briefing. Measured as written, not as sentences —
      // the wet line earns its third clause by naming what the rain brings up,
      // which is a teaching opportunity rather than a second instruction.
      expect(got?.adjustment).not.toMatch(/\n/);
      expect((got?.adjustment ?? "").length).toBeLessThanOrEqual(90);
    }
  });

  it("keeps every line in register: no em dashes, no exclamation marks", () => {
    const all = (["hot", "rain", "cold", "wind", "fine"] as const)
      .map((state) => {
        const byState: Record<string, Record<string, unknown>> = {
          hot: felt(30),
          rain: felt(15, { precipitationRateMmPerHour: 2 }),
          cold: felt(0),
          wind: felt(14, { windKph: 60 }),
          fine: felt(18),
        };
        return cardCondition(payload(byState[state] ?? null))?.adjustment;
      })
      .filter((line): line is string => typeof line === "string");

    expect(all).toHaveLength(4);
    for (const line of all) {
      expect(line).not.toMatch(/[—–]/);
      expect(line).not.toMatch(/!/);
      // Sentence case: never a shouted word.
      expect(line).not.toMatch(/\b[A-Z]{2,}\b/);
    }
  });
});

describe("the precedence a mixed day resolves to", () => {
  it("reads a warm wet morning as rain, not hot", () => {
    const state = cardCondition(payload(felt(28, { precipitationRateMmPerHour: 4 })))?.state;
    expect(state).toBe("rain");
  });

  it("reads a hot breezy day as hot, not wind", () => {
    // 30kph is a fresh wind, not the gale the wind state is for.
    expect(cardCondition(payload(felt(31, { windKph: 30 })))?.state).toBe("hot");
  });

  it("reads a cold gale as wind, because the wind is what changes the outing", () => {
    expect(cardCondition(payload(felt(3, { windKph: 55 })))?.state).toBe("wind");
  });
});

describe("silence is not a fine day", () => {
  it("returns null when the payload carries no weather", () => {
    expect(cardCondition(payload(null))).toBeNull();
  });

  it("returns null when there was no payload at all", () => {
    expect(cardCondition(null)).toBeNull();
    expect(conditionsBucket(null)).toBeNull();
  });

  it("still reads a payload whose temperature is missing as fine rather than nothing", () => {
    // Sky but no thermometer: the day is ordinary as far as we can tell, and
    // the card is allowed to be quiet about it.
    expect(cardCondition(payload({ skyCondition: "cloudy" }))?.state).toBe("fine");
  });

  it("maps a bucket in hand to the same state", () => {
    expect(cardConditionFromBucket("wet")?.state).toBe("rain");
    expect(cardConditionFromBucket("mild")?.adjustment).toBeNull();
    expect(cardConditionFromBucket(null)).toBeNull();
  });
});

describe("the temperature carries its unit (#168)", () => {
  it("renders 37 degrees with a unit, not a bare number", () => {
    expect(feltTemperature(payload(felt(37)))).toBe("37°C");
  });

  it("rounds rather than printing a decimal at the door", () => {
    expect(feltTemperature(payload(felt(22.6)))).toBe("23°C");
  });

  it("says nothing when there is no reading", () => {
    expect(feltTemperature(payload({ skyCondition: "clear" }))).toBeNull();
    expect(feltTemperature(null)).toBeNull();
  });

  it("pins the #168 regression end to end: 37 degrees shapes the outing", () => {
    const hot = payload(felt(37, { skyCondition: "clear", windKph: 8 }));
    expect(feltTemperature(hot)).toBe("37°C");
    expect(cardCondition(hot)?.state).toBe("hot");
    // The live card said nothing at 37 degrees. It now says one thing.
    expect(cardCondition(hot)?.adjustment).toMatch(/shade and water/);
  });
});

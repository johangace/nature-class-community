import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { dayRead } from "@/lib/outside/day-read";
import type { FieldTruth } from "@/lib/outside/pointmoon";
import type { TodayRead } from "@/lib/outside/today";

/**
 * THE READ (#323). One sentence about this morning, composed from two clauses
 * the producer returned.
 *
 * The tests that matter here are the ones about what it REFUSES to say. Prose
 * reads as authored, so a sentence carrying a fact nobody reported is worse on
 * this surface than anywhere else in the product: "rain has been falling since
 * first light" is a lovely line and nothing in the payload says when it
 * started.
 */

function payload(
  current: Record<string, unknown> | null,
  ground?: string | null,
  extra: { hoursSinceRain?: number | null; lightMinutes?: number | null } = {}
): FieldTruth {
  const { hoursSinceRain, lightMinutes } = extra;
  return {
    facts: {
      fieldSnapshot: {
        ...(current ? { weather: { current } } : {}),
        ...(ground
          ? {
              ground: {
                state: ground,
                ...(hoursSinceRain != null
                  ? { hoursSinceMeaningfulPrecipitation: hoursSinceRain }
                  : {}),
              },
            }
          : {}),
        ...(lightMinutes != null
          ? { time: { windows: { daylightMinutesRemaining: lightMinutes } } }
          : {}),
      },
    },
  } as unknown as FieldTruth;
}

describe("the day's read", () => {
  /**
   * TWO SENTENCES, AND THE SECOND ONE IS THE GROUND (#355).
   *
   * Johan, on the shipped one-sentence read: *"the one we had in old proto was
   * better"*. His prototype reads "Wind's picking up... Ground's firm and dry
   * underfoot." — the air, then the ground, as two looks rather than one list.
   *
   * So the ground stops COMPETING with the air for a single second clause and
   * gets a sentence of its own, and `dry` is said now: with nothing else in the
   * slot, the state of what thirty four-year-olds would be sitting on is the
   * most useful thing this screen says.
   *
   * The readings are described as behaviour rather than as state, which is the
   * rest of the difference. Nothing here describes a pattern nobody measured:
   * no gusts, no pulses, because the producer returns one wind speed.
   */
  it("says the sky, then the air, then the ground, on an ordinary morning", () => {
    expect(dayRead(payload({ skyCondition: "clear", windKph: 2 }, "dry"))).toBe(
      "The sky's clear and the air is completely still. The ground is dry underfoot."
    );
  });

  it("names the wind when there is one", () => {
    // `cloudCoverPct`, not `skyCondition: "cloudy"` (#368). This fixture used
    // to send "cloudy", which Pointmoon CANNOT EMIT — its `SkyCondition` is
    // clear | rain | snow | smoke | haze | fog | overcast. The test passed
    // for years against an invented producer value, which is precisely why
    // nobody noticed that three of the six clauses in the table were dead and
    // that a 61%-cloud sky was being read out as "The sky's clear".
    expect(
      dayRead(payload({ skyCondition: "clear", cloudCoverPct: 72, windKph: 24 }, "dry"))
    ).toBe("The sky's cloudy and a fresh wind is moving through. The ground is dry underfoot.");
  });

  /**
   * THE BUG THIS FILE COULD NOT SEE (#368, pointmoon#34).
   *
   * Live London payload, 2026-08-23: `skyCondition: "clear"` with
   * `cloudCoverPct: 61`, beside Pointmoon's own human-readable `condition:
   * "Partly cloudy"`. `skyCondition` is a RENDER enum and collapses every
   * cloud amount below 85% into `clear`.
   *
   * A class was told the sky was clear under six-tenths cloud.
   */
  it("does not call a sixty-one percent cloud sky clear", () => {
    const london = payload(
      { skyCondition: "clear", cloudCoverPct: 61, windKph: 3.6 },
      "dry"
    );
    expect(dayRead(london)).toBe(
      "The sky's cloudy and the air is completely still. The ground is dry underfoot."
    );
    expect(dayRead(london)).not.toMatch(/clear/);
  });

  it("prefers the producer's own band over the number when it arrives", () => {
    // pointmoon#34 adds `skyCover`. Until it deploys, `cloudCoverPct` answers.
    // Both land on the same word, so no school gets a different sentence the
    // week Pointmoon ships.
    expect(
      dayRead(payload({ skyCondition: "clear", skyCover: "partly-cloudy", windKph: 2 }, "dry"))
    ).toBe("Clouds are drifting over and the air is completely still. The ground is dry underfoot.");
    expect(
      dayRead(payload({ skyCondition: "clear", cloudCoverPct: 45, windKph: 2 }, "dry"))
    ).toBe("Clouds are drifting over and the air is completely still. The ground is dry underfoot.");
  });

  /**
   * THREE VALUES THE PRODUCER SENDS AND THIS SENTENCE HAD NO CLAUSE FOR.
   *
   * `haze`, `smoke` and `snow` are all real `SkyCondition` members. Before
   * #368 each fell through to `undefined`, so the sentence lost its opening
   * clause entirely and a smoky morning read as the ground alone.
   */
  it("has a clause for every sky the producer can actually report", () => {
    expect(dayRead(payload({ skyCondition: "haze", windKph: 2 }, "dry"))).toBe(
      "The air is hazy and the air is completely still. The ground is dry underfoot."
    );
    expect(dayRead(payload({ skyCondition: "smoke", windKph: 2 }, "dry"))).toBe(
      "There's smoke in the air and the air is completely still. The ground is dry underfoot."
    );
    expect(dayRead(payload({ skyCondition: "snow", windKph: 2 }, "frozen"))).toBe(
      "Snow is falling and the air is completely still. The ground is frozen hard."
    );
  });

  it("lets fog, haze, smoke and snow outrank any amount of cloud", () => {
    // How much cloud sits above a fog bank is not the sentence anyone needs.
    expect(
      dayRead(payload({ skyCondition: "fog", cloudCoverPct: 12, windKph: 2 }, "damp"))
    ).toBe("There's fog and the air is completely still. The ground is damp underfoot.");
  });

  it("leads with the rain, and the ground still gets its own sentence", () => {
    // Rain outranks the sky word for the opening clause: what thirty children
    // will be standing in is the consequence that decides whether coats go on.
    const wet = payload(
      { skyCondition: "overcast", windKph: 8, precipitationRateMmPerHour: 3 },
      "wet"
    );
    expect(dayRead(wet)).toBe(
      "Rain is falling and a light breeze is moving. The ground is wet underfoot."
    );
    expect(dayRead(wet)).not.toMatch(/soft grey/);
  });

  it("tells light rain from rain, because the producer does", () => {
    expect(
      dayRead(payload({ skyCondition: "overcast", precipitationRateMmPerHour: 0.6 }, "damp"))
    ).toBe("A light rain is falling. The ground is damp underfoot.");
  });

  it("gets shorter rather than hedging when a clause is missing", () => {
    expect(dayRead(payload({ skyCondition: "clear" }))).toBe("The sky's clear.");
    expect(dayRead(payload({}, "saturated"))).toBe("The ground is waterlogged.");
  });

  it("says the ground whatever the ground is, including dry", () => {
    expect(dayRead(payload({ skyCondition: "clear", windKph: 1 }, "frozen"))).toBe(
      "The sky's clear and the air is completely still. The ground is frozen hard."
    );
    expect(
      dayRead(payload({ skyCondition: "clear", cloudCoverPct: 72, windKph: 24 }, "damp"))
    ).toBe("The sky's cloudy and a fresh wind is moving through. The ground is damp underfoot.");
    expect(dayRead(payload({ windKph: 1 }, "frozen"))).toBe(
      "The air is completely still. The ground is frozen hard."
    );
  });

  /**
   * THE READ SAYS WHAT THE MARK CANNOT (2026-09-07).
   *
   * Johan, at noon on a fine September day: *"this is so uninformative... we
   * can do better"*. The two readings below were on the payload the whole
   * time and nothing on Today said either.
   */
  it("says how long the ground has been dry, in days, once it has been two", () => {
    expect(
      dayRead(payload({ skyCondition: "overcast", windKph: 10 }, "dry", { hoursSinceRain: 99 }))
    ).toBe(
      "The sky's a soft grey and a light breeze is moving. The ground is dry underfoot after 4 days without rain."
    );
    expect(dayRead(payload({ windKph: 1 }, "dry", { hoursSinceRain: 48 }))).toBe(
      "The air is completely still. The ground is dry underfoot after 2 days without rain."
    );
    expect(dayRead(payload({ windKph: 1 }, "dry", { hoursSinceRain: 24 * 20 }))).toBe(
      "The air is completely still. The ground is dry underfoot after 3 weeks without rain."
    );
  });

  it("does not turn a day and a half into a dry spell, and never counts on damp ground", () => {
    expect(dayRead(payload({ windKph: 1 }, "dry", { hoursSinceRain: 36 }))).toBe(
      "The air is completely still. The ground is dry underfoot."
    );
    // Damp ground three days after rain is a fact about the drainage, not
    // the weather, and the sentence does not guess which.
    expect(dayRead(payload({ windKph: 1 }, "damp", { hoursSinceRain: 72 }))).toBe(
      "The air is completely still. The ground is damp underfoot."
    );
  });

  it("says how much light is left only when there is little of it", () => {
    const afternoon = { skyCondition: "overcast", windKph: 10 };
    expect(dayRead(payload(afternoon, "damp", { lightMinutes: 85 }))).toBe(
      "The sky's a soft grey and a light breeze is moving. The ground is damp underfoot. About 85 minutes of light left."
    );
    expect(dayRead(payload(afternoon, "damp", { lightMinutes: 95 }))).toBe(
      "The sky's a soft grey and a light breeze is moving. The ground is damp underfoot. About 1 and a half hours of light left."
    );
    expect(dayRead(payload(afternoon, "damp", { lightMinutes: 0 }))).toBe(
      "The sky's a soft grey and a light breeze is moving. The ground is damp underfoot. The light has gone."
    );
    // Seven hours left at noon is not a decision, so it is not a sentence.
    expect(dayRead(payload(afternoon, "damp", { lightMinutes: 420 }))).toBe(
      "The sky's a soft grey and a light breeze is moving. The ground is damp underfoot."
    );
    expect(dayRead(payload(afternoon, "damp", { lightMinutes: 120 }))).not.toMatch(/light left/);
    // The light stands on its own when the sky and the ground did not come back.
    expect(dayRead(payload({}, null, { lightMinutes: 40 }))).toBe("About 40 minutes of light left.");
  });

  it("says nothing at all when nothing came back", () => {
    expect(dayRead(null)).toBeNull();
    expect(dayRead(payload(null))).toBeNull();
    // An unrecognised sky word with no cloud number behind it composes
    // nothing, rather than guessing at a band.
    expect(dayRead(payload({ skyCondition: "not-a-sky" }))).toBeNull();
  });

  it("invents no clause the payload did not carry", () => {
    // Every sentence this can produce, walked, and none of them may contain a
    // time of day, a forecast or a feeling. The dry spell and the light left
    // are readings the producer took, not guesses about the day's shape.
    const skies = ["clear", "mostly-clear", "partly-cloudy", "cloudy", "overcast", "fog"];
    const grounds = ["dry", "damp", "wet", "saturated", "frozen", "snow"];
    const banned =
      /first light|this morning|all day|earlier|later|since|will |soon|lovely|miserable|perfect/i;

    for (const skyCondition of skies) {
      for (const state of grounds) {
        for (const rain of [0, 0.6, 4]) {
          for (const windKph of [0, 10, 25, 45]) {
            for (const extra of [{}, { hoursSinceRain: 80 }, { lightMinutes: 30 }]) {
              const line = dayRead(
                payload({ skyCondition, windKph, precipitationRateMmPerHour: rain }, state, extra)
              );
              expect(line).toBeTruthy();
              expect(line).not.toMatch(banned);
              // Sentence case, at most three sentences, each closed, no em
              // dashes; the third only ever the light.
              expect(line).toMatch(/^[A-Z][^.]*\.( [A-Z][^.]*\.)?( [A-Z][^.]*light[^.]*\.)?$/);
              expect(line).not.toMatch(/—|--/);
            }
          }
        }
      }
    }
  });
});

/**
 * THE TOP SLOT CARRIES THE READ, AND ONLY THE READ (2026-09-08).
 *
 * Johan, on Today: *"the top slot can become smaller and less relevant. we can
 * add the lesson note on the runner inside with a conditions or something
 * label only when we have it"*.
 *
 * `app/TodayDay.tsx` used to run a three-rung ladder here — the authored
 * hinge, then the day's adjustment, then the composed read — so the same
 * pixels were advice about the lesson on one morning and a weather report on
 * the next, with nothing saying the slot had changed meaning. These pin the
 * one-source rule that replaced it, and the empty case that has always held:
 * a null read renders nothing, never a placeholder.
 *
 * The hinge's new home is tested where it lives, in
 * `tests/unit/hinge-on-the-day-screen.spec.tsx`.
 */
const READ: TodayRead = {
  scope: "school",
  className: "Willow class",
  school: "St Mary’s Primary",
  read: "The sky is a soft grey and a light breeze is moving. The ground is wet underfoot.",
  condition: { state: "rain", adjustment: "Wet day. Take the spare coats and keep it short." },
  conditionKind: "wet",
  conditions: ["wet"],
  temperature: "14°C",
  sky: "a soft grey sky · a light breeze",
  skyMark: "overcast",
  ground: "wet underfoot",
  facts: [],
  doorFaces: [],
  outsideAvailable: true,
};

vi.mock("@/lib/outside/today", () => ({ getTodayRead: vi.fn() }));

async function renderDay(over: Partial<TodayRead> = {}) {
  const { getTodayRead } = await import("@/lib/outside/today");
  vi.mocked(getTodayRead).mockResolvedValue({ ...READ, ...over } as never);
  const { TodayDay } = await import("@/app/TodayDay");
  return renderToStaticMarkup(await TodayDay({ query: {} }));
}

describe("Today's top slot", () => {
  it("says the composed read, on a day that also has a hinge and an adjustment", async () => {
    const markup = await renderDay();
    expect(markup).toContain("The sky is a soft grey and a light breeze is moving.");
    // The adjustment does not render on this screen any more. It is not
    // deleted from the product: DailyCard and the /outside brief still read
    // it, and card-condition-state.spec.ts still holds its producer.
    expect(markup).not.toContain("Wet day. Take the spare coats");
  });

  it("has no rung to fall to: no read is no block", async () => {
    const markup = await renderDay({ read: null });
    expect(markup).not.toContain("_readBlock_");
    // Not a placeholder and not the adjustment standing in for it.
    expect(markup).not.toContain("Wet day. Take the spare coats");
    // The sky mark and the temperature are untouched by any of this.
    expect(markup).toContain("14°C");
  });

  it("keeps the live dot on the label row when the label shows", async () => {
    const { getTodayRead } = await import("@/lib/outside/today");
    vi.mocked(getTodayRead).mockResolvedValue(READ as never);
    const { TodayDay } = await import("@/app/TodayDay");
    const markup = renderToStaticMarkup(await TodayDay({ query: {}, showReadLabel: true }));
    expect(markup).toContain("Outside now");
    expect(markup).toContain("_liveDot_");
  });

  it("steps the sentence down one step of the scale and takes the soft ink", () => {
    // Tokens, not pixels: the step is the scale's own next value, so a change
    // to the scale still moves this line.
    const css = readFileSync(new URL("../../app/today.module.css", import.meta.url), "utf8");
    const rule = css.slice(css.indexOf(".read {"), css.indexOf("}", css.indexOf(".read {")) + 1);
    expect(rule).toMatch(/font-size:\s*var\(--size-3\)/);
    expect(rule).toMatch(/color:\s*var\(--ink-soft\)/);
    expect(rule).not.toMatch(/\d+px/);
  });

  it("no longer resolves the hinge or the adjustment in the day block", () => {
    const source = readFileSync(new URL("../../app/TodayDay.tsx", import.meta.url), "utf8");
    expect(source).not.toContain("resolveHinge");
    expect(source).not.toContain("condition?.adjustment");
    expect(source).toContain("const reason = today.read;");
  });
});

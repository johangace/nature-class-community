import { describe, expect, it } from "vitest";
import { checkConditionsLine, type ConditionsFacts } from "@/lib/ai/conditions-line";

/**
 * The numbers-unchanged guard on the conditions line.
 *
 * Johan, 2026-08-17: *"add ai intelligence instead of hard coded
 * intelligence"*. So the first line a teacher reads on the card is written by
 * the model now, instead of being concatenated from three lookup tables into
 * the same sentence shape it has had since it was written.
 *
 * office#330 specified this exact case: templates and deterministic
 * comparison, the model limited to register, with a NUMBERS-UNCHANGED DIFF
 * CHECK. This file is that check, and it is the reason the model can be let
 * anywhere near a measurement.
 *
 * The temperature is the thing that cannot move. A teacher who reads a number
 * a degree out for no reason stops trusting the rest of the card, and the card
 * is the whole claim to being about right now.
 */

const FACTS: ConditionsFacts = {
  degrees: 13,
  sky: "a soft grey sky",
  wind: "a light breeze",
  raining: false,
  heavyRain: false,
  fallback: "Right now it feels like 13 degrees out under a soft grey sky, with a light breeze.",
};

const ok = (draft: string) => checkConditionsLine(draft, FACTS).ok;
const why = (draft: string) => checkConditionsLine(draft, FACTS).reason;

describe("what it lets through", () => {
  it("accepts a warm sentence carrying the measurement unchanged", () => {
    expect(ok("It feels like 13 degrees out there, grey and soft, with a light breeze.")).toBe(true);
  });

  it("lets the model choose what to lead with", () => {
    // The whole point of asking a model rather than a template: the wind can
    // come first on a windy day.
    expect(ok("There is a light breeze today and it feels like 13 degrees.")).toBe(true);
  });

  it("lets it leave something out", () => {
    expect(ok("It feels like 13 degrees under a soft grey sky.")).toBe(true);
  });
});

describe("the number cannot move", () => {
  it("stops a rounded temperature", () => {
    // The failure that costs a teacher's trust in everything else on the card.
    expect(ok("It feels like about 12 degrees out.")).toBe(false);
    expect(why("It feels like 12 degrees out.")).toMatch(/changed or added/);
  });

  it("stops a converted temperature", () => {
    expect(ok("It feels like 55 degrees out.")).toBe(false);
  });

  it("stops a helpful extra number", () => {
    // "with an 11 kph breeze" is a fact we did not give it in a form we can
    // check, and a number on screen reads as measured whether or not it is.
    expect(ok("It feels like 13 degrees, with an 11 kph breeze.")).toBe(false);
    expect(why("It feels like 13 degrees, with an 11 kph breeze.")).toMatch(/changed or added/);
  });

  it("stops a line that lost the temperature altogether", () => {
    expect(ok("It feels mild out, with a light breeze.")).toBe(false);
    expect(why("It feels mild out.")).toMatch(/lost the temperature/);
  });
});

describe("weather it was not told", () => {
  it("stops a forecast", () => {
    // Nothing here can support a claim about later, and no teacher can check it.
    for (const draft of [
      "It feels like 13 degrees, clearing later.",
      "It feels like 13 degrees and it will be warmer this afternoon.",
      "It feels like 13 degrees, expect rain.",
    ]) {
      expect(ok(draft), draft).toBe(false);
    }
  });

  it("stops a season nobody mentioned", () => {
    // The season-word failure office#330 named: a model writing "autumn" for a
    // wet-and-dry pack has invented a season, and no proper-noun check sees it.
    expect(ok("It feels like 13 degrees, a real autumn chill in the air.")).toBe(false);
    expect(why("A proper winter 13 degrees.")).toMatch(/not measured/);
  });

  it("stops invented rain", () => {
    expect(ok("It feels like 13 degrees and a light rain is falling.")).toBe(false);
    expect(why("It feels like 13 degrees, quite wet out.")).toMatch(/invented rain/);
  });

  it("allows rain when it is actually raining", () => {
    const wet: ConditionsFacts = { ...FACTS, raining: true };
    expect(checkConditionsLine("It feels like 13 degrees and rain is falling.", wet).ok).toBe(true);
  });
});

describe("register", () => {
  it("holds the same rules as everything else a teacher reads", () => {
    expect(ok("It feels like 13 degrees — grey and soft.")).toBe(false);
    expect(ok("It feels like 13 degrees out!")).toBe(false);
    expect(ok("IT feels like 13 degrees.")).toBe(false);
    expect(ok("")).toBe(false);
  });

  it("stops it running long, because this is read aloud at a door", () => {
    const long =
      "It feels like 13 degrees out there today under a really rather soft and gentle grey sky with a light breeze moving through everything around the whole of your school grounds right now.";
    expect(ok(long)).toBe(false);
  });
});

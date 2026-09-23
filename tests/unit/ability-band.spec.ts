import { describe, expect, it } from "vitest";
import { bandForYearGroup, abilityLabels } from "@/lib/ability";
import { abilityBands } from "@/schema/pack";

/**
 * The lesson screen rendered a hardcoded "y1" for every class, so a Reception
 * class heard Year 1 wording and a Year 2 class heard it too, with nothing on
 * screen to say so. Ability variants exist so a four-year-old and a
 * seven-year-old are not asked the same question in the same words; serving one
 * band to all three is worse than having none, because it looks deliberate.
 *
 * These tests fail against a hardcoded band, which is the point.
 */
describe("a class's year group decides its ability band", () => {
  it("maps every year group a teacher can actually choose", () => {
    // The three values app/classes/actions.ts and app/start/vocab.ts allow.
    expect(bandForYearGroup("Reception")).toBe("reception");
    expect(bandForYearGroup("Year 1")).toBe("y1");
    expect(bandForYearGroup("Year 2")).toBe("y2");
  });

  it("covers every band, so a new band cannot be added without a year group", () => {
    for (const band of abilityBands) {
      expect(bandForYearGroup(abilityLabels[band])).toBe(band);
    }
  });

  it("does not silently answer y1 for an unknown or missing year group", () => {
    // `yearGroup` is a free String in the schema, so this is a real case. The
    // caller must decide what unknown means; guessing is the original bug.
    for (const value of [null, undefined, "", "  ", "Year 6", "nursery"]) {
      expect(bandForYearGroup(value)).toBeNull();
    }
  });

  it("tolerates the casing and padding a stored string can carry", () => {
    expect(bandForYearGroup("  reception ")).toBe("reception");
    expect(bandForYearGroup("YEAR 2")).toBe("y2");
  });
});

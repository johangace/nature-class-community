import { describe, expect, it } from "vitest";
import { isYoungestAbility, isYoungestYearGroup } from "@/lib/cast/safety";
import { deriveAbilityBand, learnerContextForClass } from "@/lib/learner-context";
import { YEAR_GROUPS } from "@/app/start/vocab";

/**
 * The LearnerContext guard (#205).
 *
 * Two claims, and the second is the one that has to hold under a migration:
 *
 *   1. The stored ability band WINS over the one derived from a year group.
 *      Age and ability are orthogonal (J2), so a Year 2 class taught at
 *      reception band is a real state and must resolve as one.
 *   2. EXISTING BEHAVIOUR IS UNCHANGED. Every class row that predates the
 *      columns has all three null, and for those the derived band must give the
 *      exact verdict the year group gave — including the youngest-years safety
 *      exclusion, which is the one place this is not merely cosmetic.
 *
 * The isolating fixture for (2) is the parity test below. It walks the real
 * year-group vocabulary rather than a hand-written list, so a year group added
 * to the form and forgotten here fails instead of silently defaulting.
 */

describe("deriving an ability band from a year group", () => {
  it("maps the product's own year groups one to one", () => {
    expect(deriveAbilityBand("Reception")).toBe("reception");
    expect(deriveAbilityBand("Year 1")).toBe("y1");
    expect(deriveAbilityBand("Year 2")).toBe("y2");
  });

  it("covers every year group the class form actually offers", () => {
    // The fixture that catches a widened form: a new year group with no band
    // reads null here and would silently lose its ability variants.
    for (const yearGroup of YEAR_GROUPS) {
      expect(deriveAbilityBand(yearGroup), yearGroup).not.toBeNull();
    }
  });

  it("answers null for a year group this product does not serve", () => {
    // Not a nearest match. Answering "reception" for an unknown year group
    // would hand a seven-year-old a four-year-old's lesson while looking like
    // a working default.
    expect(deriveAbilityBand("Year 6")).toBeNull();
    expect(deriveAbilityBand("")).toBeNull();
    expect(deriveAbilityBand(null)).toBeNull();
    expect(deriveAbilityBand(undefined)).toBeNull();
  });
});

describe("the learner context a class row composes to", () => {
  it("derives the band for a row that predates the column", () => {
    const learner = learnerContextForClass({ yearGroup: "Year 1", abilityBand: null });
    expect(learner.abilityBand).toBe("y1");
    expect(learner.ageBand).toBe("Year 1");
  });

  it("lets an explicit band override the year group — the axes are orthogonal", () => {
    const learner = learnerContextForClass({
      yearGroup: "Year 2",
      abilityBand: "reception",
    });
    expect(learner.abilityBand).toBe("reception");
    // The age axis is untouched. Overriding one must never rewrite the other.
    expect(learner.ageBand).toBe("Year 2");
  });

  it("never derives a jurisdiction from anything", () => {
    // The year-group dropdown offers England's words only, so deriving from it
    // would stamp every school on earth "england" — Phoenix included, which is
    // the precise test case this dimension exists for.
    const learner = learnerContextForClass({ yearGroup: "Reception" });
    expect(learner.jurisdiction).toBeNull();
    expect(learner.sessionShape).toBeNull();
  });

  it("carries a stored jurisdiction and session shape through verbatim", () => {
    const learner = learnerContextForClass({
      yearGroup: "Reception",
      jurisdiction: "us-az",
      sessionShape: "single-45",
    });
    expect(learner.jurisdiction).toBe("us-az");
    expect(learner.sessionShape).toBe("single-45");
  });

  it("fills only the grounds slice of the site profile, never the rest", () => {
    const learner = learnerContextForClass({
      yearGroup: "Reception",
      grounds: ["trees", "pond"],
    });
    expect(learner.siteProfile?.grounds).toEqual(["trees", "pond"]);
    // A school with "trees" ticked has not told us whether its lawn is watered,
    // and the watered lawn is the sneakiest lie surface in the inventory.
    expect(learner.siteProfile?.managedLandscapeOverride).toBeNull();
    expect(learner.siteProfile?.microclimate).toBeNull();
    expect(learner.siteProfile?.substrate).toBeNull();
  });

  it("leaves the site profile null when a class has no grounds", () => {
    expect(learnerContextForClass({ yearGroup: "Reception" }).siteProfile).toBeNull();
  });
});

describe("the youngest-years exclusion under the new axis", () => {
  it("gives the identical verdict for every pre-migration row", () => {
    // THE PARITY FIXTURE. Every existing class has abilityBand null, so the
    // derived band must reproduce the year group's verdict exactly. Break the
    // derivation and a hornet either appears in a reception cast or disappears
    // from a Year 2 one, and this goes red on the year group that moved.
    for (const yearGroup of YEAR_GROUPS) {
      const learner = learnerContextForClass({ yearGroup, abilityBand: null });
      expect(isYoungestAbility(learner.abilityBand), yearGroup).toBe(
        isYoungestYearGroup(yearGroup)
      );
    }
  });

  it("protects a Year 2 class that is taught at reception band", () => {
    // The behaviour that could not be expressed before: the exclusion is about
    // who is reading, not how old they are.
    const learner = learnerContextForClass({
      yearGroup: "Year 2",
      abilityBand: "reception",
    });
    expect(isYoungestYearGroup("Year 2")).toBe(false);
    expect(isYoungestAbility(learner.abilityBand)).toBe(true);
  });

  it("does not treat an unknown band as youngest", () => {
    expect(isYoungestAbility("y2")).toBe(false);
    expect(isYoungestAbility("")).toBe(false);
    expect(isYoungestAbility(null)).toBe(false);
    expect(isYoungestAbility(undefined)).toBe(false);
  });
});

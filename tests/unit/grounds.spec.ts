import { describe, expect, it } from "vitest";
import { asHabitatTags, groundsToHabitats } from "@/lib/outside/grounds";

/**
 * GROUNDS AS DETERMINISTIC HABITAT FILTERS (#54).
 *
 * `groundsToHabitats` is the one honest bridge between the six words
 * onboarding offers a teacher and the `HabitatTag` vocabulary the phenology
 * layer actually filters on (getPhenologyEntries, lib/outside/phenology.ts —
 * itself proven to filter deterministically in tests/unit/school-world.spec.ts).
 * These tests pin the bridge itself: the mapping is fixed, and two
 * contrasting grounds selections produce two different, non-overlapping
 * habitat sets — which is what makes the difference downstream deterministic
 * rather than incidental.
 */
describe("groundsToHabitats", () => {
  it("maps every onboarding ground to its habitat tags", () => {
    expect(groundsToHabitats(["trees"])).toEqual(["woodland"]);
    expect(new Set(groundsToHabitats(["meadow"]))).toEqual(new Set(["meadow", "grassland"]));
    expect(groundsToHabitats(["hedgerow"])).toEqual(["hedgerow"]);
    expect(new Set(groundsToHabitats(["pond"]))).toEqual(new Set(["pond", "stream"]));
    expect(new Set(groundsToHabitats(["playground"]))).toEqual(
      new Set(["playing_field", "urban"])
    );
    expect(groundsToHabitats(["coast"])).toEqual(["coast"]);
  });

  it("de-duplicates habitats shared by more than one selected ground", () => {
    // "pond" and a hypothetical second ground both claiming "stream" should
    // not double the tag; here two grounds share nothing, but the Set
    // discipline is what this asserts.
    const tags = groundsToHabitats(["trees", "trees"]);
    expect(tags).toEqual(["woodland"]);
  });

  it("contributes nothing for an unrecognised ground rather than guessing", () => {
    expect(groundsToHabitats(["sky", "underground-lair"])).toEqual([]);
  });

  it("is empty for no grounds at all, which filters nothing downstream", () => {
    expect(groundsToHabitats([])).toEqual([]);
  });

  it("two contrasting grounds selections produce two different, non-overlapping habitat sets", () => {
    // The isolating case the acceptance criterion names: "at least two
    // contrasting grounds sets" (#54). A pond-and-trees school and a
    // coast-and-playground school should never be asked to share look-fors.
    const wetWoodland = new Set(groundsToHabitats(["trees", "pond"]));
    const coastalYard = new Set(groundsToHabitats(["coast", "playground"]));

    expect(wetWoodland).toEqual(new Set(["woodland", "pond", "stream"]));
    expect(coastalYard).toEqual(new Set(["coast", "playing_field", "urban"]));
    for (const tag of wetWoodland) expect(coastalYard.has(tag)).toBe(false);
  });
});

describe("asHabitatTags", () => {
  it("keeps only the values the phenology corpus actually filters on", () => {
    expect(asHabitatTags(["woodland", "pond", "coast"])).toEqual([
      "woodland",
      "pond",
      "coast",
    ]);
  });

  it("drops a value the corpus does not recognise, quietly rather than matching everything", () => {
    // Silently keeping an unrecognised tag would reach the phenology filter
    // and match nothing, which reads as "no wildlife here" rather than as the
    // typo it actually is.
    expect(asHabitatTags(["woodland", "not-a-real-habitat"])).toEqual(["woodland"]);
  });

  it("is empty for an empty list", () => {
    expect(asHabitatTags([])).toEqual([]);
  });
});

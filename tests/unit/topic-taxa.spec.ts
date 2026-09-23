import { describe, expect, it } from "vitest";
import { resolveCast } from "@/lib/cast/resolve";
import { hasTaxa, matchesTopic, pointmoonObservationTaxa } from "@/lib/outside/observations";
import type { FieldTruth } from "@/lib/outside/pointmoon";
import { isTreeGenus } from "@/lib/outside/tree-genera";

/**
 * nc#962: the mask lesson showed buddleia, spear thistle and bittersweet.
 * Two facts the feed cannot express, made explicit here: a tree is not the
 * whole plant kingdom, and a lesson can be about animals.
 */

describe("a tree is not a plant kingdom (nc#962)", () => {
  it("knows an oak, a maple and a pine by genus", () => {
    expect(isTreeGenus("Quercus robur")).toBe(true);
    expect(isTreeGenus("Acer campestre")).toBe(true);
    expect(isTreeGenus("Pinus sylvestris")).toBe(true);
  });

  it("does not call a buddleia, a thistle or a bittersweet a tree", () => {
    expect(isTreeGenus("Buddleja davidii")).toBe(false);
    expect(isTreeGenus("Cirsium vulgare")).toBe(false);
    expect(isTreeGenus("Solanum dulcamara")).toBe(false);
  });

  it("drops a plant with no scientific name rather than guessing", () => {
    expect(isTreeGenus(null)).toBe(false);
    expect(isTreeGenus("")).toBe(false);
    expect(matchesTopic("Plantae", ["trees"], null)).toBe(false);
  });

  it("gates only the trees tag: plants still means every plant", () => {
    expect(matchesTopic("Plantae", ["trees"], "Cirsium vulgare")).toBe(false);
    expect(matchesTopic("Plantae", ["plants"], "Cirsium vulgare")).toBe(true);
    expect(matchesTopic("Plantae", ["trees"], "Quercus robur")).toBe(true);
  });
});

describe("a lesson can be about animals (nc#962)", () => {
  it("maps animals to the creatures a child pretends to be, and the feed can ask for them", () => {
    expect(hasTaxa("animals")).toBe(true);
    expect(matchesTopic("Mammalia", ["animals"], "Vulpes vulpes")).toBe(true);
    expect(matchesTopic("Aves", ["animals"], "Pica pica")).toBe(true);
    expect(matchesTopic("Plantae", ["animals"], "Buddleja davidii")).toBe(false);
    expect(pointmoonObservationTaxa("animals")).toEqual(["Mammalia", "Aves", "Amphibia", "Reptilia"]);
  });
});

function nearby(entries: Array<{ name: string; scientificName: string; iconicTaxon: string }>): FieldTruth {
  return {
    facts: {
      fieldSnapshot: {
        observations: {
          nearby: entries.map((e) => ({ ...e, count: 5, yearsObserved: 3, ratioToHistorical: 1 })),
        },
      },
    },
  };
}

describe("the strict cast, on the sightings that produced the bug", () => {
  const theDay = nearby([
    { name: "Buddleia", scientificName: "Buddleja davidii", iconicTaxon: "Plantae" },
    { name: "Spear Thistle", scientificName: "Cirsium vulgare", iconicTaxon: "Plantae" },
    { name: "bittersweet", scientificName: "Solanum dulcamara", iconicTaxon: "Plantae" },
    { name: "English Oak", scientificName: "Quercus robur", iconicTaxon: "Plantae" },
    { name: "Red Fox", scientificName: "Vulpes vulpes", iconicTaxon: "Mammalia" },
  ]);

  it("shows a trees lesson the oak and none of the three", () => {
    const cast = resolveCast({ data: theDay, phenology: [], topic: "trees", topicFilter: true });
    expect(cast.members.map((m) => m.commonName)).toEqual(["English Oak"]);
  });

  it("shows an animals lesson the fox and no plant at all", () => {
    const cast = resolveCast({ data: theDay, phenology: [], topic: "animals", topicFilter: true });
    expect(cast.members.map((m) => m.commonName)).toEqual(["Red Fox"]);
  });

  it("resolves an empty cast, not three plants, when a trees lesson has no tree nearby", () => {
    const noTrees = nearby([
      { name: "Buddleia", scientificName: "Buddleja davidii", iconicTaxon: "Plantae" },
      { name: "Spear Thistle", scientificName: "Cirsium vulgare", iconicTaxon: "Plantae" },
    ]);
    const cast = resolveCast({ data: noTrees, phenology: [], topic: "trees", topicFilter: true });
    expect(cast.members).toEqual([]);
  });
});

/**
 * nc#1012: "From leaf to soil" asked where a fallen leaf goes and the door
 * answered with a bracket fungus and an adult moth. Both were legitimately
 * on topic — `soil` meant Fungi and Insecta and nothing else — but the trees
 * the leaves actually fell from could not be reached at all.
 */
describe("a decomposition lesson can name the tree the leaf fell from (nc#1012)", () => {
  it("lets a soil lesson reach the trees overhead", () => {
    expect(matchesTopic("Plantae", ["soil"], "Quercus robur")).toBe(true);
    expect(matchesTopic("Plantae", ["soil"], "Fagus sylvatica")).toBe(true);
    expect(matchesTopic("Plantae", ["soil"], "Aesculus hippocastanum")).toBe(true);
    expect(matchesTopic("Plantae", ["soil"], "Tilia cordata")).toBe(true);
    expect(matchesTopic("Plantae", ["soil"], "Acer campestre")).toBe(true);
  });

  it("still refuses a thistle under a lesson about leaf litter", () => {
    expect(matchesTopic("Plantae", ["soil"], "Cirsium vulgare")).toBe(false);
    expect(matchesTopic("Plantae", ["soil"], "Buddleja davidii")).toBe(false);
    expect(matchesTopic("Plantae", ["soil"], null)).toBe(false);
  });

  /*
   * The gate is per-taxon, not per-tag, and this is the test that says so.
   * A woodlouse and a bracket fungus have no tree's genus; gating the whole
   * `soil` tag would have emptied the decomposers the lesson is about.
   */
  it("does not make the decomposers clear a tree's genus", () => {
    expect(matchesTopic("Fungi", ["soil"], "Laetiporus sulphureus")).toBe(true);
    expect(matchesTopic("Insecta", ["soil"], "Forficula auricularia")).toBe(true);
    // No scientific name at all is still fine on an ungated leg.
    expect(matchesTopic("Fungi", ["soil"], null)).toBe(true);
  });

  it("asks Pointmoon for the plants as well, so the trees can arrive", () => {
    expect(pointmoonObservationTaxa("soil")).toEqual(["Fungi", "Insecta", "Plantae"]);
  });

  it("leaves every other tag exactly as it was", () => {
    expect(matchesTopic("Plantae", ["plants"], "Cirsium vulgare")).toBe(true);
    expect(matchesTopic("Plantae", ["trees"], "Cirsium vulgare")).toBe(false);
    expect(matchesTopic("Insecta", ["minibeasts"], null)).toBe(true);
  });
});

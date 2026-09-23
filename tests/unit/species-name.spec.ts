import { describe, expect, it } from "vitest";
import { displaySpeciesName } from "@/lib/cast/species-name";

/**
 * Display casing for species common names (presentation only).
 *
 * WHAT THIS SPEC IS FOR. The standing rule is that we never edit a name in the
 * data, so the only defence against this function is a test that pins the exact
 * strings it may and may not touch. The dangerous failure is not "the casing
 * looks off"; it is a proper noun quietly lowercased in a way nobody diffs.
 * Every case below that names a real person or place is a mangle regression
 * test, not a style test.
 *
 * The names here are not invented. Every one is drawn from the corpus the rule
 * was measured against on 2026-08-18 — lib/outside/data/taxon-reference.json,
 * the fifteen region files under lib/outside/data/phenology/, and the Pointmoon
 * fixtures in tests/fixtures/ — except the four in "the four from the brief",
 * which come from the live iNaturalist payload the Today screen actually reads.
 */
describe("displaySpeciesName", () => {
  describe("the four names that started this", () => {
    it("lowercases a title-cased second word", () => {
      expect(displaySpeciesName("Common Cicada")).toBe("Common cicada");
    });

    it("lowercases across a hyphen without touching the first word", () => {
      expect(displaySpeciesName("Short-toed Snake-Eagle")).toBe(
        "Short-toed snake-eagle",
      );
    });

    it("keeps a personal eponym", () => {
      expect(displaySpeciesName("Hermann's Tortoise")).toBe(
        "Hermann's tortoise",
      );
    });

    it("capitalises a name that arrived all lowercase", () => {
      expect(displaySpeciesName("common fig")).toBe("Common fig");
    });
  });

  /**
   * Rule 1: a capitalised possessive is kept unconditionally. Each of these is
   * a real person, and each is the reason the scientific-name filter was
   * rejected — see the note on the function.
   */
  describe("personal eponyms survive", () => {
    it.each([
      ["Queen Anne's Lace", "Queen Anne's lace"],
      ["Steller's Jay", "Steller's jay"],
      ["Swainson's Thrush", "Swainson's thrush"],
      ["Anna's Hummingbird", "Anna's hummingbird"],
      ["Douglas's Squirrel", "Douglas's squirrel"],
      ["Allen's Hummingbird", "Allen's hummingbird"],
    ])("%s -> %s", (input, expected) => {
      expect(displaySpeciesName(input)).toBe(expected);
    });

    it("keeps a bare eponym that has no apostrophe to mark it", () => {
      // Susan is a person. This is the shape a regex cannot tell from
      // "song Sparrow", so the word is listed rather than detected.
      expect(displaySpeciesName("Black-eyed Susan")).toBe("Black-eyed Susan");
      expect(displaySpeciesName("black-eyed Susan")).toBe("Black-eyed Susan");
    });

    it("keeps a bare eponym in the middle of a hyphenated name", () => {
      expect(displaySpeciesName("Joe-Pye Weed")).toBe("Joe-Pye weed");
      expect(displaySpeciesName("sweet Joe-Pye-weed")).toBe("Sweet Joe-Pye-weed");
    });

    it("never invents a capital on a possessive that arrived lowercase", () => {
      // Lowercasing is recoverable by reading the source. A wrong capital
      // looks authored, so the function is not entitled to add one.
      expect(displaySpeciesName("hermann's tortoise")).toBe(
        "Hermann's tortoise",
      );
    });
  });

  describe("geography and demonyms survive", () => {
    it.each([
      ["New England Aster", "New England aster"],
      ["New York ironweed", "New York ironweed"],
      ["North American Luna Moth", "North American luna moth"],
      ["Peak Foliage: Northern New England", "Peak foliage: northern New England"],
      ["Canada Day Nature", "Canada Day nature"],
      ["Canadian Thanksgiving Nature", "Canadian Thanksgiving nature"],
    ])("%s -> %s", (input, expected) => {
      expect(displaySpeciesName(input)).toBe(expected);
    });

    it.each([
      ["European Robin", "European robin"],
      ["Eurasian Red Squirrel", "Eurasian red squirrel"],
      ["Scottish Bluebell", "Scottish bluebell"],
      ["Japanese Honeysuckle", "Japanese honeysuckle"],
      ["Texas Bluebonnet", "Texas bluebonnet"],
    ])("keeps a leading demonym: %s -> %s", (input, expected) => {
      expect(displaySpeciesName(input)).toBe(expected);
    });

    it("keeps a demonym that is not the first word", () => {
      expect(displaySpeciesName("Common European Toad")).toBe(
        "Common European toad",
      );
      expect(displaySpeciesName("Greater Mediterranean Gull")).toBe(
        "Greater Mediterranean gull",
      );
      expect(displaySpeciesName("Tall Norway Spruce")).toBe("Tall Norway spruce");
      expect(displaySpeciesName("Old Scots Pine")).toBe("Old Scots pine");
    });

    it("decides Mountain by what sits beside it", () => {
      // The same word, two right answers. This pair is why phrases exist.
      expect(displaySpeciesName("Rocky Mountain Iris")).toBe(
        "Rocky Mountain iris",
      );
      expect(displaySpeciesName("Texas Mountain Laurel")).toBe(
        "Texas mountain laurel",
      );
    });
  });

  /**
   * The other direction, and the one that makes the rule worth shipping: a word
   * that merely LOOKS proper must come down. Every name here is a genus word
   * doing ordinary English work, or a compass adjective. The corpus spells all
   * of them lowercase in its own variants.
   */
  describe("words that only look proper are lowercased", () => {
    it.each([
      ["Western Trillium", "Western trillium"],
      ["Round-lobed Hepatica", "Round-lobed hepatica"],
      ["Hardy Fuchsia", "Hardy fuchsia"],
      ["Magnolia Warbler", "Magnolia warbler"],
      ["Rosa Rugosa", "Rosa rugosa"],
      ["Common Eastern Firefly", "Common eastern firefly"],
      ["Eastern White Pine", "Eastern white pine"],
      ["Painted Lady Butterfly", "Painted lady butterfly"],
      ["Jack-in-the-Pulpit", "Jack-in-the-pulpit"],
      ["Harebell Complex", "Harebell complex"],
    ])("%s -> %s", (input, expected) => {
      expect(displaySpeciesName(input)).toBe(expected);
    });
  });

  describe("punctuation and spacing come back verbatim", () => {
    it.each([
      ["Cherry Blossom (Early Varieties)", "Cherry blossom (early varieties)"],
      ["Orca (Killer Whale)", "Orca (killer whale)"],
      ["Shadbush / Serviceberry", "Shadbush / serviceberry"],
      ["Wild Leeks (Ramps)", "Wild leeks (ramps)"],
      ["Cross-country Ski and Snowshoe Trails", "Cross-country ski and snowshoe trails"],
      ["Ice-Out on Lakes", "Ice-out on lakes"],
    ])("%s -> %s", (input, expected) => {
      expect(displaySpeciesName(input)).toBe(expected);
    });

    it("leaves a typographic apostrophe alone", () => {
      expect(displaySpeciesName("Hermann’s Tortoise")).toBe(
        "Hermann’s tortoise",
      );
    });

    it("does not normalise whitespace", () => {
      expect(displaySpeciesName("Common  Cicada")).toBe("Common  cicada");
    });
  });

  describe("degenerate input passes through", () => {
    it.each(["", "   ", "-", "(", "7"])("%j is returned as it arrived", (input) => {
      expect(displaySpeciesName(input)).toBe(input);
    });

    it("survives a single word", () => {
      expect(displaySpeciesName("Bullfrog")).toBe("Bullfrog");
      expect(displaySpeciesName("gorse")).toBe("Gorse");
    });
  });

  /**
   * Idempotency is a correctness property here, not a nicety. A render layer
   * may well call this on a value that has already been through it, and a rule
   * that drifted on a second pass would make the screen depend on how many
   * times the component re-rendered.
   */
  describe("running it twice changes nothing", () => {
    const corpus = [
      "Common Cicada",
      "Short-toed Snake-Eagle",
      "Hermann's Tortoise",
      "common fig",
      "Queen Anne's Lace",
      "Black-eyed Susan",
      "New England Aster",
      "North American Luna Moth",
      "Rocky Mountain Iris",
      "Texas Mountain Laurel",
      "Joe-Pye Weed",
      "Peak Foliage: Northern New England",
      "Cherry Blossom (Early Varieties)",
      "Jack-in-the-Pulpit",
      "Canada Day Nature",
      "european robin",
      "Bullfrog",
      "",
    ];

    it.each(corpus)("%j is a fixed point after one pass", (name) => {
      const once = displaySpeciesName(name);
      expect(displaySpeciesName(once)).toBe(once);
      expect(displaySpeciesName(displaySpeciesName(once))).toBe(once);
    });
  });

  /**
   * The known imperfection, pinned deliberately.
   *
   * "Lady's" is a common noun and strictly this should read "Pink lady's
   * slipper" — the corpus carries that spelling in its lowercase variant. It is
   * left over-capitalised because rule 1 is unconditional, and unconditional is
   * what keeps Wilson's Warbler and Queen Anne's Lace safe. This test exists so
   * the miss is a recorded decision rather than a surprise, and so that anyone
   * who fixes it has to come here and say why it is now safe.
   */
  it("over-capitalises a possessive common noun, knowingly", () => {
    expect(displaySpeciesName("Pink Lady's Slipper")).toBe(
      "Pink Lady's slipper",
    );
  });
});

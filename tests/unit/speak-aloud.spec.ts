import { describe, expect, it } from "vitest";
import { article, hasSafety, readAloudLine } from "@/lib/cast/speak";
import type { CastMember } from "@/lib/cast/read";

/**
 * The read-aloud line (#172 workstream B, stage 5).
 *
 * This is the only copy in the product a teacher says VERBATIM to thirty
 * children. So the bar is different from the rest of the register rules: it is
 * not enough for the sentence to be in voice, it has to be one she cannot be
 * embarrassed by after the fact. Two failure modes are pinned here:
 *
 *   1. a fact nobody returned (the invented-nature failure, said out loud)
 *   2. a promise the grounds cannot keep ("you will find one")
 *
 * And the #168 safety failure: an Oriental Hornet surfaced with no
 * look-don't-touch framing. The note now rides inside the spoken sentence,
 * because the thing that protects a child is a teacher saying it.
 */

function member(over: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Honey bee",
    scientificName: "Apis mellifera",
    photoUrl: "https://example.test/bee.jpg",
    iconicTaxon: "Insecta",
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "Seen near here lately.",
    ...over,
  };
}

describe("the three tiers say three different things", () => {
  it("states a recorded species, because it may be stated", () => {
    expect(readAloudLine(member(), { locality: "recorded-nearby" })).toBe(
      "A Honey bee was recorded nearby."
    );
  });

  it("invites for a regional one, and never claims it was seen", () => {
    const line = readAloudLine(member({ honestyTier: "regional" }));
    expect(line).toContain("usually around now");
    expect(line).toContain("Let us look for one");
    expect(line).not.toContain("seen near our school");
  });

  it("speaks an absence as a hope, not a disappointment", () => {
    const line = readAloudLine(member({ absent: true }));
    expect(line).toContain("Let us keep looking for a Honey bee");
    expect(line).not.toMatch(/near us|our school/i);
  });
});

describe("never a promise the grounds cannot keep", () => {
  it("does not tell a class what it will find", () => {
    for (const m of [
      member(),
      member({ honestyTier: "regional" }),
      member({ absent: true }),
    ]) {
      const line = readAloudLine(m);
      expect(line).not.toMatch(/you will (find|see|meet)/i);
      expect(line).not.toMatch(/we will (find|see|meet) (a|an|one|it)\b/i);
      expect(line).not.toMatch(/there (is|are) (a|an|some) .* (here|outside)/i);
    }
  });

  it("makes no possessive claim about the school's own grounds", () => {
    for (const m of [member(), member({ honestyTier: "regional" })]) {
      expect(readAloudLine(m)).not.toMatch(/\bour (tree|maple|pond|hedge|oak)\b/i);
    }
  });
});

describe("every noun traces to a token", () => {
  it("adds no natural history we were never given", () => {
    // The line is the name, the tier's sentence, and the safety note. If a
    // behaviour clause ever appears here, something invented it.
    const line = readAloudLine(member({ commonName: "Desert spiny lizard" }));
    expect(line).toBe(
      "We might meet a Desert spiny lizard today."
    );
  });

  it("never edits the species name", () => {
    // The localization layer keeps commonName out of its map for this reason:
    // a name is a verified fact, and a "Grey heron" turned "Gray heron" is a
    // bird that does not exist. The spoken line quotes it exactly.
    for (const name of ["Grey heron", "Gambel's quail", "Jersey tiger", "RSPB robin"]) {
      expect(readAloudLine(member({ commonName: name }))).toContain(name);
    }
  });
});

describe("look-don't-touch rides in the spoken line (#168)", () => {
  it("puts the safety note last, where a class remembers it", () => {
    const line = readAloudLine(
      member({
        commonName: "Oriental hornet",
        safetyNote: "If you see one, we watch it and let it be.",
      })
    );
    expect(line.endsWith("If you see one, we watch it and let it be.")).toBe(true);
  });

  it("carries the note on a regional and an absent member too", () => {
    for (const over of [{ honestyTier: "regional" as const }, { absent: true }]) {
      const line = readAloudLine(member({ ...over, safetyNote: "We look and we do not touch." }));
      expect(line).toContain("We look and we do not touch.");
    }
  });

  it("says nothing at all for the ordinary majority", () => {
    expect(readAloudLine(member())).not.toMatch(/touch|watch it|careful/i);
    expect(hasSafety(member())).toBe(false);
    expect(hasSafety(member({ safetyNote: "  " }))).toBe(false);
    expect(hasSafety(member({ safetyNote: "Let it be." }))).toBe(true);
  });
});

describe("register", () => {
  it("uses no em dashes and no exclamation marks", () => {
    for (const m of [member(), member({ honestyTier: "regional" }), member({ absent: true })]) {
      const line = readAloudLine(m);
      expect(line).not.toMatch(/[—–]/);
      expect(line).not.toMatch(/!/);
    }
  });

  it("keeps clauses short enough to say to five-year-olds", () => {
    for (const m of [member(), member({ honestyTier: "regional" }), member({ absent: true })]) {
      for (const sentence of readAloudLine(m).split(". ")) {
        expect(sentence.split(/\s+/).length).toBeLessThanOrEqual(12);
      }
    }
  });
});

describe("article — chosen by how the name is said", () => {
  it("handles the ordinary cases", () => {
    expect(article("Honey bee")).toBe("a");
    expect(article("Oriental hornet")).toBe("an");
    expect(article("Earthworm")).toBe("an");
  });

  it("handles a vowel that is said as a consonant", () => {
    expect(article("European hornet")).toBe("a");
    expect(article("Unicorn beetle")).toBe("a");
  });

  it("handles a silent h", () => {
    expect(article("Hour-glass spider")).toBe("an");
  });

  it("does not fall over on an empty name", () => {
    expect(article("")).toBe("a");
    expect(article("   ")).toBe("a");
  });
});

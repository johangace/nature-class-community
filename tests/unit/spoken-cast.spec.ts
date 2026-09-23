import { describe, expect, it } from "vitest";
import { article, hasSafety, readAloudLine } from "@/lib/cast/speak";
import { findBySlug, type CastMember, type ClassCast } from "@/lib/cast/read";

/**
 * The read-aloud register, at cast level (#172 workstream B, PR 2; #436).
 *
 * These sentences are said to thirty children standing outside, so the tier
 * rules are not a nicety here — a regional species spoken as a sighting sends
 * a class looking for something that is not there and teaches them that
 * looking does not work.
 *
 * `speak-aloud.spec.ts` pins what each tier SAYS. This file pins the three
 * rules that sit around the sentence and that no single line reveals:
 *
 *   1. no tier may claim the school, in any locality
 *   2. the article follows the sound and does not overcorrect
 *   3. a hoped-for species never reads as a sighting
 *
 * RESCUED FROM `wb-profile-lesson` (#436), where 175 lines of this were
 * stranded. The `spokenCard`/`spokenCast` surface those were written against
 * is gone — the safety note now rides INSIDE the spoken line (#168) and the
 * naming sentence is a DOM element rather than a sentence — so the assertions
 * that described the old surface were dropped rather than bent, and the ones
 * describing behaviour that survived were ported onto `readAloudLine`.
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

const LOCALITIES = [
  { locality: "sample" as const },
  { locality: "recorded-nearby" as const },
];

describe("what each tier is allowed to say", () => {
  it("speaks a regional species as possible, never as seen", () => {
    for (const context of LOCALITIES) {
      const line = readAloudLine(member({ honestyTier: "regional", photoUrl: null }), context);
      expect(line).toContain("usually around now");
      // THE RULE. No phrasing on the regional tier may claim a sighting, in
      // any locality — not "seen", not "was seen", not "seen near us". The
      // word itself is the boundary, because every near miss of it is a class
      // sent to look for a creature nobody found.
      expect(line).not.toMatch(/seen/i);
    }
  });

  it("never claims a school for a species not recorded near one", () => {
    // "our school" is a possessive claim. Nothing in the spoken register makes
    // it, on any tier and in either locality — the strongest claim available
    // is "nearby", which is what the radius actually supports.
    for (const context of LOCALITIES) {
      for (const m of [
        member(),
        member({ honestyTier: "regional" }),
        member({ absent: true }),
      ]) {
        expect(readAloudLine(m, context)).not.toMatch(/school/i);
      }
    }
  });
});

describe("the small correctnesses a child hears immediately", () => {
  it("says an Earthworm, not a Earthworm", () => {
    expect(readAloudLine(member({ commonName: "Earthworm" }))).toContain("an Earthworm");
    expect(
      readAloudLine(member({ commonName: "Earthworm" }), { locality: "recorded-nearby" })
    ).toContain("An Earthworm");
  });

  it("takes the article from the sound, not the spelling", () => {
    // The live London read returns a Eurasian Magpie most days, and the
    // letter rule alone called it "an Eurasian Magpie".
    expect(article("Eurasian Magpie")).toBe("a");
    expect(article("European Robin")).toBe("a");
    expect(readAloudLine(member({ commonName: "Eurasian Magpie" }))).toContain(
      "a Eurasian Magpie"
    );

    // And does not overcorrect the ordinary vowel-initial names. This is the
    // half that has no other guard: widening the consonant-sound rule to catch
    // one more "eu" word is how "an Emperor Dragonfly" quietly becomes "a".
    expect(article("Emperor Dragonfly")).toBe("an");
    expect(article("Oak Bush-cricket")).toBe("an");
    expect(readAloudLine(member({ commonName: "Emperor Dragonfly" }))).toContain(
      "an Emperor Dragonfly"
    );
    expect(readAloudLine(member({ commonName: "Oak Bush-cricket" }))).toContain(
      "an Oak Bush-cricket"
    );
  });
});

describe("safety is spoken, and only when it applies", () => {
  it("is silent for the ordinary majority, on every tier and in either locality", () => {
    // The note rides inside the sentence now (#168), so "no safety note" has
    // to mean a sentence with nothing appended to it — on the regional and
    // absent tiers too, which is where a stray boundary line would be hardest
    // to spot.
    for (const context of LOCALITIES) {
      for (const m of [
        member(),
        member({ honestyTier: "regional" }),
        member({ absent: true }),
      ]) {
        expect(hasSafety(m)).toBe(false);
        expect(readAloudLine(m, context)).not.toMatch(/touch|watch|careful|sting/i);
      }
    }
  });

  it("treats a blank note as no note, so a surface cannot colour an empty clause", () => {
    // `hasSafety` is what `SpeakAndShow` styles on. A whitespace-only note that
    // read as present would put the safety treatment on an ordinary sentence.
    expect(hasSafety(member({ safetyNote: "   " }))).toBe(false);
    expect(readAloudLine(member({ safetyNote: "   " }))).toBe(
      "We might meet a Honey bee today."
    );
    expect(hasSafety(member({ safetyNote: "We watch from here." }))).toBe(true);
  });
});

describe("the order a class works down", () => {
  it("puts every absence after every findable thing", () => {
    // `spokenCast` sorted a mixed list to keep the hoped-for card last. The
    // cast is now two lists — `members` is what a class is sent to find and
    // absences are carried separately — and the one place that still walks
    // both is `findBySlug`, which reads members FIRST. That ordering is the
    // same rule: a species that is both findable and hoped-for resolves to the
    // card that was actually found, never to the one that was not.
    const cast: ClassCast = {
      members: [
        member({ commonName: "Honey bee", sortRank: 0 }),
        member({ commonName: "Red admiral", scientificName: "Vanessa atalanta", sortRank: 1 }),
      ],
      absences: [
        member({ commonName: "Honey bee", absent: true, photoUrl: null, sortRank: 0 }),
        member({
          commonName: "Field grasshopper",
          scientificName: "Chorthippus brunneus",
          absent: true,
          photoUrl: null,
          sortRank: 1,
        }),
      ],
      source: "live",
    };

    const found = findBySlug(cast, "apis-mellifera");
    expect(found).not.toBeNull();
    expect(found?.absent).toBe(false);

    // An absence still resolves when nothing findable shares its slug: last in
    // the walk, not excluded from it.
    expect(findBySlug(cast, "chorthippus-brunneus")?.absent).toBe(true);
    expect(findBySlug(cast, "vanessa-atalanta")?.absent).toBe(false);
  });
});

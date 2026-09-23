import { describe, expect, it } from "vitest";
import {
  calmLine,
  childLine,
  castMaterial,
  castSlug,
  findBySlug,
  honestySentence,
  speciesHref,
  tierLabel,
  type CastMember,
  type ClassCast,
} from "@/lib/cast/read";

/**
 * The cast accessor's pure half (#172 workstream B).
 *
 * Every surface renders a member through `castMaterial` / `tierLabel` /
 * `honestySentence` / `castSlug`, so these four functions ARE the honesty
 * system. What they must never do is let a regional entry read as a sighting,
 * or let a missing photograph read as a broken image.
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

function licensedMember(over: Partial<CastMember> = {}): CastMember {
  return member({
    photoRole: "observation",
    photoAttribution: "A. Observer",
    photoLicense: "cc-by",
    photoSourceUrl: "https://example.test/observations/1",
    ...over,
  });
}

describe("castMaterial — four honesty states, one component", () => {
  it("shows a legacy bare photo URL, because a picture is a picture", () => {
    // This asserted "plate" until 2026-08-17: a photograph whose rights did
    // not travel was drawn rather than shown. Johan: "all photos no gates! we
    // need any photo we can get".
    //
    // The honesty system is UNCHANGED by this. The four materials say whether
    // a species was RECORDED near this school, which is a claim about the
    // week, not about the paperwork on the picture. A bare URL now renders in
    // its tier's material like any other photograph; `plate` still means we
    // have no picture at all, which is what it should always have meant.
    expect(castMaterial(member())).toBe("seen");
    expect(castMaterial(member({ honestyTier: "regional" }))).toBe("regional");
  });

  it("still draws a plate when there is genuinely no picture", () => {
    expect(castMaterial(member({ photoUrl: null }))).toBe("plate");
  });

  it("renders an explicitly sourced open photo in the member's evidence material", () => {
    expect(castMaterial(licensedMember())).toBe("seen");
    expect(castMaterial(licensedMember({ honestyTier: "regional" }))).toBe("regional");
  });

  it("rejects a non-HTTPS image even when its metadata looks complete", () => {
    expect(castMaterial(licensedMember({ photoUrl: "http://example.test/bee.jpg" }))).toBe(
      "plate"
    );
  });

  it("renders a member with no photo as a field-guide plate, never a grey box", () => {
    expect(castMaterial(member({ photoUrl: null }))).toBe("plate");
    expect(castMaterial(member({ photoUrl: null, honestyTier: "regional" }))).toBe("plate");
  });

  it("lets absence outrank a missing photo", () => {
    // A hatched wanted-poster reads as hopeful; a plate reads as filed away.
    expect(castMaterial(member({ absent: true, photoUrl: null }))).toBe("absent");
    expect(castMaterial(member({ absent: true }))).toBe("absent");
  });
});

describe("tierLabel — never upgrades regional to seen", () => {
  it("labels the tiers apart", () => {
    expect(tierLabel(member())).toBe("recorded nearby");
    expect(tierLabel(member({ honestyTier: "regional" }))).toBe("around the region");
    expect(tierLabel(member({ absent: true }))).toBe("not seen yet");
  });

  it("never says seen for anything that was not recorded", () => {
    for (const m of [
      member({ honestyTier: "regional" }),
      member({ absent: true }),
      member({ absent: true, honestyTier: "recorded" }),
    ]) {
      expect(tierLabel(m)).not.toContain("recorded nearby");
    }
  });
});

describe("honestySentence — says only what the fields support", () => {
  it("states a recorded window when there is one, and stays vague when there is not", () => {
    expect(honestySentence(member({ lastSeenWindow: 7 }))).toContain("last 7 days");
    expect(honestySentence(member())).toContain("recently");
    expect(honestySentence(member())).not.toMatch(/\d/);
    expect(honestySentence(member())).toMatch(/recorded near/i);
    expect(honestySentence(member())).not.toMatch(/photographed/i);
  });

  it("adds the multi-year record only when it is a record", () => {
    expect(honestySentence(member({ yearsObserved: 5 }))).toContain("5 different years");
    // One year is a ping, not a track record, and must not be dressed as one.
    expect(honestySentence(member({ yearsObserved: 1 }))).not.toContain("different years");
    expect(honestySentence(member({ yearsObserved: null }))).not.toContain("different years");
  });

  it("keeps a regional member's sentence free of any sighting claim", () => {
    const sentence = honestySentence(member({ honestyTier: "regional" }));
    expect(sentence).toContain("Around this region");
    expect(sentence).not.toMatch(/photographed near your school/i);
  });

  it("turns an absence into an invitation, never a promise", () => {
    const sentence = honestySentence(member({ absent: true, yearsObserved: 4 }));
    expect(sentence).toContain("no sightings nearby this week");
    expect(sentence).toContain("Maybe your class");
    expect(sentence).not.toMatch(/you will (find|see)/i);
  });

  it("makes no possessive claim about the school's own grounds", () => {
    for (const m of [member(), member({ honestyTier: "regional" }), member({ absent: true })]) {
      expect(honestySentence(m)).not.toMatch(/\byour (tree|maple|pond|hedge|grounds)\b/i);
    }
  });

  /**
   * Caught on screen, not in code: the profile said "Photographed near your
   * school recently" on the signed-out demo, which has no school. The
   * possessive-claim rule, broken on the surface built to hold it.
   */
  describe("it never names a school, and there is no way to ask it to", () => {
    it("says nothing about a school, whatever the member is carrying", () => {
      for (const m of [
        member(),
        member({ lastSeenWindow: 7 }),
        member({ yearsObserved: 5 }),
        member({ historicalAvgCount: 3 }),
        member({ honestyTier: "regional" }),
        member({ absent: true }),
        member({ absent: true, yearsObserved: 4 }),
      ]) {
        expect(honestySentence(m)).not.toMatch(/your school/i);
      }
    });

    it("keeps the radius wording that is true everywhere", () => {
      // "nearby" is a claim about a radius, which we have. "your school" is a
      // claim about a place, which this function is never told.
      expect(honestySentence(member())).toContain("nearby");
      expect(honestySentence(member({ lastSeenWindow: 7 }))).toContain(
        "Recorded nearby within the last 7 days"
      );
      expect(honestySentence(member({ honestyTier: "regional" }))).toContain("Around this region");
    });

    it("takes the member and nothing else, so no caller can widen the claim", () => {
      // #548: the old `scope: "school" | "here"` argument was inert — `void
      // scope`, both values byte-identical — while the type went on offering a
      // choice the function did not make. It is gone rather than implemented,
      // and THAT is the guarantee this line holds.
      //
      // The guard is the suppression below, not the assertion: `npm run
      // typecheck` covers this file, so the moment a second parameter accepts
      // "school" again the suppression stops suppressing anything and tsc
      // fails on it. Precisely that, and not "any second parameter" — a scope
      // reintroduced as an options object would still reject this call and
      // sail through. A runtime arity check could not do even this much: a
      // defaulted parameter does not count towards Function.length, so the
      // inert version this ticket removed also reported 1.
      //
      // (Written without naming the directive, because a comment that spells
      // it out IS one, and an idle directive is itself a typecheck failure.)
      // @ts-expect-error - honestySentence takes exactly one argument (#548)
      expect(honestySentence(member(), "school")).toBe(honestySentence(member()));
    });
  });
});

describe("calmLine — the #168 register failure, fixed once for every surface", () => {
  it("removes the em dash the phenology files are full of", () => {
    const out = calmLine("Fox mating season — listen for eerie screaming bark calls at night");
    expect(out).not.toMatch(/[—–]/);
  });

  it("removes exclamation marks", () => {
    expect(calmLine("Look at that huge web!")).not.toContain("!");
  });

  it("ends on a full stop", () => {
    expect(calmLine("Tiny white bells brave the cold")).toBe("Tiny white bells brave the cold.");
  });

  it("cuts a three-clause note down to a face-sized line", () => {
    const long =
      "Fuzzy yellow tails hang from branches like caterpillars — shake one gently and watch golden dust fly";
    const out = calmLine(long);
    expect(out.length).toBeLessThanOrEqual(66);
    // A prefix of the original: never a rewrite, never a new fact.
    expect(long.replace(/\s*[—–]\s*/g, ", ")).toContain(out.replace(/\.$/, ""));
  });

  it("never invents a line out of nothing", () => {
    expect(calmLine("")).toBe("");
    expect(calmLine("   ")).toBe("");
  });
});

describe("childLine — the one line on a face, in the child's language", () => {
  it("uses the phenology's authored child note", () => {
    expect(
      childLine({ safetyNote: null, absent: false }, "Fuzzy yellow tails hang from branches")
    ).toBe("Fuzzy yellow tails hang from branches.");
  });

  it("gives a species with no authored note NO line rather than a manufactured one", () => {
    // A face with a photograph and a name is a complete face. What went here
    // before was "34 logged nearby", a sentence about our database.
    expect(childLine({ safetyNote: null, absent: false }, undefined)).toBe("");
    expect(childLine({ safetyNote: null, absent: false }, null)).toBe("");
    expect(childLine({ safetyNote: null, absent: false }, "   ")).toBe("");
  });

  it("never states provenance on a face", () => {
    for (const note of ["Tiny white bells brave the cold", undefined]) {
      const line = childLine({ safetyNote: null, absent: false }, note);
      expect(line).not.toMatch(/seen near|logged nearby|photographed|recorded/i);
    }
  });

  it("speaks an absence as an invitation", () => {
    expect(childLine({ safetyNote: null, absent: true }, "anything")).toContain(
      "Maybe you will be first"
    );
  });

  it("gives a stinging species the calm boundary INSTEAD of its note", () => {
    // Not a warning a child has to be afraid of: a rule of the game they can
    // actually follow.
    const line = childLine(
      { safetyNote: "Can sting.", absent: false },
      "Busy on the flowers all day"
    );
    expect(line).toBe("If you see one, we watch from here.");
    expect(line).not.toContain("flowers");
  });

  it("keeps every line in register", () => {
    for (const note of ["Fuzzy tails hang down — shake one gently!", "Look at that web!"]) {
      const line = childLine({ safetyNote: null, absent: false }, note);
      expect(line).not.toMatch(/[—–]/);
      expect(line).not.toMatch(/!/);
    }
  });
});

describe("castSlug — one link per species, either side of the seam", () => {
  it("prefers the scientific name so a common-name change does not break a link", () => {
    expect(castSlug({ commonName: "Honey bee", scientificName: "Apis mellifera" })).toBe(
      "apis-mellifera"
    );
  });

  it("falls back to the common name", () => {
    expect(castSlug({ commonName: "Gambel's quail", scientificName: null })).toBe("gambel-s-quail");
  });

  it("strips accents rather than dropping the species", () => {
    expect(castSlug({ commonName: "Café moth", scientificName: null })).toBe("cafe-moth");
  });

  it("carries a lesson's producer scope into the linked profile", () => {
    expect(speciesHref(member(), "minibeasts")).toBe(
      "/species/apis-mellifera?topic=minibeasts"
    );
    expect(speciesHref(member())).toBe("/species/apis-mellifera");
  });

  it("finds a member by slug, absences included", () => {
    const cast: ClassCast = {
      members: [member()],
      absences: [member({ commonName: "Desert spiny lizard", scientificName: "Sceloporus magister", absent: true })],
      source: "live",
    };
    expect(findBySlug(cast, "apis-mellifera")?.commonName).toBe("Honey bee");
    expect(findBySlug(cast, "sceloporus-magister")?.absent).toBe(true);
    expect(findBySlug(cast, "nothing-here")).toBeNull();
  });
});

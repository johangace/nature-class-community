import { describe, expect, it } from "vitest";
import { withoutLookFors } from "@/lib/outside/brief";
import type { CastMember } from "@/lib/cast/member";

/**
 * ONE CLAIM, RENDERED ONCE (#460).
 *
 * /outside printed the same six species twice on one page: under "What to look
 * for" with the authored note and the photograph, and again under "Usually
 * around here now" with a calmed one-liner and the SAME photograph. Verified
 * against production on 2026-08-25 — every repeated species carried an
 * identical image URL and an identical credit in both lists, so this was one
 * claim said twice rather than two claims that happened to agree.
 *
 * Both lists are the REGIONAL tier drawn from the same seasonal read, so the
 * repeat carries no extra evidence. The look-for wins because its note is the
 * authored sentence rather than the shortened one.
 *
 * Every persona in the two usability studies (#454, #455) read the repetition
 * as a broken page.
 */

function member(commonName: string, over: Partial<CastMember> = {}): CastMember {
  return {
    commonName,
    scientificName: null,
    photoUrl: "https://example.test/p.jpg",
    photoRole: "taxon-reference",
    photoAttribution: "A. Photographer",
    photoLicense: "cc-by",
    photoSourceUrl: "https://example.test/photos/1",
    iconicTaxon: null,
    honestyTier: "regional",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "",
    ...over,
  };
}

describe("the regional list never repeats a look-for", () => {
  const around = [
    member("Grasshopper"),
    member("Blackberry"),
    member("Heather"),
    member("Wild Marjoram"),
  ];

  it("drops the species the look-fors already name", () => {
    const kept = withoutLookFors(around, [
      { species: "Grasshopper" },
      { species: "Heather" },
    ]);
    expect(kept.map((m) => m.commonName)).toEqual(["Blackberry", "Wild Marjoram"]);
  });

  it("matches on the name however it was cased or padded", () => {
    // The two lists come from different reads and neither owns the casing.
    const kept = withoutLookFors(around, [
      { species: "  grasshopper " },
      { species: "BLACKBERRY" },
    ]);
    expect(kept.map((m) => m.commonName)).toEqual(["Heather", "Wild Marjoram"]);
  });

  it("renders no second section when the look-fors already cover the region", () => {
    // The real shape on production: all six repeated. The page guards on
    // length, so an empty list is the section correctly disappearing.
    const kept = withoutLookFors(around, around.map((m) => ({ species: m.commonName })));
    expect(kept).toEqual([]);
  });

  it("leaves the list alone when there are no look-fors", () => {
    expect(withoutLookFors(around, [])).toHaveLength(4);
    expect(withoutLookFors(around, [{ species: "   " }])).toHaveLength(4);
  });

  it("keeps a species the look-fors do not name, including an absence", () => {
    const withAbsence = [...around, member("Swift", { absent: true })];
    const kept = withoutLookFors(withAbsence, [{ species: "Grasshopper" }]);
    expect(kept.map((m) => m.commonName)).toContain("Swift");
  });

  it("does not mutate the list it was given", () => {
    const original = [...around];
    withoutLookFors(around, [{ species: "Grasshopper" }]);
    expect(around).toEqual(original);
  });
});

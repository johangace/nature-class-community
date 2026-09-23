import { describe, expect, it } from "vitest";
import { checkLookForLine, type LookForFacts } from "@/lib/ai/look-for-line";
import { phaseFromHistogram, seasonalCacheKey } from "@/lib/outside/gbif";
import type { SeasonalSpecies } from "@/lib/outside/gbif";

/**
 * The guard that stops #305 from replacing a hand-typed lie with a fluent one.
 *
 * The species list is GBIF's. The sentence is the model's. These tests watch
 * the boundary between the two hold, and each one is written so that removing
 * the rule it covers turns it red — the guard has to catch the bug, not
 * describe it.
 */

function species(over: Partial<SeasonalSpecies> = {}): SeasonalSpecies {
  return {
    key: 1,
    name: "Barn Swallow",
    scientificName: "Hirundo rustica",
    taxonClass: "Aves",
    stratum: "birds",
    occurrencesInMonth: 25,
    occurrencesAllYear: 241,
    monthShare: 0.1,
    monthHistogram: [0, 0, 10, 17, 87, 65, 26, 25, 5, 5, 1, 0],
    phase: "fading",
    findability: {
      score: 0.8,
      distinctObservers: 20,
      topObserverShare: 0.1,
      observerCoverage: 1,
      daylightShare: 1,
      lightTrapped: false,
      classPrior: 1,
    },
    ...over,
  };
}

/**
 * The isolating fixture. Three grounded species and a lexicon of names the
 * record did NOT return — the retired phenology vocabulary in its second life.
 */
function facts(over: Partial<LookForFacts> = {}): LookForFacts {
  return {
    species: [
      species(),
      species({ key: 2, name: "Scarce Swallowtail", stratum: "insects" }),
      species({ key: 3, name: "Olive", stratum: "plants" }),
    ],
    lexicon: ["Apple", "Common Pear", "European Garden Spider", "Blackberry", "Heather"],
    fallback: "Go outside and see what you notice.",
    ...over,
  };
}

const ok = (line: string, chosen = "Barn Swallow", f = facts()) =>
  checkLookForLine({ species: chosen, line }, f).ok;
const why = (line: string, chosen = "Barn Swallow", f = facts()) =>
  checkLookForLine({ species: chosen, line }, f).reason;

describe("checkLookForLine: a good line passes", () => {
  it("accepts a warm, grounded, single-species sentence", () => {
    expect(ok("Look up for a barn swallow gathering on the wires before it goes.")).toBe(true);
  });

  it("accepts a plural of the grounded species", () => {
    expect(ok("See if the barn swallows are still lining up on the wire.")).toBe(true);
  });
});

describe("checkLookForLine: the names check", () => {
  it("rejects a species the occurrence record never returned", () => {
    // The exact failure Johan saw: a confident line about orchard fruit in
    // a Tirana schoolyard, where nothing recorded it.
    expect(ok("Go and find a common pear ripening on the branch.", "Common Pear")).toBe(false);
    expect(why("Go and find a common pear ripening on the branch.", "Common Pear")).toMatch(
      /not in the record/i,
    );
  });

  it("rejects a grounded pick that smuggles an ungrounded name into the sentence", () => {
    // The pick is legal. The sentence is not. This is the invention that a
    // whitelist on the CHOSEN species alone would wave straight through.
    expect(ok("Look for a barn swallow, and see if the blackberries are ripe.")).toBe(false);
    expect(why("Look for a barn swallow, and see if the blackberries are ripe.")).toMatch(
      /named a species the record did not: Blackberry/,
    );
  });

  it("catches the plural form of an ungrounded name", () => {
    // MUTATION PROOF for the plural branch: delete `(?:s|es)?` from the
    // lexicon pattern in look-for-line.ts and this case goes green, because
    // `\bapple\b` does not match "apples". A guard that fails here is a guard
    // that lets fluent, correctly-inflected invention through.
    expect(ok("Look for a barn swallow while the apples are colouring up.")).toBe(false);
    expect(why("Look for a barn swallow while the apples are colouring up.")).toMatch(
      /named a species the record did not: Apple/,
    );
  });

  it("does not fire on a longer word that merely contains a species name", () => {
    // MUTATION PROOF for the word boundary: remove the `\b` anchors from the
    // lexicon pattern and this goes red, because "grapple" contains "apple".
    // Without this the guard rejects good lines and every teacher sees the
    // fallback, which is the failure mode that looks like nothing is wrong.
    expect(ok("Watch a barn swallow grapple with the wind above the yard.")).toBe(true);
  });

  it("accepts a grounded name that contains an ungrounded one inside it", () => {
    // MUTATION PROOF for the mask: remove the loop that strips grounded names
    // from the haystack and this goes red. Observed live at Porto, where
    // "Barn Swallow" is genuinely recorded and the retired vocabulary also
    // carries the bare word "Swallow" — the guard rejected a true line.
    const f = facts({
      species: [species({ name: "Barn Swallow" })],
      lexicon: ["Swallow", "Apple"],
    });
    expect(ok("Look up for a barn swallow over the playground.", "Barn Swallow", f)).toBe(true);
  });

  it("rejects a line that does not name the species it claims to have chosen", () => {
    expect(ok("Look up and see what is moving above the playground.")).toBe(false);
    expect(why("Look up and see what is moving above the playground.")).toMatch(
      /does not name the chosen species/i,
    );
  });
});

describe("checkLookForLine: numbers are not spoken", () => {
  it("rejects a count read aloud to a class", () => {
    // The counts are our evidence, not the teacher's copy. "Twenty-five barn
    // swallows" is a claim about today that an all-years record cannot make.
    expect(ok("Look for 25 barn swallows lining up on the wire.")).toBe(false);
    expect(why("Look for 25 barn swallows lining up on the wire.")).toMatch(/numbers/i);
  });
});

describe("checkLookForLine: register", () => {
  it.each([
    ["em dash", "Look for a barn swallow — it is nearly time for it to go."],
    ["exclamation", "Look for a barn swallow on the wire!"],
    ["all caps", "Look for a BARN swallow on the wire."],
    ["markup", "Look for a barn swallow <b>on the wire</b>."],
  ])("rejects %s", (_label, line) => {
    expect(ok(line)).toBe(false);
  });

  it("rejects an empty line", () => {
    expect(ok("   ")).toBe(false);
  });
});

describe("phaseFromHistogram: the phase is arithmetic, not an opinion", () => {
  // The hand-typed files carried narrativePhase as an authored word. Here it
  // is read off the species' own recorded curve and anyone can check it.
  const swallowAtTirana = [0, 0, 10, 17, 87, 65, 26, 25, 5, 5, 1, 0];

  it("reads May as the peak of the local swallow record", () => {
    expect(phaseFromHistogram(swallowAtTirana, 5)).toBe("peak");
  });

  it("reads August as fading, which is what the record says", () => {
    expect(phaseFromHistogram(swallowAtTirana, 8)).toBe("fading");
  });

  it("returns steady rather than guessing when a month has no records", () => {
    expect(phaseFromHistogram(swallowAtTirana, 1)).toBe("steady");
  });

  it("returns steady for an empty record instead of inventing a phase", () => {
    expect(phaseFromHistogram(new Array(12).fill(0), 6)).toBe("steady");
  });
});

describe("seasonalCacheKey: no coordinate survives the key", () => {
  it("puts two schools in the same town in the same cell", () => {
    const date = new Date("2026-08-17T00:00:00Z");
    const a = seasonalCacheKey({ lat: 41.3275, lng: 19.8187, date });
    const b = seasonalCacheKey({ lat: 41.3312, lng: 19.8241, date });
    expect(a).toBe(b);
    expect(a).not.toContain("41.3275");
  });

  it("separates months, because the whole point is the season", () => {
    const cell = { lat: 41.3275, lng: 19.8187 };
    expect(seasonalCacheKey({ ...cell, date: new Date("2026-08-17T00:00:00Z") })).not.toBe(
      seasonalCacheKey({ ...cell, date: new Date("2026-02-17T00:00:00Z") }),
    );
  });
});

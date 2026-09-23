import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAST_LAYOUT_MAX, resolveCast } from "@/lib/cast/resolve";
import type { FieldTruth } from "@/lib/outside/pointmoon";
import type { PhenologyEntry } from "@/lib/outside/types";

/**
 * The cast resolver, replayed against REAL RECORDED PAYLOADS.
 *
 * These fixtures are the four-city live reads taken for #167 on 2026-08-11 —
 * the same corpus the nightly recording job now keeps growing. Testing the
 * recipe against invented payloads would only prove the recipe agrees with
 * whoever invented them; testing it against what Pointmoon actually returned
 * for Berkeley, Phoenix and London proves it survives real data, including the
 * awkward parts (a payload where half the species carry no recurrence fields at
 * all, and one where the interesting fact is what is missing).
 *
 * This is the "replay before calibration" rule, held as a test.
 */

function fixture(name: string): FieldTruth {
  const file = path.join(process.cwd(), "tests", "fixtures", "pointmoon", `${name}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as FieldTruth;
}

const berkeley = fixture("berkeley_ca");
const phoenix = fixture("phoenix_az");
const london = fixture("london_uk");

/**
 * EIGHT DIFFERENT BIRDS, AND THEY MUST BE DIFFERENT SPECIES (#1030).
 *
 * These were `Avis communis 1` … `Avis communis 8`, which is one species with
 * a counter after it. Once the resolver started collapsing by accepted taxon
 * rather than by name string, all eight became one bird — correctly, since a
 * third name-part is an infraspecific rank and `Avis communis subsp. 1` is
 * still `Avis communis`. Eight distinct binomials say what this helper always
 * meant.
 */
const STARVED_EPITHETS = [
  "prima",
  "secunda",
  "tertia",
  "quarta",
  "quinta",
  "sexta",
  "septima",
  "octava",
];

function topicStarvedPayload(): FieldTruth {
  return {
    facts: {
      fieldSnapshot: {
        observations: {
          nearby: [
            ...STARVED_EPITHETS.map((epithet, index) => ({
              name: `Common bird ${index + 1}`,
              scientificName: `Avis ${epithet}`,
              iconicTaxon: "Aves",
              count: 20 - index,
              yearsObserved: 3,
              ratioToHistorical: 1,
            })),
            {
              name: "Field maple",
              scientificName: "Acer campestre",
              iconicTaxon: "Plantae",
              count: 1,
              yearsObserved: null,
              ratioToHistorical: null,
            },
          ],
        },
      },
    },
  };
}

/** A small stand-in for a week of regional phenology. */
const phenology: PhenologyEntry[] = [
  {
    id: "p1",
    species: "Annual Grasses",
    description: "Going gold and dry.",
    habitats: ["grassland"],
    senses: ["sight"],
    confidence: "high",
    narrativePhase: "peak",
  },
  {
    id: "p2",
    species: "Valley Oak",
    description: "Acorns swelling.",
    habitats: ["woodland"],
    senses: ["sight"],
    confidence: "high",
    narrativePhase: "emerging",
  },
];

describe("cast resolver, against recorded payloads", () => {
  it("keeps the requested profile species when the general recipe would drop it", () => {
    const generic = resolveCast({
      data: topicStarvedPayload(),
      phenology: [],
    });
    expect(generic.members.some((member) => member.scientificName === "Acer campestre")).toBe(
      false
    );

    const profile = resolveCast({
      data: topicStarvedPayload(),
      phenology: [],
      profileSlug: "acer-campestre",
    });

    expect(profile.members.some((member) => member.scientificName === "Acer campestre")).toBe(
      true
    );
    // The maple is taken FIRST and everything else follows, so the profile
    // read is the generic cast with one more member — it is not a swap, and
    // (since #1030) it is not a slice at eight either.
    expect(profile.members).toHaveLength(generic.members.length + 1);

    const unknown = resolveCast({
      data: topicStarvedPayload(),
      phenology: [],
      profileSlug: "not-a-real-species",
    });
    expect(unknown).toEqual(generic);
  });

  it("ranks the lesson topic before the cast cap", () => {
    const cast = resolveCast({
      data: topicStarvedPayload(),
      phenology: [],
      topic: "plants",
    });

    expect(cast.members[0]?.commonName).toBe("Field maple");
    expect(cast.members.some((member) => member.commonName === "Field maple")).toBe(true);
  });

  it("lets an on-topic historical species survive a recurrent off-topic cast", () => {
    const birdOnly = topicStarvedPayload();
    const observations = birdOnly.facts?.fieldSnapshot?.observations;
    if (observations) observations.nearby = observations.nearby?.slice(0, 8);
    const cast = resolveCast({
      data: birdOnly,
      historical: [
        {
          name: "Common poppy",
          scientificName: "Papaver rhoeas",
          iconicTaxon: "Plantae",
          photo: null,
        },
      ],
      phenology: [],
      topic: "plants",
    });

    expect(cast.members[0]).toMatchObject({
      commonName: "Common poppy",
      honestyTier: "regional",
      iconicTaxon: "Plantae",
    });
  });

  it("resolves as many as a rich read holds, up to the layout bound", () => {
    // Eight used to be the ceiling; #1030 removed it, because a count is not a
    // relevance rule. Berkeley's payload holds ten multi-year species and the
    // cast is now ten — every one of them recorded, none invented, and still
    // under the bound that exists only so a page can lay them out.
    const cast = resolveCast({ data: berkeley, phenology });
    expect(cast.members.length).toBeGreaterThanOrEqual(6);
    expect(cast.members.length).toBe(10);
    expect(cast.members.length).toBeLessThanOrEqual(CAST_LAYOUT_MAX);
  });

  it("gates entry on multi-year recurrence, never a single sighting", () => {
    const cast = resolveCast({ data: berkeley, phenology });

    // Berkeley's payload has ten multi-year species — comfortably more than a
    // cast needs — so every recorded member must have earned its place by
    // recurring, and no one-off ping should have slipped in.
    const recorded = cast.members.filter((m) => m.honestyTier === "recorded");
    expect(recorded.length).toBeGreaterThan(0);
    for (const member of recorded) {
      expect(member.yearsObserved ?? 0).toBeGreaterThanOrEqual(2);
    }

    // Rock Pigeon is in the payload with NO yearsObserved at all: a single-ping
    // entry that the old count-ranked card would have shown.
    expect(cast.members.some((m) => m.commonName === "Rock Pigeon")).toBe(false);
  });

  it("ranks findable species above rare ones", () => {
    const cast = resolveCast({ data: berkeley, phenology });
    const named = (name: string) => cast.members.findIndex((m) => m.commonName === name);

    // Monarch sits at 0.56 of its own baseline; Black-crowned Night Heron at
    // 0.24. A child sent to find the heron mostly finds nothing.
    const monarch = named("Monarch");
    const heron = named("Black-crowned Night Heron");
    expect(monarch).toBeGreaterThanOrEqual(0);
    if (heron >= 0) expect(monarch).toBeLessThan(heron);
  });

  it("carries striking absences separately, never as something to find", () => {
    const cast = resolveCast({ data: berkeley, phenology });

    // Great Egret has a three-year record here and did not appear in this read.
    expect(cast.absences.length).toBeGreaterThan(0);
    expect(cast.absences.some((a) => a.commonName === "Great Egret")).toBe(true);

    for (const absence of cast.absences) {
      expect(absence.absent).toBe(true);
      // An absence is defined by not having been seen, so it carries no window.
      expect(absence.lastSeenWindow).toBeNull();
      // And it is never also offered as something findable.
      expect(cast.members.some((m) => m.commonName === absence.commonName)).toBe(false);
    }
  });

  it("falls back to the regional tier on a thin read rather than padding", () => {
    // A payload with no observations at all: the day-one and quiet-area case,
    // which is the ORDINARY first experience, not an edge case.
    const empty: FieldTruth = { facts: { fieldSnapshot: {} } };
    const cast = resolveCast({ data: empty, phenology });

    expect(cast.members.length).toBe(phenology.length);
    for (const member of cast.members) {
      expect(member.honestyTier).toBe("regional");
      // The phenology files carry no photographs, and none is borrowed.
      expect(member.photoUrl).toBeNull();
    }
  });

  it("resolves the regional cast when the read failed entirely", () => {
    const cast = resolveCast({ data: null, phenology });
    expect(cast.members.length).toBe(phenology.length);
    expect(cast.members.every((m) => m.honestyTier === "regional")).toBe(true);
  });

  it("returns an honestly empty cast when both sources are empty", () => {
    const cast = resolveCast({ data: null, phenology: [] });
    expect(cast.members).toEqual([]);
    expect(cast.absences).toEqual([]);
  });

  it("never upgrades a regional member to recorded", () => {
    const cast = resolveCast({ data: phoenix, phenology });
    for (const member of cast.members) {
      if (member.honestyTier === "regional") {
        // A regional member has no sighting evidence, by construction.
        expect(member.lastSeenWindow).toBeNull();
        expect(member.yearsObserved).toBeNull();
      }
    }
  });

  it("keeps a thin place thin rather than inventing", () => {
    // Phoenix has only six multi-year species; the cast must not exceed what
    // the evidence supports by manufacturing entries.
    const cast = resolveCast({ data: phoenix, phenology: [] });
    expect(cast.members.length).toBeLessThanOrEqual(CAST_LAYOUT_MAX);
    for (const member of cast.members) {
      expect(member.commonName.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic, so a recorded payload is a replayable fixture", () => {
    const a = resolveCast({ data: london, phenology });
    const b = resolveCast({ data: london, phenology });
    expect(a).toEqual(b);
  });
});

describe("strict topic filter (nc#233): a minibeast lesson must never show a pear tree", () => {
  it("filters out an off-topic species rather than merely ranking it behind on-topic ones", () => {
    // The starved payload's eight recurrent birds would normally backfill the
    // cast past the maple to reach MIN_MEMBERS. Strict mode must not let them.
    const cast = resolveCast({
      data: topicStarvedPayload(),
      phenology: [],
      topic: "plants",
      topicFilter: true,
    });

    expect(cast.members.every((m) => m.iconicTaxon === "Plantae")).toBe(true);
    expect(cast.members.some((m) => m.commonName === "Field maple")).toBe(true);
    expect(cast.members.some((m) => m.commonName.startsWith("Common bird"))).toBe(false);
  });

  it("resolves a genuinely empty cast, never a mismatched one, when nothing on-topic was found", () => {
    // Every recorded species here is a bird; a minibeasts lesson has nothing
    // to show and must not fall back to them.
    const birdsOnly: FieldTruth = {
      facts: {
        fieldSnapshot: {
          observations: {
            nearby: [
              {
                name: "Eurasian Magpie",
                scientificName: "Pica pica",
                iconicTaxon: "Aves",
                count: 12,
                yearsObserved: 4,
                ratioToHistorical: 1,
              },
            ],
          },
        },
      },
    };

    const cast = resolveCast({
      data: birdsOnly,
      historical: [
        { name: "Valley Oak", scientificName: "Quercus lobata", iconicTaxon: "Plantae", photo: null },
      ],
      phenology,
      topic: "minibeasts",
      topicFilter: true,
    });

    expect(cast.members).toEqual([]);
  });

  it("does nothing for a topic taxonomy cannot express — the general, ranked cast stands", () => {
    // "art" has no taxon mapping, so hasTaxa is false and topicFilter must be
    // a no-op: this session still gets the ordinary general cast.
    const cast = resolveCast({
      data: topicStarvedPayload(),
      phenology: [],
      topic: "art",
      topicFilter: true,
    });

    expect(cast.members.length).toBeGreaterThanOrEqual(6);
    expect(cast.members.some((m) => m.commonName.startsWith("Common bird"))).toBe(true);
  });

  it("leaves the ranking-only behaviour unchanged when topicFilter is not set", () => {
    // Same payload and topic as the filtering test above, but without the
    // flag: the existing ranked-and-backfilled recipe must still stand.
    const cast = resolveCast({
      data: topicStarvedPayload(),
      phenology: [],
      topic: "plants",
    });

    expect(cast.members.length).toBeGreaterThanOrEqual(6);
    expect(cast.members.some((m) => m.commonName.startsWith("Common bird"))).toBe(true);
  });

  it("carries only on-topic absences in strict mode", () => {
    // Berkeley's absence list is four Aves entries ahead of one Plantae entry
    // (Belladonna Lily). Unfiltered, MAX_ABSENCES caps the list at three
    // before the lily is ever reached; strict mode for "plants" must skip
    // past every bird to find it rather than cutting off early.
    const cast = resolveCast({ data: berkeley, phenology, topic: "plants", topicFilter: true });

    expect(cast.absences.some((a) => a.commonName === "Belladonna Lily")).toBe(true);
    for (const absence of cast.absences) {
      expect(absence.iconicTaxon).toBe("Plantae");
    }
  });
});

describe("cast safety", () => {
  it("attaches look-don't-touch phrasing to a stinging species", () => {
    // Phoenix's payload carries a Western Honey Bee (Apis mellifera) with a
    // three-year record, so it earns a place AND must carry its note.
    const cast = resolveCast({ data: phoenix, phenology: [] });
    const bee = cast.members.find((m) => m.scientificName === "Apis mellifera");
    expect(bee).toBeDefined();
    expect(bee?.safetyNote).toBeTruthy();
    expect(bee?.safetyNote?.toLowerCase()).toContain("hands away");
  });

  it("leaves the harmless majority unmarked", () => {
    const cast = resolveCast({ data: berkeley, phenology });
    const marked = cast.members.filter((m) => m.safetyNote !== null);
    // A list that flags everything teaches a teacher to ignore it.
    expect(marked.length).toBeLessThan(cast.members.length);
  });

  it("does not mistake a harmless mimic for the thing it mimics", () => {
    // London's payload contains Volucella zonaria, the hornet mimic hoverfly:
    // entirely harmless, and named in a way that a common-name match would
    // flag. Matching on scientific name is what prevents that.
    const cast = resolveCast({ data: london, phenology: [] });
    const mimic = cast.members.find((m) => m.scientificName === "Volucella zonaria");
    if (mimic) expect(mimic.safetyNote).toBeNull();
  });

  it("keeps an excluded hazard off the youngest years' cast entirely", () => {
    const hornetPayload: FieldTruth = {
      facts: {
        fieldSnapshot: {
          observations: {
            nearby: [
              {
                name: "Oriental Hornet",
                scientificName: "Vespa orientalis",
                count: 9,
                iconicTaxon: "Insecta",
                // The recurrence fields that would otherwise earn it a place.
                yearsObserved: 3,
                historicalAvgCount: 10,
                ratioToHistorical: 0.9,
              },
              {
                name: "Eurasian Magpie",
                scientificName: "Pica pica",
                count: 5,
                iconicTaxon: "Aves",
                yearsObserved: 3,
                historicalAvgCount: 6,
                ratioToHistorical: 0.85,
              },
            ],
          },
        },
      },
    };

    // For an older year group the hornet stays, carrying its warning.
    const older = resolveCast({ data: hornetPayload, phenology: [], yearGroup: "Year 2" });
    const hornetForOlder = older.members.find((m) => m.commonName === "Oriental Hornet");
    expect(hornetForOlder).toBeDefined();
    expect(hornetForOlder?.safetyNote).toBeTruthy();

    // For reception it is not on the cast at all.
    const youngest = resolveCast({ data: hornetPayload, phenology: [], yearGroup: "Reception" });
    expect(youngest.members.some((m) => m.commonName === "Oriental Hornet")).toBe(false);
    // And the rest of the cast is unaffected.
    expect(youngest.members.some((m) => m.commonName === "Eurasian Magpie")).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCast } from "@/lib/cast/resolve";
import { sameTaxon, taxonIdentity } from "@/lib/cast/taxon-identity";
import type { FieldTruth } from "@/lib/outside/pointmoon";

/**
 * THE SPECIES BOARD IS CONTEXTUAL, AND EACH SLOT IS A DIFFERENT CREATURE
 * (#1030).
 *
 * Johan, 2026-09-07: "Up to four species? This is also a bug. We don't need to
 * limit, we need to make it contextual. That's why we have gotten bad data
 * lately where iNaturalist has so many versions."
 *
 * Two faults, one cause: a fixed count standing in for relevance. `/cast` read
 * four and sliced to four; the resolver stopped at eight. Meanwhile one
 * organism arrives as several rows — the same taxon in two lists, a subspecies
 * beside its species, a genus-rank identification beside the species someone
 * else pinned down — and those versions competed for the slots and pushed real
 * creatures off the board.
 *
 * ── THE FIXTURE ────────────────────────────────────────────────────────────
 *
 * `london_uk_taxon_versions.json` is the recorded London read of 2026-08-17
 * (`london_uk_2026-08-17.json`, one of the nightly corpus payloads) with three
 * extra rows appended to `observations.nearby`, each a second version of an
 * organism that payload already carries, written in the recorded rows' own
 * shape:
 *
 *   - "Rock Dove", no `scientificName` at all, `presence.taxonId` "3017" —
 *     the same taxon id the recorded "Rock Pigeon" row carries.
 *   - "Feral Pigeon" / `Columba livia domestica` — the subspecies of that
 *     same species.
 *   - "Pieris" — a genus-rank identification of the recorded "Cabbage White"
 *     (`Pieris rapae`).
 *
 * So the duplication is CONSTRUCTED, on top of real recorded rows: the
 * recorded corpus already shows one taxon twice (the notable-birds list
 * repeats four of the nearby species verbatim, ids and all) but not the
 * cross-rank versions Johan was looking at. The injected rows carry taxon ids
 * in the 9000000 range so nobody can mistake them for recorded iNaturalist
 * ids; the taxon-id case is the one exercised on genuinely recorded data.
 */

function fixture(name: string): FieldTruth {
  const file = path.join(process.cwd(), "tests", "fixtures", "pointmoon", `${name}.json`);
  return JSON.parse(readFileSync(file, "utf8")) as FieldTruth;
}

const versions = fixture("london_uk_taxon_versions");

/** A payload of `count` distinct recurrent plants: a context with a lot in it. */
function plantRichPayload(count: number): FieldTruth {
  return {
    facts: {
      fieldSnapshot: {
        observations: {
          nearby: Array.from({ length: count }, (_, index) => ({
            name: `Meadow plant ${index + 1}`,
            scientificName: `Herba ${["prima", "secunda", "tertia", "quarta", "quinta", "sexta", "septima", "octava", "nona", "decima", "undecima", "duodecima"][index]}`,
            iconicTaxon: "Plantae",
            count: 20 - index,
            yearsObserved: 3,
            ratioToHistorical: 1,
          })),
        },
      },
    },
  };
}

/** A context with only two on-topic creatures in it, and plenty off-topic. */
function twoPlantPayload(): FieldTruth {
  return {
    facts: {
      fieldSnapshot: {
        observations: {
          nearby: [
            ...Array.from({ length: 8 }, (_, index) => ({
              name: `Common bird ${index + 1}`,
              scientificName: `Avis communis ${index + 1}`,
              iconicTaxon: "Aves",
              count: 20 - index,
              yearsObserved: 3,
              ratioToHistorical: 1,
            })),
            {
              name: "Field maple",
              scientificName: "Acer campestre",
              iconicTaxon: "Plantae",
              count: 4,
              yearsObserved: 3,
              ratioToHistorical: 1,
            },
            {
              name: "Common poppy",
              scientificName: "Papaver rhoeas",
              iconicTaxon: "Plantae",
              count: 2,
              yearsObserved: 3,
              ratioToHistorical: 1,
            },
          ],
        },
      },
    },
  };
}

/** Every pair of members, so "no two are the same creature" can be asserted. */
function duplicatedPairs(members: ReadonlyArray<{ commonName: string; scientificName: string | null }>) {
  const pairs: string[] = [];
  for (let a = 0; a < members.length; a += 1) {
    for (let b = a + 1; b < members.length; b += 1) {
      const first = members[a]!;
      const second = members[b]!;
      const match = sameTaxon(
        taxonIdentity({ name: first.commonName, scientificName: first.scientificName }),
        taxonIdentity({ name: second.commonName, scientificName: second.scientificName })
      );
      if (match !== null) pairs.push(`${first.commonName} / ${second.commonName} (${match})`);
    }
  }
  return pairs;
}

describe("one board slot, one creature (#1030)", () => {
  it("collapses a subspecies and a bare-genus version into the species they are", () => {
    const cast = resolveCast({ data: versions, phenology: [], topic: "birds", topicFilter: true });
    const named = cast.members.map((member) => member.commonName);

    // Columba livia, three ways in this payload. One board slot.
    expect(named).toContain("Rock Pigeon");
    expect(named).not.toContain("Feral Pigeon");
    expect(named).not.toContain("Rock Dove");
    expect(duplicatedPairs(cast.members)).toEqual([]);
  });

  it("does not spend two of a minibeast board's slots on the same butterfly", () => {
    const cast = resolveCast({
      data: versions,
      phenology: [],
      topic: "minibeasts",
      topicFilter: true,
    });
    const named = cast.members.map((member) => member.commonName);

    // The genus-rank row is the less precise reading of the same sighting.
    expect(named).toContain("Cabbage White");
    expect(named).not.toContain("Pieris");
    expect(duplicatedPairs(cast.members)).toEqual([]);
  });

  it("gives the freed slots back to the creatures the repeats pushed off", () => {
    const cast = resolveCast({ data: versions, phenology: [], topic: "birds", topicFilter: true });
    const named = cast.members.map((member) => member.commonName);

    // Under the four-slot board these three lost their places to a second and
    // third version of the pigeon.
    expect(named).toContain("European Robin");
    expect(named).toContain("Rose-ringed Parakeet");
    expect(named).toContain("Eurasian Jay");
  });

  it("keeps the surviving version's own evidence rather than a duplicate's", () => {
    const cast = resolveCast({ data: versions, phenology: [], topic: "birds", topicFilter: true });
    const pigeon = cast.members.find((member) => member.commonName === "Rock Pigeon");

    // The recorded row is the one with the multi-year record; the injected
    // versions carry none, and folding them in must not erase it.
    expect(pigeon?.scientificName).toBe("Columba livia");
    expect(pigeon?.yearsObserved).toBe(3);
  });

  it("still carries an absence that no longer duplicates a member", () => {
    const cast = resolveCast({ data: versions, phenology: [] });
    for (const absence of cast.absences) {
      expect(
        cast.members.some(
          (member) =>
            sameTaxon(
              taxonIdentity({ name: member.commonName, scientificName: member.scientificName }),
              taxonIdentity({ name: absence.commonName, scientificName: absence.scientificName })
            ) !== null
        )
      ).toBe(false);
    }
  });
});

describe("the board's size follows the context, not a number (#1030)", () => {
  it("gives two when the context holds two", () => {
    const cast = resolveCast({
      data: twoPlantPayload(),
      phenology: [],
      topic: "plants",
      topicFilter: true,
    });
    expect(cast.members).toHaveLength(2);
  });

  it("gives ten when the context holds ten", () => {
    const cast = resolveCast({
      data: plantRichPayload(10),
      phenology: [],
      topic: "plants",
      topicFilter: true,
    });
    expect(cast.members).toHaveLength(10);
  });

  it("stops at the documented layout bound, and only there", () => {
    // Twelve is what a page can hold, not what a lesson is allowed to be
    // about. A richer context is trimmed here and nowhere earlier.
    const cast = resolveCast({
      data: plantRichPayload(12),
      phenology: [],
      topic: "plants",
      topicFilter: true,
    });
    expect(cast.members).toHaveLength(12);
  });
});

describe("no cast surface pins the board to a literal count (#1030)", () => {
  /**
   * A SOURCE SCAN, for the same reason `cast-is-live-coverage.spec.ts` is one:
   * the failure mode is reach. Every behavioural test above can pass while
   * `/cast` still asks for four and slices to four, and the board a teacher
   * holds up in front of a class is the one surface where that is visible.
   */
  /**
   * The scan is narrow on purpose. A numeric `limit:` passed to something that
   * is NOT the cast read is a different question — `lib/cast/surface.ts` asks
   * `getOutsideNow` for twenty-four sightings to lay live photographs over the
   * members it already has, and that depth is not a claim about how many
   * creatures a class is shown. So the surface page is checked for asking, and
   * the library files are checked for the DEFAULTS that made a fixed count the
   * answer when nobody asked for one.
   */
  const files: Array<{ rel: string; asking: boolean }> = [
    // The cast read lives in the board, not the route file (nc#845). This
    // entry followed it: `app/cast/page.tsx` no longer calls `readSurfaceCast`
    // at all, so scanning it would be scanning a file that cannot regress.
    { rel: "app/cast/CastBoard.tsx", asking: true },
    { rel: "lib/cast/live.ts", asking: false },
    { rel: "lib/cast/read.ts", asking: false },
    { rel: "lib/cast/surface.ts", asking: false },
  ];

  it.each(files)("$rel neither asks for a fixed count nor slices to one", ({ rel, asking }) => {
    const source = readFileSync(path.join(process.cwd(), rel), "utf8");
    const asks = asking ? (source.match(/limit:\s*\d+/g) ?? []) : [];
    const slices = source.match(/members\.slice\(\s*0\s*,\s*\d+\s*\)/g) ?? [];
    const defaults = source.match(/\blimit\s*(?:=|\?\?)\s*\d+/g) ?? [];
    expect({ rel, asks, slices, defaults }).toEqual({ rel, asks: [], slices: [], defaults: [] });
  });
});

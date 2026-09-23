import { describe, expect, it } from "vitest";
import { liveRegionalEntries, speciesKey } from "@/lib/outside/live-lookfors";
import type { FieldTruth } from "@/lib/outside/pointmoon";

/**
 * lib/outside/live-lookfors.ts — the live half of the regional tier (#284,
 * #305). Additive by construction: never displaces an authored entry, only
 * offers species the authored week did not already name, and never invents
 * prose for one it did not.
 */

function payloadWithHistorical(
  nearby: ReadonlyArray<{
    name: string;
    scientificName?: string | null;
    avgCount?: number | null;
    yearsObserved?: number | null;
  }>
): FieldTruth {
  return {
    facts: {
      fieldSnapshot: {
        observations: {
          historical: {
            resolutionStatus: "resolved",
            nearby: nearby.map((n) => ({
              name: n.name,
              scientificName: n.scientificName ?? null,
              avgCount: n.avgCount ?? null,
              photo: null,
              iconicTaxon: null,
              yearsObserved: n.yearsObserved ?? null,
              sampledYears: null,
            })),
          },
        },
      },
    },
  } as unknown as FieldTruth;
}

describe("liveRegionalEntries", () => {
  it("returns nothing when Pointmoon sent no historical record", () => {
    expect(liveRegionalEntries(null, new Set(), 3)).toEqual({ usuallyAround: [], lookFors: [] });
    expect(liveRegionalEntries({ facts: {} } as FieldTruth, new Set(), 3)).toEqual({
      usuallyAround: [],
      lookFors: [],
    });
  });

  it("never invents to fill the cap: an empty historical list is an empty answer", () => {
    const data = payloadWithHistorical([]);
    expect(liveRegionalEntries(data, new Set(), 3)).toEqual({ usuallyAround: [], lookFors: [] });
  });

  it("surfaces real species Pointmoon recorded, with a plain generic note", () => {
    const data = payloadWithHistorical([
      { name: "Black-crowned Night Heron", scientificName: "Nycticorax nycticorax" },
      { name: "Monarch", scientificName: "Danaus plexippus" },
    ]);

    const live = liveRegionalEntries(data, new Set(), 3);

    expect(live.usuallyAround).toEqual([
      { id: "historical:sci:nycticorax nycticorax", name: "Black-crowned Night Heron", scientificName: "Nycticorax nycticorax" },
      { id: "historical:sci:danaus plexippus", name: "Monarch", scientificName: "Danaus plexippus" },
    ]);
    for (const lookFor of live.lookFors) {
      expect(lookFor.note).toBe(`Look closely at ${lookFor.species}. What do you notice?`);
    }
    // No phase claim: this tier does not know a narrative phase, and does
    // not guess one.
    expect(live.lookFors.every((lf) => lf.phase === undefined)).toBe(true);
  });

  it("never repeats a species the authored week already named", () => {
    const data = payloadWithHistorical([
      { name: "Monarch", scientificName: "Danaus plexippus" },
      { name: "Mallard", scientificName: "Anas platyrhynchos" },
    ]);
    const covered = new Set([speciesKey({ scientificName: "Danaus plexippus", name: "Monarch" })]);

    const live = liveRegionalEntries(data, covered, 3);

    expect(live.usuallyAround.map((e) => e.name)).toEqual(["Mallard"]);
  });

  it("matches identity by scientific name even when the common name differs", () => {
    // The exact case lib/cast/read.ts's note index guards: two sources can
    // name the same species differently.
    const data = payloadWithHistorical([
      { name: "Monarch Butterfly", scientificName: "Danaus plexippus" },
    ]);
    const covered = new Set([speciesKey({ scientificName: "Danaus plexippus", name: "Monarch" })]);

    expect(liveRegionalEntries(data, covered, 3).usuallyAround).toEqual([]);
  });

  it("falls back to a name-based key only when Pointmoon sent no scientific name", () => {
    const data = payloadWithHistorical([{ name: "Common Frog", scientificName: null }]);
    const covered = new Set([speciesKey({ name: "Common Frog" })]);

    expect(liveRegionalEntries(data, covered, 3).usuallyAround).toEqual([]);
  });

  it("caps at maxExtra even when Pointmoon's record holds more", () => {
    const data = payloadWithHistorical([
      { name: "Monarch", scientificName: "Danaus plexippus" },
      { name: "Mallard", scientificName: "Anas platyrhynchos" },
      { name: "Snowy Egret", scientificName: "Egretta thula" },
      { name: "Western Gull", scientificName: "Larus occidentalis" },
    ]);

    expect(liveRegionalEntries(data, new Set(), 2).usuallyAround).toHaveLength(2);
    expect(liveRegionalEntries(data, new Set(), 0).usuallyAround).toHaveLength(0);
  });

  it("skips a malformed entry rather than throwing", () => {
    const data = {
      facts: {
        fieldSnapshot: {
          observations: {
            historical: { nearby: [{ name: "" }, { name: "  " }, null, { scientificName: "x" }] },
          },
        },
      },
    } as unknown as FieldTruth;

    expect(() => liveRegionalEntries(data, new Set(), 3)).not.toThrow();
    expect(liveRegionalEntries(data, new Set(), 3).usuallyAround).toEqual([]);
  });
});

describe("speciesKey", () => {
  it("prefers the scientific name so two common names for one species collide", () => {
    const a = speciesKey({ scientificName: "Danaus plexippus", name: "Monarch" });
    const b = speciesKey({ scientificName: "Danaus plexippus", name: "Monarch Butterfly" });
    expect(a).toBe(b);
  });

  it("is case- and whitespace-insensitive", () => {
    const a = speciesKey({ scientificName: " Danaus Plexippus ", name: "Monarch" });
    const b = speciesKey({ scientificName: "danaus plexippus", name: "Monarch" });
    expect(a).toBe(b);
  });
});

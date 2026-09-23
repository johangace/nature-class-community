import { describe, expect, it } from "vitest";
import { hazardsFor } from "@/lib/lesson/hazards";
import { emptyBioregionPack, bioregionPackSchema } from "@/schema/bioregion";
import type { BioregionPack } from "@/schema/bioregion";

/**
 * Hazards are the one surface where a wrong answer hurts a child, so the
 * whole layer is deterministic and these tests pin its laws (#376, grown by
 * #388's three-tier ruling):
 *
 *   1. A pack that authors its own hazards stands the universal core down —
 *      but a record-selected regional entry still rides, because a receipt
 *      beats authored generality.
 *   2. A universal hazard only travels when the class can reach a habitat
 *      that carries it and the month is live — a pond warning on a paved
 *      yard, or a tick warning in January, teaches a teacher to stop reading
 *      the card. Unknown grounds get only the habitat-free constants, never
 *      a habitat claim.
 *   3. A regional hazard ships ONLY on a record receipt: its species matched
 *      against the occurrence record by whole-word genus prefix. No record,
 *      no entry — a regional hazard without its receipt is a rumour. The
 *      matched name travels on the entry so the card can show its receipt.
 *   4. A matched regional entry supersedes the generic universal it answers
 *      more specifically (the adder stands in for "Snakes").
 */

const emptyPack = (): BioregionPack =>
  emptyBioregionPack({
    resolution: "global",
    value: "global",
    resolvedBy: "hazards.spec",
  });

describe("hazardsFor", () => {
  it("gives a pack's own authored hazards precedence over the starter set", () => {
    const pack = bioregionPackSchema.parse({
      ...emptyPack(),
      hazardVectors: [
        { id: "box-jellyfish", note: "Stinger season closes the beach. Check the council flag before any shore work." },
      ],
    });
    const result = hazardsFor({ pack, habitats: ["pond", "meadow"], month: 6 });
    expect(result?.source).toBe("pack");
    expect(result?.entries).toHaveLength(1);
    expect(result?.entries[0]?.name).toBe("Box jellyfish");
    // The starter set stands down entirely: no temperate nettle advice rides
    // along with a pack that authored its own region.
    expect(result?.entries.some((entry) => entry.id === "stings-and-scratches")).toBe(false);
  });

  it("only carries a water hazard to a class that can reach water", () => {
    const withPond = hazardsFor({ pack: emptyPack(), habitats: ["pond"], month: 6 });
    expect(withPond?.entries.some((entry) => entry.id === "water")).toBe(true);

    const pavedYard = hazardsFor({ pack: emptyPack(), habitats: ["urban", "playing_field"], month: 6 });
    expect(pavedYard?.entries.some((entry) => entry.id === "water") ?? false).toBe(false);
  });

  it("keeps a seasonal hazard inside its months", () => {
    const june = hazardsFor({ pack: emptyPack(), habitats: ["meadow"], month: 6 });
    expect(june?.entries.some((entry) => entry.id === "ticks")).toBe(true);

    const january = hazardsFor({ pack: emptyPack(), habitats: ["meadow"], month: 1 });
    expect(january?.entries.some((entry) => entry.id === "ticks") ?? false).toBe(false);
  });

  it("gives unknown grounds only the habitat-free constants, never a habitat claim", () => {
    const unknown = hazardsFor({ pack: emptyPack(), habitats: [], month: 6 });
    expect(unknown).not.toBeNull();
    // Constants of taking children outdoors travel anywhere.
    expect(unknown?.entries.some((entry) => entry.id === "boundaries")).toBe(true);
    expect(unknown?.entries.some((entry) => entry.id === "sun-and-heat")).toBe(true);
    // But nothing that claims a habitat she never mentioned.
    expect(unknown?.entries.some((entry) => entry.id === "water")).toBe(false);
    expect(unknown?.entries.some((entry) => entry.id === "ticks")).toBe(false);
  });

  it("ships a regional hazard only on a record receipt, and carries the receipt", () => {
    const noRecord = hazardsFor({ pack: emptyPack(), habitats: ["meadow", "stream"], month: 6 });
    expect(noRecord?.entries.some((entry) => entry.id === "giant-hogweed")).toBe(false);

    const withRecord = hazardsFor({
      pack: emptyPack(),
      habitats: ["meadow", "stream"],
      month: 6,
      recordedSpecies: ["Quercus robur", "Heracleum mantegazzianum"],
    });
    const hogweed = withRecord?.entries.find((entry) => entry.id === "giant-hogweed");
    expect(hogweed?.recordedAs).toBe("Heracleum mantegazzianum");
  });

  it("matches a genus only at a whole word boundary", () => {
    // "Viperana fictus" must not put the adder on the card: half a genus is
    // no receipt.
    const halfGenus = hazardsFor({
      pack: emptyPack(),
      habitats: ["meadow"],
      month: 6,
      recordedSpecies: ["Viperana fictus"],
    });
    expect(halfGenus?.entries.some((entry) => entry.id === "adder")).toBe(false);

    const genus = hazardsFor({
      pack: emptyPack(),
      habitats: ["meadow"],
      month: 6,
      recordedSpecies: ["Vipera berus"],
    });
    expect(genus?.entries.some((entry) => entry.id === "adder")).toBe(true);
  });

  it("lets a matched regional entry stand its generic universal down", () => {
    const withAdder = hazardsFor({
      pack: emptyPack(),
      habitats: ["meadow"],
      month: 6,
      recordedSpecies: ["Vipera berus"],
    });
    expect(withAdder?.entries.some((entry) => entry.id === "adder")).toBe(true);
    expect(withAdder?.entries.some((entry) => entry.id === "basking-snakes")).toBe(false);

    // Without the record, the generic caution keeps its place.
    const without = hazardsFor({ pack: emptyPack(), habitats: ["meadow"], month: 6 });
    expect(without?.entries.some((entry) => entry.id === "basking-snakes")).toBe(true);
  });

  it("keeps a regional hazard inside its season and habitats like any other", () => {
    // Hogweed in January: the record says present, the season says dormant.
    const january = hazardsFor({
      pack: emptyPack(),
      habitats: ["meadow", "stream"],
      month: 1,
      recordedSpecies: ["Heracleum mantegazzianum"],
    });
    expect(january?.entries.some((entry) => entry.id === "giant-hogweed")).toBe(false);

    // Jellyfish on a landlocked meadow: recorded regionally, unreachable here.
    const inland = hazardsFor({
      pack: emptyPack(),
      habitats: ["meadow"],
      month: 7,
      recordedSpecies: ["Physalia physalis"],
    });
    expect(inland?.entries.some((entry) => entry.id === "stinging-jellyfish")).toBe(false);
  });

  it("keeps record receipts riding alongside a pack's authored hazards", () => {
    const pack = bioregionPackSchema.parse({
      ...emptyPack(),
      hazardVectors: [
        { id: "box-jellyfish", note: "Stinger season closes the beach. Check the council flag before any shore work." },
      ],
    });
    const result = hazardsFor({
      pack,
      habitats: ["meadow"],
      month: 6,
      recordedSpecies: ["Vipera berus"],
    });
    expect(result?.source).toBe("pack");
    expect(result?.entries.some((entry) => entry.id === "box-jellyfish")).toBe(true);
    // The receipt-backed adder rides along; the universal core stands down.
    expect(result?.entries.some((entry) => entry.id === "adder")).toBe(true);
    expect(result?.entries.some((entry) => entry.id === "stings-and-scratches")).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/outside/species-allowlist", () => ({ speciesAllowlistFor: vi.fn() }));
vi.mock("@/lib/lesson/hazards", () => ({ hazardsFor: vi.fn(() => null) }));
import { hazardsForClass } from "@/lib/lesson/class-hazards";
import { hazardsFor } from "@/lib/lesson/hazards";
import { speciesAllowlistFor } from "@/lib/outside/species-allowlist";
import type { BioregionPack } from "@/schema/bioregion";

/**
 * THE ONE CALLER THAT MAKES NO EVIDENCE CLAIM (#401).
 *
 * #401 gave every name in the species allowlist an evidence tier, because a
 * multi-year regional record and a sighting near this school last week are
 * different claims and the identification surface was conflating them.
 *
 * This caller is the exception, deliberately: a plant that stings is worth
 * naming to a teacher whether it was recorded last week or in this month of
 * past years, and a hazard list makes no claim about when. So it takes BOTH
 * tiers.
 *
 * That decision lived only in a comment, on the very change that introduced a
 * field a future author is invited to filter on — and `hazardsForClass` had no
 * test at all, so `.filter(e => e.evidence === "recent")` here would have
 * silently dropped every seasonal-tier hazard with the whole suite green. This
 * is the test that says no. It is a child-safety list; the quiet failure is
 * the one that matters.
 */

const pack = { id: "test" } as unknown as BioregionPack;

describe("class hazards take every recorded name, at either tier", () => {
  beforeEach(() => vi.resetAllMocks());

  it("passes seasonal-tier species through as readily as recent ones", async () => {
    vi.mocked(speciesAllowlistFor).mockResolvedValue({
      species: [
        { name: "Stinging nettle", scientificName: "Urtica dioica", evidence: "recent" },
        { name: "Giant hogweed", scientificName: "Heracleum mantegazzianum", evidence: "seasonal" },
      ],
      recentWindowDays: 7,
    });

    await hazardsForClass({ pack, habitats: ["grass"] as never, lat: 51.5, lng: -0.1, month: 6 });

    expect(hazardsFor).toHaveBeenCalledWith(
      expect.objectContaining({
        recordedSpecies: ["Urtica dioica", "Heracleum mantegazzianum"],
      })
    );
  });

  it("asks for nothing regional when there is no record to read", async () => {
    vi.mocked(speciesAllowlistFor).mockResolvedValue({ species: [], recentWindowDays: null });
    await hazardsForClass({ pack, habitats: ["grass"] as never, month: 6 });
    expect(hazardsFor).toHaveBeenCalledWith(
      expect.objectContaining({ recordedSpecies: [], month: 6 })
    );
  });

  it("still answers when the record read fails", async () => {
    vi.mocked(speciesAllowlistFor).mockRejectedValue(new Error("unavailable"));
    await expect(
      hazardsForClass({ pack, habitats: ["grass"] as never, lat: 51.5, lng: -0.1, month: 6 })
    ).resolves.toBeNull();
    expect(hazardsFor).toHaveBeenCalledWith(expect.objectContaining({ recordedSpecies: [] }));
  });
});

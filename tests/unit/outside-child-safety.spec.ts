import { londonCalendarOnly } from "../fixtures/pointmoon/nc621/replay";
import { parseCuratedPhenology } from "@/lib/outside/curated-phenology";
import type { FieldTruth } from "@/lib/outside/pointmoon";
import { describe, expect, it, vi } from "vitest";

const fetchFieldTruth = vi.hoisted(() => vi.fn<() => Promise<FieldTruth | null>>(async () => null));

vi.mock("@/lib/outside/pointmoon", () => ({
  fetchFieldTruth,
}));

import { crossesSafetyBoundary } from "@/lib/ai/lesson-support-contract";
import { getOutsideNow } from "@/lib/outside";

describe("outside child-facing notes", () => {
  it("passes a mapped lesson topic to Pointmoon's observation scope", async () => {
    await getOutsideNow({ primaryTopic: "plants" });

    expect(fetchFieldTruth).toHaveBeenCalledWith(
      expect.objectContaining({ observationTaxa: ["Plantae"] })
    );
  });

  it("never publishes unsafe authored foraging advice", async () => {
    const raw = londonCalendarOnly();
    fetchFieldTruth.mockResolvedValue({ facts: { fieldSnapshot: { phenology: parseCuratedPhenology(raw.facts.fieldSnapshot.phenology, raw.facts.fieldSnapshot.time.date) } } });
    const outside = await getOutsideNow({
      date: new Date("2026-09-13T12:00:00Z"),
      limit: 100,
    });
    const blackberry = outside.lookFors.find((entry) => entry.species === "Blackberry");

    expect(blackberry).toBeDefined();
    expect(blackberry?.note).not.toContain("Free sweets");
    expect(outside.lookFors.every((entry) => !crossesSafetyBoundary(entry.note))).toBe(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import { londonCalendarOnly } from "../fixtures/pointmoon/nc621/replay";
import { parseCuratedPhenology } from "@/lib/outside/curated-phenology";
import type { FieldTruth } from "@/lib/outside/pointmoon";
const fetchFieldTruth = vi.hoisted(() => vi.fn<() => Promise<FieldTruth | null>>());
vi.mock("@/lib/outside/pointmoon", () => ({ fetchFieldTruth }));
vi.mock("@/lib/outside/species-source", () => ({ getSpeciesSource: vi.fn(async () => null) }));
vi.mock("@/lib/ai/species-note", () => ({ draftSpeciesNote: vi.fn(async () => null) }));
import { getOutsideNow } from "@/lib/outside";
import { getSpeciesDepth } from "@/lib/cast/depth";
const raw = londonCalendarOnly();
const p = parseCuratedPhenology(raw.facts.fieldSnapshot.phenology, raw.facts.fieldSnapshot.time.date)!;
const date = new Date(raw.facts.fieldSnapshot.time.date);

describe("#621 preserves adjacent evidence boundaries", () => {
  it("keeps the separate historical bonus when curated entries fill the display budget", async () => {
    fetchFieldTruth.mockResolvedValue({ facts: { fieldSnapshot: { phenology: p, observations: {
      nearby: [], historical: { nearby: [{ name: "Monarch", scientificName: "Danaus plexippus", iconicTaxon: "Insecta", photo: null, avgCount: 2, yearsObserved: 3, sampledYears: 3 }] },
    } } } });
    const outside = await getOutsideNow({ lat: 51.546, lng: -0.105, date, limit: 1 });
    expect(outside.usuallyAround.map(e => e.name)).toContain("Blackberry");
    expect(outside.usuallyAround.map(e => e.name)).toContain("Monarch");
  });
  it("does not give an individual swallow the gathering's depth or seasonal phase", async () => {
    fetchFieldTruth.mockResolvedValue({ facts: { fieldSnapshot: { phenology: {
      ...p, entries: p.entries.filter(e => e.species === "Swallow Gathering"),
    } } } });
    const depth = await getSpeciesDepth({ commonName: "Barn Swallow", scientificName: "Hirundo rustica", iconicTaxon: "Aves", date });
    expect(depth.rightNow).toBeNull();
    expect(depth.forTeacher).toBeNull();
  });
  it("does not fall back from a conflicting scientific identity onto the common name", async () => {
    fetchFieldTruth.mockResolvedValue({ facts: { fieldSnapshot: { phenology: p } } });
    const depth = await getSpeciesDepth({ commonName: "Blackberry", scientificName: "Other taxon", date });
    expect(depth.rightNow).toBeNull();
    expect(depth.forTeacher).toBeNull();
  });

});

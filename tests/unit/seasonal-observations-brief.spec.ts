import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/cast/surface", () => ({ readSurfaceCast: vi.fn(), CAST_DEPTH: 12 }));
vi.mock("@/lib/outside/pointmoon", () => ({ fetchFieldTruth: vi.fn() }));
vi.mock("@/lib/outside/index", () => ({ getOutsideNow: vi.fn() }));
vi.mock("@/lib/outside/taxon-reference", () => ({ taxonReferences: vi.fn() }));
import { readSurfaceCast } from "@/lib/cast/surface";
import { getOutsideBrief } from "@/lib/outside/brief";
import { getOutsideNow } from "@/lib/outside/index";
import { fetchFieldTruth } from "@/lib/outside/pointmoon";
import { taxonReferences } from "@/lib/outside/taxon-reference";
import landscape from "../support/landscape-references.json";
import { seasonalFixture, seasonalLocation } from "../support/seasonal-observations-fixture";
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("POINTMOON_USANPN_ENABLED", "1");
  vi.mocked(readSurfaceCast).mockResolvedValue({ cast: { members: [], absences: [], source: "live" }, located: true, school: "Test school", className: "Test class", place: { ...seasonalLocation, climate: null } } as never);
  vi.mocked(getOutsideNow).mockResolvedValue({ lookFors: [{ id: "red-oak", species: "Northern red oak", note: "Compare the buds" }], usuallyAround: [{ id: "red-oak", name: "Northern red oak", scientificName: "Quercus rubra" }] } as never);
  vi.mocked(taxonReferences).mockResolvedValue({});
  vi.mocked(fetchFieldTruth).mockResolvedValue({ facts: { fieldSnapshot: { seasonalObservations: seasonalFixture() } } });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe("USA-NPN reaches the teacher brief", () => {
  it("opts the existing read in and matches lesson species even without reference photos", async () => {
    const result = await getOutsideBrief();
    expect(fetchFieldTruth).toHaveBeenCalledWith({ ...seasonalLocation, seasonalObservations: true });
    expect(result.seasonalObservations?.records).toHaveLength(1);
    expect(result.seasonalObservations?.records[0]?.scientificName).toBe("Quercus rubra");
    expect(result.lookFors).toHaveLength(1);
  });
  it("keeps authored notes when source is missing", async () => {
    vi.mocked(fetchFieldTruth).mockResolvedValue(null);
    const result = await getOutsideBrief();
    expect(result.seasonalObservations).toBeNull();
    expect(result.lookFors).toHaveLength(1);
  });
});

it("wires relevant model references into the actual soil lesson brief", async () => {
  vi.setSystemTime(new Date("2026-09-07T18:00:00Z")); vi.stubEnv("POINTMOON_PLACE_EVIDENCE_ENABLED", "1");
  vi.mocked(readSurfaceCast).mockResolvedValue({ cast: { members: [], absences: [], source: "live" }, located: true, place: { lat: 51.51, lng: -0.165, climate: null } } as never);
  vi.mocked(fetchFieldTruth).mockResolvedValue({ facts: { fieldSnapshot: { placeEvidence: landscape } } });
  const result = await getOutsideBrief({ topicTags: ["soil"] });
  expect(fetchFieldTruth).toHaveBeenCalledWith({ lat: 51.51, lng: -0.165, placeSources: ["soilgrids"] });
  expect(result.teacherReferences).toHaveLength(1);
  expect(result.teacherReferences?.[0]?.title).toBe("Soil in a reference map cell");
});

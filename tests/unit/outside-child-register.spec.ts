import { expect, it, vi } from "vitest";
vi.mock("@/lib/outside/pointmoon", () => ({
  fetchFieldTruth: async () => ({ facts: { fieldSnapshot: { phenology: {
    epistemicType: "curated", provider: "hand-authored", regionKey: "uk-south",
    week: 37, readAt: "2026-09-13T12:00:00Z",
    entries: [{ id: "test-frog", kind: "species", epistemicType: "curated",
      species: "Common frog", scientificName: "Rana temporaria",
      habitats: ["pond"], senses: ["sight"], confidence: "high",
      description: "Adults exhibit marked sexual dimorphism." }],
  } } } }),
}));
import { getOutsideNow } from "@/lib/outside";
it("uses a noticing question when authored child words are absent, never the adult description (#200)", async () => {
  const outside = await getOutsideNow({ date: new Date("2026-09-13T12:00:00Z") });
  expect(outside.lookFors.find((entry) => entry.id === "test-frog")?.note).toBe("Look closely at Common frog. What do you notice?");
});

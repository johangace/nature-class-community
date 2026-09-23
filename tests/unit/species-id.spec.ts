import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/ai/draft", () => ({ draft: vi.fn(async () => null) }));
import { draft } from "@/lib/ai/draft";
import { identifySpecies, parseSpeciesId } from "@/lib/ai/species-id";

const CANDIDATES = [
  { name: "Stinging nettle", scientificName: "Urtica dioica", evidence: "recent" as const },
  { name: "Common frog", scientificName: "Rana temporaria", evidence: "recent" as const },
];
const note = "Look at the shape of the leaves.";

describe("photo identification and local provenance", () => {
  it("keeps canonical record names for a matching identification", () => {
    expect(parseSpeciesId({ name: "COMMON frog", scientificName: "Rana temporaria", note }, CANDIDATES))
      .toEqual({ ...CANDIDATES[1], note, evidence: "recent" });
  });

  it("accepts a species absent from the records without claiming it was recorded", () => {
    expect(parseSpeciesId({ name: "Fire salamander", scientificName: "Salamandra salamandra", note }, CANDIDATES))
      .toEqual({ name: "Fire salamander", scientificName: "Salamandra salamandra", note, evidence: null });
  });

  it("accepts a useful broader identification when species detail is missing", () => {
    expect(parseSpeciesId({ name: "Grass", scientificName: "Poaceae", note }, []))
      .toEqual({ name: "Grass", scientificName: "Poaceae", note, evidence: null });
  });

  it("does not treat conflicting scientific names as the same local record", () => {
    expect(parseSpeciesId({ name: "Common frog", scientificName: "Rana arvalis", note }, CANDIDATES)?.evidence)
      .toBeNull();
  });

  it("derives provenance itself, ignoring model claims and former rejection fields", () => {
    expect(parseSpeciesId({ name: "Grass", scientificName: null, note, evidence: "recent", locallyRecorded: true, reason: "person-visible" }, CANDIDATES))
      .toEqual({ name: "Grass", scientificName: null, note, evidence: null });
  });

  it("retains the explanation when there is no recognisable subject", () => {
    expect(parseSpeciesId({ name: null, scientificName: "Poaceae", note }, CANDIDATES))
      .toEqual({ name: null, scientificName: null, note, evidence: null });
  });

  it("rejects malformed and unbounded replies as service failures", () => {
    for (const reply of [null, "Common frog", { name: 7 }, { name: "Frog", scientificName: null },
      { name: " ", scientificName: null, note }, { name: "Grass", scientificName: null, note: "x".repeat(401) }]) {
      expect(parseSpeciesId(reply, CANDIDATES)).toBeNull();
    }
  });

  it("examines a photo even with no local records", async () => {
    const image = { mediaType: "image/jpeg" as const, base64: "aGVsbG8=" };
    await identifySpecies({ image, candidates: [] });
    expect(draft).toHaveBeenCalledWith(expect.objectContaining({ image, facts: [] }));
  });
});

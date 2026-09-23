import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cast/surface", () => ({
  readSurfaceCast: vi.fn(),
  CAST_DEPTH: 12,
}));
vi.mock("@/lib/outside/pointmoon", () => ({ fetchFieldTruth: vi.fn() }));
vi.mock("@/lib/outside/index", () => ({ getOutsideNow: vi.fn() }));
vi.mock("@/lib/outside/taxon-reference", () => ({ taxonReferences: vi.fn() }));

import { readSurfaceCast } from "@/lib/cast/surface";
import { getOutsideBrief } from "@/lib/outside/brief";
import { getOutsideNow } from "@/lib/outside/index";
import { fetchFieldTruth } from "@/lib/outside/pointmoon";
import { taxonReferences } from "@/lib/outside/taxon-reference";
import type { ConditionKind } from "@/schema/pack";

const session = {
  id: "summer-w1-counting-life",
  title: "Counting life",
  conditionNotes: [{ when: ["windy"] as ConditionKind[], teacher: "Begin with looking along a sheltered edge; move the listening round there once the class has counted." }],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readSurfaceCast).mockResolvedValue({
    cast: { members: [], absences: [], source: "live" },
    located: true,
    school: "Willow Primary",
    className: "Willow class",
    place: { lat: 51.5, lng: -0.12, climate: null },
  } as never);
  vi.mocked(getOutsideNow).mockResolvedValue({ lookFors: [], usuallyAround: [] } as never);
  vi.mocked(taxonReferences).mockResolvedValue({});
});

describe("the lesson consequence in the Outside brief", () => {
  it("prefers the lesson author's line when Pointmoon matches its condition", async () => {
    vi.mocked(fetchFieldTruth).mockResolvedValue({
      facts: {
        fieldSnapshot: {
          weather: { current: { windKph: 45, felt: { apparentC: 18 } } },
        },
      },
    } as never);

    const brief = await getOutsideBrief({ session });

    expect(brief.conditionKind).toBe("windy");
    expect(brief.context).toEqual({
      lessonId: session.id,
      lessonTitle: session.title,
      line: session.conditionNotes[0]!.teacher,
      source: "lesson.conditionNotes",
    });
  });

  it("falls back to the reviewed condition adjustment when no hinge matches", async () => {
    vi.mocked(fetchFieldTruth).mockResolvedValue({
      facts: {
        fieldSnapshot: {
          weather: {
            current: {
              precipitationRateMmPerHour: 2,
              felt: { apparentC: 18 },
            },
          },
        },
      },
    } as never);

    const brief = await getOutsideBrief({ session });

    expect(brief.conditionKind).toBe("wet");
    expect(brief.context).toEqual({
      line: "Wellies and close to shelter. Rain brings the worms up.",
      source: "conditions.adjustment",
    });
  });

  it("carries a seasonal reference picture even when the bounded cast has no match", async () => {
    vi.mocked(fetchFieldTruth).mockResolvedValue(null);
    vi.mocked(getOutsideNow).mockResolvedValue({
      usuallyAround: [
        { id: "blackberry", name: "Blackberry", scientificName: "Rubus fruticosus" },
      ],
      lookFors: [
        {
          id: "blackberry",
          species: "Blackberry",
          note: "Compare green, red and black fruit on the same cane.",
        },
      ],
    } as never);
    vi.mocked(taxonReferences).mockResolvedValue({
      "rubus fruticosus": {
        taxonId: 1090496,
        iconicTaxon: "Plantae",
        commonName: "Blackberry",
        photo: {
          url: "https://example.invalid/blackberry.jpg",
          role: "taxon-reference",
          attribution: "Reference photographer",
          license: "cc-by",
          sourceUrl: "https://example.invalid/blackberry-source",
        },
      },
    });

    const brief = await getOutsideBrief({ session });

    expect(brief.lookForMembers).toEqual([
      expect.objectContaining({
        commonName: "Blackberry",
        scientificName: "Rubus fruticosus",
        photoUrl: "https://example.invalid/blackberry.jpg",
        photoRole: "taxon-reference",
        honestyTier: "regional",
      }),
    ]);
  });
});

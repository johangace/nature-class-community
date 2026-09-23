import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const notFound = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error("not-found");
  })
);
const readSurfaceCast = vi.hoisted(() => vi.fn());

vi.mock("@/lib/request-locale", () => ({ requestLocale: vi.fn().mockResolvedValue("uk") }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/cast/surface", () => ({ readSurfaceCast }));
vi.mock("@/lib/cast/depth", () => ({
  getSpeciesDepth: vi.fn().mockResolvedValue({
    whatItIs: null,
    rightNow: null,
    forTeacher: null,
    credit: null,
  }),
}));
vi.mock("@/lib/cast/safety", () => ({ safetyFor: vi.fn().mockReturnValue(null) }));
vi.mock("@/app/CastFace", () => ({ CastFace: () => <div data-cast-face /> }));

import SpeciesPage from "@/app/species/[slug]/page";
import type { CastMember } from "@/lib/cast/member";

const dragonfly: CastMember = {
  commonName: "Broad-bodied Chaser",
  scientificName: "Libellula depressa",
  photoUrl: null,
  iconicTaxon: "Insecta",
  honestyTier: "regional",
  lastSeenWindow: null,
  yearsObserved: null,
  historicalAvgCount: null,
  safetyNote: null,
  sortRank: 0,
  absent: false,
  line: "A chunky blue dragonfly zooms over the pond like a tiny helicopter.",
};

function surface(members: CastMember[]) {
  return {
    cast: { members, absences: [], source: "live" },
    located: false,
    school: null,
    className: null,
    place: { lat: null, lng: null, climate: null, name: "Canonbury" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("species profile resolution", () => {
  it("protects the reported species slug from the generic cast cap", async () => {
    readSurfaceCast.mockResolvedValue(surface([dragonfly]));

    const page = await SpeciesPage({
      params: Promise.resolve({ slug: "libellula-depressa" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(readSurfaceCast).toHaveBeenCalledWith({
      limit: 12,
      primaryTopic: null,
      profileSlug: "libellula-depressa",
      topicTags: [],
    });
    expect(markup).toContain("Broad-bodied Chaser");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("replays a validated lesson topic at the producer boundary", async () => {
    readSurfaceCast.mockResolvedValue(surface([dragonfly]));

    await SpeciesPage({
      params: Promise.resolve({ slug: "libellula-depressa" }),
      searchParams: Promise.resolve({ topic: "minibeasts" }),
    });

    expect(readSurfaceCast).toHaveBeenCalledWith({
      limit: 12,
      primaryTopic: "minibeasts",
      profileSlug: "libellula-depressa",
      topicTags: ["minibeasts"],
    });
  });

  it("does not let an arbitrary query value scope the producer", async () => {
    readSurfaceCast.mockResolvedValue(surface([dragonfly]));

    await SpeciesPage({
      params: Promise.resolve({ slug: "libellula-depressa" }),
      searchParams: Promise.resolve({ topic: "not-a-topic" }),
    });

    expect(readSurfaceCast).toHaveBeenCalledWith({
      limit: 12,
      primaryTopic: null,
      profileSlug: "libellula-depressa",
      topicTags: [],
    });
  });

  it("keeps an unknown slug on the branded 404 path", async () => {
    readSurfaceCast.mockResolvedValue(surface([]));

    await expect(
      SpeciesPage({ params: Promise.resolve({ slug: "not-a-real-species" }) })
    ).rejects.toThrow("not-found");

    expect(notFound).toHaveBeenCalledOnce();
  });
});

describe("the way back from a profile opened inside a run (#874)", () => {
  it("links back into the run, on its saved beat, when the session is real", async () => {
    readSurfaceCast.mockResolvedValue(surface([dragonfly]));
    const { leadPack } = await import("@/lib/pack");
    const real = leadPack().sessions[0]!.id;

    const page = await SpeciesPage({
      params: Promise.resolve({ slug: "libellula-depressa" }),
      searchParams: Promise.resolve({ session: real }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain(`href="/run?session=${real}&amp;resume=1"`);
    expect(markup).toContain("Back to the lesson");
    expect(markup).not.toContain('class="species-back">Today');
  });

  it("keeps the ordinary way home when the session is not on the shelf", async () => {
    readSurfaceCast.mockResolvedValue(surface([dragonfly]));

    const page = await SpeciesPage({
      params: Promise.resolve({ slug: "libellula-depressa" }),
      searchParams: Promise.resolve({ session: "not-a-session" }),
    });
    const markup = renderToStaticMarkup(page);

    expect(markup).not.toContain("resume=1");
    expect(markup).not.toContain("Back to the lesson");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE ACTIVE-CLASS/TODAY PATH DID NOT USE GROUNDS (#54).
 *
 * `readSurfaceCast` is the one cast accessor every non-card surface reads
 * from — the daily card's own composer, /run's meet-the-cast beat and door,
 * /print's cast cards. It never accepted a `habitats` option at all, so
 * however carefully a school's grounds were resolved elsewhere, nothing
 * reaching this file could ever narrow what it showed. This pins the fix at
 * the seam: `habitats` is forwarded to `getClassCast`, which already knew
 * what to do with it (lib/cast/read.ts, lib/cast/live.ts).
 */

vi.mock("@/lib/cast/read", () => ({ getClassCast: vi.fn() }));
vi.mock("@/lib/cast/enrich", () => ({ withLivePhotos: vi.fn((members: unknown) => members) }));
vi.mock("@/lib/outside", () => ({ getOutsideNow: vi.fn() }));
vi.mock("@/lib/teacher", () => ({ getActiveClass: vi.fn(), getTeacher: vi.fn() }));

import { readSurfaceCast } from "@/lib/cast/surface";
import { getClassCast } from "@/lib/cast/read";
import { getActiveClass, getTeacher } from "@/lib/teacher";

const EMPTY_CAST = { members: [], absences: [], source: "live" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTeacher).mockResolvedValue({ id: "teacher-1" } as never);
  vi.mocked(getActiveClass).mockResolvedValue({
    id: "class-1",
    lat: null,
    lng: null,
    climate: null,
  } as never);
  vi.mocked(getClassCast).mockResolvedValue(EMPTY_CAST);
});

describe("readSurfaceCast forwards grounds-derived habitats", () => {
  it("passes the requested profile slug through to the live cast", async () => {
    await readSurfaceCast({ profileSlug: "libellula-depressa" });

    expect(getClassCast).toHaveBeenCalledWith(
      "class-1",
      expect.objectContaining({ profileSlug: "libellula-depressa" })
    );
  });

  it("passes the authored primary topic through to the live cast", async () => {
    await readSurfaceCast({ topicTags: ["trees", "plants"], primaryTopic: "plants" });

    expect(getClassCast).toHaveBeenCalledWith(
      "class-1",
      expect.objectContaining({ primaryTopic: "plants" })
    );
  });

  it("passes the caller's habitats through to getClassCast", async () => {
    await readSurfaceCast({ topicTags: [], habitats: ["woodland", "pond"] });

    expect(getClassCast).toHaveBeenCalledWith(
      "class-1",
      expect.objectContaining({ habitats: ["woodland", "pond"] })
    );
  });

  it("two contrasting grounds selections reach getClassCast as two different filters", async () => {
    await readSurfaceCast({ topicTags: [], habitats: ["coast", "urban"] });
    expect(getClassCast).toHaveBeenLastCalledWith(
      "class-1",
      expect.objectContaining({ habitats: ["coast", "urban"] })
    );

    await readSurfaceCast({ topicTags: [], habitats: ["woodland", "stream"] });
    expect(getClassCast).toHaveBeenLastCalledWith(
      "class-1",
      expect.objectContaining({ habitats: ["woodland", "stream"] })
    );
  });

  it("stays undefined when a caller has not resolved grounds, changing nothing for it", async () => {
    await readSurfaceCast({ topicTags: [] });

    expect(getClassCast).toHaveBeenCalledWith(
      "class-1",
      expect.objectContaining({ habitats: undefined })
    );
  });
});

describe("readSurfaceCast forwards the strict topic filter (nc#233)", () => {
  it("passes topicFilter: true through to getClassCast for an in-lesson caller", async () => {
    await readSurfaceCast({ topicTags: ["minibeasts"], primaryTopic: "minibeasts", topicFilter: true });

    expect(getClassCast).toHaveBeenCalledWith(
      "class-1",
      expect.objectContaining({ topicFilter: true })
    );
  });

  it("stays undefined for a general caller, changing nothing for it", async () => {
    await readSurfaceCast({ topicTags: ["minibeasts"], primaryTopic: "minibeasts" });

    expect(getClassCast).toHaveBeenCalledWith(
      "class-1",
      expect.objectContaining({ topicFilter: undefined })
    );
  });
});

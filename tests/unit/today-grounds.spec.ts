import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * THE TODAY PATH NOW USES GROUNDS (#54).
 *
 * `composeTodayRead` used to call `readSurfaceCast` with no `habitats` at
 * all, so the home screen's species row and door faces could never be
 * narrowed by a school's own grounds, however carefully `app/page.tsx`
 * resolved them. This pins the wiring: `TodayReadQuery.habitats` reaches
 * `readSurfaceCast` unchanged.
 */

vi.mock("@/lib/cast/surface", () => ({ readSurfaceCast: vi.fn(), CAST_DEPTH: 12 }));
vi.mock("@/lib/outside/pointmoon", () => ({ fetchFieldTruth: vi.fn() }));

import { getTodayRead } from "@/lib/outside/today";
import { readSurfaceCast } from "@/lib/cast/surface";
import { fetchFieldTruth } from "@/lib/outside/pointmoon";

const EMPTY_SURFACE = {
  cast: { members: [], absences: [], source: "live" },
  located: true,
  school: "Willow",
  className: "Willow class",
  place: { lat: 51.5, lng: -0.12, climate: null },
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readSurfaceCast).mockResolvedValue(EMPTY_SURFACE);
  vi.mocked(fetchFieldTruth).mockResolvedValue(null as never);
});

describe("Today's read forwards grounds-derived habitats", () => {
  it("passes the query's habitats through to readSurfaceCast", async () => {
    await getTodayRead({ topicTags: [], habitats: ["meadow", "grassland"] });

    expect(readSurfaceCast).toHaveBeenCalledWith(
      expect.objectContaining({ habitats: ["meadow", "grassland"] })
    );
  });

  it("stays undefined for a class with no grounds set, exactly as before grounds existed", async () => {
    await getTodayRead({ topicTags: [] as never });

    expect(readSurfaceCast).toHaveBeenCalledWith(
      expect.objectContaining({ habitats: undefined })
    );
  });
});

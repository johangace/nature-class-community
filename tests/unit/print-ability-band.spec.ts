vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }), headers: async () => new Headers() }));
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("@/lib/teacher", () => ({
  getActiveEnglishLocale: vi.fn().mockResolvedValue(null),

  getTeacher: vi.fn(),
  getActiveClass: vi.fn(),
  getActiveClassLocation: vi.fn(),
}));
vi.mock("@/lib/place-context", () => ({
  activePlaceContext: vi.fn(),
  sessionForPlace: vi.fn((session: unknown) => session),
}));
vi.mock("@/lib/cast/surface", () => ({ readSurfaceCast: vi.fn() }));

import PrintPage from "@/app/print/page";
import { activePlaceContext } from "@/lib/place-context";
import { readSurfaceCast } from "@/lib/cast/surface";
import { getActiveClass, getActiveClassLocation, getTeacher } from "@/lib/teacher";

/**
 * PRINT'S OWN ABILITY BAND (#54).
 *
 * `app/print/page.tsx` used to render every phase and every child sheet at a
 * hardcoded "reception", whatever year group the active class was saved as —
 * a Year 2 class's take-home sheet carried Reception's wording.
 *
 * `leaves-and-their-trees`'s "collect" phase authors a y2-specific rewrite of its
 * say-aloud line (packs/autumn-starter.json) and no reception override, so
 * the base text IS what Reception should see and the y2 text is what a real
 * Year 2 class should get instead — a fixture a hardcoded band cannot pass.
 */

const BASE_LINE = "When a leaf on the ground catches your eye, say hello to it.";
const Y2_LINE = "When a leaf catches your eye, pick it up and get to know it.";

const PLACE_CONTEXT = {
  chain: [],
  keys: [],
  pack: {},
  source: null,
} as never;

const EMPTY_SURFACE_CAST = {
  cast: { members: [], absences: [], source: "live" },
  located: false,
  school: null,
  className: null,
  place: { lat: null, lng: null, climate: null },
} as never;

function mockSignedOut() {
  vi.mocked(getTeacher).mockResolvedValue(null);
  vi.mocked(getActiveClass).mockResolvedValue(null);
  vi.mocked(getActiveClassLocation).mockResolvedValue(null);
  vi.mocked(activePlaceContext).mockResolvedValue(PLACE_CONTEXT);
  vi.mocked(readSurfaceCast).mockResolvedValue(EMPTY_SURFACE_CAST);
}

function mockClass(yearGroup: string | null, abilityBand: string | null = null) {
  vi.mocked(getTeacher).mockResolvedValue({ id: "teacher-1" } as never);
  vi.mocked(getActiveClass).mockResolvedValue({
    id: "class-1",
    name: "Willow class",
    school: "Willow Primary",
    yearGroup,
    abilityBand,
    learnerContext: { abilityBand },
    lat: null,
    lng: null,
  } as never);
  vi.mocked(getActiveClassLocation).mockResolvedValue(null);
  vi.mocked(activePlaceContext).mockResolvedValue(PLACE_CONTEXT);
  vi.mocked(readSurfaceCast).mockResolvedValue(EMPTY_SURFACE_CAST);
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function renderPrint(session: string, locale?: "uk" | "us") {
  const page = await PrintPage({
    searchParams: Promise.resolve({ session, part: "script", locale }),
  });
  return renderToStaticMarkup(page as never);
}

describe("print reads the active class's own ability band", () => {
  it("returns a signed-out demo reader to the public landing", async () => {
    mockSignedOut();
    const markup = await renderPrint("leaves-and-their-trees");
    expect(markup).toContain('href="/"');
    expect(markup).toContain("Back to Nature Class");
    expect(markup).not.toContain('href="/today"');
  });

  it("returns a signed-in teacher to Today", async () => {
    mockClass("Reception");
    const markup = await renderPrint("leaves-and-their-trees");
    expect(markup).toContain('href="/today"');
    expect(markup).toContain("Back to today");
  });

  it("prints the base (reception) wording for a Reception class", async () => {
    mockClass("Reception");
    const markup = await renderPrint("leaves-and-their-trees");
    expect(markup).toContain(BASE_LINE);
    expect(markup).not.toContain(Y2_LINE);
  });

  it("prints the Year 2 wording for a Year 2 class, never Reception's", async () => {
    mockClass("Year 2");
    const markup = await renderPrint("leaves-and-their-trees");
    expect(markup).toContain(Y2_LINE);
    expect(markup).not.toContain(BASE_LINE);
  });

  it("prints the same internal band with a US teacher-facing grade label", async () => {
    mockClass("Year 2");
    const markup = await renderPrint("leaves-and-their-trees", "us");
    expect(markup).toContain("Grade 1");
    expect(markup).not.toContain("Year 2");
    expect(markup).not.toMatch(/\bages?\s*\d/i);
  });

  it("lets the internal ability identity override the year-group label on paper", async () => {
    mockClass("Year 2", "reception");
    const markup = await renderPrint("leaves-and-their-trees", "us");
    expect(markup).toContain("Pre-K");
    expect(markup).toContain(BASE_LINE);
    expect(markup).not.toContain(Y2_LINE);
  });

  it("prints base wording without claiming a level for an unrecognised year group", async () => {
    mockClass("Nursery");
    const markup = await renderPrint("leaves-and-their-trees");
    expect(markup).toContain(BASE_LINE);
    expect(markup).not.toContain("Reception");
  });

  it("prints base wording signed out", async () => {
    mockSignedOut();
    const markup = await renderPrint("leaves-and-their-trees");
    expect(markup).toContain(BASE_LINE);
  });
});

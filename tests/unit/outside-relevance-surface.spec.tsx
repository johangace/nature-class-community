import type { ConditionKind } from "@/schema/pack";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getOutsideBrief = vi.hoisted(() => vi.fn());
const findSession = vi.hoisted(() => vi.fn());

vi.mock("@/lib/outside/brief", () => ({ getOutsideBrief }));
vi.mock("@/lib/pack", () => ({
  findSession,
  leadPack: () => ({ sessions: [] }),
}));
vi.mock("@/lib/teacher", () => ({
  getActiveClassLocation: vi.fn().mockResolvedValue({ lat: 51.54, lng: -0.1 }),
  getTeacher: vi.fn().mockResolvedValue({ id: "teacher-1" }),
}));
vi.mock("@/app/AppNav", () => ({ AppNav: () => null }));

import OutsidePage from "@/app/outside/page";
import type { CastMember } from "@/lib/cast/member";

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

const session = {
  id: "summer-w1-counting-life",
  title: "Counting life",
  topicTags: ["minibeasts", "plants", "senses"],
  conditionNotes: [{ when: ["windy"] as ConditionKind[], teacher: "Begin with looking along a sheltered edge; move the listening round there once the class has counted." }],
};

function member(commonName: string, honestyTier: "recorded" | "regional"): CastMember {
  return {
    commonName,
    scientificName: null,
    photoUrl: `https://example.invalid/${commonName.toLowerCase().replaceAll(" ", "-")}.jpg`,
    photoRole: honestyTier === "recorded" ? "observation" : "taxon-reference",
    photoAttribution: "A photographer",
    photoLicense: "cc-by",
    photoSourceUrl: "https://example.invalid/source",
    iconicTaxon: honestyTier === "recorded" ? "Insecta" : "Plantae",
    honestyTier,
    lastSeenWindow: honestyTier === "recorded" ? 14 : null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: honestyTier === "recorded" ? 0 : 1,
    absent: false,
    line:
      honestyTier === "recorded"
        ? "Listen for brief repeated chirrups."
        : "Compare green, red and black fruit on one cane.",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findSession.mockReturnValue({ pack: { id: "summer" }, session });
  getOutsideBrief.mockResolvedValue({
    scope: "school",
    className: "Willow class",
    school: "Canonbury Primary",
    condition: { state: "wind", adjustment: "Stay clear of the big trees." },
    conditionKind: "windy",
    read: "Clouds are moving quickly and the ground is dry underfoot.",
    temperature: "20°C",
    sky: "a cloudy sky · a strong breeze",
    facts: [
      { label: "sunset", value: "8:04 pm" },
      { label: "moon", value: "87% lit" },
      { label: "ground", value: "dry underfoot" },
    ],
    upcoming: null,
    seen: [member("Field grasshopper", "recorded")],
    around: [member("Rock Dove", "regional")],
    absences: [],
    lookForMembers: [
      {
        ...member("Blackberry", "regional"),
        photoUrl: "https://example.invalid/blackberry-reference.jpg",
        photoAttribution: "Reference photographer",
        photoCreator: "Reference photographer",
        photoSourceUrl: "https://example.invalid/blackberry-reference",
      },
    ],
    lookFors: [
      {
        id: "blackberry",
        species: "Blackberry",
        note: "Compare green, red and black fruit on the same cane.",
      },
      {
        id: "open-sky",
        species: "Common swift",
        note: "Give the class one quiet minute to scan the open sky.",
      },
    ],
    context: {
      lessonId: session.id,
      lessonTitle: session.title,
      line: session.conditionNotes[0]!.teacher,
      source: "lesson.conditionNotes",
    },
    quietWord: null,
  });
});

async function renderOutside() {
  const page = await OutsidePage({
    searchParams: Promise.resolve({ locale: "uk", session: session.id }),
  });
  return renderToStaticMarkup(page);
}

describe("the production Outside relevance hierarchy", () => {
  it("uses the session in the URL to compose the same lesson-specific brief", async () => {
    await renderOutside();

    expect(findSession).toHaveBeenCalledWith(session.id);
    expect(getOutsideBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        session,
        topicTags: session.topicTags,
        locale: "uk",
      })
    );
  });

  it("reads day, consequence, pictured prompts, then separate evidence tiers", async () => {
    const html = await renderOutside();
    const day = html.indexOf("Weather and daylight");
    const context = html.indexOf("Lesson notes: Counting life");
    const look = html.indexOf("Seasonal highlights");
    const seen = html.indexOf("Seen near your school lately");
    const around = html.indexOf("Usually around here now");

    expect(day).toBeGreaterThan(-1);
    expect(day).toBeLessThan(context);
    expect(context).toBeLessThan(look);
    expect(look).toBeLessThan(seen);
    expect(seen).toBeLessThan(around);
    expect(html).toContain(session.conditionNotes[0]!.teacher);
  });

  it("caps seasonal highlights at eight and omits the investigation references", async () => {
    const brief = await getOutsideBrief();
    getOutsideBrief.mockResolvedValue({
      ...brief,
      lookFors: Array.from({ length: 12 }, (_, index) => ({
        id: `highlight-${index}`,
        species: `Seasonal species ${index + 1}`,
        note: `Seasonal note ${index + 1}`,
      })),
      teacherReferences: [{
        id: "past-record",
        title: "Past record: Bufo bufo",
        detail: "A published occurrence record",
        scope: "Historical sample",
        date: "2025-09-22",
        attribution: "GBIF occurrence",
        links: [],
      }],
    });
    const html = await renderOutside();
    expect(html.match(/class="brief-lookfor-species"/g)).toHaveLength(8);
    expect(html).toContain("Seasonal species 8");
    expect(html).not.toContain("Seasonal species 9");
    expect(html).not.toContain("References for your investigation");
    expect(html).not.toContain("Past record: Bufo bufo");
  });

  it("shows a look-for reference picture without depending on a recent cast match", async () => {
    const html = await renderOutside();

    expect(html).toContain("brief-lookfor-picture");
    expect(html).toContain("blackberry-reference.jpg");
    expect(html).toContain("Reference photographer");
    expect(html).toContain("Blackberry");
    expect(html).toContain("Common swift");
    expect(html).toContain("Give the class one quiet minute");
  });
});

describe("the approved image balance", () => {
  it("uses landscape imagery for prompts and species while keeping credits quiet", () => {
    expect(css).toMatch(
      /\.brief-lookfor-picture\s+\.cast-tile-plate\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/s
    );
    expect(css).toMatch(
      /\.brief-faces\s+\.cast-portrait\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/s
    );
    expect(css).toMatch(
      /\.brief-faces\s+\.photo-credit\s*\{[^}]*color:\s*var\(--ink-3\)/s
    );
    expect(css).toContain(
      ".brief-faces {\n    grid-template-columns: 1fr;"
    );
  });
});

import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { StartFlow } from "@/app/start/StartFlow";
import { autocompletePlace, autocompleteResults } from "@/lib/outside/autocomplete";
import { bandForYearGroup } from "@/lib/ability";
import { AGE_RANGES } from "@/app/start/vocab";

vi.mock("@/app/start/actions", () => ({ createClassFromFlow: vi.fn(), finishStartFlow: vi.fn() }));
vi.mock("@/app/start/try-actions", () => ({ rememberTryPlace: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const shelf = { sessionCount: 0, firstTitle: "", packTitle: "" };
const payload = { features: [{ geometry: { coordinates: [-0.27341, 51.44251] },
  properties: { osm_id: 12, osm_type: "W", name: "Richmond Park", city: "London", country: "United Kingdom" } }] };

describe("approved short onboarding", () => {
  it("puts School first and lets a group continue without inventing a name", () => {
    const html = renderToStaticMarkup(<StartFlow shelf={shelf} />);
    expect(html.indexOf(">School<")).toBeLessThan(html.indexOf(">My family<"));
    expect(html.indexOf(">My family<")).toBeLessThan(html.indexOf(">Other group<"));
    expect(html).toContain("Group name (optional)");
    expect(html).toContain(">Continue</button>");
    expect(html).not.toContain("disabled");
    for (const range of AGE_RANGES) expect(html).toContain(`>${range}<`);
  });
  it("does not interpret ages as a lesson ability band", () => {
    for (const range of AGE_RANGES) expect(bandForYearGroup(range)).toBeNull();
    expect(bandForYearGroup("Year 1")).toBe("y1");
  });
  it("retains inline map confirmation for a resumed place without another naming field", () => {
    const html = renderToStaticMarkup(<StartFlow shelf={shelf} resume={{
      classId: "one", name: "Family", yearGroup: "", school: "Richmond Park",
      groupType: "family", ageRange: "7–9", lat: 51.443, lng: -0.273,
    }} />);
    expect(html).toContain("Where will you use it?");
    expect(html).toContain("Location selected");
    expect(html).toContain("Show activities");
    expect(html).not.toContain('id="start-school"');
    expect(html).toContain("start-located-map");
  });
});

describe("autocomplete provider", () => {
  it("keeps disambiguating place labels and rounds coordinates", () => {
    expect(autocompleteResults(payload)).toEqual([{ id: "W:12",
      label: "Richmond Park, London, United Kingdom", lat: 51.443, lng: -0.273 }]);
    expect(autocompleteResults({ features: [{ geometry: { coordinates: [999, 51] }, properties: { name: "Bad" } }] })).toEqual([]);
    expect(() => autocompleteResults({ error: "unavailable" })).toThrow();
  });
  it("uses Photon for suggestions and caches repeated queries", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload)));
    vi.stubGlobal("fetch", fetcher);
    await autocompletePlace("Richmond test park");
    await autocompletePlace("  RICHMOND test park ");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]![0])).toContain("photon.komoot.io/api/");
    expect(String(fetcher.mock.calls[0]![0])).not.toContain("nominatim");
  });
});

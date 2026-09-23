import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlaceMap } from "@/app/place/PlaceMap";

/**
 * THE MAP THE COHORT ASKED FOR IS ON THE PAGE THE COHORT LANDED ON (#876, #875).
 *
 * "Set the location" on Today sends a teacher to /classes. That card is now
 * where a set position is drawn back to her, so the page that "forgot all my
 * info" is the page that shows her what it knows.
 */

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

describe("PlaceMap", () => {
  const html = renderToStaticMarkup(
    <PlaceMap lat={51.50741} lng={-0.12785} label="St Mary's Primary" />
  );

  it("draws tiles around the point and names the place for a screen reader", () => {
    expect((html.match(/<img /g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(html).toContain('aria-label="Map around St Mary&#x27;s Primary"');
    expect(html).toContain('role="img"');
  });

  it("shows a ring, not a pin, and says how coarse the position is", () => {
    expect(html).toContain("place-map-ring");
    expect(html).toContain("somewhere in the ring, about 100 metres across");
  });

  it("credits the map data", () => {
    expect(html).toContain("OpenStreetMap contributors");
    expect(html).toContain("openstreetmap.org/copyright");
  });

  it("ships no client JavaScript", () => {
    expect(read("app/place/PlaceMap.tsx")).not.toContain('"use client"');
  });

  it("prints no em dash", () => {
    expect(html).not.toContain("—");
  });
});

describe("the map is drawn once per place, compact, beside its text (#913)", () => {
  const page = read("app/classes/page.tsx");

  it("mounts PlaceMap in the shared place block, only when there are coordinates", () => {
    expect(page.match(/<PlaceMap/g)).toHaveLength(1);
    expect(page).toMatch(/hasLocation\s*&&[\s\S]{0,400}<PlaceMap\s+compact/);
    expect(page).toMatch(/<PlaceMap[\s\S]{0,300}label=\{place\.name\}/);
  });

  it("keeps the attribution in the card's text, not under the thumbnail", () => {
    expect(read("app/place/PlaceMap.tsx")).toMatch(/\{!compact && \([\s\S]{0,80}<figcaption/);
    expect(page).toContain("MAP_ATTRIBUTION_HREF");
  });
});

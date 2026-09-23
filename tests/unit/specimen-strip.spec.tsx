import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SpecimenStrip } from "@/app/SpecimenStrip";
import type { DisplayPhotoAsset } from "@/lib/cast/member";

/**
 * What the species door actually prints (#984).
 *
 * The chain tests in species-gallery.spec.ts hold that the pictures survive
 * from payload to member. These hold the thing a teacher sees: two claims,
 * two headings, and no picture shown twice.
 */

const near = (id: number): DisplayPhotoAsset => ({
  url: `https://inaturalist-open-data.s3.amazonaws.com/photos/${id}/large.jpg`,
  role: "observation",
  creator: "Martha K.",
  attribution: "(c) Martha K., some rights reserved (CC BY)",
  license: "cc-by",
  sourceUrl: `https://www.inaturalist.org/photos/${id}`,
});

const elsewhere = (id: number): DisplayPhotoAsset => ({
  url: `https://static.inaturalist.org/photos/${id}/medium.jpg`,
  role: "taxon-reference",
  creator: "Reference Photographer",
  attribution: "(c) Reference Photographer, some rights reserved (CC BY-NC)",
  license: "cc-by-nc",
  sourceUrl: `https://www.inaturalist.org/photos/${id}`,
});

const render = (photos: DisplayPhotoAsset[]) =>
  renderToStaticMarkup(<SpecimenStrip photos={photos} commonName="Honey bee" />);

describe("the specimen strip", () => {
  it("renders nothing at all for the ordinary one-picture member", () => {
    // Most members are this. A heading over an empty row reads as a broken
    // feature where no row at all reads as a page with nothing more to say.
    expect(render([near(42)])).toBe("");
    expect(render([])).toBe("");
  });

  it("drops element zero, which the hero above is already showing", () => {
    const markup = render([near(42), near(43)]);
    expect(markup).not.toContain("photos/42/large.jpg");
    expect(markup).toContain("photos/43/large.jpg");
  });

  it("keeps the two claims under two headings that cannot be cropped off", () => {
    const markup = render([near(42), near(43), elsewhere(900), elsewhere(901)]);
    expect(markup).toContain("also photographed near here");
    expect(markup).toContain("what it looks like, elsewhere");
    // Each picture sits under the heading for its own role, never pooled.
    const nearbyAt = markup.indexOf("also photographed near here");
    const elsewhereAt = markup.indexOf("what it looks like, elsewhere");
    expect(markup.indexOf("photos/43/large.jpg")).toBeGreaterThan(nearbyAt);
    expect(markup.indexOf("photos/43/large.jpg")).toBeLessThan(elsewhereAt);
    expect(markup.indexOf("photos/900/medium.jpg")).toBeGreaterThan(elsewhereAt);
  });

  it("shows only the heading a member has earned", () => {
    // A regional member has reference photographs and nothing seen here, and
    // must not print a "photographed near here" heading over them.
    const referenceOnly = render([elsewhere(900), elsewhere(901)]);
    expect(referenceOnly).not.toContain("also photographed near here");
    expect(referenceOnly).toContain("what it looks like, elsewhere");
  });

  it("carries the byline under every picture, because cc-by requires it", () => {
    const markup = render([near(42), near(43), elsewhere(900)]);
    expect(markup).toContain("Martha K.");
    expect(markup).toContain("Reference Photographer");
    expect(markup).toContain("CC BY-NC");
    expect(markup).toContain("https://www.inaturalist.org/photos/900");
  });

  it("names the species and its role in the alt text", () => {
    const markup = render([near(42), elsewhere(900)]);
    expect(markup).toContain("Honey bee, photographed elsewhere");
  });
});

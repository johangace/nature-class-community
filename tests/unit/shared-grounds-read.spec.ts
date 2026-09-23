import { describe, expect, it } from "vitest";
import { groundsPlaceForClass } from "@/lib/grounds";

const legacy = {
  school: "Legacy School",
  lat: 1,
  lng: 2,
  climate: "oceanic",
  grounds: ["playground"],
  siteFeatures: ["planters"],
  siteNotes: ["legacy note"],
  reach: "school-grounds",
  placeRead: { source: "legacy" },
  placeReadAt: new Date("2026-08-01T00:00:00Z"),
};

describe("Grounds read boundary", () => {
  it("prefers the reusable Grounds record over legacy class columns", () => {
    const place = groundsPlaceForClass({
      ...legacy,
      groundsProfile: {
        id: "shared",
        name: "Main grounds",
        school: "Shared School",
        lat: 3,
        lng: 4,
        climate: "continental",
        habitats: ["trees"],
        siteFeatures: ["pond"],
        siteNotes: ["shared note"],
        reach: "whole-site",
        placeRead: { source: "shared" },
        placeReadAt: new Date("2026-09-01T00:00:00Z"),
      },
    });

    expect(place).toMatchObject({
      id: "shared",
      name: "Main grounds",
      school: "Shared School",
      lat: 3,
      habitats: ["trees"],
      siteFeatures: ["pond"],
      source: "shared",
    });
  });

  it("falls back losslessly during the additive migration window", () => {
    expect(groundsPlaceForClass({ ...legacy, groundsProfile: null })).toMatchObject({
      id: null,
      name: "Legacy School",
      habitats: ["playground"],
      siteFeatures: ["planters"],
      source: "legacy",
    });
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_CLIMATE, resolveClimate } from "@/lib/outside/climate";
import { resolvePhenologyRegion, resolveRegion } from "@/lib/outside/regions";

/**
 * The climate tag, and the one thing it exists to fix.
 *
 * The 15-region coordinate map sorts by continent and longitude band, which
 * puts Phoenix in the same bucket as Denver. A Sonoran desert school then reads
 * a Rocky-mountain calendar: elk, quaking aspen, prairie grasses. The climate
 * tag is what stops that, and the Phoenix case below is the regression guard —
 * it asserts the specific wrong answer is gone, not merely that some answer
 * exists.
 */

describe("climate classifier", () => {
  it("names the four evaluation climates", () => {
    // The four cities the cast recipe was evaluated against on #167.
    expect(resolveClimate(33.448, -112.074)).toBe("arid"); // Phoenix, Sonoran desert
    expect(resolveClimate(25.761, -80.191)).toBe("tropical"); // Miami, south Florida
    expect(resolveClimate(51.507, -0.127)).toBe("oceanic"); // London, lowland Britain
    expect(resolveClimate(37.871, -122.272)).toBe("mediterranean"); // Berkeley, California
  });

  it("separates places the region map lumps together", () => {
    // Phoenix and Denver share a longitude band and a region id; their climates
    // are the whole reason the tag exists.
    expect(resolveClimate(33.448, -112.074)).toBe("arid"); // Phoenix
    expect(resolveClimate(39.739, -104.99)).toBe("arid"); // Denver is dry too,
    // but the region correction below is what actually separates their reads.

    // Miami and Atlanta both sit in us-southeast; only one has no real winter.
    expect(resolveClimate(25.761, -80.191)).toBe("tropical"); // Miami
    expect(resolveClimate(33.749, -84.388)).toBe("subtropical"); // Atlanta
  });

  it("falls back to the demo default when there are no coordinates", () => {
    expect(resolveClimate(null, null)).toBe(DEFAULT_CLIMATE);
    expect(resolveClimate(undefined, undefined)).toBe(DEFAULT_CLIMATE);
    expect(resolveClimate(Number.NaN, 0)).toBe(DEFAULT_CLIMATE);
  });

  it("is total: every coordinate resolves to something", () => {
    for (const lat of [-80, -45, -10, 0, 10, 45, 80]) {
      for (const lng of [-179, -100, -20, 0, 20, 100, 179]) {
        expect(typeof resolveClimate(lat, lng)).toBe("string");
      }
    }
  });
});

describe("phenology region, corrected by climate", () => {
  it("GUARDS #167: Phoenix stops reading mountain-west expectations", () => {
    const phoenix = { lat: 33.448, lng: -112.074 };

    // The coordinate box map on its own gives the wrong answer. This is the
    // bug, asserted so the fix cannot silently regress into it.
    expect(resolveRegion(phoenix.lat, phoenix.lng)).toBe("us-mountain-west");

    // With the climate tag, the desert school reads a hot-and-dry calendar
    // instead of a Rocky-mountain one.
    const corrected = resolvePhenologyRegion(
      phoenix.lat,
      phoenix.lng,
      resolveClimate(phoenix.lat, phoenix.lng)
    );
    expect(corrected).not.toBe("us-mountain-west");
    expect(corrected).toBe("us-south-central");
  });

  it("leaves a region alone when the box map and the climate agree", () => {
    // Berkeley's box answer was already right; the tag must not move it.
    const berkeley = { lat: 37.871, lng: -122.272 };
    expect(resolveRegion(berkeley.lat, berkeley.lng)).toBe("us-california");
    expect(
      resolvePhenologyRegion(berkeley.lat, berkeley.lng, resolveClimate(berkeley.lat, berkeley.lng))
    ).toBe("us-california");

    // As was London's.
    const london = { lat: 51.507, lng: -0.127 };
    expect(
      resolvePhenologyRegion(london.lat, london.lng, resolveClimate(london.lat, london.lng))
    ).toBe("uk-south");
  });

  it("does not apply a North American correction outside North America", () => {
    // Almeria, Spain is genuinely arid, but the correction table was written
    // about the US southwest. Guessing beyond its evidence is what this stops.
    const almeria = { lat: 36.84, lng: -2.46 };
    const boxed = resolveRegion(almeria.lat, almeria.lng);
    expect(resolvePhenologyRegion(almeria.lat, almeria.lng, "arid")).toBe(boxed);
  });

  it("is a no-op without a climate tag, so an untagged class reads as it always did", () => {
    for (const [lat, lng] of [
      [33.448, -112.074],
      [51.507, -0.127],
      [25.761, -80.191],
    ] as const) {
      expect(resolvePhenologyRegion(lat, lng, null)).toBe(resolveRegion(lat, lng));
    }
  });
});

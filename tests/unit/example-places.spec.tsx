import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXAMPLE_PLACES,
  examplePlaceAt,
  examplePlaceBySlug,
  exampleTryPlace,
} from "@/lib/example-places";
import { parseTryPlace, roundTryPlace, serializeTryPlace } from "@/lib/try-place";

/**
 * NAMED EXAMPLE PLACES (#877, third slice).
 *
 * Cohort reviewer 2 asked for "a few example locations". Johan's own note on
 * the ticket, and the 2026-09-13 content-lane pass after it, left the same
 * residue: named example locations with a live read for each, a US one first.
 * These tests hold the two things that make it honest — the coordinates are
 * the ones recorded reads were taken at, and no surface calls an example
 * patch the visitor's own school.
 */

/** The three, by name, so a test never indexes past the end of the list. */
const berkeley = examplePlaceBySlug("berkeley-ca")!;
const phoenix = examplePlaceBySlug("phoenix-az")!;
const canonbury = examplePlaceBySlug("canonbury-london")!;

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const fixtureCoordinate = (path: string): { lat: number; lng: number } => {
  const payload = JSON.parse(read(path)) as {
    axes: { place: { coordinate: { lat: number; lng: number } } };
  };
  // The coordinate carries provenance of its own; the pair is what we took.
  const { lat, lng } = payload.axes.place.coordinate;
  return { lat, lng };
};

describe("the named example places", () => {
  it("offers three, a US one first, each saying what it shows", () => {
    expect(EXAMPLE_PLACES).toHaveLength(3);
    expect(EXAMPLE_PLACES[0]?.name).toBe("Berkeley, California");
    expect(EXAMPLE_PLACES.map((place) => place.slug)).toEqual([
      "berkeley-ca",
      "phoenix-az",
      "canonbury-london",
    ]);
    for (const place of EXAMPLE_PLACES) {
      expect(place.name.trim()).not.toBe("");
      expect(place.shows.trim()).not.toBe("");
      expect(roundTryPlace(place.lat, place.lng)).not.toBeNull();
    }
    // Range, not three versions of one place: two countries and a desert.
    expect(new Set(EXAMPLE_PLACES.map((place) => place.name)).size).toBe(3);
  });

  it("takes every coordinate from a read this repository actually recorded", () => {
    // The comment beside each pair names its fixture. This is what stops that
    // comment drifting from the number: a wrong coordinate is a TRUE reading
    // of somewhere else presented as this place, the defect #1234 removed.
    expect({ lat: berkeley.lat, lng: berkeley.lng }).toEqual(
      fixtureCoordinate("tests/fixtures/pointmoon/berkeley_ca.json")
    );
    expect({ lat: phoenix.lat, lng: phoenix.lng }).toEqual(
      fixtureCoordinate("tests/fixtures/pointmoon/phoenix_az.json")
    );
    // The third is this codebase's own sample patch, kept in one place.
    expect(read("lib/outside/pointmoon.ts")).toContain(
      `export const SAMPLE_PATCH = { lat: ${canonbury.lat}, lng: ${canonbury.lng} } as const;`
    );
  });

  it("answers to its slug and to nothing else", () => {
    expect(examplePlaceBySlug("phoenix-az")?.name).toBe("Phoenix, Arizona");
    expect(examplePlaceBySlug("PHOENIX-AZ")).toBeNull();
    expect(examplePlaceBySlug("")).toBeNull();
    expect(examplePlaceBySlug(undefined)).toBeNull();
    expect(examplePlaceBySlug({ slug: "phoenix-az" })).toBeNull();
  });

  it("is kept exactly as a visitor's own spot is: rounded, named, in her browser", () => {
    const kept = exampleTryPlace(berkeley);
    expect(kept).toEqual({ lat: 37.87, lng: -122.27, label: "Berkeley, California" });
    expect(parseTryPlace(serializeTryPlace(kept))).toEqual(kept);
  });

  it("pins the pair a visitor is actually read at, not only the recorded one", () => {
    // Raised in review of PR #1246: the test above proves where the constants
    // came from, and the product reads the ROUNDED pair. Both are pinned, so
    // the square kilometre each example serves cannot move unnoticed.
    expect(EXAMPLE_PLACES.map((place) => exampleTryPlace(place))).toEqual([
      { lat: 37.87, lng: -122.27, label: "Berkeley, California" },
      { lat: 33.45, lng: -112.07, label: "Phoenix, Arizona" },
      { lat: 51.55, lng: -0.1, label: "Canonbury, London" },
    ]);
  });

  it("recognises its own places again, and calls nobody else's an example", () => {
    expect(examplePlaceAt(exampleTryPlace(phoenix))?.slug).toBe("phoenix-az");
    // The cookie holds two decimals; the list holds the read's own precision.
    // Both are rounded before they meet, so the two never miss each other.
    expect(examplePlaceAt({ lat: phoenix.lat, lng: phoenix.lng })?.slug).toBe("phoenix-az");
    expect(examplePlaceAt({ lat: 51.55, lng: -0.31 })).toBeNull();
    expect(examplePlaceAt(null)).toBeNull();
    expect(examplePlaceAt({ lat: null, lng: null })).toBeNull();
  });
});

describe("what a visitor is told about an example", () => {
  it("names the place and says it is not hers, on the season and in the run", () => {
    const season = read("app/season/page.tsx");
    expect(season).toContain("read live for ${example.name} — an example patch, not your own.");
    expect(season).toContain("examplePlaceAt(chosen)");

    const run = read("app/run/page.tsx");
    // The whole sentence, pinned: it names the patch, says it is not hers, and
    // calls it a patch rather than a school, because nothing at these
    // coordinates is one.
    expect(run).toContain(
      "`This is an example, run live for ${name} rather than your own patch. Sign in and every reading is for your own school.`"
    );
    expect(run).toContain("examplePlaceAt(chosenPlace)");

    // And the species page, where the geocoder's own name for the point and
    // the name she picked it by are both kept rather than one being dropped.
    const outside = read("app/outside/page.tsx");
    expect(outside).toContain(
      "`Every reading on this page is for ${brief.place.name}, in ${example.name} — an example patch rather than your own. Sign in and every reading is for your own school.`"
    );
    expect(outside).toContain('brief.scope === "chosen" ? examplePlaceAt(await getTryPlace()) : null');
  });

  it("offers the examples by name on /start, instead of one unnamed skip", () => {
    const flow = read("app/start/StartFlow.tsx");
    expect(flow).toContain("EXAMPLE_PLACES.map");
    expect(flow).toContain("openExample(example.slug)");
    expect(flow).not.toContain("Skip, show me an example");
  });

  it("never seeds a teacher's class setup with an example patch", () => {
    // Raised in review of PR #1246, and real: the try-place cookie survives
    // sign-in and seeds the class flow's location step. An example she looked
    // at is not a place she told us about, so she could have saved Phoenix as
    // her school's location without ever choosing her own.
    const page = read("app/start/page.tsx");
    expect(page).toContain(
      "const rememberedOwnPlace = examplePlaceAt(remembered) ? null : remembered;"
    );
    // The signed-in flow takes the filtered one; the signed-out try screen
    // still keeps the example she is looking at across a reload.
    expect(page).toContain("remembered={rememberedOwnPlace}");
    expect(page).toContain("remembered={remembered}");
  });

  it("writes the same cookie the one question writes, and creates no row", () => {
    const actions = read("app/start/try-actions.ts");
    expect(actions).toContain("export async function openExamplePlace");
    expect(actions).toContain("keepTryPlace(exampleTryPlace(example))");
    expect(actions).toContain('redirect("/season")');
    // Nothing server-side: no prisma, no class, no teacher.
    expect(actions).not.toContain("prisma");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LessonMediaStrip } from "@/app/session/LessonMediaStrip";
import { projectLessonMedia } from "@/lib/lesson/media";
import type { Sighting } from "@/lib/outside";

const observationPhoto = {
  url: "https://inaturalist-open-data.s3.amazonaws.com/photos/42/large.jpg",
  role: "observation" as const,
  creator: "Martha K.",
  attribution: "Martha K. / iNaturalist",
  license: "cc-by" as const,
  sourceUrl: "https://www.inaturalist.org/photos/42",
  observationId: "101",
  observedAt: "2026-08-14T07:34:00.000Z",
};

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    id: "apis-mellifera",
    name: "Honey bee",
    scientificName: "Apis mellifera",
    iconicTaxon: "Insecta",
    photo: observationPhoto,
    photoUrl: observationPhoto.url,
    presence: {
      provider: "inaturalist",
      taxonId: "47219",
      observationCount: 3,
      radiusKm: 5,
      windowStart: "2026-08-08",
      windowEnd: "2026-08-15",
    },
    ...overrides,
  };
}

describe("lesson media projection", () => {
  it("keeps complete hyperlocal evidence and rejects a legacy bare URL", () => {
    const media = projectLessonMedia([
      sighting(),
      sighting({
        id: "legacy",
        name: "Legacy butterfly",
        photo: null,
        photoUrl: "https://legacy.example.test/butterfly.jpg",
      }),
    ], ["minibeasts"]);

    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({
      name: "Honey bee",
      kind: "hyperlocal",
      radiusKm: 5,
      sourceUrl: observationPhoto.sourceUrl,
    });
  });

  it("keeps a rights-complete taxon image as a reference without implying locality", () => {
    const media = projectLessonMedia([
      sighting({
        id: "field-maple",
        name: "Field maple",
        // A trees lesson now asks the genus, not just the kingdom (nc#962).
        scientificName: "Acer campestre",
        iconicTaxon: "Plantae",
        presence: null,
        photo: { ...observationPhoto, role: "taxon-reference" },
      }),
    ], ["trees"]);

    expect(media[0]).toMatchObject({ kind: "reference", radiusKm: null });
  });

  /**
   * Inventory A9. `projectLessonMedia` ranked matching taxa to the front and
   * never filtered, so a lesson about minibeasts could show a pear tree
   * whenever there were not enough matching sightings to fill the row. Ranking
   * made that rare rather than impossible, which is worse: it surfaces only at
   * thinly-recorded schools, where nobody is looking.
   *
   * The first test below FAILS on the ranking-only implementation.
   */
  it("drops a non-matching species from a lesson whose topic taxonomy can answer", () => {
    const media = projectLessonMedia(
      [
        // Distinct sourceUrls on purpose: sharing one lets the dedup drop the
        // pear and the test then passes with NO filter at all, which is how a
        // guard ends up proving nothing.
        sighting({
          id: "pear",
          name: "Pear tree",
          scientificName: "Pyrus communis",
          iconicTaxon: "Plantae",
          photo: { ...observationPhoto, sourceUrl: "https://www.inaturalist.org/photos/77" },
        }),
        sighting({ id: "bee", name: "Honey bee", iconicTaxon: "Insecta" }),
      ],
      ["minibeasts"]
    );

    expect(media.map((item) => item.name)).toEqual(["Honey bee"]);
  });

  it("shows nothing rather than something irrelevant when no nearby species matches", () => {
    const media = projectLessonMedia(
      [sighting({ id: "pear", name: "Pear tree", iconicTaxon: "Plantae" })],
      ["minibeasts"]
    );

    // Absent is a real state in the four-material system, not a gap to fill.
    expect(media).toEqual([]);
    expect(
      renderToStaticMarkup(<LessonMediaStrip items={media} heading="Near this lesson" />)
    ).toBe("");
  });

  it("does not filter a topic taxonomy cannot answer", () => {
    // ~40% of sessions are tagged seasons / senses / weather / art. Filtering
    // those on taxon would empty every one of them for no reason.
    const media = projectLessonMedia(
      [sighting({ id: "pear", name: "Pear tree", iconicTaxon: "Plantae" })],
      ["seasons"]
    );

    expect(media.map((item) => item.name)).toEqual(["Pear tree"]);
  });

  it("renders every contextual image with a clickable source and visible credit", () => {
    const media = projectLessonMedia([sighting()], ["minibeasts"]);
    const markup = renderToStaticMarkup(
      <LessonMediaStrip items={media} heading="Near this lesson" />
    );

    expect(markup).toContain("Honey bee");
    expect(markup).toContain("Recorded within 5 km");
    expect(markup).toContain(`href="${observationPhoto.sourceUrl}"`);
    expect(markup).toContain("Martha K.");
    expect(markup).toContain("CC BY");
  });
});

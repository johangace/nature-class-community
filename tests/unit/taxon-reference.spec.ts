/**
 * THE REGIONAL TIER LOOKS LIKE ITSELF, AND STILL CLAIMS NOTHING MORE (#321).
 *
 * Two things have to hold at once here, and they pull against each other:
 *
 *   1. A fire salamander must not render as a leaf. That was the bug: the
 *      regional tier carried no `iconicTaxon`, the drawn plate picks its mark
 *      by taxon, so a swallow, a spider and a salamander drew three identical
 *      sprouting seedlings on Përmet's page.
 *   2. Giving it a picture must not turn "usually around here now" into "seen
 *      near your school". A `taxon-reference` photograph says what the species
 *      looks like; it is not evidence that the animal is on the field.
 *
 * The second is the one worth guarding hardest, because it is the one that
 * fails silently and reads as an improvement.
 */

import { describe, expect, it } from "vitest";
import { resolveCast, type TaxonReferenceIndex } from "@/lib/cast/resolve";
import { castMaterial } from "@/lib/cast/member";
import type { PhenologyEntry } from "@/lib/outside/types";

const SALAMANDER: PhenologyEntry = {
  id: "western_europe_w34_fire_salamander",
  species: "Fire Salamander",
  scientificName: "Salamandra salamandra",
  description: "Active in woodland after rain",
  habitats: ["woodland"],
  senses: ["sight"],
  confidence: "high",
};

const SWALLOW: PhenologyEntry = {
  id: "western_europe_w34_barn_swallow",
  species: "Barn Swallow",
  scientificName: "Hirundo rustica",
  description: "Gathering on the wires",
  habitats: ["hedgerow"],
  senses: ["sight"],
  confidence: "high",
};

/** A season, not a species. No taxon to look up, no photograph to find. */
const AUTUMN_COLOUR: PhenologyEntry = {
  id: "uk_south_w34_autumn_colour",
  species: "Autumn Colour",
  description: "The first turn in the hedges",
  habitats: ["hedgerow"],
  senses: ["sight"],
  confidence: "high",
};

/** Shaped exactly as the generated file's entries are. */
const REFERENCES: TaxonReferenceIndex = {
  "salamandra salamandra": {
    iconicTaxon: "Amphibia",
    photo: {
      url: "https://inaturalist-open-data.s3.amazonaws.com/photos/1/large.jpg",
      role: "taxon-reference",
      creator: "carnifex",
      attribution: "(c) carnifex, some rights reserved (CC BY)",
      license: "cc-by",
      sourceUrl: "https://www.inaturalist.org/photos/1",
    },
  },
  "hirundo rustica": { iconicTaxon: "Aves" },
};

function regional(phenology: PhenologyEntry[]) {
  return resolveCast({ data: null, phenology, taxonReferences: REFERENCES }).members;
}

describe("what kind of thing it is", () => {
  it("gives a salamander an amphibian and a swallow a bird", () => {
    const [salamander, swallow] = regional([SALAMANDER, SWALLOW]);
    expect(salamander?.iconicTaxon).toBe("Amphibia");
    expect(swallow?.iconicTaxon).toBe("Aves");
    // The bug, stated as an assertion: these two must not share a mark.
    expect(salamander?.iconicTaxon).not.toBe(swallow?.iconicTaxon);
  });

  it("leaves a season without a taxon rather than inventing one", () => {
    const [autumn] = regional([AUTUMN_COLOUR]);
    expect(autumn?.iconicTaxon).toBeNull();
    expect(autumn?.photoUrl).toBeNull();
    // And it is still a complete member, not a dropped one.
    expect(autumn?.commonName).toBe("Autumn Colour");
  });
});

describe("a picture of the species is not evidence it is here", () => {
  it("keeps the regional tier when a photograph arrives", () => {
    const [salamander] = regional([SALAMANDER]);
    expect(salamander?.honestyTier).toBe("regional");
    expect(salamander?.absent).toBe(false);
    // lastSeenWindow is the "recorded near here, this recently" field. A
    // reference photo must never fill it.
    expect(salamander?.lastSeenWindow).toBeNull();
    expect(salamander?.yearsObserved).toBeNull();
  });

  it("carries the role that keeps the two claims apart", () => {
    const [salamander] = regional([SALAMANDER]);
    expect(salamander?.photoRole).toBe("taxon-reference");
    expect(salamander?.photoLicense).toBe("cc-by");
    expect(salamander?.photoCreator).toBe("carnifex");
    expect(salamander?.photoSourceUrl).toBe("https://www.inaturalist.org/photos/1");
  });

  it("renders in the paper-frame material, never full bleed", () => {
    // This is the assertion that stops the change becoming an upgrade. "seen"
    // is the full-fidelity treatment reserved for a photograph taken near this
    // school; a regional member must land on "regional", whose frame reads as
    // a different claim in greyscale and through a photocopier.
    const [salamander] = regional([SALAMANDER]);
    expect(castMaterial(salamander!)).toBe("regional");
    expect(castMaterial(salamander!)).not.toBe("seen");
  });

  it("still shows a plate when the reference has no releasable photograph", () => {
    // Hirundo rustica is in the index with a taxon and no photo, which is the
    // ordinary outcome when nothing passed the licence gate. It gets the right
    // mark and no picture, rather than an unlicensed one.
    const [swallow] = regional([SWALLOW]);
    expect(swallow?.iconicTaxon).toBe("Aves");
    expect(swallow?.photoUrl).toBeNull();
    expect(castMaterial(swallow!)).toBe("plate");
  });
});

describe("the file is optional", () => {
  it("resolves exactly as it always did when no reference is passed", () => {
    // Every existing caller, and every recorded fixture in the replay corpus,
    // omits this. They must get an identical cast.
    const [salamander] = resolveCast({ data: null, phenology: [SALAMANDER] }).members;
    expect(salamander?.iconicTaxon).toBeNull();
    expect(salamander?.photoUrl).toBeNull();
    expect(salamander?.honestyTier).toBe("regional");
  });
});

/**
 * THE PLATE IS NOT AN EMPTY FRAME (#250, #304).
 *
 * The component's docstring named the thing it existed to prevent — "the grey
 * box we swore never to ship, arriving by the back door" — and then rendered
 * one: a rectangle, two rules, four corner ticks and nothing inside. Every
 * species without a releasable photograph was an empty bordered box captioned
 * "drawn, not photographed", which is what Johan was looking at on 17 August
 * when he said the new prototype was broken and a worse experience than the
 * old one.
 *
 * These assertions are about REACH into the markup rather than about how the
 * drawing looks, because "does it look like a bird" is a judgement and "is
 * there anything in the frame at all" is a fact. The second one is what was
 * wrong.
 */

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FieldGuidePlate } from "@/app/FieldGuidePlate";

function markup(node: React.ReactElement): string {
  return renderToStaticMarkup(node);
}

/** Every `d` attribute drawn inside the plate. */
function paths(html: string): string[] {
  // The `?? ""` is not defensive noise: under `noUncheckedIndexedAccess` a
  // capture group is `string | undefined`, and CI typechecks the tests where
  // `next build` does not.
  return [...html.matchAll(/ d="([^"]+)"/g)].map((m) => m[1] ?? "");
}

/** The mark alone, which is the part that was missing. */
function mark(html: string): string | null {
  return html.match(/class="cast-plate-mark" d="([^"]+)"/)?.[1] ?? null;
}

describe("the plate always carries a drawing", () => {
  it("draws a mark, not just a frame", () => {
    const html = markup(<FieldGuidePlate name="Eurasian Coot" iconicTaxon="Aves" />);
    const drawn = mark(html);
    expect(drawn).not.toBeNull();
    // A real path, not a stub. The frame's own rules are 12 characters long.
    expect(drawn!.length).toBeGreaterThan(60);
  });

  it("draws a mark in the compact circle too, where the frame is hidden", () => {
    // The circle is the size the strip and the sighting row render at, and it
    // is where an empty plate was most visible: a 72px ring with nothing in it.
    const html = markup(
      <FieldGuidePlate name="Red Admiral" iconicTaxon="Insecta" compact />
    );
    expect(mark(html)).not.toBeNull();
  });

  it("draws a different mark for a bird than for an insect", () => {
    // The honesty rule: one mark per KIND of living thing, never per species.
    // If every taxon collapsed to one shape the plate would be back to saying
    // nothing, just with more path data.
    const bird = mark(markup(<FieldGuidePlate name="Jay" iconicTaxon="Aves" />));
    const insect = mark(markup(<FieldGuidePlate name="Bee" iconicTaxon="Insecta" />));
    const plant = mark(markup(<FieldGuidePlate name="Borage" iconicTaxon="Plantae" />));
    expect(new Set([bird, insect, plant]).size).toBe(3);
  });

  it("covers every iconic taxon Pointmoon returned in a live read", () => {
    // Read off the recorded London payload rather than guessed: these are the
    // taxa actually served. A taxon with no mark falls back to the leaf, which
    // is honest but silently loses the distinction, so the fallback must never
    // be reached for a taxon we really receive.
    const served = ["Aves", "Insecta", "Plantae", "Arachnida"];
    const leaf = mark(markup(<FieldGuidePlate name="x" iconicTaxon="Plantae" />));
    for (const taxon of served.filter((t) => t !== "Plantae")) {
      expect(mark(markup(<FieldGuidePlate name="x" iconicTaxon={taxon} />))).not.toBe(leaf);
    }
  });

  it("falls back to the leaf for a regional member with no taxon", () => {
    // The phenology tier carries no iconicTaxon at all. That must render a
    // drawing, not an empty frame, because on a day-one card EVERY member is
    // regional and this is the whole surface.
    const html = markup(<FieldGuidePlate name="Apple" iconicTaxon={null} />);
    expect(mark(html)).not.toBeNull();
    expect(mark(html)).toBe(mark(markup(<FieldGuidePlate name="x" iconicTaxon="Plantae" />)));
  });

  it("keeps saying which it is, in words, on the full plate", () => {
    const html = markup(<FieldGuidePlate name="Apple" />);
    expect(html).toContain("drawn, not photographed");
    expect(html).toContain("Apple");
  });

  it("says nothing in the circle, where the name is already beside it", () => {
    const html = markup(<FieldGuidePlate name="Apple" compact />);
    expect(html).not.toContain("drawn, not photographed");
  });

  it("never fills a mark: this is line-work on paper, not a logo", () => {
    const html = markup(<FieldGuidePlate name="Coot" iconicTaxon="Aves" />);
    expect(html).not.toContain("fill=");
    // And every path is real geometry rather than an empty attribute.
    expect(paths(html).every((d) => d.trim().length > 0)).toBe(true);
  });
});

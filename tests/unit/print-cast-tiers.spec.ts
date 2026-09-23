import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CastCards, MayMeetStrip } from "@/app/print/CastCards";
import type { CastMember } from "@/lib/cast/read";

/**
 * Print-tier rendering (#172 workstream B, stage 8), extending the #165 spine.
 *
 * The printed cast card is the end of the honesty chain and the least
 * forgiving link in it. On screen a tier can be carried by a tint; on a school
 * printer there is one ink, the toner is low, and the sheet gets photocopied
 * thirty times. If the three tiers collapse into each other on paper, a child
 * cutting out cards cannot tell "we have seen this near school" from "we are
 * hoping to", and the whole cast contract stops at the printer.
 *
 * So these tests assert two things the visual review cannot:
 *   1. the three tiers render as three DIFFERENT things in the markup;
 *   2. the CSS that distinguishes them uses border and pattern, never colour
 *      or grey fill, so the difference survives a bad photocopy.
 */

function member(over: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Honey bee",
    scientificName: "Apis mellifera",
    photoUrl: "https://example.test/bee.jpg",
    photoRole: "observation",
    photoAttribution: "A. Observer",
    photoLicense: "cc-by",
    photoSourceUrl: "https://example.test/observations/1",
    iconicTaxon: "Insecta",
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "Seen near here lately.",
    ...over,
  };
}

const render = (members: CastMember[], located = true) =>
  renderToStaticMarkup(
    createElement(CastCards, { members, located, readOn: "Tuesday 11 August" })
  );

describe("the three tiers are three different cards", () => {
  it("gives each tier its own class, so the CSS can distinguish them", () => {
    const markup = render([
      member({ commonName: "Honey bee", scientificName: "Apis mellifera" }),
      member({
        commonName: "Earthworm",
        scientificName: "Lumbricus terrestris",
        honestyTier: "regional",
      }),
      member({
        commonName: "Desert spiny lizard",
        scientificName: "Sceloporus magister",
        absent: true,
      }),
    ]);

    expect(markup).toContain("print-card-seen");
    expect(markup).toContain("print-card-regional");
    expect(markup).toContain("print-card-absent");
  });

  it("prints the tier in words as well, for the child who asks why", () => {
    const markup = render([
      member(),
      member({ commonName: "Earthworm", scientificName: "L. terrestris", honestyTier: "regional" }),
      member({ commonName: "Lizard", scientificName: "S. magister", absent: true }),
    ]);

    expect(markup).toContain("recorded nearby");
    expect(markup).toContain("around the region");
    expect(markup).toContain("not seen yet");
  });

  it("never prints a regional or absent card as seen", () => {
    const regional = render([
      member({ honestyTier: "regional", commonName: "Earthworm", scientificName: "L. t." }),
    ]);
    expect(regional).toContain("print-card-regional");
    expect(regional).not.toContain("print-card-seen");
  });
});

describe("a thin cast prints fewer cards, never invented ones", () => {
  it("prints exactly what it was given", () => {
    const one = render([member()]);
    expect(one.match(/class="print-card print-card-/g) ?? []).toHaveLength(1);
  });

  it("renders NOTHING at all for an empty cast", () => {
    // Not an empty section, not a heading, not a row of blank cut-outs. The
    // sheet is simply the sheet it always was.
    expect(render([])).toBe("");
    expect(renderToStaticMarkup(createElement(MayMeetStrip, { members: [] }))).toBe("");
  });

  it("caps the sheet rather than overflowing it", () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      member({ commonName: `Species ${i}`, scientificName: `Genus sp${i}` })
    );
    expect((render(many).match(/class="print-card print-card-/g) ?? []).length).toBe(6);
  });

  it("does not claim a school it has no coordinates for", () => {
    expect(render([member()], false)).not.toContain("our school");
    expect(render([member()], true)).not.toContain("our school");
  });
});

describe("no photograph is a place to draw, never a stand-in image", () => {
  it("offers the child the frame instead of a picture we do not have", () => {
    const markup = render([
      member({ photoUrl: null, honestyTier: "regional", commonName: "Garden snail", scientificName: "Cornu aspersum" }),
    ]);
    expect(markup).toContain("draw it here");
    expect(markup).not.toContain("<img");
  });
});

describe("the teacher's strip is names, and the safety note when there is one", () => {
  it("lists names with their tier", () => {
    const markup = renderToStaticMarkup(
      createElement(MayMeetStrip, { members: [member(), member({ commonName: "Magpie", scientificName: "Pica pica", honestyTier: "regional" })] })
    );
    expect(markup).toContain("Honey bee");
    expect(markup).toContain("Magpie");
    expect(markup).toContain("around the region");
  });

  it("carries look-don't-touch onto paper, because she may have no device", () => {
    const markup = renderToStaticMarkup(
      createElement(MayMeetStrip, {
        members: [
          member({
            commonName: "Oriental hornet",
            scientificName: "Vespa orientalis",
            safetyNote: "If you see one, we watch it and let it be.",
          }),
        ],
      })
    );
    expect(markup).toContain("we watch it and let it be");
  });

  it("does not print a safety note for the ordinary majority", () => {
    const markup = renderToStaticMarkup(createElement(MayMeetStrip, { members: [member()] }));
    expect(markup).not.toContain("print-maymeet-safe");
  });
});

/**
 * The CSS half. Asserting on a stylesheet is unusual and is the point: the
 * thing that makes a tier legible on paper is a border and a hatch, and a
 * well-meaning later change to "just tint them" would pass every markup test
 * above while silently breaking the sheet on a real printer.
 */
describe("the CSS distinguishes tiers by line, not by colour", () => {
  const css = readFileSync(
    new URL("../../app/globals.css", import.meta.url),
    "utf8"
  );

  /**
   * The tier treatments deliberately live OUTSIDE @media print.
   *
   * They used to be inside it, and this test used to assert that. QA caught
   * why it was wrong: /print is a browsable page as well as a printable one,
   * and print-only frames meant the three honesty tiers were invisible on
   * screen — on a projector, at the front of a classroom. The frames ARE the
   * tiers, so they belong wherever both media can see them.
   *
   * The invariant this test exists for is unchanged and is the important
   * half: the tiers are told apart by LINE AND PATTERN, never by colour or
   * grey fill, because a 15% grey and a 25% grey are the same colour after two
   * photocopies. Only the assertion about WHERE the rules live has moved.
   */
  const tiers = css.slice(css.indexOf(".print-card-seen"));

  it("gives all three tiers a treatment", () => {
    expect(css).toContain(".print-card-seen");
    expect(css).toContain(".print-card-regional");
    expect(css).toContain(".print-card-absent");
  });

  it("tells them apart by line weight and pattern", () => {
    const regional = tiers.slice(tiers.indexOf(".print-card-regional"));
    expect(regional.slice(0, 220)).toMatch(/outline/);

    const absent = tiers.slice(tiers.indexOf(".print-card-absent"));
    expect(absent.slice(0, 340)).toMatch(/dashed/);
    expect(absent.slice(0, 340)).toMatch(/repeating-linear-gradient/);
  });

  it("uses black ink, with no grey fills to collapse in a photocopy", () => {
    const cardRules = css.slice(css.indexOf(".print-cast"));
    expect(cardRules).not.toMatch(/\.print-card[^{]*\{[^}]*opacity/);
    expect(cardRules).not.toMatch(/background:\s*#(9|a|b|c|d)[0-9a-f]{2}\b/i);
  });
});

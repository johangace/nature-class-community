import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CastFace } from "@/app/CastFace";
import { kindCaption } from "@/engine/icons";
import type { CastMember } from "@/lib/cast/member";

/** The three fails-the-truth blockers from the final production walk. */

const journey = readFileSync(
  new URL("../../app/run/HybridJourney.tsx", import.meta.url),
  "utf8"
);

/**
 * Source with its comments removed, so a check for what the CODE does cannot
 * be satisfied by a comment that merely mentions the thing being checked for
 * (mirrors the same helper in completion-before-reflection-contract.spec.ts).
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
}

function member(over: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Monarch",
    scientificName: "Danaus plexippus",
    photoUrl: "https://example.test/m.jpg",
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
    line: "",
    ...over,
  };
}

describe("blocker: the eyebrow claimed the sky over a line about spiders", () => {
  it("labels the block for what it always is, not for one thing it sometimes carries", () => {
    expect(kindCaption["conditions-line"]).toBe("look around");
    expect(kindCaption["conditions-line"]).not.toContain("sky");
  });
});

describe("blocker: the strip captioned photographed species as drawings", () => {
  const photographed = renderToStaticMarkup(createElement(CastFace, { member: member() }));
  const noPhoto = renderToStaticMarkup(
    createElement(CastFace, { member: member({ photoUrl: null, honestyTier: "regional" }) })
  );

  it("never calls a real photograph a drawing", () => {
    expect(photographed).not.toContain("drawn, not photographed");
    expect(photographed).toContain("cast-portrait-seen");
  });

  it("still says it plainly when the plate IS the picture", () => {
    expect(noPhoto).toContain("drawn, not photographed");
    expect(noPhoto).toContain("cast-portrait-plate");
  });

  it("keeps the wordless plate underneath as the broken-image floor", () => {
    // #194's fallback survives: the frame is still drawn under the photo.
    expect(photographed).toContain("cast-plate");
    expect(photographed).toContain("cast-plate-compact");
  });
});

describe("blocker: the completion screen invented what the class found", () => {
  /**
   * Every surface that can render the finish celebration. nc#458: a usability
   * study (#455) phase-jumped the PUBLIC Minibeast Hunting runner — the
   * hybrid journey, the default `/run` gives every visitor — straight to the
   * circle with zero observations recorded, and the finish screen still said
   * "You met the neighbours." / "Legs were counted. Wings were found. Every
   * creature went home again." The fix that shipped earlier for `Runner`
   * (the `?run=legacy` surface) never reached the two surfaces a real visitor
   * actually lands on, so the same invented-evidence bug shipped live on the
   * default path. All three are checked here so a future fourth surface, or
   * a partial fix that only reaches one of these, fails loudly.
   */
  async function finishSurface(path: string): Promise<string> {
    const { readFileSync } = await import("node:fs");
    return readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  }

  it("no longer renders the authored outcome assertion, on any finish surface", async () => {
    for (const path of [
      "app/run/Runner.tsx",
      "app/run/HybridJourney.tsx",
      "app/run/LessonScroll.tsx",
    ]) {
      const source = await finishSurface(path);
      // The headline and keepsake are Johan's own, and verbatim-guarded, so
      // they stay in the pack. Every renderer stops asserting them.
      expect(source, `${path} still asserts celebration.headline`).not.toMatch(
        /celebration\.headline/
      );
      expect(source, `${path} still asserts celebration.keepsake`).not.toMatch(
        /celebration\.keepsake/
      );
      // The one thing every surface does know, and the forward look, survive.
      expect(source, `${path} lost the honest fallback`).toContain(
        "{session.title} is done."
      );
      expect(source, `${path} lost the next-week tease`).toMatch(
        /celebration\??\.nextWeekTease/
      );
    }
  });

  it("keeps the finish copy identical for a direct phase jump (nc#458)", () => {
    // The folio (HybridJourney's own jump control) can land on any phase or
    // moment index, and a class can reach `circle` from there without a
    // single intervening phase having rendered. If the celebrate branch read
    // `step.phase` or `step.moment` it could vary — or worse, imply a phase
    // was reached that never was. It reads neither: the exact same JSX runs
    // whichever moment or phase the jump landed on last.
    const celebrateBranch = code(
      journey.slice(
        journey.indexOf('// celebrate —'),
        journey.indexOf("/**\n * The entity card")
      )
    );
    expect(celebrateBranch.trim().length).toBeGreaterThan(0);
    expect(celebrateBranch).not.toContain("step.phase");
    expect(celebrateBranch).not.toContain("step.moment");
  });

  it("keeps the finish copy identical for a zero-input completion (nc#458)", () => {
    // A signed-out run reaches celebrate straight from the circle's "Done
    // with circle time" with no reflection screen at all; a signed-in run
    // that saves with every optional reflection tap left untouched reaches
    // the same place. Neither run supplies mood/happenings/timing/moreOf —
    // the celebrate branch must not read any of them, so an unanswered
    // reflection can never read as an answered one.
    const celebrateBranch = code(
      journey.slice(
        journey.indexOf('// celebrate —'),
        journey.indexOf("/**\n * The entity card")
      )
    );
    for (const field of ["mood", "happenings", "timing", "moreOf", "headcount"]) {
      expect(celebrateBranch, `celebrate branch reads reflection field "${field}"`).not.toContain(
        field
      );
    }
    // Exactly one celebrate render exists — every path into it (reflect's
    // onCompleted, the signed-out circle button, a direct link) opens the
    // same unconditional block, never a specialised one.
    const celebrateReturns = journey.match(/\/\/ celebrate —/g);
    expect(celebrateReturns).toHaveLength(1);
  });

  it("leaves the guarded pack copy untouched", async () => {
    const { readFileSync } = await import("node:fs");
    const pack = readFileSync(new URL("../../packs/summer.json", import.meta.url), "utf8");
    // Counting Life's headline (the existing, already-correct example)...
    expect(pack).toContain("Your class found life everywhere.");
    // ...and Minibeast Hunting's, the exact lines nc#458 was filed over.
    expect(pack).toContain("You met the neighbours.");
    expect(pack).toContain(
      "Legs were counted. Wings were found. Every creature went home again."
    );
  });
});

describe("blocker: the URL of record read Berkeley in Celsius", () => {
  it("gives demo mode its own place, so its units follow the fixture", async () => {
    const { readFileSync } = await import("node:fs");
    const teacher = readFileSync(new URL("../../lib/teacher.ts", import.meta.url), "utf8");
    expect(teacher).toContain("fixtureLocation()");
    const conditions = readFileSync(
      new URL("../../app/api/conditions/route.ts", import.meta.url),
      "utf8"
    );
    // The run's spoken line is read aloud; it must agree on the scale.
    expect(conditions).toContain("requestLocale");
    expect(conditions).toMatch(/locale,/);
  });
});

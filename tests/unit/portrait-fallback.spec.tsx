import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CastFace } from "@/app/CastFace";
import type { CastMember } from "@/lib/cast/member";

/**
 * THE GREY BOX ARRIVING BY THE BACK DOOR.
 *
 * Caught on screen, not in code. Every honesty state was careful never to
 * render a grey placeholder — and then a `photoUrl` that 404s rendered one
 * anyway, drawn by the browser instead of by us. A school network that blocks
 * the photo host, a dead iNaturalist URL, or a bad connection all produce the
 * same empty box on the surfaces built to be honest when there is nothing to
 * show.
 *
 * The fix is structural rather than reactive: the field-guide plate is drawn
 * UNDERNEATH every portrait and the photograph is laid on top. A failed image
 * uncovers the plate. No `onError`, no JavaScript, no hydration, no flash —
 * these are server components rendering on a school iPad, and the plate is the
 * same answer we would have given if the URL had never existed.
 */

function member(over: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Honey bee",
    scientificName: "Apis mellifera",
    photoUrl: "https://example.invalid/404.jpg",
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

const render = (m: CastMember, size: "face" | "hero" = "face") =>
  renderToStaticMarkup(<CastFace member={m} size={size} />);

describe("the plate is under every portrait, not just the photoless ones", () => {
  it("draws the plate beneath a recorded member's photograph", () => {
    const markup = render(member());
    expect(markup).toContain("cast-plate");
    expect(markup).toContain("cast-photo");
    // The plate comes FIRST in the markup, which is what puts it underneath.
    expect(markup.indexOf("cast-plate")).toBeLessThan(markup.indexOf("cast-photo"));
  });

  it("draws it beneath a regional member's photograph too", () => {
    const markup = render(member({ honestyTier: "regional" }));
    expect(markup).toContain("cast-plate");
    expect(markup).toContain("cast-photo");
  });

  it("draws it beneath the profile hero, where a broken image is largest", () => {
    const markup = render(member(), "hero");
    expect(markup).toContain("cast-plate");
    expect(markup).toContain("cast-photo");
  });

  it("draws the plate alone when there is genuinely no photograph", () => {
    const markup = render(member({ photoUrl: null, honestyTier: "regional" }));
    expect(markup).toContain("cast-plate");
    expect(markup).not.toContain("cast-photo");
    expect(markup).not.toContain("<img");
  });

  it("never renders an img with an empty or missing src", () => {
    // An empty src is a request to the current page, which is the other way a
    // broken box appears.
    for (const m of [member({ photoUrl: null }), member({ photoUrl: "" })]) {
      expect(render(m)).not.toMatch(/<img[^>]*src=""/);
    }
  });

  it("still names the species, so a failed image is never a nameless card", () => {
    const markup = render(member({ photoUrl: "https://example.invalid/404.jpg" }));
    expect(markup).toContain("Honey bee");
    // And the tier is still carried — by the material, which is now the only
    // carrier on a face (Johan's ruling). A recorded species with a photograph
    // renders the full-fidelity treatment.
    expect(markup).toContain("cast-portrait-seen");
    // No chip text anywhere on a face.
    expect(markup).not.toMatch(/seen here|around the region|not seen yet/);
  });
});

describe("the CSS that makes the fallback work without JavaScript", () => {
  const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

  it("positions the plate to fill the portrait behind the photo", () => {
    const rule = css.slice(css.indexOf(".cast-portrait .cast-plate"));
    expect(rule.slice(0, 120)).toMatch(/position:\s*absolute/);
    expect(rule.slice(0, 120)).toMatch(/inset:\s*0/);
  });

  it("lifts the photograph above it rather than hiding the plate", () => {
    const rule = css.slice(css.indexOf(".cast-portrait img"));
    expect(rule.slice(0, 200)).toMatch(/z-index:\s*1/);
  });

  it("gives the photo no background of its own, so a failed load shows through", () => {
    const rule = css.slice(css.indexOf(".cast-photo {"));
    expect(rule.slice(0, 120)).toMatch(/background:\s*transparent/);
  });
});

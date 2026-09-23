import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  const url = new URL(`../../${relativePath}`, import.meta.url);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

/**
 * RED wiring contract. Composite surfaces inherit the policy through
 * CastFace; surfaces that own their own <img> must obtain a DisplayPhotoAsset
 * and render its shared PhotoCredit. No caller gets to reinterpret photoUrl.
 */
describe("the shared display-photo seam", () => {
  it("exposes one rich asset gate and makes the legacy URL helper delegate to it", () => {
    const member = source("lib/cast/member.ts");

    expect(member).toMatch(/export function displayPhotoAsset\s*\(/);
    const compatibilityWrapper = member.slice(member.indexOf("export function displayPhotoUrl"));
    expect(compatibilityWrapper.slice(0, 700)).toContain("displayPhotoAsset(");
  });

  it("has one reusable PhotoCredit renderer", () => {
    const credit = source("app/PhotoCredit.tsx");

    expect(credit).not.toBe("");
    expect(credit).toMatch(/export function PhotoCredit\s*\(/);
  });
});

describe("every teacher and child surface consumes the shared contract", () => {
  it("routes DailyCard through CastFace and never filters or renders on raw photoUrl", () => {
    const daily = source("app/DailyCard.tsx");

    expect(daily).toContain("<CastFace");
    expect(daily).not.toMatch(/\.photoUrl\b/);
  });

  it("routes SeenNearby and the optional read page through CastFace without a generic credit", () => {
    const nearby = source("app/SeenNearby.tsx");

    expect(nearby).toContain("<CastFace");
    expect(nearby).not.toMatch(/\.photoUrl\b/);
    expect(nearby).not.toMatch(/Open reference images via Pointmoon|Credits travel with each image/i);
    // Plan is the teacher's question, route and readiness decision. Nearby
    // life remains on the optional /read route and in runner show material,
    // but no longer interrupts the primary Plan journey.
    expect(source("app/session/page.tsx")).not.toContain("<SeenNearby");
    expect(source("app/read/page.tsx")).toContain("<SeenNearby");
  });

  it("routes SpeakAndShow through CastFace and never reads a URL itself", () => {
    const speak = source("app/cast/SpeakAndShow.tsx");

    expect(speak).toContain("<CastFace");
    expect(speak).not.toMatch(/\.photoUrl\b/);
  });

  it("makes CastFace use the asset gate and its visible shared credit", () => {
    const face = source("app/CastFace.tsx");

    expect(face).toContain("displayPhotoAsset");
    expect(face).toContain("<PhotoCredit");
    expect(face).not.toContain("src={member.photoUrl");
  });

  it("makes the profile inherit its hero image and credit through CastFace only", () => {
    const profile = source("app/species/[slug]/page.tsx");

    expect(profile).toContain("<CastFace");
    expect(profile).not.toMatch(/\.photoUrl\b/);
  });

  it("makes print gate the image as an asset and print its shared credit", () => {
    const print = source("app/print/CastCards.tsx");

    expect(print).toContain("displayPhotoAsset");
    expect(print).toContain("<PhotoCredit");
    expect(print).not.toContain("src={member.photoUrl");
  });

  // Onboarding's live preview was the fourth surface here. The location step
  // no longer answers "where do you go outside?" with a day's sky and
  // species, so the component it rendered is gone and there is nothing left
  // to gate.
});

describe("the Today promise stays within the evidence", () => {
  it("does not emit an easiest-to-find claim", () => {
    const summary = source("lib/cast/summary.ts");

    expect(summary).not.toMatch(/lines\.push\([^)]*easiest to find near you today/is);
  });
});

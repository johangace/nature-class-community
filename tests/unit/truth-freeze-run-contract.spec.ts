import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CastMember } from "@/lib/cast/read";
import { readAloudLine } from "@/lib/cast/speak";

function member(overrides: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Honey bee",
    scientificName: "Apis mellifera",
    photoUrl: "https://example.test/bee.jpg",
    iconicTaxon: "Insecta",
    honestyTier: "recorded",
    lastSeenWindow: null,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "Recorded nearby lately.",
    ...overrides,
  };
}

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
}

describe("the run says only the locality it actually knows", () => {
  it("never turns a sample cast into an observation at the school", () => {
    for (const candidate of [
      member(),
      member({ honestyTier: "regional" }),
      member({ absent: true }),
    ]) {
      const line = readAloudLine(candidate, { locality: "sample" });

      expect(line).toContain("Honey bee");
      expect(line).not.toMatch(/our school|near us|seen near|spotted near/i);
    }
  });

  it("may name a located recorded presence as recorded nearby", () => {
    const line = readAloudLine(member(), { locality: "recorded-nearby" });

    expect(line).toMatch(/recorded nearby/i);
    expect(line).not.toMatch(/seen (at|in) our school|on our grounds/i);
  });

  it("makes the server page pass locality deliberately rather than relying on a default", () => {
    const page = source("app/run/page.tsx");

    expect(page).not.toContain("map(readAloudLine)");
    expect(page).toMatch(/readAloudLine\([^)]*\{\s*locality:/s);
    expect(page).toMatch(/located\s*\?\s*["']recorded-nearby["']\s*:\s*["']sample["']/);
  });

  it("uses a neutral mixed-cast invitation everywhere", () => {
    expect(source("app/run/Runner.tsx")).toContain("Who we might meet today");
    expect(source("app/run/Runner.tsx")).not.toContain("Who is about near our school");
    expect(source("app/SeenNearby.tsx")).not.toMatch(/Photographed by .* nearby/);
    expect(source("app/print/CastCards.tsx")).not.toContain("Near our school");
  });
});

describe("photos are gated at the truth boundary", () => {
  // Was "requests only Pointmoon's open surface..." and asserted
  // `surface=open` in the fetch URL. Removed by nc#362: that param applied
  // Pointmoon's license=cc0,cc-by&photo_license=cc0,cc-by filter, built for
  // third-party redistributors, and it stopped matching this repo's own
  // rights policy the moment #294/#296 ("all photos, no gates", 2026-08-17)
  // made every downstream layer accept any licence Pointmoon sends. Nature
  // Class is a first-party consumer (see outdoorsBackend/NatureIntel, which
  // reads Pointmoon with no `surface` param) and was paying that filter's
  // coverage cut for nothing. Credit/licence/source still travel per asset
  // and still gate a bare legacy `photoUrl` from being treated as releasable
  // — that boundary is unchanged and still asserted below.
  it("does not request Pointmoon's third-party open surface, and does not treat a bare URL as releasable", () => {
    const client = source("lib/outside/pointmoon.ts");
    const urlLine = client.split("\n").find((line) => line.includes("/api/moon?audience=facts"));
    expect(urlLine).toBeDefined();
    expect(urlLine).not.toContain("surface=open");
    expect(source("lib/cast/member.ts")).toContain("photoAttribution");
    expect(source("lib/cast/member.ts")).toContain("photoLicense");
    expect(source("lib/cast/member.ts")).toContain("photoSourceUrl");
  });
});

describe("child-facing run words are frozen before the teacher starts", () => {
  it("does not fetch or replace the conditions line from the client renderer", () => {
    const renderer = source("engine/renderers/conditions-line.tsx");

    expect(renderer).not.toMatch(/\buseEffect\b|\buseState\b/);
    expect(renderer).not.toMatch(/\bfetch\s*\(|\/api\/conditions/);
  });
});

describe("the live runner has no speculative AI helper controls", () => {
  it("does not import or render the hold-a-question helper", () => {
    const runner = source("app/run/Runner.tsx");

    expect(runner).not.toMatch(/from\s+["']\.\/HoldQuestion["']/);
    expect(runner).not.toMatch(/<(?:HoldButton|HeldReview)\b/);
  });

  /**
   * "Ask it another way" is no longer speculative — #390 landed it on the
   * hybrid journey's circle card, off the one draft seam, behind a guard, with
   * a fixed row of options and no free text. What stays forbidden is the SHAPE
   * this rule was written against: `CircleHelper`, the old free-text helper
   * with its own fetch and its own localStorage queue, reappearing inside a
   * pack renderer. The legacy runner's circle screen renders pack data and
   * nothing else, and that is what this asserts.
   */
  it("keeps the legacy circle screen free of its own AI helper", () => {
    const circle = source("app/run/CircleTime.tsx");

    expect(circle).not.toMatch(/from\s+["']\.\/CircleHelper["']/);
    expect(circle).not.toMatch(/<CircleHelper\b/);
    expect(circle).not.toMatch(/\bfetch\s*\(/);
  });

  it("routes the circle's ask-it-another-way through the one guarded seam", () => {
    const row = source("app/run/AskAnotherWay.tsx");

    // The address of the question, never its words: that is what makes a
    // second tap rephrase the ORIGINAL rather than the last rephrasing.
    expect(row).toContain("/api/ask-another-way");
    expect(row).toContain("questionIndex");
    expect(row).not.toMatch(/\btextarea\b|\binput\b/);
  });
});

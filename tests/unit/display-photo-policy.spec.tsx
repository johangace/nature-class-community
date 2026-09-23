import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CastFace } from "@/app/CastFace";
import { DailyCard } from "@/app/DailyCard";
import { CastCards } from "@/app/print/CastCards";
import * as photoPolicy from "@/lib/cast/member";
import { dailySummary } from "@/lib/cast/summary";
import type { CastMember, ClassCast } from "@/lib/cast/member";

/**
 * RED contract: a remote URL is only a candidate. The releasable thing is a
 * complete photo asset whose role, named creator, open licence, and public
 * source page stay attached wherever the picture travels.
 *
 * The plate is presence, not a loading placeholder. Missing rights or a dead
 * image host must change the material, never make the creature disappear.
 */

type DisplayPhotoAsset = {
  url: string;
  role: "observation" | "taxon-reference";
  attribution: string;
  license: "cc0" | "cc-by";
  sourceUrl: string;
};

type DisplayPhotoAssetFn = (
  member: Pick<
    CastMember,
    "photoUrl" | "photoRole" | "photoAttribution" | "photoLicense" | "photoSourceUrl"
  >
) => DisplayPhotoAsset | null;

function member(overrides: Partial<CastMember> = {}): CastMember {
  return {
    commonName: "Honey bee",
    scientificName: "Apis mellifera",
    photoUrl: "https://example.invalid/remote-photo.jpg",
    photoRole: "observation",
    photoAttribution: "Martha K. / iNaturalist",
    photoLicense: "cc-by",
    photoSourceUrl: "https://example.test/observations/42",
    iconicTaxon: "Insecta",
    honestyTier: "recorded",
    lastSeenWindow: 7,
    yearsObserved: null,
    historicalAvgCount: null,
    safetyNote: null,
    sortRank: 0,
    absent: false,
    line: "Look for the furry body and striped back.",
    ...overrides,
  };
}

const cast = (members: CastMember[]): ClassCast => ({
  members,
  absences: [],
  source: "live",
});

const displayPhotoAsset = (
  photoPolicy as typeof photoPolicy & { displayPhotoAsset?: DisplayPhotoAssetFn }
).displayPhotoAsset;

describe("one releaseable display-photo asset", () => {
  it("returns the image and all of its credit evidence as one indivisible value", () => {
    expect(displayPhotoAsset).toBeTypeOf("function");
    if (!displayPhotoAsset) return;

    expect(displayPhotoAsset(member())).toEqual({
      url: "https://example.invalid/remote-photo.jpg",
      role: "observation",
      attribution: "Martha K. / iNaturalist",
      license: "cc-by",
      sourceUrl: "https://example.test/observations/42",
    });
  });

  it("keeps displayPhotoUrl only as the URL view of that richer gate", () => {
    expect(displayPhotoAsset).toBeTypeOf("function");
    if (!displayPhotoAsset) return;

    const candidate = member();
    expect(photoPolicy.displayPhotoUrl(candidate)).toBe(displayPhotoAsset(candidate)?.url ?? null);
  });

  /**
   * A GENERIC BYLINE IS STILL A BYLINE.
   *
   * This asserted the opposite until 2026-08-17: a photograph credited only
   * to "iNaturalist", with no named contributor, was withheld entirely. That
   * withheld the picture over the WORDING of the credit, which is a rule
   * about our taste rather than about anyone's rights, and it is a large
   * share of what the provider actually sends.
   *
   * Johan, 2026-08-17: "keep attribution but accept any photos we can get."
   *
   * So credit must travel, and whatever credit travelled is what gets printed.
   * The test below still holds the line that matters: no credit, no picture.
   */
  it("accepts a provider-only byline and prints it as given", () => {
    for (const generic of ["iNaturalist", "iNaturalist contributor", "Photo via iNaturalist"]) {
      const candidate = member({ photoAttribution: generic });
      expect(photoPolicy.displayPhotoUrl(candidate)).not.toBeNull();
      if (displayPhotoAsset) {
        expect(displayPhotoAsset(candidate)).toMatchObject({ attribution: generic });
      }
    }
  });

  it("shows a photograph that arrived with no credit at all", () => {
    // The last rights condition, removed 2026-08-17. Johan: "all photos no
    // gates! we need any photo we can get". Credit is still carried and still
    // rendered wherever it travelled; it simply no longer withholds a picture.
    for (const missing of ["", "   ", undefined]) {
      const candidate = member({ photoAttribution: missing });
      expect(photoPolicy.displayPhotoUrl(candidate)).not.toBeNull();
      if (displayPhotoAsset) {
        expect(displayPhotoAsset(candidate)).toMatchObject({ attribution: "" });
      }
    }
  });

  it("accepts a non-commercial licence and records it rather than dropping the image", () => {
    // cc-by-nc is iNaturalist's most common licence and used to be rejected
    // here, which is why a teacher saw no photographs at all.
    for (const license of ["cc-by-nc", "cc-by-sa", "cc-by-nd"]) {
      const candidate = member({ photoLicense: license });
      expect(photoPolicy.displayPhotoUrl(candidate)).not.toBeNull();
      if (displayPhotoAsset) expect(displayPhotoAsset(candidate)).toMatchObject({ license });
    }
  });

  it("shows a bare URL with no role, creator, licence or source", () => {
    const bare = member({
      photoRole: undefined,
      photoAttribution: undefined,
      photoLicense: undefined,
      photoSourceUrl: undefined,
    });

    expect(photoPolicy.displayPhotoUrl(bare)).not.toBeNull();
    if (displayPhotoAsset) expect(displayPhotoAsset(bare)).not.toBeNull();
  });

  it("still refuses an image that is not fetchable over https", () => {
    // The one condition left, and it is about transport rather than rights:
    // a page served over https cannot show an http image, and a javascript:
    // URL is not a photograph at all.
    for (const bad of ["http://example.test/bee.jpg", "javascript:alert(1)", undefined]) {
      const candidate = member({ photoUrl: bad });
      expect(photoPolicy.displayPhotoUrl(candidate)).toBeNull();
    }
  });
});

describe("the shared face carries visible credit and an image-failure floor", () => {
  it("links the named creator and licence to the public source", () => {
    const markup = renderToStaticMarkup(<CastFace member={member()} />);

    expect(markup).toContain("Martha K. / iNaturalist");
    expect(markup).toMatch(/CC[ -]?BY/i);
    expect(markup).toContain('href="https://example.test/observations/42"');
  });

  it("keeps a plate under a compliant remote image so a broken request preserves presence", () => {
    const markup = renderToStaticMarkup(
      <CastFace member={member({ photoUrl: "https://example.invalid/404.jpg" })} />
    );

    expect(markup).toContain("Honey bee");
    expect(markup).toContain("cast-plate");
    expect(markup).toContain("cast-photo");
    expect(markup.indexOf("cast-plate")).toBeLessThan(markup.indexOf("cast-photo"));
  });

  it("renders a generically credited candidate as the photograph it is", () => {
    const markup = renderToStaticMarkup(
      <CastFace member={member({ photoAttribution: "iNaturalist contributor" })} />
    );

    // Was asserted as a plate with no <img>. A byline without a personal name
    // is not a rights problem, and drawing a plate over a real photograph of
    // the species is the product being precious rather than being honest.
    expect(markup).toContain("Honey bee");
    expect(markup).toContain("<img");
  });
});

describe("presence survives unavailable photography at the outer surfaces", () => {
  it("keeps a recorded Today member with no releaseable image as a plate", () => {
    const markup = renderToStaticMarkup(
      <DailyCard
        data={{
          condition: { state: "fine", adjustment: null },
          temperature: "18°C",
          sky: "a cloudy sky",
          cast: cast([member({ photoUrl: null })]),
          summary: null,
        }}
      />
    );

    expect(markup).toContain("Honey bee");
    expect(markup).toContain("cast-portrait-plate");
    expect(markup).not.toContain("<img");
  });

  // The onboarding preview carried the third case here. The location step
  // answers with a map of the place and no species at all now, so there is no
  // onboarding photograph left to have a policy about.

  it("prints a compliant image with its creator, licence, and linked source", () => {
    const markup = renderToStaticMarkup(
      <CastCards members={[member()]} located readOn="Friday 14 August" />
    );

    expect(markup).toContain("<img");
    expect(markup).toContain("Martha K. / iNaturalist");
    expect(markup).toMatch(/CC[ -]?BY/i);
    expect(markup).toContain('href="https://example.test/observations/42"');
  });

  it("prints a generically credited candidate on the child card as a photograph", () => {
    const markup = renderToStaticMarkup(
      <CastCards
        members={[member({ photoAttribution: "Photo via iNaturalist" })]}
        located
        readOn="Friday 14 August"
      />
    );

    // The draw-here plate is for a species we have no picture of. It is not a
    // punishment for a byline that names an organisation instead of a person.
    expect(markup).toContain("Honey bee");
    expect(markup).toContain("<img");
    expect(markup).toContain("Photo via iNaturalist");
  });
});

describe("Today does not turn ranked evidence into a findability promise", () => {
  it("never says a species is the easiest to find near the teacher today", () => {
    const summary = dailySummary({
      state: "fine",
      sessionTitle: "Counting life",
      members: [member()],
    });

    expect(summary).not.toMatch(/easiest to find/i);
  });
});

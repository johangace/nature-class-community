import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JoinLanding } from "@/app/join/JoinLanding";
import { SCHOOL_NAME_MAX, joinHeadline, readSchoolName } from "@/lib/join";

/**
 * The join landing (#529).
 *
 * /join is public, unauthenticated, and takes a string from whoever wrote the
 * URL and prints it in a headline. That makes the school name the one piece of
 * untrusted text on the surface, and most of what is below is about it.
 */

const joinCss = readFileSync(
  new URL("../../app/join/Join.module.css", import.meta.url),
  "utf8"
);
const startFlowSource = readFileSync(
  new URL("../../app/start/StartFlow.tsx", import.meta.url),
  "utf8"
);

function text(markup: string): string {
  return markup.replace(/<[^>]+>/g, "");
}

describe("the school-aware variant", () => {
  it("puts the school's own name in the headline", () => {
    const markup = renderToStaticMarkup(
      <JoinLanding school={readSchoolName("Oakfield Primary School")} />
    );

    expect(text(markup)).toContain(
      "Oakfield Primary School is bringing lessons outside with Nature Class."
    );
    expect(text(markup)).toContain("You have been invited");
  });

  it("offers one action, and it is the existing sign-in path", () => {
    const markup = renderToStaticMarkup(<JoinLanding school="Oakfield Primary School" />);
    const hrefs = [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);

    expect(text(markup)).toContain("Continue to sign in");
    // The header's own quiet "sign in" and the wordmark home link are chrome,
    // not a second call to action, so /sign-in and /welcome are the whole set.
    expect(new Set(hrefs)).toEqual(new Set(["/welcome", "/sign-in"]));
  });
});

describe("the generic variant", () => {
  it("is a complete page when no school was named", () => {
    const markup = renderToStaticMarkup(<JoinLanding school={readSchoolName(undefined)} />);

    expect(text(markup)).toContain(
      "Your school is bringing lessons outside with Nature Class."
    );
    expect(text(markup)).toContain("Continue to sign in");
    // No half-addressed state: nothing on the page refers to a name it does
    // not have.
    expect(markup).not.toContain("undefined");
    expect(markup).not.toContain("null");
  });

  it("falls back for every unusable parameter shape", () => {
    expect(readSchoolName(undefined)).toBeNull();
    expect(readSchoolName("")).toBeNull();
    expect(readSchoolName("     ")).toBeNull();
    expect(readSchoolName(42)).toBeNull();
    expect(readSchoolName(null)).toBeNull();
    expect(readSchoolName({ school: "Oakfield" })).toBeNull();
  });

  it("takes the first of a repeated parameter rather than joining them", () => {
    expect(readSchoolName(["Oakfield Primary School", "Something else"])).toBe(
      "Oakfield Primary School"
    );
  });
});

describe("a hostile parameter", () => {
  it("renders a script tag as inert text, with its brackets gone", () => {
    const hostile = '<script>alert("x")</script>';
    const markup = renderToStaticMarkup(<JoinLanding school={readSchoolName(hostile)} />);

    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("</script>");
    // Not merely escaped: the brackets are removed, so she is not shown markup
    // dressed up as her school's name.
    expect(markup).not.toContain("&lt;script");
    expect(text(markup)).toContain("alert");
  });

  it("survives the urlencoded spelling of the same attack", () => {
    // Next decodes the query string before we see it, so this is what actually
    // arrives from /join?school=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E
    const decoded = "<img src=x onerror=alert(1)>";
    const markup = renderToStaticMarkup(<JoinLanding school={readSchoolName(decoded)} />);

    expect(markup).not.toContain("<img");
    // The words survive as inert prose inside the headline, which is the
    // point: no tag is opened, and no handler lands on an element.
    expect(markup).not.toMatch(/<[a-z]+[^>]*\sonerror/i);
    expect(text(markup)).toContain("img src=x onerror=alert(1) is bringing lessons");
  });

  it("never lets the name reach an attribute, only a text node", () => {
    const markup = renderToStaticMarkup(
      <JoinLanding school={readSchoolName('javascript:alert(1)" data-x="')} />
    );

    expect(markup).not.toContain("javascript:alert(1)\"");
    const hrefs = [...markup.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs.every((h) => h?.startsWith("/"))).toBe(true);
  });

  it("caps a five thousand character name to one readable line", () => {
    const name = readSchoolName("a".repeat(5000));

    expect(name).not.toBeNull();
    // The cap plus the ellipsis that shows it was cut.
    expect(name!.length).toBe(SCHOOL_NAME_MAX + 1);
    expect(name!.endsWith("…")).toBe(true);

    const markup = renderToStaticMarkup(<JoinLanding school={name} />);
    expect(markup.match(/a{200,}/)).toBeNull();
  });

  it("treats five thousand blanks as no name at all", () => {
    expect(readSchoolName(" ".repeat(5000))).toBeNull();
    expect(readSchoolName("\n\n\t  \r\n")).toBeNull();
  });

  it("strips the invisible characters that make text lie about itself", () => {
    // Zero-width space, a bidi override, a line separator, a soft hyphen.
    const sneaky = "Oak\u200bfield\u202e Primary School\u00ad";

    expect(readSchoolName(sneaky)).toBe("Oak field Primary School");
  });

  it("keeps the punctuation real school names are written with", () => {
    expect(readSchoolName("St Mary's C of E (Voluntary Aided) Primary & Nursery")).toBe(
      "St Mary's C of E (Voluntary Aided) Primary & Nursery"
    );
    expect(readSchoolName("  Ysgol Gymraeg  Bro Morgannwg  ")).toBe(
      "Ysgol Gymraeg Bro Morgannwg"
    );
  });

  it("says the same generic sentence for a name and for none", () => {
    expect(joinHeadline(null)).toContain("Your school");
    expect(joinHeadline("Oakfield")).toContain("Oakfield");
    expect(joinHeadline("Oakfield")).not.toContain("Your school");
  });
});

describe("the surface itself", () => {
  it("renders on Nature Class tokens with no colour of its own", () => {
    expect(joinCss).toContain("background: var(--paper)");
    expect(joinCss).toContain("color: var(--ink)");
    expect(joinCss).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(joinCss).not.toMatch(/text-?transform\s*:\s*uppercase/i);
  });

  it("never renders the name as markup", () => {
    const source = readFileSync(
      new URL("../../app/join/JoinLanding.tsx", import.meta.url),
      "utf8"
    );
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });
});

describe("the prefill reaches the flow that needs it", () => {
  /**
   * The store is tested on its own in join-prefill.spec.ts. This is the reach:
   * correctness of a helper nobody calls is worth nothing, and the onboarding
   * flow is the only caller that makes the join link do anything.
   */
  it("is taken by the onboarding flow's school field", () => {
    expect(startFlowSource).toContain('from "@/lib/join-prefill"');
    expect(startFlowSource).toContain("takeJoinSchool()");
    expect(startFlowSource).toMatch(/school:\s*invited/);
  });

  it("never overwrites a resumed class or something she has typed", () => {
    expect(startFlowSource).toMatch(/if \(resume\) return;/);
    expect(startFlowSource).toMatch(
      /current\.school\.trim\(\)\s*\?\s*current\s*:\s*\{ \.\.\.current, school: invited, schoolEdited: true \}/
    );
  });

  it("counts the invited name as hers, so the place she picks does not replace it", () => {
    // #905 moved the school field onto the location step and defaults it from
    // the place. A name that came in on a join link is already the school's
    // own, so it is marked edited and the default never overwrites it.
    expect(startFlowSource).toMatch(/school: invited, schoolEdited: true/);
  });
});

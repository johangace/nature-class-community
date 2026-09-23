import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * The ground is legible, and a machine says so.
 *
 * WHY THIS EXISTS
 *
 * globals.css carries genuinely good contrast reasoning in its comments — why
 * --ink-soft replaced the teacher's brown, why --caption is not pure white,
 * what each pair measures on paper. Every one of those numbers was correct when
 * it was written and none of them was ever checked again. The ground has now
 * changed twice (#226, #382) and each time somebody re-derived the ratios by
 * hand, which is the expensive way to learn that a value broke.
 *
 * A teacher reads this on a staffroom iPad indoors and on a phone outdoors in
 * sun. The failure mode of a bad ratio is not an ugly page, it is a teacher who
 * cannot read the next line with a class already moving. So the ratios are
 * asserted here rather than described in a comment, and the next person who
 * lightens the ground finds out from CI instead of from a classroom.
 *
 * WHAT IT ASSERTS
 *
 * Values are READ OUT OF globals.css rather than duplicated here. A test that
 * hard-codes the palette is a second source of truth, and a second source of
 * truth is the disease this whole ticket is treating: if the stylesheet and
 * this file can disagree, the file is a comment with extra steps.
 */

const CSS = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

function token(name: string): string {
  // First definition wins: :root, before any scope override.
  const m = CSS.match(new RegExp(`(^|[;{\\s])--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, "m"));
  const value = m?.[2];
  if (!value) throw new Error(`token --${name} is not defined as a literal in globals.css`);
  return value;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const chan = (i: number) => f(parseInt(h.slice(i, i + 2), 16) / 255);
  return 0.2126 * chan(0) + 0.7152 * chan(2) + 0.0722 * chan(4);
}

function ratio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

const AA_BODY = 4.5;
const AA_LARGE = 3;

describe("the light ground holds every ink it carries", () => {
  const paper = token("paper");

  it("maps the founder-selected charcoal to the primary light ink", () => {
    expect(token("ink").toLowerCase()).toBe("#474c3f");
  });

  it("maps the founder-selected petrol to the brand role", () => {
    expect(token("brand").toLowerCase()).toBe("#1a758f");
  });

  it("maps the selected leaf swatch to every light-ground action", () => {
    expect(token("action").toLowerCase()).toBe("#4c7d38");
  });

  it("the brand clears AA body on paper", () => {
    expect(ratio(paper, token("brand"))).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("the secondary navy carries the pale petrol brand with AA contrast", () => {
    expect(token("ground-secondary").toLowerCase()).toBe("#142835");
    expect(token("brand-on-secondary").toLowerCase()).toBe("#9bdaef");
    expect(ratio(token("ground-secondary"), token("brand-on-secondary"))).toBeGreaterThanOrEqual(
      AA_BODY
    );
  });

  it("maps the selected bright seed for the secondary navy", () => {
    expect(token("seed-on-secondary").toLowerCase()).toBe("#5fd47f");
    expect(ratio(token("ground-secondary"), token("seed-on-secondary"))).toBeGreaterThanOrEqual(
      AA_LARGE
    );
  });

  /* Everything that is ever set as body-sized text on paper. If a token joins
     this list it must clear AA at body size — that is the entry fee, not a
     nice-to-have, because there is no size at which a teacher outdoors is
     reading this comfortably below it. */
  it.each([
    ["ink", "ink"],
    ["ink-2", "ink-2"],
    ["ink-3", "ink-3"],
    ["ink-soft", "ink-soft"],
    ["umber", "umber"],
    ["amber", "amber"],
    ["berry", "berry"],
    ["living", "living"],
  ])("%s clears AA body on paper", (_label, name) => {
    expect(ratio(paper, token(name))).toBeGreaterThanOrEqual(AA_BODY);
  });

  /* THE TWO GREENS ARE HELD TO TWO DIFFERENT BARS, and that is the whole point
     of there being two. An earlier version of this file asserted --action at
     the body bar and asserted that it must be the DARKER of the pair. Both were
     the text bar applied to a fill, and both are now the wrong way round.

     A fill is not read. It needs 3:1 against the ground so its edge is findable,
     and 4.5:1 against its own label so the word on it is readable. */
  it("the action fill separates from the ground at the non-text bar", () => {
    expect(ratio(paper, token("action"))).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it("the label on the action fill clears AA body", () => {
    expect(ratio(token("action"), token("action-ink"))).toBeGreaterThanOrEqual(AA_BODY);
  });

  /* The selected light palette intentionally gives the living and action roles
     one exact green. Keep the semantic names separately addressable so a later
     surface-specific change does not require component rewrites. */
  it("keeps living and action at the same selected light value", () => {
    expect(token("living")).toBe(token("action"));
  });

  /* --sky is a FOCUS RING and nothing else -- globals.css:7107,
     `outline: 3px solid var(--sky)`, its only appearance in the codebase. It
     has been reported as an AA failure three times at 4.49:1, and three times
     that was the body-text bar pointed at something that is not text. A
     non-text focus indicator is held to 3:1. Asserted at its real bar so the
     next person to "fix" it finds out here that there is nothing to fix. */
  it("sky clears the NON-TEXT bar it is actually held to, as a focus ring", () => {
    expect(ratio(paper, token("sky"))).toBeGreaterThanOrEqual(AA_LARGE);
  });

  /* The founder-selected softer charcoal narrows the quiet-register step while
     both colours remain comfortably readable on paper. Typography and placement
     carry the rest of the hierarchy; retain at least the measured 1.5:1 step. */
  it("the quiet register retains a visible value step from full ink", () => {
    expect(ratio(token("ink"), token("ink-soft"))).toBeGreaterThanOrEqual(1.5);
  });

  /* The ground may get chalkier. It may not get brighter than what has already
     been shipping without someone deciding to, because a page brighter than the
     one teachers already use in sun is a new glare exposure, not a tidy-up. */
  it("the ground is no brighter than the paper that shipped before it", () => {
    expect(luminance(paper)).toBeLessThanOrEqual(luminance("#fdfaf0"));
  });
});

describe("outdoor mode stays legible on its own dark ground", () => {
  /* Two runners ship two separate outdoor implementations (nc#382): the
     `.run.outdoor` scope in globals.css and the `.outdoor` scope in
     journey.module.css. Both are asserted, because "the other one is fine" is
     how the second one rotted. */
  const journey = readFileSync(
    new URL("../../app/run/journey.module.css", import.meta.url),
    "utf8"
  );

  function scoped(css: string, name: string): string {
    const all = [...css.matchAll(new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})\\s*;`, "g"))];
    const last = all.at(-1)?.[1];
    if (!last) throw new Error(`--${name} is not defined as a literal`);
    return last;
  }

  it("the globals runner's outdoor inks clear AA body on its ground", () => {
    const ground = scoped(CSS, "paper"); // last definition is the .run.outdoor one
    for (const name of ["ink", "ink-2", "ink-3", "umber", "amber", "berry"]) {
      expect(ratio(ground, scoped(CSS, name))).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it("maps the selected pale petrol to the brand role on the dark ground", () => {
    const ground = scoped(CSS, "paper");
    const brand = scoped(CSS, "brand");

    expect(brand.toLowerCase()).toBe("#9bdaef");
    expect(ratio(ground, brand)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it("the hybrid runner's outdoor inks clear AA body on its ground", () => {
    const ground = scoped(journey, "o-ground");
    for (const name of ["o-ink", "o-ink-soft", "o-ink-quiet", "o-action", "o-action-pale"]) {
      expect(ratio(ground, scoped(journey, name))).toBeGreaterThanOrEqual(AA_BODY);
    }
  });
});

/**
 * The one colour that cannot read its own token.
 *
 * app/manifest.ts is JSON by the time a browser reads it, so it cannot call
 * var(--paper) and has to carry a literal. It carried the WRONG literal for
 * months: #f4efe4, the cream retired when the ground moved to chalk in #382.
 * Every teacher who added Nature Class to an iPad home screen got the old
 * ground on the splash screen and in the browser chrome, and nothing could
 * catch it -- the inline-hex gate reads stylesheets, and a manifest is not one.
 *
 * This is the machine that holds it instead, and the reason token-lint.mjs is
 * allowed to exempt those two keys by name. It reads --paper out of globals.css
 * rather than hard-coding it, for the same reason the rest of this file does:
 * a test with its own copy of the palette is a second source of truth, and a
 * second source of truth is the disease.
 */
describe("the home-screen ground tracks the page ground", () => {
  const MANIFEST = readFileSync(new URL("../../app/manifest.ts", import.meta.url), "utf8");

  for (const key of ["background_color", "theme_color"]) {
    it(`manifest ${key} is --paper`, () => {
      const m = MANIFEST.match(new RegExp(`${key}:\\s*"(#[0-9a-fA-F]{3,8})"`));
      expect(m?.[1]?.toLowerCase()).toBe(token("paper").toLowerCase());
    });
  }
});

/**
 * The preparation glyphs read on the washes they sit on (#870).
 *
 * Johan asked for icons on the preparation buttons, and the plate behind each
 * glyph is an existing audience wash rather than a new value — the spoken
 * green behind the preview a teacher will say out loud, the conditions amber
 * behind ground and safety, the teacher wash behind the two she reads alone.
 * Reuse is only free if the pairing is legible, and nothing had ever measured
 * ink against a plate: the washes were drawn as backgrounds for text set in
 * their own surface inks, not for a 2px stroke.
 *
 * The bar is the non-text 3:1, because a glyph is a shape and not a word. All
 * three clear it with room (6.94, 7.08, 7.28 at the time of writing), which is
 * the point of asserting the floor rather than the measurement: the next person
 * to warm a wash finds out from CI.
 */
describe("the preparation glyphs read on their washes", () => {
  const ink = token("ink");

  for (const plate of ["plate-spoken", "plate-teacher", "plate-conditions"]) {
    it(`glyph ink clears the shape bar on --${plate}`, () => {
      expect(ratio(ink, token(plate))).toBeGreaterThanOrEqual(AA_LARGE);
    });
  }
});

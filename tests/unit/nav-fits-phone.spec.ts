import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * THE DOOR CANNOT FALL OFF THE SCREEN.
 *
 * The usability round measured, on a 375px phone: `nav.app-nav` computing to
 * 440px, "Print one-pager" laid out at x=389 (entirely off-screen, with no
 * scrollbar to admit it was there), and Settings clipped at the right edge.
 *
 * ONE CAUSE, TWO SYMPTOMS, and the cause was not the nav. `.btn-start` carried
 * `min-width: 16rem` (288px) and `.today-actions` a 1.75rem gap with no wrap,
 * so the row measured 439px and stretched the whole document. The bottom nav
 * is `position: fixed; left: 0; right: 0`, so it stretched with it.
 *
 * Print is product law — every session ships a sheet, and the sheet is what
 * makes the lesson work with no device at all. It cannot be the thing that
 * goes over the edge.
 *
 * These assertions are on the stylesheet because that is where the bug lived
 * and where a regression would return. The geometry itself was verified in a
 * browser at 375x812 and 320x812; see the PR.
 */

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** The body of one top-level rule, by selector. */
function rule(selector: string): string {
  const at = css.indexOf(`\n${selector} {`);
  expect(at, `${selector} not found`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  return css.slice(open + 1, css.indexOf("}", open));
}

describe("the two doors out of Today fit a phone", () => {
  it("lets the row wrap instead of running off the edge", () => {
    expect(rule(".today-actions")).toMatch(/flex-wrap:\s*wrap/);
  });

  it("caps the go button at the width it actually has", () => {
    // A minimum a phone cannot honour is not a minimum, it is an overflow.
    const start = rule(".btn-start");
    expect(start).toMatch(/min-width:\s*min\(16rem,\s*100%\)/);
    expect(start).not.toMatch(/min-width:\s*16rem\s*;/);
  });

  it("keeps the go button's touch height, which is what a cold thumb needs", () => {
    expect(rule(".btn-start")).toMatch(/min-height:\s*var\(--touch\)/);
  });
});

describe("the nav shares the bar rather than demanding a width", () => {
  it("gives every tab an equal flexible share", () => {
    expect(rule(".app-nav-tabs li")).toMatch(/flex:\s*1 1 0/);
    expect(rule(".app-nav-tabs li")).toMatch(/min-width:\s*0/);
  });

  it("drops the rigid per-tab minimum that pushed Settings off", () => {
    const tab = rule(".app-nav-tab");
    expect(tab).toMatch(/min-width:\s*0/);
    expect(tab).not.toMatch(/min-width:\s*74px/);
  });

  it("keeps the touch target defended by height, the dimension a thumb cares about", () => {
    expect(rule(".app-nav-tab")).toMatch(/min-height:\s*var\(--touch\)/);
  });

  it("solves it by sharing, not by hiding a destination", () => {
    const tabs = rule(".app-nav-tabs");
    // No horizontal scroll, no collapse, no hamburger: four labels stay four
    // readable labels. A destination a teacher cannot see is a destination
    // she does not have.
    expect(tabs).not.toMatch(/overflow-x:\s*(auto|scroll)/);
    expect(tabs).not.toMatch(/display:\s*none/);
  });
});

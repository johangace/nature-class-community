import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { SkyMark } from "@/app/SkyMark";
import { SKY_MARK_LABEL, type SkyMarkKind } from "@/lib/outside/sky-mark";

/**
 * THE SKY MARKS ARE LINE, NOT FILL — enforced, because this failure was
 * invisible in review and survived three passes (#341).
 *
 * WHAT HAPPENED. The marks were written with `fill="var(--cloud)"` on seven
 * paths, lifted from the concept sheet. The sheet defines `--sand` and has no
 * `--cloud` at all: an unresolvable `var()` is invalid at computed-value time,
 * and `fill` is an inherited property, so in the sheet it fell back to the
 * root `fill="none"` and drew as open line. `app/today.module.css` DID define
 * `--cloud`, so the identical path data drew as eight solid cream shapes in
 * the product.
 *
 * Two surfaces, one set of paths, opposite results, silently — and Johan spent
 * a round judging "too geometric" against a fill nobody had chosen.
 *
 * THE GUARD IS DELIBERATELY WIDER THAN THE BUG. Asserting "no fill" would only
 * catch this instance. The class is PATH DATA WHOSE RENDERED RESULT DEPENDS ON
 * WHICH STYLESHEET IT IS PASTED INTO, so the presentation attributes inside a
 * mark may not reference a CSS custom property at all. The pen comes from the
 * root element and nowhere else.
 */

const KINDS = Object.keys(SKY_MARK_LABEL) as SkyMarkKind[];

const source = readFileSync(new URL("../../app/SkyMark.tsx", import.meta.url), "utf8");

/** The drawings, without the root <svg> that carries the pen. */
function markBodies(): string {
  const start = source.indexOf("const MARKS:");
  const end = source.indexOf("export function SkyMark");
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("the sky marks", () => {
  it("draw every kind", () => {
    // Was `toHaveLength(8)`. A literal count is a guard that fails when the
    // set GROWS correctly, which is what happened when haze, smoke and snow
    // were added (#371) — it flagged the fix, not a regression. What actually
    // matters is that every kind renders, which the loop below checks, and
    // that every SkyKey HAS a kind, which is asserted in
    // sky-mark-coverage.spec.ts against the producer's own vocabulary.
    expect(KINDS.length).toBeGreaterThan(0);
    for (const kind of KINDS) {
      const html = renderToStaticMarkup(createElement(SkyMark, { kind }));
      expect(html, kind).toContain("<path");
    }
  });

  it("carry no fill of their own, so the mark is a line", () => {
    // The root <svg> carries exactly one fill and it is "none". Nothing in
    // the bodies may add another.
    expect(markBodies()).not.toMatch(/fill=/);

    for (const kind of KINDS) {
      const html = renderToStaticMarkup(createElement(SkyMark, { kind }));
      const fills = html.match(/fill="[^"]*"/g) ?? [];
      expect(fills, kind).toEqual(['fill="none"']);
    }
  });

  it("never let a stylesheet decide how a path renders", () => {
    // The actual defect class. A var() that resolves on one surface and not on
    // another makes the same path data draw two different pictures.
    const bodies = markBodies();
    expect(bodies).not.toMatch(/var\(--/);

    for (const kind of KINDS) {
      const html = renderToStaticMarkup(createElement(SkyMark, { kind }));
      expect(html, kind).not.toMatch(/var\(--/);
    }
  });

  it("keeps the pen on the root and at shipping size", () => {
    // 44 viewBox rendered at 44px, so one SVG unit is one CSS pixel and the
    // 2px stroke is 2px. A 24 box scaled up gives 3.67px and stops matching
    // every other mark in the product.
    const html = renderToStaticMarkup(createElement(SkyMark, { kind: "clear" }));
    expect(html).toContain('viewBox="0 0 44 44"');
    expect(html).toContain('width="44"');
    expect(html).toContain('stroke="currentColor"');
    expect(html).toContain('stroke-width="2"');
    expect(html).toContain('stroke-linecap="round"');
    expect(html).toContain('stroke-linejoin="round"');
  });

  it("has a word for every mark, because the label is the licence", () => {
    for (const kind of KINDS) {
      expect(SKY_MARK_LABEL[kind]?.trim(), kind).toBeTruthy();
    }
  });
});

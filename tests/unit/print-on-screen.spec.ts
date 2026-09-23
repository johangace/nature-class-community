import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * /print IS A BROWSABLE PAGE, not only a printable one.
 *
 * A teacher reads it on a laptop before she prints it, and QA found her
 * reading it on a projector. Every rule that styled the cast cards and the
 * "you may meet" checklist lived inside @media print, so on screen the
 * checklist ran together as "Monarchseen here" with no separator, and — worse,
 * and not in the original report — the cast cards had NO FRAMES AT ALL.
 *
 * The frames are how the three honesty tiers are told apart. Print-only frames
 * meant the tiers were invisible on exactly the surface someone was pointing
 * at a wall. Both were the same defect in the same block on the same page, so
 * both are fixed; fixing only the separator would have left the projector case
 * half broken.
 *
 * These assertions are on the stylesheet because that is where the bug was.
 * No markup test could have caught it: the HTML was always correct.
 */

const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

/** The @media print block that carries the cast rules. */
function printBlock(): string {
  const re = /@media print/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    const open = css.indexOf("{", m.index);
    let depth = 0;
    let end = open;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      else if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const block = css.slice(m.index, end);
    if (block.includes(".print-maymeet")) return block;
  }
  throw new Error("print block not found");
}

/** Everything OUTSIDE every @media print block. What a browser shows. */
function screenCss(): string {
  return css.split("@media print").reduce((acc, chunk, i) => {
    if (i === 0) return chunk;
    let depth = 0;
    let end = 0;
    for (let j = chunk.indexOf("{"); j < chunk.length; j += 1) {
      if (chunk[j] === "{") depth += 1;
      else if (chunk[j] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = j + 1;
          break;
        }
      }
    }
    return acc + chunk.slice(end);
  }, "");
}

describe("the checklist reads on screen, not just on paper", () => {
  it("puts the separator where a browser can see it", () => {
    // The literal defect: "Monarchrecorded nearby".
    const screen = screenCss();
    expect(screen).toContain(".print-maymeet-tier::before");
    const rule = screen.slice(screen.indexOf(".print-maymeet-tier::before"));
    expect(rule.slice(0, 80)).toMatch(/content:\s*" · "/);
  });

  it("styles the name and the safety note on screen too", () => {
    const screen = screenCss();
    expect(screen).toContain(".print-maymeet-name");
    expect(screen).toContain(".print-maymeet-safe");
    const safe = screen.slice(screen.indexOf(".print-maymeet-safe"));
    expect(safe.slice(0, 120)).toMatch(/display:\s*block/);
  });

  it("lays the list out on screen", () => {
    const screen = screenCss();
    const ul = screen.slice(screen.indexOf(".print-maymeet ul"));
    expect(ul.slice(0, 220)).toMatch(/grid-template-columns/);
  });
});

describe("the honesty tiers are visible on a projector", () => {
  it("gives all three tiers their frames outside the media query", () => {
    const screen = screenCss();
    for (const tier of [".print-card-seen", ".print-card-regional", ".print-card-absent"]) {
      expect(screen).toContain(tier);
    }
  });

  it("keeps the tiers distinguishable by line and pattern on screen", () => {
    const screen = screenCss();
    const regional = screen.slice(screen.indexOf(".print-card-regional"));
    expect(regional.slice(0, 200)).toMatch(/outline/);

    const absent = screen.slice(screen.indexOf(".print-card-absent"));
    expect(absent.slice(0, 320)).toMatch(/dashed/);
    expect(absent.slice(0, 320)).toMatch(/repeating-linear-gradient/);
  });

  it("gives the cards their frame and grid on screen", () => {
    const screen = screenCss();
    expect(screen.slice(screen.indexOf(".print-cast-row"), screen.indexOf(".print-cast-row") + 220)).toMatch(
      /grid-template-columns/
    );
    // The frame reads --card-ink rather than a literal #000 (nc#382, gate 2:
    // no inline hex outside the token block). The VALUE is unchanged --
    // --card-ink is #000, because a printed card needs true black, not the
    // screen ink. Asserting the token rather than the hex is the point: a
    // future change to what a printed card is inked with should move one
    // token and this test should follow it, not fail on a literal.
    expect(screen.slice(screen.indexOf(".print-card-frame"), screen.indexOf(".print-card-frame") + 260)).toMatch(
      /border:\s*1px solid var\(--card-ink\)/
    );
    expect(css).toMatch(/--card-ink:\s*#000/);
  });
});

describe("the print block keeps only what is about paper", () => {
  it("still owns the page break and the greyscale", () => {
    const block = printBlock();
    expect(block).toMatch(/break-before:\s*page/);
    expect(block).toMatch(/grayscale\(1\)/);
    expect(block).toMatch(/break-inside:\s*avoid/);
  });

  it("still sizes in millimetres and points", () => {
    const block = printBlock();
    expect(block).toMatch(/\dmm/);
    expect(block).toMatch(/\dpt/);
  });

  it("no longer carries the layout that both media need", () => {
    // If these come back into the media query, the screen loses them again.
    const block = printBlock();
    expect(block).not.toContain('content: " · "');
    expect(block).not.toMatch(/\.print-maymeet-safe/);
    expect(block).not.toMatch(/grid-template-columns/);
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DemoBlock } from "@/engine/renderers/demo";
import { demoPlainText } from "@/lib/text";
import { parsePack } from "@/schema/pack";
import { readFileSync } from "node:fs";

/**
 * The demo register (#252).
 *
 * Johan, on a live screenshot of a demo block: "what is this anyways? looks
 * misleading". The block was rendered in the spoken hero's face on the spoken
 * hero's own plate token, told apart from a line she reads aloud only by the
 * ABSENCE of a quotation mark. These tests hold the two properties that make
 * the new register work, both of which are easy to regress silently.
 */

const base = { type: "demo" as const, materials: ["a leaf"] };

function html(block: Parameters<typeof DemoBlock>[0]["block"]) {
  return renderToStaticMarkup(<DemoBlock block={block} />);
}

describe("the demo block declares itself without a neighbour", () => {
  it("never reuses the spoken plate token or the old technique class", () => {
    const markup = html({
      ...base,
      move: "The dab and press",
      steps: [{ text: "Dab the glue onto the card.", mark: "m-dab" }, { text: "Lay the leaf down." }],
    });
    // The original defect, as a test: same fill, same class family as the hero.
    expect(markup).not.toContain("demo-plate");
    expect(markup).not.toContain("demo-technique");
    expect(markup).toContain("demo-move");
  });

  it("numbers the beats when there is an order to keep", () => {
    const markup = html({
      ...base,
      move: "The dab and press",
      steps: [{ text: "One." }, { text: "Two." }, { text: "Three." }],
    });
    expect(markup).toContain("demo-num");
    expect((markup.match(/demo-num/g) ?? []).length).toBe(3);
  });

  it("drops the numerals at a single beat, so it cannot read as a truncated list", () => {
    const markup = html({ ...base, move: "The wool ring", steps: [{ text: "Wrap it once." }] });
    expect(markup).not.toContain("demo-num");
    expect(markup).toContain("Wrap it once.");
  });

  it("renders the closing look as its own register, not as step n+1", () => {
    const markup = html({
      ...base,
      move: "The seed hello",
      steps: [{ text: "Pick a seed up." }, { text: "Rest it on your palm." }],
      look: "Look at its shape.",
    });
    expect(markup).toContain("demo-look");
    expect(markup).toContain("Look at its shape.");
    // the look never takes a numeral
    expect(markup.split("demo-look")[1]).not.toContain("demo-num");
  });

  it("keeps a step readable when its picture has not been drawn yet", () => {
    // The whole reason `mark` is optional: a pack ships its words before its
    // drawings. An unknown id must degrade, never throw and never blank.
    const markup = html({
      ...base,
      move: "The wool ring",
      steps: [{ text: "Wrap the wool once." }, { text: "Tie it loose.", mark: "m-nothing-drawn" }],
    });
    expect(markup).toContain("Wrap the wool once.");
    expect(markup).toContain("Tie it loose.");
  });
});

describe("demoPlainText gives every text consumer one answer", () => {
  it("leads on the move and terminates each beat", () => {
    expect(
      demoPlainText({
        move: "The gentle pick-up",
        steps: [{ text: "Lift one leaf" }, { text: "Turn it over." }],
        look: "Meet both sides.",
      })
    ).toBe("The gentle pick-up. Lift one leaf. Turn it over. Meet both sides.");
  });
});

describe("the shipped pack", () => {
  it("authors every demo block in the new shape, with drawn marks or none", () => {
    // The starter packs: autumn, and winter since Bark rubbings moved there.
    const packs = ["packs/autumn-starter.json", "packs/winter-starter.json"].map((file) =>
      parsePack(JSON.parse(readFileSync(file, "utf8")))
    );
    const demos: { move: string; steps: { text: string }[] }[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node && typeof node === "object") {
        const record = node as Record<string, unknown>;
        if (record.type === "demo") demos.push(record as never);
        Object.values(record).forEach(walk);
      }
    };
    walk(packs);
    expect(demos.length).toBe(15);
    for (const demo of demos) {
      expect(demo.move.length).toBeGreaterThan(0);
      expect(demo.steps.length).toBeGreaterThan(0);
    }
  });
});

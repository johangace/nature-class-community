import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { resolveAbility } from "@/lib/ability";
import { learnerContextForClass } from "@/lib/learner-context";
import { renderBlock } from "@/engine/registry";
import { renderPrintBlock } from "@/engine/print";
import { IntroduceDay } from "@/app/run/HybridJourney";
import { findSession } from "@/lib/pack";
import type { Block } from "@/schema/pack";

const line = {
  type: "say-aloud", text: "BASE-WORDING",
  abilityVariants: { reception: "RECEPTION-WORDING", y1: "Y1-WORDING", y2: "Y2-WORDING" },
} satisfies Block;

const cases = [
  { input: { preparationBand: "y1", classBand: "reception", yearGroup: "Year 2" }, band: "y1", resolvedBy: "preparation", text: "Y1-WORDING" },
  { input: { classBand: "reception", yearGroup: "Year 2" }, band: "reception", resolvedBy: "class", text: "RECEPTION-WORDING" },
  { input: { yearGroup: "  YEAR 2 " }, band: "y2", resolvedBy: "year-group", text: "Y2-WORDING" },
  { input: { yearGroup: "Nursery" }, band: null, resolvedBy: "base", text: "BASE-WORDING" },
  { input: {}, band: null, resolvedBy: "base", text: "BASE-WORDING" },
];

describe("one ability precedence across lesson surfaces", () => {
  it.each(cases)("resolves $input with provenance and matching wording", ({ input, band, resolvedBy, text }) => {
    const resolution = resolveAbility(input);
    expect(resolution).toEqual({ band, resolvedBy });
    const ability = resolution.band ?? undefined;
    const session = structuredClone(findSession("meet-your-tree")!.session);
    for (const phase of session.phases) {
      phase.blocks = phase.blocks.map((block) => {
        if (block.type === "say-aloud" || block.type === "teacher-note" || block.type === "circle-question") {
          return { ...block, text: line.text, abilityVariants: line.abilityVariants };
        }
        if (block.type === "conditions-line") return { ...block, fallbackText: line.text, abilityVariants: line.abilityVariants };
        return block;
      });
    }
    const surfaces = [
      renderToStaticMarkup(renderBlock(line, ability)),
      renderToStaticMarkup(renderPrintBlock(line, ability)),
      // The default and field runner share this component.
      renderToStaticMarkup(<IntroduceDay session={session} ability={ability} />),
    ];
    for (const markup of surfaces) expect(markup).toContain(text);
  });

  it("class switching cannot inherit another class's selection", () => {
    const first = learnerContextForClass({ abilityBand: "reception", yearGroup: "Year 2" });
    const second = learnerContextForClass({ yearGroup: "Year 1" });
    expect(first.abilityBand).toBe("reception");
    expect(second.abilityBand).toBe("y1");
    expect(resolveAbility({ classBand: second.abilityBand }).band).toBe("y1");
  });

  it("does not render unsupported band identities", () => {
    expect(resolveAbility({ preparationBand: "unknown", classBand: "unknown" })).toEqual({ band: null, resolvedBy: "base" });
  });
});

import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sessionSchema } from "@/schema/pack";
import { renderChildSheet, resolveSheetTemplate } from "@/engine/sheet-templates";
import { PrintPhase } from "@/engine/print-phase";
import { paginateFlashCards } from "@/app/print/FlashCards";

const pack = JSON.parse(readFileSync("packs/autumn-starter.json", "utf8"));
const session = sessionSchema.parse(pack.sessions.find((s: { id: string }) => s.id === "animal-leaf-masks"));

describe("the mask lesson supplies something to cut out", () => {
  it("selects a real mask template and preserves the authored reflection sheet", () => {
    expect(resolveSheetTemplate(session)).toBe("animal-mask");
    const html = renderToStaticMarkup(renderChildSheet(session, { blocks: session.childSheet, ability: "reception", folio: { where: "Autumn" } }));
    expect(html).toContain('class="mask-pattern"');
    expect(html.match(/class="mask-eye"/g)).toHaveLength(2);
    expect(html.match(/class="mask-hole"/g)).toHaveLength(2);
    expect(html).toContain("Stick one spare leaf here.");
    expect(html).toContain("actual size");
    expect(html).toContain("Check the fit");
  });
});

describe("long phases remain readable without losing authored cues", () => {
  it.each(["half", "full"] as const)("continues long phases in the %s deck", (size) => {
    const raw = [{ key: "long", heading: "A long phase", meta: null, lines:
      Array.from({ length: 12 }, (_, index) => ({ register: "spoken" as const, text: `Cue ${index}: ${"Look at the leaves around you. ".repeat(4)}` }))
    }];
    const pages = paginateFlashCards(raw, size);
    expect(pages.length).toBeGreaterThan(raw.length);
    expect(pages.flatMap((p) => p.lines)).toEqual(raw.flatMap((p) => p.lines));
    expect(new Set(pages.map((p) => p.key)).size).toBe(pages.length);
    expect(pages.some((p) => p.heading.endsWith("continued"))).toBe(true);
  });
  it("the shared script phase includes variants and the older-child instruction", () => {
    const html = renderToStaticMarkup(<PrintPhase number={1} ability="y1" phase={{ key: "make", title: "Make", stretch: "Try two different patterns.", blocks: [{ type: "say-aloud", text: "Choose a leaf." }], conditionVariants: [{ when: "wet", phase: { key: "indoors", title: "Indoors", blocks: [{ type: "teacher-note", text: "Bring the leaves inside." }] } }] }} />);
    expect(html).toContain("Try two different patterns.");
    expect(html).toContain("Bring the leaves inside.");
    expect(html).toContain("Choose a leaf.");
  });
});

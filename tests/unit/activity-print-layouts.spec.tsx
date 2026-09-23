import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { shelfPacksAllSeasons } from "@/lib/pack";
import { renderChildSheet, resolveSheetTemplate } from "@/engine/sheet-templates";
import { renderSheetBlock } from "@/engine/child-sheet";

const sessions = shelfPacksAllSeasons().flatMap((pack) => pack.sessions);

describe("every published activity has a purposeful printable", () => {
  it.each(sessions)("$title has a built layout in both the pack and offline copy", (session) => {
    expect(session.sheetTemplate).toBeTruthy();
    expect(resolveSheetTemplate(session)).toBe(session.sheetTemplate);
    expect(resolveSheetTemplate(session)).not.toBe("field-card");
    const offline = JSON.parse(readFileSync("public/offline/core-v1.json", "utf8"));
    expect(offline.sessions[session.id].sheetTemplate).toBe(session.sheetTemplate);
    const html = renderToStaticMarkup(renderChildSheet(session, { blocks: session.childSheet, ability: "reception", folio: { where: null } }));
    expect(html).toContain('data-logo="nature-class"');
    expect(html).not.toContain("Draw or stick something from today&#x27;s session here.");
  });
  it.each(["Whose seed is this?", "Meet the birds", "Meet the trees by their bark"])("does not draw leaves for %s", (prompt) => {
    const html = renderToStaticMarkup(renderSheetBlock({ type: "match-strip", prompt, cards: [{ name: "the oak", clue: "first clue" }, { name: "the birch", clue: "second clue" }] }, "reception")!);
    expect(html).not.toContain('class="cs-match-leaf"');
    expect(html).toContain("first clue");
  });
  it("still illustrates a leaf identification strip", () => {
    const html = renderToStaticMarkup(renderSheetBlock({ type: "match-strip", prompt: "Whose leaf is this?", cards: [{ name: "the oak", clue: "wavy" }, { name: "the birch", clue: "small" }] }, "reception")!);
    expect(html).toContain('class="cs-match-leaf"');
  });
});

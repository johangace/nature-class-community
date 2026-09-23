import { readFileSync } from "node:fs";
import { expect, test } from "./fixtures";

const release = JSON.parse(readFileSync("public/offline/core-v1.json", "utf8"));
const sessions = Object.values(release.sessions) as { id: string; title: string }[];

for (const session of sessions) {
  test(`${session.title}: the activity fits its paper and keeps usable drawing space`, async ({ page }) => {
    await page.goto(`/print?session=${session.id}&part=sheets`);
    await page.locator(".print-tabs").waitFor();
    await page.setViewportSize({ width: Math.floor(186 * 96 / 25.4), height: 1032 });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.locator(".activity-sheet, .cs-sheet, .mask-sheet, .a5-cutting-sheet").evaluateAll((sheets) => sheets.flatMap((sheet, index) => {
      const rect = sheet.getBoundingClientRect();
      const children = [...sheet.children];
      return children.some((child) => child.getBoundingClientRect().bottom > rect.bottom + 1) ? [index] : [];
    }));
    expect(overflow).toEqual([]);
    const panelOverflow = await page.locator(".activity-panel").evaluateAll((panels) => panels.filter((panel) => panel.getBoundingClientRect().bottom > panel.parentElement!.getBoundingClientRect().bottom + 1).length);
    expect(panelOverflow).toBe(0);
    const drawingHeights = await page.locator(".activity-drawing-space").evaluateAll((spaces) => spaces.map((space) => space.getBoundingClientRect().height));
    for (const height of drawingHeights) expect(height).toBeGreaterThanOrEqual(18 * 96 / 25.4 - 1);
    if (session.id === "summer-w3-a5-leaf-collage") {
      const size = await page.locator(".a5-art-card").boundingBox();
      expect(size?.width).toBeCloseTo(148 * 96 / 25.4, 0);
      expect(size?.height).toBeCloseTo(210 * 96 / 25.4, 0);
    }
  });
}

for (const session of sessions) {
  test(`${session.title}: both cue-card sizes contain their content`, async ({ page }) => {
    for (const size of ["half", "full"]) {
      await page.goto(`/print?session=${session.id}&part=flashcards&size=${size}`);
      await page.locator(".flash-card").first().waitFor();
      await page.setViewportSize({ width: Math.floor(186 * 96 / 25.4), height: 1032 });
      await page.emulateMedia({ media: "print" });
      await page.evaluate(() => document.fonts.ready);
      const overflow = await page.locator(".flash-card").evaluateAll((cards) => cards.flatMap((card, index) => {
        const bottom = card.getBoundingClientRect().bottom;
        return [...card.children].some((child) => child.getBoundingClientRect().bottom > bottom + 1) ? [index + 1] : [];
      }));
      expect(overflow, `${session.title}, ${size}`).toEqual([]);
    }
  });
}

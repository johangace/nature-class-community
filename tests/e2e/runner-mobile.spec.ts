import { test, expect } from "./fixtures";
import { passTheDay } from "./runner-controls";

// Exercise the real runner and CSS, including the compact board grid that
// previously inherited a 14rem card minimum wider than its phone column.
for (const viewport of [
  { width: 320, height: 568 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]) {
  test(`runner fits ${viewport.width}×${viewport.height} and pictures return to the question`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const fits = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width + 1);
    };
    await page.goto("/run?session=summer-w2-minibeast-hunting");
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await fits();
    await page.getByRole("button", { name: "Begin →", exact: true }).click();
    await passTheDay(page);
    await fits();
    await page.getByRole("button", { name: "Ask the class →", exact: true }).click();
    await fits();
    // The authored pictures sit under the third question, why minibeasts
    // matter (2026-09-13); the first two carry the species board.
    await page.getByRole("button", { name: "Next question →", exact: true }).click();
    await fits();
    await page.getByRole("button", { name: "Next question →", exact: true }).click();
    const picture = page.getByRole("button", { name: /^Look closer:/ }).first();
    await expect(picture).toBeVisible();
    await fits();
    const url = page.url();
    await picture.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("img")).toBeVisible();
    const close = dialog.getByRole("button", { name: "Put the picture away" });
    await expect(close).toBeInViewport();
    await close.click();
    await expect(dialog).toHaveCount(0);
    await expect(picture).toBeFocused();
    expect(page.url()).toBe(url);
    await page.getByRole("button", { name: "Present to the class", exact: true }).click();
    await fits();
    await page.getByRole("button", { name: "Outside time →", exact: true }).click();
    await page.getByRole("button", { name: "Begin outdoor activity →", exact: true }).click();
    await page.getByRole("button", { name: "Skip grounding", exact: true }).click();
    await fits();
  });
}

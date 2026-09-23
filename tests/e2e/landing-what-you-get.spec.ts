import { expect, test } from "./fixtures";

for (const width of [320, 375, 760, 1280]) {
  test(`What you get reads as one scannable list at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/welcome");
    const section = page.locator('section[aria-labelledby="offer-title"]');
    const features = section.locator("ul > li");
    await expect(features).toHaveCount(8);
    await expect(section.locator("details")).toHaveCount(0);
    for (let index = 0; index < 8; index++) {
      const feature = features.nth(index);
      await feature.scrollIntoViewIfNeeded();
      await expect(feature.locator("strong")).toBeVisible();
      await expect(feature.locator("span:not([aria-hidden])")).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const padding = await section.evaluate(el => parseFloat(getComputedStyle(el).paddingTop));
    // One rhythm across the page (2026-09-07): clamp(64px, 8vw, 110px).
    expect(padding).toBeGreaterThanOrEqual(64);
  });
}

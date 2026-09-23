import { expect, test } from "./fixtures";

const viewports = [320, 375, 760, 1280] as const;

for (const width of viewports) {
  test(`Rain or shine shows the formula and three lessons at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/welcome");

    const section = page.locator('section[aria-labelledby="intelligence-title"]');
    await expect(
      section.getByRole("heading", { name: "Every lesson, adapted for today." })
    ).toBeVisible();
    await section.scrollIntoViewIfNeeded();

    const formula = section.getByText(
      "Your place + The season + Today’s weather + What is living here = Today’s lesson",
      { exact: true }
    );
    await expect(formula).toBeAttached();
    const formulaBeforeCards = await formula.evaluate((element) => {
      const cards = document.querySelector('[aria-label="Seasonal Nature Intelligence examples"]');
      return Boolean(
        cards && element.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    });
    expect(formulaBeforeCards).toBe(true);

    const cards = section.locator('[aria-label="Seasonal Nature Intelligence examples"] > li');
    await expect(cards).toHaveCount(3);
    for (const [index, place] of ["London", "Los Angeles", "Vermont"].entries()) {
      const card = cards.nth(index);
      await expect(card.getByText(place, { exact: true })).toBeVisible();
      await expect(card.getByRole("heading")).toBeVisible();
      await expect(card.getByRole("heading", { level: 3 })).toBeVisible();
      const image = card.locator("img");
      await expect(image).toBeVisible();
      await expect
        .poll(() =>
          image.evaluate((element) => {
            const img = element as HTMLImageElement;
            return img.complete && img.naturalWidth > 0;
          })
        )
        .toBe(true);
    }

    const pageFits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(pageFits).toBe(true);

    const sectionBackground = await section.evaluate(
      (element) => getComputedStyle(element).backgroundColor
    );
    // The head's sky ground now lives on the school card in the audiences section.
    const schoolsBackground = await page
      .locator('section[aria-labelledby="audiences-title"] article')
      .first()
      .evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(sectionBackground).not.toBe(schoolsBackground);

    const cardBoxes = await cards.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return { width: box.width, x: box.x, right: box.right };
      })
    );
    if (width <= 760) {
      for (const box of cardBoxes) {
        expect(box.width).toBeLessThanOrEqual(width);
      }
    } else {
      // The collage intentionally drops the middle painting. Keep all three
      // side by side without requiring their top edges to align.
      let previousRight: number | undefined;
      for (const box of cardBoxes) {
        if (previousRight !== undefined) {
          expect(box.x).toBeGreaterThanOrEqual(previousRight);
        }
        previousRight = box.right;
      }
    }
  });
}

import { expect, test } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";

test.describe("public landing and teacher workspace routes", () => {
  test("keeps the landing at / and protects /today", async ({ page }) => {
    const browserErrors: string[] = [];
    const failedResponses: string[] = [];
    // This route test has no fixture database. Disable conditional passkey
    // mediation so the sign-in screen does not start an auth ceremony merely
    // by rendering; passkey behavior has its own database-backed coverage.
    await page.addInitScript(() => {
      Object.defineProperty(window, "PublicKeyCredential", {
        configurable: true,
        value: undefined,
      });
    });
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") browserErrors.push(message.text());
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        failedResponses.push(`${response.status()} ${response.url()}`);
      }
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    // The landing's level-1 heading is "Teach with Nature." (#914). "Bring
    // learning outside." is still on the page, but it is the subheader
    // paragraph under the title now, not a heading, so this reads the h1 the
    // page actually renders rather than the copy it used to carry.
    await expect(
      page.getByRole("heading", { level: 1, name: "Teach with Nature." })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.locator('a[href="/today"]')).toHaveCount(0);

    const accessibility = await new AxeBuilder({ page }).analyze();
    expect(
      accessibility.violations.filter(({ impact }) =>
        impact === "serious" || impact === "critical"
      )
    ).toEqual([]);

    await page.goto("/today");
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in to save your activities" })
    ).toBeVisible();
    expect(browserErrors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });
});

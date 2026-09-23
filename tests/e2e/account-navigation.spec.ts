import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "./fixtures";
import { seedSignedInTeacher } from "./seed";

for (const viewport of [
  { name: "phone", width: 320, height: 812 },
  { name: "iPad", width: 768, height: 1024 },
]) {
  test(`Profile navigation opens Account separately from My classes on ${viewport.name}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const teacher = await seedSignedInTeacher(page);

    try {
      const oak = await teacher.addClass("Oak Class");

      for (const path of ["/season", "/journal"]) {
        await page.goto(path);
        const brandBox = await page
          .getByRole("link", { name: "Nature Class, back to today" })
          .boundingBox();
        const accountBox = await page
          .getByRole("link", { name: "Profile" })
          .boundingBox();
        expect(brandBox).not.toBeNull();
        expect(accountBox).not.toBeNull();
        expect(accountBox!.y).toBeGreaterThan(viewport.height - 140);
        expect(accountBox!.y + accountBox!.height).toBeLessThanOrEqual(viewport.height - 12);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const scrolledBox = await page.getByRole("link", { name: "Profile" }).boundingBox();
        expect(scrolledBox!.y).toBeCloseTo(accountBox!.y, 0);
        await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Profile" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Lessons", exact: true })).toBeVisible();
      }

      await page.goto("/classes");
      await expect(page.getByRole("heading", { name: "My classes" })).toBeVisible();
      await expect(page.getByText("Signed in as")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

      // The chip on the class card opens the place page as that class (#913).
      const grounds = page.getByRole("link", {
        name: "Open Willow Class place",
      });
      await expect(grounds).toBeVisible();
      await grounds.click();
      await expect(page).toHaveURL(
        new RegExp(`/world\\?classId=${teacher.classId}$`),
      );
      await expect(
        page.getByRole("heading", { name: "Test Primary", exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(
        page.getByRole("heading", { name: "Add or update place information" }),
      ).toBeVisible();

      await page.goto("/classes");
      const oakCard = page.getByRole("listitem").filter({
        has: page.getByRole("heading", { name: "Oak Class" }),
      });
      await oakCard.getByRole("link", { name: "Open Oak Class place" }).click();
      await expect(page).toHaveURL(new RegExp(`/world\\?classId=${oak.id}$`));
      await expect(
        page.getByRole("heading", { name: "Test Primary", exact: true }),
      ).toBeVisible({ timeout: 30_000 });

      await page.goto("/classes");

      const account = page.getByRole("link", { name: "Profile" });
      await expect(account).toBeVisible();
      const box = await account.boundingBox();
      expect(box?.width).toBeGreaterThanOrEqual(44);
      expect(box?.height).toBeGreaterThanOrEqual(44);

      await account.focus();
      await expect(account).toBeFocused();
      await account.press("Enter");

      await expect(page).toHaveURL(/\/account$/);
      await expect(
        page.getByRole("heading", { name: "Account", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(teacher.email)).toBeVisible();
      await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Manage my classes" })).toBeVisible();

      const serious = (await new AxeBuilder({ page }).analyze()).violations.filter(
        (violation) => violation.impact === "serious" || violation.impact === "critical",
      );
      expect(serious).toHaveLength(0);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows).toBe(false);
    } finally {
      await teacher.cleanup();
    }
  });
}

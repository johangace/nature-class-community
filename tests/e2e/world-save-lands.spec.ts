import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { seedSignedInTeacher } from "./seed";

/**
 * GROUNDS SAVES, AND THE PAGE SHE COMES BACK TO AGREES (nc#1286).
 *
 * `/world`'s save is a server action, and until this ticket it was followed by
 * `router.refresh()`. That shape drops the re-render about one hydrated click
 * in nine (the measurements are on #1286 and in the comment on `setWorld`), so
 * the tree the client holds for this page can keep the answer she replaced.
 *
 * What this pins is the teacher's version of that: save, walk away to another
 * tab and come back — both as in-app navigations, never a reload, because a
 * reload always shows fresh data and would pass whatever the router did — and
 * the value she saved is the one on the page.
 *
 * Run it under `--repeat-each` when touching this control. A single pass is
 * not evidence for a failure that is intermittent by nature.
 */
test.use({ serviceWorkers: "block" });

test("a saved grounds feature is still there after walking away and back", async ({ page }) => {
  test.setTimeout(120_000);
  const teacher = await seedSignedInTeacher(page);
  const prisma = new PrismaClient();

  try {
    await page.context().addCookies([
      {
        name: "nc-class",
        value: teacher.classId,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.goto(`/world?classId=${teacher.classId}`);

    const group = page.getByRole("group", { name: "What is in your grounds" });
    const feature = group.getByRole("button").first();
    const featureName = (await feature.innerText()).trim();
    await expect(feature).toHaveAttribute("aria-pressed", "false");
    await feature.click();
    await expect(feature).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: "Save place information" }).click();
    await expect(page.getByText("Saved.")).toBeVisible();

    // It really is in the database: a screen that agrees with itself while the
    // row says otherwise is the failure this file exists for, in reverse.
    await expect
      .poll(async () => {
        const row = await prisma.class.findUniqueOrThrow({
          where: { id: teacher.classId },
          select: { siteFeatures: true },
        });
        return row.siteFeatures;
      })
      .toContain(featureName);

    // Away and back without a reload: the tab is an in-app link and Back is
    // served from the router's own cache, which is where a re-render that
    // never landed keeps the answer she replaced.
    await page.getByRole("link", { name: "Classes" }).click();
    await expect(page).toHaveURL(/\/classes/);
    await page.goBack();
    await page.waitForURL(/\/world/);

    const group2 = page.getByRole("group", { name: "What is in your grounds" });
    await expect(group2).toBeVisible({ timeout: 30_000 });
    // A selected option renders its own tick into the label, so the name is
    // "✓ a pond" once it is on: match the end of it rather than the whole.
    const again = group2.getByRole("button", { name: new RegExp(`${featureName}$`) });
    await expect(again).toHaveAttribute("aria-pressed", "true", { timeout: 30_000 });
  } finally {
    await prisma.$disconnect();
    await teacher.cleanup();
  }
});

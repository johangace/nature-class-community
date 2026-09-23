import { PrismaClient } from "@prisma/client";
import { expect, test } from "./fixtures";
import { seedSignedInTeacher } from "./seed";

test("family management preserves ages and can add another family without a school grade", async ({ page }) => {
  const owner = await seedSignedInTeacher(page);
  const db = new PrismaClient();
  try {
    await db.class.update({ where: { id: owner.classId }, data: {
      name: "My family", groupType: "family", ageRange: "7–9", yearGroup: "", abilityBand: null,
    } });
    await page.goto("/classes");
    await expect(page.getByRole("heading", { name: "My groups", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Groups", exact: true })).toBeVisible();
    await expect(page.getByText("Ages 7–9", { exact: true })).toBeVisible();
    await expect(page.getByText("teaching now", { exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Who is this for?")).toHaveValue("family");
    await page.getByLabel("What age range?").selectOption("4–6");
    await page.getByLabel("Place name", { exact: true }).fill("Local park");
    await page.getByRole("button", { name: "Add group", exact: true }).click();
    await expect(page.getByText("Ages 4–6", { exact: true })).toBeVisible();
    const made = await db.class.findFirst({ where: { teacherId: owner.userId, school: "Local park" } });
    expect(made).toMatchObject({ name: "My family", groupType: "family", ageRange: "4–6", yearGroup: "", abilityBand: null });
    // A school remains a class even in an account that also has a family.
    await page.getByLabel("Who is this for?").selectOption("school");
    await expect(page.getByLabel("Class name (optional)")).toBeVisible();
  } finally {
    await owner.cleanup();
    await db.$disconnect();
  }
});

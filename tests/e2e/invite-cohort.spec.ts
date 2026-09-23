import { PrismaClient } from "@prisma/client";
import { expect, test } from "./fixtures";
import { seedSignedInTeacherNoClass } from "./seed";

test.use({ serviceWorkers: "block" });

/**
 * Join link to onboarding to the teacher's record (#821).
 *
 * The invite link carries a neutral cohort code next to the school's name.
 * The code has to survive the sign-in round trip the same way the school's
 * name does, land on the teacher's record when setup finishes, and come back
 * from that record as the `invite_cohort` identify trait (asserted on the
 * trait builder in tests/unit/invite-cohort.spec.ts, because analytics is dark
 * in this suite).
 */
test("an invited teacher's cohort is carried from /join through setup onto her record", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const teacher = await seedSignedInTeacherNoClass(page);
  const prisma = new PrismaClient();

  try {
    await page.goto("/join?school=Test%20Primary&cohort=Autumn-A");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Test Primary");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("nature-class.join.cohort")))
      .toContain("autumn-a");
    // The code is remembered, never shown.
    await expect(page.locator("body")).not.toContainText("autumn-a");

    await page.route("**/api/geocode?*", (route) =>
      route.fulfill({
        json: { results: [{ id: "p1", label: "Gunnersbury Park, Ealing", lat: 51.4936, lng: -0.2875 }] },
      })
    );
    await page.route("**/api/outside?*", (route) => route.fulfill({ json: { place: null } }));

    await page.goto("/start");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Address, postcode or place").fill("Gunnersbury");
    await page.getByRole("button", { name: "Gunnersbury Park, Ealing" }).click();
    await page.getByRole("button", { name: "Show activities" }).click();
    await expect(page).toHaveURL(/\/today/, { timeout: 30_000 });

    const stored = await prisma.user.findUnique({
      where: { id: teacher.userId },
      select: { inviteCohort: true },
    });
    expect(stored?.inviteCohort).toBe("autumn-a");
    // Taken once: nothing is left on the device for the next teacher.
    expect(
      await page.evaluate(() => window.localStorage.getItem("nature-class.join.cohort"))
    ).toBeNull();
  } finally {
    await prisma.$disconnect();
    await teacher.cleanup();
  }
});

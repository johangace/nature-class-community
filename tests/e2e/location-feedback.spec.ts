import { PrismaClient } from "@prisma/client";
import { expect, test } from "./fixtures";
import { seedSignedInTeacher } from "./seed";

test.use({ serviceWorkers: "block" });

test("a failed location is explained beneath the control, and the place can be typed", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  const teacher = await seedSignedInTeacher(page);
  // The seed places the class; this flow is about the class that has no
  // place yet, the state Johan's screenshot and #875 were taken in.
  const prisma = new PrismaClient();
  await prisma.class.update({
    where: { id: teacher.classId },
    data: { lat: null, lng: null },
  });

  try {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "geolocation", {
        configurable: true,
        value: {
          getCurrentPosition: (
            _success: PositionCallback,
            failure?: PositionErrorCallback
          ) => {
            failure?.({
              code: 3,
              message: "Timed out in test",
              PERMISSION_DENIED: 1,
              POSITION_UNAVAILABLE: 2,
              TIMEOUT: 3,
            });
          },
        },
      });
    });

    await page.goto("/today");
    const context = page.getByLabel("Current teaching context");
    await expect(context).toContainText("location not set");
    await context.getByRole("link", { name: "Change place" }).click();
    const chooser = page.locator("details").filter({ hasText: "Choose another place" });
    const locationButton = chooser.getByRole("button", {
      name: "Use current location",
    });
    await locationButton.click();

    const feedback = chooser.getByRole("status");
    await expect(feedback).toHaveText(
      "Location timed out. Try again, or type the place below."
    );

    const buttonBox = await locationButton.boundingBox();
    const feedbackBox = await feedback.boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(feedbackBox).not.toBeNull();
    expect(buttonBox!.height).toBeLessThanOrEqual(46);
    expect(feedbackBox!.y).toBeGreaterThanOrEqual(buttonBox!.y + buttonBox!.height);
    await expect(feedback).toHaveCSS("font-style", "normal");
    await expect(feedback).not.toHaveCSS("color", "rgb(76, 125, 56)");
    await page.screenshot({
      path: testInfo.outputPath("location-feedback.png"),
      fullPage: false,
    });

    // The typed way in (#181): the same /api/geocode route /start reads,
    // answered here so the test owns the place, and the pick lands the
    // class at those coordinates through setClassLocation.
    await page.route("**/api/geocode?*", (route) =>
      route.fulfill({
        json: {
          results: [
            { id: "p1", label: "Gunnersbury Park, Ealing", lat: 51.4936, lng: -0.2875 },
          ],
        },
      })
    );
    const field = chooser.getByLabel("Or type the school, park or town");
    await field.fill("Gunnersbury");
    await chooser.getByRole("button", { name: "Find" }).click();
    await expect(chooser.getByRole("button", { name: "Gunnersbury Park, Ealing" })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("location-typed.png"),
      fullPage: false,
    });
    await chooser.getByRole("button", { name: "Gunnersbury Park, Ealing" }).click();
    await expect(page.getByLabel("Current teaching context")).not.toContainText(
      "location not set",
      { timeout: 30_000 }
    );
    const stored = await prisma.class.findUnique({
      where: { id: teacher.classId },
      select: { lat: true, lng: true },
    });
    // Rounded to ~100 m on the way in, exactly as a tapped position is.
    expect(stored).toEqual({ lat: 51.494, lng: -0.287 });
  } finally {
    await prisma.$disconnect();
    await teacher.cleanup();
  }
});

import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { seedSignedInTeacher } from "./seed";

// This flow exercises live server actions. Offline/service-worker behaviour is
// covered by the dedicated golden path; letting a newly installed worker claim
// this page mid-action makes the navigation assertion test worker timing.
test.use({ serviceWorkers: "block" });

test("a teacher shares, reassigns and separates Grounds without changing active class", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const teacher = await seedSignedInTeacher(page);
  const prisma = new PrismaClient();
  const oak = await teacher.addClass("Oak Class", "Y2");

  try {
    const mainGrounds = await prisma.grounds.create({
      data: {
        name: "Test Primary main grounds",
        school: "Test Primary",
        teacherId: teacher.userId,
        lat: 51.546,
        lng: -0.105,
        climate: "oceanic",
        habitats: ["trees"],
        siteFeatures: ["a pond"],
        siteNotes: ["Log pile beside the playing field"],
        reach: "grounds",
      },
    });
    const annexe = await prisma.grounds.create({
      data: {
        name: "Annexe garden",
        school: "Test Primary",
        teacherId: teacher.userId,
        siteFeatures: ["raised beds"],
        reach: "doorstep",
        placeRead: { place: "Islington" },
        placeReadAt: new Date("2026-09-01T08:00:00Z"),
      },
    });
    await prisma.class.updateMany({
      where: { id: { in: [teacher.classId, oak.id] }, teacherId: teacher.userId },
      data: {
        groundsId: mainGrounds.id,
        lat: mainGrounds.lat,
        lng: mainGrounds.lng,
        climate: mainGrounds.climate,
        grounds: mainGrounds.habitats,
        siteFeatures: mainGrounds.siteFeatures,
        siteNotes: mainGrounds.siteNotes,
        reach: mainGrounds.reach,
      },
    });
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

    await page.goto("/today");
    const context = page.getByLabel("Current teaching context");
    // Grounds lead the header; class and Change place share the second line.
    await expect(context).toContainText("Willow Class");
    await expect(context).toContainText(mainGrounds.name);
    await expect(
      context.getByRole("button", { name: "Use current location" })
    ).toHaveCount(0);
    await context.getByRole("link", { name: "Change place" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/world\\?classId=${teacher.classId}&change=1`)
    );
    await expect(page.locator("details").filter({ hasText: "Choose another place" })).toHaveAttribute(
      "open",
      ""
    );

    await expect(page.getByRole("button", { name: "Use current location" })).toBeVisible();
    await page.goto("/classes");
    // The place is drawn once and names its classes (#913); each class's
    // chip opens the place page as that class.
    await expect(page.getByText("Used by Willow Class and Oak Class")).toBeVisible();
    await page.getByRole("link", { name: "Open Oak Class place" }).click();
    await expect(page).toHaveURL(new RegExp(`/world\\?classId=${oak.id}`));
    await expect(page.getByRole("heading", { level: 1, name: mainGrounds.name })).toBeVisible();
    await expect(page.getByText("Shared with Willow Class.")).toBeVisible();

    await page.getByText("Choose another place", { exact: true }).click();
    await page.getByLabel(/Annexe garden/).check();
    await page.getByRole("button", { name: "Use selected place" }).click();
    await expect(page.getByRole("heading", { level: 1, name: annexe.name })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByText("Choose another place", { exact: true }).click();
    await page.getByLabel("Create a separate place").fill("Oak garden");
    await page.getByRole("button", { name: "Create separate place" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Oak garden" })).toBeVisible({
      timeout: 30_000,
    });

    const saved = await prisma.class.findUnique({
      where: { id: oak.id },
      select: { groundsId: true, groundsProfile: true },
    });
    expect(saved?.groundsProfile).toMatchObject({
      name: "Oak garden",
      siteFeatures: ["raised beds"],
      reach: "doorstep",
      placeRead: { place: "Islington" },
      placeReadAt: new Date("2026-09-01T08:00:00Z"),
    });

    await page.goto("/classes");
    // The class card, not the place card that also names Willow (#913).
    await expect(
      page.getByRole("listitem").filter({
        has: page.getByRole("heading", { name: "Willow Class" }),
      })
    ).toContainText("teaching now");
  } finally {
    await teacher.cleanup();
    await prisma.$disconnect();
  }
});

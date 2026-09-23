import { expect, test } from "./fixtures";
import { PrismaClient } from "@prisma/client";
import { seedSignedInTeacher } from "./seed";

/**
 * THE MEMORY STRIP, ON THE REAL PRIMER (#509).
 *
 * The unit tests prove the composition and the markup. This proves the two
 * things only a running app can: that a teacher who told us something meets it
 * on the page she prepares from, and that the retire beside it actually writes
 * — through `setWorld`, all the way to the class row, and gone when the page
 * comes back.
 *
 * That round trip is the whole ticket. A control that fades a row out on the
 * client and leaves the database holding the fact would pass every test that
 * stops at the markup, and would tell her the wild corner is still there the
 * next time she opens the lesson.
 */

// Live writes over a form post, same reason as the shared-Grounds flow: a
// service worker claiming the page mid-submit makes this test worker timing.
test.use({ serviceWorkers: "block" });

test("a teacher reads what we remember, and retires a fact that stopped being true", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const teacher = await seedSignedInTeacher(page);
  const prisma = new PrismaClient();

  try {
    await prisma.class.update({
      where: { id: teacher.classId },
      data: {
        siteFeatures: ["a log pile"],
        siteNotes: ["a shallow pond behind the sheds"],
        reach: "grounds",
      },
    });
    // The ledger row #360 writes when she confirms what the assistant read.
    await prisma.worldFact.create({
      data: {
        classId: teacher.classId,
        kind: "note",
        value: "a shallow pond behind the sheds",
        sourceText: "there's a shallow pond behind the sheds",
        confidence: 0.9,
        status: "confirmed",
        provenance: "teacher-stated",
        decidedAt: new Date("2026-08-12T09:00:00Z"),
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

    await page.goto("/session/primer");

    const strip = page.getByRole("region", {
      name: "What we remember about your grounds",
    });
    await expect(strip).toBeVisible();
    // Her own sentence, quoted, not the value we extracted from it.
    await expect(strip).toContainText("there's a shallow pond behind the sheds");
    await expect(strip).toContainText("Your words, 12 August.");
    // A fact with no sentence behind it reads plainly and is still hers.
    await expect(strip).toContainText("In your grounds: a log pile.");
    await expect(strip).toContainText("Your answer, from setting up your grounds.");

    await strip.getByRole("button", { name: "Not any more: In your grounds: a log pile." }).click();

    // She stays on the page she was reading, and the row is gone from it.
    // Every server-action version of this control failed here about half the
    // time with the write already committed; see the route handler's comment.
    await expect(strip).not.toContainText("In your grounds: a log pile.");
    // The row she still recognises is untouched by the retire beside it.
    await expect(strip).toContainText("there's a shallow pond behind the sheds");

    const after = await prisma.class.findUniqueOrThrow({
      where: { id: teacher.classId },
      select: { siteFeatures: true, siteNotes: true, reach: true },
    });
    expect(after.siteFeatures).toEqual([]);
    expect(after.siteNotes).toEqual(["a shallow pond behind the sheds"]);
    expect(after.reach).toBe("grounds");

    // The ledger keeps what she said. The correction IS the history, so a
    // retired fact must not take its own record away with it.
    const ledger = await prisma.worldFact.findMany({ where: { classId: teacher.classId } });
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.status).toBe("confirmed");
  } finally {
    await prisma.$disconnect();
    await teacher.cleanup();
  }
});

test("a teacher who has told us nothing gets no empty frame", async ({ page }) => {
  test.setTimeout(90_000);
  const teacher = await seedSignedInTeacher(page);

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

    await page.goto("/session/primer");

    await expect(page.getByRole("heading", { name: "Pre-reading" })).toBeVisible();
    await expect(page.getByText("What we remember about your grounds")).toHaveCount(0);
  } finally {
    await teacher.cleanup();
  }
});

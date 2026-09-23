import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { loadAuthoredPack, packOrder } from "@/lib/pack";
import { seedSignedInTeacher } from "./seed";
import { expect, test } from "./fixtures";

/** Browser print geometry, independent of device pixels and the screen preview. */
test("the full-page mask keeps its scale and separates the making instructions", async ({ page }) => {
  await page.goto("/print?session=animal-leaf-masks&part=sheets");
  await page.locator(".mask-pattern").waitFor();
  await page.setViewportSize({ width: Math.floor(186 * 96 / 25.4), height: 1032 });
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => document.fonts.ready);
  const geometry = await page.locator(".mask-template-page").evaluate((sheet) => {
    const mask = sheet.querySelector(".mask-pattern")!.getBoundingClientRect();
    const caption = sheet.querySelector(".mask-cut-caption")!.getBoundingClientRect();
    const eyes = [...sheet.querySelectorAll(".mask-eye")].map((eye) => eye.getBoundingClientRect());
    return { width: mask.width, eyeSpacing: eyes[1]!.x - eyes[0]!.x, bottom: caption.bottom, pageBottom: sheet.getBoundingClientRect().bottom, page: getComputedStyle(sheet).page };
  });
  expect(geometry.width).toBeCloseTo(260 * 96 / 25.4, 0);
  expect(geometry.eyeSpacing).toBeCloseTo(62 * 96 / 25.4, 0);
  expect(geometry.page).toBe("mask-template");
  await expect(page.locator(".mask-template-page .mask-steps")).toHaveCount(0);
  await expect(page.locator(".mask-instructions .mask-steps")).toHaveCount(1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.pageBottom);
});

for (const size of ["half", "full"]) {
  test(`the ${size} mask lesson cards keep all content inside the printed card`, async ({ page }) => {
    await page.goto(`/print?session=animal-leaf-masks&part=flashcards&size=${size}`);
    await page.locator(".flash-card").first().waitFor();
    await page.setViewportSize({ width: Math.floor(186 * 96 / 25.4), height: 1032 });
    await page.emulateMedia({ media: "print" });
    await page.evaluate(() => document.fonts.ready);
    const overflow = await page.locator(".flash-card").evaluateAll((cards) => cards.flatMap((card, index) => {
      const bottom = card.getBoundingClientRect().bottom;
      return [...card.children].some((child) => child.getBoundingClientRect().bottom > bottom + 1) ? [index + 1] : [];
    }));
    expect(overflow).toEqual([]);
  });
}

/**
 * WHAT THE DECK WAS PREPARED FOR, measured on paper rather than in markup
 * (#1245).
 *
 * The first attempt at this shipped inside `.flash-head`, which `@media print`
 * hides outright, and every server-rendered assertion passed against a notice
 * that was never on the sheet. `renderToStaticMarkup` applies no CSS, so only a
 * browser under `emulateMedia("print")` can tell the two apart — which is what
 * this file already does for the rest of the deck's geometry.
 *
 * Three things have to be true at once, and each one alone is a way to ship the
 * bug back:
 *
 *   the line is PAINTED — a real box with a real height, on every card
 *   no card OVERFLOWS — the footer's extra rows are paid for out of the budget
 *     `paginateFlashCards` reserves, not out of the last authored line
 *   the notice's LINE COUNT is what the reserve assumed — the reserve is per
 *     printed line, so an unpredicted wrap is budget spent without being
 *     accounted for, and it would show up later as a clipped line on some other
 *     session rather than here
 */
const PREPARED_AT = "2026-09-10T13:30:00.000Z";

/**
 * The sessions measured here are not a sample. They are the TIGHTEST printed
 * card at each size — the gap between the last authored line and the folio,
 * measured across all 595 half cards and 587 full cards — plus the session the
 * rest of this file already drives. A notice that fits the tightest card fits
 * every card; a notice measured on an average one proves nothing.
 */
const TIGHTEST = { half: "seed-searchers", full: "garden-w5-potion-lab" } as const;

/**
 * The session as the PREPARATION STORE would have frozen it, which is the
 * authored session after `loadAuthoredPack`, not the raw JSON on disk. Seeding
 * the file instead renders a deck the product never produces — it came out a
 * card shorter here — and a geometry measured on that deck proves nothing about
 * the one a teacher prints.
 */
function authoredSession(sessionId: string) {
  for (const packId of packOrder) {
    const source = loadAuthoredPack(packId).sessions.find((session) => session.id === sessionId);
    if (source) return source;
  }
  throw new Error(`${sessionId} is no longer in any pack`);
}

async function seedPreparedDeck(
  teacherId: string,
  prisma: PrismaClient,
  sessionId: string,
) {
  const source = authoredSession(sessionId);

  const id = `e2e-prepared-${randomUUID()}`;
  await prisma.preparedLesson.create({
    data: {
      id,
      teacherId,
      requestKey: id,
      sessionId,
      inputHash: "e2e",
      sourceRevision: "e2e-source",
      contextRevision: "e2e-context",
      sourceSnapshot: source as object,
      contextSnapshot: {
        revisionId: "e2e-context",
        placeKey: { resolution: "koppen", value: "Cfb", resolvedBy: "pack-key@1" },
        ability: { band: "y1", resolvedBy: "ability@1/class-row" },
        weather: {
          reach: "the-hour",
          conditionKind: "wet",
          reasonCode: null,
          observedAt: "2026-09-10T07:04:00.000Z",
          // The longest honest form of the line: a reading with a limit on it.
          // Measuring the short one would leave the wrap untested.
          validUntil: "2026-09-10T15:00:00.000Z",
          source: "pointmoon@2026-09-10",
        },
        siteProfile: null,
        plannedAt: PREPARED_AT,
        plannedTimeZone: "Europe/London",
        jurisdiction: "england",
        locale: "en-GB",
        teacherNotes: [],
        capturedAt: "2026-09-10T07:04:00.000Z",
      },
      status: "pending",
    },
  });
  return id;
}

for (const size of ["half", "full"] as const) {
  for (const sessionId of [TIGHTEST[size], "animal-leaf-masks"]) {
    test(`the ${size} ${sessionId} deck says what it was prepared for, on paper`, async ({ page }) => {
      const prisma = new PrismaClient();
      const teacher = await seedSignedInTeacher(page);
      try {
        const prepared = await seedPreparedDeck(teacher.userId, prisma, sessionId);
        await page.goto(
          `/print?session=${sessionId}&part=flashcards&size=${size}&prepared=${prepared}`,
        );
        await page.locator(".flash-card").first().waitFor();
        await page.setViewportSize({ width: Math.floor(186 * 96 / 25.4), height: 1032 });
        await page.emulateMedia({ media: "print" });
        await page.evaluate(() => document.fonts.ready);

        const measured = await page.locator(".flash-card").evaluateAll((cards) => {
          const mm = 96 / 25.4;
          return cards.map((card, index) => {
            const bottom = card.getBoundingClientRect().bottom;
            const line = card.querySelector(".flash-prepared");
            const box = line?.getBoundingClientRect();
            const lineHeight = line ? parseFloat(getComputedStyle(line).lineHeight) : 0;
            return {
              card: index + 1,
              painted: Boolean(
                line && box && box.height > 0 && getComputedStyle(line).display !== "none",
              ),
              // How many printed lines the notice actually occupies. This is
              // the number `paginateFlashCards` assumes when it reserves
              // footer height, and the only place the two can be compared.
              lines: box && lineHeight ? Math.round(box.height / lineHeight) : 0,
              text: line?.textContent ?? "",
              overflows: [...card.children].some(
                (child) => child.getBoundingClientRect().bottom > bottom + 1,
              ),
            };
          });
        });

        expect(measured.length).toBeGreaterThan(1);
        // Painted on EVERY card. The cover card is the one card that is not in
        // her hand when the sky disagrees with the plan.
        expect(measured.filter((card) => !card.painted).map((card) => card.card)).toEqual([]);
        // Nothing clipped. On the tightest printed card in the whole pack, at
        // this size, which is what makes this assertion worth making.
        expect(measured.filter((card) => card.overflows).map((card) => card.card)).toEqual([]);
        for (const card of measured) {
          expect(card.text).toContain("Prepared for Thu 10 September at 14:30 (Europe/London).");
          expect(card.text).toContain(
            "Conditions: wet when the reading was taken, not at that hour.",
          );
          expect(card.text).toContain("Not a reading past 10 September at 16:00.");
        }
        // The reserve in `paginateFlashCards` is per printed line, so a wrap
        // that the model did not predict is a card's worth of budget spent
        // without being accounted for. Pinned here rather than inferred.
        expect([...new Set(measured.map((card) => card.lines))]).toEqual([2]);
      } finally {
        await prisma.$disconnect();
        await teacher.cleanup();
      }
    });
  }
}

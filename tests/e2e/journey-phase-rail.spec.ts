import { test, expect } from "./fixtures";
import { passTheDay } from "./runner-controls";

/**
 * #457: "Phone phase rail hides Living and Circle with no visible overflow cue."
 *
 * The parts strip is the only thing on the phone that says how much lesson is
 * left. It was a single scrolling row of `flex: none` chips whose scrollbar is
 * hidden on purpose (`journey.module.css`, `.tabs`), so at 390px it measured
 * 532px: Count, See, Hear and Alive on screen, Living and Circle past the right
 * edge, and nothing anywhere saying the row continued. A teacher could not see
 * the shape of her own lesson and could not reach the last two parts without
 * discovering a gesture the design had made invisible.
 *
 * Asserted against geometry rather than a class name, because the bug was
 * geometric: "does any chip sit outside the rail it lives in" is the actual
 * question, and it stays the right question whatever the fix is next time.
 *
 * Signed-out demo path, matching journey-resume.spec.ts and the ticket's repro.
 */

const PHONE_WIDTHS = [375, 390];

test.describe("phase rail (#457)", () => {
  for (const width of PHONE_WIDTHS) {
    test(`shows every part of the lesson at ${width}px, none clipped`, async ({ page }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.goto("/run?session=summer-w1-counting-life");
      // The introduction is said inside, on the board, and the class goes out
      // to ground after it (2026-09-06, #1004): the topic, the day, the
      // question, "Leave the screen", then "Ground the class". Skipping the grounding
      // lands on the first part, where the walk's last settle card lands.
      await page.getByRole("button", { name: "Begin →" }).click();
      await passTheDay(page);
      await page.getByRole("button", { name: "Ask the class →" }).click();
      await page.getByRole("button", { name: "Outside time →" }).click();
      await page.getByRole("button", { name: "Begin outdoor activity →" }).click();
      await page.getByRole("button", { name: "Skip grounding" }).click();
      const rail = page.getByRole("navigation", { name: "Parts of this lesson" });
      await expect(rail).toBeVisible();

      // Every authored part is present and named, Circle included — it was the
      // one furthest off the edge, and it is the part the lesson ends on.
      for (const part of ["Count", "See", "Hear", "Alive", "Living", "Circle"]) {
        await expect(rail.getByRole("button", { name: part })).toBeVisible();
      }

      const geometry = await rail.evaluate((node: HTMLElement) => {
        const bounds = node.getBoundingClientRect();
        return {
          overflowing: node.scrollWidth > node.clientWidth,
          chips: Array.from(node.querySelectorAll("button")).map((chip) => {
            const box = chip.getBoundingClientRect();
            return {
              label: chip.textContent?.trim() ?? "",
              // One pixel of tolerance for sub-pixel layout rounding.
              clipped: box.right > bounds.right + 1 || box.left < bounds.left - 1,
              height: box.height,
            };
          }),
        };
      });

      // The rail no longer hides a tail behind an invisible scrollbar.
      expect(geometry.overflowing).toBe(false);

      const clipped = geometry.chips.filter((chip) => chip.clipped).map((chip) => chip.label);
      expect(clipped).toEqual([]);

      // The reason the chips were too wide to fit is the reason they must stay
      // wide: 44px is the app's outdoor tap minimum (#268). Wrapping must not
      // have been bought by shrinking the target.
      for (const chip of geometry.chips) {
        expect(chip.height).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test("keeps the parts on one row where there is room for one", async ({ page }) => {
    // The fix is for the phone. A tablet or a desktop had no problem and should
    // not inherit a wrapped rail.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/run?session=summer-w1-counting-life");
    // The introduction is said inside, on the board, and the class goes out
    // to ground after it (2026-09-06, #1004): the topic, the day, the
    // question, "Leave the screen", then "Ground the class". Skipping the grounding
    // lands on the first part, where the walk's last settle card lands.
    await page.getByRole("button", { name: "Begin →" }).click();
    await passTheDay(page);
    await page.getByRole("button", { name: "Ask the class →" }).click();
    await page.getByRole("button", { name: "Outside time →" }).click();
    await page.getByRole("button", { name: "Begin outdoor activity →" }).click();
    await page.getByRole("button", { name: "Skip grounding" }).click();
    const rail = page.getByRole("navigation", { name: "Parts of this lesson" });
    const rows = await rail.evaluate(
      (node: HTMLElement) =>
        new Set(
          Array.from(node.querySelectorAll("button")).map((chip) =>
            Math.round(chip.getBoundingClientRect().top)
          )
        ).size
    );
    expect(rows).toBe(1);
  });
});

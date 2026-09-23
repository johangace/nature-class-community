import { test, expect, type Page } from "./fixtures";
import AxeBuilder from "@axe-core/playwright";
import { seedSignedInTeacher, seedSignedInTeacherNoClass } from "./seed";

/**
 * Automated accessibility floor for nc#59 — the runner accessibility
 * baseline. axe-core cannot see everything the ticket asks for (a focus trap
 * that lets Tab escape a dialog, or motion that keeps moving under
 * `prefers-reduced-motion`, are both behaviour axe's static/AA ruleset does
 * not check) — those are the documented keyboard pass in
 * `docs/qa-accessibility-keyboard-pass.md`. What this file proves
 * automatically is the acceptance criterion axe CAN see: no serious or
 * critical violation on the golden flow's four surfaces — Today, Run, Print,
 * Start — in both their resting state and, for Run, its dialogs open, since
 * those are exactly the elements nc#59 touched.
 *
 * Scoped to `serious`/`critical` on purpose, matching the ticket's own bar.
 * `moderate`/`minor` findings (mostly colour-contrast edge cases inherited
 * from brand tokens this ticket does not own) are a separate concern from
 * "is this dialog/page operable" and would make this check reject
 * unrelated design decisions rather than the runner behaviour nc#59 scopes.
 */

const SERIOUS_IMPACT = ["serious", "critical"];

async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact && SERIOUS_IMPACT.includes(violation.impact)
  );
  if (serious.length > 0) {
    const report = serious
      .map(
        (violation) =>
          `- [${violation.impact}] ${violation.id}: ${violation.help} (${violation.nodes.length} node(s))\n` +
          violation.nodes
            .slice(0, 3)
            .map((node) => `    ${node.target.join(" ")}`)
            .join("\n")
      )
      .join("\n");
    throw new Error(`${label}: ${serious.length} serious/critical axe violation(s)\n${report}`);
  }
  expect(serious).toHaveLength(0);
}

test.describe("accessibility: golden flow, no serious/critical axe violations", () => {
  test("Today (signed out)", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /take your class outside/i })).toBeVisible();
    await expectNoSeriousViolations(page, "Today");
  });

  test("Print (signed out)", async ({ page }) => {
    await page.goto("/print");
    // The sheet renders more than one h1 (the teacher page and, further down
    // the same printed sheet, the child page's own masthead) — both real
    // headings on one continuous document, not a heading-order violation, so
    // this only asserts the first one loaded rather than picking a role that
    // would fail strict mode.
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await expectNoSeriousViolations(page, "Print");
  });

  test("Start (signed in, no active class — the flow's actual first screen)", async ({
    page,
  }) => {
    const teacher = await seedSignedInTeacherNoClass(page);
    try {
      await page.goto("/start");
      await expect(page).toHaveURL(/\/start/);
      await expectNoSeriousViolations(page, "Start");
    } finally {
      await teacher.cleanup();
    }
  });

  test.describe("Run (default hybrid journey — the surface nc#59 fixed)", () => {
    test("the topic screen, which the run opens on", async ({ page }) => {
      await page.goto("/run");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page, "Run: topic");
    });

    test("a phase page, the pause dialog, and the leave dialog", async ({ page }) => {
      await page.goto("/run");
      // Through the introduction (two screens since #754: the threshold she
      // reads, then the one line the class hears), out to the grounding, then
      // along its cards to the first real phase page — where the pause control
      // and the ✕ guard both live (see HybridJourney.tsx's `head(...)` calls).
      // Each forward is skipped only if it is not there, so this walk still
      // reaches a phase page on a session that authors no door question or no
      // grounding.
      // Wait for the run to hydrate before the walk: `isVisible` does not wait,
      // and a check that runs before the first button exists breaks the loop
      // on the topic screen with nothing clicked.
      await expect(page.getByRole("button", { name: "Begin →" })).toBeVisible();
      // Any of the introduction's forward buttons, until none is left: a
      // lesson may ask one question or two ("Next question"), or none.
      for (let i = 0; i < 8; i++) {
        const forward = page.getByRole("button", {
          name: /^(Begin →|The day →|Ask the class →|Next question →|Outside time →|Begin outdoor activity →)$/i,
        });
        if (!(await forward.first().isVisible().catch(() => false))) break;
        await forward.first().click();
        await page.waitForTimeout(150);
      }
      for (let i = 0; i < 6; i++) {
        const next = page.getByRole("button", { name: /^Next →$/ });
        if (await next.isVisible().catch(() => false)) {
          await next.click();
          continue;
        }
        break;
      }
      const begin = page.getByRole("button", { name: /^Begin: /i });
      if (await begin.isVisible().catch(() => false)) {
        await begin.click();
      }
      await expectNoSeriousViolations(page, "Run: phase page");

      // The pause dialog (nc#59: previously role="dialog" with no focus
      // management at all — see HybridJourney.tsx's `pausedCard`).
      await page.getByRole("button", { name: /pause the lesson/i }).click();
      const pauseDialog = page.getByRole("dialog", { name: /lesson paused/i });
      await expect(pauseDialog).toBeVisible();
      await expectNoSeriousViolations(page, "Run: pause dialog open");
      await pauseDialog.getByRole("button", { name: /back to the lesson/i }).click();
      await expect(pauseDialog).toHaveCount(0);

      // The leave dialog (already on useModalFocus, checked here so the
      // automated sweep covers every dialog this surface can show).
      await page.getByRole("button", { name: /^Leave the lesson$/i }).click();
      const leaveDialog = page.getByRole("dialog", { name: /leave the lesson/i });
      await expect(leaveDialog).toBeVisible();
      await expectNoSeriousViolations(page, "Run: leave dialog open");
    });
  });
});

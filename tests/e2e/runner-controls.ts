import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

/**
 * The exit dialog's "End the lesson" button, addressed by its EXACT
 * accessible name, in one place so every spec and the guard beside them drive
 * the same locator rather than five copies of a string that can drift apart.
 *
 * `getByRole`'s `name` option defaults to `exact: false`, which is a
 * case-insensitive SUBSTRING match, so the bare `{ name: "End the lesson" }`
 * also answers for the paused card's "End the lesson here" (#842).
 *
 * This is the second such collision found in this suite and the more serious
 * of the two. The pair #776 fixed could not be on screen together at all:
 * "Back to the lesson" and "Back to the lesson brief" live in render branches
 * of `HybridJourney` that exclude one another, so nothing was ambiguous and
 * only a future layout change could have made it so. These two are different.
 * `pausedCard` and `exitDialog` are declared next to each other and rendered
 * next to each other in the same branch, from two independent booleans with no
 * code anywhere holding them apart; both labels are real `<button>`s with the
 * same role. Mount them both and the substring selector resolves two elements,
 * which the guard in `journey-resume.spec.ts` demonstrates on the real runner.
 *
 * What keeps a teacher out of that state today is neither of those things. It
 * is `.pausedScrim`, a `position: fixed; inset: 0; z-index: 40` sheet that
 * swallows the tap on the ✕ underneath it, plus `useModalFocus` trapping Tab
 * inside whichever card is open. Both are presentation. A paused card that
 * does not cover the head, an auto-pause on backgrounding, or a keyboard route
 * to either control would each make the collision live without touching this
 * selector, and the test would then fail about ambiguity rather than about the
 * behaviour it names.
 *
 * Takes a scope so the three call sites that already narrow to the exit dialog
 * keep that narrowing and gain the exact name too.
 */
export const END_LESSON = "End the lesson";

export const endLessonButton = (scope: Page | Locator): Locator =>
  scope.getByRole("button", { name: END_LESSON, exact: true });

/**
 * THE DAY SCREEN IS SOMETIMES THERE (2026-09-08, nc#1099). After "Begin →" the
 * introduction shows this time of year, and then — only on a day when a
 * weather note fired — "The day →" before the question. CI runs against live
 * weather, so a walk that assumes "Ask the class →" is next fails on a wet
 * Tuesday. Wait for whichever forward button the look screen carries, and
 * step through the day when it is the one there.
 */
export async function passTheDay(page: Page): Promise<void> {
  const forward = page.getByRole("button", {
    name: /^(The day →|Ask the class →|Outside time →)$/,
  });
  await expect(forward.first()).toBeVisible();
  const theDay = page.getByRole("button", { name: "The day →" });
  if (await theDay.isVisible()) await theDay.click();
}

/**
 * Past the authored introduction, when the lesson has one (#1187). The
 * starter sessions' `introduce` part is said inside after the question,
 * one moment per "Next →", and its last moment's Next is "Outside time →".
 * A lesson with no such part is already standing on "Outside time →".
 */
export async function passTheIntroduction(page: Page): Promise<void> {
  const outside = page.getByRole("button", { name: "Outside time →" });
  const next = page.getByRole("button", { name: "Next →", exact: true });
  await expect(outside.or(next).first()).toBeVisible();
  for (let moment = 0; moment < 12; moment += 1) {
    if (await outside.isVisible()) return;
    await next.click();
  }
  await expect(outside).toBeVisible();
}

import { test, expect, type Page } from "./fixtures";
import { backLabel } from "../../lib/run/journey-steps";
import { END_LESSON, endLessonButton, passTheDay } from "./runner-controls";

/**
 * The paused card's resume button, addressed by its EXACT accessible name.
 *
 * `getByRole`'s `name` option defaults to `exact: false`, which is a
 * case-insensitive SUBSTRING match — so the bare `{ name: "Back to the
 * lesson" }` this file used until #776 also matches the back control's
 * "Back to the lesson brief", and #764's PR body was wrong to describe it as
 * exact. Nothing was red: the two labels cannot be on screen at once today
 * (the paused card renders only in HybridJourney's `phase` and `circle`
 * branches; "Back to the lesson brief" renders only where `previousStep` is
 * the doorway, which is settle card 0 and — if a lesson ships no settle deck —
 * `introduce`). That is an accident of layout, not a property of the selector,
 * and the day the settle screen gains a paused card this test would have gone
 * red about resume for a reason that has nothing to do with resume.
 *
 * One place, so the guard below tests the same locator the resume test uses
 * rather than a copy of it.
 */
const RESUME_BUTTON = "Back to the lesson";
const resumeButton = (page: Page) =>
  page.getByRole("button", { name: RESUME_BUTTON, exact: true });

/**
 * #456: "Runner says a paused place is kept, but reload restarts at settle."
 *
 * `HybridJourney` is the default `/run` surface (app/run/page.tsx, nc#302)
 * and it held its step, clock and pause state in plain `useState` with no
 * persistence at all — the paused card's "Your place is kept" was a line
 * with nothing behind it, a reload always came back to `intro`, and the ✕
 * left an active run with no question asked.
 *
 * This is the signed-out demo path deliberately: `#455`'s usability study and
 * the ticket's own repro are both against the public demo, and `ownerScope`
 * is `demo:public` with no seeded account needed, matching golden-path.spec.ts's
 * "reproducing tests... where feasible signed-out" instruction.
 */

test.describe("hybrid journey resume (#456)", () => {
  test("pause names the place, reload keeps it, and the resume gate names it back before re-entry", async ({
    page,
  }) => {
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
    // On the "Count" phase now — the exact phase #456's repro pauses on.
    await expect(page.getByRole("button", { name: "Next: See →" })).toBeVisible();
    await page.getByRole("button", { name: "Next: See →" }).click();
    // Now on "See", one phase further in than #456's own repro — proves a
    // phase index other than the first restores correctly too.
    await expect(page.getByRole("button", { name: "Next: Hear →" })).toBeVisible();

    await page.getByRole("button", { name: "Pause the lesson" }).click();
    await expect(page.getByText("Your place is kept. Nothing here is lost.")).toBeVisible();
    const pausedClock = await page.locator("p").filter({ hasText: /^\d{2}:\d{2}$/ }).first().innerText();

    // Reload with ordinary network available — the ticket's own repro step.
    await page.reload();

    // The resume gate names the saved place before re-entry (done condition).
    await expect(page.getByText("You were at See.")).toBeVisible();
    await page.getByRole("button", { name: "Pick up at See →" }).click();

    // Lands exactly back on "See", still paused, with the elapsed clock
    // preserved rather than reset to 00:00 or restarted from "now".
    await expect(page.getByRole("button", { name: "Next: Hear →" })).toBeVisible();
    await expect(page.getByText("Your place is kept. Nothing here is lost.")).toBeVisible();
    await expect(page.locator("p").filter({ hasText: /^\d{2}:\d{2}$/ }).first()).toHaveText(
      pausedClock
    );

    // Back to the lesson, unpausing, does not lose the phase either.
    await resumeButton(page).click();
    await expect(page.getByRole("button", { name: "Next: Hear →" })).toBeVisible();
  });

  test("the leave control asks before an active run is discarded, with an explicit End or Keep for later", async ({
    page,
  }) => {
    await page.goto("/run?session=summer-w1-counting-life");
    // The first screen is a free look (nothing to lose yet); one step in,
    // the run is active and the ✕ must ask, even before the clock starts.
    await page.getByRole("button", { name: "Begin →" }).click();
    await passTheDay(page);
    await page.getByRole("button", { name: "Leave the lesson" }).click();
    await expect(page.getByRole("dialog", { name: "Leave the lesson" })).toBeVisible();
    await expect(page.getByText("Leave the lesson?")).toBeVisible();
    await expect(page.getByRole("link", { name: "Keep for later" })).toBeVisible();
    await expect(endLessonButton(page)).toBeVisible();

    // "Keep teaching" cancels without leaving or discarding anything.
    await page.getByRole("button", { name: "Keep teaching" }).click();
    await expect(page.getByRole("dialog", { name: "Leave the lesson" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ask the class →" })).toBeVisible();

    // On through the introduction, out to the grounding, and skip it to the
    // first part, where the walk's last settle card lands.
    await page.getByRole("button", { name: "Ask the class →" }).click();
    await page.getByRole("button", { name: "Outside time →" }).click();
    await page.getByRole("button", { name: "Begin outdoor activity →" }).click();
    await page.getByRole("button", { name: "Skip grounding" }).click();
    await page.getByRole("button", { name: "Leave the lesson" }).click();
    await endLessonButton(page).click();
    // Ending goes to the finish rather than discarding the run silently
    // (signed out: straight to the celebration, no logging offered).
    //
    // The celebration names THIS lesson — HybridJourney's last return renders
    // `<h1>{session.title} is done.</h1>` over the eyebrow "that was today" and
    // the "the skill we grow" line. It is not the legacy runner's old
    // "beautifully done", which nc#458 removed from every surface: the pack's
    // authored celebration headline is a claim about what thirty children did
    // outdoors, and the renderer suppresses it because the app does not know.
    await expect(
      page.getByRole("heading", { level: 1, name: "Counting life is done." })
    ).toBeVisible();
    await expect(page.getByText("the skill we grow")).toBeVisible();
    // "no logging offered" is the other half of that sentence, so assert it:
    // signed out there is no active class to log against, so LogSession's
    // optional teacher record is not on screen at all.
    await expect(page.getByLabel(/children outside/i)).toHaveCount(0);
  });

  test("the resume button is addressed by an exact name, so a longer label cannot answer for it (#776)", async ({
    page,
  }) => {
    // The two names, side by side on one page, which is the arrangement the
    // runner's own layout happens to prevent today and is not promised to
    // prevent tomorrow. The longer one is read out of the product rather than
    // typed here, so a rename of the back control's label reaches this fixture
    // instead of leaving it asserting against a string nothing renders.
    // The doorway's "Back to the lesson brief" is gone with the doorway
    // (2026-09-06), so the longer label is a stand-in with the same shape:
    // the guard is insurance against any future label that begins the same.
    const introBack = `${RESUME_BUTTON} brief`;

    await page.setContent(
      `<button type="button">${introBack}</button>` +
        `<button type="button">${RESUME_BUTTON}</button>`
    );

    // What the selector did before #776: substring, so BOTH buttons answer to
    // it. In a click that is a strict-mode violation, and the failure names
    // ambiguity rather than resume.
    await expect(page.getByRole("button", { name: RESUME_BUTTON })).toHaveCount(2);

    // What it does now: one button, and the right one.
    await expect(resumeButton(page)).toHaveCount(1);
    await expect(resumeButton(page)).toHaveText(RESUME_BUTTON);
  });

  test("the end control is addressed by an exact name, so the paused card's longer label cannot answer for it (#842)", async ({
    page,
  }) => {
    // This guard is built on the real runner rather than on a `setContent`
    // fixture, which is where it departs from #776's. It can be: unlike "Back
    // to the lesson" and "Back to the lesson brief", these two labels are both
    // real buttons that the product itself puts on one page. `pausedCard` and
    // `exitDialog` are declared beside each other and rendered beside each
    // other in the same branch of `HybridJourney`, out of two independent
    // booleans that no code holds apart.
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

    await page.getByRole("button", { name: "Pause the lesson" }).click();
    await expect(page.getByText("The clock is stopped")).toBeVisible();

    // The longer label read out of the product rather than typed here, so a
    // rename of the paused card's end control reaches this fixture instead of
    // leaving it asserting against a string nothing renders.
    const pausedEnd = await page
      .getByRole("dialog", { name: "Lesson paused" })
      .getByRole("button", { name: END_LESSON })
      .innerText();
    expect(
      pausedEnd.toLowerCase().startsWith(END_LESSON.toLowerCase()) &&
        pausedEnd.length > END_LESSON.length,
      `the paused card's end control now reads "${pausedEnd}", which is no longer a longer string beginning with "${END_LESSON}": the collision this guards is gone, and the guard is now only insurance`
    ).toBe(true);

    // Both cards on screen at once. A real tap cannot do this today, and the
    // reason is worth stating because it is the whole of the safety here: the
    // ✕ sits under `.pausedScrim`, a fixed full-viewport sheet at z-index 40
    // that swallows the tap, and `useModalFocus` traps Tab inside the paused
    // card so the keyboard cannot reach it either. Both are presentation, not
    // structure. Dispatching the click past hit-testing asks what the SELECTOR
    // does once the two cards are mounted, which is the property under test
    // and the one that outlives any change to that z-order.
    await page.getByRole("button", { name: "Leave the lesson" }).dispatchEvent("click");
    await expect(page.getByText("Leave the lesson?")).toBeVisible();
    await expect(page.getByText("The clock is stopped")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(2);

    // What the selector did before #842: substring, so the paused card's
    // "End the lesson here" answers for the exit dialog's "End the lesson".
    // In a click that is a strict-mode violation, and the failure names
    // ambiguity rather than the behaviour the test was about.
    await expect(page.getByRole("button", { name: END_LESSON })).toHaveCount(2);

    // What it does now: one button, and the right one. `toHaveText` is what
    // separates them, because clicking either would end the lesson.
    await expect(endLessonButton(page)).toHaveCount(1);
    await expect(endLessonButton(page)).toHaveText(END_LESSON);
  });
});

/**
 * #776: ONE DEAD GESTURE AT THE DOORWAY.
 *
 * #764 gave the iPad's back-swipe a meaning — one step back through the
 * lesson, guard entry re-pushed first so a running lesson can never be lost to
 * an elbow. The re-push was unconditional, so the swipe that walked back to
 * the doorway left its entry behind: the effect's dep flipped, the cleanup
 * pulled the listener, and one orphan entry sat on the stack with nobody
 * listening. The next swipe at the doorway popped it — same URL, no listener,
 * nothing on screen — and only the one after that left the page.
 *
 * This walks that exact sequence. The assertion is on the FIRST swipe at the
 * doorway leaving, not the second.
 */
test.describe("back-swipe at the doorway (#776)", () => {
  test("the swipe that walks back to the doorway spends its guard entry, so the next swipe leaves", async ({
    page,
  }) => {
    // Somewhere real to leave TO, so "left the runner" is observable as a URL
    // rather than as an empty tab. Signed out, `/` is the landing page and
    // does not redirect (golden-path.spec.ts reads its heading there).
    await page.goto("/");
    const before = page.url();

    await page.goto("/run?session=summer-w1-counting-life");
    // The run opens on the topic screen (2026-09-06: no doorstep). Leaving it
    // is what arms the guard.
    await expect(page.getByRole("button", { name: "Begin →" })).toBeVisible();
    await page.getByRole("button", { name: "Begin →" }).click();
    await passTheDay(page);
    await expect(page.getByRole("button", { name: "Ask the class →" })).toBeVisible();

    // Swipe one: the day -> the topic. The pop spends the guard entry and,
    // because the step it lands on is the first screen, it is not re-pushed.
    await page.goBack();
    await expect(page.getByRole("button", { name: "Begin →" })).toBeVisible();
    await expect(page).toHaveURL(/\/run\?session=summer-w1-counting-life/);

    // Swipe two leaves, because on the first screen there is no guard left
    // to absorb it. Before #776 this popped the orphan entry instead and the
    // teacher stayed exactly where she was, looking at a gesture that did
    // nothing.
    await page.goBack();
    await expect(page).toHaveURL(before);
  });
});

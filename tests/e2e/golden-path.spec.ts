import { test, expect } from "./fixtures";
import { seedSignedInTeacher } from "./seed";
import { endLessonButton, passTheDay } from "./runner-controls";

/**
 * The one Playwright golden path #58 asks for, plus offline resume.
 *
 * Split into what's genuinely reachable signed-out (the ticket's own
 * instruction — "reproducing tests... where feasible signed-out") and what
 * needs a real account: onboarding creates a Class row and there is no
 * signed-out equivalent of "grounded Today" or "journal" to test without one.
 * For the authenticated leg, tests/e2e/seed.ts seeds a teacher + class +
 * session cookie directly against the fixture database rather than driving
 * the magic-link email UI — see that file's comment for why.
 *
 * THE SURFACE UNDER TEST IS THE HYBRID JOURNEY (#583). `/run` with no `?run=`
 * param has run `HybridJourney` since the 2026-08-17 ruling (app/run/page.tsx),
 * and this file went on asserting the legacy paged `Runner`'s copy — "Begin:
 * …", a top-bar "End session", an "End the session?" dialog — none of which the
 * default has shown for months, so two tests sat on a 30s timeout. Anything
 * here that means to cover `Runner` must ask for it by URL (`?run=legacy`);
 * nothing does today, because `Runner`'s own coverage is the unit suite.
 *
 * DATABASE_URL is required for the whole file (even the signed-out legs
 * share a webServer that needs a working Prisma connection to boot without
 * 500ing on routes that call getTeacher()). See tests/integration/README.md
 * for the same fixture-database setup this suite shares.
 */

test.describe("golden path: signed out", () => {
  test("cold demo -> run -> end session reaches the finish page with no logging offered", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Nature Class/);
    await expect(
      page.getByRole("heading", { name: /take your class outside/i })
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Enter", exact: true })).toHaveCount(0);

    await page.goto("/run");
    // The doorstep. `/run` with no `?run=` param is the HYBRID JOURNEY, not
    // the legacy paged runner (app/run/page.tsx: "THE HYBRID JOURNEY IS THE
    // DEFAULT", `if (runMode !== "legacy")`), so this walks the surface a cold
    // visitor actually gets. The doorstep's own h1 is the session title
    // (HybridJourney.tsx `<h1 className={styles.tHero}>{session.title}</h1>`),
    // and the celebration at the far end is that same title plus " is done." —
    // reading it here and asserting it there ties the two ends of the arc
    // together rather than matching a string that happens to be on screen.
    // The run opens on the introduction's topic screen (2026-09-06, no
    // doorstep), whose h1 is the session title.
    const topicTitle = page.getByRole("heading", { level: 1 }).first();
    await expect(topicTitle).toBeVisible();
    const sessionTitle = (await topicTitle.innerText()).trim();

    // Doorstep -> settle -> introduce -> steps. This test proves that ARC, not
    // every page's content, so the settle cards are skipped by their own
    // control rather than clicked through one at a time.
    // The introduction is said inside, on the board, and the class goes out
    // to ground after it (2026-09-06, #1004): the topic, the day, the
    // question, "Leave the screen", then "Ground the class". Skipping the grounding
    // lands on the first part, where the walk's last settle card lands.
    await page.getByRole("button", { name: "Begin →" }).click();
    await passTheDay(page);
    await page.getByRole("button", { name: "Ask the class →" }).click();
    // A lesson may author more than one introduction question (the minibeast
    // hunt asks three since 2026-09-13); walk them all.
    const nextQuestion = page.getByRole("button", { name: "Next question →" });
    while (await nextQuestion.isVisible()) await nextQuestion.click();
    await page.getByRole("button", { name: "Outside time →" }).click();
    await page.getByRole("button", { name: "Begin outdoor activity →" }).click();
    await page.getByRole("button", { name: "Skip grounding" }).click();
    // Steps have begun; jump straight to the finish via the always-visible ✕.
    // Mid-run it is a guard, not an exit (#456): it opens the "Leave the
    // lesson?" dialog, and the dialog's own "End the lesson" is what ends it.
    await page.getByRole("button", { name: "Leave the lesson" }).click();
    await endLessonButton(page.getByRole("dialog", { name: "Leave the lesson" })).click();

    // The celebration, and it names THIS lesson.
    await expect(
      page.getByRole("heading", { level: 1, name: `${sessionTitle} is done.` })
    ).toBeVisible();

    // Signed out: the finish is the celebration, not the LogSession reflection
    // form (that only renders for a signed-in teacher with an active class —
    // app/run/page.tsx's `logTo`, HybridJourney's `step.kind === "reflect" &&
    // logTo`). Asserted against LogSession's two real controls, the headcount
    // gate and its submit, because those are what would actually be on screen
    // if logging leaked to a signed-out visitor.
    await expect(page.getByLabel(/children outside/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Finish and save" })).toHaveCount(0);
  });

  test("a completion POSTed while offline is kept and resent, never silently lost", async ({
    page,
    context,
  }) => {
    // Seed a signed-in teacher for this one test only: LogSession (the
    // offline-queue component) only renders with an active class to log
    // against. Isolated from the "signed out" describe block's spirit in
    // spirit only — the thing under test here is the QUEUE, not auth.
    const teacher = await seedSignedInTeacher(page);
    try {
      await page.goto(`/run?session=summer-w1-counting-life`);
      // Same hybrid-journey walk as the cold demo above — this is the default
      // `/run` surface a real teacher reaches, and the queue has to work on the
      // surface she actually leads from.
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
      await page.getByRole("button", { name: "Leave the lesson" }).click();
      await endLessonButton(page.getByRole("dialog", { name: "Leave the lesson" })).click();

      // Signed in with an active class, ending lands on the reflection rather
      // than the celebration, and the reflection names the class it will be
      // logged against.
      await expect(
        page.getByRole("heading", { name: "Finish for Willow Class" })
      ).toBeVisible();
      await expect(page.getByLabel(/children outside/i)).toBeVisible();

      // Simulate offline: fail every completions POST.
      await context.route("**/api/completions", (route) => route.abort("internetdisconnected"));

      await page.getByLabel(/children outside/i).fill("18");
      await page.getByRole("button", { name: /^Finish and save$/i }).click();

      // The offline KEEP, not an error the teacher has to fix — and matched on
      // the receipt's own sentence ("Kept on this iPad for Willow Class."), not
      // on the bare phrase: LogSession's FAILURE copy also contains "kept on
      // this iPad" ("This could not be saved or kept on this iPad…"), so the
      // loose match would have gone green on the exact outcome under test.
      await expect(page.getByText(/kept on this iPad for willow class/i)).toBeVisible();

      // Restore connectivity and reload. The hybrid journey saves the run, so
      // the reload opens on the resume gate naming the saved place rather than
      // restarting at the doorstep; picking it up remounts LogSession, which
      // retries the queued draft it finds under this run's client key.
      await context.unroute("**/api/completions");
      const drained = page.waitForResponse(
        (res) => res.url().includes("/api/completions") && res.request().method() === "POST"
      );
      await page.goto(`/run?session=summer-w1-counting-life`);
      await expect(page.getByText("You were at your reflection.")).toBeVisible();
      await page.getByRole("button", { name: /^Pick up at your reflection/ }).click();
      await drained; // the queued completion actually reached the server this time

      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      const rows = await prisma.sessionCompletion.findMany({
        where: { classId: teacher.classId },
      });
      await prisma.$disconnect();
      expect(rows).toHaveLength(1); // resent exactly once, not lost, not duplicated
      expect(rows[0]?.headcount).toBe(18);
    } finally {
      await teacher.cleanup();
    }
  });
});

test.describe("golden path: signed in", () => {
  test("onboarded teacher's active class shows a grounded location and an empty journal before any session is logged", async ({
    page,
  }) => {
    const teacher = await seedSignedInTeacher(page);
    try {
      await page.goto("/journal");
      // Signed in with an active class: journal renders, not a /sign-in bounce.
      await expect(page).toHaveURL(/\/journal/);
      // The journal's own heading is "What you noticed" under the eyebrow
      // "Your journal" (app/journal/page.tsx) — it has never rendered a bare
      // "Journal" heading, nor the "no sessions logged…" line this test used to
      // wait for. This is a SEPARATE cause from the runner-copy drift above:
      // nothing here goes through /run at all.
      await expect(
        page.getByRole("heading", { level: 1, name: "What you noticed" })
      ).toBeVisible();
      // Scoped to the seeded class, not to some other teacher's journal.
      await expect(
        page.getByText("A quiet record of every session with Willow Class, kept for you.")
      ).toBeVisible();
      // Nothing logged yet for this freshly-seeded class.
      await expect(page.getByRole("heading", { name: "Nothing noted yet" })).toBeVisible();
      await expect(
        page.getByText(/lead a session with willow class and it lands here/i)
      ).toBeVisible();

      await page.goto("/season");
      await expect(page).toHaveURL(/\/season/);
    } finally {
      await teacher.cleanup();
    }
  });
});

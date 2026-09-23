import { expect, test, type Page } from "./fixtures";
import { fieldHref, fieldPrintHref } from "../../lib/offline/field-location";
import { endLessonButton, passTheDay, passTheIntroduction } from "./runner-controls";

// An autumn session: the only season with lessons in the offline core while
// winter, spring and summer are drawers of titles (2026-09-07).
const SESSION_ID = "seed-searchers";

/**
 * The Season shelf opens one season at a time (2026-09-06): the other three
 * are listed by title with the month they unlock, and carry no link. So a
 * test that reaches a lesson THROUGH the shelf has to pick one from the season
 * the server is standing in. Northern reading, like the sample school; the
 * ids and titles are the lead session of each season starter. Tests that open
 * a session by URL keep `SESSION_ID`: the catalogue resolves any season.
 */
function openSeasonLead(date = new Date()): { id: string; title: string } {
  const month = date.getMonth();
  // Winter, spring and summer are drawers of titles with nothing to click
  // (2026-09-07), so outside autumn the shelf offers no lesson and this
  // helper names an autumn session anyway; put the seasonal ids back as each
  // term's lessons land. Seed searchers rather than the lead, Minibeast
  // hunting, because CI serves the US edition, where that row reads "Bug
  // hunting"; this title is the same in both editions.
  if (month >= 8 && month <= 10) return { id: "seed-searchers", title: "Seed searchers" };
  if (month === 11 || month <= 1) return { id: "bird-watching", title: "Bird watching" };
  return { id: "seed-searchers", title: "Seed searchers" };
}

async function proveOfflineAssets(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload();
  }
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const cacheProof = await page.evaluate(async () => ({
    controller: navigator.serviceWorker.controller?.state ?? null,
    assets: await Promise.all(
      ["/field", "/field/print", "/offline/core-v1.json"].map(async (url) => {
        const response = await caches.match(url, { ignoreSearch: true });
        return { url, cachedUrl: response?.url ?? null, ok: response?.ok ?? false };
      }),
    ),
  }));
  expect(cacheProof).toEqual({
    controller: "activated",
    assets: [
      expect.objectContaining({ url: "/field", ok: true }),
      expect.objectContaining({ url: "/field/print", ok: true }),
      expect.objectContaining({ url: "/offline/core-v1.json", ok: true }),
    ],
  });
}

test("a normal lesson opens its cached runner and print copy after signal loss", async ({
  context,
  page,
}) => {
  const privateOfflineRequests: string[] = [];
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/api/offline/owner" || pathname === "/api/offline/prepare") {
      privateOfflineRequests.push(pathname);
    }
  });

  await page.goto(`/session?session=${SESSION_ID}`);
  await expect(
    page.getByRole("heading", { name: "Seed searchers", exact: true }).first(),
  ).toBeVisible();
  await proveOfflineAssets(page);
  await expect(page.getByRole("button", { name: "Go offline" })).toBeVisible();
  await expect(page.getByText("Departure check", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Open-core shelf", { exact: true })).toHaveCount(0);

  const cachedFieldPages = await page.evaluate(async () => {
    const entries: Array<{
      cache: string;
      requestPath: string;
      responsePath: string;
      isPrintShell: boolean;
    }> = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        const requestUrl = new URL(request.url);
        if (!requestUrl.pathname.startsWith("/field")) continue;
        const response = await cache.match(request);
        entries.push({
          cache: cacheName,
          requestPath: requestUrl.pathname,
          responsePath: response ? new URL(response.url).pathname : "missing",
          isPrintShell: response
            ? (await response.clone().text()).includes(
                "The saved print copy is not available yet.",
              )
            : false,
        });
      }
    }
    return entries;
  });
  expect(cachedFieldPages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ requestPath: "/field", responsePath: "/field" }),
      expect.objectContaining({
        requestPath: "/field/print",
        responsePath: "/field/print",
        isPrintShell: true,
      }),
    ]),
  );

  await page.getByRole("button", { name: "Go offline" }).click();
  const offlineDetails = page.getByRole("dialog", {
    name: "Go offline with this lesson",
  });
  await expect(offlineDetails).toBeVisible();
  await expect(offlineDetails).toContainText(
    "Lesson, safety, teaching steps and print are saved on this device.",
  );

  await context.setOffline(true);
  await offlineDetails.getByRole("link", { name: "Open offline lesson" }).click();
  await page.waitForURL(new RegExp(`/field#session=${SESSION_ID}&view=run$`));
  await expect(
    page.getByRole("heading", { name: "Seed searchers", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Begin →" })).toBeVisible();

  // The runner's doorstep, which carried the Print link, is gone
  // (2026-09-06); the saved print copy is reached by its own cached address.
  await page.goto(`/field/print#session=${SESSION_ID}`);
  await page.waitForURL(/\/field\/print(#|$)/);
  await expect(
    page.getByRole("heading", { name: "Seed searchers", exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "The children’s sheet" })).toBeVisible();

  await context.setOffline(false);
  expect(privateOfflineRequests).toEqual([]);
});

test("a basic field run keeps its place", async ({ context, page }) => {
  await page.goto(`/session?session=${SESSION_ID}`);
  await proveOfflineAssets(page);
  await context.setOffline(true);

  await page.goto(`/field#session=${SESSION_ID}&view=run`, {
    waitUntil: "domcontentloaded",
  });
  // The introduction comes first now (2026-09-06); the grounding is the
  // section after it, outside.
  await page.getByRole("button", { name: "Begin →" }).click();
  await passTheDay(page);
  await page.getByRole("button", { name: "Ask the class →" }).click();
  // The starter sessions say their own introduction inside after the
  // question (#1187); this walks its moments, or nothing on a plain lesson.
  await passTheIntroduction(page);
  await page.getByRole("button", { name: "Outside time →" }).click();
  await page.getByRole("button", { name: "Begin outdoor activity →" }).click();
  // #934 put grounding on the part strip, so "Ground the class" names two
  // things on this screen now — the section title and its chip. The chip is
  // the one that carries where she is STANDING, which is what this line is
  // checking, so it reads that rather than disambiguating a text match.
  await expect(
    page.getByRole("button", { name: "Ground the class", exact: true })
  ).toHaveAttribute("aria-current", "step");

  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByText("Part-way through", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pick up at Grounding the class/ })).toBeVisible();
});

test("Season opens the exact saved lesson offline and a finished run can return home", async ({
  context,
  page,
}) => {
  await page.goto("/season");
  await proveOfflineAssets(page);

  const lead = openSeasonLead();
  const savedLesson = page.getByRole("link").filter({ hasText: lead.title });
  await savedLesson.focus();
  await expect(savedLesson).toBeFocused();
  await context.setOffline(true);
  await expect(page.getByText("Offline. Saved lessons open here.")).toBeVisible({
    timeout: 5_000,
  });

  // Its destination changes in place. A teacher tabbing through the shelf is
  // not thrown back to the document when signal changes underneath her.
  await expect(savedLesson).toBeFocused();
  await expect(savedLesson).toHaveAttribute("href", fieldHref(lead.id, "run"));
  await savedLesson.click();
  await page.waitForURL(new RegExp(`/field#session=${lead.id}&view=run$`));
  await expect(
    page.getByRole("heading", { name: lead.title, exact: true }).first(),
  ).toBeVisible();

  // The class can begin with no signal. If it comes back before the finish,
  // Done returns to the normal home instead of trapping the teacher in the
  // fallback chooser.
  await context.setOffline(false);
  // The introduction is said inside, on the board, and the class goes out
  // to ground after it (2026-09-06, #1004): the topic, the day, the
  // question, "Leave the screen", then "Ground the class". Skipping the grounding
  // lands on the first part, where the walk's last settle card lands.
  await page.getByRole("button", { name: "Begin →" }).click();
  await passTheDay(page);
  await page.getByRole("button", { name: "Ask the class →" }).click();
  // The starter sessions say their own introduction inside after the
  // question (#1187); this walks its moments, or nothing on a plain lesson.
  await passTheIntroduction(page);
  await page.getByRole("button", { name: "Outside time →" }).click();
  await page.getByRole("button", { name: "Begin outdoor activity →" }).click();
  await page.getByRole("button", { name: "Skip grounding" }).click();
  await page.getByRole("button", { name: "Leave the lesson" }).click();
  await endLessonButton(page.getByRole("dialog", { name: "Leave the lesson" })).click();

  const done = page.getByRole("link", { name: "Done", exact: true });
  await expect(done).toHaveAttribute("href", "/");
  await done.click();
  await expect(page).toHaveURL(/\/$/);
  // The landing's heading, which is what proves Done really landed there:
  // "Teach with Nature." since #914; the subheader beneath it is the
  // step-by-step guide line (2026-09-07), "Bring learning outside." having
  // moved down to the introduction.
  await expect(page.getByRole("heading", { name: /Teach with Nature/i })).toBeVisible();

  await page.goto("/field");
  await expect(page.getByRole("link", { name: "Back to Nature Class" })).toHaveAttribute(
    "href",
    "/",
  );
});

/**
 * A value on `window` survives a React re-render and cannot survive a new
 * document. It proves that signal changes never reload the lesson under her.
 */
test("brief and longer signal losses keep the normal lesson in place", async ({
  context,
  page,
}) => {
  await page.goto(`/session?session=${SESSION_ID}`);
  await proveOfflineAssets(page);
  await expect(page.getByRole("button", { name: "Go offline" })).toBeVisible();

  await page.evaluate(() => {
    (window as unknown as { __fieldDocument?: string }).__fieldDocument = "hers";
  });
  const navigatedAway = page
    .waitForEvent("framenavigated", { timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  // A momentary drop is acknowledged, then dismissed when signal returns.
  await context.setOffline(true);
  await expect(
    page.getByText("Signal lost. Checking saved lesson…", { exact: true }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText("Back online", { exact: true })).toBeVisible();

  // A longer drop quietly switches supporting doors to their cached routes.
  await context.setOffline(true);
  await expect(
    page.getByText("Signal lost. Checking saved lesson…", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Offline. Saved lesson ready.", { exact: true }),
  ).toBeVisible({
    timeout: 5_000,
  });
  await expect(page.getByRole("link", { name: /^Print/ })).toHaveAttribute(
    "href",
    fieldPrintHref(SESSION_ID),
  );
  await context.setOffline(false);
  await expect(page.getByText("Back online", { exact: true })).toBeVisible();

  const reloaded = await navigatedAway;
  const survivingDocument = await page
    .evaluate(
      () => (window as unknown as { __fieldDocument?: string }).__fieldDocument ?? null,
    )
    .catch(() => "the document was replaced mid-read");
  expect({ reloaded, survivingDocument }).toEqual({
    reloaded: false,
    survivingDocument: "hers",
  });
});

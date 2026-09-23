import { test as base, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { resetE2EState } from "./reset";

/**
 * The `test` every spec in tests/e2e must import (nc#951).
 *
 * Playwright has no hook that runs before every test in every FILE, so a reset
 * that only some specs remember to call is a reset that the next spec written
 * will not have. Extending `test` once here and importing it everywhere makes
 * the sweep a property of the suite rather than of anyone's memory:
 * `freshDatabase` is `auto: true`, so it runs before each attempt — first run
 * and retry alike — whether or not the spec knows it exists.
 *
 * `scripts/e2e-reset-lint.mjs` is what keeps that true. It fails the build if a
 * spec goes back to importing `test` straight from `@playwright/test`, if this
 * file stops calling `resetE2EState`, or if either side of the sweep stops
 * naming the worker's own slot (nc#978). Without it the fixture is one
 * plausible-looking import away from being silently opted out of, which is the
 * shape of nc#554 all over again — everything still green, nothing still true.
 *
 * Why the sweep runs BEFORE rather than after: the failure this addresses is a
 * spec that dies partway, and a dead spec cannot be trusted to tidy up after
 * itself. Each attempt therefore guarantees its own starting state instead of
 * inheriting a promise the previous one may not have kept. Specs keep their
 * `cleanup()` calls — leaving a database tidy is still good manners, and it is
 * what keeps the sweep's `found` counts meaningful.
 */

type WorkerFixtures = {
  /** One Prisma connection per worker; the sweep runs far too often to open a
   *  fresh client per test. */
  resetDb: PrismaClient;
};

type TestFixtures = {
  freshDatabase: void;
};

export const test = base.extend<TestFixtures, WorkerFixtures>({
  resetDb: [
    async ({}, use) => {
      const db = new PrismaClient();
      try {
        await use(db);
      } finally {
        await db.$disconnect();
      }
    },
    { scope: "worker" },
  ],

  freshDatabase: [
    async ({ resetDb }, use, testInfo) => {
      // `parallelIndex` — not a constant — is what keeps this parallel-safe:
      // the sweep claims only the rows seeded in this worker's own slot, so a
      // concurrently running sibling's teacher can never be deleted underneath
      // it and `workers: 1` stops being a load-bearing setting (nc#978).
      const { found, deleted, spared } = await resetE2EState(
        resetDb,
        testInfo.parallelIndex
      );

      // Silence is the normal case: a suite that cleaned up after itself finds
      // nothing to sweep. When there IS something, say so — a leak carried into
      // a retry is the whole subject of nc#951, and it should be legible in the
      // CI log rather than inferred later from a trace.
      if (found.users > 0 || found.verifications > 0) {
        const note =
          `e2e reset swept ${deleted.users} leaked teacher row(s) and ` +
          `${deleted.verifications} verification row(s) before ` +
          `"${testInfo.title}" (attempt ${testInfo.retry + 1}). ` +
          `Something did not reach its cleanup().`;
        testInfo.annotations.push({ type: "e2e-reset", description: note });
        console.warn(note);
      }

      // A row whose identifier merely CONTAINS a seeded address is not one of
      // the shapes lib/auth.ts writes for that address, so the sweep leaves it
      // (nc#977). That is a decision, not an oversight, and an unexplained row
      // surviving a "reset" is exactly the kind of thing someone later fixes by
      // widening the predicate back to the over-match this replaced.
      if (spared.verifications > 0) {
        const note =
          `e2e reset spared ${spared.verifications} verification row(s) whose ` +
          `identifier contains a seeded address without being one of the ` +
          `shapes lib/auth.ts writes for it (nc#977).`;
        testInfo.annotations.push({ type: "e2e-reset", description: note });
        console.warn(note);
      }

      await use();
    },
    { auto: true },
  ],
});

export { expect };
export type { Page, Locator } from "@playwright/test";

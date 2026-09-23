import { PrismaClient } from "@prisma/client";
import { sweepAllE2EState } from "./reset";

/**
 * The one sweep that can reach a slot this run will never enter (nc#982).
 *
 * `tests/e2e/fixtures.ts` resets before every ATTEMPT, scoped to the running
 * worker's own parallel slot — which is what keeps one worker's sweep off a
 * sibling's rows (nc#978), and which also means a slot only ever cleans itself.
 * `parallelIndex` ranges over `0…workers-1`, so a `--workers=4` run that dies
 * leaves rows in slots 1-3 that the configured `workers: 1` default never
 * re-enters. Nothing swept them. They and their whole cascaded tree — class,
 * session, grounds, completions — stayed in the database for good.
 *
 * This closes that by scope rather than by scale. It matches the `pw-e2e-`
 * FAMILY, not a list of slots, so there is no slot it can fail to think of,
 * including one written by a worker count this run has never heard of. And it
 * runs HERE, in Playwright's `globalSetup`, which executes once before any
 * worker process starts: with no sibling alive there is nothing a family-wide
 * predicate could delete out from under a running test, so the wide predicate
 * that is dangerous per-attempt is exactly correct per-run.
 *
 * It is wired in `playwright.config.ts` and held there by
 * `scripts/e2e-reset-lint.mjs`: a `globalSetup:` line is a plausible thing to
 * drop while tidying a config, and dropping it would restore the orphan slot in
 * silence — every test still green, the leak simply invisible again.
 *
 * SCOPE: NEITHER. Test fixtures, no prose. See `scripts/authorship.mjs`.
 */
export default async function globalSetup(): Promise<void> {
  const db = new PrismaClient();
  try {
    const { found, deleted, spared } = await sweepAllE2EState(db);

    // Silence is the normal case. When there IS something, say so before the
    // first test runs: rows here are by definition ones no per-attempt sweep
    // was ever going to reach, which is the whole subject of nc#982 and worth
    // seeing in the CI log rather than inferring from a database later.
    if (found.users > 0 || found.verifications > 0) {
      console.warn(
        `e2e global setup swept ${deleted.users} leftover teacher row(s) and ` +
          `${deleted.verifications} verification row(s) from a previous run, ` +
          `across every parallel slot. Anything here in a slot this run does ` +
          `not use would otherwise have been swept by nothing (nc#982).`
      );
    }
    if (spared.verifications > 0) {
      console.warn(
        `e2e global setup left ${spared.verifications} verification row(s) ` +
          `alone: their identifiers merely CONTAIN a seeded address rather ` +
          `than being a shape lib/auth.ts writes for one (nc#977).`
      );
    }
  } finally {
    await db.$disconnect();
  }
}

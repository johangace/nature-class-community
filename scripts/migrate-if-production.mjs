#!/usr/bin/env node
/**
 * Apply migrations on production builds, and only on production builds.
 *
 * WHY THIS EXISTS
 *
 * nc#680. `DATABASE_URL` is scoped Production AND Preview on this project, so
 * every preview deployment points at the live database — and the build command
 * used to run `prisma migrate deploy` unconditionally. The consequence is not
 * theoretical: the `11_passkey_ceremony` migration from nc#656 was applied to
 * production by its own branch's preview build, before the PR merged. A
 * migration that drops a column would land the same way, from a branch nobody
 * reviewed and that may never merge.
 *
 * So: schema changes come from production builds, which come from main.
 *
 * WHAT THIS DOES NOT FIX. A preview still READS AND WRITES live teacher data;
 * only a separate preview database fixes that, and on Neon that is a branch
 * database configured in the integration rather than anything this repo can
 * declare. Until then, treat every preview deploy as touching production.
 *
 * A PREVIEW THAT NEEDS A NEW COLUMN NOW FAILS. That is the intended trade: a
 * branch mid-migration renders errors on its own preview instead of silently
 * reshaping the table every other branch, and production, is sitting on.
 */
import { execFileSync } from "node:child_process";

/**
 * Vercel sets VERCEL_ENV to production, preview, or development. Anything else
 * — a local build, a CI build, an unknown future value — is not production and
 * does not get to migrate. Pure and exported for the test: the whole safety
 * property is this one decision.
 */
export function shouldMigrate(env) {
  return env === "production";
}

// Running as a script rather than imported by the test.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  const env = process.env.VERCEL_ENV ?? "local";
  if (!shouldMigrate(env)) {
    console.log(
      `[nature-class] ${env} build: skipping prisma migrate deploy.\n` +
        "  Migrations are applied by production builds only (#680): this database is\n" +
        "  shared with production, and a branch must not reshape it."
    );
    process.exit(0);
  }
  console.log("[nature-class] production build: applying migrations");
  execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
}

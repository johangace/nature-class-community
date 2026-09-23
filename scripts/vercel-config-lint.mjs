#!/usr/bin/env node
/**
 * Vercel config lint: a cron in vercel.json stops production deploying, and
 * says nothing.
 *
 * WHY THIS EXISTS
 *
 * On 2026-08-29 this project stopped deploying to production. Preview
 * deployments kept building normally. The only signal was a commit status on
 * main reading, in full, "Deployment failed" — with a link that resolved to
 * `vercel.com/docs/cron-jobs/usage-and-pricing`.
 *
 * There was nothing to debug. Vercel refused to CREATE the deployment, so
 * there was no build, no log, no failing step, and nothing in the application
 * code that could have caused it. `vercel ls --status ERROR` showed nothing
 * from that day, because a deployment that is never created never errors. Two
 * merges sat undeployed while the site quietly served an older build, and the
 * obvious first move — bisecting the two commits that "broke the build" — was
 * a dead end, because neither had (#701).
 *
 * The declaration that caused it had been in `vercel.json` for months and was
 * never edited. The plan's allowance moved, not the file. That is the part
 * worth guarding: this breaks with no diff, so a reader looking for what
 * changed finds nothing, and it will look like an application fault every
 * time.
 *
 * The job now runs from `.github/workflows/record-reads.yml`, which costs
 * nothing and keeps production deployments off a plan allowance entirely.
 *
 * WHAT THIS ASSERTS
 *
 * `vercel.json` (or `vercel.ts`) declares no cron jobs. That is the whole
 * rule. It is not a claim that crons are bad — on a plan that allows them they
 * are fine, and the fix then is to delete this check on purpose rather than to
 * discover the stall again.
 *
 * SCOPE: NEITHER. It reads deployment configuration. No prose, house or
 * founder; see `scripts/authorship.mjs` for why every check here says so.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CANDIDATES = ["vercel.json", "vercel.ts"];
const failures = [];
let checked = 0;

for (const name of CANDIDATES) {
  const path = join(root, name);
  if (!existsSync(path)) continue;
  checked += 1;
  const text = readFileSync(path, "utf8");

  if (name.endsWith(".json")) {
    let config;
    try {
      config = JSON.parse(text);
    } catch (error) {
      failures.push(`${name} is not valid JSON: ${error.message}`);
      continue;
    }
    const crons = config.crons;
    if (Array.isArray(crons) && crons.length > 0) {
      failures.push(
        `${name} declares ${crons.length} cron job(s): ` +
          crons.map((c) => `${c.schedule} ${c.path}`).join(", ")
      );
    }
    continue;
  }

  // vercel.ts is code, so this is a text check rather than a parse. A `crons:`
  // key is the only shape the platform reads.
  if (/(^|\s)crons\s*:/.test(text)) {
    failures.push(`${name} appears to declare a \`crons:\` key.`);
  }
}

if (failures.length > 0) {
  console.error("Vercel config lint FAILED:");
  for (const message of failures) console.error(`  - ${message}`);
  console.error("");
  console.error("A cron declared here stops PRODUCTION deployments being created on this");
  console.error("plan. Not failing — never created: no build, no log, no failing step, and");
  console.error("a commit status that says only \"Deployment failed\". Previews keep working,");
  console.error("so the site quietly serves an older build until somebody notices (#701).");
  console.error("");
  console.error("Schedule it from .github/workflows/ instead, the way record-reads.yml does.");
  console.error("If the plan has changed and crons are allowed again, delete this check");
  console.error("deliberately rather than rediscovering the stall.");
  process.exit(1);
}

console.log(
  checked === 0
    ? "Vercel config lint passed: no vercel.json or vercel.ts, so no crons to declare."
    : `Vercel config lint passed: ${checked} config file(s), no cron jobs declared.`
);

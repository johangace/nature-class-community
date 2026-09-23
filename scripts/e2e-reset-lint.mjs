#!/usr/bin/env node
/**
 * E2E reset lint: the retry only means something if every spec is reset (nc#951).
 *
 * WHY THIS EXISTS
 *
 * `tests/e2e/fixtures.ts` sweeps the database before every attempt, so a
 * Playwright retry is an independent trial rather than a second run over the
 * first one's leftovers. That is a real fix and a fragile one, because opting
 * out of it does not look like opting out of anything: it looks like
 * `import { test, expect } from "@playwright/test"`, the line every Playwright
 * example on the internet opens with, and the line an editor's auto-import
 * writes for you. A spec that carries it is not reset, its retry is not clean,
 * and nothing anywhere goes red.
 *
 * The same is true one level up. `freshDatabase` is `auto: true` and calls
 * `resetE2EState`; delete either half and the fixture still exists, every spec
 * still imports it, and the whole suite still passes — having stopped doing the
 * one thing it was added for. That is nc#554's failure mode exactly: a green
 * that is byte-identical whether or not the protection is there.
 *
 * So the wiring is held by a check rather than by a comment asking nicely.
 *
 * WHAT IT CHECKS
 *
 *   1. Every tests/e2e/*.spec.ts takes `test` from ./fixtures, and none imports
 *      from @playwright/test directly. (Helpers that are not specs — seed.ts,
 *      fixtures.ts itself — may, and must: fixtures.ts is where the real `test`
 *      comes from.)
 *   2. fixtures.ts still registers an `auto: true` fixture and still calls
 *      `resetE2EState`.
 *   3. Both ends of the sweep still name the worker's own parallel slot:
 *      seed.ts builds its address from `e2eEmailPrefix(...parallelIndex)` and
 *      fixtures.ts passes `parallelIndex` to `resetE2EState`. That pair is what
 *      makes the sweep parallel-safe (nc#978) — before it, the sweep deleted
 *      EVERY `pw-e2e-…` teacher and was correct only because
 *      `playwright.config.ts` happened to say `workers: 1`, which nothing
 *      recorded and which the obvious way to speed up a 33-test suite undoes.
 *      Either half reverting is a one-line edit that looks like a cleanup and
 *      reads as flakiness weeks later, so it is held here rather than hoped for.
 *   4. The RUN-level sweep is still wired (nc#982): playwright.config.ts still
 *      names tests/e2e/global-setup.ts as its `globalSetup`, and that file
 *      still calls `sweepAllE2EState`. Check 3 above narrows the per-attempt
 *      sweep to one slot, which is what makes it parallel-safe and also what
 *      means a slot only ever cleans itself — rows left in a slot no later run
 *      re-enters are swept by nothing. The run-level sweep is the only thing
 *      that reaches them, it runs before any worker exists, and dropping either
 *      half of its wiring is a tidy-looking one-line edit that leaves every
 *      test green and the orphan slot back.
 *
 * What it deliberately does NOT check is whether the reset actually resets.
 * A grep cannot know that. `tests/unit/e2e-reset.spec.ts` runs the sweep against
 * a client whose delete does nothing and requires it to throw, which is the
 * behavioural half of the same promise.
 *
 * SCOPE: NEITHER. It reads test files, no prose of any kind. See
 * `scripts/authorship.mjs` for why every check in this repo says so.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const E2E_DIR = join(root, "tests/e2e");
const FIXTURES = "tests/e2e/fixtures.ts";
const SEED = "tests/e2e/seed.ts";
const CONFIG = "playwright.config.ts";
const GLOBAL_SETUP = "tests/e2e/global-setup.ts";

const failures = [];

const specs = readdirSync(E2E_DIR)
  .filter((name) => name.endsWith(".spec.ts"))
  .sort();

if (specs.length === 0) {
  console.error(
    "E2E reset lint FAILED: found no *.spec.ts under tests/e2e. This check " +
      "refuses to report green off a scan that found nothing to check."
  );
  process.exit(1);
}

for (const name of specs) {
  const rel = `tests/e2e/${name}`;
  const text = readFileSync(join(E2E_DIR, name), "utf8");

  const direct = [...text.matchAll(/^import\s[\s\S]*?from\s+"@playwright\/test";$/gm)];
  for (const [line] of direct) {
    failures.push(
      `${rel} imports from "@playwright/test" directly:\n      ${line.replace(/\s+/g, " ")}`
    );
  }

  const importsTest = /^import\s*\{[^}]*\btest\b[^}]*\}\s*from\s+"\.\/fixtures";$/m.test(
    text
  );
  if (!importsTest) {
    failures.push(
      `${rel} does not import \`test\` from "./fixtures", so nothing resets the ` +
        `database before its attempts.`
    );
  }
}

/**
 * Comments are stripped before the two checks below, because both of them are
 * about what the file DOES. This file's own header explains `auto: true` and
 * names `resetE2EState`, and a check that reads prose would have gone on passing
 * with the code beneath it gutted — which is the failure it was written against.
 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

const fixtures = stripComments(readFileSync(join(root, FIXTURES), "utf8"));

if (!/\bresetE2EState\s*\(/.test(fixtures)) {
  failures.push(
    `${FIXTURES} no longer CALLS resetE2EState. Every spec still imports this ` +
      `file and every spec is still unreset.`
  );
}

if (!/\bauto:\s*true\b/.test(fixtures)) {
  failures.push(
    `${FIXTURES} declares no \`auto: true\` fixture. A fixture nothing requests ` +
      `never runs, and a reset that never runs is nc#951 again with extra files.`
  );
}

/**
 * The parallel-safety pair (nc#978). The sweep is by predicate, so it deletes
 * whatever its predicate matches — including a concurrently running sibling's
 * teacher, unless the predicate is narrowed to the worker's own slot. Both ends
 * have to name that slot or the narrowing is not there: seed.ts has to WRITE it
 * into the address and fixtures.ts has to PASS it to the sweep. Either half
 * reverting reads as a tidy-up and restores the every-worker sweep in silence.
 */
if (!/\bresetE2EState\s*\([^;{}]*\bparallelIndex\b/.test(fixtures)) {
  failures.push(
    `${FIXTURES} does not pass the running test's \`parallelIndex\` to ` +
      `resetE2EState. The sweep would then claim rows seeded by every worker, ` +
      `not just its own, and raising \`workers\` above 1 in playwright.config.ts ` +
      `would delete a concurrently running sibling test's teacher mid-flight.`
  );
}

const seed = stripComments(readFileSync(join(root, SEED), "utf8"));

if (!/\be2eEmailPrefix\s*\([^;{}]*\bparallelIndex\b/.test(seed)) {
  failures.push(
    `${SEED} does not derive its address from \`e2eEmailPrefix(<…>.parallelIndex)\`. ` +
      `A seeded address without the worker's own slot in it is a row any worker's ` +
      `sweep will match, which is the every-worker delete nc#978 closed.`
  );
}

/**
 * The run-level sweep (nc#982). Both halves have to be there: the config has to
 * POINT at global-setup.ts and global-setup.ts has to CALL the family-wide
 * sweep. Either one going leaves the per-attempt slot sweep behind on its own,
 * which cleans only slots this run enters — and a row in any other slot is then
 * swept by nothing, permanently, with the suite as green as ever.
 */
const config = stripComments(readFileSync(join(root, CONFIG), "utf8"));

if (!/\bglobalSetup:\s*"\.\/tests\/e2e\/global-setup(?:\.ts)?"/.test(config)) {
  failures.push(
    `${CONFIG} does not declare \`globalSetup: "./${GLOBAL_SETUP}"\`. Without ` +
      `it the only sweep left is the per-attempt one, which is scoped to the ` +
      `running worker's own parallel slot — so anything a previous run left in ` +
      `a slot this run never enters (slots 1-3 after a \`--workers=4\` run, ` +
      `say) is swept by nothing at all, along with its whole cascaded tree.`
  );
}

const globalSetup = stripComments(readFileSync(join(root, GLOBAL_SETUP), "utf8"));

if (!/\bsweepAllE2EState\s*\(/.test(globalSetup)) {
  failures.push(
    `${GLOBAL_SETUP} no longer CALLS sweepAllE2EState. Playwright still runs ` +
      `the hook, the config still names it, and it now sweeps nothing — nc#554's ` +
      `shape again: the protection gone and the green unchanged.`
  );
}

if (failures.length > 0) {
  console.error("E2E reset lint FAILED:");
  for (const message of failures) console.error(`  - ${message}`);
  console.error("");
  console.error("playwright.config.ts retries once under CI, and the retry is what");
  console.error("separates a flake from a regression. It can only do that from a known");
  console.error("starting state. Import `test` from ./fixtures — it re-exports `expect`,");
  console.error("`Page` and `Locator` too, and anything else you need should be added to");
  console.error("that re-export rather than routed around it.");
  process.exit(1);
}

console.log(
  `E2E reset lint passed: ${specs.length} spec(s) take \`test\` from ${FIXTURES}, ` +
    `which still auto-runs resetE2EState before every attempt, scoped to the ` +
    `worker's own parallel slot at both ends, and ${CONFIG} still runs ` +
    `${GLOBAL_SETUP}'s family-wide sweep once before any worker starts.`
);

#!/usr/bin/env node
/**
 * Committed-symlink lint.
 *
 * This repo has no legitimate committed symlinks. Worktrees here commonly get
 * dependencies via `ln -s ../../nature-class/node_modules node_modules`, and a
 * stale .gitignore pattern once let that symlink get committed as a mode-120000
 * blob pointing at an absolute path on the author's machine (caught on PR #152,
 * nc#153). Mode 120000 is git's symlink mode, so this assertion is exact, not a
 * heuristic.
 *
 * WHY IT IS A FILE AND NOT SIX LINES OF YAML (#554)
 *
 * It was six lines of YAML, inline in `.github/workflows/ci.yml`. Inline steps
 * are the one shape of CI check that nobody can run locally and that the
 * mutation harness cannot exercise: there is no command to invoke and no
 * process to plant a violation in front of. A guard that can only be observed
 * on GitHub's runners is a guard whose green nobody has ever tested — which is
 * precisely the state #554 found `register-lint` in. Moving it into a script
 * changed nothing about what it asserts and made it possible to prove that it
 * does.
 *
 * It reads the git INDEX of whatever directory it is run in, so
 * `scripts/guard-mutation-check.mjs` can point it at a throwaway repository
 * that really does have a symlink committed, and watch it go red.
 *
 * SCOPE: NEITHER. It reads git metadata — no prose, house or founder. Listed
 * because every check in this repo says whose writing it governs; see
 * `scripts/authorship.mjs` for why that stopped being optional.
 */

import { spawnSync } from "node:child_process";

const ls = spawnSync("git", ["ls-files", "-s"], { encoding: "utf8" });

if (ls.status !== 0) {
  console.error(
    "Symlink lint FAILED: `git ls-files -s` did not run here " +
      `(exit ${ls.status}). Without the index there is nothing to assert, and a ` +
      "check that cannot read its own subject must not report green."
  );
  console.error(String(ls.stderr ?? "").trim());
  process.exit(1);
}

const entries = String(ls.stdout).split("\n").filter(Boolean);
const symlinks = entries.filter((line) => line.split(/\s+/)[0] === "120000");

if (symlinks.length > 0) {
  console.error(
    "Committed symlink(s) found (git mode 120000) — this repo has none legitimately:"
  );
  for (const line of symlinks) console.error(`  ${line}`);
  process.exit(1);
}

console.log(
  `Symlink lint passed: ${entries.length} tracked file(s), no git mode-120000 blobs.`
);

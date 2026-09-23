#!/usr/bin/env node
/**
 * Case-only check: prove a content diff changed nothing but letter case.
 *
 * WHOSE WRITING THIS GOVERNS: NOBODY'S. It holds no opinion about anyone's
 * prose, house or founder. It compares two revisions of the same file and
 * answers one question — did any word move, any punctuation change, any
 * character other than a letter's case differ? That is a comparison, not a
 * style rule, which is why it does not call `declareScope()` (see the audit
 * table in `scripts/authorship.mjs`).
 *
 * WHY IT EXISTS
 *
 * The all-caps sweep of #188 rewrote 614 occurrences across seventeen content
 * files. No reviewer can read 614 string pairs and be sure that a sweep which
 * claimed to only unshout did not also quietly reword, drop a clause, or
 * "improve" a sentence on the way past. That is exactly how #130 and #140
 * happened: a defensible-looking bulk pass that changed more than it said.
 *
 * A machine can check all 614 in a second. Run it against the base branch:
 *
 *     node scripts/case-only-check.mjs main
 *
 * For every JSON string it pairs the two revisions BY PATH, so a string that
 * moved, appeared, or vanished is reported as a shape change rather than
 * silently passing. For every pair that differs it requires the two to be
 * identical once both are lower-cased. That single assertion covers word
 * sequence, punctuation, spacing and spelling all at once: if any of them
 * moved, the lower-cased forms cannot match.
 *
 * A sweep is allowed to do more than change case — sometimes lower-casing
 * leaves a limp sentence and the emphasis has to move into the words. This
 * script does not forbid that. It makes it VISIBLE, so those strings get
 * listed and argued for one at a time instead of hiding in the bulk.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** The content trees a sweep of this kind touches. */
const CONTENT_DIRS = ["lib/outside/data/phenology", "packs"];

const requestedBase = process.argv[2] ?? "main";

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
}

/** Every string in a JSON tree, keyed by its path, so pairs cannot drift. */
function stringsByPath(node, path = "", out = new Map()) {
  if (typeof node === "string") {
    out.set(path, node);
  } else if (Array.isArray(node)) {
    node.forEach((n, i) => stringsByPath(n, `${path}[${i}]`, out));
  } else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) stringsByPath(v, `${path}.${k}`, out);
  }
  return out;
}

// Compare the WORKING TREE against the fork point, so the check is the same
// before and after the commit that lands the sweep.
const baseRef = git(["merge-base", requestedBase, "HEAD"]).trim();

const changedFiles = git(["diff", "--name-only", baseRef, "--", ...CONTENT_DIRS])
  .split("\n")
  .map((s) => s.trim())
  .filter((s) => s.endsWith(".json"));

if (changedFiles.length === 0) {
  console.log(`Case-only check: no content JSON changed against ${requestedBase} (${baseRef.slice(0, 8)}). Nothing to compare.`);
  process.exit(0);
}

const violations = [];
const shapeChanges = [];
let filesCompared = 0;
let pairsCompared = 0;
let pairsChanged = 0;

for (const file of changedFiles) {
  const abs = join(root, file);
  if (!existsSync(abs)) {
    shapeChanges.push(`${file}: deleted`);
    continue;
  }
  let beforeRaw;
  try {
    beforeRaw = git(["show", `${baseRef}:${file}`]);
  } catch {
    shapeChanges.push(`${file}: new file, nothing to compare against`);
    continue;
  }
  filesCompared += 1;
  const before = stringsByPath(JSON.parse(beforeRaw));
  const after = stringsByPath(JSON.parse(readFileSync(abs, "utf8")));

  for (const path of before.keys()) {
    if (!after.has(path)) shapeChanges.push(`${file}${path}: path is gone`);
  }
  for (const path of after.keys()) {
    if (!before.has(path)) shapeChanges.push(`${file}${path}: path is new`);
  }

  for (const [path, was] of before) {
    const now = after.get(path);
    if (now === undefined) continue;
    pairsCompared += 1;
    if (now === was) continue;
    pairsChanged += 1;
    if (was.toLowerCase() !== now.toLowerCase()) {
      violations.push({ file, path, was, now });
    }
  }
}

if (shapeChanges.length > 0) {
  console.error(`Case-only check: ${shapeChanges.length} shape change(s) — a string moved, appeared or vanished:`);
  for (const s of shapeChanges.slice(0, 40)) console.error(`  - ${s}`);
  if (shapeChanges.length > 40) console.error(`  ... and ${shapeChanges.length - 40} more`);
}

if (violations.length > 0) {
  console.error("");
  console.error(`Case-only check FAILED. ${violations.length} string(s) changed by more than case:`);
  for (const v of violations) {
    console.error(`  - ${v.file}${v.path}`);
    console.error(`      was: ${JSON.stringify(v.was)}`);
    console.error(`      now: ${JSON.stringify(v.now)}`);
  }
  console.error("");
  console.error("Each of these did more than unshout. That is allowed, but it is not a bulk");
  console.error("change: list it in the PR body with the reason the sentence needed rewriting.");
}

if (violations.length > 0 || shapeChanges.length > 0) process.exit(1);

console.log(
  `Case-only check passed against ${requestedBase} (${baseRef.slice(0, 8)}): ${filesCompared} file(s), ` +
    `${pairsCompared} string(s) paired by path, ${pairsChanged} changed, ` +
    `every one of them identical once lower-cased — same words, same order, same punctuation.`
);

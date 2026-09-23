import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * NO SCRIPT IN THIS REPOSITORY SPAWNS `gh` (nc#1206).
 *
 * ── WHY THIS IS A SOURCE SCAN ──────────────────────────────────────────────
 *
 * The failure mode is REACH, not behaviour, and it has already recurred once.
 * nc#1205 removed `gh` from `scripts/merge-pr.mjs` because that was the only
 * script its done-conditions named, and the same dependency stayed live in
 * three others — `green-pr-sweep.mjs`, `branch-salvage-sweep.mjs` and
 * `worktree-patrol.mjs` — each failing the same way in the same containers.
 * Every behavioural test in this suite passed throughout, because every one of
 * them injects its own transport in place of the real call site.
 *
 * The containers these scripts actually run in carry a GitHub token and no `gh`
 * on PATH. A script that spawns it there either dies with `spawnSync gh ENOENT`
 * or, worse, degrades every fact it could not read to null and prints a report
 * that looks complete. `scripts/github-api.mjs` answers the same `gh api` argv
 * over REST, so the argument shape a caller writes is unchanged and only the
 * transport differs.
 *
 * ── WHAT IS DELIBERATELY NOT SCANNED ───────────────────────────────────────
 *
 * `.github/workflows/**` uses `gh` freely and should: an Actions runner ships
 * with it and authenticates it from the job's own token. The ban is on the
 * scripts a worker container runs, which is where the binary is absent.
 */

const SCRIPTS = "scripts";

/** `execFileSync("gh", …)`, `spawnSync("gh", …)` and their async twins. */
const SPAWNS_GH = /\b(execFileSync|execFile|spawnSync|spawn)\s*\(\s*["'`]gh["'`]/;

/** `execSync("gh api …")` and friends, where the binary hides inside a string. */
const SHELLS_GH = /\bexec(Sync)?\s*\(\s*[`"'][^`"']*\bgh\s+(api|pr|issue|run|auth)\b/;

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
    } else if (/\.(mjs|mts|js|ts)$/.test(entry)) {
      found.push(path);
    }
  }
  return found;
}

describe("the repository's scripts reach GitHub over REST, never through `gh`", () => {
  it("finds the scripts it is meant to be scanning", () => {
    const files = sourceFiles(SCRIPTS);
    expect(files.length).toBeGreaterThan(20);
    // The four the ticket family is about, so an accidental narrowing of the
    // walk cannot make this guard pass by scanning nothing.
    for (const name of [
      "merge-pr.mjs",
      "green-pr-sweep.mjs",
      "branch-salvage-sweep.mjs",
      "worktree-patrol.mjs",
    ]) {
      expect(files).toContain(join(SCRIPTS, name));
    }
  });

  it("spawns no `gh` process anywhere under scripts/", () => {
    const offenders = sourceFiles(SCRIPTS).filter((path) => {
      const source = readFileSync(path, "utf8");
      return SPAWNS_GH.test(source) || SHELLS_GH.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("bites on a reintroduced spawn, in either shape", () => {
    expect(SPAWNS_GH.test('const out = execFileSync("gh", ["api", path]);')).toBe(true);
    expect(SPAWNS_GH.test("spawnSync('gh', args)")).toBe(true);
    expect(SHELLS_GH.test('execSync(`gh api repos/${repo}/pulls`)')).toBe(true);
    // Prose about the binary, and the helper that replaced it, are not spawns.
    expect(SPAWNS_GH.test(" * This used to spawn `gh`, which the container lacks.")).toBe(false);
    expect(SPAWNS_GH.test("execFileSync(process.execPath, [apiHelperPath()], {")).toBe(false);
  });
});

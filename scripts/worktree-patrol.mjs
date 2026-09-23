#!/usr/bin/env node
/**
 * Worktree patrol: which shared trees are holding work nobody is coming back for?
 *
 * WHY THIS EXISTS
 *
 * Seven shared-checkout incidents in about twenty-four hours (nc#435). The one
 * that forced this: an agent died mid-task with 811 lines and two CI gates
 * sitting UNCOMMITTED in a shared tree. It survived only because a person went
 * looking. Nothing in this repo notices that, and the rule that was supposed to
 * prevent it lived in a comment, which is where rules go to rot.
 *
 * THE COLDNESS FILTER IS THE DESIGN, NOT A REFINEMENT
 *
 * Measured against this repo's twenty-three worktrees before any fix existed:
 *
 *   dirty (uncommitted or untracked, excluding node_modules)  fires on 5
 *     — but 2 of those 5 were live sessions in the middle of editing.
 *       Forty percent false positive.
 *   dirty AND cold (no file writes for >= 6h)                 fires on 3
 *     — all 3 genuinely stranded, all 3 rescued and landed.
 *
 * Two trees went from clean to dirty WHILE that measurement was running, both
 * live sessions. A naive dirty-only patrol would have paged on both. A gate
 * that cries wolf on live work is one people mute inside a week, and a muted
 * gate is worse than no gate: it looks like protection while everyone routes
 * around it. So the threshold below is the whole point of the script, and it
 * is a named constant rather than a literal so that changing it is a decision
 * somebody makes on purpose.
 *
 * REPORT-ONLY, AND THAT IS LOAD-BEARING
 *
 * This never blocks a commit, a push, or a merge, and there is deliberately no
 * pre-commit or pre-push hook for it. Blocking on a dirty SIBLING tree would
 * stop exactly the parallel work the worktrees exist to enable — the sibling
 * being mid-edit is the normal, healthy state. The only non-zero exit here is
 * "the patrol could not do its job" (no git, not a repo). A defect found is
 * always exit 0, so no caller can quietly promote this into a gate.
 *
 * WHY THIS IS A SCRIPT AND NOT A WORKFLOW
 *
 * `prompt-drift.yml` is the house pattern for a scheduled check that informs
 * rather than blocks, and its REPORTING half is copied here exactly: search
 * open issues by title, comment on the one that exists, create only when none
 * does. One issue that updates, never a new one per run.
 *
 * Its SCHEDULING half cannot be. Worktrees exist only on the machine holding
 * the checkout; an Actions runner gets one clean `actions/checkout` and has
 * nothing to scan, so a scheduled workflow would report zero forever and look
 * healthy while seeing nothing at all. That is the same failure as a muted
 * gate, wearing a green tick. So the reporting lives in `--report` here and the
 * schedule belongs to whoever owns this machine's launchd jobs.
 *
 * WHAT IS EXCLUDED FROM BOTH SCANS, AND WHY
 *
 * `node_modules` — nc#153, the symlink is still not gitignored, so it shows up
 * as a mountain of untracked noise in `git status` and, worse, as a fresh mtime
 * every time anyone installs anything. Leaving it in would make every tree look
 * simultaneously filthy and warm, which is both failure modes at once.
 * `.git` — index and ref writes are git's own bookkeeping, not a person's work.
 *
 * `.next` is deliberately NOT excluded. A build output touched three hours ago
 * is evidence somebody was here three hours ago. The cost is that a dev server
 * left running in an abandoned tree keeps it looking warm and hides it from
 * this patrol; that is a missed detection rather than a false alarm, and given
 * what the false-alarm number above did to the dirty-only design, that is the
 * right way round to be wrong.
 *
 * Run it:  node scripts/worktree-patrol.mjs            (human-readable list)
 *          node scripts/worktree-patrol.mjs --json     (machine-readable)
 *          node scripts/worktree-patrol.mjs --report    (open/update one issue)
 */

import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { ghApiSync } from "./github-api.mjs";

/**
 * Six hours. Long enough that a session pausing to think, run a build, or wait
 * on a review is never mistaken for a corpse; short enough that a tree stranded
 * overnight is named the next morning rather than the next week.
 */
export const COLD_THRESHOLD_HOURS = 6;

const MS_PER_HOUR = 60 * 60 * 1000;

/** Skipped by name in the mtime walk and matched as a path segment in status. */
export const EXCLUDED_DIRS = ["node_modules", ".git"];

export const ISSUE_TITLE = "Worktrees are holding uncommitted work and have gone cold";

/** The label the patrol's own issue carries, and how `report` finds it again. */
export const ISSUE_LABEL = "track:infra";

/** How many pages of open issues `findExistingIssue` will read before giving up. */
export const ISSUE_SEARCH_MAX_PAGES = 5;
export const ISSUE_SEARCH_PER_PAGE = 100;

/**
 * `git worktree list --porcelain` emits one blank-line-separated block per
 * tree. Only `worktree` is guaranteed; `branch`, `detached`, `bare`, `locked`
 * and `prunable` are attributes that may or may not appear.
 */
export function parseWorktreeList(porcelain) {
  const trees = [];
  let current = null;

  for (const rawLine of porcelain.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") {
      if (current) trees.push(current);
      current = null;
      continue;
    }
    const spaceAt = line.indexOf(" ");
    const key = spaceAt === -1 ? line : line.slice(0, spaceAt);
    const value = spaceAt === -1 ? "" : line.slice(spaceAt + 1);

    if (key === "worktree") {
      current = { path: value, branch: null, head: null, bare: false };
    } else if (!current) {
      continue;
    } else if (key === "branch") {
      current.branch = value.replace(/^refs\/heads\//, "");
    } else if (key === "HEAD") {
      current.head = value;
    } else if (key === "bare") {
      current.bare = true;
    } else if (key === "detached") {
      current.branch = "(detached)";
    }
  }
  if (current) trees.push(current);
  return trees;
}

/**
 * Split `git status --porcelain=v1 -uall` into change entries, dropping
 * anything under an excluded directory.
 *
 * Porcelain v1 is `XY <path>`, with renames as `XY <from> -> <to>`. Paths with
 * unusual bytes come back quoted, which does not affect a segment match for
 * `node_modules/`.
 */
export function parseStatus(statusText) {
  const changes = [];
  for (const rawLine of statusText.split("\n")) {
    if (rawLine.trim() === "") continue;
    const code = rawLine.slice(0, 2);
    const path = rawLine.slice(3);
    if (isExcludedPath(path)) continue;
    changes.push({ code, path });
  }
  return changes;
}

/** True when any path segment is an excluded directory. */
export function isExcludedPath(path) {
  const segments = path.replace(/^"|"$/g, "").split(/\/|\s->\s/);
  return segments.some((segment) => EXCLUDED_DIRS.includes(segment));
}

/**
 * Newest mtime anywhere under `dir`, in ms, or null if the walk found nothing.
 *
 * Directory mtimes count as well as file mtimes: deleting a file updates only
 * the parent directory, and a deletion is a person working just as much as a
 * write is.
 *
 * Symlinks are stat'd but never followed. Following them would walk out of the
 * tree entirely — `node_modules` here is a symlink to a sibling checkout
 * (nc#153), so following it would read another tree's activity as this one's.
 */
export function newestMtimeMs(dir, { now = Date.now() } = {}) {
  let newest = null;
  const stack = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue; // unreadable or vanished mid-walk; not this script's business
    }

    /*
     * A directory that CONTAINS an excluded entry has an untrustworthy mtime,
     * so its own is skipped. Creating or removing `node_modules` stamps the
     * repo root, which would leave every tree looking freshly worked on for six
     * hours after any `npm ci` — the exact "node_modules makes everything look
     * warm" failure this script's header warns about, arriving through the
     * back door of the parent's mtime rather than the child's.
     */
    const hasExcludedChild = entries.some((entry) => EXCLUDED_DIRS.includes(entry.name));
    if (!hasExcludedChild) {
      try {
        newest = maxMtime(newest, lstatSync(current).mtimeMs, now);
      } catch {
        /* ignore */
      }
    }

    for (const entry of entries) {
      if (EXCLUDED_DIRS.includes(entry.name)) continue;
      const full = join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      try {
        newest = maxMtime(newest, lstatSync(full).mtimeMs, now);
      } catch {
        /* ignore */
      }
    }
  }
  return newest;
}

/**
 * Clock skew and restored files can both produce an mtime in the future, and a
 * future mtime would keep a stranded tree permanently warm. Clamp to now.
 */
function maxMtime(currentNewest, candidate, now) {
  const clamped = Math.min(candidate, now);
  return currentNewest === null ? clamped : Math.max(currentNewest, clamped);
}

/**
 * The judgement, kept pure so it can be tested without a filesystem: a tree is
 * a finding only when it is dirty AND its newest write is at least
 * COLD_THRESHOLD_HOURS old.
 *
 * A tree with no readable mtime at all (newestMtimeMs === null) is NOT called
 * cold. "I could not measure this" is not "this is abandoned", and inventing a
 * finding out of a failed measurement is how a gate earns its first mute.
 */
export function classify(tree, { now = Date.now() } = {}) {
  if (tree.missing) return { ...tree, verdict: "missing", ageHours: null };

  const dirty = tree.changes.length > 0;
  const ageHours =
    tree.newestMtimeMs === null ? null : (now - tree.newestMtimeMs) / MS_PER_HOUR;
  const cold = ageHours !== null && ageHours >= COLD_THRESHOLD_HOURS;

  let verdict = "clean";
  if (dirty && cold) verdict = "stranded";
  else if (dirty) verdict = "live";

  return { ...tree, verdict, ageHours, dirty, cold };
}

/** Collect the raw facts for one worktree. Touches the filesystem and git. */
export function inspect(tree, { now = Date.now(), git = runGit } = {}) {
  if (!existsSync(tree.path)) {
    return {
      ...tree,
      missing: true,
      reason: "directory is gone",
      changes: [],
      newestMtimeMs: null,
    };
  }

  let changes = [];
  try {
    /*
     * --no-optional-locks matters. A plain `git status` may refresh and rewrite
     * the index, which means a patrol run could contend with the index lock of
     * a live session it is only meant to be observing. A patrol that perturbs
     * the work it watches is not a patrol.
     */
    const status = git([
      "--no-optional-locks",
      "-C",
      tree.path,
      "status",
      "--porcelain=v1",
      "-uall",
    ]);
    changes = parseStatus(status);
  } catch {
    /*
     * The directory is there but git cannot read it — a gitdir pointing
     * nowhere, usually. Same family of defect as a vanished directory (a
     * worktree entry that no longer corresponds to a usable tree) and reported
     * alongside it, but named differently because the fix is different.
     */
    return {
      ...tree,
      missing: true,
      reason: "git cannot read this tree",
      changes: [],
      newestMtimeMs: null,
    };
  }

  return {
    ...tree,
    missing: false,
    changes,
    newestMtimeMs: newestMtimeMs(tree.path, { now }),
  };
}

export function patrol({ now = Date.now(), git = runGit } = {}) {
  const trees = parseWorktreeList(git(["worktree", "list", "--porcelain"])).filter(
    (tree) => !tree.bare,
  );
  const results = trees.map((tree) => classify(inspect(tree, { now, git }), { now }));

  return {
    scanned: results.length,
    stranded: results.filter((r) => r.verdict === "stranded"),
    missing: results.filter((r) => r.verdict === "missing"),
    live: results.filter((r) => r.verdict === "live"),
    clean: results.filter((r) => r.verdict === "clean"),
  };
}

export function formatReport(findings) {
  const lines = [];
  const { stranded, missing, scanned, live } = findings;

  if (stranded.length === 0 && missing.length === 0) {
    lines.push(
      `Scanned ${scanned} worktrees. Nothing stranded.` +
        (live.length > 0
          ? ` ${live.length} dirty but warm, which is a session working.`
          : ""),
    );
    return lines.join("\n");
  }

  if (stranded.length > 0) {
    lines.push(
      `${stranded.length} worktree${stranded.length === 1 ? "" : "s"} holding uncommitted work with no file written for ${COLD_THRESHOLD_HOURS}h or more:`,
    );
    lines.push("");
    for (const tree of stranded) {
      lines.push(
        `  ${tree.path}` +
          `\n    branch:      ${tree.branch ?? "(none)"}` +
          `\n    changes:     ${tree.changes.length} (${summariseChanges(tree.changes)})` +
          `\n    last write:  ${formatAge(tree.ageHours)} ago`,
      );
      for (const change of tree.changes.slice(0, 5)) {
        lines.push(`      ${change.code} ${change.path}`);
      }
      if (tree.changes.length > 5) {
        lines.push(`      ... and ${tree.changes.length - 5} more`);
      }
      lines.push("");
    }
  }

  if (missing.length > 0) {
    lines.push(
      `${missing.length} worktree entr${missing.length === 1 ? "y" : "ies"} git can no longer use (\`git worktree prune\` clears these):`,
    );
    lines.push("");
    for (const tree of missing) {
      lines.push(
        `  ${tree.path} (${tree.branch ?? "no branch"}) — ${tree.reason ?? "unusable"}`,
      );
    }
    lines.push("");
  }

  lines.push(
    `Scanned ${scanned} worktrees. ${live.length} dirty but warm — those are live sessions and are left alone.`,
  );
  return lines.join("\n");
}

function summariseChanges(changes) {
  const untracked = changes.filter((c) => c.code === "??").length;
  const tracked = changes.length - untracked;
  const parts = [];
  if (tracked > 0) parts.push(`${tracked} tracked`);
  if (untracked > 0) parts.push(`${untracked} untracked`);
  return parts.join(", ");
}

function formatAge(hours) {
  if (hours === null) return "unknown";
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

function runGit(args) {
  return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

/**
 * The patrol's own open issue, by exact title, or null (nc#1206).
 *
 * This used to be `gh issue list --search "<title> in:title"`, and it is a list
 * rather than a search now for two reasons. The containers this patrol runs in
 * have no `gh`, which is the ticket; and GitHub's search index lags its own
 * writes by seconds to minutes, so a patrol running twice inside that window
 * would find nothing and open a SECOND issue — precisely the duplicate this
 * function exists to prevent. The open-issue table answers from the write.
 *
 * Every open issue is read rather than only the ones carrying `ISSUE_LABEL`.
 * The label is applied by this script and can be taken off by a person, and a
 * filter on it would answer "no such issue" for an issue that is sitting right
 * there — a duplicate opened because a label was tidied. Five pages of a
 * hundred is well past this repository's open count, and the walk stops at the
 * first short page.
 *
 * The title match is exact. A near-match is somebody else's issue, and
 * commenting a worktree report onto it would be worse than opening a new one.
 */
export function findExistingIssue(repo, { api = ghApiSync } = {}) {
  for (let page = 1; page <= ISSUE_SEARCH_MAX_PAGES; page += 1) {
    const rows = JSON.parse(
      api([
        "api",
        `repos/${repo}/issues?state=open&per_page=${ISSUE_SEARCH_PER_PAGE}&page=${page}`,
      ]) || "[]",
    );
    for (const row of rows) {
      // `/issues` returns pull requests too, and a pull request that happened
      // to carry this title is not the issue to comment on.
      if (row.pull_request) continue;
      if (row.title === ISSUE_TITLE) return row.number;
    }
    if (rows.length < ISSUE_SEARCH_PER_PAGE) break;
  }
  return null;
}

/**
 * The prompt-drift.yml reporting pattern, verbatim in intent: find the open
 * issue by title, comment on it, and create one only when none exists. A new
 * issue every morning is a subscription to noise, and noise is what gets a
 * report-only check filtered into a folder nobody opens.
 *
 * Every call is REST through `scripts/github-api.mjs` since nc#1206. The patrol
 * exists to file a finding unattended, and unattended is exactly where `gh` is
 * absent: before this, the one thing it is for was the one thing it could not
 * do, and it failed with `spawnSync gh ENOENT` after the report had already
 * printed, so the run looked like it had worked.
 */
export function report(findings, repo, { api = ghApiSync, log = console.log } = {}) {
  if (findings.stranded.length === 0 && findings.missing.length === 0) return;

  const body = [
    "A worktree in this checkout is holding uncommitted work and nobody has written a file in it for " +
      `${COLD_THRESHOLD_HOURS} hours or more. That combination is what a session that died mid-task looks like.`,
    "",
    "```",
    formatReport(findings),
    "```",
    "",
    "Report-only: nothing here blocked anything. Rescue the work (`git stash`, a branch, or a `refs/rescue/*` snapshot), or confirm it is disposable and clear the tree. Re-checked on each patrol run; this issue updates rather than duplicating.",
  ].join("\n");

  const existing = findExistingIssue(repo, { api });

  if (existing) {
    api(["api", `repos/${repo}/issues/${existing}/comments`, "-f", `body=${body}`]);
    log(`worktree-patrol: commented on ${repo}#${existing}`);
  } else {
    const created = JSON.parse(
      api([
        "api",
        `repos/${repo}/issues`,
        "-f",
        `title=${ISSUE_TITLE}`,
        "-f",
        `body=${body}`,
        "-f",
        `labels[]=${ISSUE_LABEL}`,
      ]),
    );
    log(`worktree-patrol: opened ${repo}#${created.number}`);
  }
}

function main(argv) {
  const wantsJson = argv.includes("--json");
  const wantsReport = argv.includes("--report");
  const repoAt = argv.indexOf("--repo");
  const repo =
    repoAt !== -1 ? argv[repoAt + 1] : process.env.GITHUB_REPOSITORY || "johangace/nature-class";

  const findings = patrol();

  if (wantsJson) {
    console.log(JSON.stringify(findings, null, 2));
  } else {
    console.log(formatReport(findings));
  }

  if (wantsReport) report(findings, repo);

  /*
   * Always zero on a finding. See the header: the one thing this script must
   * never become is something that can fail a build.
   */
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    // A patrol that cannot run should say so loudly; that is a real failure,
    // and it is the only one this script owns.
    console.error(`worktree-patrol could not run: ${error.message}`);
    process.exitCode = 1;
  }
}

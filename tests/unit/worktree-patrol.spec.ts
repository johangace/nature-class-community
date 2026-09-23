/**
 * The worktree patrol's judgement, held to the numbers that produced it.
 *
 * nc#435 measured the naive version against this repo's real twenty-three
 * worktrees: "tree is dirty" fired on 5, and 2 of those 5 were live sessions
 * mid-edit — a forty percent false positive rate. Adding "and cold for >= 6h"
 * took it to 3, all genuinely stranded.
 *
 * So the test that matters most here is not "does it find the stranded tree".
 * It is "does it stay silent about the DIRTY WARM one", because that is the
 * case that decides whether anybody still has this switched on next week. Both
 * are asserted below against real directories with real mtimes, not mocks, so
 * that a regression in the walk shows up as a failure rather than as a patrol
 * that quietly reports everything or nothing.
 */
import { describe, expect, it, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ClassifiedTree, Findings } from "../../scripts/worktree-patrol.d.mts";
import {
  COLD_THRESHOLD_HOURS,
  ISSUE_LABEL,
  ISSUE_TITLE,
  classify,
  findExistingIssue,
  formatReport,
  isExcludedPath,
  newestMtimeMs,
  parseStatus,
  parseWorktreeList,
  patrol,
  report,
} from "../../scripts/worktree-patrol.mjs";

const HOUR_MS = 60 * 60 * 1000;
const scratch: string[] = [];

afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

/** A directory tree whose every entry is stamped `ageHours` old. */
function treeAged(ageHours: number, files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "worktree-patrol-"));
  scratch.push(root);
  const stamp = (Date.now() - ageHours * HOUR_MS) / 1000;
  const created: string[] = [root];

  for (const [relative, contents] of Object.entries(files)) {
    const full = join(root, relative);
    const parent = full.slice(0, full.lastIndexOf("/"));
    mkdirSync(parent, { recursive: true });
    writeFileSync(full, contents);
    created.push(parent, full);
  }
  // Deepest first: writing a child bumps its parent's mtime, so parents have to
  // be re-stamped after everything beneath them is final.
  for (const path of created.sort((a, b) => b.length - a.length)) {
    utimesSync(path, stamp, stamp);
  }
  return root;
}

describe("parseWorktreeList", () => {
  it("reads paths, branches, detached heads and bare entries", () => {
    const trees = parseWorktreeList(
      [
        "worktree /repo/main",
        "HEAD abc123",
        "branch refs/heads/main",
        "",
        "worktree /repo/.worktrees/feature",
        "HEAD def456",
        "branch refs/heads/feat/thing",
        "",
        "worktree /repo/.worktrees/loose",
        "HEAD 999999",
        "detached",
        "",
        "worktree /repo/bare",
        "bare",
        "",
      ].join("\n"),
    );

    expect(trees.map((t) => t.path)).toEqual([
      "/repo/main",
      "/repo/.worktrees/feature",
      "/repo/.worktrees/loose",
      "/repo/bare",
    ]);
    expect(trees[1]?.branch).toBe("feat/thing");
    expect(trees[2]?.branch).toBe("(detached)");
    expect(trees[3]?.bare).toBe(true);
  });

  it("keeps the last block when the output does not end in a blank line", () => {
    const trees = parseWorktreeList("worktree /repo/main\nHEAD abc\nbranch refs/heads/main");
    expect(trees).toHaveLength(1);
    expect(trees[0]?.branch).toBe("main");
  });
});

describe("parseStatus", () => {
  it("drops node_modules and keeps real work", () => {
    const changes = parseStatus(
      [
        "?? node_modules/left-pad/index.js",
        " M app/lesson/page.tsx",
        "?? scripts/dev-3601.sh",
        "?? packages/thing/node_modules/x.js",
        "A  lib/outside/new.ts",
      ].join("\n"),
    );

    expect(changes.map((c) => c.path)).toEqual([
      "app/lesson/page.tsx",
      "scripts/dev-3601.sh",
      "lib/outside/new.ts",
    ]);
  });

  it("excludes on a whole path segment, not a substring", () => {
    // A file merely NAMED after node_modules is somebody's real work and must
    // not be filtered away with the noise.
    expect(isExcludedPath("docs/node_modules-and-symlinks.md")).toBe(false);
    expect(isExcludedPath("node_modules/x")).toBe(true);
    expect(isExcludedPath("a/b/.git/config")).toBe(true);
  });

  it("follows both halves of a rename", () => {
    expect(parseStatus("R  old.ts -> new.ts")).toHaveLength(1);
    expect(parseStatus("R  old.ts -> node_modules/new.ts")).toHaveLength(0);
  });
});

describe("newestMtimeMs", () => {
  it("ignores node_modules and .git when deciding how cold a tree is", () => {
    const root = treeAged(12, {
      "app/page.tsx": "old work",
      "docs/notes.md": "old notes",
    });
    // The two things that would otherwise make every tree look permanently
    // warm: a fresh install, and git's own bookkeeping.
    mkdirSync(join(root, "node_modules/left-pad"), { recursive: true });
    writeFileSync(join(root, "node_modules/left-pad/index.js"), "fresh");
    mkdirSync(join(root, ".git"), { recursive: true });
    writeFileSync(join(root, ".git/index"), "fresh");

    const ageHours = (Date.now() - (newestMtimeMs(root) as number)) / HOUR_MS;
    expect(ageHours).toBeGreaterThan(11);
  });

  it("does not follow a node_modules symlink out of the tree", () => {
    // nc#153: node_modules here is a symlink to a sibling checkout. Following
    // it would read another tree's activity as this one's, which is exactly how
    // a stranded tree would look alive forever.
    const warmElsewhere = treeAged(0, { "index.js": "very fresh" });
    const root = treeAged(20, { "app/page.tsx": "old" });
    symlinkSync(warmElsewhere, join(root, "node_modules"));

    const ageHours = (Date.now() - (newestMtimeMs(root) as number)) / HOUR_MS;
    expect(ageHours).toBeGreaterThan(19);
  });

  it("sees a deletion, which only ever touches the parent directory", () => {
    const root = treeAged(20, { "app/page.tsx": "old", "app/gone.tsx": "about to go" });
    rmSync(join(root, "app/gone.tsx"));

    const ageHours = (Date.now() - (newestMtimeMs(root) as number)) / HOUR_MS;
    expect(ageHours).toBeLessThan(0.1);
  });

  it("sees a write anywhere in the tree, however deep", () => {
    const root = treeAged(20, { "a/b/c/d/deep.ts": "old" });
    writeFileSync(join(root, "a/b/c/d/deep.ts"), "someone just typed this");

    const ageHours = (Date.now() - (newestMtimeMs(root) as number)) / HOUR_MS;
    expect(ageHours).toBeLessThan(0.1);
  });
});

describe("classify", () => {
  const now = Date.UTC(2026, 7, 25, 12, 0, 0);
  const dirty = [{ code: " M", path: "app/page.tsx" }];

  const at = (hoursAgo: number) => now - hoursAgo * HOUR_MS;

  it("fires on dirty AND cold", () => {
    const verdict = classify(
      { path: "/t", branch: "x", changes: dirty, newestMtimeMs: at(9), missing: false },
      { now },
    );
    expect(verdict.verdict).toBe("stranded");
    expect(verdict.ageHours).toBeCloseTo(9);
  });

  it("stays silent on dirty but WARM — the 40% false positive the filter exists to kill", () => {
    const verdict = classify(
      { path: "/t", branch: "x", changes: dirty, newestMtimeMs: at(0.5), missing: false },
      { now },
    );
    expect(verdict.verdict).toBe("live");
  });

  it("stays silent on cold but clean", () => {
    const verdict = classify(
      { path: "/t", branch: "x", changes: [], newestMtimeMs: at(200), missing: false },
      { now },
    );
    expect(verdict.verdict).toBe("clean");
  });

  it("treats the threshold as inclusive and holds it at six hours", () => {
    expect(COLD_THRESHOLD_HOURS).toBe(6);
    const base = { path: "/t", branch: "x", changes: dirty, missing: false };
    expect(classify({ ...base, newestMtimeMs: at(6) }, { now }).verdict).toBe("stranded");
    expect(classify({ ...base, newestMtimeMs: at(5.99) }, { now }).verdict).toBe("live");
  });

  it("does not call an unmeasurable tree cold", () => {
    // "I could not read this" is not "this is abandoned". Inventing a finding
    // out of a failed measurement is how a report-only check earns its mute.
    const verdict = classify(
      { path: "/t", branch: "x", changes: dirty, newestMtimeMs: null, missing: false },
      { now },
    );
    expect(verdict.verdict).toBe("live");
  });

  it("reports a worktree entry whose directory is gone", () => {
    const verdict = classify(
      { path: "/gone", branch: "x", changes: [], newestMtimeMs: null, missing: true },
      { now },
    );
    expect(verdict.verdict).toBe("missing");
  });
});

describe("patrol, end to end against real directories", () => {
  it("names the stranded tree, leaves the live one alone, and flags the vanished entry", () => {
    const stranded = treeAged(30, { "app/page.tsx": "811 lines of unfinished work" });
    const live = treeAged(0, { "app/page.tsx": "being typed right now" });
    const clean = treeAged(50, { "app/page.tsx": "committed and quiet" });
    const gone = join(tmpdir(), "worktree-patrol-never-existed");

    const dirtyStatus = " M app/page.tsx\n?? scratch.md\n";
    const git = (args: string[]): string => {
      if (args[0] === "worktree") {
        return [stranded, live, clean, gone]
          .map((path, i) => `worktree ${path}\nHEAD abc${i}\nbranch refs/heads/b${i}\n`)
          .join("\n");
      }
      const path = args[args.indexOf("-C") + 1];
      if (path === gone) throw new Error("not a git repository");
      return path === clean ? "" : dirtyStatus;
    };

    const findings = patrol({ git });

    expect(findings.scanned).toBe(4);
    expect(findings.stranded.map((t) => t.path)).toEqual([stranded]);
    expect(findings.live.map((t) => t.path)).toEqual([live]);
    expect(findings.clean.map((t) => t.path)).toEqual([clean]);
    expect(findings.missing.map((t) => t.path)).toEqual([gone]);

    const text = formatReport(findings);
    expect(text).toContain(stranded);
    expect(text).toContain(gone);
    expect(text).toContain("directory is gone");
    expect(text).not.toContain(live);
  });

  it("says so plainly when there is nothing to report", () => {
    // The correct state on the day this merges: the three defects it fires on
    // were all cleared in the run that specified it.
    const text = formatReport({ scanned: 23, stranded: [], missing: [], live: [], clean: [] });
    expect(text).toContain("Nothing stranded");
  });
});

/**
 * The half the patrol exists for, and the half that could not run (nc#1206).
 *
 * Filing the finding was `gh issue list` / `gh issue comment` / `gh issue
 * create`, and the containers this patrol runs in unattended have no `gh`. So
 * the report printed, the run looked fine, and the issue was never opened —
 * the one thing a report-only check is for, failing after the output that
 * makes it look like it worked. It is REST through `scripts/github-api.mjs`
 * now, and the transport is injected here so the contract is asserted without
 * a network.
 */
describe("filing the finding (nc#1206)", () => {
  const STRANDED: ClassifiedTree = {
    path: "/repo/wt/a",
    branch: "claude/1-x",
    changes: [{ code: " M", path: "lib/outside/today.ts" }],
    newestMtimeMs: 0,
    ageHours: 12,
    verdict: "stranded",
    dirty: true,
    cold: true,
  };
  const FINDINGS: Findings = {
    scanned: 2,
    stranded: [STRANDED],
    missing: [],
    live: [],
    clean: [],
  };

  function issuesPage(rows: unknown[]) {
    return JSON.stringify(rows);
  }

  it("finds its own open issue by exact title", () => {
    const number = findExistingIssue("o/r", {
      api: () =>
        issuesPage([
          { number: 11, title: "Something else entirely" },
          { number: 12, title: ISSUE_TITLE },
        ]),
    });
    expect(number).toBe(12);
  });

  it("does not mistake a pull request that carries the title for the issue", () => {
    const number = findExistingIssue("o/r", {
      api: () =>
        issuesPage([{ number: 13, title: ISSUE_TITLE, pull_request: { url: "…" } }]),
    });
    expect(number).toBeNull();
  });

  it("does not mistake a near-match for its own issue", () => {
    const number = findExistingIssue("o/r", {
      api: () => issuesPage([{ number: 14, title: `${ISSUE_TITLE} (again)` }]),
    });
    expect(number).toBeNull();
  });

  it("asks the live issue list rather than the search index, which lags its own writes", () => {
    const calls: string[][] = [];
    findExistingIssue("o/r", {
      api: (args: string[]) => {
        calls.push(args);
        return issuesPage([]);
      },
    });
    expect(calls[0]![1]).toContain("repos/o/r/issues?state=open");
    expect(calls.flat().join(" ")).not.toContain("search/issues");
  });

  /**
   * The label is this script's own and a person can take it off. Filtering on
   * it would answer "no such issue" for an issue sitting in plain sight, and
   * the patrol would open a duplicate because somebody tidied a label.
   */
  it("finds its issue even when the label it applied has been removed", () => {
    const number = findExistingIssue("o/r", {
      api: (args: string[]) => {
        expect(args[1]).not.toContain("labels=");
        return issuesPage([{ number: 15, title: ISSUE_TITLE, labels: [] }]);
      },
    });
    expect(number).toBe(15);
  });

  it("comments on the existing issue rather than opening a second one", () => {
    const calls: string[][] = [];
    report(FINDINGS, "o/r", {
      api: (args: string[]) => {
        calls.push(args);
        return args[1]!.startsWith("repos/o/r/issues?")
          ? issuesPage([{ number: 12, title: ISSUE_TITLE }])
          : "{}";
      },
      log: () => {},
    });
    const write = calls.at(-1)!;
    expect(write[1]).toBe("repos/o/r/issues/12/comments");
    expect(write.join(" ")).toContain(STRANDED.path);
    expect(calls.flat()).not.toContain("repos/o/r/issues");
  });

  it("opens one carrying the label it later finds itself by", () => {
    const calls: string[][] = [];
    report(FINDINGS, "o/r", {
      api: (args: string[]) => {
        calls.push(args);
        return args[1]!.startsWith("repos/o/r/issues?") ? issuesPage([]) : '{"number":99}';
      },
      log: () => {},
    });
    const write = calls.at(-1)!;
    expect(write[1]).toBe("repos/o/r/issues");
    expect(write).toContain(`title=${ISSUE_TITLE}`);
    expect(write).toContain(`labels[]=${ISSUE_LABEL}`);
  });

  it("writes nothing at all on a clean run", () => {
    let calls = 0;
    const empty: Findings = { scanned: 3, stranded: [], missing: [], live: [], clean: [] };
    report(empty, "o/r", {
      api: () => {
        calls += 1;
        return "[]";
      },
      log: () => {},
    });
    expect(calls).toBe(0);
  });
});

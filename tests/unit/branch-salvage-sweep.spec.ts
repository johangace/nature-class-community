/**
 * The branch salvage sweep, held to the failure that produced it.
 *
 * nc#436: three files from a partially-landed squash sat on `wb-profile-lesson`
 * for fifteen days and were found by accident. nc#550 asked how many others
 * there are. The sweep answers that, and the merge-time gate is supposed to
 * stop the next one being created.
 *
 * Two things have to be true of any check in this repository (nc#554), and they
 * are the two halves of this file:
 *
 *   IT BITES.  Every scenario below builds a REAL scratch repository with real
 *              commits and a real partial squash, and asserts the tool names
 *              the lost file. A check nobody has watched fail is not a check.
 *   IT IS QUIET. The mirror assertions matter as much: a clean squash, a file
 *              edited and reverted during review, a rename. Those are the cases
 *              that decide whether anyone still has this switched on next week
 *              — `worktree-patrol.mjs` (nc#435) is in this repository because a
 *              40% false-positive rate got measured before the gate shipped
 *              rather than after it was muted.
 *
 * These repositories are built with `git commit-tree`-free plain commands and
 * an explicit identity, so they do not read the machine's git config and cannot
 * be perturbed by it.
 */
import { describe, expect, it, afterAll, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  COLD_THRESHOLD_HOURS,
  FILE_STATES,
  VERDICTS,
  assertDeepClone,
  classifyFile,
  formatGate,
  gateBranch,
  mainContentIndex,
  sweepBranch,
  verdictFor,
  type MainIndex,
} from "../../scripts/branch-salvage-sweep.mjs";

/**
 * Every scenario here shells out to real git in a real scratch repository, so
 * these tests are the slowest in the suite by a wide margin and their cost is
 * process spawning rather than computation. Under vitest's default five-second
 * limit they pass alone and time out when the rest of the suite is competing
 * for the same cores, which reads as "the salvage gate is broken" when nothing
 * about the gate has changed. The limit is raised for this file only: a real
 * regression here fails on an assertion, not a clock.
 *
 * The other half of that cost is a fixture built more than once (nc#651). A
 * scenario two tests both ask questions of is built once in a `beforeAll` and
 * read twice — no test writes to these repositories — so the file spawns fewer
 * processes to say the same thing.
 */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function makeRepo(): { dir: string; git: (args: string[]) => string } {
  const dir = mkdtempSync(join(tmpdir(), "salvage-sweep-"));
  scratch.push(dir);
  const git = (args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=sweep test",
        "-c",
        "user.email=sweep@example.invalid",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: dir, encoding: "utf8", maxBuffer: 1 << 26 },
    ) ?? "";
  git(["init", "-q", "-b", "main"]);
  return { dir, git };
}

function write(dir: string, path: string, body: string) {
  const full = join(dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
}

function commit(repo: { dir: string; git: (a: string[]) => string }, message: string) {
  repo.git(["add", "-A"]);
  repo.git(["commit", "-q", "-m", message]);
}

/**
 * The nc#436 situation, reconstructed: a branch authors three files, and only
 * two of them reach main. The squash is modelled the way this repository really
 * merges — a fresh commit on main carrying the branch's blobs, with the branch
 * left behind and never an ancestor of anything.
 */
function partialSquashRepo() {
  const repo = makeRepo();
  write(repo.dir, "app/card.ts", "export const card = 1;\n");
  commit(repo, "initial");

  repo.git(["checkout", "-q", "-b", "twin"]);
  write(repo.dir, "app/card.ts", "export const card = 2;\n");
  write(repo.dir, "tests/landed.spec.ts", "// this one is carried\n");
  write(repo.dir, "tests/stranded.spec.ts", "// this one is not\n");
  commit(repo, "twin: three files");

  // The squash: main gets the branch's content for two of the three paths, in a
  // commit that does not have the branch as a parent. This is what breaks every
  // ancestry-based test and why the sweep asks about content instead.
  repo.git(["checkout", "-q", "main"]);
  write(repo.dir, "app/card.ts", "export const card = 2;\n");
  write(repo.dir, "tests/landed.spec.ts", "// this one is carried\n");
  commit(repo, "Squash of the twin's PR (2 of 3 files)");
  return repo;
}

describe("the sweep reproduces the nc#436 partial squash", () => {
  // One repository, two questions asked of it. Neither test writes to it.
  let repo: ReturnType<typeof makeRepo>;
  beforeAll(() => {
    repo = partialSquashRepo();
  });

  it("names the file the squash left behind, and only that file", () => {
    const result = sweepBranch("twin", { mainRef: "main", git: repo.git, now: Date.now() });

    const stranded = result.files.filter((f) => f.state === "never-landed").map((f) => f.path);
    expect(stranded).toEqual(["tests/stranded.spec.ts"]);

    // The two that landed are recognised as landed even though the branch is
    // not an ancestor of main and `git branch --merged` would list neither.
    expect(result.counts.landed).toBe(2);
    expect(repo.git(["branch", "--merged", "main"])).not.toContain("twin");
  });

  it("flags the branch as a partial landing, which is the shape worth chasing", () => {
    // A month later, so the cold filter is out of the way and the verdict is
    // about the content rather than about the clock. The warm case is asserted
    // on its own below.
    const later = Date.now() + 30 * 24 * 3_600_000;
    const result = sweepBranch("twin", { mainRef: "main", git: repo.git, now: later });
    expect(result.partialLanding).toBe(true);
    expect(result.verdict).toBe("stranded");
  });

  it("says nothing when the squash carried everything", () => {
    const repo = makeRepo();
    write(repo.dir, "app/card.ts", "one\n");
    commit(repo, "initial");
    repo.git(["checkout", "-q", "-b", "whole"]);
    write(repo.dir, "app/card.ts", "two\n");
    write(repo.dir, "tests/new.spec.ts", "// new\n");
    commit(repo, "whole: two files");
    repo.git(["checkout", "-q", "main"]);
    write(repo.dir, "app/card.ts", "two\n");
    write(repo.dir, "tests/new.spec.ts", "// new\n");
    commit(repo, "Squash of the whole PR");

    const result = sweepBranch("whole", { mainRef: "main", git: repo.git });
    expect(result.files.every((f) => f.state === "landed")).toBe(true);
    expect(result.partialLanding).toBe(false);
    expect(result.verdict).toBe("landed");
  });
});

describe("the merge-time gate", () => {
  /**
   * The gate's own scenario: a file authored during the build and removed
   * before the tip. No diff of the branch shows it, so nothing but a walk of
   * the branch's history can see it — and it is the "squash lands fewer files
   * than the branch touched" case nc#550 names.
   */
  function droppedDuringReviewRepo() {
    const repo = makeRepo();
    write(repo.dir, "app/card.ts", "one\n");
    commit(repo, "initial");
    repo.git(["checkout", "-q", "-b", "feature"]);
    write(repo.dir, "app/card.ts", "two\n");
    write(repo.dir, "scripts/one-off-audit.mjs", "// 150 lines of measurement\n");
    commit(repo, "feature: the change and the script that proved it");
    unlinkSync(join(repo.dir, "scripts/one-off-audit.mjs"));
    commit(repo, "drop the script before review");
    return repo;
  }

  it("bites: it names the file the branch authored and the squash will not carry", () => {
    const repo = droppedDuringReviewRepo();
    const gate = gateBranch("feature", { mainRef: "main", git: repo.git });
    expect(gate.lost.map((f) => f.path)).toEqual(["scripts/one-off-audit.mjs"]);
    expect(formatGate(gate)).toContain("scripts/one-off-audit.mjs");
    expect(formatGate(gate)).toContain("will NOT carry");
  });

  it("stays silent on a branch that drops nothing", () => {
    const repo = makeRepo();
    write(repo.dir, "app/card.ts", "one\n");
    commit(repo, "initial");
    repo.git(["checkout", "-q", "-b", "tidy"]);
    write(repo.dir, "app/card.ts", "two\n");
    commit(repo, "tidy: one file");

    const gate = gateBranch("tidy", { mainRef: "main", git: repo.git });
    expect(gate.lost).toEqual([]);
    expect(formatGate(gate)).toContain("every one of them lands");
  });

  /**
   * The noise case that decides whether this gate survives contact with real
   * reviews. Trying something and putting it back is ordinary, happens
   * constantly, and must not fire — the reverted file holds main's own blob, so
   * the content test filters it out with no special case.
   */
  it("stays silent when a file was edited and reverted during the build", () => {
    const repo = makeRepo();
    write(repo.dir, "app/card.ts", "one\n");
    commit(repo, "initial");
    repo.git(["checkout", "-q", "-b", "tried-it"]);
    write(repo.dir, "app/card.ts", "an experiment\n");
    commit(repo, "try something");
    write(repo.dir, "app/card.ts", "one\n");
    commit(repo, "put it back");

    const gate = gateBranch("tried-it", { mainRef: "main", git: repo.git });
    expect(gate.lost).toEqual([]);
  });

  /**
   * A pure rename is already handled with no special case — the blob test is
   * path-blind, so a file moved with its content intact reads `landed` wherever
   * it ended up. That is asserted first, because it is why this report is short.
   */
  it("is not fooled by a rename that kept the content", () => {
    const repo = makeRepo();
    write(repo.dir, "app/old/View.tsx", "export const View = () => null;\n");
    commit(repo, "initial");
    repo.git(["checkout", "-q", "-b", "moved"]);
    unlinkSync(join(repo.dir, "app/old/View.tsx"));
    write(repo.dir, "app/new/View.tsx", "export const View = () => null;\n");
    commit(repo, "moved: same content, new home");

    const gate = gateBranch("moved", { mainRef: "main", git: repo.git });
    expect(gate.lost).toEqual([]);
  });

  /**
   * The rename that DOES fire: a directory renamed twice during a build, where
   * the moved file also changed a line, so no blob matches. This is real —
   * `app/session/paged/` became `app/session/legacy/` on
   * `feat/232-teacher-voice-plain-ink` and produced six flagged files that were
   * all one rename. The gate still fires, because the content genuinely is not
   * on main and only a person can say the rename is what happened. What it must
   * do is say so ON THE LINE, or a reader learns to skim it.
   */
  it("marks a likely rename rather than presenting it as bare loss", () => {
    const repo = makeRepo();
    write(repo.dir, "app/old/View.tsx", "export const View = () => null;\n");
    commit(repo, "initial");
    repo.git(["checkout", "-q", "-b", "renaming"]);
    unlinkSync(join(repo.dir, "app/old/View.tsx"));
    write(repo.dir, "app/paged/View.tsx", "export const View = () => <PagedFrame />;\n");
    commit(repo, "renaming: move and edit");
    unlinkSync(join(repo.dir, "app/paged/View.tsx"));
    write(repo.dir, "app/legacy/View.tsx", "export const View = () => <LegacyFrame />;\n");
    commit(repo, "renaming: settle on legacy/");
    repo.git(["checkout", "-q", "main"]);
    unlinkSync(join(repo.dir, "app/old/View.tsx"));
    write(repo.dir, "app/legacy/View.tsx", "export const View = () => <LegacyFrame />;\n");
    commit(repo, "Squash of the rename");

    const gate = gateBranch("renaming", { mainRef: "main", git: repo.git });
    expect(gate.lost.map((f) => f.path)).toEqual(["app/paged/View.tsx"]);
    expect(gate.lost[0]?.sameNameOnMain).toContain("app/legacy/View.tsx");
    expect(formatGate(gate)).toContain("likely a rename");
  });
});

describe("the shallow-clone refusal", () => {
  /**
   * The one way this tool can lie. "Is this content anywhere in main's history"
   * is meaningless with part of main's history, and the failure is silent and
   * inverted — a report full of false strandings, or worse, a caller told
   * "nothing here" by a tool that could not see. The worktree this was written
   * in WAS shallow (main truncated to 57 of 425 commits), which is how the case
   * was found.
   */
  it("refuses rather than reporting when main's history is truncated", () => {
    const origin = makeRepo();
    write(origin.dir, "a.txt", "1\n");
    commit(origin, "one");
    write(origin.dir, "a.txt", "2\n");
    commit(origin, "two");
    write(origin.dir, "a.txt", "3\n");
    commit(origin, "three");

    const shallowDir = mkdtempSync(join(tmpdir(), "salvage-shallow-"));
    scratch.push(shallowDir);
    rmSync(shallowDir, { recursive: true, force: true });
    execFileSync("git", ["clone", "-q", "--depth", "1", `file://${origin.dir}`, shallowDir]);
    const git = (args: string[]) =>
      execFileSync("git", args, { cwd: shallowDir, encoding: "utf8" }) ?? "";

    expect(() => assertDeepClone("origin/main", git)).toThrow(/shallow/i);
  });

  it("permits a clone whose history is complete", () => {
    const repo = makeRepo();
    write(repo.dir, "a.txt", "1\n");
    commit(repo, "one");
    expect(() => assertDeepClone("main", repo.git)).not.toThrow();
  });
});

describe("classification", () => {
  const index = (over: Partial<MainIndex> = {}): MainIndex => ({
    blobs: new Set<string>(),
    paths: new Set<string>(),
    tip: new Set<string>(),
    byBasename: new Map<string, string[]>(),
    ...over,
  });

  it("calls content that is anywhere in main's graph landed, whatever the path", () => {
    expect(
      classifyFile({
        path: "b.ts",
        blob: "deadbeef",
        index: index({ blobs: new Set(["deadbeef"]) }),
        mainTouchedSince: false,
        mainDeletedSince: false,
      }),
    ).toBe("landed");
  });

  it("separates 'main deleted this path' from 'main never had this path'", () => {
    const had = index({ paths: new Set(["gone.ts"]) });
    expect(
      classifyFile({
        path: "gone.ts",
        blob: "x",
        index: had,
        mainTouchedSince: true,
        mainDeletedSince: true,
      }),
    ).toBe("superseded-by-deletion");
    expect(
      classifyFile({
        path: "never.ts",
        blob: "x",
        index: index(),
        mainTouchedSince: false,
        mainDeletedSince: false,
      }),
    ).toBe("never-landed");
  });

  it("separates a branch main has overtaken from one main never saw", () => {
    const live = index({ paths: new Set(["live.ts"]), tip: new Set(["live.ts"]) });
    expect(
      classifyFile({ path: "live.ts", blob: "x", index: live, mainTouchedSince: true, mainDeletedSince: false }),
    ).toBe("overtaken");
    expect(
      classifyFile({ path: "live.ts", blob: "x", index: live, mainTouchedSince: false, mainDeletedSince: false }),
    ).toBe("divergent");
  });
});

describe("verdicts", () => {
  const counts = (over: Partial<Record<string, number>> = {}) =>
    Object.fromEntries(FILE_STATES.map((s) => [s, over[s] ?? 0])) as Record<string, number>;

  /**
   * The cold filter, and the reason it is here. On the night this ran, seven
   * branches held files main does not have and six were that evening's open
   * PRs. Calling those stranded is how a sweep becomes something people scroll
   * past — the same measurement that shaped `worktree-patrol.mjs`.
   */
  it("calls a branch pushed within the threshold in-flight, not stranded", () => {
    const warm = {
      counts: counts({ "never-landed": 3 }),
      files: [{}, {}, {}],
      ageHours: COLD_THRESHOLD_HOURS - 1,
    };
    expect(verdictFor(warm as never)).toBe("in-flight");

    const cold = { ...warm, ageHours: COLD_THRESHOLD_HOURS + 1 };
    expect(verdictFor(cold as never)).toBe("unmerged");
  });

  it("distinguishes a partial landing from a branch that never merged at all", () => {
    const partial = {
      counts: counts({ "never-landed": 1, landed: 5 }),
      files: new Array(6).fill({}),
      ageHours: 500,
    };
    expect(verdictFor(partial as never)).toBe("stranded");
  });

  it("has no 'unknown' verdict, because an unclassified branch is the nc#550 complaint", () => {
    expect(VERDICTS).not.toContain("unknown");
    const empty = { counts: counts(), files: [], ageHours: 1000 };
    expect(verdictFor(empty as never)).toBe("empty");
  });
});

describe("the main content index", () => {
  let repo: ReturnType<typeof makeRepo>;
  beforeAll(() => {
    repo = makeRepo();
    write(repo.dir, "kept.ts", "kept\n");
    write(repo.dir, "removed.ts", "removed\n");
    commit(repo, "one");
    unlinkSync(join(repo.dir, "removed.ts"));
    commit(repo, "two");
  });

  it("remembers paths main has deleted, so a branch's edit to one is not called new work", () => {
    const index = mainContentIndex("main", repo.git);
    expect(index.paths.has("removed.ts")).toBe(true);
    expect(index.tip.has("removed.ts")).toBe(false);
    expect(index.tip.has("kept.ts")).toBe(true);
  });
});

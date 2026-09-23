#!/usr/bin/env node
/**
 * Branch salvage sweep: which branches hold work that main never got?
 *
 * WHY THIS EXISTS
 *
 * nc#436. Two whole spec files — 395 lines — existed only on `wb-profile-lesson`
 * at `1b25ec8`. They were a twin of the work that became PR #191; #191
 * squash-merged, twenty of the twenty-three files that tree touched landed, and
 * nobody noticed the other three. The branch went 255 commits behind main, so
 * nothing was ever going to carry them. They surfaced because somebody was
 * clearing stranded worktrees, not because anything looked.
 *
 * Landing them (PR #542) found a live defect in `lib/cast/speak.ts` and gave
 * first-ever coverage to two modules. That is a large return from one branch
 * noticed by accident, and nc#550 asks the obvious next question: how many
 * others are like it? Nobody had counted. This counts.
 *
 * WHY AHEAD/BEHIND CANNOT FIND THIS, AND WHAT DOES
 *
 * This repository squash-merges. A squash makes a NEW commit whose parent is
 * main and whose tree happens to match the branch's; the branch commit is never
 * an ancestor of anything. So after a perfectly successful merge:
 *
 *   git branch --merged main        does not list the branch
 *   ahead/behind                    still reports it ahead
 *   git cherry / --cherry-mark      only matches patch-ids of whole commits,
 *                                   which a squash of five commits destroys
 *
 * Every ancestry-shaped question answers "unmerged" for both the branch that
 * landed and the branch that did not. That is precisely why #436 sat for
 * fifteen days in plain sight: the signal was drowned in 140 branches that all
 * looked equally unmerged.
 *
 * The discriminator this script uses is CONTENT, not ancestry:
 *
 *   Is the exact blob this branch holds for this path present ANYWHERE in
 *   main's object graph — any commit, any path, any point in history?
 *
 * A squash carries the branch's blobs verbatim into main's tree, so a landed
 * file answers yes no matter how the commit graph was rewritten underneath it.
 * A file that never landed answers no. Run against main as it stood the moment
 * before PR #542, this test returns `wb-profile-lesson`'s two stranded specs
 * and NOTHING ELSE from its twenty-two touched files — the accidental discovery
 * reproduced mechanically, with no false positives. `tests/unit/branch-salvage-
 * sweep.spec.ts` pins that replay.
 *
 * THE CLONE MUST NOT BE SHALLOW — THIS IS THE ONE WAY TO GET A FALSE GREEN
 *
 * "Present anywhere in main's history" is a lie if you only have part of main's
 * history. The worktree this was written in was shallow (main truncated to 57
 * commits, one day of it); against that, files landed weeks ago look like they
 * never landed, and the report is a wall of noise nobody triages. Every entry
 * point below refuses to run on a shallow repository rather than reporting from
 * one. Fix it with `git fetch --unshallow`, not by deleting the check.
 *
 * WHY COLDNESS IS A CLASSIFIER HERE TOO
 *
 * `worktree-patrol.mjs` (nc#435) measured that "dirty" alone was 40% false
 * positives and "dirty AND cold" was not, and made the threshold the design.
 * The same shape applies: on the night this ran, seven branches held files
 * absent from main and six of them were that evening's open PRs — work in
 * flight, which is what an unmerged branch is SUPPOSED to look like. Reporting
 * those as stranded is how a sweep gets ignored. So a branch whose tip is
 * warmer than COLD_THRESHOLD_HOURS is bucketed `in-flight` and is never called
 * stranded. It is still listed, in full, with its files — this never hides a
 * branch, it only declines to shout about one.
 *
 * NOTHING IS EVER SILENTLY EXCLUDED. Every remote branch is classified and
 * appears in the output. `scanned` and `total` are reported so a truncated run
 * is visible as a number rather than as an absence.
 *
 * THE SECOND QUESTION: WAS THIS BRANCH EVER SEEN AT ALL? (`--unseen`, nc#885)
 *
 * Everything above asks "did this branch's CONTENT reach main". That question
 * presumes somebody pushed the branch and opened a pull request on it. nc#885
 * is the case where nobody did: six tickets whose work was finished, committed
 * and tested on a laptop, and never seen by CI, by a reviewer, or by another
 * session. Re-measured at the 2026-09-02 afternoon debrief the six turned out
 * to be a sample of forty-seven — 47 local branches with no counterpart on
 * `origin` and ahead of `origin/main`, across 78 worktrees on one checkout.
 * One of them, `claude/775-cut-private-repo-link`, is the committed fix for a
 * `p0` launch criterion six days before launch.
 *
 * That dimension is not in the sweep above and cannot be bolted onto it:
 *
 *   · the sweep reads `git branch -r`, so a branch that was never pushed is
 *     invisible to it — which is exactly the population nc#885 names;
 *   · the sweep needs main's whole object graph and refuses to run on a shallow
 *     clone, and the cloud sandboxes a shift actually runs in are shallow;
 *   · "has anyone looked at this" is answered by refs, dates and the pull
 *     request list, not by blobs.
 *
 * So `--unseen` is a second mode on the same tool rather than a third script:
 * same unit (a branch), same coldness reasoning, same refusal to act. It shares
 * this file's git helpers and `COLD_THRESHOLD_HOURS`, and it reuses
 * `worktree-patrol.mjs`'s worktree parser so a finding can say which tree to
 * walk into. What it deliberately does NOT reuse is ancestry-as-landing: nc#711
 * and the header above both say why "tip is an ancestor of main" is the wrong
 * predicate in a squash-merging repository.
 *
 * IT LISTS. IT NEVER PUSHES. nc#885 is explicit, and two of its own instances
 * are the reason: #827 carries a mis-named migration and #870 is `johan-gated`.
 * Neither should be pushed as-is, and a tool that pushed them would have turned
 * a visibility problem into a merge problem. The decision stays with whoever
 * owns the branch; this only makes the branch impossible to not know about.
 *
 * RANKED BY TICKET PRIORITY, NOT BY DATE. Sorting this list by recency is what
 * buried the `p0` under forty-six other branches. Where a branch name carries a
 * ticket number, its `p0`/`p1`/`p2` label is fetched over REST and sorts it;
 * an unknown priority sorts last and never crashes the run.
 *
 * Run it:
 *   node scripts/branch-salvage-sweep.mjs               human-readable sweep
 *   node scripts/branch-salvage-sweep.mjs --json        machine-readable
 *   node scripts/branch-salvage-sweep.mjs --branch X    one branch, in full
 *   node scripts/branch-salvage-sweep.mjs --main <ref>  pin main (replay)
 *   node scripts/branch-salvage-sweep.mjs --gate X      merge-time check, exits 1
 *   node scripts/branch-salvage-sweep.mjs --unseen      committed but never seen
 *   node scripts/branch-salvage-sweep.mjs --unseen --all         every branch
 *   node scripts/branch-salvage-sweep.mjs --unseen --local-only  no network
 *
 * The sweep never exits non-zero on a finding — it is a report for a human to
 * triage, and an exit code would tempt someone to wire it into CI where it
 * would go red for every legitimate in-flight branch. `--gate` is the one mode
 * that exits non-zero, and it asks a different, narrower question; see
 * `gateBranch` below.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ghApiSync } from "./github-api.mjs";
import { parseWorktreeList } from "./worktree-patrol.mjs";
import { pathToFileURL } from "node:url";

/**
 * Twenty-four hours. `worktree-patrol.mjs` uses six for an uncommitted working
 * tree, where a person is plausibly mid-keystroke. A pushed branch is a slower
 * object: a night worker opens a PR and an orchestrator merges it hours later,
 * and the branch is legitimately unlanded for that whole stretch. Six hours
 * would have called every one of this repository's open PRs stranded.
 *
 * Named rather than inlined so that changing it is a decision somebody makes on
 * purpose, and so the spec can assert against the same number the tool uses.
 */
export const COLD_THRESHOLD_HOURS = 24;

/** How a single file on a branch relates to main. Ordered worst-first. */
export const FILE_STATES = [
  /** Path has never existed on main, at any commit. The #436 shape. */
  "never-landed",
  /** Authored somewhere in the branch's history, not carried at its tip, content nowhere in main. */
  "dropped-in-branch",
  /** Path is live on main and main has NOT touched it since the fork; content differs. */
  "divergent",
  /** Main deleted the path after the fork. The branch's edit has no home to go to. */
  "superseded-by-deletion",
  /** Path is live on main and main has moved it on since the fork. Branch copy is stale. */
  "overtaken",
  /** This exact content is in main's object graph. It landed. */
  "landed",
];

/** What the sweep concludes about a whole branch. */
export const VERDICTS = [
  "stranded",
  "divergent",
  "unmerged",
  "superseded",
  "in-flight",
  "landed",
  "empty",
];

function runGit(args, { cwd } = {}) {
  return (
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 1 << 28,
      stdio: ["ignore", "pipe", "pipe"],
    }) ?? ""
  );
}

/** `git` that answers "" instead of throwing, for questions whose answer may be "no". */
function tryGit(git, args) {
  try {
    return git(args);
  } catch {
    return "";
  }
}

/**
 * A shallow clone cannot answer the only question this tool asks. Refusing is
 * the whole point: a sweep that reports from partial history certifies branches
 * as stranded that landed months ago, and — far worse in the other direction —
 * a caller who sees a clean-looking report has been told "nothing here" by a
 * tool that could not see.
 */
export function assertDeepClone(mainRef = "origin/main", git = runGit) {
  if (tryGit(git, ["rev-parse", "--is-shallow-repository"]).trim() !== "true") return;

  /*
   * `--is-shallow-repository` reports on the `.git/shallow` FILE, and that file
   * outlives what it describes: `git fetch --unshallow` can complete every ref
   * you have while leaving a graft behind for a commit no ref reaches any more.
   * Refusing on the flag alone would make this tool permanently unrunnable in a
   * repository that is, for our purposes, complete — and a tool that cannot run
   * is a tool nobody fixes.
   *
   * So ask the question that actually matters: is MAIN's history truncated —
   * is one of the recorded boundaries an ancestor of the ref we index?
   *
   * Note what is deliberately NOT used: "can main be walked back to a root
   * commit". Git presents a shallow boundary AS a root, since a graft records
   * no parents, so that test passes cheerfully on a `--depth 1` clone and would
   * wave through the exact repository this refusal exists for.
   */
  const graftOnMain = shallowBoundaries(git).find((id) => isAncestor(id, mainRef, git));
  if (!graftOnMain) return;

  throw new Error(
    "This clone is shallow, so 'is this content anywhere in main's history' " +
      "cannot be answered — every file older than the shallow boundary would " +
      `read as never-landed (boundary ${graftOnMain.slice(0, 8)} is an ancestor of ${mainRef}). ` +
      "Run `git fetch --unshallow` and try again.",
  );
}

/**
 * The commit ids recorded in `.git/shallow`, or [] if there is no such file.
 *
 * `--path-format=absolute` is not decoration: the plain form answers `.git`,
 * relative to the REPOSITORY, while `readFileSync` resolves relative to the
 * process. Anywhere the two differ — a worktree, a spec driving a scratch
 * clone, any caller that did not chdir — the read silently misses, the boundary
 * list comes back empty, and the shallow refusal never fires. A guard that
 * cannot find its own evidence fails open, which is the worst way to fail.
 */
export function shallowBoundaries(git = runGit) {
  const dir = tryGit(git, ["rev-parse", "--path-format=absolute", "--git-common-dir"]).trim();
  if (!dir) return [];
  try {
    return readFileSync(join(dir, "shallow"), "utf8").split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function isAncestor(maybeAncestor, ref, git = runGit) {
  try {
    git(["merge-base", "--is-ancestor", maybeAncestor, ref]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Refuse when ANY history this checkout holds is truncated — a shallow boundary
 * that HEAD or some ref reaches — not only main's (nc#1205 review round 4).
 *
 * `assertDeepClone` asks about one ref because the sweep indexes one ref. The
 * merge gate's repair needs the wider question: in a `--depth 1 --single-branch`
 * clone of a feature, main can arrive whole while the only boundary sits on
 * the feature tip, and a test asked about main alone says "complete". A graft
 * no ref reaches any more (the leftover `assertDeepClone` describes) is still
 * ignored, so a clone that is complete for every purpose is not refused forever.
 */
export function assertHistoryComplete(git = runGit) {
  if (tryGit(git, ["rev-parse", "--is-shallow-repository"]).trim() !== "true") return;
  const reached = shallowBoundaries(git).find(
    (id) =>
      isAncestor(id, "HEAD", git) ||
      tryGit(git, ["for-each-ref", "--count=1", "--contains", id, "--format=%(refname)"]).trim() !== "",
  );
  if (!reached) return;
  throw new Error(
    `This clone is shallow (boundary ${reached.slice(0, 8)} is reached by a ref it holds), so what a ` +
      "branch authored cannot be read against main. Run `git fetch --unshallow` and try again.",
  );
}

/**
 * Everything main has ever contained, in two indexes.
 *
 * `blobs` is every object id reachable from main with a path attached — that is
 * every version of every file main has ever held. Membership in it is the
 * "this content landed" test, and it is deliberately path-blind: a file that
 * landed under a different name (a rename inside the squash) still answers yes,
 * because the content is what we are trying not to lose.
 *
 * `paths` is every path main has ever contained. A path missing from it has
 * never existed on main under any commit, which is the strongest available
 * statement that a file is new work that never arrived.
 */
export function mainContentIndex(mainRef = "origin/main", git = runGit) {
  const blobs = new Set();
  const paths = new Set();
  for (const line of git(["rev-list", "--objects", mainRef]).split("\n")) {
    const space = line.indexOf(" ");
    if (space <= 0) continue;
    blobs.add(line.slice(0, space));
    paths.add(line.slice(space + 1));
  }
  const tip = new Set();
  /*
   * basename -> the paths main holds under it. This is the rename de-noiser,
   * and it earned its place on real data: `feat/232-teacher-voice-plain-ink`
   * reported six lost components because `app/session/paged/` was renamed to
   * `app/session/legacy/` during the build, and the files differ from main's
   * only by the component name inside them, so the blob test cannot see it.
   * Six red lines that resolve to "this is a rename" is how a report teaches
   * people to skim it. Saying so on the line itself costs one Map.
   */
  const byBasename = new Map();
  for (const line of git(["ls-tree", "-r", "--name-only", mainRef]).split("\n")) {
    if (!line) continue;
    tip.add(line);
    const base = line.slice(line.lastIndexOf("/") + 1);
    byBasename.set(base, [...(byBasename.get(base) ?? []), line]);
  }
  return { blobs, paths, tip, byBasename };
}

/** path -> blob id for every file in a ref's tree. One git call per branch, not one per file. */
export function treeBlobs(ref, git = runGit) {
  const map = new Map();
  for (const line of git(["ls-tree", "-r", ref]).split("\n")) {
    const match = /^\d+ blob ([0-9a-f]+)\t(.*)$/.exec(line);
    if (match) map.set(match[2], match[1]);
  }
  return map;
}

/**
 * Decide what one file on a branch is, given the indexes.
 *
 * The order of these questions is load-bearing. "Is this content in main"
 * comes first and answers for the overwhelming majority, which is what keeps
 * the expensive per-path history questions below it down to the handful that
 * actually need them.
 */
export function classifyFile({ path, blob, index, mainTouchedSince, mainDeletedSince }) {
  if (index.blobs.has(blob)) return "landed";
  if (!index.paths.has(path)) return "never-landed";
  if (!index.tip.has(path)) {
    return mainDeletedSince ? "superseded-by-deletion" : "never-landed";
  }
  return mainTouchedSince ? "overtaken" : "divergent";
}

/**
 * Everything one branch holds, measured against main.
 *
 * Two file sets are gathered, and the second is the one people forget:
 *
 *   TIP    — `git diff base..branch`, what a squash of this branch would land.
 *   DROPPED — paths some commit in `base..branch` authored that the tip no
 *             longer carries. A file added during a build and removed before
 *             review is invisible to every diff-shaped tool, and it is exactly
 *             the "the squash landed fewer files than the branch touched" shape
 *             nc#550 asks for. Content that merely got reverted to main's own
 *             version filters itself out: its blob is main's blob, so it reads
 *             `landed` and is not reported.
 */
export function sweepBranch(branch, { mainRef = "origin/main", index, now = Date.now(), git = runGit } = {}) {
  const contentIndex = index ?? mainContentIndex(mainRef, git);
  const base = tryGit(git, ["merge-base", mainRef, branch]).trim();
  const meta = tryGit(git, ["log", "-1", "--format=%H%x00%aI%x00%an%x00%s", branch]).trim().split("\0");
  const [head = "", lastCommitISO = "", lastAuthor = "", subject = ""] = meta;

  const result = {
    branch,
    head,
    lastCommitISO,
    lastAuthor,
    subject,
    base,
    ahead: 0,
    behind: 0,
    ageHours: lastCommitISO ? (now - Date.parse(lastCommitISO)) / 3_600_000 : null,
    files: [],
    counts: Object.fromEntries(FILE_STATES.map((s) => [s, 0])),
    verdict: "empty",
    partialLanding: false,
  };

  if (!base) {
    // No common ancestor at all (an orphan branch such as `cla-signatures`).
    // Nothing it holds was ever meant to be main's, so there is nothing to
    // salvage — but say so rather than leaving the branch unclassified.
    result.verdict = "empty";
    result.orphan = true;
    return result;
  }

  const counts = tryGit(git, ["rev-list", "--left-right", "--count", `${mainRef}...${branch}`]).trim().split(/\s+/);
  result.behind = Number(counts[0] ?? 0);
  result.ahead = Number(counts[1] ?? 0);

  const blobs = treeBlobs(branch, git);
  const candidates = new Map(); // path -> { blob, origin }

  for (const line of tryGit(git, ["diff", "--name-status", base, branch]).split("\n")) {
    const match = /^([A-Z])\d*\t(.*)$/.exec(line);
    if (!match) continue;
    // A rename reports "old\tnew"; the branch's copy lives at the last field.
    const path = match[2].split("\t").pop();
    if (match[1] === "D") continue; // the branch deleted it; there is no content to strand
    const blob = blobs.get(path);
    if (blob) candidates.set(path, { blob, origin: "tip" });
  }

  for (const line of tryGit(git, ["log", "--name-only", "--format=%H", `${base}..${branch}`]).split("\n")) {
    if (!line || /^[0-9a-f]{40}$/.test(line)) continue;
    if (candidates.has(line)) continue;
    if (blobs.has(line)) continue; // still at the tip, just unchanged versus base
    /*
     * Authored somewhere in this branch and gone by its tip. We want the last
     * version that EXISTED, which is the content that would be lost.
     *
     * The newest commit touching the path is usually the one that deleted it,
     * where the path resolves to nothing — reading the blob from that commit
     * silently yields nothing and the file drops out of the report entirely.
     * That bug made this whole category report zero on a repository where it
     * has five real hits, which is the exact false green this tool exists to
     * end. So walk back until a commit actually holds the file.
     */
    const touching = tryGit(git, ["rev-list", `${base}..${branch}`, "--", line]).split("\n").filter(Boolean);
    let blob = "";
    for (const commit of touching) {
      blob = tryGit(git, ["rev-parse", "--verify", "--quiet", `${commit}:${line}`]).trim();
      if (blob) break;
    }
    if (blob) candidates.set(line, { blob, origin: "dropped" });
  }

  for (const [path, { blob, origin }] of candidates) {
    let state;
    if (contentIndex.blobs.has(blob)) {
      state = "landed";
    } else if (origin === "dropped") {
      state = "dropped-in-branch";
    } else {
      const touched = tryGit(git, ["rev-list", "--count", `${base}..${mainRef}`, "--", path]).trim();
      const deleted = tryGit(git, [
        "log",
        "--diff-filter=D",
        "--format=%H",
        "-1",
        `${base}..${mainRef}`,
        "--",
        path,
      ]).trim();
      state = classifyFile({
        path,
        blob,
        index: contentIndex,
        mainTouchedSince: Number(touched) > 0,
        mainDeletedSince: Boolean(deleted),
      });
    }
    const entry = { path, blob, state, origin };
    if (state !== "landed" && state !== "overtaken") {
      const base = path.slice(path.lastIndexOf("/") + 1);
      const elsewhere = (contentIndex.byBasename?.get(base) ?? []).filter((p) => p !== path);
      if (elsewhere.length) entry.sameNameOnMain = elsewhere;
    }
    result.files.push(entry);
    result.counts[state] += 1;
  }

  result.files.sort(
    (a, b) => FILE_STATES.indexOf(a.state) - FILE_STATES.indexOf(b.state) || a.path.localeCompare(b.path),
  );
  result.verdict = verdictFor(result);
  result.partialLanding =
    result.counts.landed > 0 &&
    result.counts["never-landed"] + result.counts["dropped-in-branch"] > 0;
  return result;
}

/**
 * One branch's verdict. Every branch gets one; "unknown" is not in the list,
 * because nc#550's whole complaint is that an unclassified branch is how work
 * goes missing.
 */
export function verdictFor(result, { coldThresholdHours = COLD_THRESHOLD_HOURS } = {}) {
  const c = result.counts;
  const authored = result.files.length;
  if (authored === 0) return "empty";

  const absent = c["never-landed"] + c["dropped-in-branch"];
  const warm = result.ageHours !== null && result.ageHours < coldThresholdHours;

  // A branch pushed in the last day is an open PR, not a loss. Say what it is
  // rather than adding it to a list of things somebody has to rule out.
  if (warm && absent + c.divergent > 0) return "in-flight";

  if (absent > 0) return c.landed > 0 ? "stranded" : "unmerged";
  if (c.divergent > 0) return "divergent";
  if (c["superseded-by-deletion"] + c.overtaken > 0) return "superseded";
  return "landed";
}

/** Every remote branch except main, classified. Nothing is filtered out. */
export function sweep({ mainRef = "origin/main", now = Date.now(), git = runGit, only = null } = {}) {
  assertDeepClone(mainRef, git);
  const index = mainContentIndex(mainRef, git);
  const all = git(["branch", "-r", "--format=%(refname:short)"])
    .split("\n")
    .map((s) => s.trim())
    .filter((b) => b && b !== mainRef && b !== "origin/main" && !b.includes("->"));
  const branches = only ? all.filter((b) => b === only || b === `origin/${only}`) : all;
  const results = branches.map((b) => sweepBranch(b, { mainRef, index, now, git }));
  results.sort((a, b) => VERDICTS.indexOf(a.verdict) - VERDICTS.indexOf(b.verdict) || a.branch.localeCompare(b.branch));
  return { mainRef, total: all.length, scanned: results.length, results };
}

/**
 * THE MERGE-TIME CHECK (nc#550 part 4).
 *
 * The sweep is a hunt, and a hunt rots — nobody runs it, and the one time
 * somebody does they find fifteen days of drift. This is the same measurement
 * pointed at one branch at the moment it matters, and it asks the narrow
 * question the ticket names: does the squash about to land carry everything
 * this branch authored?
 *
 * It flags a file when ALL of these hold:
 *   · some commit in `base..branch` authored it,
 *   · the branch's tip no longer carries it, so the squash will not land it,
 *   · and that content is nowhere in the base's object graph, so nothing else
 *     landed it either.
 *
 * The third clause is what keeps this quiet. A file edited and then reverted
 * during review holds main's own blob and is not reported; only content that
 * would genuinely cease to exist at merge is.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO, AND WHY
 *
 * #436's loss was on a TWIN branch: PR #191 carried everything its own branch
 * authored, and the three lost files were only ever on `wb-profile-lesson`. A
 * merge-time check cannot see that, and the obvious attempt — "warn about other
 * branches sharing paths with this one" — was built and measured before being
 * thrown away: against real history it named 1,263 files on one sibling, being
 * unable to tell a twin from ordinary parallel work. A warning at that volume
 * is muted within a week, and a muted gate is worse than none because it looks
 * like protection. The twin shape is what the SWEEP is for, and the sweep is
 * now cheap enough (about six seconds over 140 branches) to run whenever
 * somebody wants an answer instead of a hunch.
 */
export function gateBranch(branch, { mainRef = "origin/main", git = runGit } = {}) {
  assertDeepClone(mainRef, git);

  /*
   * The branch's history has to be complete too, not only main's (nc#1205
   * review round 4). A `--depth 1 --single-branch` clone of a feature records
   * its one boundary on the FEATURE tip; with main fetched whole, the test
   * above passes, and the branch's own commits end at a graft that is not on
   * main — so the merge-base below comes back empty.
   */
  const graftOnBranch = shallowBoundaries(git).find((id) => isAncestor(id, branch, git));
  if (graftOnBranch) {
    throw new Error(
      `This clone is shallow on ${branch} (boundary ${graftOnBranch.slice(0, 8)} is an ancestor of it), ` +
        "so what the branch authored cannot be read. Run `git fetch --unshallow` and try again.",
    );
  }

  const index = mainContentIndex(mainRef, git);
  const result = sweepBranch(branch, { mainRef, index, git });

  /*
   * An empty merge-base is an unanswerable question, never "authored 0".
   * `sweepBranch` reads it as an orphan, which is right for the sweep's
   * `cla-signatures` — but a pull request into main always shares history with
   * it, so here it means the question was asked of a ref this clone does not
   * hold, or of history it cannot see. Round 4's P1 printed "authors 0
   * file(s); every one of them lands" off exactly this, quietly, on stdout.
   * Raising sends it to the "not checked" warning where it belongs, and closes
   * the class rather than the one clone shape that found it.
   */
  if (!result.base) {
    throw new Error(
      `${branch} shares no merge-base with ${mainRef} in this clone, so what it authors cannot be answered.`,
    );
  }
  const lost = result.files.filter((f) => f.state === "dropped-in-branch");
  return { branch, mainRef, base: result.base, authored: result.files.length, lost };
}

export function formatGate(gate) {
  if (!gate.lost.length) {
    return `squash coverage: ${gate.branch} authors ${gate.authored} file(s); every one of them lands or already exists in ${gate.mainRef}.`;
  }
  const lines = [
    `squash coverage: ${gate.branch} authored ${gate.lost.length} file(s) that this merge will NOT carry and that ${gate.mainRef} has never held:`,
    "",
  ];
  for (const f of gate.lost) {
    const hint = f.sameNameOnMain ? `   (main has ${f.sameNameOnMain.join(", ")} — likely a rename)` : "";
    lines.push(`  ${f.path}${hint}`);
  }
  lines.push(
    "",
    "Each one exists only on this branch. Merging as-is deletes it (nc#436: three",
    "files lost exactly this way sat unnoticed for fifteen days and held a live",
    "defect). Either carry them in this PR, or say in the PR why they are dropped",
    "so the next reader inherits the decision instead of rediscovering the file.",
  );
  return lines.join("\n");
}

export function formatReport(sweepResult, { coldThresholdHours = COLD_THRESHOLD_HOURS } = {}) {
  const { results, total, scanned, mainRef } = sweepResult;
  const lines = [
    `Branch salvage sweep against ${mainRef}: ${scanned} of ${total} remote branches examined.`,
    `Cold threshold ${coldThresholdHours}h — a branch newer than that is "in-flight", not stranded.`,
    "",
  ];
  const byVerdict = new Map();
  for (const r of results) byVerdict.set(r.verdict, [...(byVerdict.get(r.verdict) ?? []), r]);
  for (const verdict of VERDICTS) {
    const group = byVerdict.get(verdict);
    if (!group?.length) continue;
    lines.push(`## ${verdict} (${group.length})`);
    for (const r of group) {
      const day = r.lastCommitISO ? r.lastCommitISO.slice(0, 10) : "?";
      const flag = r.partialLanding ? "  [PARTIAL LANDING]" : "";
      lines.push(`  ${r.branch}  ${day}  +${r.ahead}/-${r.behind}${flag}`);
      for (const f of r.files) {
        if (f.state === "landed" || f.state === "overtaken") continue;
        const hint = f.sameNameOnMain ? `   (main has ${f.sameNameOnMain.join(", ")} — likely a rename)` : "";
        lines.push(`      ${f.state.padEnd(23)} ${f.path}${hint}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------------- *
 * nc#885: committed work that was never seen.
 * ------------------------------------------------------------------------- */

/**
 * What one branch's PUBLICATION looks like. Ordered worst-first, and the order
 * is the report's order.
 *
 * The first two are nc#885's headline class — work that never left the machine.
 * The next two are the milder class the ticket asks to be reported separately:
 * it is on `origin`, so another session could in principle find it, but no
 * pull request has ever carried this tip, so no CI run and no reviewer has.
 */
export const UNSEEN_STATES = [
  /** Ahead of main and there is no `origin/<branch>` at all. Never left the laptop. */
  "unpushed",
  /** `origin/<branch>` exists but does not contain the local tip. Partly left the laptop. */
  "ahead-of-origin",
  /** On origin, ahead of main, and no pull request has ever named this branch. */
  "never-reviewed",
  /** On origin, ahead, pull requests exist — none of them has this tip as its head. */
  "moved-since-review",
  /**
   * On origin and ahead, and the pull request list could not be read — no
   * token, no network, a blocked endpoint, or `--local-only`. NOT the same as
   * never-reviewed, and deliberately not reported as it: "I could not look" is
   * not "nobody has looked", and inventing a finding out of a failed
   * measurement is how a report earns its first mute (nc#435).
   */
  "review-unknown",
  /** An open pull request carries it. This is what work in flight is supposed to look like. */
  "open-pr",
  /** Some pull request's head is exactly this tip. CI ran on it and a human could see it. */
  "reviewed",
  /** Not ahead of main. There is nothing here to deliver. */
  "level",
];

/** The states that mean "nobody has seen this". The rest are reported as counts. */
export const UNSEEN_REPORTED = new Set([
  "unpushed",
  "ahead-of-origin",
  "never-reviewed",
  "moved-since-review",
]);

/** Label names this repository uses for priority, best first. */
export const PRIORITY_LABELS = ["p0", "p1", "p2"];

/**
 * Ticket number carried by a branch name, or null.
 *
 * Two digits minimum: a one-digit run is far more often a version (`v2`,
 * `round3`) than a ticket, and a wrong ticket number is worse than none — it
 * would put someone else's priority label on this branch and sort the list by
 * it.
 */
export function ticketFromBranch(branch) {
  const match = /(?:^|\/)(?:nc[-#]?)?(\d{2,5})(?=[-_/.]|$)/i.exec(branch);
  return match ? Number(match[1]) : null;
}

/** p0 first, unknown last. Never throws on an unexpected label. */
export function priorityRank(priority) {
  const index = PRIORITY_LABELS.indexOf(priority ?? "");
  return index === -1 ? PRIORITY_LABELS.length : index;
}

/**
 * One GitHub read, in `gh api` argument shape, over REST (nc#1206).
 *
 * This used to spawn `gh`. The night sessions this sweep is written for carry a
 * token and no `gh` on PATH, so every pull-request and ticket fact in the
 * report degraded to null there — the half of the report that says whether a
 * branch was ever reviewed, silently absent in exactly the containers that run
 * it unattended. `scripts/github-api.mjs` answers the same argv over REST, in a
 * child, with the proxy switch and the raised stdout buffer it needs.
 */
function runGh(args) {
  return ghApiSync(args);
}

/**
 * Every pull request this repository has ever had, as `{number, state, ref,
 * sha, merged}`.
 *
 * REST, page by page, on purpose. Two constraints, both load-bearing:
 *
 *   · GraphQL is blocked (HTTP 403) in the sandboxes a night shift runs in, so
 *     `gh pr list` and `gh pr view --json` are unavailable there. A gate that
 *     only works on a laptop cannot report on the laptop's own blind spot.
 *   · `gh api --paginate` follows GitHub's `Link` header, which points at
 *     `repositories/{id}/...` URLs that the same proxy refuses. It returns the
 *     first hundred rows and then fails — which would silently classify every
 *     older branch as never-reviewed. So pagination is `page=N` here, and it
 *     stops on the first short page.
 *
 * Ordered newest-first by GitHub's default, which does not matter: the whole
 * list is indexed by head ref before anything is asked of it.
 *
 * The five fields are projected HERE rather than by a `--jq` filter upstream
 * (nc#1206). The transport implements no filter language on purpose — a
 * transport that evaluates an expression it only half understands answers
 * something adjacent to what the caller asked — and this is where the
 * projection belongs anyway: the shape it produces is this file's own
 * `{number, state, ref, sha, merged}`, named in one place, checked by this
 * file's tests. What it costs is the unfiltered page over the wire, which is
 * why the transport raises the child's stdout ceiling.
 */
export function fetchPullRequests({ repo, gh = runGh, perPage = 100, maxPages = 30 } = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const pageRows = JSON.parse(
      gh(["api", `repos/${repo}/pulls?state=all&per_page=${perPage}&page=${page}`]) || "[]",
    );
    for (const pr of pageRows) {
      rows.push({
        number: Number(pr.number),
        state: pr.state,
        ref: pr.head?.ref,
        sha: pr.head?.sha,
        merged: Boolean(pr.merged_at),
      });
    }
    if (pageRows.length < perPage) break;
  }
  return rows;
}

/** head ref -> the pull requests opened from it, newest first. */
export function indexPullRequests(pullRequests) {
  const byRef = new Map();
  for (const pr of pullRequests) byRef.set(pr.ref, [...(byRef.get(pr.ref) ?? []), pr]);
  for (const list of byRef.values()) list.sort((a, b) => b.number - a.number);
  return byRef;
}

/**
 * A ticket's priority, state and gate labels, or null when it cannot be known.
 *
 * Cached per run and only ever asked for tickets that reach the report, so a
 * sweep costs a handful of requests rather than one per branch. Every failure —
 * no token, no network, a branch number that is not an issue — resolves to null
 * and sorts last. A sweep that dies because an issue lookup 404'd would be a
 * sweep nobody runs, which is the failure this whole file is about.
 */
export function makeTicketLookup({ repo, gh = runGh, cache = new Map() } = {}) {
  return (ticket) => {
    if (ticket === null || ticket === undefined) return null;
    if (cache.has(ticket)) return cache.get(ticket);
    let facts = null;
    try {
      // Projected here rather than by `--jq` upstream, for the reason given on
      // `fetchPullRequests` (nc#1206). An issue payload is small, so the whole
      // of the saving the filter bought was one field name.
      const text = gh(["api", `repos/${repo}/issues/${ticket}`]).trim();
      if (text) {
        const issue = JSON.parse(text);
        const state = issue.state;
        const labels = (issue.labels ?? [])
          .map((label) => (typeof label === "string" ? label : label?.name))
          .filter(Boolean);
        const title = issue.title ?? "";
        facts = {
          ticket,
          state,
          title,
          labels,
          priority: PRIORITY_LABELS.find((p) => labels.includes(p)) ?? null,
          gated: labels.includes("johan-gated") || labels.includes("johan-decision"),
        };
      }
    } catch {
      facts = null;
    }
    cache.set(ticket, facts);
    return facts;
  };
}

/** Local branches, with the worktree each one is checked out in (if any). */
export function localBranchRecords(git = runGit) {
  const byBranch = new Map();
  for (const tree of parseWorktreeList(tryGit(git, ["worktree", "list", "--porcelain"]))) {
    if (tree.branch && tree.branch !== "(detached)") byBranch.set(tree.branch, tree.path);
  }
  const records = [];
  for (const line of tryGit(git, [
    "for-each-ref",
    "--format=%(refname:short)%00%(objectname)",
    "refs/heads",
  ]).split("\n")) {
    if (!line) continue;
    const [branch, head] = line.split("\0");
    if (!branch) continue;
    records.push({ branch, ref: `refs/heads/${branch}`, head, local: true, worktree: byBranch.get(branch) ?? null });
  }
  return records;
}

/** Remote branches on `origin`, main excluded. */
export function remoteBranchRecords(git = runGit, mainRef = "origin/main") {
  const records = [];
  for (const line of tryGit(git, [
    "for-each-ref",
    "--format=%(refname:short)%00%(objectname)",
    "refs/remotes/origin",
  ]).split("\n")) {
    if (!line) continue;
    const [full, head] = line.split("\0");
    if (!full || full === mainRef || full === "origin/HEAD" || full.includes("->")) continue;
    records.push({
      branch: full.replace(/^origin\//, ""),
      ref: full,
      head,
      local: false,
      worktree: null,
    });
  }
  return records;
}

/**
 * Where one branch stands, with no judgement attached yet.
 *
 * `behind` is a floor, not a fact, on a shallow clone: main's history is
 * truncated, so "commits on main this branch does not have" can only count the
 * ones present. The scan says so rather than printing a number that reads as
 * complete — nc#885 quotes #582 going 73 → 84 behind in two days, and a
 * silently truncated version of that number would be an argument made from a
 * measurement that was not taken.
 */
export function branchPosition(record, { mainRef = "origin/main", git = runGit, now = Date.now() } = {}) {
  const counts = tryGit(git, ["rev-list", "--left-right", "--count", `${mainRef}...${record.ref}`])
    .trim()
    .split(/\s+/);
  const measurable = counts.length === 2 && counts.every((n) => /^\d+$/.test(n));
  const lastCommitISO = tryGit(git, ["log", "-1", "--format=%aI", record.ref]).trim();
  return {
    ...record,
    ahead: measurable ? Number(counts[1]) : null,
    behind: measurable ? Number(counts[0]) : null,
    orphan: !measurable,
    lastCommitISO,
    ageHours: lastCommitISO ? (now - Date.parse(lastCommitISO)) / 3_600_000 : null,
  };
}

/**
 * The verdict for one branch, kept pure so a fixture can drive it.
 *
 * The order of the questions is the design:
 *
 *   1. Nothing ahead of main → `level`. Nothing to lose, whatever else is true.
 *   2. Local and not on origin (or origin does not have the tip) → `unpushed` /
 *      `ahead-of-origin`. This is asked BEFORE the pull-request questions
 *      because a branch that never left the machine cannot have one.
 *   3. An open pull request → `open-pr`. Work in flight, by design.
 *   4. A pull request whose head is exactly this tip → `reviewed`. This is the
 *      question that makes the milder class usable: this repository squash-
 *      merges, so a landed branch stays ahead of main forever and "ahead with
 *      no open PR" fires on nearly every branch that ever existed. Measured on
 *      2026-09-02 it fired on 265 of 267 remote branches; adding this one
 *      question left 10. A list of 265 is a list nobody reads.
 *   5. Otherwise it is on origin and unseen — either no pull request ever named
 *      it (`never-reviewed`) or commits arrived after the last one closed
 *      (`moved-since-review`).
 */
export function classifyUnseen(
  facts,
  {
    coldThresholdHours = COLD_THRESHOLD_HOURS,
    originHasTip = null,
    pullRequests = [],
    pullRequestsKnown = true,
  } = {},
) {
  const cold = facts.ageHours !== null && facts.ageHours >= coldThresholdHours;
  let state;

  if (facts.ahead === 0) {
    state = "level";
  } else if (facts.local && originHasTip === false) {
    state = facts.onOrigin ? "ahead-of-origin" : "unpushed";
  } else if (!pullRequestsKnown) {
    state = "review-unknown";
  } else if (pullRequests.some((pr) => pr.state === "open")) {
    state = "open-pr";
  } else if (pullRequests.some((pr) => pr.sha === facts.head)) {
    state = "reviewed";
  } else if (pullRequests.length === 0) {
    state = "never-reviewed";
  } else {
    state = "moved-since-review";
  }

  return {
    ...facts,
    state,
    cold,
    pullRequests,
    /*
     * Warm is never stranded. Both of this repository's other patrols measured
     * that before shipping — 40% of dirty worktrees were live sessions — and a
     * branch committed twenty minutes ago in a session that is still running is
     * the same false positive wearing a different hat. Warm findings are still
     * listed, in their own section; nothing is hidden, only un-shouted.
     */
    stranded: UNSEEN_REPORTED.has(state) && cold && !facts.orphan,
  };
}

/**
 * Which band a finding is triaged in, before priority is even consulted.
 *
 * A branch whose ticket is still OPEN is work somebody is still waiting for. A
 * branch whose ticket was CLOSED was very likely solved another way — the tip
 * is a rejected round or a superseded attempt — so a closed `p0` must not sit
 * above an open `p1`. A branch whose name carries no ticket cannot be ranked at
 * all and goes last, which is a statement about the branch name rather than
 * about the work.
 */
export function triageBand(record) {
  if (!record.ticketFacts) return 2;
  return record.ticketFacts.state === "closed" ? 1 : 0;
}

/**
 * Open tickets first, highest priority first, coldest first — and date only as
 * the last tiebreak. nc#885: sorting this list by recency is what buried a
 * committed `p0` fix under forty-six other branches six days before launch.
 */
export function rankUnseen(a, b) {
  return (
    triageBand(a) - triageBand(b) ||
    priorityRank(a.ticketFacts?.priority) - priorityRank(b.ticketFacts?.priority) ||
    UNSEEN_STATES.indexOf(a.state) - UNSEEN_STATES.indexOf(b.state) ||
    (b.ageHours ?? 0) - (a.ageHours ?? 0) ||
    a.branch.localeCompare(b.branch)
  );
}

/**
 * The nc#885 scan. Local branches and remote branches, one record per branch
 * NAME: where both exist the local one wins, because it is the only one that
 * can say which worktree to walk into and the only one that can be ahead of
 * origin.
 *
 * Nothing is excluded. `reviewed` and `level` branches are counted rather than
 * listed by default, and `--all` prints them; a run that saw fewer branches
 * than exist should be visible as a number, not as an absence.
 */
export function unseenScan({
  mainRef = "origin/main",
  git = runGit,
  now = Date.now(),
  pullRequests = [],
  ticketLookup = () => null,
  coldThresholdHours = COLD_THRESHOLD_HOURS,
  includeRemote = true,
  pullRequestsKnown = true,
} = {}) {
  const byRef = indexPullRequests(pullRequests);
  const originRefs = new Set(
    tryGit(git, ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"])
      .split("\n")
      .filter(Boolean),
  );

  const records = localBranchRecords(git);
  const seen = new Set(records.map((r) => r.branch));
  if (includeRemote) {
    for (const record of remoteBranchRecords(git, mainRef)) {
      if (!seen.has(record.branch)) records.push(record);
    }
  }

  const results = [];
  for (const record of records) {
    const onOrigin = record.local ? originRefs.has(`origin/${record.branch}`) : true;
    const position = branchPosition({ ...record, onOrigin }, { mainRef, git, now });
    /*
     * "Does origin already have this commit" rather than "is origin's ref equal
     * to it": a branch whose tip is an ancestor of what origin holds is pushed,
     * even when someone else has since added to it. Equality would report a
     * stale local copy as unpushed work.
     */
    const originHasTip = record.local
      ? onOrigin && isAncestor(record.head, `origin/${record.branch}`, git)
      : true;
    const classified = classifyUnseen(position, {
      coldThresholdHours,
      originHasTip,
      pullRequests: byRef.get(record.branch) ?? [],
      pullRequestsKnown,
    });
    classified.ticket = ticketFromBranch(record.branch);
    classified.ticketFacts =
      UNSEEN_REPORTED.has(classified.state) && classified.cold
        ? ticketLookup(classified.ticket)
        : null;
    results.push(classified);
  }

  results.sort(rankUnseen);

  const inState = (...states) => results.filter((r) => states.includes(r.state));
  return {
    mainRef,
    coldThresholdHours,
    pullRequestsKnown,
    shallow: shallowBoundaries(git).length > 0,
    scanned: results.length,
    localScanned: results.filter((r) => r.local).length,
    worktreesSeen: new Set(results.map((r) => r.worktree).filter(Boolean)).size,
    /** nc#885's headline class: committed, ahead of main, never left the machine. */
    unpushed: results.filter((r) => r.stranded && (r.state === "unpushed" || r.state === "ahead-of-origin")),
    /** The milder class, reported separately: on origin, ahead, never carried by a PR. */
    unreviewed: results.filter(
      (r) => r.stranded && (r.state === "never-reviewed" || r.state === "moved-since-review"),
    ),
    /** Reported-shaped but warm, plus open pull requests and unreadable ones. */
    inFlight: results.filter(
      (r) =>
        !r.stranded &&
        (UNSEEN_REPORTED.has(r.state) || r.state === "open-pr" || r.state === "review-unknown"),
    ),
    aheadWithNoOpenPr: results.filter((r) => r.ahead > 0 && r.state !== "open-pr").length,
    reviewed: inState("reviewed").length,
    level: inState("level").length,
    results,
  };
}

function unseenLine(record) {
  const facts = record.ticketFacts;
  const ticket = record.ticket
    ? `#${record.ticket}${facts?.priority ? ` ${facts.priority}` : ""}${facts?.gated ? " johan-gated" : ""}${facts?.state === "closed" ? " (ticket closed)" : ""}`
    : "no ticket in the branch name";
  const parts = [
    `  ${record.branch}`,
    `      ${ticket}`,
    `      +${record.ahead ?? "?"} ahead / -${record.behind ?? "?"} behind main, tip ${formatUnseenAge(record.ageHours)} old`,
    `      ${record.worktree ? `worktree ${record.worktree}` : record.local ? "no worktree holds this branch" : "on origin only, no local checkout here"}`,
  ];
  if (record.state === "moved-since-review" && record.pullRequests.length) {
    const pr = record.pullRequests[0];
    parts.push(`      commits landed on this branch after PR #${pr.number} closed`);
  }
  if (facts?.title) parts.push(`      ${facts.title}`);
  return parts.join("\n");
}

function formatUnseenAge(hours) {
  if (hours === null || hours === undefined) return "unknown";
  if (hours < 48) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

export function formatUnseenReport(scan, { all = false } = {}) {
  const lines = [
    `Unseen-work sweep against ${scan.mainRef}: ${scan.scanned} branches (${scan.localScanned} local, ${scan.worktreesSeen} worktrees).`,
    `Cold threshold ${scan.coldThresholdHours}h — a branch newer than that is in flight, not stranded.`,
  ];
  if (scan.shallow) {
    lines.push(
      "This clone is SHALLOW: 'behind main' counts only the history present, so every",
      "behind number below is a floor. Ahead, age and pull-request facts are unaffected.",
    );
  }
  lines.push("");

  lines.push(`## never left the machine (${scan.unpushed.length})`);
  lines.push(
    scan.unpushed.length
      ? "Committed, ahead of main, and origin does not have it. No CI has run on any of this."
      : "  none.",
  );
  for (const record of scan.unpushed) lines.push(unseenLine(record));
  lines.push("");

  if (scan.pullRequestsKnown) {
    lines.push(`## pushed, ahead of main, never carried by a pull request (${scan.unreviewed.length})`);
    lines.push(
      scan.unreviewed.length
        ? "Another session could find these; no review or CI run ever has."
        : "  none.",
    );
    for (const record of scan.unreviewed) lines.push(unseenLine(record));
  } else {
    lines.push(
      "## pushed, ahead of main, never carried by a pull request (not measured)",
      "  The pull request list was not read, so nothing here can be called unreviewed.",
      "  Drop --local-only, or fix the GitHub token, to answer this half.",
    );
  }
  lines.push("");

  if (scan.inFlight.length) {
    const heading = scan.pullRequestsKnown
      ? "in flight — listed, not counted against anyone"
      : "pushed and ahead — listed, not judged, because pull requests were not read";
    lines.push(`## ${heading} (${scan.inFlight.length})`);
    for (const record of scan.inFlight) {
      lines.push(
        `  ${record.branch}  ${record.state}  +${record.ahead ?? "?"}/-${record.behind ?? "?"}  ${formatUnseenAge(record.ageHours)} old`,
      );
    }
    lines.push("");
  }

  if (all) {
    lines.push("## every branch, unfiltered");
    for (const record of scan.results) {
      lines.push(
        `  ${record.state.padEnd(19)} ${record.branch}  +${record.ahead ?? "?"}/-${record.behind ?? "?"}  ${formatUnseenAge(record.ageHours)}`,
      );
    }
    lines.push("");
  }

  if (scan.pullRequestsKnown) {
    lines.push(
      `${scan.aheadWithNoOpenPr} branches are ahead of ${scan.mainRef} with no open pull request; ` +
        `${scan.reviewed} of those have a pull request whose head is this exact tip, so they were seen. ` +
        `This repository squash-merges, which is why the raw number is not the finding — see the header.`,
    );
  }
  lines.push(
    "Nothing here was pushed, and nothing here should be pushed without reading it first:",
    "a stranded branch can be stranded because it is not ready.",
  );
  return lines.join("\n");
}

function runUnseen(argv, arg) {
  const repo = arg("--repo") ?? (process.env.GITHUB_REPOSITORY || "johangace/nature-class");
  let localOnly = argv.includes("--local-only");
  const wantsPriority = !argv.includes("--no-priority");

  let pullRequests = [];
  if (!localOnly) {
    try {
      pullRequests = fetchPullRequests({ repo });
    } catch (error) {
      /*
       * No token, no network, or a blocked endpoint. Say so and fall back to the
       * local half: the "never left the machine" class is answerable from refs
       * alone, and that is the class with the p0 in it. Silently treating every
       * branch as never-reviewed would be far worse than a smaller true report.
       */
      console.error(
        `could not read pull requests (${String(error?.message ?? error).split("\n")[0]}); ` +
          "reporting the never-pushed class only.",
      );
      localOnly = true;
    }
  }

  const scan = unseenScan({
    mainRef: arg("--main") ?? "origin/main",
    pullRequests,
    pullRequestsKnown: !localOnly,
    includeRemote: !localOnly,
    ticketLookup: wantsPriority && !localOnly ? makeTicketLookup({ repo }) : () => null,
  });

  if (argv.includes("--json")) console.log(JSON.stringify(scan, null, 2));
  else console.log(formatUnseenReport(scan, { all: argv.includes("--all") }));
  // Always zero. This lists; it does not gate. See the header.
  return 0;
}

function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const mainRef = arg("--main") ?? "origin/main";
  const gate = arg("--gate");

  // nc#885. Asked first because it is the only mode that runs on a shallow
  // clone, and answering "was this ever seen" must not be gated on being able
  // to answer "did its content land".
  if (argv.includes("--unseen")) return runUnseen(argv, arg);

  if (gate) {
    const result = gateBranch(gate, { mainRef });
    if (argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else console.log(formatGate(result));
    return result.lost.length ? 1 : 0;
  }

  const result = sweep({ mainRef, only: arg("--branch") ?? null });
  if (argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
  else console.log(formatReport(result));
  // Always zero: this is a report for a human to triage. See the header.
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(String(error?.message ?? error));
    process.exitCode = 2;
  }
}

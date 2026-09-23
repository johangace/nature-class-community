/**
 * The unseen-work sweep (`--unseen`), held to the failure that produced it.
 *
 * nc#885: six tickets whose work was finished, committed and tested and never
 * seen by CI, by a reviewer, or by another session. Re-measured at the
 * 2026-09-02 afternoon debrief the six were a sample of forty-seven, one of
 * them the committed fix for a `p0` launch criterion six days before launch.
 *
 * The same two things have to be true of it as of every other check in this
 * repository (nc#554), and they are the two halves of this file:
 *
 *   IT BITES.  A branch with commits and no pull request is named. A branch
 *              that never left the machine is named. A branch that grew commits
 *              after its pull request closed is named.
 *   IT IS QUIET. A branch with an open pull request is not named. A branch a
 *              pull request already carried is not named — this repository
 *              squash-merges, so "ahead of main with no open PR" is true of
 *              nearly every branch that ever existed here (265 of 267 on the
 *              night this was written), and a report of 265 branches is one
 *              nobody opens twice. Neither is a branch committed minutes ago.
 *
 * Every scenario builds a real scratch repository with real commits and real
 * `refs/remotes/origin/*`, so what is under test is the tool's answer to git,
 * not a mock's answer to the tool.
 */
import { describe, expect, it, afterAll, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import {
  COLD_THRESHOLD_HOURS,
  UNSEEN_STATES,
  classifyUnseen,
  fetchPullRequests,
  indexPullRequests,
  makeTicketLookup,
  priorityRank,
  rankUnseen,
  ticketFromBranch,
  triageBand,
  unseenScan,
  type UnseenRank,
  type UnseenRecord,
} from "../../scripts/branch-salvage-sweep.mjs";

/** Real git in a real repository; the same cost profile as the salvage spec. */
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

type Repo = { dir: string; git: (args: string[]) => string };

function makeRepo(): Repo {
  const dir = mkdtempSync(join(tmpdir(), "unseen-scan-"));
  scratch.push(dir);
  const git = (args: string[]) =>
    execFileSync(
      "git",
      [
        "-c",
        "user.name=unseen test",
        "-c",
        "user.email=unseen@example.invalid",
        "-c",
        "commit.gpgsign=false",
        ...args,
      ],
      { cwd: dir, encoding: "utf8", maxBuffer: 1 << 26 },
    ) ?? "";
  git(["init", "-q", "-b", "main"]);
  return { dir, git };
}

function commit(repo: Repo, path: string, body: string, message: string): string {
  const full = join(repo.dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, body);
  repo.git(["add", "-A"]);
  repo.git(["commit", "-q", "-m", message]);
  return repo.git(["rev-parse", "HEAD"]).trim();
}

/**
 * One repository holding every shape the sweep has to tell apart. Built once —
 * no test writes to it — because each of these commands is a process spawn.
 *
 * `refs/remotes/origin/*` is written directly rather than by pushing to a
 * second repository. It is the same ref namespace the tool reads in anger, and
 * it costs one command instead of a clone.
 */
type Fixture = {
  repo: Repo;
  heads: Record<string, string>;
  pullRequests: { number: number; state: string; ref: string; sha: string; merged: boolean }[];
};

let fixture: Fixture;

beforeAll(() => {
  const repo = makeRepo();
  const heads: Record<string, string> = {};

  heads.main = commit(repo, "app/main.ts", "export const main = 1;\n", "initial");
  repo.git(["update-ref", "refs/remotes/origin/main", heads.main]);

  const branch = (name: string) => repo.git(["checkout", "-q", "-b", name, "main"]);
  const push = (name: string, sha: string) =>
    repo.git(["update-ref", `refs/remotes/origin/${name}`, sha]);

  // Never left the machine: committed, ahead of main, no origin ref at all.
  // This is nc#885's headline class and the shape #775 is in.
  branch("claude/101-never-pushed");
  commit(repo, "app/one.ts", "export const one = 1;\n", "101: first");
  heads["claude/101-never-pushed"] = commit(repo, "app/one.ts", "export const one = 2;\n", "101: second");

  // Pushed, and an open pull request carries it. Work in flight.
  branch("claude/102-open-pr");
  heads["claude/102-open-pr"] = commit(repo, "app/two.ts", "export const two = 1;\n", "102");
  push("claude/102-open-pr", heads["claude/102-open-pr"]);

  // Pushed and squash-merged: main has a new commit with the same content, the
  // branch is still ahead by its own commit forever, and a pull request's head
  // is exactly this tip. Seen. The quietness case.
  branch("claude/103-absorbed");
  heads["claude/103-absorbed"] = commit(repo, "app/three.ts", "export const three = 1;\n", "103");
  push("claude/103-absorbed", heads["claude/103-absorbed"]);
  repo.git(["checkout", "-q", "main"]);
  heads.mainAfterSquash = commit(repo, "app/three.ts", "export const three = 1;\n", "103 (#103)");
  repo.git(["update-ref", "refs/remotes/origin/main", heads.mainAfterSquash]);

  // Pushed, ahead, and no pull request has ever named it. The milder class.
  branch("claude/104-no-pr-ever");
  heads["claude/104-no-pr-ever"] = commit(repo, "app/four.ts", "export const four = 1;\n", "104");
  push("claude/104-no-pr-ever", heads["claude/104-no-pr-ever"]);

  // Pushed; a pull request closed on an earlier commit and the branch grew
  // afterwards. Everything after that sha has been seen by nobody.
  branch("claude/105-moved-on");
  const reviewed = commit(repo, "app/five.ts", "export const five = 1;\n", "105: reviewed");
  heads["claude/105-moved-on"] = commit(repo, "app/five.ts", "export const five = 2;\n", "105: after");
  push("claude/105-moved-on", heads["claude/105-moved-on"]);

  // Pushed once and then committed to again locally: origin exists but does not
  // hold the tip. The ticket body's "an origin ref behind local".
  branch("claude/106-ahead-of-origin");
  const pushedPart = commit(repo, "app/six.ts", "export const six = 1;\n", "106: pushed");
  push("claude/106-ahead-of-origin", pushedPart);
  heads["claude/106-ahead-of-origin"] = commit(repo, "app/six.ts", "export const six = 2;\n", "106: local only");

  repo.git(["checkout", "-q", "main"]);

  return void (fixture = {
    repo,
    heads,
    pullRequests: [
      { number: 102, state: "open", ref: "claude/102-open-pr", sha: heads["claude/102-open-pr"], merged: false },
      { number: 103, state: "closed", ref: "claude/103-absorbed", sha: heads["claude/103-absorbed"], merged: true },
      { number: 105, state: "closed", ref: "claude/105-moved-on", sha: reviewed, merged: true },
    ],
  });
});

/** The scan as a night shift runs it, with every branch aged past the threshold. */
function coldScan(overrides: Record<string, unknown> = {}) {
  return unseenScan({
    git: fixture.repo.git,
    pullRequests: fixture.pullRequests,
    now: Date.now() + (COLD_THRESHOLD_HOURS + 1) * 3_600_000,
    ...overrides,
  });
}

const find = (scan: { results: UnseenRecord[] }, branch: string) =>
  scan.results.find((r) => r.branch === branch);

describe("unseen-work sweep: what it names", () => {
  it("names a branch that was committed and never pushed", () => {
    const scan = coldScan();
    const record = find(scan, "claude/101-never-pushed");

    expect(record?.state).toBe("unpushed");
    expect(record?.stranded).toBe(true);
    expect(record?.ahead).toBe(2);
    expect(record?.ticket).toBe(101);
    expect(scan.unpushed.map((r) => r.branch)).toContain("claude/101-never-pushed");
  });

  it("names a pushed branch no pull request has ever carried", () => {
    const scan = coldScan();
    const record = find(scan, "claude/104-no-pr-ever");

    expect(record?.state).toBe("never-reviewed");
    expect(record?.stranded).toBe(true);
    expect(scan.unreviewed.map((r) => r.branch)).toContain("claude/104-no-pr-ever");
  });

  it("names commits pushed after the pull request closed", () => {
    const record = find(coldScan(), "claude/105-moved-on");

    expect(record?.state).toBe("moved-since-review");
    expect(record?.stranded).toBe(true);
  });

  it("names a branch whose origin ref is behind the local tip", () => {
    const record = find(coldScan(), "claude/106-ahead-of-origin");

    expect(record?.state).toBe("ahead-of-origin");
    expect(record?.stranded).toBe(true);
  });

  it("reports the two classes separately, as the ticket asks", () => {
    const scan = coldScan();

    expect(scan.unpushed.map((r) => r.branch).sort()).toEqual([
      "claude/101-never-pushed",
      "claude/106-ahead-of-origin",
    ]);
    expect(scan.unreviewed.map((r) => r.branch).sort()).toEqual([
      "claude/104-no-pr-ever",
      "claude/105-moved-on",
    ]);
  });

  it("carries the numbers a reader needs to act: ahead, behind, age", () => {
    const scan = coldScan();

    // Forked before the squash landed on main, so it is behind by that commit.
    expect(find(scan, "claude/101-never-pushed")?.ahead).toBe(2);
    expect(find(scan, "claude/101-never-pushed")?.behind).toBe(1);
    expect(find(scan, "claude/101-never-pushed")?.ageHours).toBeGreaterThan(COLD_THRESHOLD_HOURS);
    expect(find(scan, "claude/104-no-pr-ever")?.ahead).toBe(1);
  });
});

describe("unseen-work sweep: what it stays quiet about", () => {
  it("does not name a branch with an open pull request", () => {
    const scan = coldScan();
    const record = find(scan, "claude/102-open-pr");

    expect(record?.state).toBe("open-pr");
    expect(record?.stranded).toBe(false);
    expect([...scan.unpushed, ...scan.unreviewed].map((r) => r.branch)).not.toContain(
      "claude/102-open-pr",
    );
  });

  it("does not name a branch a pull request already carried, though it is still ahead of main", () => {
    const scan = coldScan();
    const record = find(scan, "claude/103-absorbed");

    // The squash-merge shape: still ahead, and still with no OPEN pull request.
    expect(record?.ahead).toBeGreaterThan(0);
    expect(record?.pullRequests.some((pr) => pr.state === "open")).toBe(false);
    expect(record?.state).toBe("reviewed");
    expect(record?.stranded).toBe(false);
  });

  it("calls nothing unreviewed when the pull request list could not be read", () => {
    // `--local-only`, no `gh`, or a 403. "I could not look" is not "nobody has
    // looked", and a report that conflated them would name every branch on the
    // machine the first time the network hiccuped.
    const scan = unseenScan({
      git: fixture.repo.git,
      pullRequests: [],
      pullRequestsKnown: false,
      now: Date.now() + (COLD_THRESHOLD_HOURS + 1) * 3_600_000,
    });

    expect(scan.unreviewed).toEqual([]);
    expect(find(scan, "claude/104-no-pr-ever")?.state).toBe("review-unknown");
    expect(find(scan, "claude/104-no-pr-ever")?.stranded).toBe(false);
    // The half that needs no network still answers.
    expect(scan.unpushed.map((r) => r.branch)).toContain("claude/101-never-pushed");
    expect(scan.inFlight.map((r) => r.branch)).toContain("claude/104-no-pr-ever");
  });

  it("does not name anything at all when every branch is warm", () => {
    const scan = unseenScan({
      git: fixture.repo.git,
      pullRequests: fixture.pullRequests,
      now: Date.now(),
    });

    expect(scan.unpushed).toEqual([]);
    expect(scan.unreviewed).toEqual([]);
    // Still listed, in the in-flight section — never hidden, only un-shouted.
    expect(scan.inFlight.map((r) => r.branch)).toContain("claude/101-never-pushed");
  });

  it("does not name main itself", () => {
    expect(find(coldScan(), "main")?.state).toBe("level");
  });
});

describe("unseen-work sweep: ranking", () => {
  const facts = (priority: string | null, state = "open") => ({
    ticket: 1,
    state,
    title: "",
    labels: [],
    priority,
    gated: false,
  });

  const rankable = (
    branch: string,
    ageHours: number,
    ticketFacts: ReturnType<typeof facts> | null,
  ): UnseenRank => ({ branch, state: "unpushed", ageHours, ticketFacts });

  it("sorts an open p0 above an open p2, whatever the dates say", () => {
    const older = rankable("b", 900, facts("p2"));
    const newer = rankable("a", 30, facts("p0"));

    expect([older, newer].sort(rankUnseen)[0]).toBe(newer);
  });

  it("sorts a stranded branch on a closed ticket below an open lower-priority one", () => {
    const closedP0 = rankable("a", 900, facts("p0", "closed"));
    const openP2 = rankable("b", 30, facts("p2"));

    expect([closedP0, openP2].sort(rankUnseen)[0]).toBe(openP2);
    expect(triageBand(closedP0)).toBeGreaterThan(triageBand(openP2));
  });

  it("sorts a branch with no readable ticket last rather than dropping it", () => {
    const unknown = rankable("a", 900, null);
    const known = rankable("b", 1, facts("p2"));

    expect([unknown, known].sort(rankUnseen)[0]).toBe(known);
    expect(priorityRank(null)).toBeGreaterThan(priorityRank("p2"));
  });
});

describe("unseen-work sweep: reading the branch name and the board", () => {
  it("reads a ticket number out of the shapes this repository uses", () => {
    expect(ticketFromBranch("claude/775-cut-private-repo-link")).toBe(775);
    expect(ticketFromBranch("fix/582-premium-content-boundary")).toBe(582);
    expect(ticketFromBranch("feature/827-shared-grounds")).toBe(827);
    expect(ticketFromBranch("monet/341-weather-iconography")).toBe(341);
  });

  it("returns no ticket rather than a wrong one", () => {
    expect(ticketFromBranch("claude/langfuse-prompts")).toBeNull();
    expect(ticketFromBranch("fix/voices-responsive")).toBeNull();
    expect(ticketFromBranch("cla-signatures")).toBeNull();
    // A version number is not a ticket number.
    expect(ticketFromBranch("design/round-2")).toBeNull();
  });

  it("survives an unreachable board instead of failing the sweep", () => {
    const lookup = makeTicketLookup({
      repo: "owner/repo",
      gh: () => {
        throw new Error("HTTP 403");
      },
    });

    expect(lookup(775)).toBeNull();
    expect(priorityRank(lookup(775)?.priority)).toBe(3);
  });

  /**
   * The projection is this file's, not a `--jq` expression evaluated upstream
   * (nc#1206): the transport implements no filter language, because the
   * containers this sweep runs in have no `gh` to evaluate one and a transport
   * that half-evaluates an expression answers something adjacent to the
   * question. The shape asserted here is `branch-salvage-sweep.mjs`'s own.
   */
  it("asks the board once per ticket, however many branches carry it", () => {
    const calls: string[][] = [];
    const lookup = makeTicketLookup({
      repo: "owner/repo",
      gh: (args) => {
        calls.push(args);
        return JSON.stringify({
          state: "open",
          title: "The landing page links to a private repo",
          labels: [{ name: "p0" }, { name: "johan-gated" }],
        });
      },
    });

    expect(lookup(775)?.priority).toBe("p0");
    expect(lookup(775)?.gated).toBe(true);
    expect(lookup(775)?.title).toContain("private repo");
    expect(lookup(775)?.labels).toEqual(["p0", "johan-gated"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).not.toContain("--jq");
  });
});

describe("unseen-work sweep: how it talks to GitHub", () => {
  /**
   * REST, page by page. GraphQL is blocked in the sandboxes a night shift runs
   * in, and `gh api --paginate` follows a `Link` header the same proxy refuses,
   * so it silently returns only the first hundred pull requests — which would
   * classify every older branch as never-reviewed. Both constraints are pinned
   * here because the failure they cause is a confident wrong answer.
   */
  it("pages with page=N, never --paginate, never graphql", () => {
    const calls: string[][] = [];
    const gh = (args: string[]) => {
      calls.push(args);
      // `[&?]` on purpose: a bare /page=(\d+)/ matches `per_page=100` first.
      const page = /[&?]page=(\d+)/.exec(args[1] ?? "")?.[1];
      const rows = page === "1" ? 100 : 3;
      return JSON.stringify(
        Array.from({ length: rows }, (_, i) => ({
          number: i,
          state: "closed",
          head: { ref: `ref-${page}-${i}`, sha: "sha" },
          merged_at: "2026-01-01T00:00:00Z",
        })),
      );
    };

    const prs = fetchPullRequests({ repo: "owner/repo", gh });

    expect(prs).toHaveLength(103);
    expect(calls).toHaveLength(2);
    expect(calls.every((args) => args[0] === "api")).toBe(true);
    expect(calls.some((args) => args.includes("--paginate"))).toBe(false);
    expect(calls.some((args) => args.join(" ").includes("graphql"))).toBe(false);
    expect(calls.some((args) => args.includes("--jq"))).toBe(false);
    expect(calls[1]?.[1]).toContain("page=2");
  });

  /**
   * The five fields the index is built from, projected here since nc#1206.
   * `merged` is the one that is not a copy: GitHub reports it as a timestamp
   * or null, and a branch whose pull request closed unmerged is a different
   * finding from one that landed.
   */
  it("projects a pull request page into the record the index is built from", () => {
    const prs = fetchPullRequests({
      repo: "owner/repo",
      perPage: 100,
      gh: () =>
        JSON.stringify([
          {
            number: 3,
            state: "open",
            head: { ref: "claude/3-x", sha: "aaa" },
            merged_at: null,
          },
          {
            number: 2,
            state: "closed",
            head: { ref: "claude/2-y", sha: "bbb" },
            merged_at: "2026-09-01T00:00:00Z",
          },
        ]),
    });

    expect(prs).toEqual([
      { number: 3, state: "open", ref: "claude/3-x", sha: "aaa", merged: false },
      { number: 2, state: "closed", ref: "claude/2-y", sha: "bbb", merged: true },
    ]);
  });

  it("indexes pull requests by head ref, newest first", () => {
    const index = indexPullRequests([
      { number: 1, state: "closed", ref: "b", sha: "a1", merged: true },
      { number: 9, state: "closed", ref: "b", sha: "a9", merged: true },
    ]);

    expect(index.get("b")?.map((pr) => pr.number)).toEqual([9, 1]);
  });
});

describe("unseen-work sweep: the classifier in isolation", () => {
  const base = { branch: "x", head: "abc", ahead: 3, behind: 1, ageHours: 100, local: true, orphan: false };

  it("puts every state it can reach in the documented list", () => {
    const states = [
      classifyUnseen({ ...base }, { originHasTip: false }).state,
      classifyUnseen({ ...base, onOrigin: true }, { originHasTip: false }).state,
      classifyUnseen({ ...base, local: false }, { pullRequests: [{ state: "open", sha: "z" }] }).state,
      classifyUnseen({ ...base, local: false }, { pullRequests: [{ state: "closed", sha: "abc" }] }).state,
      classifyUnseen({ ...base, local: false }, { pullRequests: [] }).state,
      classifyUnseen({ ...base, local: false }, { pullRequests: [{ state: "closed", sha: "old" }] }).state,
      classifyUnseen({ ...base, local: false }, { pullRequestsKnown: false }).state,
      classifyUnseen({ ...base, ahead: 0 }, { originHasTip: false }).state,
    ];

    expect(states).toEqual([
      "unpushed",
      "ahead-of-origin",
      "open-pr",
      "reviewed",
      "never-reviewed",
      "moved-since-review",
      "review-unknown",
      "level",
    ]);
    expect(new Set(UNSEEN_STATES)).toEqual(new Set(states));
  });

  it("never calls a branch with no measurable position stranded", () => {
    const orphan = classifyUnseen(
      { ...base, local: false, orphan: true, ahead: null },
      { pullRequests: [] },
    );

    expect(orphan.stranded).toBe(false);
  });
});

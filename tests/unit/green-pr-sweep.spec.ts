/**
 * The green-PR sweep's selection predicate (#893).
 *
 * The sweep exists because reading, not merging, is this repository's
 * constraint: #868 and #867 sat green and unmerged for four and a half hours on
 * 2026-09-02, #586 waited five days from 2026-08-27 14:20Z, and the one night
 * something invoked `merge-pr.mjs` across the open set it closed fourteen
 * tickets in four hours.
 *
 * What can be wrong here is WHICH pull requests get offered to the gate, and
 * whether the report says the true thing about each one it holds back. So these
 * tests spoil exactly one fact at a time on an otherwise-green PR and require
 * both the verdict and the STATED REASON — a report that refuses for the wrong
 * reason sends its reader to fix the wrong thing, which is the failure mode a
 * report has instead of a crash.
 *
 * No network and no `gh` on PATH: `collectFacts` and `sweep` take an injectable
 * `api`, exactly like `readTicket` in `merge-pr.mjs`, and the classifier is a
 * pure function over facts.
 */
import { describe, expect, it, vi } from "vitest";

import {
  BUILD_CHECK,
  IDENTITY_CHECK,
  MERGEABLE_CHECK,
  type CheckRun,
  type GateState,
} from "../../scripts/merge-pr.mjs";
import {
  MERGE_SCRIPT,
  STALE_GREEN_HOURS,
  classifyPullRequest,
  collectFacts,
  formatAge,
  formatReport,
  greenSince,
  offerToGate,
  parseArgs,
  sweep,
} from "../../scripts/green-pr-sweep.mjs";

const HEAD = "12ffd0672e11aa22bb33";
/** 2026-09-02 11:20Z — the morning #868 and #867 had already been green since ~06:50Z. */
const NOW = Date.parse("2026-09-02T11:20:00Z");
const GREEN_AT = "2026-09-02T06:50:00Z";

function check(name: string, status: string, conclusion: string | null, extra = {}): CheckRun {
  return {
    name,
    status,
    conclusion,
    started_at: "2026-09-02T06:47:00Z",
    completed_at: GREEN_AT,
    html_url: `https://github.com/johangace/nature-class/runs/${name}`,
    ...extra,
  };
}

/** A PR nothing is wrong with, so each test can spoil exactly one thing. */
function greenFacts(overrides: Partial<GateState> = {}): GateState {
  return {
    prNumber: 868,
    title: "The reopened landing claim (#403)",
    prState: "open",
    baseRef: "main",
    headRef: "claude/403-landing",
    draft: false,
    headSha: HEAD,
    mergeable: true,
    mergeableState: "clean",
    behindBy: 0,
    // The sweep reads the branch's commits because the gate does: the squash
    // message is composed from them, and a predicate fed less than the gate
    // reads is a predicate that disagrees with it (#995).
    commits: [{ sha: "aa11bb22cc33", message: "fix: the reopened landing claim (nc#403)" }],
    commitCount: 1,
    checkRuns: [
      check(BUILD_CHECK, "completed", "success"),
      check(IDENTITY_CHECK, "completed", "success"),
      check(MERGEABLE_CHECK, "completed", "success"),
    ],
    linkedIssues: [{ number: 403, kind: "issue", labels: ["p1"] }],
    ...overrides,
  };
}

const classify = (facts: GateState) => classifyPullRequest(facts, { now: NOW });

describe("the selection predicate", () => {
  it("offers a green, ungated PR — and says how long it has been waiting", () => {
    const row = classify(greenFacts());

    expect(row.status).toBe("offer");
    expect(row.reason).toBeNull();
    expect(row.greenSince).toBe(new Date(GREEN_AT).toISOString());
    // 06:50Z to 11:20Z: the four and a half hours #893 measured.
    expect(row.greenForMs).toBe(4.5 * 60 * 60 * 1000);
    expect(row.stale).toBe(true);
  });

  it("refuses a draft, and says it is a draft", () => {
    const row = classify(greenFacts({ draft: true }));

    expect(row.status).toBe("refused");
    expect(row.reason).toMatch(/draft/i);
  });

  it("refuses a red build, and names the check rather than the PR", () => {
    const row = classify(
      greenFacts({
        checkRuns: [
          check(BUILD_CHECK, "completed", "failure", { completed_at: "2026-09-02T06:51:00Z" }),
          check(IDENTITY_CHECK, "completed", "success"),
          check(MERGEABLE_CHECK, "completed", "success"),
        ],
      }),
    );

    expect(row.status).toBe("refused");
    expect(row.reason).toContain(`check '${BUILD_CHECK}'`);
    expect(row.reason).toMatch(/completed\/failure/);
    // A red PR is not green, so it cannot be counted as time lost to reading.
    expect(row.greenForMs).toBeNull();
    expect(row.stale).toBe(false);
  });

  it("refuses a head behind main, and says how far behind", () => {
    const row = classify(greenFacts({ behindBy: 2 }));

    expect(row.status).toBe("refused");
    expect(row.reason).toContain("2 commit(s) behind main");
    // It IS green — that is why the row still carries the clock. It is just not
    // offerable until someone rebases, which this script never does.
    expect(row.greenForMs).toBe(4.5 * 60 * 60 * 1000);
    expect(row.stale).toBe(false);
  });

  it("refuses a PR whose closing ticket carries johan-gated, and names the label (#823)", () => {
    const row = classify(
      greenFacts({
        prNumber: 884,
        title: "Rewrite the landing's central claim (#870)",
        linkedIssues: [{ number: 870, kind: "issue", labels: ["johan-gated", "track:content"] }],
      }),
    );

    expect(row.status).toBe("refused");
    expect(row.reason).toContain("#870 carries 'johan-gated'");
    expect(row.reason).toContain("A GREEN BUILD CANNOT CLEAR A CONTENT GATE");
    expect(row.stale).toBe(false);
    expect(row.closes).toEqual([870]);
  });

  it("refuses johan-decision too, and a ticket whose labels could not be read", () => {
    const decision = classify(
      greenFacts({ linkedIssues: [{ number: 703, kind: "issue", labels: ["johan-decision"] }] }),
    );
    expect(decision.status).toBe("refused");
    expect(decision.reason).toContain("#703 carries 'johan-decision'");

    const unreadable = classify(
      greenFacts({
        linkedIssues: [{ number: 703, kind: "unreadable", labels: null, error: "HTTP 502" }],
      }),
    );
    expect(unreadable.status).toBe("refused");
    expect(unreadable.reason).toContain("could not read the labels of #703");
  });

  it("refuses a conflicted PR and a PR aimed away from main", () => {
    const conflicted = classify(greenFacts({ mergeable: false, mergeableState: "dirty" }));
    expect(conflicted.status).toBe("refused");
    expect(conflicted.reason).toContain("mergeable=false");

    const elsewhere = classify(greenFacts({ baseRef: "claude/859-merge-gate-rest" }));
    expect(elsewhere.status).toBe("refused");
    expect(elsewhere.reason).toContain("not main");
  });

  it("separates 'not settled yet' from 'refused', because they need different readers", () => {
    const building = classify(
      greenFacts({ checkRuns: [check(BUILD_CHECK, "in_progress", null, { completed_at: null })] }),
    );
    expect(building.status).toBe("settling");
    expect(building.reason).toContain(BUILD_CHECK);
    expect(building.stale).toBe(false);

    const computing = classify(greenFacts({ mergeable: null, mergeableState: "unknown" }));
    expect(computing.status).toBe("settling");
  });

  it("does not call one hour of green a jam, and takes a threshold", () => {
    const justGreen = classifyPullRequest(greenFacts(), {
      now: Date.parse("2026-09-02T07:05:00Z"),
    });
    expect(justGreen.status).toBe("offer");
    expect(justGreen.stale).toBe(false);

    const strict = classifyPullRequest(greenFacts(), {
      now: NOW,
      staleAfterMs: 8 * 60 * 60 * 1000,
    });
    expect(strict.status).toBe("offer");
    expect(strict.stale).toBe(false);

    expect(STALE_GREEN_HOURS).toBe(1);
  });
});

describe("greenSince", () => {
  it("is the moment the LAST required check concluded, not the first", () => {
    const later = "2026-09-02T06:55:00Z";
    const at = greenSince([
      check(BUILD_CHECK, "completed", "success"),
      check(MERGEABLE_CHECK, "completed", "success", { completed_at: later }),
    ]);
    expect(at).toBe(Date.parse(later));
  });

  it("accepts a head with no 'mergeable' run (PRs predating pr-merge-check.yml)", () => {
    expect(greenSince([check(BUILD_CHECK, "completed", "success")])).toBe(Date.parse(GREEN_AT));
  });

  /**
   * The clock must survive a re-run of CI on an UNCHANGED head. Before this was
   * fixed the age came off `latestCheckRun`, so a PR green from 06:50Z read
   * 9h17m at 16:00Z and 0h57m once someone re-ran the same commit at 15:00Z —
   * re-running a check erased the very jam the report exists to show.
   */
  it("does not reset the green clock when CI is re-run on the same head", () => {
    const first = check(BUILD_CHECK, "completed", "success");
    const rerun = check(BUILD_CHECK, "completed", "success", {
      started_at: "2026-09-02T15:00:00Z",
      completed_at: "2026-09-02T15:03:00Z",
    });
    expect(greenSince([first, rerun])).toBe(Date.parse(GREEN_AT));
    // Order in the API response must not matter either.
    expect(greenSince([rerun, first])).toBe(Date.parse(GREEN_AT));
  });

  /**
   * ...but a red run in between DOES restart it. A head that went red at 08:00Z
   * was not green from 06:50Z, and saying it was would be the same lie pointing
   * the other way.
   */
  it("restarts the clock when a red run sits between two greens", () => {
    const at = greenSince([
      check(BUILD_CHECK, "completed", "success"),
      check(BUILD_CHECK, "completed", "failure", {
        started_at: "2026-09-02T08:00:00Z",
        completed_at: "2026-09-02T08:03:00Z",
      }),
      check(BUILD_CHECK, "completed", "success", {
        started_at: "2026-09-02T15:00:00Z",
        completed_at: "2026-09-02T15:03:00Z",
      }),
    ]);
    expect(at).toBe(Date.parse("2026-09-02T15:03:00Z"));
  });

  it("is null when the build is absent, unfinished, or red", () => {
    expect(greenSince([])).toBeNull();
    expect(greenSince([check(BUILD_CHECK, "queued", null)])).toBeNull();
    expect(greenSince([check(BUILD_CHECK, "completed", "failure")])).toBeNull();
    expect(
      greenSince([
        check(BUILD_CHECK, "completed", "success"),
        check(MERGEABLE_CHECK, "completed", "failure"),
      ]),
    ).toBeNull();
  });

  it("never calls a head with a red 'identity' run green (#958)", () => {
    // The sweep's verdict comes from `evaluateGates`, which refuses this — but
    // a row reading "green for 3h" beside that refusal is the report telling
    // the reader the opposite of what the gate found.
    expect(
      greenSince([
        check(BUILD_CHECK, "completed", "success"),
        check(MERGEABLE_CHECK, "completed", "success"),
        check(IDENTITY_CHECK, "completed", "failure"),
      ]),
    ).toBeNull();
    // Present and green, it is one of the checks the clock waits for.
    const later = "2026-09-02T06:57:00Z";
    expect(
      greenSince([
        check(BUILD_CHECK, "completed", "success"),
        check(MERGEABLE_CHECK, "completed", "success"),
        check(IDENTITY_CHECK, "completed", "success", { completed_at: later }),
      ]),
    ).toBe(Date.parse(later));
  });
});

describe("formatAge", () => {
  /**
   * The two spans this report exists to make legible. Through `merge-pr.mjs`'s
   * `formatDuration` — built for a 15-minute wait budget — they read "270m00s"
   * and "7200m00s", which is why this repeats rather than reuses it.
   */
  it("renders the measured jams in hours and days", () => {
    expect(formatAge(4.5 * 60 * 60 * 1000)).toBe("4h30m");
    // #586, open from 2026-08-27 14:20Z and still waiting five days later.
    expect(formatAge(5 * 24 * 60 * 60 * 1000 + 21 * 60 * 60 * 1000)).toBe("5d21h");
    expect(formatAge(42 * 60 * 1000)).toBe("42m");
    expect(formatAge(30 * 1000)).toBe("30s");
  });
});

describe("collectFacts", () => {
  /** A fake `gh api` over fixture payloads — no network, no gh on PATH. */
  function fakeApi(routes: Record<string, unknown>) {
    return vi.fn((args: string[]) => {
      const path = args[1] ?? "";
      if (!(path in routes)) throw new Error(`unexpected call: ${path}`);
      return JSON.stringify(routes[path]);
    });
  }

  const listItem = {
    number: 868,
    title: "The reopened landing claim (#403)",
    state: "open",
    draft: false,
    base: { ref: "main" },
    head: { ref: "claude/403-landing", sha: HEAD },
  };

  it("reads compare, check-runs and ticket labels over REST", () => {
    const api = fakeApi({
      "repos/johangace/nature-class/pulls/868": {
        ...listItem,
        body: "Closes #403.",
        mergeable: true,
        mergeable_state: "clean",
      },
      [`repos/johangace/nature-class/compare/main...${HEAD}`]: { behind_by: 0 },
      [`repos/johangace/nature-class/commits/${HEAD}/check-runs?per_page=100`]: {
        check_runs: [
          check(BUILD_CHECK, "completed", "success"),
          check(IDENTITY_CHECK, "completed", "success"),
        ],
      },
      "repos/johangace/nature-class/issues/403": { number: 403, labels: [{ name: "p1" }] },
      "repos/johangace/nature-class/pulls/868/commits?per_page=100": [
        { sha: "aa11bb22cc33", commit: { message: "fix: the reopened landing claim (nc#403)" } },
      ],
    });

    const facts = collectFacts({ ...listItem, mergeable: null }, { api, sleep: () => {} });

    expect(facts.mergeable).toBe(true);
    expect(facts.behindBy).toBe(0);
    expect(facts.linkedIssues).toEqual([
      { number: 403, kind: "issue", title: undefined, labels: ["p1"] },
    ]);
    // Every call is `gh api repos/...`; nothing reaches for a GraphQL subcommand (#859).
    for (const call of api.mock.calls) expect(call[0][0]).toBe("api");
  });

  it("short-circuits a draft without spending a compare or a check-runs call", () => {
    const api = fakeApi({});
    const facts = collectFacts({ ...listItem, draft: true }, { api, sleep: () => {} });

    expect(facts.draft).toBe(true);
    expect(api).not.toHaveBeenCalled();
    expect(classifyPullRequest(facts, { now: NOW }).status).toBe("refused");
  });
});

describe("the sweep and its report", () => {
  it("orders by how long each PR has been green, and counts the jam", () => {
    const api = vi.fn((args: string[]) => {
      const path = args[1] ?? "";
      if (path.startsWith("repos/johangace/nature-class/pulls?state=open")) {
        return JSON.stringify([
          {
            number: 927,
            title: "Sketch: the signed-out try flow (#922)",
            state: "open",
            draft: true,
            base: { ref: "main" },
            head: { ref: "claude/922", sha: "a0129c713d00" },
          },
          {
            number: 868,
            title: "The reopened landing claim (#403)",
            state: "open",
            draft: false,
            body: "Closes #403.",
            mergeable: true,
            mergeable_state: "clean",
            base: { ref: "main" },
            head: { ref: "claude/403-landing", sha: HEAD },
          },
        ]);
      }
      if (path.startsWith(`repos/johangace/nature-class/compare`)) {
        return JSON.stringify({ behind_by: 0 });
      }
      if (path.includes("/check-runs")) {
        return JSON.stringify({
          check_runs: [
            check(BUILD_CHECK, "completed", "success"),
            check(IDENTITY_CHECK, "completed", "success"),
            check(MERGEABLE_CHECK, "completed", "success"),
          ],
        });
      }
      if (path.endsWith("/issues/403")) {
        return JSON.stringify({ number: 403, labels: [{ name: "p1" }] });
      }
      if (path.includes("/commits?per_page=")) {
        return JSON.stringify([
          { sha: "aa11bb22cc33", commit: { message: "fix: the reopened landing claim (nc#403)" } },
        ]);
      }
      throw new Error(`unexpected call: ${path}`);
    });

    const result = sweep({ api, now: NOW, sleep: () => {} });

    expect(result.rows.map((row) => row.number)).toEqual([868, 927]);
    expect(result.rows.map((row) => row.status)).toEqual(["offer", "refused"]);

    const report = formatReport(result);
    expect(report).toContain("JAMMED  #868  green 4h30m");
    expect(report).toContain("held    #927  not green");
    expect(report).toContain("1 candidate(s) the gate would merge right now; 1 of them");
    expect(report).toContain("--merge");
    // Report mode must not read as though it did anything.
    expect(report).toContain("Nothing here merged anything.");
  });

  /**
   * The report shouts about JAMMED rows, so a reader can easily assume `--merge`
   * acts on those. It does not — it offers every row the gate would merge. The
   * report has to say so, because the gap between what a report emphasises and
   * what its verb does is exactly where an operator gets surprised.
   */
  it("says plainly that --merge takes every candidate, not just the JAMMED ones", () => {
    const rows = [
      { number: 1, status: "offer", stale: true, greenForMs: 5 * 60 * 60 * 1000, title: "old", closes: [], reason: null, url: "u1" },
      { number: 2, status: "offer", stale: false, greenForMs: 15_000, title: "fresh", closes: [], reason: null, url: "u2" },
    ];
    const report = formatReport({ rows, now: NOW, staleAfterMs: 60 * 60 * 1000 } as never);

    expect(report).toContain("2 candidate(s) the gate would merge right now; 1 of them");
    expect(report).toContain("That offers all 2 candidate(s) above, not just the 1 marked JAMMED");
    expect(report).toContain("the age column is for you, not for the gate");
  });
});

describe("merging is the gate's job, not this script's", () => {
  it("spawns merge-pr.mjs rather than calling any merge API", () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const outcome = offerToGate(868, { spawn, node: "/usr/bin/node" });

    expect(spawn).toHaveBeenCalledWith("/usr/bin/node", [MERGE_SCRIPT, "868"], {
      stdio: "inherit",
    });
    expect(MERGE_SCRIPT).toMatch(/scripts\/merge-pr\.mjs$/);
    expect(outcome).toEqual({ number: 868, merged: true, exitCode: 0 });
  });

  it("reports the gate's refusal as a refusal, not as a crash", () => {
    const spawn = vi.fn(() => ({ status: 1 }));
    expect(offerToGate(868, { spawn })).toEqual({ number: 868, merged: false, exitCode: 1 });
  });

  it("defaults to reporting: --merge has to be typed", () => {
    expect(parseArgs([]).merge).toBe(false);
    expect(parseArgs(["--json"]).merge).toBe(false);
    expect(parseArgs(["--merge"]).merge).toBe(true);
    expect(parseArgs(["--stale-hours", "4"]).staleAfterMs).toBe(4 * 60 * 60 * 1000);
    expect(parseArgs(["--stale-hours", "nonsense"]).usageError).toBe(true);
    expect(parseArgs(["--merge-everything"]).usageError).toBe(true);
  });
});

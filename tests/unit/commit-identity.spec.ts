/**
 * The commit-identity guard, held to the failure that produced it (#834).
 *
 * The bug is a SILENT pass. A Codex branch carrying commits authored
 * `johan gace <gace.johan3@gmail.com>` clears the CLA check (the founder's
 * login is on its allowlist), clears the merge gate (which reads no authorship
 * at all), and reads in `git log` as something Johan wrote. Nothing went red.
 * Nobody was lying. There was simply no check that looked at the author field.
 *
 * So the two halves of this file are the two things nc#554 says any check in
 * this repository has to be:
 *
 *   IT BITES.    A real scratch repository, with a real commit really authored
 *                with the founder's email, on a real `codex/` branch. The guard
 *                must go red and must NAME the SHA. Remove the branch-prefix
 *                rule and these fail — which is the point: this is the test
 *                that fails without the change.
 *   IT IS QUIET. The mirror cases matter as much, because a guard that refuses
 *                Johan's own branches gets switched off in a week. Johan's own
 *                `fix/…` branch, a correctly-authored agent branch, and a
 *                mixed range where only one commit borrows: all must pass, or
 *                pass everything but the one commit that earned it.
 *
 * The scratch repositories set an explicit identity per commit — author AND
 * committer, both pinned per commit rather than inherited — so nothing here
 * reads the machine's git config or its GIT_* environment, and no result can be
 * perturbed by them. That matters more since #851 than it did before: the
 * committer field is now half of rule 2's discriminator, and this suite runs in
 * sessions whose environment exports GIT_COMMITTER_* on purpose.
 */
import { describe, expect, it, afterAll, beforeAll, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  AGENT_BRANCH_PREFIXES,
  FOUNDER_EMAILS,
  assertBaseSha,
  commitsFromGit,
  commitsFromRestPayload,
  declaresAgent,
  formatReport,
  inspectRange,
  isAgentBranch,
  isFounderIdentity,
  isUnknownRef,
  isUpdateBranchMerge,
  main,
  partitionByBase,
  shasReachableFrom,
} from "../../scripts/commit-identity-check.mjs";

// Every scenario spawns real git in a real repository, so the cost here is
// process spawning rather than computation — the same reason
// branch-salvage-sweep.spec.ts raises its own limit.
vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const FOUNDER = "johan gace <gace.johan3@gmail.com>";
const AGENT = "rewyld-claude[bot] <299630839+rewyld-claude[bot]@users.noreply.github.com>";
const NEUTRAL = "Fixture <fixture@example.invalid>";
/** What GitHub itself commits as: a squash merge, and the Update branch button. */
const GITHUB = "GitHub <noreply@github.com>";

/** The footer this repository's own attribution convention mandates. */
const CLAUDE_FOOTER = [
  "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>",
  "Claude-Session: https://claude.ai/code/session_0189XYLKRaKBJC9aidBHq6tH",
].join("\n");

const scratchDirs: string[] = [];

/** Split `Name <email>` into the pair git wants in GIT_COMMITTER_*. */
function splitIdentity(identity: string): { name: string; email: string } {
  const match = /^(.*)<([^>]*)>\s*$/.exec(identity);
  if (!match) throw new Error(`not an identity: ${identity}`);
  return { name: match[1]!.trim(), email: match[2]!.trim() };
}

/** One commit in a fixture: who signed it, what it says, and who typed it. */
interface FixtureCommit {
  author: string;
  subject: string;
  body?: string;
  /** Defaults to NEUTRAL — an identity that is neither the founder nor an agent. */
  committer?: string;
}

/**
 * A repository with `main`, then one branch carrying the given commits.
 */
function repoWithBranch(
  branch: string,
  commits: FixtureCommit[],
): { dir: string; range: string; branch: string } {
  const dir = mkdtempSync(join(tmpdir(), "commit-identity-"));
  scratchDirs.push(dir);
  const git = (args: string[], committer: string = NEUTRAL) => {
    const who = splitIdentity(committer);
    return execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      env: {
        ...process.env,
        // Pinned, never inherited: the ambient session sets these.
        GIT_COMMITTER_NAME: who.name,
        GIT_COMMITTER_EMAIL: who.email,
        GIT_AUTHOR_NAME: who.name,
        GIT_AUTHOR_EMAIL: who.email,
      },
    });
  };

  git(["init", "--quiet", "--initial-branch=main"]);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  git(["config", "commit.gpgsign", "false"]);

  writeFileSync(join(dir, "base.txt"), "base\n");
  git(["add", "base.txt"]);
  git(["commit", "--quiet", "-m", "base commit", `--author=${AGENT}`]);

  git(["checkout", "--quiet", "-b", branch]);
  commits.forEach(({ author, subject, body, committer }, index) => {
    writeFileSync(join(dir, `file-${index}.txt`), `${subject}\n`);
    git(["add", `file-${index}.txt`]);
    const args = ["commit", "--quiet", "-m", subject];
    if (body) args.push("-m", body);
    args.push(`--author=${author}`);
    git(args, committer ?? NEUTRAL);
  });

  return { dir, range: `main..${branch}`, branch };
}

function verdictFor(
  fixture: { dir: string; range: string; branch: string },
  branchAs?: string,
) {
  return inspectRange({
    branch: branchAs ?? fixture.branch,
    commits: commitsFromGit(fixture.range, { cwd: fixture.dir }),
  });
}

afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

describe("it bites: a borrowed founder identity on an agent branch", () => {
  let fixture: ReturnType<typeof repoWithBranch>;

  beforeAll(() => {
    // The #834 instance, reconstructed: `codex/826-reference-visual-treatment`
    // carried two commits, both authored with the founder's own email, and
    // opened as PR#833 against a repository where every existing gate said yes.
    fixture = repoWithBranch("codex/826-reference-visual-treatment", [
      { author: FOUNDER, subject: "feat: carry the approved landing visual treatment" },
      { author: FOUNDER, subject: "fix: make the visual signal screen-reader explicit" },
    ]);
  });

  it("refuses the range", () => {
    expect(verdictFor(fixture).offences).toHaveLength(2);
  });

  it("names the offending SHAs and the identity claimed, in full", () => {
    const verdict = verdictFor(fixture);
    const report = formatReport(verdict);

    // Loudly, per the ticket: the SHA has to be in the output, not a count of
    // problems, or the reader cannot act on it without re-deriving the range.
    for (const offence of verdict.offences) {
      expect(offence.sha).toMatch(/^[0-9a-f]{40}$/);
      expect(report).toContain(offence.sha);
    }
    expect(report).toContain("gace.johan3@gmail.com");
    expect(report).toContain("REFUSED");
    // And it has to say what to do, or the next person invents a remedy.
    expect(report).toContain("--author=");
  });

  it("reads every commit in the range, not just the tip", () => {
    // The real failure had the borrowed identity on BOTH commits; the shape
    // that would slip past a tip-only check is a clean tip over a dirty body.
    const mixed = repoWithBranch("codex/900-mixed", [
      { author: FOUNDER, subject: "feat: the borrowed one, buried" },
      { author: AGENT, subject: "fix: an honest tip on top of it" },
    ]);
    const verdict = verdictFor(mixed);
    expect(verdict.inspected).toBe(2);
    expect(verdict.offences).toHaveLength(1);
    expect(verdict.offences[0]?.subject).toBe("feat: the borrowed one, buried");
  });

  it("catches the founder's GitHub noreply address too, not only the local one", () => {
    const fixture2 = repoWithBranch("claude/night-x-1", [
      {
        author: "Johan <45638957+johangace@users.noreply.github.com>",
        subject: "feat: the other one",
      },
    ]);
    expect(verdictFor(fixture2).offences).toHaveLength(1);
  });

  it("still refuses when the founder is BOTH author and committer (#851 must not leak into rule 1)", () => {
    // The narrowing in #851 gave rule 2 a committer test. Rule 1 has none and
    // must not acquire one: on a branch automation opened, a borrowed founder
    // identity is refused however complete the disguise. An agent that exports
    // GIT_COMMITTER_* as well as GIT_AUTHOR_* — the cheapest way to defeat the
    // new rule 2 — lands here, and here it is still red.
    const fixture2 = repoWithBranch("claude/night-nature-class-abc-834", [
      {
        author: FOUNDER,
        subject: "feat: a worker's work under the founder's whole identity",
        body: CLAUDE_FOOTER,
        committer: FOUNDER,
      },
    ]);
    const verdict = verdictFor(fixture2);
    expect(verdict.offences).toHaveLength(1);
    expect(verdict.offences[0]?.reasons.join(" ")).toContain("automated worker");
  });

  it("refuses a case-shifted agent prefix, which used to walk straight past (#851)", () => {
    // Git refs are case-sensitive, so `Codex/826-x` is a different branch and
    // `startsWith("codex/")` said no. One keystroke, silent pass.
    const fixture2 = repoWithBranch("Codex/826-reference-visual-treatment", [
      { author: FOUNDER, subject: "feat: the same borrowed identity, capital C" },
    ]);
    const verdict = verdictFor(fixture2);
    expect(verdict.agentBranch).toBe(true);
    expect(verdict.offences).toHaveLength(1);
  });

  it("refuses when the branch cannot be named at all, rather than passing silently (#851)", () => {
    // `--branch ""` and the `HEAD` of a detached checkout both used to report
    // "not an agent branch" and exit 0 with a borrowed identity in the range.
    // Same nc#535 rule as the empty-payload refusal: unknown is not a pass.
    const fixture2 = repoWithBranch("some-branch", [
      { author: FOUNDER, subject: "feat: borrowed, on a branch nobody named" },
    ]);
    for (const unnameable of ["", "   ", "HEAD"]) {
      const verdict = verdictFor(fixture2, unnameable);
      expect(verdict.unknownBranch, unnameable).toBe(true);
      expect(verdict.offences, unnameable).toHaveLength(1);
      expect(formatReport(verdict)).toContain("could not be identified");
    }
  });
});

describe("it is quiet: the cases that must stay green", () => {
  it("leaves Johan's own branch alone", () => {
    // The honest line, and the one that keeps this check switched on. Johan's
    // branches carry Johan's identity because Johan wrote them.
    const fixture = repoWithBranch("fix/582-premium-content-boundary", [
      {
        author: FOUNDER,
        subject: "fix: keep Premium lessons visible on the season shelf",
        committer: FOUNDER,
      },
    ]);
    const verdict = verdictFor(fixture);
    expect(verdict.agentBranch).toBe(false);
    expect(verdict.offences).toHaveLength(0);
    expect(formatReport(verdict)).toContain("no commit claims a founder identity");
  });

  it("leaves a correctly-authored agent branch alone", () => {
    // PR#835, the remediation of #833: same work, authored as Codex.
    const fixture = repoWithBranch("codex/826-reference-visual-treatment-clean", [
      {
        author: "Codex <codex@openai.com>",
        subject: "feat: carry the approved landing visual treatment",
      },
      { author: AGENT, subject: "test(welcome): expect distinct green band" },
    ]);
    const verdict = verdictFor(fixture);
    expect(verdict.agentBranch).toBe(true);
    expect(verdict.offences).toHaveLength(0);
  });

  it("leaves an unrelated contributor alone", () => {
    const fixture = repoWithBranch("claude/night-y-2", [
      {
        author: "Someone Else <someone@example.invalid>",
        subject: "feat: an outside contribution",
      },
    ]);
    expect(verdictFor(fixture).offences).toHaveLength(0);
  });

  it("leaves Johan's own Claude-assisted commit alone (#851, the false positive)", () => {
    // The reproduction from the ticket, verbatim in shape: Johan's own branch,
    // his own identity in BOTH fields, and the footer this repo's attribution
    // convention mandates. `Co-Authored-By:` asserts SHARED authorship — he
    // wrote it, Claude helped — which is the honest arrangement, not a
    // laundered one. Refusing it told him to re-author his own work as a bot.
    const fixture = repoWithBranch("fix/582-premium", [
      {
        author: FOUNDER,
        subject: "fix: tighten the premium boundary",
        body: CLAUDE_FOOTER,
        committer: FOUNDER,
      },
    ]);
    const verdict = verdictFor(fixture);
    expect(verdict.agentBranch).toBe(false);
    expect(verdict.offences).toHaveLength(0);
    expect(formatReport(verdict)).toContain("no commit claims a founder identity");
  });

  it("leaves it alone with the whole Claude Code footer, not just the trailer", () => {
    // `generated with [claude code` is the third AGENT_TRAILER_PATTERN and the
    // one most easily read as a sole-production claim. It is not: the tool
    // stamps it on commits a person directed. Same committer test decides it.
    const fixture = repoWithBranch("research/weekly-2026-08-31", [
      {
        author: FOUNDER,
        subject: "docs: this week's read",
        body: `🤖 Generated with [Claude Code](https://claude.ai/code)\n\n${CLAUDE_FOOTER}`,
        committer: FOUNDER,
      },
    ]);
    expect(verdictFor(fixture).offences).toHaveLength(0);
  });
});

/**
 * Rule 2 after #851: the discriminator is the COMMITTER, not the trailer.
 *
 * A commit carries two identities. `--author=` sets the first; only the hand
 * running `git commit` sets the second. "Johan authored, Johan committed,
 * Claude credited" is a disclosure. "Johan authored, someone else committed,
 * Claude credited" is the founder's name on a commit the founder did not make.
 * Rule 2 now fires on the second and not the first.
 */
describe("the second rule: an agent's commit wearing the founder's name", () => {
  it("refuses it wherever the branch sits, when the founder did not commit it", () => {
    // A non-agent branch, so rule 1 is silent and rule 2 is the only thing
    // standing here. This is the case the #851 narrowing must NOT release.
    const fixture = repoWithBranch("fix/some-ordinary-branch", [
      {
        author: FOUNDER,
        subject: "feat: something an agent wrote",
        body: "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>",
        committer: AGENT,
      },
    ]);
    const verdict = verdictFor(fixture);
    expect(verdict.agentBranch).toBe(false);
    expect(verdict.offences).toHaveLength(1);
    expect(verdict.offences[0]?.reasons.join(" ")).toContain("trailers");
    expect(verdict.offences[0]?.reasons.join(" ")).toContain("committer is not the founder");
    // The report has to show the committer, or the reader cannot see what the
    // rule actually read.
    expect(formatReport(verdict)).toContain("rewyld-claude[bot]");
  });

  it("treats a committer it cannot read as not-the-founder", () => {
    // Unknown is not a pass (nc#535). Neither ingest path drops the field, but
    // the judgement must not depend on that staying true.
    const verdict = inspectRange({
      branch: "fix/no-committer-recorded",
      commits: [
        {
          sha: "c".repeat(40),
          author: { name: "johan gace", email: "gace.johan3@gmail.com" },
          message: "feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
        },
      ],
    });
    expect(verdict.offences).toHaveLength(1);
  });

  it("says so as well as the branch reason when both fire", () => {
    const fixture = repoWithBranch("codex/901-both", [
      {
        author: FOUNDER,
        subject: "feat: both signals at once",
        body: "Co-Authored-By: Codex <noreply@openai.com>",
        committer: AGENT,
      },
    ]);
    expect(verdictFor(fixture).offences[0]?.reasons).toHaveLength(2);
  });

  it("does not fire on an ordinary body that merely mentions a name", () => {
    const fixture = repoWithBranch("fix/mentions-claude", [
      {
        author: FOUNDER,
        subject: "docs: record what Claude found in the audit",
        committer: FOUNDER,
      },
    ]);
    expect(verdictFor(fixture).offences).toHaveLength(0);
  });

  it("tells a human to commit under his own hand, never to re-author as the bot", () => {
    // The sharp edge #851 named: the only remedy the report used to offer was
    // `--author="rewyld-claude[bot]"`, which attributes Johan's own work to a
    // bot — a worse provenance lie than the one being prevented.
    const fixture = repoWithBranch("fix/some-ordinary-branch-2", [
      {
        author: FOUNDER,
        subject: "feat: something",
        body: CLAUDE_FOOTER,
        committer: AGENT,
      },
    ]);
    const report = formatReport(verdictFor(fixture));
    expect(report).toContain("IF JOHAN WROTE THESE");
    expect(report).toContain("--reset-author");
    expect(report).toContain("RECORDED_EXCEPTIONS");
    // And it says out loud which shape is fine, so nobody re-derives the rule.
    expect(report).toContain("Co-Authored-By:");
  });
});

describe("the parts, held directly", () => {
  it("recognises the branch prefixes automation actually uses here", () => {
    expect(AGENT_BRANCH_PREFIXES).toContain("codex/");
    expect(AGENT_BRANCH_PREFIXES).toContain("claude/");
    for (const ref of [
      "codex/826-x",
      "refs/heads/codex/826-x",
      "origin/codex/826-x",
      "claude/night-nature-class-abc-834",
      "agent/nc-75-chunk-reload-recovery",
    ]) {
      expect(isAgentBranch(ref), ref).toBe(true);
    }
    // Case-folded since #851: a ref differing only in case is a different
    // branch to git, and used to be a one-keystroke pass.
    for (const ref of ["Codex/826-x", "CLAUDE/night-x", "Agent/nc-75-x"]) {
      expect(isAgentBranch(ref), ref).toBe(true);
    }
    for (const ref of ["main", "fix/582-x", "research/weekly-2026-08-31", "codexish/x"]) {
      expect(isAgentBranch(ref), ref).toBe(false);
    }
  });

  it("knows a ref it cannot name from one it can", () => {
    for (const ref of ["", "   ", "HEAD", "refs/heads/HEAD", null, undefined]) {
      expect(isUnknownRef(ref), String(ref)).toBe(true);
    }
    for (const ref of ["main", "codex/1-x", "HEADroom", "fix/HEAD"]) {
      expect(isUnknownRef(ref), ref).toBe(false);
    }
  });

  it("matches the founder on email, case-insensitively, and on nothing else", () => {
    expect(FOUNDER_EMAILS).toContain("gace.johan3@gmail.com");
    expect(isFounderIdentity({ name: "johan gace", email: "gace.johan3@gmail.com" })).toBe(true);
    expect(isFounderIdentity({ name: "Codex", email: "GACE.Johan3@Gmail.com  " })).toBe(true);
    // A name is free text and three spellings of his are already in the log, so
    // the check keys on the email git actually keys an identity on.
    expect(isFounderIdentity({ name: "johan gace", email: "someone@example.invalid" })).toBe(
      false,
    );
    expect(isFounderIdentity(undefined)).toBe(false);
  });

  it("reads the git author out of a REST payload, not the GitHub account", () => {
    // These two disagree in exactly the case this check exists for: GitHub
    // resolves the borrowed email to the `johangace` account, so the top-level
    // `author.login` reads clean while `commit.author.email` is the lie.
    const commits = commitsFromRestPayload([
      [
        {
          sha: "a".repeat(40),
          author: { login: "johangace" },
          commit: {
            author: { name: "johan gace", email: "gace.johan3@gmail.com" },
            committer: { name: "johan gace", email: "gace.johan3@gmail.com" },
            message: "feat: something",
          },
        },
      ],
    ]);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.author.email).toBe("gace.johan3@gmail.com");
    expect(inspectRange({ branch: "codex/1-x", commits }).offences).toHaveLength(1);
  });

  it("reads an agent declaration out of a trailer and not out of prose", () => {
    expect(declaresAgent("x\n\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>")).toBe(
      true,
    );
    expect(declaresAgent("x\n\n🤖 Generated with [Claude Code](https://claude.ai/code)")).toBe(
      true,
    );
    expect(declaresAgent("x\n\nCo-Authored-By: A Person <p@example.invalid>")).toBe(false);
    expect(declaresAgent("Claude is mentioned here in passing")).toBe(false);
  });
});

/**
 * The RANGE: what the branch contributed, not what CI happened to hand over
 * (#949).
 *
 * CI feeds this check GitHub's `pulls/:n/commits`, which is a LIST and not a
 * range. For a branch that merged `main` into itself it carries `main`'s
 * commits back to the merge base — and `main`'s commits are overwhelmingly the
 * shape both rules refuse, structurally: a GitHub squash merge stamps
 * `author: johan gace`, `committer: GitHub <noreply@github.com>`, and a message
 * concatenating the branch's own commit messages, agent trailers included. When
 * #949 was filed that was 233 of 598 commits on `main`; re-measured on the
 * branch that fixes it, 244 of 612.
 *
 * So the first agent branch to merge instead of rebasing would have been
 * refused on 244 commits nobody on it wrote, every one already merged, with a
 * remedy — "re-author" — that cannot be applied to `main`'s history. The only
 * available answers would have been `--no-verify` or ignoring the check.
 *
 * The danger in the fix is the obvious one and it is what most of this section
 * is about: a narrowing of the range is a way to HIDE a commit from the guard
 * unless the discriminator is exactly right. It is base-reachability, and these
 * assertions hold it to that — a borrowed identity on the branch's OWN commits
 * is still refused with a merge of `main` sitting in the same range, a merge of
 * a SIDE branch hides nothing, and the merge commit the branch created is
 * judged like any other commit the branch created.
 */
describe("judging what the branch contributed (#949)", () => {
  /**
   * A branch that merged `main` into itself, as git really records it.
   *
   * `main` gets a commit in the squash-merge shape AFTER the branch forked, so
   * it is inside GitHub's PR commit list (it is not reachable from the merge
   * base) and outside `main..branch` (it is reachable from `main`). That gap is
   * the whole bug.
   */
  function repoWithMergedMain(
    branch: string,
    options: { mergeAuthor?: string; mergeCommitter?: string; mergeSubject?: string } = {},
  ) {
    const dir = mkdtempSync(join(tmpdir(), "commit-identity-range-"));
    scratchDirs.push(dir);
    const git = (args: string[], identity: string = NEUTRAL, author: string = identity) => {
      const who = splitIdentity(identity);
      const by = splitIdentity(author);
      return execFileSync("git", args, {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_COMMITTER_NAME: who.name,
          GIT_COMMITTER_EMAIL: who.email,
          GIT_AUTHOR_NAME: by.name,
          GIT_AUTHOR_EMAIL: by.email,
        },
      });
    };
    const write = (file: string, text: string) => writeFileSync(join(dir, file), `${text}\n`);
    const sha = (ref: string) => git(["rev-parse", ref]).trim();

    git(["init", "--quiet", "--initial-branch=main"]);
    git(["config", "user.name", "Fixture"]);
    git(["config", "user.email", "fixture@example.invalid"]);
    git(["config", "commit.gpgsign", "false"]);

    write("base.txt", "base");
    git(["add", "base.txt"]);
    git(["commit", "--quiet", "-m", "base commit"], AGENT);
    const forkPoint = sha("HEAD");

    // The branch's OWN borrowed identity. This one must never stop being red.
    git(["checkout", "--quiet", "-b", branch]);
    write("branch.txt", "the branch's own work");
    git(["add", "branch.txt"]);
    git(["commit", "--quiet", "-m", "feat: the branch's own borrowed identity"], NEUTRAL, FOUNDER);
    const ownCommit = sha("HEAD");

    // `main` moves on, in the exact shape a GitHub squash merge produces.
    git(["checkout", "--quiet", "main"]);
    write("main.txt", "landed on main");
    git(["add", "main.txt"]);
    git(
      [
        "commit",
        "--quiet",
        "-m",
        "Improve the season shelf (#900)",
        "-m",
        CLAUDE_FOOTER,
      ],
      GITHUB,
      FOUNDER,
    );
    const mainCommit = sha("main");

    // ...and the branch merges it in rather than rebasing.
    git(["checkout", "--quiet", branch]);
    git(
      ["merge", "--no-ff", "--quiet", "-m", options.mergeSubject ?? `Merge branch 'main' into ${branch}`, "main"],
      options.mergeCommitter ?? NEUTRAL,
      options.mergeAuthor ?? AGENT,
    );
    const mergeCommit = sha("HEAD");

    return {
      dir,
      branch,
      forkPoint,
      ownCommit,
      mainCommit,
      mergeCommit,
      /** What GitHub's `pulls/:n/commits` hands CI: everything since the merge base. */
      prCommits: () => commitsFromGit(`${forkPoint}..${branch}`, { cwd: dir }),
      /** What the local run reads. */
      localCommits: () => commitsFromGit(`main..${branch}`, { cwd: dir }),
      baseShas: () => shasReachableFrom("main", { cwd: dir }),
    };
  }

  let fixture: ReturnType<typeof repoWithMergedMain>;
  beforeAll(() => {
    fixture = repoWithMergedMain("claude/night-nature-class-949-range");
  });

  it("is the bug: unsubtracted, CI refuses a commit that is already on main", () => {
    // This is the assertion that fails without the fix — it IS the fix's
    // absence, spelled out. `main`'s commit is in the payload and is refused,
    // and the SHA named is one nobody on this branch can act on.
    const unsubtracted = inspectRange({
      branch: fixture.branch,
      commits: fixture.prCommits(),
    });
    expect(unsubtracted.offences.map((o) => o.sha)).toContain(fixture.mainCommit);
  });

  it("subtracts it, and judges only what the branch contributed", () => {
    const verdict = inspectRange({
      branch: fixture.branch,
      commits: fixture.prCommits(),
      baseShas: fixture.baseShas(),
    });
    expect(verdict.offences.map((o) => o.sha)).not.toContain(fixture.mainCommit);
    expect(verdict.alreadyOnBase).toBe(1);
    expect(verdict.inspected).toBe(2);
    // And it says so out loud, so the narrowing is visible in the run's log
    // rather than being an invisible change of scope.
    expect(formatReport(verdict)).toContain("already on the base");
  });

  it("STILL refuses the branch's own borrowed identity, with the merge in the range", () => {
    // The requirement #949 names explicitly: this must not become a way to hide
    // a commit from the guard. A merge of `main` in the range buys nothing.
    const verdict = inspectRange({
      branch: fixture.branch,
      commits: fixture.prCommits(),
      baseShas: fixture.baseShas(),
    });
    expect(verdict.offences.map((o) => o.sha)).toContain(fixture.ownCommit);
    expect(formatReport(verdict)).toContain("REFUSED");
  });

  it("hides nothing behind a merge of a SIDE branch, which base-reachability cannot", () => {
    // The cheaper mechanism the ticket floats — "skip a merge's second-parent
    // history" — is a hole exactly here: commit the borrowed identity on a side
    // branch, merge it in, and it is second-parent history. It is not on the
    // base, so it is still the branch's to answer for.
    const dir = fixture.dir;
    const git = (args: string[], identity: string, author: string = identity) => {
      const who = splitIdentity(identity);
      const by = splitIdentity(author);
      return execFileSync("git", args, {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_COMMITTER_NAME: who.name,
          GIT_COMMITTER_EMAIL: who.email,
          GIT_AUTHOR_NAME: by.name,
          GIT_AUTHOR_EMAIL: by.email,
        },
      });
    };
    git(["checkout", "--quiet", "-b", "side/laundry", fixture.forkPoint], NEUTRAL);
    writeFileSync(join(dir, "side.txt"), "smuggled\n");
    git(["add", "side.txt"], NEUTRAL);
    git(["commit", "--quiet", "-m", "feat: borrowed, on a side branch"], NEUTRAL, FOUNDER);
    const smuggled = git(["rev-parse", "HEAD"], NEUTRAL).trim();
    git(["checkout", "--quiet", fixture.branch], NEUTRAL);
    git(["merge", "--no-ff", "--quiet", "-m", "Merge side/laundry", "side/laundry"], NEUTRAL, AGENT);

    const verdict = inspectRange({
      branch: fixture.branch,
      commits: commitsFromGit(`${fixture.forkPoint}..${fixture.branch}`, { cwd: dir }),
      baseShas: shasReachableFrom("main", { cwd: dir }),
    });
    expect(verdict.offences.map((o) => o.sha)).toContain(smuggled);
    expect(verdict.offences.map((o) => o.sha)).toContain(fixture.ownCommit);
    expect(verdict.offences.map((o) => o.sha)).not.toContain(fixture.mainCommit);
  });

  it("brings the CI path into agreement with the local one, on the same tree", () => {
    // The header's standing promise: `origin/main..HEAD` IS "reachable from
    // HEAD, not reachable from main", and the REST path now subtracts the same
    // set explicitly. Same repository, same branch, same verdict.
    const local = inspectRange({ branch: fixture.branch, commits: fixture.localCommits() });
    const ci = inspectRange({
      branch: fixture.branch,
      commits: fixture.prCommits(),
      baseShas: fixture.baseShas(),
    });
    expect(ci.offences.map((o) => o.sha).sort()).toEqual(
      local.offences.map((o) => o.sha).sort(),
    );
  });

  it("subtracts nothing when it is given nothing, so every existing caller is unchanged", () => {
    const commits = fixture.prCommits();
    for (const baseShas of [undefined, [], null]) {
      const verdict = inspectRange({ branch: fixture.branch, commits, baseShas });
      expect(verdict.inspected).toBe(commits.length);
      expect(verdict.alreadyOnBase).toBe(0);
    }
  });

  it("matches on the full SHA and never on a prefix, which would drop a commit", () => {
    const commits = [
      { sha: "a".repeat(40), author: { name: "x", email: "x@x" }, message: "x" },
      { sha: "b".repeat(40), author: { name: "y", email: "y@y" }, message: "y" },
    ];
    // An abbreviated base SHA is not a match: a prefix guess that went wrong
    // would drop a commit from the guard, so it is refused as an input.
    expect(partitionByBase(commits, ["a".repeat(10)]).alreadyOnBase).toHaveLength(0);
    expect(partitionByBase(commits, ["A".repeat(40)]).alreadyOnBase).toHaveLength(1);
    expect(partitionByBase(commits, ["a".repeat(40)]).contributed).toHaveLength(1);
  });

  it("lists the base's commits out of a real repository", () => {
    const reachable = shasReachableFrom("main", { cwd: fixture.dir });
    expect(reachable).toContain(fixture.mainCommit);
    expect(reachable).toContain(fixture.forkPoint);
    expect(reachable).not.toContain(fixture.ownCommit);
    expect(reachable).not.toContain(fixture.mergeCommit);
  });
});

/**
 * GitHub's "Update branch" button, named as itself (#958).
 *
 * `PUT /repos/:repo/pulls/:n/update-branch` authors its merge commit as the
 * TOKEN'S identity. On 2026-09-03 a session with no local git write capability
 * used it on #939 and #944, and this check refused both — correctly, and with
 * the wrong remedy: "re-author" is not a thing to do to a merge commit a button
 * made, and it is not what fixes the branch. Nothing laundered reached `main`,
 * but the operator was handed advice that does not apply.
 */
describe("the Update-branch button's merge commit (#958)", () => {
  function updateBranchFixture(branch = "claude/150-prompt-objective-collision") {
    const dir = mkdtempSync(join(tmpdir(), "commit-identity-update-"));
    scratchDirs.push(dir);
    const git = (args: string[], identity: string, author: string = identity) => {
      const who = splitIdentity(identity);
      const by = splitIdentity(author);
      return execFileSync("git", args, {
        cwd: dir,
        encoding: "utf8",
        env: {
          ...process.env,
          GIT_COMMITTER_NAME: who.name,
          GIT_COMMITTER_EMAIL: who.email,
          GIT_AUTHOR_NAME: by.name,
          GIT_AUTHOR_EMAIL: by.email,
        },
      });
    };
    git(["init", "--quiet", "--initial-branch=main"], NEUTRAL);
    git(["config", "user.name", "Fixture"], NEUTRAL);
    git(["config", "user.email", "fixture@example.invalid"], NEUTRAL);
    git(["config", "commit.gpgsign", "false"], NEUTRAL);
    writeFileSync(join(dir, "base.txt"), "base\n");
    git(["add", "base.txt"], NEUTRAL);
    git(["commit", "--quiet", "-m", "base commit"], AGENT);
    const forkPoint = git(["rev-parse", "HEAD"], NEUTRAL).trim();

    git(["checkout", "--quiet", "-b", branch], NEUTRAL);
    writeFileSync(join(dir, "branch.txt"), "honest work\n");
    git(["add", "branch.txt"], NEUTRAL);
    git(["commit", "--quiet", "-m", "feat: honest work, honestly authored"], AGENT);

    git(["checkout", "--quiet", "main"], NEUTRAL);
    writeFileSync(join(dir, "main.txt"), "main moved\n");
    git(["add", "main.txt"], NEUTRAL);
    git(["commit", "--quiet", "-m", "chore: main moves"], AGENT);

    // The button: merge base into head, authored as the token's identity —
    // Johan — and committed by GitHub.
    git(["checkout", "--quiet", branch], NEUTRAL);
    git(
      ["merge", "--no-ff", "--quiet", "-m", `Merge branch 'main' into ${branch}`, "main"],
      GITHUB,
      FOUNDER,
    );

    return {
      dir,
      branch,
      forkPoint,
      verdict: () =>
        inspectRange({
          branch,
          commits: commitsFromGit(`${forkPoint}..${branch}`, { cwd: dir }),
          baseShas: shasReachableFrom("main", { cwd: dir }),
        }),
    };
  }

  it("is still REFUSED — the narrowed range does not release it", () => {
    // The merge commit is the branch's own: `main` has never seen it, so
    // subtracting the base leaves it exactly where it was, red.
    const verdict = updateBranchFixture().verdict();
    expect(verdict.offences).toHaveLength(1);
    expect(verdict.offences[0]?.subject).toMatch(/^Merge branch 'main' into claude\//);
    expect(verdict.offences[0]?.claimed).toContain("gace.johan3@gmail.com");
  });

  it("names the button and prescribes a rebase, not the generic re-author line", () => {
    const report = formatReport(updateBranchFixture().verdict());
    expect(report).toContain('"UPDATE BRANCH" BUTTON');
    expect(report).toContain("update-branch");
    expect(report).toContain("git rebase origin/main");
    expect(report).toContain("DO NOT re-author");
    expect(report).toContain("#958");
  });

  it("needs BOTH halves: a person's own `git merge main` is not the button", () => {
    // The subject shape alone is an ordinary local merge, which a human's own
    // identity sits on and which rule 1 judges on its own terms. Claiming the
    // button for it would send the reader after a button nobody pressed.
    expect(
      isUpdateBranchMerge({
        sha: "a".repeat(40),
        author: { name: "johan gace", email: "gace.johan3@gmail.com" },
        committer: { name: "johan gace", email: "gace.johan3@gmail.com" },
        message: "Merge branch 'main' into fix/582-premium",
      }),
    ).toBe(false);
    // And the committer alone is not it either: a squash merge is committed by
    // GitHub too, and its remedy is not a rebase.
    expect(
      isUpdateBranchMerge({
        sha: "b".repeat(40),
        author: { name: "johan gace", email: "gace.johan3@gmail.com" },
        committer: { name: "GitHub", email: "noreply@github.com" },
        message: "Improve the season shelf (#900)",
      }),
    ).toBe(false);
    expect(
      isUpdateBranchMerge({
        sha: "c".repeat(40),
        author: { name: "Johan", email: "45638957+johangace@users.noreply.github.com" },
        committer: { name: "GitHub", email: "noreply@github.com" },
        message: "Merge branch 'main' into claude/939-x",
      }),
    ).toBe(true);
  });

  it("keeps the generic remedy for the offences that actually want it", () => {
    // A range can carry both. The button block is additional, never a
    // replacement: a borrowed identity on an ordinary commit still needs the
    // re-author line, and Johan still needs his own route.
    const verdict = inspectRange({
      branch: "claude/958-mixed",
      commits: [
        {
          sha: "d".repeat(40),
          author: { name: "johan gace", email: "gace.johan3@gmail.com" },
          committer: { name: "GitHub", email: "noreply@github.com" },
          message: "Merge branch 'main' into claude/958-mixed",
        },
        {
          sha: "e".repeat(40),
          author: { name: "johan gace", email: "gace.johan3@gmail.com" },
          committer: { name: "rewyld-claude[bot]", email: "bot@example.invalid" },
          message: "feat: a borrowed identity an agent typed",
        },
      ],
    });
    expect(verdict.offences).toHaveLength(2);
    const report = formatReport(verdict);
    expect(report).toContain('"UPDATE BRANCH" BUTTON');
    expect(report).toContain("--author=");
    expect(report).toContain("IF JOHAN WROTE THESE");
  });
});

/**
 * The base is an INPUT, and the only one that can make this check judge LESS (#976).
 *
 * `--base-sha` names the set that gets subtracted. `partitionByBase` was already
 * careful about the set it BUILDS — a short SHA is dropped, because a prefix
 * guess that goes wrong drops a commit from the guard — and the value handed in
 * was not checked at all. Two of the three rows below used to switch the guard
 * off entirely, and the way they did it is the point: not red, not an error,
 * but `0 commit(s)` and a green exit, with a borrowed founder identity sitting
 * in the range.
 *
 * These drive `main()` the way `commit-identity.yml` does — `--branch`, a REST
 * payload on disk, `--base-sha` — because the defect is in the wiring between
 * the CLI and `git rev-list`, and `inspectRange` alone never sees it.
 *
 * The property under test is the DIRECTION OF FAILURE. A base this cannot trust
 * must subtract nothing, say why, and judge the whole range: over-inclusive and
 * loud, never silent and clean. That is what the unreadable-base path has always
 * done, and every row here is held to the same behaviour.
 */
describe("a `--base-sha` that is not a base (#976)", () => {
  interface BaseShaFixture {
    dir: string;
    branch: string;
    /** The REST payload on disk, as the workflow writes it. */
    payload: string;
    /** The real base: `main`, which the branch forked from. */
    base: string;
    /** The branch's own tip — a real 40-hex commit, and not a base. */
    head: string;
    /** The commit that must stay refused in every row. */
    borrowed: string;
  }

  function baseShaFixture(commits: FixtureCommit[]): BaseShaFixture {
    const fixture = repoWithBranch("claude/night-nature-class-976-base-sha", commits);
    const sha = (ref: string) =>
      execFileSync("git", ["rev-parse", ref], { cwd: fixture.dir, encoding: "utf8" }).trim();
    // The shape GitHub's `pulls/:n/commits` returns, which is what CI feeds in.
    const rows = commitsFromGit(fixture.range, { cwd: fixture.dir }).map((commit) => ({
      sha: commit.sha,
      commit: {
        author: commit.author,
        committer: commit.committer,
        message: commit.message,
      },
    }));
    const payload = join(fixture.dir, "pr-commits.json");
    writeFileSync(payload, JSON.stringify(rows, null, 2));
    return {
      dir: fixture.dir,
      branch: fixture.branch,
      payload,
      base: sha("main"),
      head: sha(fixture.branch),
      borrowed: rows[rows.length - 1]!.sha,
    };
  }

  /** Run the check exactly as the workflow's last step does, and keep the report. */
  function run(fixture: BaseShaFixture, baseSha: string): { code: number; output: string } {
    const lines: string[] = [];
    const capture = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const log = vi.spyOn(console, "log").mockImplementation(capture);
    const error = vi.spyOn(console, "error").mockImplementation(capture);
    try {
      const code = main(
        ["--branch", fixture.branch, "--commits-json", fixture.payload, "--base-sha", baseSha],
        { cwd: fixture.dir },
      );
      return { code, output: lines.join("\n") };
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  }

  let fixture: BaseShaFixture;
  beforeAll(() => {
    fixture = baseShaFixture([
      { author: FOUNDER, subject: "feat: the branch's own borrowed identity" },
    ]);
  });

  it("row 1 — the real base: the borrowed identity is REFUSED", () => {
    // The row that already worked, kept as the control. If this one ever goes
    // green the other two prove nothing.
    const { code, output } = run(fixture, fixture.base);
    expect(code).toBe(1);
    expect(output).toContain("REFUSED");
    expect(output).toContain(fixture.borrowed);
    expect(output).toContain("1 commit(s) on `claude/night-nature-class-976-base-sha`");
  });

  it("row 2 — the branch's own head: STILL refused, and it says why", () => {
    // 40 hex, a real commit, a real ancestor set — and it accounts for the
    // entire payload, so the subtraction left nothing to judge and the check
    // exited 0 on a borrowed identity. Nothing left to judge is a failed
    // subtraction, not a clean range.
    const { code, output } = run(fixture, fixture.head);
    expect(code).toBe(1);
    expect(output).toContain("REFUSED");
    expect(output).toContain(fixture.borrowed);
    expect(output).toContain("accounts for the WHOLE range");
    expect(output).toContain("#976");
  });

  it("row 3 — `--all`: STILL refused, and it never reaches git as an option", () => {
    // `git rev-list --all` walks every ref, so an option-shaped value subtracted
    // the whole payload. It is refused as an input now, and would be refused by
    // the `^{commit}` peel even if it got past that.
    const { code, output } = run(fixture, "--all");
    expect(code).toBe(1);
    expect(output).toContain("REFUSED");
    expect(output).toContain(fixture.borrowed);
    expect(output).toContain("not a commit SHA");
    expect(output).toContain("Judging the WHOLE range instead");
  });

  it("a branch name is not a base either, and is treated the same way", () => {
    // `main` here really would resolve, and really would subtract the right
    // set. It is still refused: the value CI passes is always a full SHA, so a
    // ref arriving means something other than the workflow sent it, and a check
    // that guesses at what a caller meant cannot say what it subtracted.
    const { code, output } = run(fixture, "main");
    expect(code).toBe(1);
    expect(output).toContain("REFUSED");
    expect(output).toContain(fixture.borrowed);
    expect(output).toContain("not a commit SHA");
  });

  it("stays quiet on the honest branch, so the noise is earned and not constant", () => {
    // The mirror case. A guard that shouts on every run is a guard nobody
    // reads: a well-formed base, on a correctly authored branch, is silent
    // about the base and green.
    const honest = baseShaFixture([
      { author: AGENT, subject: "feat: honest work, honestly authored" },
    ]);
    const { code, output } = run(honest, honest.base);
    expect(code).toBe(0);
    expect(output).toContain("no commit claims a founder identity it is not entitled to.");
    expect(output).not.toContain("WHOLE range");
  });

  it("holds the validator to the same full-SHA shape `partitionByBase` requires", () => {
    expect(assertBaseSha("a".repeat(40))).toBe("a".repeat(40));
    expect(assertBaseSha(`  ${"A".repeat(40)}  `)).toBe("A".repeat(40));
    for (const bad of ["", "  ", "main", "origin/main", "HEAD~3", "--all", "-n1", "a".repeat(39), "a".repeat(41), "z".repeat(40), null, undefined]) {
      expect(() => assertBaseSha(bad)).toThrow(/not a commit SHA/);
    }
  });

  it("peels the ref, so an option-shaped one cannot be read as an option by git", () => {
    // Real git, but with its stderr captured rather than inherited: the two
    // refusals below make it print its usage, and a passing suite should not
    // leave a wall of `rev-list` help in the log.
    const git = (args: string[], options: { cwd?: string } = {}) =>
      execFileSync("git", args, {
        cwd: options.cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

    // The second belt, held directly: `shasReachableFrom` is exported, and a
    // future caller that skips the validator must still not be able to turn
    // `--all` into a `rev-list` option.
    expect(() => shasReachableFrom("--all", { cwd: fixture.dir, git })).toThrow();
    expect(() => shasReachableFrom("--not-a-ref", { cwd: fixture.dir, git })).toThrow();
    // ...and no legitimate ref changed meaning: a name and a SHA both still
    // resolve to the same set they always did.
    const byName = shasReachableFrom("main", { cwd: fixture.dir, git });
    expect(byName).toContain(fixture.base);
    expect(byName).not.toContain(fixture.borrowed);
    expect(shasReachableFrom(fixture.base, { cwd: fixture.dir, git })).toEqual(byName);
  });
});

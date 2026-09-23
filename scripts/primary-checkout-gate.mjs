#!/usr/bin/env node
/**
 * Whose TREE a commit is being made in (#1022).
 *
 * NOT `scripts/commit-identity-check.mjs`. That one answers "whose NAME is on
 * this commit" and runs on a range in CI. This one answers "whose WORKING TREE
 * is this commit being written from", it runs at `pre-commit` on one machine,
 * and it is the only one of the two that can still stop the thing happening.
 *
 * WHY THIS EXISTS
 *
 * An agent told to create a worktree off `origin/main` and work only there
 * instead switched the branch of the shared primary checkout from
 * `feat/984-species-gallery` to a new `fix/contextual-species-strip`, committed
 * `c94a334` in it and pushed — while Johan had 13 modified files and 9
 * untracked entries of live landing-page work sitting in that same tree.
 * Nothing was lost, and nothing was lost only because the agent's files and
 * Johan's happened not to overlap. That is luck, not a safeguard.
 *
 * `c94a334` is not an anomaly. The primary checkout keeps its own reflog
 * (`.git/logs/HEAD` is per-worktree), so commits made *in that tree* can be
 * counted exactly: of the last 11, 8 were `rewyld-claude[bot]`'s, across at
 * least four branches over three days. The convention has been violated at
 * roughly a 73% rate for as long as there has been a convention, because an
 * instruction is not an enforcement.
 *
 * THE RULE
 *
 *   An agent commits from a LINKED WORKTREE, never from the shared primary
 *   checkout.
 *
 * This blocks nothing legitimate work needs. The correct path already exists,
 * agents already have `.claude/worktrees/`, and it is already the majority
 * path. The migration cost is zero: nothing in the history needs repairing to
 * make this green, because it constrains only future commits.
 *
 * ---------------------------------------------------------------------------
 * THE DISCRIMINATOR, AND THE TRAP THE OBVIOUS ONE FALLS INTO
 * ---------------------------------------------------------------------------
 *
 * "Primary checkout" is exactly detectable, no heuristics: in a linked worktree
 * `--git-dir` is `<common>/worktrees/<name>` and `--git-common-dir` is the
 * repository's `.git`, so the two differ. In the primary checkout they are the
 * same path.
 *
 * That test alone is NOT the gate, and shipping it as the gate would have been
 * an outage. **In a plain `git clone` those two paths are also equal.** Every
 * cloud session, every CI runner and every fresh machine checks this
 * repository out as exactly that — one clone, one working tree, no worktrees —
 * so a gate keyed on `git-dir == git-common-dir` alone refuses every agent
 * commit in every environment that is not Johan's laptop. It would have broken
 * the sessions that do this repository's work on the night it landed, which is
 * a strictly worse failure than the one it prevents.
 *
 * So the second half of the discriminator is **"does this checkout have at
 * least one linked worktree registered"**:
 *
 *   - A primary checkout with linked worktrees is a SHARED tree. Something has
 *     branched off it; it has an owner and a life of its own; the reflog and
 *     the uncommitted work in it belong to whoever that is. This is Johan's
 *     checkout, and it is also — correctly — an agent's own clone once that
 *     agent has made itself a worktree, which is the same hazard wearing a
 *     different hostname.
 *   - A clone with exactly one working tree is nobody's shared tree. There is
 *     no second party whose work could be endangered, because there is no
 *     second tree. Committing in it is the only thing you can do.
 *
 * It is the narrowest signal that separates the two, it needs no configuration
 * to start working, and it is derived from git rather than from a machine.
 *
 * Rejected alternatives, so they are not re-proposed:
 *
 *   - MATCH THE PATH (`/Users/johangace/code/nature-class`). Encodes one
 *     person's laptop into the repository, protects nobody else's checkout, and
 *     silently stops meaning anything the day a directory is renamed.
 *   - REQUIRE AN OPT-IN MARKER (a `git config nature-class.sharedCheckout`).
 *     Zero false positives and honest, but it protects nothing until somebody
 *     remembers to run it — and "remembering" is the failure mode this ticket
 *     exists to remove. It stays available as a later addition; it is not a
 *     substitute for a signal that works tonight.
 *   - REFUSE IF THE TREE IS DIRTY. A heuristic, not a rule. It would permit the
 *     exact same commit on a day Johan's tree happened to be clean, and teach
 *     agents that the primary checkout is theirs when nobody is looking.
 *
 * What the chosen signal gives up, said out loud: a shared checkout whose
 * worktrees have all been removed reads as a standalone clone and is not
 * gated. That is the honest cost of not gating clones, and it is the right way
 * round — a gate that is silent when it should speak loses one commit, a gate
 * that speaks when it should be silent loses every session.
 *
 * IT REFUSES; IT NEVER TIDIES. No auto-stash, no auto-commit, no cleanup of the
 * shared tree on anyone's behalf. Every incident in this class so far was made
 * worse by something helpfully moving uncommitted work (#988 is the sibling:
 * `git stash` is repo-global across worktrees). The staged index, the working
 * tree and the branch are exactly as they were when this refuses.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * The escape hatch. A refusal with no exit is its own outage: the first time
 * this is wrong at 2am, the alternative to a documented, loud bypass is
 * `--no-verify` on everything forever, and then the hook protects nothing.
 *
 * It is loud on purpose — it prints what it let through, so a bypass leaves a
 * trace in the terminal that produced it rather than passing silently.
 */
export const ESCAPE_HATCH = "NATURE_CLASS_ALLOW_PRIMARY_COMMIT";

/**
 * Identities that belong to an automated worker.
 *
 * Emails, not names, for the reason `commit-identity-check.mjs` gives: a name
 * is free text, the email is what git keys an identity on and what the CLA
 * allowlist resolves.
 *
 * The `[bot]@` pattern is the general shape rather than a list of one. Every
 * GitHub App identity is `<id>+<app>[bot]@users.noreply.github.com`, so a new
 * worker is covered the day it appears instead of the day someone remembers to
 * add it here. Humans cannot hold an address of that shape, so widening to it
 * cannot catch one.
 */
export const AGENT_EMAIL_PATTERNS = [
  /\[bot\]@/i,
  /^noreply@anthropic\.com$/i,
  /^noreply@openai\.com$/i,
];

/** Is this email an automated worker's? */
export function isAgentIdentity(email) {
  const value = String(email ?? "").trim();
  if (!value) return false;
  return AGENT_EMAIL_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Pull the email out of a git ident line: `Name <email> 1757000000 +0200`.
 * Returns null for anything that is not one, so an unreadable identity is
 * "unknown" rather than a wrong answer.
 */
export function parseIdent(line) {
  const match = /^(.*?)\s*<([^>]*)>/.exec(String(line ?? "").trim());
  if (!match) return null;
  return { name: match[1] ?? "", email: match[2] ?? "" };
}

/**
 * How many working trees this repository has, from `git worktree list
 * --porcelain`. The primary checkout is always the first entry, so
 * `count - 1` is the number of LINKED worktrees.
 *
 * Prunable (stale) entries are counted deliberately. A stale admin directory
 * still says this tree has been used as a shared base, and the cost of being
 * wrong in that direction is one refusal with a documented way past it.
 */
export function countWorktrees(porcelain) {
  return String(porcelain ?? "")
    .split("\n")
    .filter((line) => /^worktree /.test(line)).length;
}

/** Trailing-slash- and symlink-insensitive path comparison. */
function canonical(path) {
  const trimmed = String(path ?? "").replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    return realpathSync(trimmed);
  } catch {
    return trimmed;
  }
}

// ---------------------------------------------------------------------------
// The judgement
// ---------------------------------------------------------------------------

/**
 * The whole decision, as a pure function of facts. Nothing here reads git, the
 * filesystem or the environment — which is what lets the five cases in
 * `tests/unit/primary-checkout-gate.spec.ts` be asserted directly as well as
 * end to end through a real hook.
 *
 * Order is load-bearing. The escape hatch is consulted LAST so that "bypassed"
 * means it actually changed the outcome; asking first would warn about a
 * bypass on every commit in every clone.
 *
 * @param {import("./primary-checkout-gate.d.mts").Facts} facts
 */
export function decide(facts) {
  if (!isAgentIdentity(facts.authorEmail) && !isAgentIdentity(facts.committerEmail)) {
    return { refuse: false, bypassed: false, reason: "identity is not an automated worker's" };
  }
  if (!facts.primary) {
    return { refuse: false, bypassed: false, reason: "committing from a linked worktree" };
  }
  if (facts.linkedWorktrees < 1) {
    return {
      refuse: false,
      bypassed: false,
      reason: "standalone clone: no linked worktree is registered on this checkout",
    };
  }
  if (facts.bypass) {
    return {
      refuse: false,
      bypassed: true,
      reason: `${ESCAPE_HATCH} is set`,
    };
  }
  return {
    refuse: true,
    bypassed: false,
    reason: "an automated worker is committing in the shared primary checkout",
  };
}

/** What the refusal says. The command it names is the whole point of it. */
export function formatRefusal(facts) {
  const identity = facts.committerEmail || facts.authorEmail || "(unreadable)";
  return [
    "REFUSED: this is the shared primary checkout, and it is not an agent's to commit in.",
    "",
    `  tree              ${facts.toplevel || facts.gitDir}`,
    `  identity          ${identity}`,
    `  linked worktrees  ${facts.linkedWorktrees} registered on this checkout`,
    "",
    "  This checkout has worktrees branched off it, which makes it somebody's shared",
    "  tree rather than yours. It holds uncommitted work that is not yours, `git switch`",
    "  here moves the branch under whoever is using it, and git tells you neither of",
    "  those things until after you have done them. `c94a334` committed onto a branch",
    "  this tree had just been switched to while 13 modified files of live work sat in",
    "  it. It survived on luck, and it was 1 of 8 (#1022).",
    "",
    "  Work from a linked worktree — the path that already exists and that most agent",
    "  sessions already take:",
    "",
    "    git worktree add -b <branch> <path> origin/main",
    "",
    "  e.g. `git worktree add -b fix/1022-thing .claude/worktrees/fix-1022-thing origin/main`,",
    "  then `cd` into it and commit there.",
    "",
    "  NOTHING HAS BEEN MOVED. Your staged index, your working tree and this tree's",
    "  branch are exactly as they were a moment ago. This hook refuses and explains; it",
    "  never stashes, commits or tidies on your behalf, because every incident in this",
    "  class so far was made worse by something helpfully moving uncommitted work.",
    "",
    "  To carry staged work across, copy it — do NOT `git stash`, whose stack is shared",
    "  across every worktree in this repository (#988):",
    "",
    "    git diff --cached > /tmp/carry.patch    # then `git apply` it in the worktree",
    "",
    `  GENUINE EMERGENCY ONLY: \`${ESCAPE_HATCH}=1 git commit …\` lets one commit`,
    "  through and says so on stderr. If you use it, say why in the commit message.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Reading the facts
// ---------------------------------------------------------------------------

const gitRunner = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Run git, or return null when the question has no answer here. */
function ask(git, args, cwd) {
  try {
    return String(git(args, cwd) ?? "").trim();
  } catch {
    return null;
  }
}

/**
 * @returns {import("./primary-checkout-gate.d.mts").Facts}
 */
export function gather({ cwd = process.cwd(), git = gitRunner, env = process.env } = {}) {
  const gitDir = ask(git, ["rev-parse", "--absolute-git-dir"], cwd);
  // `--path-format=absolute` needs git >= 2.31. On anything older this returns
  // null and we fall back to the plain form, which git resolves relative to the
  // top of the working tree; `canonical` makes the two comparable either way.
  const commonDir =
    ask(git, ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd) ??
    ask(git, ["rev-parse", "--git-common-dir"], cwd);
  const toplevel = ask(git, ["rev-parse", "--show-toplevel"], cwd);

  // `git var` is the identity git ITSELF will stamp on the commit: it reads the
  // GIT_*_IDENT/GIT_*_EMAIL environment (which `.claude/settings.json` sets for
  // every session in this repository) and then the config, in git's own order.
  // Reading only the environment would miss an agent whose identity comes from
  // `git config user.email`, and reading only the config would miss every one
  // of ours. What it cannot see is a `--author=` typed on the command line;
  // that sets the author alone, and the committer half still answers here.
  const author = parseIdent(ask(git, ["var", "GIT_AUTHOR_IDENT"], cwd));
  const committer = parseIdent(ask(git, ["var", "GIT_COMMITTER_IDENT"], cwd));

  const worktrees = ask(git, ["worktree", "list", "--porcelain"], cwd);

  return {
    gitDir: gitDir ?? "",
    commonDir: commonDir ?? "",
    toplevel: toplevel ?? "",
    primary: Boolean(gitDir) && canonical(gitDir) === canonical(commonDir),
    linkedWorktrees: Math.max(0, countWorktrees(worktrees) - 1),
    authorEmail: author?.email ?? "",
    committerEmail: committer?.email ?? "",
    bypass: Boolean(env[ESCAPE_HATCH]),
  };
}

export function main({ cwd, git, env = process.env, err = console.error } = {}) {
  const facts = gather({ cwd, git, env });
  const verdict = decide(facts);

  if (verdict.bypassed) {
    err(
      `primary-checkout-gate: ${ESCAPE_HATCH} is set — committing in the shared primary ` +
        `checkout anyway (#1022). Say why in the commit message.`
    );
    return 0;
  }
  if (!verdict.refuse) return 0;

  err(formatRefusal(facts));
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    /*
     * FAIL OPEN, LOUDLY. This runs on every commit in this repository. A gate
     * that cannot read its own facts cannot honestly refuse, and one that
     * crashes blocks every commit on the machine — a strictly worse outage than
     * the one it exists to prevent, and the fastest possible route to everyone
     * running `--no-verify` by habit.
     */
    console.error(`primary-checkout-gate could not run, allowing the commit: ${error.message}`);
    process.exitCode = 0;
  }
}

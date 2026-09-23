#!/usr/bin/env node
/**
 * Whether the identity git is about to stamp will pass `cla` (#1279).
 *
 * The third member of a family, and the three answer different questions:
 *
 *   `primary-checkout-gate.mjs`  whose TREE is this commit written from?
 *                                pre-commit, one machine.
 *   `commit-identity-check.mjs`  does this commit BORROW THE FOUNDER'S name?
 *                                pre-push and CI, over a range.
 *   this file                    will the name it does carry be ACCEPTED?
 *                                pre-commit, one machine.
 *
 * WHY THIS EXISTS
 *
 * A cloud worker that never sets a git identity commits as its container
 * default, `Claude <noreply@anthropic.com>`. GitHub resolves that address to
 * the user `claude`, which is not on `.github/workflows/cla.yml`'s allowlist,
 * so `cla` goes red — and a worker reading a licence agreement in a CI failure
 * takes it for a legal gate rather than for its own misconfiguration.
 *
 * That has now happened four times: #622, #831, #1278, and PR #1299 on
 * 2026-09-22, which opened at 12:56Z, went red at 12:57Z, was re-authored to
 * `rewyld-claude[bot]` and went green at 13:09Z. Every one of them cost a whole
 * branch of work and a CI cycle before anything said the identity was wrong.
 *
 * `scripts/commit-identity-check.mjs` has carried the remedy in its own header
 * the whole time, and `wyldway-office` carries the rule ("derive the worker git
 * identity at session start, or refuse to commit"). The instruction existed on
 * all four occasions. This is the same shape as #1022: an instruction is not an
 * enforcement.
 *
 * THE CONFIGURATION THAT ALREADY EXISTS, AND THE SESSION IT DOES NOT REACH
 *
 * `.claude/settings.json` in this repository exports the right identity for
 * every session whose project root is this repository, which is why a laptop
 * session never hits this. A cloud session that mounts eleven repositories side
 * by side and runs from their parent directory never loads it, and there is
 * nothing in that container to notice. So the fix cannot be more configuration
 * in a file that is read by the sessions that already behave; it has to be a
 * refusal in the path every commit takes.
 *
 * THE RULE
 *
 *   An automated worker commits under an identity `cla` already accepts, or it
 *   does not commit.
 *
 * ---------------------------------------------------------------------------
 * THE ALLOWLIST IS READ, NOT COPIED — AND READ FROM THE BRANCH THAT DECIDES
 * ---------------------------------------------------------------------------
 *
 * `cla.yml`'s `allowlist:` is the authority on who may contribute, and a second
 * copy of it here would be a second answer that drifts. So this parses that
 * file rather than restating it.
 *
 * WHICH COPY OF IT, THOUGH. `cla.yml` runs on `pull_request_target`, and that
 * event deliberately evaluates the workflow from the BASE branch — a pull
 * request cannot change the workflow that judges it, which is the whole reason
 * the event exists. So the list that will actually decide is `origin/main`'s,
 * not this worktree's, and reading the worktree copy gets it wrong in both
 * directions (found in review, #1305):
 *
 *   - a worker that adds its own login to `cla.yml` on its branch would be
 *     ALLOWED here and still refused by the check, which is this ticket's own
 *     failure wearing a new hat — and the refusal below actively invites that
 *     edit, so it is a hole this file would have dug for its own readers;
 *   - a branch that REMOVES an identity would be refused here while the check
 *     still accepts it.
 *
 * So the allowlist comes from `git show origin/main:.github/workflows/cla.yml`.
 *
 * THERE IS NO SAFE FALLBACK, AND TWO REVIEW ROUNDS WERE SPENT LEARNING IT.
 * The first version read the worktree copy whenever `origin/main` was
 * unreadable, reasoning that such a tree could not open a pull request.
 * `git clone --single-branch --branch <feature>` refutes that: it has no
 * `origin/main` and CAN push, which `scripts/merge-pr.mjs`'s `fetchMainRef`
 * already existed for, measured in a real `--depth 1 --single-branch` clone.
 * The second version kept the fallback for a repository with no REMOTE,
 * reasoning that such a tree could not reach a pull request either. That is
 * the same mistake one level up: `git push <url> HEAD:<branch>` takes a URL
 * where a remote name goes, so a `git init` checkout can allowlist itself
 * locally, pass here, and push to a pull request whose `pull_request_target`
 * check uses the unchanged base list (both found in review, #1305).
 *
 * Every such proxy answers "can this commit reach a pull request?", and git
 * offers no honest answer to it. The question this gate can actually answer is
 * narrower and is the only one it asks now:
 *
 *   CAN I READ THE LIST THAT WILL DECIDE? If yes, judge against it. If no, say
 *   so and let the commit through.
 *
 * So the worktree copy is never read, and a missing base ref is `unread` in
 * every shape. Failing open loses the early WARNING; reading a branch's own
 * copy would lose the CHECK, silently. That asymmetry is what decides it, and
 * it is the whole justification — no proxy underneath.
 *
 * AND THE REF IS FOUND BY URL, NOT BY THE NAME `origin`. A remote may be
 * called anything (`git remote rename`), and an `origin` that points at a FORK
 * has a `main` of its own that the fork controls — which `pull_request_target`
 * will not consult and this gate must not either. So the base is read from a
 * remote whose URL names `BASE_REPOSITORY` below, and a checkout with no such
 * remote is `unread` rather than judged against somebody else's list.
 *
 * Which ref answered is carried on the facts and printed in the refusal,
 * because a reader told they are not allowed deserves to know which list said
 * so.
 *
 * It remains a local PREDICTION of a remote check: `origin/main` is only as
 * fresh as the last fetch. That is the honest limit of doing this at
 * pre-commit, and it is still four CI cycles better than the alternative.
 *
 * The allowlist names GitHub LOGINS and a commit carries an EMAIL, so the two
 * have to be joined. Most of it is derivable rather than mapped: every GitHub
 * App and every user with a private address commits as
 * `<id>+<login>@users.noreply.github.com`, and the login is right there in the
 * local part. What is not derivable is exactly two provider addresses, and they
 * are listed as the exception they are rather than as the start of a table:
 *
 *   noreply@anthropic.com -> claude    (NOT on the allowlist — this is the bug)
 *   noreply@openai.com    -> codex     (on the allowlist, by #806)
 *
 * An agent address that resolves to neither is REFUSED rather than allowed.
 * That is the nc#535 direction — unknown is not a pass — and it is the right
 * way round here for a reason particular to this gate: an unmappable agent
 * address is precisely an address the CLA check has never been told about, so
 * letting it through does not avoid a refusal, it only moves the refusal into
 * CI where it costs a cycle. The escape hatch below is the answer for a
 * legitimate new worker, and using it is how a new identity gets noticed and
 * added to `cla.yml` rather than quietly accumulating.
 *
 * WHY IDENTITY AND NOT BRANCH NAME. #1279 suggests refusing "the container
 * default on a `claude/` branch". Branch prefix is the right discriminator for
 * `commit-identity-check.mjs`, whose question is whether a HUMAN is entitled to
 * the name on a commit and which must never refuse Johan on his own branch.
 * Here the subject is the identity itself: `Claude <noreply@anthropic.com>` is
 * red on `fix/…` exactly as it is on `claude/…`, and a human's address is not
 * an agent identity on any branch, so keying on the identity is both stricter
 * and narrower. Johan's own commits never reach the first branch of `decide`.
 *
 * WHAT IT DOES NOT COVER, said plainly. A tree whose `core.hooksPath` was never
 * pointed at `.githooks` runs no hook at all, so a worker that never ran
 * `npm ci` is still unprotected — the same limit `primary-checkout-gate.mjs`
 * has, and the reason #1279's done-condition also talks about session start.
 * Closing that means something outside this repository handing every container
 * an identity, which is `wyldway-office`'s ground and not this file's.
 *
 * IT REFUSES; IT NEVER SETS. No `git config` is written on anyone's behalf. An
 * identity written for you is an identity you did not choose, and this family
 * of scripts exists because provenance is load-bearing here. The refusal prints
 * the two commands instead.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isAgentIdentity, parseIdent } from "./primary-checkout-gate.mjs";

/**
 * The escape hatch, loud on purpose, and the same bargain its sibling makes: a
 * refusal with no exit becomes `--no-verify` on everything forever, and then
 * nothing is gated at all.
 */
export const ESCAPE_HATCH = "NATURE_CLASS_ALLOW_UNKNOWN_IDENTITY";

/** The identity to use here, printed by the refusal so nobody has to look. */
export const CANONICAL_CLAUDE_IDENTITY = {
  name: "rewyld-claude[bot]",
  email: "299630839+rewyld-claude[bot]@users.noreply.github.com",
};

/** The authority's path inside the repository, for `git show <rev>:<path>`. */
export const CLA_WORKFLOW_PATH = ".github/workflows/cla.yml";

/**
 * The same file on disk, resolved relative to THIS script rather than to the
 * working directory. NOT read by the gate — see the header for why a branch's
 * own copy is never trusted — and exported only so a test can hold the gate's
 * premise against the real workflow.
 */
export const CLA_WORKFLOW = fileURLToPath(
  new URL(`../${CLA_WORKFLOW_PATH}`, import.meta.url)
);

/** The branch `cla.yml` targets, and so the one whose copy of it decides. */
export const BASE_BRANCH = "main";

/**
 * The repository whose `cla.yml` runs. A remote is the base only if its URL
 * names this; a fork's `main` is the fork's, and `pull_request_target` will
 * never consult it. Hardcoded deliberately — this is that repository's own
 * tool — and a rename makes every checkout read `unread`, which is loud and is
 * the safe direction.
 */
export const BASE_REPOSITORY = "johangace/nature-class";

/**
 * The two agent addresses that are not `users.noreply.github.com` and so carry
 * no login to derive. Deliberately not a growing table: anything else is
 * unknown and says so.
 */
export const PROVIDER_LOGINS = new Map([
  ["noreply@anthropic.com", "claude"],
  ["noreply@openai.com", "codex"],
]);

/**
 * The logins on `cla.yml`'s `allowlist:`, lowercased.
 *
 * Matched on the key rather than on the whole line so indentation, quoting and
 * a trailing comment cannot change the answer. Returns an empty list when the
 * key is absent, which `decide` treats as "could not read" rather than as "no
 * one is allowed" — an empty allowlist would refuse every worker in the fleet,
 * and this gate must never be the thing that stops all work.
 */
export function parseAllowlist(yaml) {
  const match = /^[ \t]*allowlist:[ \t]*(.*)$/m.exec(String(yaml ?? ""));
  if (!match) return [];
  return String(match[1])
    .replace(/#.*$/, "")
    // Trim BEFORE unquoting: a quoted value followed by a comment leaves a
    // trailing space between the closing quote and the end of the string, and
    // an end-anchored strip then matches nothing and keeps the quote.
    .trim()
    .replace(/^["']|["']$/g, "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * The GitHub login a commit address resolves to, or null when it carries none.
 *
 * `<id>+<login>@users.noreply.github.com` and the older
 * `<login>@users.noreply.github.com` both give the login directly; the two
 * provider addresses above are mapped; everything else is null.
 */
export function loginForEmail(email) {
  const value = String(email ?? "").trim().toLowerCase();
  if (!value) return null;
  const noreply = /^(?:\d+\+)?([^@+]+)@users\.noreply\.github\.com$/.exec(value);
  if (noreply) return noreply[1];
  return PROVIDER_LOGINS.get(value) ?? null;
}

// ---------------------------------------------------------------------------
// The judgement
// ---------------------------------------------------------------------------

/**
 * A pure function of facts, like its sibling's, so the cases can be asserted
 * directly as well as end to end through the real hook.
 *
 * Order is load-bearing in the same way: the escape hatch is consulted LAST, so
 * "bypassed" means it actually changed the outcome rather than that it happened
 * to be set on a commit nothing would have stopped.
 *
 * @param {import("./cla-identity-gate.d.mts").Facts} facts
 */
export function decide(facts) {
  const halves = [
    { role: "author", email: facts.authorEmail },
    { role: "committer", email: facts.committerEmail },
  ].filter((half) => isAgentIdentity(half.email));

  if (halves.length === 0) {
    return { refuse: false, bypassed: false, offender: null, reason: "identity is not an automated worker's" };
  }
  if (facts.allowlist.length === 0) {
    return {
      refuse: false,
      bypassed: false,
      // Blind, not clear. An agent is committing and the list that decides
      // could not be read, so this is the one pass worth saying out loud — and
      // only here, where it would have mattered, rather than on every commit
      // in every repository that has no agent anywhere near it.
      warn: true,
      offender: null,
      reason: "cla.yml's allowlist could not be read; this gate does not guess at it",
    };
  }

  // BOTH HALVES, because they are set by different things and can disagree.
  // `git config user.email` sets the pair, but `git commit --author=` sets only
  // the first, and the CLA check reads the commit rather than the config. A
  // commit authored by the bot and committed by the container default is the
  // exact state a half-done repair leaves behind.
  const offender = halves.find((half) => {
    const login = loginForEmail(half.email);
    return login === null || !facts.allowlist.includes(login);
  });

  if (!offender) {
    return { refuse: false, bypassed: false, offender: null, reason: "identity is on cla.yml's allowlist" };
  }
  if (facts.bypass) {
    return { refuse: false, bypassed: true, offender, reason: `${ESCAPE_HATCH} is set` };
  }
  return {
    refuse: true,
    bypassed: false,
    offender,
    reason: `the ${offender.role} identity is not one cla.yml accepts`,
  };
}

/** What the refusal says. The two commands in it are the whole point. */
export function formatRefusal(facts, verdict) {
  const offender = verdict.offender ?? { role: "author", email: facts.authorEmail };
  const login = loginForEmail(offender.email);
  return [
    "REFUSED: this identity will fail the `cla` check, and it will fail it after you have",
    "written the whole branch.",
    "",
    `  ${offender.role.padEnd(18)} ${offender.email || "(unreadable)"}`,
    `  ${"GitHub reads it as".padEnd(18)} ${login ?? "no account this gate can name"}`,
    `  ${"cla.yml allows".padEnd(18)} ${facts.allowlist.join(", ")}`,
    `  ${"read from".padEnd(18)} ${facts.allowlistSource}`,
    "",
    // The diagnosis is only true of a provider's default address, so it is only
    // printed for one. Telling a worker with some other identity that it "never
    // set" one would be a confident wrong answer, and a refusal that is wrong
    // about why is how a gate stops being read.
    ...(PROVIDER_LOGINS.has(String(offender.email).trim().toLowerCase())
      ? [
          "  This is not a licensing problem and it is not Johan's to clear. It is this",
          "  container's default git identity, which no session ever set. `.claude/settings.json`",
          "  exports the right one for a session whose project root is this repository; a cloud",
          "  session running from a parent directory of several repositories never loads it.",
        ]
      : [
          "  This is not a licensing problem and it is not Johan's to clear. It is simply an",
          "  identity the CLA check has never been told about, and a commit carrying it will",
          "  be refused after the branch is written rather than now.",
        ]),
    "",
    "  Set the identity this repository's workers already use — every recently merged",
    "  Claude pull request here carries it — and commit again:",
    "",
    `    git config user.name  '${CANONICAL_CLAUDE_IDENTITY.name}'`,
    `    git config user.email '${CANONICAL_CLAUDE_IDENTITY.email}'`,
    "",
    "  Commits you have already made keep the old identity; re-author them before",
    "  pushing, or `cla` will refuse the branch for those instead:",
    "",
    "    git rebase -i <base> --exec 'git commit --amend --no-edit --reset-author'",
    "",
    "  If you are Codex, `Codex <noreply@openai.com>` is on the allowlist and needs no",
    "  change. If you are a NEW worker with a legitimate identity that is not listed,",
    `  \`${ESCAPE_HATCH}=1 git commit …\` lets it through and says so.`,
    "",
    `  ADDING YOURSELF TO \`${CLA_WORKFLOW_PATH}\` ON THIS BRANCH WILL NOT HELP YET.`,
    "  That workflow runs on `pull_request_target`, which evaluates it from the BASE",
    `  branch, so \`cla\` keeps using ${BASE_BRANCH}'s copy until your change is merged —`,
    `  and so does this gate, which read ${facts.allowlistSource} rather than your worktree.`,
    "  Land the allowlist change first, or use the hatch above in the meantime.",
    "",
    "  NOTHING HAS BEEN CHANGED. No `git config` was written for you: an identity you",
    "  did not choose is the provenance failure #834 exists to prevent.",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Reading the facts
// ---------------------------------------------------------------------------

const gitRunner = (args, cwd) =>
  execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

function ask(git, args, cwd) {
  try {
    return String(git(args, cwd) ?? "").trim();
  } catch {
    return null;
  }
}

/**
 * @returns {import("./cla-identity-gate.d.mts").Facts}
 */
/**
 * The allowlist text and where it came from.
 *
 * `origin/main` first, because that is the revision `pull_request_target`
 * evaluates; the worktree file when that ref is not there to read. A tree with
 * neither is `unread`, which `decide` treats as "could not read the authority"
 * rather than as "nobody is allowed".
 */
/**
 * The hosts a GitHub remote is written against. `ssh.github.com` is GitHub's
 * own alternate SSH host for port 443 and is as canonical as `github.com`;
 * anything else — a GitLab mirror, a `file://` copy, somebody's cache — is a
 * different repository that merely shares a path, and its `main` is not what
 * `pull_request_target` reads (found in review, #1305).
 */
export const BASE_HOSTS = new Set(["github.com", "ssh.github.com"]);

/**
 * A remote URL as `{ host, path }`, or null when it is not one this recognises.
 *
 * THE SUFFIX MATCH THIS REPLACED WAS WRONG, and wrong in the direction that
 * matters: `https://gitlab.com/johangace/nature-class.git` and
 * `file:///tmp/johangace/nature-class.git` both ended in the base repository's
 * owner and name, so both were read as the base and either could have cleared
 * an identity CI rejects. Owner/name is not an identity without a host.
 *
 * Two shapes, because git has two. A scheme URL carries optional userinfo and
 * an optional port, both of which are stripped; the scp-like `git@host:path`
 * has no scheme and no `//`, which is exactly how it is told apart from one.
 */
export function parseRemoteUrl(url) {
  const value = String(url ?? "").trim();
  if (!value) return null;

  const scheme = /^([a-z][a-z0-9+.-]*):\/\/(.*)$/i.exec(value);
  let authority;
  let path;
  if (scheme) {
    const rest = scheme[2] ?? "";
    const slash = rest.indexOf("/");
    authority = slash === -1 ? rest : rest.slice(0, slash);
    path = slash === -1 ? "" : rest.slice(slash + 1);
  } else {
    // `[user@]host:path`, and NOT a Windows drive letter or a bare path.
    const scp = /^(?:[^@/]+@)?([^/:]+):(.+)$/.exec(value);
    if (!scp) return null;
    authority = scp[1] ?? "";
    path = scp[2] ?? "";
  }

  const host = authority.replace(/^[^@]*@/, "").replace(/:\d+$/, "").toLowerCase();
  const normalised = path
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  if (!host || !normalised) return null;
  return { host, path: normalised };
}

/** Does this remote URL name the repository whose `cla.yml` decides? */
export function namesBaseRepository(url) {
  const parsed = parseRemoteUrl(url);
  if (!parsed) return false;
  return BASE_HOSTS.has(parsed.host) && parsed.path === BASE_REPOSITORY.toLowerCase();
}

/**
 * The remotes that are the base repository, `origin` first because it is the
 * overwhelmingly common name and trying it first keeps the usual case to one
 * `git show`.
 *
 * ONLY THE FETCH URL DECIDES. `git remote -v` prints two rows per remote, and
 * a remote may fetch from one repository and push to another
 * (`git remote set-url --push`). `<remote>/main` is populated by the FETCH
 * url, so accepting a matching `(push)` row would read a fork's list under the
 * base's name — reproduced with `origin <fork> (fetch)` beside
 * `origin <base> (push)` (found in review, #1305).
 *
 * Split on the TAB git prints rather than on whitespace: a remote name is
 * freer than it looks, and the tab is the field separator git actually uses.
 */
export function baseRemotes({ cwd = process.cwd(), git = gitRunner } = {}) {
  const listed = ask(git, ["remote", "-v"], cwd);
  if (!listed) return [];
  const names = [];
  for (const line of listed.split("\n")) {
    const row = /^([^\t]+)\t(.*) \((fetch|push)\)$/.exec(line.replace(/\r$/, ""));
    if (!row || row[3] !== "fetch") continue;
    const [, name, url] = row;
    if (namesBaseRepository(url) && !names.includes(name)) names.push(name);
  }
  return names.sort((a, b) => (a === "origin" ? -1 : b === "origin" ? 1 : 0));
}

/**
 * A string safe to paste into a shell.
 *
 * Git accepts remote names beginning with `-` and containing shell
 * metacharacters — `git remote add -- -x <url>` and `foo$(id)` both work — so
 * an unquoted name in the remedy below is at best a command that fails and at
 * worst one that runs something (found in review, #1305).
 */
export function shellQuote(value) {
  return `'${String(value ?? "").replace(/'/g, `'\\''`)}'`;
}

/**
 * The allowlist text and the ref it came from, or `unread`.
 *
 * There is no fallback: see the header. The worktree copy is never read,
 * because a branch can edit it and the check will not.
 */
export function readAllowlistSource({ cwd = process.cwd(), git = gitRunner } = {}) {
  for (const remote of baseRemotes({ cwd, git })) {
    const ref = `${remote}/${BASE_BRANCH}`;
    const yaml = ask(git, ["show", `${ref}:${CLA_WORKFLOW_PATH}`], cwd);
    if (yaml !== null && yaml.trim()) return { yaml, source: ref };
  }
  return { yaml: "", source: "unread" };
}

export function gather({
  cwd = process.cwd(),
  git = gitRunner,
  env = process.env,
} = {}) {
  // `git var` is the identity git ITSELF will stamp: the GIT_* environment
  // first, then the config, in git's own order. Reading only one of the two
  // would miss whichever half this container happens to set.
  const author = parseIdent(ask(git, ["var", "GIT_AUTHOR_IDENT"], cwd));
  const committer = parseIdent(ask(git, ["var", "GIT_COMMITTER_IDENT"], cwd));

  const { yaml, source } = readAllowlistSource({ cwd, git });
  const allowlist = parseAllowlist(yaml);

  return {
    authorEmail: author?.email ?? "",
    committerEmail: committer?.email ?? "",
    allowlist,
    // Which ref answered. Printed in the refusal rather than kept private: a
    // reader told they are not allowed deserves to know which list said so.
    allowlistSource: allowlist.length ? source : "unread",
    // The base remote, when one exists, so the warning below can name the
    // fetch that actually applies here instead of assuming `origin`.
    baseRemote: baseRemotes({ cwd, git })[0] ?? null,
    bypass: Boolean(env[ESCAPE_HATCH]),
  };
}

export function main({ cwd, git, env = process.env, err = console.error } = {}) {
  const facts = gather({ cwd, git, env });
  const verdict = decide(facts);

  if (verdict.bypassed) {
    err(
      `cla-identity-gate: ${ESCAPE_HATCH} is set — committing as ` +
        `${verdict.offender?.email} anyway (#1279). Add it to .github/workflows/cla.yml ` +
        `if it is a real worker, or this branch will go red.`
    );
    return 0;
  }
  if (verdict.warn) {
    /*
     * The remedy names the REMOTE THAT WAS ACTUALLY FOUND, not `origin`. A
     * remote may be called anything, and telling somebody to fetch a remote
     * they do not have is how a warning becomes noise (found in review,
     * #1305). Where no remote names the base repository at all, there is no
     * command to give and it says that instead of inventing one.
     *
     * The refspec is explicit on purpose. `git fetch <remote> main` is NOT
     * enough in a `--single-branch` clone: `remote.<name>.fetch` is restricted
     * to the one branch, so a bare fetch updates FETCH_HEAD and writes no
     * remote-tracking ref at all. `merge-pr.mjs`'s `fetchMainRef` measured
     * that, and this run confirmed it.
     *
     * Both arguments are shell-quoted and sit after `--`, because git accepts
     * remote names that a shell does not: `-x` would otherwise be read as an
     * option and `foo$(id)` would be expanded by whoever pasted it.
     */
    const remedy = facts.baseRemote
      ? `git fetch -- ${shellQuote(facts.baseRemote)} ` +
        shellQuote(
          `+refs/heads/${BASE_BRANCH}:refs/remotes/${facts.baseRemote}/${BASE_BRANCH}`
        )
      : `add a remote for ${BASE_REPOSITORY} and fetch its ${BASE_BRANCH}`;
    err(
      `cla-identity-gate: no readable ${BASE_BRANCH} copy of ${CLA_WORKFLOW_PATH} from ` +
        `${BASE_REPOSITORY}, so this commit's identity was NOT checked against the CLA ` +
        `allowlist (#1279). This branch's own copy is never read, because a branch can ` +
        `edit it and the check cannot. To get the check back: ${remedy}`
    );
    return 0;
  }
  if (!verdict.refuse) return 0;

  err(formatRefusal(facts, verdict));
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    /*
     * FAIL OPEN, LOUDLY — the same bargain the sibling makes. This runs on
     * every commit, and a gate that crashes blocks every commit on the machine,
     * which is a worse outage than the CI cycle it saves.
     */
    console.error(`cla-identity-gate could not run, allowing the commit: ${error.message}`);
    process.exitCode = 0;
  }
}

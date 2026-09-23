#!/usr/bin/env node
/**
 * Make a worktree that owns its dependencies (#1109).
 *
 *   npm run worktree:new -- fix/1109-thing
 *   npm run worktree:new -- fix/1109-thing .claude/worktrees/thing --from origin/main
 *
 * WHY THIS EXISTS
 *
 * `git worktree add` gives you a working tree and no `node_modules`. Node then
 * resolves bare specifiers by walking UP, and this repository's worktrees live
 * at `.claude/worktrees/<name>` — inside the primary checkout — so a fresh
 * worktree silently imports whatever the PRIMARY checkout's current branch has
 * installed. On 2026-09-08 that pruned `jsdom` and `@rapideditor/country-coder`
 * out from under three builders in one day (#1098, #1107, #1108), and a fourth
 * the same night on this ticket.
 *
 * `scripts/worktree-deps-gate.mjs` refuses to run the suite in that state. This
 * is the other half: the one command that never produces it. A worktree made
 * here has its own install before it is handed back, so the walk-up stops
 * inside it and the primary checkout's branch stops being able to reach it.
 *
 * Placing a worktree INSIDE the checkout stays fine, and is still the
 * convention — but only because of the install this does. That is the property
 * the two files hold between them.
 *
 * ---------------------------------------------------------------------------
 * IT CHECKS EVERYTHING IT NEEDS BEFORE IT DOES ANYTHING
 * ---------------------------------------------------------------------------
 *
 * All preconditions are gathered and reported TOGETHER, up front, before the
 * first side effect. That is not tidiness. The failure this repository keeps
 * paying for is a builder discovering the environment one error at a time —
 * `gh` missing from a cloud container has cost every cloud shift for three
 * weeks (office#371), one command at a time. A provisioning script that
 * creates a worktree and then dies on a missing `npm` has left a half-made
 * worktree behind and taught nothing; one that says all four things wrong with
 * the machine in one message costs a single round trip.
 *
 * If anything is wrong, nothing is created. There is no partial state to
 * clean up, because it never gets far enough to make one.
 *
 * SCOPE: NEITHER. It runs git and npm and reads `package-lock.json` — no
 * prose, house or founder. See `scripts/authorship.mjs`.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), ".."));

/** Where worktrees live in this repository, per CONTRIBUTING.md. */
export const WORKTREE_HOME = ".claude/worktrees";

/** What a worktree is branched off unless told otherwise. */
export const DEFAULT_START = "origin/main";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

/**
 * `<branch> [path] [--from <ref>] [--no-install]`
 *
 * Positional rather than flagged for the branch because that is how
 * `git worktree add` reads, and this is meant to replace that command in
 * muscle memory rather than to be learned separately.
 */
export function parseArgs(argv) {
  const positional = [];
  let from = DEFAULT_START;
  let install = true;
  const rest = [...argv];

  while (rest.length > 0) {
    const arg = rest.shift();
    if (arg === "--from") {
      const value = rest.shift();
      if (!value) return { error: "`--from` needs a ref, e.g. `--from origin/main`." };
      from = value;
    } else if (arg === "--no-install") {
      install = false;
    } else if (arg.startsWith("-")) {
      return { error: `Unknown option \`${arg}\`.` };
    } else {
      positional.push(arg);
    }
  }

  const [branch, path] = positional;
  if (!branch) {
    return { error: "Usage: npm run worktree:new -- <branch> [path] [--from <ref>]" };
  }
  if (positional.length > 2) {
    return { error: `Too many arguments: ${positional.slice(2).join(" ")}` };
  }
  return { branch, path, from, install };
}

/**
 * `fix/1109-shared-modules` -> `.claude/worktrees/fix-1109-shared-modules`.
 *
 * Slashes flattened because a branch name's slashes would otherwise create
 * nested directories under the worktree home, and `git worktree list` then
 * reads as a directory tree rather than a list of branches.
 *
 * Everything outside `[A-Za-z0-9]` collapses to a dash, dots included. That is
 * blunter than a branch name needs, and it is deliberate: it makes a path
 * segment that cannot climb out of the worktree home whatever it is handed.
 */
export function defaultPath(branch) {
  const slug = String(branch)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return join(WORKTREE_HOME, slug || "worktree");
}

// ---------------------------------------------------------------------------
// Preconditions
// ---------------------------------------------------------------------------

/**
 * Everything that must be true before the first side effect, judged as a pure
 * function so the spec can assert each failure without breaking a machine.
 *
 * Returns ALL problems, never the first one. A builder should learn the state
 * of their environment in one message.
 *
 * @returns {string[]} empty when it is safe to proceed
 */
export function checkPreconditions(facts) {
  const problems = [];
  if (!facts.hasGit) problems.push("`git` is not on PATH. Nothing here can run without it.");
  if (!facts.hasNpm) {
    problems.push("`npm` is not on PATH, so the new worktree could not be given its own install.");
  }
  if (!facts.insideRepo) {
    problems.push("This is not a git repository, so there is nothing to make a worktree of.");
  }
  if (!facts.lockExists) {
    problems.push(
      `No package-lock.json at ${facts.root}. \`npm ci\` needs one, and without it a ` +
        "new worktree would resolve dependencies from whatever it can reach — the " +
        "exact defect this command exists to prevent (#1109)."
    );
  }
  if (facts.branchExists) {
    problems.push(
      `Branch \`${facts.branch}\` already exists. Pick another name, or check it out ` +
        "in an existing worktree."
    );
  }
  if (!facts.startResolves) {
    problems.push(
      `\`${facts.from}\` does not resolve here. Try \`git fetch origin\` first, or pass ` +
        "`--from <ref>` with something this checkout has."
    );
  }
  if (facts.pathExists) {
    problems.push(`\`${facts.path}\` already exists. Remove it, or pass a different path.`);
  }
  return problems;
}

/** The commands, in order. Pure, so the spec can assert the shape without running them. */
export function plan({ branch, path, from, install }) {
  const steps = [
    { label: `git worktree add -b ${branch} ${path} ${from}`, argv: ["git", "worktree", "add", "-b", branch, path, from], cwd: null },
  ];
  if (install) {
    steps.push({ label: `npm ci  (in ${path})`, argv: ["npm", "ci"], cwd: path });
    steps.push({
      label: "worktree-deps-gate  (in the new worktree)",
      argv: ["node", join(ROOT, "scripts", "worktree-deps-gate.mjs")],
      cwd: path,
    });
  }
  return steps;
}

// ---------------------------------------------------------------------------
// Running it
// ---------------------------------------------------------------------------

const runner = (argv, cwd) =>
  spawnSync(argv[0], argv.slice(1), { cwd, stdio: "inherit", encoding: "utf8" });

function looks(argv, cwd) {
  const result = spawnSync(argv[0], argv.slice(1), { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return result.status === 0;
}

export function gather({ branch, path, from, root = ROOT, probe = looks } = {}) {
  const hasGit = probe(["git", "--version"], root);
  return {
    root,
    branch,
    from,
    path,
    hasGit,
    hasNpm: probe(["npm", "--version"], root),
    insideRepo: hasGit && probe(["git", "rev-parse", "--git-dir"], root),
    lockExists: existsSync(join(root, "package-lock.json")),
    branchExists: hasGit && probe(["git", "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], root),
    startResolves: hasGit && probe(["git", "rev-parse", "--verify", "--quiet", `${from}^{commit}`], root),
    pathExists: existsSync(isAbsolute(path) ? path : join(root, path)),
  };
}

export function main({ argv = process.argv.slice(2), root = ROOT, run = runner, probe = looks, out = console.log, err = console.error } = {}) {
  const args = parseArgs(argv);
  if (args.error) {
    err(args.error);
    return 2;
  }

  const path = args.path ?? defaultPath(args.branch);

  /*
   * WHICH REPOSITORY, SAID BEFORE ANYTHING HAPPENS. `root` is the repository
   * this SCRIPT lives in, not the directory it was invoked from — which is
   * right for `npm run worktree:new`, and a genuine surprise when the script is
   * run by absolute path from somewhere else. Writing the founding fact of the
   * command on its first line costs one line and removes the whole class: it
   * cost the author of this file a stray worktree and a gigabyte to learn.
   */
  out(`worktree:new — repository ${root}`);

  const problems = checkPreconditions(gather({ ...args, path, root, probe }));
  if (problems.length > 0) {
    err(
      [
        `REFUSED: ${problems.length} thing(s) must be true before a worktree can be made here.`,
        `  repository        ${root}`,
        "",
        ...problems.map((p) => `  - ${p}`),
        "",
        "  Nothing has been created. Fix these and run the same command again.",
      ].join("\n")
    );
    return 1;
  }

  const started = Date.now();
  for (const step of plan({ ...args, path })) {
    out(`\n→ ${step.label}`);
    const result = run(step.argv, step.cwd ? (isAbsolute(step.cwd) ? step.cwd : join(root, step.cwd)) : root);
    if (result.status !== 0) {
      err(
        `\nFAILED at: ${step.label} (exit ${result.status ?? "signal"}).\n` +
          `The worktree at ${path} may be half-made; \`git worktree remove ${path}\` clears it.`
      );
      return 1;
    }
  }

  const seconds = Math.round((Date.now() - started) / 1000);
  out(
    [
      "",
      `Ready in ${seconds}s: ${path}`,
      args.install
        ? "It has its own node_modules, so the primary checkout's branch cannot reach it (#1109)."
        : "NO INSTALL was made (--no-install). Run `npm ci` in it before the suite means anything.",
      "",
      `  cd ${path}`,
    ].join("\n")
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}

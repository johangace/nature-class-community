#!/usr/bin/env node
/**
 * Whose DEPENDENCY TREE the suite is about to run against (#1109).
 *
 * Sibling of `scripts/primary-checkout-gate.mjs`, which answers "whose working
 * tree is this commit being written from". This one answers the question one
 * step later: "when this tree says `import jsdom`, whose install answers?"
 *
 * WHY THIS EXISTS
 *
 * A linked worktree does not get its own `node_modules`. Node resolves a bare
 * specifier by walking UP from the importing file until it finds one, and the
 * worktrees this repository creates live at `.claude/worktrees/<name>` — inside
 * the primary checkout. So a file in a worktree resolves
 * `<primary>/node_modules`, and the contents of that directory are decided by
 * whichever branch the PRIMARY checkout happens to be sitting on.
 *
 * On 2026-09-08 the primary checkout was on `feat/984-species-gallery`, whose
 * `package.json` declares neither `jsdom` nor `@rapideditor/country-coder`. An
 * `npm install` run in that checkout pruned both. Eighteen suites in three
 * different worktrees went red at once, on branches that had changed nothing,
 * and three builders each spent an install working out why (#1098, #1107,
 * #1108). A fourth hit it the same night, on this ticket.
 *
 * The failure is expensive because it is MUTE. Nothing says "your dependencies
 * belong to another branch". You get `Cannot find module 'jsdom'` in a spec you
 * did not touch, which reads as your own breakage, and the first thing anyone
 * does with an unexplained red suite is read their own diff.
 *
 * This is the same class as #988 (the stash stack is repo-global) and #1022
 * (the primary checkout is shared): a resource everybody assumes is per-branch
 * turning out to be repo-global.
 *
 * THE RULE
 *
 *   The suite runs against THIS working tree's own install, or it does not run.
 *
 * ---------------------------------------------------------------------------
 * THE THREE THINGS IT CAN SEE, AND WHY THE THIRD ONE IS THE POINT
 * ---------------------------------------------------------------------------
 *
 *   NONE     No `node_modules` is reachable at all. Cheap to detect, and worth
 *            detecting here rather than letting `vitest: not found` say it,
 *            because the fix ("install in THIS directory") is not what a
 *            missing-binary message suggests.
 *
 *   FOREIGN  The `node_modules` node will resolve is not this working tree's.
 *            Either the walk-up escaped this tree — the `.claude/worktrees/`
 *            case above — or `node_modules` here is a symlink pointing at
 *            another checkout, which is the shortcut this repository already
 *            has a committed-symlink lint for (`scripts/symlink-lint.mjs`,
 *            nc#153). That lint catches the symlink reaching git. This catches
 *            it reaching the test runner, which happens first and is where the
 *            time is actually lost.
 *
 *   DRIFT    The install is in the right PLACE and is still the wrong install:
 *            a package this tree declares is absent, or is present at a version
 *            other than the one this tree's `package-lock.json` pins. This is
 *            the shape the incident actually took — a shared install is at the
 *            correct path relative to the primary checkout, so a location check
 *            alone would have called 2026-09-08 healthy. It is also the only
 *            one of the three that fires in a plain clone, where it means "your
 *            install is older than your branch": `npm ci`.
 *
 * Checked against the TOP-LEVEL DECLARED dependencies only — the 24 names in
 * this tree's `dependencies` + `devDependencies` — not the whole lock. Said
 * plainly rather than implied: a pruned transitive dependency of a package this
 * tree still declares slips through.
 *
 * The reason is FALSE POSITIVES, not cost. Reading the whole lock is cheap: it
 * holds 336 entries, 315 of them root-level, and the gate's whole run is 130ms
 * median over 11 runs (86-170ms), against a suite of two to four minutes. But
 * 74 of those 315 are legitimately ABSENT from a correct `npm ci`
 * tree on this machine — every one of them optional or `os`/`cpu`-gated, the
 * `@esbuild/*` and `@rollup/*` platform binaries for the architectures you are
 * not on. A whole-lock check would therefore report 74 MISSING packages on a
 * perfectly healthy install, on the front of every `npm test`. A gate that
 * cries wolf on a clean tree is deleted within the week, and then it protects
 * nothing.
 *
 * (Those two counts are measurable, not remembered: `node -e` over
 * `package-lock.json` for the entries, and `existsSync` over `node_modules` for
 * the absences. An earlier draft of this header asserted "~1,100 lock entries"
 * and a budget argument. Both were wrong, and wrong in the direction that
 * flatters the design.)
 *
 * The declared set is also the RIGHT set, which is why this is not a
 * compromise: a differing `package.json` prunes what it does not declare, so
 * the branch-mismatch this ticket is about lands precisely there. 2026-09-08
 * pruned two DECLARED packages, `jsdom` and `@rapideditor/country-coder`.
 *
 * ---------------------------------------------------------------------------
 * WHERE IT RUNS, AND WHY NOT IN CI
 * ---------------------------------------------------------------------------
 *
 * An npm `pre` hook on EVERY test entry point this repository has, because
 * npm matches `pre<name>` on the EXACT script name and nothing else:
 *
 *   pretest       ->  npm test          (vitest run — what CI's Test step runs)
 *   pretest:watch ->  npm run test:watch
 *   pretest:e2e   ->  npm run test:e2e  (playwright)
 *
 * `pretest` alone was the first version of this, and it left the likeliest way
 * to meet the bug uncovered: watch mode is where a builder sits for an hour,
 * and `npm run test:watch` fires no `pretest`. `tests/unit/worktree-deps-gate
 * .spec.ts` now derives the entry points from `package.json` and fails if any
 * script named `test*` has no gate in front of it, so a future `test:integration`
 * cannot be added ungated by forgetting this comment.
 *
 * What that does NOT cover, said out loud: `npx vitest` and `npx playwright
 * test` invoked directly. npm lifecycle hooks only fire for scripts npm runs,
 * so a direct binary call bypasses the gate by construction. CI's e2e step is
 * exactly such a call (`npx playwright test`), and that is fine — see below.
 *
 * CI is covered where it matters because CI's Test step IS `npm test`. No
 * workflow step was added, deliberately: a step in `ci.yml` is the one place
 * this could NOT have helped, since a GitHub runner does one clean clone and
 * one `npm ci` and so never has the defect. The builders who lost the time were
 * on a machine with several working trees on it.
 *
 * CONSEQUENCE WORTH KNOWING: `scripts/guard-mutation-check.mjs` ratchets on
 * `- name:` steps in `ci.yml`. A guard wired through an npm lifecycle hook has
 * no such step, so this is the first guard in this repository that sits OUTSIDE
 * the mutation ratchet. Its two spec files cover it today; the repo's anti-rot
 * mechanism does not reach it. If it is ever emptied out the way
 * `register-lint` was (#554), nothing but those specs will say so.
 *
 * IT FAILS OPEN ON ITS OWN ERRORS. A guard that cannot read its facts cannot
 * honestly refuse, and one that crashes blocks the suite everywhere — a worse
 * outage than the one it prevents, and the shortest road to `--ignore-scripts`
 * becoming habit.
 *
 * SCOPE: NEITHER. It reads `package.json`, `package-lock.json` and directory
 * names under `node_modules` — no prose, house or founder. See
 * `scripts/authorship.mjs` for why every check here says whose writing it
 * governs.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * The escape hatch. A refusal with no documented way past it is its own
 * outage: the first time this is wrong, the alternative to a loud bypass is
 * deleting the `pretest` line, and then it protects nothing ever again.
 *
 * Loud on purpose — it prints what it let through, so a bypass leaves a trace
 * in the terminal that produced it.
 */
export const ESCAPE_HATCH = "NATURE_CLASS_ALLOW_FOREIGN_DEPS";

/** The command that fixes every one of the three findings. */
export const FIX_COMMAND = "npm ci";

/** The command that would have avoided all three. */
export const BOOTSTRAP_COMMAND = "npm run worktree:new -- <branch>";

// ---------------------------------------------------------------------------
// Reading the tree
// ---------------------------------------------------------------------------

/** Trailing-slash- and symlink-insensitive canonical path. */
export function canonical(path) {
  const trimmed = String(path ?? "").replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    return realpathSync(trimmed);
  } catch {
    return trimmed;
  }
}

/**
 * Node's own resolution, reproduced: walk up from `start` and return the first
 * directory that has a `node_modules`, canonicalised so a symlink is reported
 * as where it actually points.
 *
 * This is the whole mechanism of the bug, so it is written as the algorithm
 * rather than as a guess about it. `existsSync` follows symlinks, which is what
 * node does too — a `node_modules` symlink is a resolvable `node_modules`.
 *
 * @returns {string | null} canonical path, or null if nothing is reachable.
 */
export function findModulesDir(start, { exists = existsSync } = {}) {
  let dir = resolve(String(start ?? "."));
  for (;;) {
    const candidate = join(dir, "node_modules");
    if (exists(candidate)) return canonical(candidate);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** Top-level dependency names this tree declares: `dependencies` + `devDependencies`. */
export function declaredDependencies(manifest) {
  const pkg = manifest ?? {};
  return [
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.devDependencies ?? {}),
  ].sort();
}

/**
 * What this tree's lock file pins each top-level package at.
 *
 * npm's lockfileVersion 2/3 keys `packages` by install path, so a root-level
 * install of `jsdom` is the entry `node_modules/jsdom`. Nested entries
 * (`node_modules/a/node_modules/b`) are a different package at a different
 * path and are deliberately not consulted.
 */
export function lockedVersions(lock) {
  const packages = lock?.packages ?? {};
  const versions = new Map();
  for (const [path, entry] of Object.entries(packages)) {
    const match = /^node_modules\/((?:@[^/]+\/)?[^/]+)$/.exec(path);
    if (match && typeof entry?.version === "string") versions.set(match[1], entry.version);
  }
  return versions;
}

/**
 * Hold the install against the lock, for the packages this tree declares.
 *
 * A declared package with no lock entry is SKIPPED rather than reported: that
 * means `package.json` and `package-lock.json` disagree with each other, which
 * is `npm ci`'s own error and not a fact about which checkout the install
 * belongs to. Reporting it here would put this guard's name on npm's finding.
 *
 * @returns {{ missing: string[], mismatched: {name: string, want: string, got: string}[] }}
 */
export function compareInstall({ declared, locked, readVersion }) {
  const missing = [];
  const mismatched = [];
  for (const name of declared) {
    const want = locked.get(name);
    if (!want) continue;
    const got = readVersion(name);
    if (got === null || got === undefined) {
      missing.push(name);
      continue;
    }
    if (got !== want) mismatched.push({ name, want, got });
  }
  return { missing, mismatched };
}

/** Read an installed package's version, or null when it is not there. */
function installedVersionReader(modulesDir) {
  return (name) => {
    try {
      const manifest = JSON.parse(readFileSync(join(modulesDir, name, "package.json"), "utf8"));
      return typeof manifest.version === "string" ? manifest.version : null;
    } catch {
      return null;
    }
  };
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

// ---------------------------------------------------------------------------
// The judgement
// ---------------------------------------------------------------------------

/**
 * The whole decision as a pure function of facts. Nothing here touches the
 * filesystem, git or the environment, which is what lets the spec assert every
 * branch directly as well as end to end against real directories.
 *
 * Order is load-bearing. The escape hatch is consulted LAST, so "bypassed"
 * means it actually changed the outcome; asking first would announce a bypass
 * on every healthy run.
 *
 * @param {import("./worktree-deps-gate.d.mts").Facts} facts
 * @returns {import("./worktree-deps-gate.d.mts").Verdict}
 */
export function decide(facts) {
  let kind = "ok";
  let reason = "this working tree's own install matches its lock file";

  if (!facts.modulesDir) {
    kind = "none";
    reason = "no node_modules is reachable from this working tree";
    /*
     * PLAIN EQUALITY, AND NOT `canonical()` ON BOTH SIDES. `gather` has already
     * canonicalised `modulesDir` — that is what makes a symlink report where it
     * actually points. Canonicalising `ownModules` here as well would resolve
     * that same symlink a second time, both sides would land on the borrowed
     * install, and `ln -s ../../nature-class/node_modules node_modules` would
     * read as this tree's own. Caught by planting the mutation rather than by
     * reasoning: with the drift check removed, the symlink case went green.
     */
  } else if (facts.modulesDir !== facts.ownModules) {
    kind = "foreign";
    reason = "the resolved node_modules belongs to another checkout";
  } else if (facts.missing.length > 0 || facts.mismatched.length > 0) {
    kind = "drift";
    reason = "the install does not match this working tree's lock file";
  }

  if (kind === "ok") return { refuse: false, bypassed: false, kind, reason };
  if (facts.bypass) return { refuse: false, bypassed: true, kind, reason };
  return { refuse: true, bypassed: false, kind, reason };
}

/** What the refusal says. The command it names is the whole point of it. */
export function formatRefusal(facts, verdict) {
  const lines = [
    "REFUSED: the suite would not be running against this working tree's dependencies.",
    "",
    `  working tree      ${facts.toplevel}`,
    `  this tree is      ${facts.linked ? "a linked worktree" : "a primary checkout or clone"}`,
    `  expected install  ${facts.ownModules}`,
    `  actual install    ${facts.modulesDir ?? "(none reachable)"}`,
    "",
  ];

  if (verdict.kind === "none") {
    lines.push(
      "  Nothing is installed here and nothing is reachable above here, so every bare",
      "  import in the suite would fail. This is not your diff."
    );
  } else if (verdict.kind === "foreign") {
    lines.push(
      "  The install answering this tree's imports is somebody else's, by one of the",
      "  two routes that produce it:",
      "",
      "    THE WALK-UP.  A linked worktree does not get its own node_modules, and node",
      "                  resolves a bare specifier by walking UP until it finds one. A",
      "                  worktree inside the primary checkout therefore imports",
      "                  whatever that checkout's CURRENT BRANCH has installed.",
      "    THE SYMLINK.  `ln -s ../../nature-class/node_modules node_modules` — same",
      "                  borrowed install, made explicit (nc#153).",
      "",
      "  Either way, an `npm install` in the other checkout rewrites your dependencies",
      "  without touching your branch.",
      "",
      "  That is #1109: the primary checkout sat on `feat/984-species-gallery`, which",
      "  declares neither `jsdom` nor `@rapideditor/country-coder`, an install there",
      "  pruned both, and eighteen suites went red in three worktrees whose branches",
      "  had changed nothing."
    );
  } else {
    const shown = [
      ...facts.missing.map((name) => `    ${name}  MISSING`),
      ...facts.mismatched.map((m) => `    ${m.name}  installed ${m.got}, this tree locks ${m.want}`),
    ];
    lines.push(
      "  The install is in the right place and is still the wrong install. These",
      "  packages this tree declares do not match its own package-lock.json:",
      "",
      ...shown.slice(0, 12),
      ...(shown.length > 12 ? [`    …and ${shown.length - 12} more`] : []),
      "",
      "  An install made against another branch's package.json looks exactly like this:",
      "  whatever that branch did not declare has been pruned from underneath you."
    );
  }

  lines.push(
    "",
    "  FIX, in THIS directory — not in the primary checkout, whose install is what",
    "  put you here:",
    "",
    `    ${FIX_COMMAND}`,
    "",
    "  NEXT TIME, so a worktree is born with its own install instead of borrowing one:",
    "",
    `    ${BOOTSTRAP_COMMAND}`,
    "",
    "  NOTHING HAS BEEN CHANGED. This refuses and explains; it never installs, prunes",
    "  or deletes on your behalf. Every incident in this class so far was made worse by",
    "  something helpfully rewriting a shared resource (#988, #1022).",
    "",
    `  GENUINE EMERGENCY ONLY: \`${ESCAPE_HATCH}=1 npm test\` runs the suite anyway and`,
    "  says so on stderr. A red suite after that is not evidence about your branch."
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Gathering the facts
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
 * @returns {import("./worktree-deps-gate.d.mts").Facts}
 */
export function gather({ cwd = process.cwd(), git = gitRunner, env = process.env } = {}) {
  // The working tree root, from git when there is one. A sandbox copy of this
  // repo (scripts/guard-mutation-check.mjs makes them) is not a git repository
  // at all, and `npm test` still has to work in it, so cwd is the fallback
  // rather than a crash.
  const toplevel = canonical(ask(git, ["rev-parse", "--show-toplevel"], cwd) || cwd);

  const gitDir = ask(git, ["rev-parse", "--absolute-git-dir"], cwd);
  const commonDir =
    ask(git, ["rev-parse", "--path-format=absolute", "--git-common-dir"], cwd) ??
    ask(git, ["rev-parse", "--git-common-dir"], cwd);

  const ownModules = join(toplevel, "node_modules");
  const modulesDir = findModulesDir(toplevel);

  let missing = [];
  let mismatched = [];
  // Only worth comparing when the install is this tree's; when it is somebody
  // else's, the location is the finding and a version list would bury it.
  // `ownModules` is deliberately NOT canonicalised — see `decide`.
  if (modulesDir && modulesDir === ownModules) {
    const manifestPath = join(toplevel, "package.json");
    const lockPath = join(toplevel, "package-lock.json");
    if (existsSync(manifestPath) && existsSync(lockPath)) {
      ({ missing, mismatched } = compareInstall({
        declared: declaredDependencies(readJson(manifestPath)),
        locked: lockedVersions(readJson(lockPath)),
        readVersion: installedVersionReader(modulesDir),
      }));
    }
  }

  return {
    toplevel,
    linked: Boolean(gitDir) && Boolean(commonDir) && canonical(gitDir) !== canonical(commonDir),
    ownModules,
    modulesDir,
    missing,
    mismatched,
    bypass: Boolean(env[ESCAPE_HATCH]),
  };
}

export function main({ cwd, git, env = process.env, err = console.error } = {}) {
  const facts = gather({ cwd, git, env });
  const verdict = decide(facts);

  if (verdict.bypassed) {
    err(
      `worktree-deps-gate: ${ESCAPE_HATCH} is set — running the suite against ` +
        `${facts.modulesDir ?? "no install"} anyway (#1109: ${verdict.reason}). ` +
        "A red suite after this is not evidence about your branch."
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
     * FAIL OPEN, LOUDLY. This runs on the front of every `npm test` in this
     * repository, CI included. A guard that cannot read its own facts cannot
     * honestly refuse, and one that crashes blocks the suite everywhere.
     */
    console.error(`worktree-deps-gate could not run, allowing the suite: ${error.message}`);
    process.exitCode = 0;
  }
}

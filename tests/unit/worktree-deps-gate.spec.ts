/**
 * The worktree dependency gate, held to the failure that produced it (#1109)
 * and to the failures a careless version of it would cause instead.
 *
 * Two halves, and the first one is why this file builds real directory trees
 * rather than stubbing a filesystem:
 *
 *   IT BITES.    Case 1 reconstructs 2026-09-08 exactly. A real primary
 *                checkout with a real `node_modules` installed from ONE
 *                branch's manifest, a real linked worktree created inside it
 *                whose own manifest declares a package that install does not
 *                have, and the gate run in the worktree with nothing mocked.
 *                It must refuse, and the refusal must name `npm ci`. Remove the
 *                location branch from `decide` and this goes green — proved by
 *                planting exactly that mutation, not asserted — which is what
 *                makes it a test of the change rather than a description of it.
 *                Case 6 came back from the same exercise: with the drift branch
 *                removed it went green, because the first draft canonicalised
 *                BOTH sides of the location comparison and so resolved away the
 *                symlink it existed to catch.
 *   IT IS QUIET. Cases 3-5 are the ones that decide whether this survives a
 *                week. The same worktree, given its own install, must pass —
 *                and a plain clone with a matching install must pass, because
 *                that is every CI runner and every cloud session.
 *
 * Nothing here runs `npm`. A real `npm ci` in this repository is 32 seconds
 * and a gigabyte (measured in the worktree that wrote this file), and what the
 * gate reads is only `node_modules/<name>/package.json`. So the installs below
 * are written by hand — which is also the only way to write the BROKEN one,
 * since no npm command produces "an install belonging to a different branch"
 * on purpose.
 */
import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ESCAPE_HATCH,
  canonical,
  compareInstall,
  decide,
  declaredDependencies,
  findModulesDir,
  formatRefusal,
  gather,
  lockedVersions,
  main,
} from "../../scripts/worktree-deps-gate.mjs";

const GATE = resolve(fileURLToPath(new URL("../../scripts/worktree-deps-gate.mjs", import.meta.url)));

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Building the two worlds
// ---------------------------------------------------------------------------

/** The package this repository's real incident lost: declared here, pruned there. */
const ONLY_ON_THIS_BRANCH = "jsdom";

function git(cwd: string, args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
      // These scratch repositories must not run this repository's hooks.
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    },
  });
}

function manifest(deps: Record<string, string>) {
  return JSON.stringify({ name: "nature-class", version: "0.1.0", dependencies: deps }, null, 2);
}

function lock(deps: Record<string, string>) {
  const packages: Record<string, unknown> = { "": { name: "nature-class", dependencies: deps } };
  for (const [name, version] of Object.entries(deps)) {
    packages[`node_modules/${name}`] = { version, resolved: `https://registry.example/${name}` };
  }
  return JSON.stringify({ name: "nature-class", lockfileVersion: 3, packages }, null, 2);
}

/** Write a `node_modules` holding exactly these packages at these versions. */
function install(root: string, packages: Record<string, string>) {
  for (const [name, version] of Object.entries(packages)) {
    const dir = join(root, "node_modules", name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name, version }));
  }
  mkdirSync(join(root, "node_modules"), { recursive: true });
}

/** Give a tree a manifest + lock declaring these versions, and commit them. */
function declare(root: string, deps: Record<string, string>) {
  writeFileSync(join(root, "package.json"), manifest(deps));
  writeFileSync(join(root, "package-lock.json"), lock(deps));
}

/**
 * The 2026-09-08 machine: a primary checkout on a branch that does NOT declare
 * `jsdom`, installed accordingly, with a linked worktree INSIDE it on a branch
 * that does. This is the arrangement `git worktree add` leaves you with, and
 * the reason it hurts is that it looks completely normal.
 */
function machine(label: string, { installInWorktree = false } = {}) {
  const primary = mkdtempSync(join(tmpdir(), `deps-gate-${label}-`));
  scratch.push(primary);
  git(primary, ["init", "-b", "main", "--quiet", primary]);
  declare(primary, { react: "19.1.0" });
  writeFileSync(join(primary, ".gitignore"), "node_modules\n");
  git(primary, ["add", "-A"]);
  git(primary, ["commit", "--quiet", "-m", "seed"]);

  // The other branch's install: react only. `jsdom` was pruned by an install
  // run over here, exactly as in the incident.
  install(primary, { react: "19.1.0" });

  const worktree = join(primary, ".claude", "worktrees", "work");
  git(primary, ["worktree", "add", "--quiet", "-b", "work", worktree, "main"]);
  declare(worktree, { react: "19.1.0", [ONLY_ON_THIS_BRANCH]: "26.1.0" });

  if (installInWorktree) install(worktree, { react: "19.1.0", [ONLY_ON_THIS_BRANCH]: "26.1.0" });

  return { primary, worktree };
}

/** Run the gate as a process, the way `pretest` does. Returns stderr, or null on exit 0. */
function runGate(cwd: string, env: Record<string, string> = {}): string | null {
  const clean = { ...process.env, ...env };
  if (!(ESCAPE_HATCH in env)) delete clean[ESCAPE_HATCH];
  try {
    execFileSync("node", [GATE], { cwd, encoding: "utf8", env: clean, stdio: ["ignore", "pipe", "pipe"] });
    return null;
  } catch (error) {
    return String((error as { stderr?: string }).stderr ?? "");
  }
}

// ---------------------------------------------------------------------------
// End to end, against real trees
// ---------------------------------------------------------------------------

describe("the gate, against real worktrees", () => {
  it("1. REFUSES a worktree whose only reachable install is the primary checkout's", () => {
    // The incident. Nothing is mocked: node's own walk-up finds the primary
    // checkout's node_modules, because the worktree has none of its own.
    const { worktree } = machine("incident");

    const stderr = runGate(worktree);

    expect(stderr).not.toBeNull();
    expect(stderr).toContain("REFUSED");
    // The refusal has to be actionable in the directory the reader is standing
    // in. If it does not name the command, it has not done its job.
    expect(stderr).toContain("npm ci");
    expect(stderr).toContain("npm run worktree:new");
    expect(stderr).toContain("NOTHING HAS BEEN CHANGED");
    // And it must say WHOSE install answered, or the reader goes looking in
    // their own diff — which is the hour the ticket is about.
    expect(stderr).toMatch(/actual install\s+\S+/);
  }, 30_000);

  it("2. REFUSES an install that is in the right place and belongs to another branch", () => {
    /*
     * DRIFT, and the reason a location check alone is not the fix. Here the
     * worktree has its own node_modules at its own path — a location check
     * calls this healthy — but it was installed from the branch that does not
     * declare `jsdom`, so the suite would still fail on a spec nobody touched.
     */
    const { worktree } = machine("drift", { installInWorktree: true });
    rmSync(join(worktree, "node_modules", ONLY_ON_THIS_BRANCH), { recursive: true, force: true });

    const stderr = runGate(worktree);

    expect(stderr).not.toBeNull();
    expect(stderr).toContain("REFUSED");
    expect(stderr).toContain(`${ONLY_ON_THIS_BRANCH}  MISSING`);
    expect(stderr).toContain("npm ci");
  }, 30_000);

  it("3. ALLOWS the same worktree once it has its own install — the fix, proven", () => {
    // Same machine, same primary checkout still on the pruned branch. The only
    // difference is the install this ticket asks `worktree:new` to make.
    const { worktree } = machine("healthy", { installInWorktree: true });
    expect(runGate(worktree)).toBeNull();
  }, 30_000);

  it("4. ALLOWS a plain clone with a matching install — every CI runner and cloud session", () => {
    /*
     * THE REGRESSION TEST FOR THE OBVIOUS OVERREACH. A gate that keyed on
     * "is this a linked worktree" or on any property of the machine would
     * still have to pass here, and this is where nearly all of this
     * repository's suite runs. If it ever goes red, the gate has stopped
     * being a gate and become an outage.
     */
    const dir = mkdtempSync(join(tmpdir(), "deps-gate-clone-"));
    scratch.push(dir);
    git(dir, ["init", "-b", "main", "--quiet", dir]);
    declare(dir, { react: "19.1.0", [ONLY_ON_THIS_BRANCH]: "26.1.0" });
    install(dir, { react: "19.1.0", [ONLY_ON_THIS_BRANCH]: "26.1.0" });

    expect(runGate(dir)).toBeNull();
  }, 30_000);

  it("5. ALLOWS a tree that is not a git repository at all — the sandbox case", () => {
    // scripts/guard-mutation-check.mjs copies this tree to /tmp WITHOUT .git
    // and can run `npm test` in it. A gate that needed git would break that.
    const dir = mkdtempSync(join(tmpdir(), "deps-gate-nogit-"));
    scratch.push(dir);
    declare(dir, { react: "19.1.0" });
    install(dir, { react: "19.1.0" });

    expect(runGate(dir)).toBeNull();
  }, 30_000);

  it("6. REFUSES a node_modules symlinked into another checkout, and ALLOWS it with the hatch", () => {
    // `ln -s ../../nature-class/node_modules node_modules` is the shortcut this
    // repo already has a committed-symlink lint for (nc#153). That one catches
    // it reaching git; this catches it reaching the runner, which is sooner.
    const { primary } = machine("symlink", {});
    const other = mkdtempSync(join(tmpdir(), "deps-gate-borrower-"));
    scratch.push(other);
    declare(other, { react: "19.1.0", [ONLY_ON_THIS_BRANCH]: "26.1.0" });
    symlinkSync(join(primary, "node_modules"), join(other, "node_modules"));

    const stderr = runGate(other);
    expect(stderr).toContain("REFUSED");
    // Caught as a BORROWED INSTALL, not merely as drift. The distinction is not
    // pedantry: with the location check removed this went green, because the
    // first draft canonicalised both sides of the comparison and so resolved
    // the very symlink it was meant to notice.
    expect(stderr).toContain("THE SYMLINK");
    expect(stderr).toContain("actual install");

    // And the documented way past it, which is what stops `pretest` being
    // deleted the first time this is wrong.
    expect(runGate(other, { [ESCAPE_HATCH]: "1" })).toBeNull();
  }, 30_000);
});

// ---------------------------------------------------------------------------
// The pieces, directly
// ---------------------------------------------------------------------------

describe("findModulesDir", () => {
  it("walks up, which is the whole mechanism of the bug", () => {
    const seen: string[] = [];
    const exists = (path: string) => {
      seen.push(path);
      return path === "/repo/node_modules";
    };
    expect(findModulesDir("/repo/.claude/worktrees/work", { exists })).toBe("/repo/node_modules");
    expect(seen).toEqual([
      "/repo/.claude/worktrees/work/node_modules",
      "/repo/.claude/worktrees/node_modules",
      "/repo/.claude/node_modules",
      "/repo/node_modules",
    ]);
  });

  it("stops at the filesystem root rather than looping", () => {
    expect(findModulesDir("/a/b/c", { exists: () => false })).toBeNull();
  });
});

describe("declaredDependencies", () => {
  it("reads both halves, because devDependencies is where jsdom lives", () => {
    expect(
      declaredDependencies({ dependencies: { react: "19" }, devDependencies: { jsdom: "26" } })
    ).toEqual(["jsdom", "react"]);
  });

  it("is empty rather than a crash for a manifest with neither", () => {
    expect(declaredDependencies({})).toEqual([]);
    expect(declaredDependencies(null)).toEqual([]);
  });
});

describe("lockedVersions", () => {
  it("reads root-level entries and ignores nested ones", () => {
    const versions = lockedVersions({
      packages: {
        "": { name: "nature-class" },
        "node_modules/jsdom": { version: "26.1.0" },
        "node_modules/@rapideditor/country-coder": { version: "5.6.1" },
        // A different copy of the same package, nested under another. Reading
        // this as jsdom's version would report drift on a healthy install.
        "node_modules/vitest/node_modules/jsdom": { version: "20.0.0" },
      },
    });
    expect(versions.get("jsdom")).toBe("26.1.0");
    expect(versions.get("@rapideditor/country-coder")).toBe("5.6.1");
    expect(versions.size).toBe(2);
  });

  it("is empty rather than a crash for a lock file it cannot read", () => {
    expect(lockedVersions(null).size).toBe(0);
    expect(lockedVersions({}).size).toBe(0);
  });
});

describe("compareInstall", () => {
  const locked = new Map([
    ["jsdom", "26.1.0"],
    ["react", "19.1.0"],
  ]);

  it("reports a pruned package as missing — the incident's own shape", () => {
    const result = compareInstall({
      declared: ["jsdom", "react"],
      locked,
      readVersion: (name) => (name === "react" ? "19.1.0" : null),
    });
    expect(result.missing).toEqual(["jsdom"]);
    expect(result.mismatched).toEqual([]);
  });

  it("reports another branch's version as a mismatch", () => {
    const result = compareInstall({
      declared: ["react"],
      locked,
      readVersion: () => "18.3.1",
    });
    expect(result.mismatched).toEqual([{ name: "react", want: "19.1.0", got: "18.3.1" }]);
  });

  it("says nothing about a declared package the lock file does not carry", () => {
    // package.json and package-lock.json disagreeing is `npm ci`'s own error.
    // Putting this guard's name on it would be a wrong-reason red.
    const result = compareInstall({
      declared: ["brand-new"],
      locked,
      readVersion: () => null,
    });
    expect(result).toEqual({ missing: [], mismatched: [] });
  });
});

// ---------------------------------------------------------------------------
// The judgement
// ---------------------------------------------------------------------------

const healthy = {
  toplevel: "/repo/.claude/worktrees/work",
  linked: true,
  ownModules: "/repo/.claude/worktrees/work/node_modules",
  modulesDir: "/repo/.claude/worktrees/work/node_modules",
  missing: [] as string[],
  mismatched: [] as { name: string; want: string; got: string }[],
  bypass: false,
};

describe("decide", () => {
  it("passes an install that is this tree's own and matches its lock", () => {
    expect(decide(healthy)).toMatchObject({ refuse: false, kind: "ok" });
  });

  it("refuses a borrowed install", () => {
    expect(decide({ ...healthy, modulesDir: "/repo/node_modules" })).toMatchObject({
      refuse: true,
      kind: "foreign",
    });
  });

  it("refuses when nothing is reachable", () => {
    expect(decide({ ...healthy, modulesDir: null })).toMatchObject({ refuse: true, kind: "none" });
  });

  it("refuses drift in the right directory", () => {
    expect(decide({ ...healthy, missing: ["jsdom"] })).toMatchObject({
      refuse: true,
      kind: "drift",
    });
  });

  it("reports the bypass only when it changed the outcome", () => {
    expect(decide({ ...healthy, modulesDir: "/repo/node_modules", bypass: true })).toMatchObject({
      refuse: false,
      bypassed: true,
    });
    // A healthy tree with the hatch set was never going to be refused; calling
    // that a bypass would print a warning on every run in every clone.
    expect(decide({ ...healthy, bypass: true }).bypassed).toBe(false);
  });
});

describe("formatRefusal", () => {
  it("names both installs, so the reader can see whose answered", () => {
    const facts = { ...healthy, modulesDir: "/repo/node_modules" };
    const message = formatRefusal(facts, decide(facts));
    expect(message).toContain("/repo/node_modules");
    expect(message).toContain("/repo/.claude/worktrees/work/node_modules");
    expect(message).toContain("npm ci");
    expect(message).toContain(ESCAPE_HATCH);
    // It must not offer to fix the tree for you. #988 and #1022 are the
    // siblings: every incident in this class was worsened by something helpful.
    expect(message).not.toMatch(/^\s*(npm install|rm -rf)\b/m);
  });

  it("lists the drifted packages, capped so a wholesale mismatch stays readable", () => {
    const missing = Array.from({ length: 20 }, (_, i) => `pkg-${i}`);
    const facts = { ...healthy, missing };
    const message = formatRefusal(facts, decide(facts));
    expect(message).toContain("pkg-0  MISSING");
    expect(message).toContain("and 8 more");
    expect(message).not.toContain("pkg-19  MISSING");
  });
});

describe("main", () => {
  it("still answers when git is unavailable, rather than blocking the suite", () => {
    // The gate runs on the front of every `npm test`. A machine it cannot read
    // must not be a machine where the suite cannot run.
    const dir = mkdtempSync(join(tmpdir(), "deps-gate-nogit-main-"));
    scratch.push(dir);
    declare(dir, { react: "19.1.0" });
    install(dir, { react: "19.1.0" });

    const messages: string[] = [];
    const code = main({
      cwd: dir,
      git: () => {
        throw new Error("git is not on PATH");
      },
      env: { NODE_ENV: "test" },
      err: (m) => messages.push(m),
    });
    expect(code).toBe(0);
    expect(messages).toEqual([]);
  });

  it("is loud when the hatch changes the outcome", () => {
    const { worktree } = machine("hatch-loud");
    const messages: string[] = [];
    const code = main({
      cwd: worktree,
      env: { NODE_ENV: "test", [ESCAPE_HATCH]: "1" },
      err: (m) => messages.push(m),
    });
    expect(code).toBe(0);
    expect(messages.join("\n")).toContain(ESCAPE_HATCH);
  }, 30_000);
});

describe("gather", () => {
  it("knows a linked worktree from a primary checkout", () => {
    const { primary, worktree } = machine("linked-flag");
    expect(gather({ cwd: worktree }).linked).toBe(true);
    expect(gather({ cwd: primary }).linked).toBe(false);
  }, 30_000);
});

describe("canonical", () => {
  it("is trailing-slash insensitive and never throws on a path that is not there", () => {
    expect(canonical("/definitely/not/here/")).toBe("/definitely/not/here");
    expect(canonical("")).toBe("");
    expect(canonical(null)).toBe("");
  });
});

/**
 * The wiring, asserted rather than assumed. A gate nothing invokes is the
 * `register-lint` failure in a new costume (#554): it would pass every test in
 * this file and never run once on anybody's machine.
 */
describe("the gate this spec imports", () => {
  const pkg = JSON.parse(readFileSync(join(dirname(GATE), "..", "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  /** Every way this repository starts a test run, derived rather than listed. */
  const entryPoints = Object.keys(pkg.scripts)
    .filter((name) => /^test(:|$)/.test(name))
    .sort();

  it("has at least the three entry points this repository ships", () => {
    // If this list shrinks, the loop below would pass vacuously.
    expect(entryPoints).toEqual(["test", "test:watch", "test:e2e"].sort());
  });

  it.each(entryPoints)("guards `npm run %s` with a matching pre hook", (name) => {
    /*
     * npm matches `pre<name>` on the EXACT script name. `pretest` therefore
     * does nothing for `test:watch` — which is where a builder sits for an
     * hour, and so the likeliest way to meet the mute failure this ticket is
     * about. This is derived from package.json rather than enumerated, so a
     * future `test:integration` fails here until it is wired too.
     */
    expect(pkg.scripts[`pre${name}`]).toContain("scripts/worktree-deps-gate.mjs");
  });
});

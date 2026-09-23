/**
 * The worktree bootstrap (#1109) — the other half of the gate.
 *
 * The gate refuses a worktree that borrows another checkout's dependencies.
 * This is the command that never produces one, so what has to be proved here
 * is the ORDER and the REFUSALS, not that `npm ci` works:
 *
 *   - a worktree is never created against a machine that cannot finish the
 *     job, and every reason is reported at once rather than one command at a
 *     time (the failure mode office#371 describes: a cloud builder learning
 *     its environment through one error after another)
 *   - the install happens INSIDE the new worktree, not the repository root,
 *     which is the single line that decides whether the whole thing works
 *   - the gate itself runs last, so the command cannot report success on a
 *     worktree that would be refused a minute later
 *
 * `npm ci` is never run here. It is 32 seconds and a gigabyte in this
 * repository (measured), and every one of the properties above is visible in
 * the plan, which is why the plan is a pure function.
 */
import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  DEFAULT_START,
  WORKTREE_HOME,
  checkPreconditions,
  defaultPath,
  main,
  parseArgs,
  plan,
} from "../../scripts/worktree-new.mjs";

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

const HEALTHY = {
  root: "/repo",
  branch: "fix/1109-thing",
  from: DEFAULT_START,
  path: ".claude/worktrees/fix-1109-thing",
  hasGit: true,
  hasNpm: true,
  insideRepo: true,
  lockExists: true,
  branchExists: false,
  startResolves: true,
  pathExists: false,
};

describe("parseArgs", () => {
  it("takes the branch positionally, the way `git worktree add` reads", () => {
    expect(parseArgs(["fix/1109-thing"])).toMatchObject({
      branch: "fix/1109-thing",
      from: DEFAULT_START,
      install: true,
    });
  });

  it("takes an explicit path and start point", () => {
    expect(parseArgs(["b", "wt/b", "--from", "origin/release"])).toMatchObject({
      branch: "b",
      path: "wt/b",
      from: "origin/release",
    });
  });

  it("refuses rather than guessing", () => {
    expect(parseArgs([]).error).toMatch(/Usage/);
    expect(parseArgs(["b", "--from"]).error).toMatch(/needs a ref/);
    expect(parseArgs(["b", "--wat"]).error).toMatch(/Unknown option/);
    expect(parseArgs(["a", "b", "c"]).error).toMatch(/Too many/);
  });
});

describe("defaultPath", () => {
  it("flattens the branch name, so `git worktree list` stays a list", () => {
    expect(defaultPath("fix/1109-shared-modules")).toBe(`${WORKTREE_HOME}/fix-1109-shared-modules`);
    expect(defaultPath("night/n0908-nc1109")).toBe(`${WORKTREE_HOME}/night-n0908-nc1109`);
  });

  it("never lands outside the worktree home, whatever it is handed", () => {
    for (const branch of ["../escape", "a//b", "weird name!", "/", "-"]) {
      const path = defaultPath(branch);
      expect(path.startsWith(`${WORKTREE_HOME}/`)).toBe(true);
      expect(path).not.toContain("..");
    }
  });
});

describe("checkPreconditions", () => {
  it("says nothing about a machine that can do the job", () => {
    expect(checkPreconditions(HEALTHY)).toEqual([]);
  });

  it("reports EVERY problem at once, not the first one", () => {
    // The point of the whole function. A builder learning that npm is missing
    // only after git has already made a half-worktree has paid two round trips
    // for one message.
    const problems = checkPreconditions({
      ...HEALTHY,
      hasNpm: false,
      lockExists: false,
      branchExists: true,
      startResolves: false,
      pathExists: true,
    });
    expect(problems).toHaveLength(5);
    expect(problems.join("\n")).toMatch(/npm/);
    expect(problems.join("\n")).toMatch(/package-lock\.json/);
    expect(problems.join("\n")).toMatch(/already exists/);
    expect(problems.join("\n")).toMatch(/does not resolve/);
  });

  it("names the missing lock file as the #1109 defect, not as a detail", () => {
    expect(checkPreconditions({ ...HEALTHY, lockExists: false }).join("\n")).toContain("#1109");
  });
});

describe("plan", () => {
  const steps = plan({ branch: "b", path: "wt/b", from: "origin/main", install: true });

  it("creates the worktree, then installs INSIDE it", () => {
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => ({ argv: s.argv, cwd: s.cwd })).slice(0, 2)).toEqual([
      { argv: ["git", "worktree", "add", "-b", "b", "wt/b", "origin/main"], cwd: null },
      // The one line that decides whether any of this works. An `npm ci` at the
      // repository root would install into the checkout the worktree is trying
      // not to borrow from.
      { argv: ["npm", "ci"], cwd: "wt/b" },
    ]);
  });

  it("runs the gate last, in the new worktree", () => {
    // So the command cannot say "ready" about a tree the suite would refuse.
    const last = steps.at(-1);
    expect(last?.argv.join(" ")).toMatch(/^node .*worktree-deps-gate\.mjs$/);
    expect(last?.cwd).toBe("wt/b");
  });

  it("with --no-install, makes the worktree and claims nothing else", () => {
    const bare = plan({ branch: "b", path: "wt/b", from: "origin/main", install: false });
    expect(bare).toHaveLength(1);
  });
});

describe("main", () => {
  /** A repository that can actually be worktree'd, minus any install. */
  function repo(label: string) {
    const dir = mkdtempSync(join(tmpdir(), `worktree-new-${label}-`));
    scratch.push(dir);
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "test",
      GIT_AUTHOR_EMAIL: "test@example.com",
      GIT_COMMITTER_NAME: "test",
      GIT_COMMITTER_EMAIL: "test@example.com",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
    };
    const git = (args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8", env });
    git(["init", "-b", "main", "--quiet", dir]);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "1.0.0" }));
    writeFileSync(join(dir, "package-lock.json"), JSON.stringify({ lockfileVersion: 3, packages: {} }));
    git(["add", "-A"]);
    git(["commit", "--quiet", "-m", "seed"]);
    return dir;
  }

  it("creates nothing when a precondition fails, and says all of them", () => {
    const root = repo("refuses");
    const messages: string[] = [];
    const code = main({
      argv: ["fix/thing"],
      root,
      probe: (argv) => argv[0] !== "npm", // npm is missing on this machine
      run: () => {
        throw new Error("must not run a step");
      },
      out: (m) => messages.push(m),
      err: (m) => messages.push(m),
    });

    expect(code).toBe(1);
    expect(messages.join("\n")).toContain("REFUSED");
    expect(messages.join("\n")).toContain("Nothing has been created");
    // WHICH repository, before anything happens. The script operates on the
    // repo it lives in, not the cwd — a surprise that cost the author of this
    // file a stray worktree and a gigabyte.
    expect(messages.join("\n")).toContain(root);
    expect(existsSync(join(root, WORKTREE_HOME))).toBe(false);
  }, 30_000);

  it("refuses a path that is already there rather than writing into it", () => {
    const root = repo("occupied");
    mkdirSync(join(root, WORKTREE_HOME, "fix-thing"), { recursive: true });
    writeFileSync(join(root, WORKTREE_HOME, "fix-thing", "keep.txt"), "somebody's work\n");

    const messages: string[] = [];
    const code = main({
      argv: ["fix/thing", "--from", "main"],
      root,
      run: () => {
        throw new Error("must not run a step");
      },
      out: () => {},
      err: (m) => messages.push(m),
    });

    expect(code).toBe(1);
    expect(messages.join("\n")).toContain("already exists");
    // It refuses; it never tidies. Same rule as the two sibling gates.
    expect(existsSync(join(root, WORKTREE_HOME, "fix-thing", "keep.txt"))).toBe(true);
  }, 30_000);

  it("makes a real worktree and would install in it", () => {
    // The git half runs for real; the install and the gate are observed rather
    // than executed, because a real `npm ci` here is 32 seconds of nothing
    // this test is about.
    const root = repo("happy");
    const ran: { argv: string[]; cwd?: string }[] = [];
    const messages: string[] = [];

    const code = main({
      argv: ["fix/thing", "--from", "main"],
      root,
      run: (argv, cwd) => {
        ran.push({ argv, cwd });
        if (argv[0] === "git") {
          execFileSync(argv[0], argv.slice(1), {
            cwd,
            env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
          });
        }
        return { status: 0 };
      },
      out: (m) => messages.push(m),
      err: (m) => messages.push(m),
    });

    expect(code).toBe(0);
    const worktree = join(root, WORKTREE_HOME, "fix-thing");
    expect(existsSync(join(worktree, "package.json"))).toBe(true);
    // The install ran in the worktree, with an absolute path — not at the root.
    const installStep = ran.find((step) => step.argv[0] === "npm");
    expect(installStep?.argv).toEqual(["npm", "ci"]);
    expect(resolve(String(installStep?.cwd))).toBe(resolve(worktree));
    expect(messages.join("\n")).toContain("its own node_modules");
  }, 30_000);

  it("stops at the first failing step and says where the half-made tree is", () => {
    const root = repo("fails");
    const messages: string[] = [];
    const code = main({
      argv: ["fix/thing", "--from", "main"],
      root,
      run: (argv, cwd) => {
        if (argv[0] === "git") {
          execFileSync(argv[0], argv.slice(1), {
            cwd,
            env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" },
          });
          return { status: 0 };
        }
        return { status: 1 }; // the install fails
      },
      out: () => {},
      err: (m) => messages.push(m),
    });

    expect(code).toBe(1);
    expect(messages.join("\n")).toContain("FAILED at: npm ci");
    expect(messages.join("\n")).toContain("git worktree remove");
  }, 30_000);
});

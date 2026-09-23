import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Which chrome binary `playwright.config.ts` decides to launch (nc#1290).
 *
 * The resolver is four lines of policy over two facts nobody can see from a
 * failure message — whether the pinned build is installed, and whether the
 * artifact a HEADLESS launch actually runs is installed — and its first two
 * drafts were each wrong about one of them. Codex found both in review:
 * draft one tested the full browser and let a missing headless shell through;
 * draft two walked a fixed number of parents to the build directory, which is
 * right on Linux and lands on `Contents` on macOS, and asked whether the
 * shell's DIRECTORY existed rather than whether anything was in it.
 *
 * Neither bug is visible from this container, which has no pinned build at all
 * and no macOS. So the layouts are built on disk and the executable Playwright
 * would name is stubbed, which is the only part of the answer that comes from
 * outside. What is asserted is the config's own `launchOptions.executablePath`:
 * the value a real run launches, not a re-implementation of how it was picked.
 */

const REVISION = "1234";
const roots: string[] = [];

/** A browsers root, with whichever of the two artifacts the case wants. */
function browsersRoot(options: {
  /** Where the full browser's executable sits inside `chromium-<rev>/`. */
  executableParts?: string[];
  /** "missing" | "directory-only" (a pruned cache) | "complete". */
  shell: "missing" | "directory-only" | "complete";
  /** Write the full browser's executable at all. */
  full?: boolean;
}): { root: string; executable: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "nc1290-"));
  roots.push(root);

  const parts = options.executableParts ?? ["chrome-linux64", "chrome"];
  const executable = path.join(root, `chromium-${REVISION}`, ...parts);
  if (options.full !== false) {
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, "");
  }

  if (options.shell !== "missing") {
    const shellDir = path.join(root, `chromium_headless_shell-${REVISION}`);
    fs.mkdirSync(shellDir, { recursive: true });
    if (options.shell === "complete") {
      fs.writeFileSync(path.join(shellDir, "INSTALLATION_COMPLETE"), "");
    }
  }

  // The container's own symlink-shaped fallback, `<root>/chromium`. A plain
  // file stands in: the resolver asks whether the path exists, never what it
  // is, and a test that needed a real browser here would be an e2e test.
  fs.writeFileSync(path.join(root, "chromium"), "");

  return { root, executable };
}

/** Load the config fresh and report what it would launch, and what it said. */
async function resolve(options: {
  /** What `chromium.executablePath()` answers, or an error it throws. */
  pinned: string | Error;
  browsersPath?: string;
  explicit?: string;
}): Promise<{ executablePath: string | undefined; warnings: string[] }> {
  vi.resetModules();
  vi.doMock("@playwright/test", async () => {
    const actual = await vi.importActual<typeof import("@playwright/test")>("@playwright/test");
    return {
      ...actual,
      chromium: {
        ...actual.chromium,
        executablePath: () => {
          if (options.pinned instanceof Error) throw options.pinned;
          return options.pinned;
        },
      },
    };
  });

  vi.stubEnv("PLAYWRIGHT_BROWSERS_PATH", options.browsersPath ?? "");
  vi.stubEnv("PLAYWRIGHT_CHROMIUM_EXECUTABLE", options.explicit ?? "");

  const warnings: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation((...args) => {
    warnings.push(args.map(String).join(" "));
  });
  try {
    const config = (await import("../../playwright.config")).default;
    const use = config.projects?.[0]?.use as
      | { launchOptions?: { executablePath?: string } }
      | undefined;
    return { executablePath: use?.launchOptions?.executablePath, warnings };
  } finally {
    warn.mockRestore();
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.doUnmock("@playwright/test");
  while (roots.length) fs.rmSync(roots.pop() as string, { recursive: true, force: true });
});

describe("playwright.config.ts picks a browser", () => {
  it("overrides nothing when the pinned build is fully installed", async () => {
    const { root, executable } = browsersRoot({ shell: "complete" });
    const { executablePath, warnings } = await resolve({ pinned: executable, browsersPath: root });

    // The CI path, and the whole promise of this change: a machine that ran
    // `playwright install` launches exactly what it launched before.
    expect(executablePath).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("takes an explicit executable over anything installed", async () => {
    const { root, executable } = browsersRoot({ shell: "complete" });
    const { executablePath, warnings } = await resolve({
      pinned: executable,
      browsersPath: root,
      explicit: "/somewhere/else/chrome",
    });

    expect(executablePath).toBe("/somewhere/else/chrome");
    expect(warnings).toEqual([]);
  });

  it("launches the pinned full browser when its headless shell is missing", async () => {
    const { root, executable } = browsersRoot({ shell: "missing" });
    const { executablePath, warnings } = await resolve({ pinned: executable, browsersPath: root });

    // Same build the suite pins, a different artifact of it — so the pinned
    // binary, never the container's older one sitting beside it.
    expect(executablePath).toBe(executable);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("headless shell is not installed");
  });

  it("treats a shell directory with no completion marker as not installed", async () => {
    // The pruned-cache shape: `playwright install` writes the marker last, so
    // a directory without it is an install that did not finish or was emptied.
    const { root, executable } = browsersRoot({ shell: "directory-only" });
    const { executablePath } = await resolve({ pinned: executable, browsersPath: root });

    expect(executablePath).toBe(executable);
  });

  it("leaves a headless-only pinned installation alone", async () => {
    // `playwright install chromium-headless-shell` leaves exactly the artifact
    // a headless run wants and no full browser. Giving up at the missing full
    // executable would override a usable pinned shell with the container's
    // different build — the worst answer available, on a machine that had the
    // right one.
    const { root, executable } = browsersRoot({ full: false, shell: "complete" });
    const { executablePath, warnings } = await resolve({ pinned: executable, browsersPath: root });

    expect(executablePath).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("finds the build directory on macOS's deeper layout", async () => {
    // chromium-<rev>/chrome-mac/Chromium.app/Contents/MacOS/Chromium — five
    // levels, against Linux's two. Counting parents lands on `Contents`, the
    // revision never parses, and every partial cache answers "installed".
    const { root, executable } = browsersRoot({
      executableParts: ["chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"],
      shell: "missing",
    });
    const { executablePath } = await resolve({ pinned: executable, browsersPath: root });

    expect(executablePath).toBe(executable);
  });

  it("falls back to the container's browser when no pinned build is installed", async () => {
    const { root } = browsersRoot({ full: false, shell: "missing" });
    const { executablePath, warnings } = await resolve({
      pinned: path.join(root, `chromium-${REVISION}`, "chrome-linux64", "chrome"),
      browsersPath: root,
    });

    expect(executablePath).toBe(path.join(root, "chromium"));
    expect(warnings).toHaveLength(1);
    // This one is a different ENGINE, so it has to say more than the other.
    expect(warnings[0]).toContain("different build");
  });

  it("overrides nothing when there is no pinned build and no container browser", async () => {
    const { executablePath, warnings } = await resolve({
      pinned: "/nowhere/chromium-1234/chrome-linux64/chrome",
    });

    // Playwright raises its own error, which is the right one to read when
    // nothing here can help.
    expect(executablePath).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("lets the full browser answer for the shell on an unrecognised layout", async () => {
    // Nothing named `chromium-<rev>` above the executable, so the shell cannot
    // be named either. The conservative answer is the one this file gave
    // before it knew the shell existed: a pinned install is left alone.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nc1290-"));
    roots.push(root);
    const executable = path.join(root, "some-other-layout", "chrome");
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    fs.writeFileSync(executable, "");
    fs.writeFileSync(path.join(root, "chromium"), "");

    const { executablePath, warnings } = await resolve({ pinned: executable, browsersPath: root });

    expect(executablePath).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it("overrides nothing when the registry cannot be read at all", async () => {
    const { root } = browsersRoot({ full: false, shell: "missing" });
    const { executablePath, warnings } = await resolve({
      pinned: new Error("browser registry unavailable"),
      browsersPath: root,
    });

    // A registry that throws is not the same as a build that is absent, but
    // the container still has one and it is still better than dying.
    expect(executablePath).toBe(path.join(root, "chromium"));
    expect(warnings).toHaveLength(1);
  });
});

import fs from "node:fs";
import path from "node:path";

import { chromium, defineConfig, devices } from "@playwright/test";

/**
 * The one Playwright golden path #58 asks for. Runs against a real `next
 * start` production server (webServer below builds and boots it), not dev —
 * closer to what a pilot teacher's iPad actually loads.
 *
 * PORT is fixed rather than random so a locally-running dev server on 3500
 * (the repo's documented default) is never collided with or reused by
 * accident.
 */
const PORT = 3512;

/**
 * Which chrome binary the suite launches, and why this file decides it rather
 * than a second config file somebody writes in their container (nc#1290).
 *
 * `@playwright/test` pins a browser BUILD, not a version range: 1.62.1 asks for
 * build 1234 and launches nothing else. A Claude Code cloud container ships its
 * own browser under `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` — build 1194 as
 * of 2026-09 — and its own guidance is not to run `playwright install`, so the
 * pinned build does not arrive by itself and `npx playwright test` dies before
 * the first test with
 *
 *     Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1234/…
 *
 * which names a PATH and not a mismatch, so it reads as a broken image. That
 * cost a worker the whole of #1286, where a Playwright repeat-run was the
 * ticket rather than a step in it, and the fix it reached for was a local
 * `playwright.config.ts` beside this one — exactly the kind of file that gets
 * committed by accident. There is one config here, and it answers the question
 * itself.
 *
 * The order matters more than the lookup:
 *
 *  1. `PLAYWRIGHT_CHROMIUM_EXECUTABLE`, verbatim, when somebody has said which
 *     binary they mean. Nothing second-guesses an explicit answer.
 *  2. Otherwise nothing at all when the pinned build is fully installed — the
 *     CI path (`npx playwright install --with-deps chromium`), and every laptop
 *     that has run it. `executablePath` stays undefined there, so this file
 *     changes nothing about the run the evidence bar rests on.
 *  3. Otherwise the pinned build's FULL browser, when it is present but its
 *     headless shell is not. Same build, so no provenance changes hands.
 *  4. Otherwise a browser the container provides at
 *     `$PLAYWRIGHT_BROWSERS_PATH/chromium`, which is a symlink to whichever
 *     build is really installed and so keeps working when that build moves.
 *
 * Step 4 is a DIFFERENT BROWSER from the one the suite pins, so it announces
 * itself on stderr rather than being quietly correct. A repeat-run measurement
 * is only as good as the engine it ran on, and a run that quietly used
 * Chromium 141 where the suite pins 151 is a measurement whose provenance
 * nobody can read off the log. It fires only where the pinned build is absent,
 * which is never in CI and never on a laptop that installed it.
 *
 * Step 3 exists because "is the pinned build installed" has TWO answers here,
 * and Codex caught this file conflating them on the first review of #1294.
 * `chromium.executablePath()` names the full browser, `chromium-<rev>/…/chrome`;
 * a headless launch — this suite's default — runs a SEPARATELY installed
 * artifact, `chromium_headless_shell-<rev>/…`, which is what the failure above
 * actually names. A pruned or partial cache can hold the first without the
 * second, and testing only the first would return early and leave the worker
 * with the very error this file exists to remove.
 */

/**
 * What the pinned build actually has on this machine — the two artifacts, read
 * separately, because a cache can hold either one alone.
 *
 * `shellPresent` is the one thing here that cannot be asked: `executablePath()`
 * takes no argument that names the headless shell — every channel returns the
 * full browser — so it is found next to the full build's own directory, by the
 * layout `playwright install` writes. That is a guess, however small, so an
 * unfamiliar shape falls back to what the full browser says rather than routing
 * a working install to the container: a wrong "absent" would quietly swap the
 * browser under a machine that had the right one, and a wrong "present" only
 * restores the behaviour that shipped before this paragraph existed.
 *
 * Three things review rounds two (`12adfc5d`) and three (`d783f623`) got right
 * about that guess, all of them one mistake — reading one installation shape as
 * the only shape:
 *
 *  - The build directory is FOUND, not counted to. The Linux executable sits
 *    two levels inside it (`chrome-linux64/chrome`); the macOS one sits five
 *    (`chrome-mac/Chromium.app/Contents/MacOS/Chromium`). A fixed depth is
 *    right on one and silently lands on `Contents` on the other, where the
 *    revision never parses and every partial cache answers "present".
 *  - The shell is judged by Playwright's OWN completion marker rather than by
 *    its directory or by a guessed executable name. A pruned cache can leave
 *    the directory standing with nothing usable in it, and the marker is both
 *    the thing `playwright install` writes last and the only platform-neutral
 *    answer available from outside the registry.
 *  - The full browser's ABSENCE is not the pinned build's absence.
 *    `playwright install chromium-headless-shell` is a supported install and
 *    leaves exactly the artifact a headless run wants and nothing else. Giving
 *    up at the missing full executable would override a usable pinned shell
 *    with the container's different build — the worst answer available, and
 *    reached only on a machine that had the right one.
 */
const INSTALLATION_COMPLETE = "INSTALLATION_COMPLETE";

function pinnedBuild(): { executable: string; fullPresent: boolean; shellPresent: boolean } | undefined {
  let executable: string;
  try {
    // Asking Playwright is exact; reconstructing the build number from the
    // package version is a guess that goes stale. The path is read for its
    // SHAPE as well as its contents, so it is useful even when nothing is
    // there: the revision in it is what names the shell beside it.
    executable = chromium.executablePath();
  } catch {
    // Registry unreadable (odd install). Let Playwright raise its own error
    // rather than inventing one here.
    return undefined;
  }
  if (!executable) return undefined;
  const fullPresent = fs.existsSync(executable);

  let buildDir: string | undefined;
  let revision: string | undefined;
  for (let dir = path.dirname(executable); ; dir = path.dirname(dir)) {
    const match = path.basename(dir).match(/^chromium-(.+)$/);
    if (match) {
      buildDir = dir;
      revision = match[1];
      break;
    }
    if (path.dirname(dir) === dir) break; // filesystem root, nothing matched
  }
  // Unfamiliar layout: the shell cannot be named, so the full browser answers
  // for it, which is what this file did before it knew the shell existed.
  if (!buildDir || !revision) return { executable, fullPresent, shellPresent: fullPresent };

  return {
    executable,
    fullPresent,
    shellPresent: fs.existsSync(
      path.join(
        path.dirname(buildDir),
        `chromium_headless_shell-${revision}`,
        INSTALLATION_COMPLETE,
      ),
    ),
  };
}

function resolveChromiumExecutable(): string | undefined {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?.trim();
  if (explicit) return explicit;

  const pinned = pinnedBuild();
  // A headless launch runs the shell, so the shell being there is the whole
  // question — whether or not the full browser is beside it.
  if (pinned?.shellPresent) return undefined;
  if (pinned?.fullPresent) {
    console.warn(
      `[playwright.config] The pinned build's headless shell is not installed, ` +
        `so the suite launches that same build's full browser at ` +
        `${pinned.executable}. Same build as @playwright/test pins — a ` +
        `different artifact of it, not a different engine.`,
    );
    return pinned.executable;
  }

  const provided = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (!provided) return undefined;
  const fallback = path.join(provided, "chromium");
  if (!fs.existsSync(fallback)) return undefined;

  console.warn(
    `[playwright.config] The browser build @playwright/test pins is not ` +
      `installed. Launching the one this container provides at ${fallback} ` +
      `instead. It is a different build, so treat a timing or rendering ` +
      `measurement made on this run accordingly; CI installs the pinned build ` +
      `and never takes this path.`,
  );
  return fallback;
}

const chromiumExecutable = resolveChromiumExecutable();

export default defineConfig({
  testDir: "./tests/e2e",
  // These two are NOT what keeps tests/e2e/reset.ts's sweep from deleting a
  // concurrently running test's teacher — that is held by the worker slot in
  // the seeded address (nc#978), so the sweep stays correct at any worker
  // count. They are here for the ordinary reason: one `next start` on a fixed
  // port, and a suite short enough that serial is not the bottleneck. Raising
  // them is a question about the app's own concurrency, not about the reset.
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  // Runs ONCE, before any worker process starts, and sweeps every parallel
  // slot's leftovers rather than only the slot a worker happens to occupy
  // (nc#982). The per-attempt sweep in tests/e2e/fixtures.ts is deliberately
  // narrowed to the running worker's own slot, so rows left in a slot no later
  // run re-enters — anything a `--workers=4` run abandoned in slots 1-3, say —
  // were swept by nothing at all. Deleting this line puts that leak back with
  // every test still green; `scripts/e2e-reset-lint.mjs` fails the build if it
  // goes.
  globalSetup: "./tests/e2e/global-setup.ts",
  reporter: "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Spread only when there is one: an `executablePath: undefined` beside
        // a `channel` is still a conflict to Playwright, and `devices` is free
        // to grow one. `Desktop Chrome` carries no channel today; this keeps
        // the day it does from being this file's problem.
        ...(chromiumExecutable ? { launchOptions: { executablePath: chromiumExecutable } } : {}),
      },
    },
  ],
  // `next build` runs as its own CI step / local command BEFORE `playwright
  // test`, not inside webServer: bundling ~118s of build into Playwright's
  // own boot-timeout budget made the server look hung rather than slow.
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

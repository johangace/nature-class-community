import { describe, expect, it, afterAll, afterEach, beforeAll } from "vitest";
import { createGuardSandbox, runGuardOnRepo, type GuardSandbox } from "../support/guard-sandbox";

/**
 * A MUTATION TEST for `scripts/verbatim-fidelity.mjs` itself (nc#221).
 *
 * THE INCIDENT THIS PROVES AGAINST: PR#216 rewrote two guarded celebration
 * strings in `packs/summer.json`. The PR's own commit message claimed
 * "Verbatim fidelity ... passes." That claim was never true of the script --
 * the guard fired and CI's "build" job recorded `conclusion: failure` on
 * exactly this diff (job 93878572583, run 31521265613) -- but the PR merged
 * 21 seconds after it was opened, before that job had even reached the
 * verbatim-fidelity step, so the correct failure never blocked anything. A
 * human (mason) caught the drift by inspection afterward and restored the
 * copy in 608af07.
 *
 * So the guard's string-comparison logic was not the thing that failed that
 * day. This file exists so nobody has to take that on faith going forward:
 * it runs the REAL CLI entry point CI runs (`node
 * scripts/verbatim-fidelity.mjs`), not an imported function, against
 * deliberately mutated content, and asserts on the actual process exit code
 * -- the same signal a required CI check acts on.
 *
 * THE MUTATION NO LONGER HAPPENS IN THE WORKING TREE (nc#651). It used to:
 * these tests wrote `packs/summer.json`, ran the guard, and restored the file
 * in a `finally`. Restoring is not enough — vitest runs spec files in
 * parallel, and `loadPack()` reads packs off disk, so other specs were reading
 * a half-written pack and failing at random; a run killed mid-write would have
 * left a truncated grant pack on disk. The damage is now done to a disposable
 * copy (`tests/support/guard-sandbox.ts`), and the green case still runs
 * against the real repository, read-only.
 */

const SUMMER_PACK = "packs/summer.json";
const GUARD = "scripts/verbatim-fidelity.mjs";
const STRAY_FIXTURE = "fixtures/source-rows/zzz-mutation-test-uncovered.json";

describe("scripts/verbatim-fidelity.mjs", () => {
  let sandbox: GuardSandbox;

  beforeAll(() => {
    sandbox = createGuardSandbox("verbatim-fidelity");
  });
  afterEach(() => {
    // Whether the test passed or threw, the next one starts from the copy as
    // it was taken. Nothing here can reach the working tree either way.
    sandbox.restore();
  });
  afterAll(() => {
    sandbox.dispose();
  });

  it("passes green on the repo's actual, unmodified guarded content", () => {
    const { status, output } = runGuardOnRepo(GUARD);
    expect(status).toBe(0);
    expect(output).toMatch(/Verbatim fidelity passed/);
  });

  describe("mutation: a guarded celebration string diverges (the PR#216 shape)", () => {
    it("goes RED (non-zero exit, names the string) when the pack rewrites it, and back to GREEN once restored", () => {
      // Reproduce PR#216's actual edit: rewrite summer-w1-counting-life's
      // celebration headline and keepsake to the "honest" replacement text
      // that PR did ship, without touching the source-of-truth fixture.
      const original = sandbox.read(SUMMER_PACK);
      const pack = JSON.parse(original);
      const session = pack.sessions.find(
        (s: { id: string }) => s.id === "summer-w1-counting-life"
      );
      expect(session).toBeTruthy();
      expect(session.celebration.headline).toBe("Your class found life everywhere.");
      session.celebration.headline = "You went out and looked for life.";
      session.celebration.keepsake = "Ten slow steps, eyes open.";
      sandbox.write(SUMMER_PACK, JSON.stringify(pack, null, 2));

      // RED
      const red = sandbox.run(GUARD);
      expect(red.status).not.toBe(0);
      expect(red.output).toMatch(/Verbatim fidelity FAILED/);
      expect(red.output).toMatch(/summer-w1-counting-life/);
      expect(red.output).toMatch(/celebration\.headline/);
      expect(red.output).toMatch(/Your class found life everywhere\./);

      // Restore and confirm GREEN again.
      sandbox.write(SUMMER_PACK, original);
      const green = sandbox.run(GUARD);
      expect(green.status).toBe(0);
      expect(green.output).toMatch(/Verbatim fidelity passed/);
    });
  });

  describe("mutation: a fixture exists that no CHECKS entry reads (nc#221 hardening)", () => {
    it("goes RED when a fixture file is not wired into CHECKS, and GREEN once it is removed", () => {
      expect(sandbox.exists(STRAY_FIXTURE)).toBe(false);
      sandbox.write(STRAY_FIXTURE, "[]\n");

      const red = sandbox.run(GUARD);
      expect(red.status).not.toBe(0);
      expect(red.output).toMatch(/zzz-mutation-test-uncovered\.json/);
      expect(red.output).toMatch(/no CHECKS entry/);

      sandbox.remove(STRAY_FIXTURE);
      const green = sandbox.run(GUARD);
      expect(green.status).toBe(0);
      expect(green.output).toMatch(/Verbatim fidelity passed/);
    });
  });
});

/**
 * The deterministic suite does not talk to the internet (nc#808).
 *
 * WHY THIS FILE EXISTS. `tests/unit/speak-and-show-run-contract.spec.tsx`
 * renders the real `/cast` server component, and rendering it made two
 * sequential HTTPS reads of `pointmoon.vercel.app` — a third-party production
 * service — inside a unit test. The test's runtime was therefore Pointmoon's
 * response time, and its pass/fail was a race between that and vitest's
 * budget. Measured from one machine on one afternoon, a single Pointmoon read
 * took between 1102ms and 2976ms; the render makes two of them back to back,
 * and `lib/outside/pointmoon.ts` records Pointmoon's measured COLD response as
 * ~8.3s and allows it 10s before aborting. So the honest bound on that render
 * is about twenty seconds, and no test budget can be set high enough to make
 * the outcome a fact about this repository rather than about someone else's
 * deploy. It failed twice in two days on PRs whose diffs could not touch it
 * (a docs-only PR on 2026-08-31; run 33514858557 on PR #805 on 2026-09-01).
 *
 * Raising the budget is not a fix and this repo has already tried it: #810
 * moved the render into a shared `beforeAll` with a 15s hook budget, which
 * still fails 6/6 when Pointmoon answers at the cold latency its own client
 * documents. The cause is not the number. The cause is that a unit test was
 * allowed to depend on a network at all.
 *
 * WHAT IT DOES. Every fetch to a non-loopback host is refused, loudly, naming
 * the URL. Loopback is allowed on purpose: several specs already stand up a
 * local stub server (the geocode specs bind one on 127.0.0.1, and one spec
 * points a client at 127.0.0.1:9 precisely to watch a connection fail), and
 * those are hermetic — the machine owns both ends.
 *
 * A refusal is recorded as well as thrown, because throwing is not enough on
 * its own: `lib/cast/surface.ts` wraps its whole read in `catch {}` by design,
 * so a thrown refusal there would be swallowed and the surface would render a
 * plausible empty cast instead of failing. The `afterEach` below turns any
 * swallowed refusal into a red test that names the URL that caused it.
 *
 * WHAT TO DO WHEN IT BITES YOU. Do not reach for the escape hatch. Serve the
 * dependency from a recorded fixture the way the rest of the suite does —
 * `POINTMOON_FIXTURE_PATH` (see `lib/outside/pointmoon.ts`) points every
 * Pointmoon read at a committed payload under `tests/fixtures/pointmoon/`,
 * and `vi.stubEnv` is how six specs already use it. The escape hatch,
 * `NC_ALLOW_LIVE_NETWORK=1`, exists for a human running a deliberate live
 * smoke by hand, and is never set in CI.
 */

import { afterEach, expect } from "vitest";

const ALLOWED_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0", "[::1]"]);

let violations: string[] = [];

/** Drain and return the refusals recorded so far. Used by the guard's own spec. */
export function takeNetworkViolations(): string[] {
  const taken = violations;
  violations = [];
  return taken;
}

function urlOf(input: unknown): string | null {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof input === "object" && input !== null && "url" in input) {
    const url = (input as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return null;
}

/** True only for a host this machine owns both ends of. */
function isLoopback(raw: string | null): boolean {
  if (raw === null) return false;
  try {
    return ALLOWED_HOSTS.has(new URL(raw).hostname);
  } catch {
    // Not a parseable absolute URL. Node's own fetch will reject it on its
    // own terms; that is a local failure, not an outbound request.
    return true;
  }
}

if (process.env.NC_ALLOW_LIVE_NETWORK !== "1") {
  const live = globalThis.fetch;

  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = urlOf(input);
    if (isLoopback(url)) return live(input, init);

    const message =
      `Live network refused in the deterministic suite: ${url ?? "<unknown url>"}. ` +
      `A unit test's result must not depend on a third party's response time (nc#808). ` +
      `Serve this from a recorded fixture — for Pointmoon, vi.stubEnv("POINTMOON_FIXTURE_PATH", ` +
      `"tests/fixtures/pointmoon/london_uk.json"). See tests/support/no-live-network.ts.`;
    violations.push(message);
    return Promise.reject(new Error(message));
  }) as typeof fetch;
}

afterEach(() => {
  // Reported here as well as thrown, so a refusal swallowed by a caller's own
  // `catch` still turns the build red instead of quietly changing what the
  // test rendered.
  const swallowed = takeNetworkViolations();
  expect(swallowed, swallowed.join("\n")).toEqual([]);
});

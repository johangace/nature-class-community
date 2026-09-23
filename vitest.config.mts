import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The deterministic suite: unit + integration, run in CI on every push. The
 * Playwright golden path (tests/e2e) is separate on purpose — it needs a
 * running server and is invoked via its own script, not `vitest run`.
 *
 * Integration tests that need a database read DATABASE_URL and self-skip
 * (describe.skipIf) when it is unset, so `npm test` stays runnable with zero
 * setup for the pure-logic majority of the suite. See tests/integration/README.md
 * for the fixture database this repo's CI provisions.
 */
export default defineConfig({
  test: {
    environment: "node",
    // `.spec.tsx` so a spec can write JSX directly and assert the markup a
    // surface actually produces. The oxc JSX transform below (added with
    // #177) already lets a spec IMPORT a .tsx component; this lets one BE
    // .tsx, which is what rendering two captioned groups needs.
    include: [
      "tests/unit/**/*.spec.ts",
      "tests/unit/**/*.spec.tsx",
      "tests/integration/**/*.spec.ts",
    ],
    // No test in this suite may read the live internet (nc#808). The one that
    // did — the /cast render — was timing out in CI on unrelated PRs, because
    // its runtime was a third party's response time rather than anything in
    // this repository. The file explains the refusal and the fixture seam that
    // replaces it. Loopback stubs stay allowed; several specs bind one.
    setupFiles: ["./tests/support/no-live-network.ts"],
    passWithNoTests: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // Next aliases this specifier to its own compiled copy; there is no
      // package to resolve outside a Next build. See tests/stubs/server-only.ts.
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url)
      ),
    },
  },
  /**
   * tsconfig sets `jsx: "preserve"` because Next.js does its own JSX
   * transform, which leaves vitest unable to import a .tsx file at all. The
   * honesty spine (tests/unit/outside-honesty.spec.ts) asserts on what a card
   * actually renders, not only on the data behind it, so the test runner needs
   * its own transform. This does not affect the Next build.
   */
  oxc: {
    jsx: { runtime: "automatic", importSource: "react" },
  },
});

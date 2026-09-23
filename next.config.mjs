import withSerwistInit from "@serwist/next";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";

/**
 * @serwist/next scans public/ with these globs before InjectManifest's webpack
 * exclusions run. Keep the generated audio corpora and the lesson photography
 * out here so a fresh or upgraded install does not pull the whole curriculum
 * into the app shell.
 *
 * THE LIST IS A RULE, NOT A LEDGER OF FOLDERS SOMEBODY REMEMBERED (#1077).
 * `lesson-examples` and `lesson-illustrations` arrived on 2026-09-04 and
 * 2026-09-07 (#961, #1050, #1056) as ordinary additions to public/, and the
 * scan swept them in: the install-time shell went from 0.14 MB to 3.32 MB
 * without one line of this file changing. Nothing failed — a PWA install
 * simply started downloading megabytes of photographs of lessons a given
 * school will never run, competing for the same classroom wifi as the board
 * a teacher is standing in front of.
 *
 * That is word for word the argument the audio corpora are excluded on, so
 * these join them under the same rule and are cached the same way: at
 * RUNTIME, CacheFirst, warmed only when a teacher actually opens the lesson.
 * See the lesson-image rule in app/sw.ts.
 *
 * Source: https://github.com/serwist/serwist/blob/main/packages/next/src/index.ts
 */
export const PUBLIC_PRECACHE_PATTERNS = [
  "*",
  "!(landing|lesson-audio|lesson-preview|lesson-examples|lesson-illustrations)/**/*",
];

function offlineBuildRevision() {
  const deployedRevision =
    process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GITHUB_SHA;
  if (deployedRevision) return deployedRevision;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: import.meta.dirname,
      encoding: "utf8",
    }).trim();
  } catch {
    // Source-archive builds may have no .git directory. Hash the fallback
    // shell sources rather than ship an unrevisioned precache entry.
    const hash = createHash("sha256");
    for (const file of [
      "app/field/page.tsx",
      "app/field/FieldShell.tsx",
      "app/field/DepartureCheck.tsx",
      "app/field/field.module.css",
      "app/field/print/page.tsx",
      "app/field/print/FieldPrint.tsx",
      "lib/offline/field-location.ts",
    ]) {
      hash.update(readFileSync(new URL(file, import.meta.url)));
    }
    return hash.digest("hex");
  }
}

export const OFFLINE_BUILD_REVISION = offlineBuildRevision();

const publicDirectory = fileURLToPath(new URL("./public/", import.meta.url));
export const PUBLIC_PRECACHE_ENTRIES = globSync(PUBLIC_PRECACHE_PATTERNS, {
  cwd: publicDirectory,
  nodir: true,
  follow: true,
  ignore: ["sw.js", "sw.js.map", "swe-worker-*.js", "swe-worker-*.js.map"],
}).map((file) => ({
  url: `/${file}`,
  revision: createHash("sha256")
    .update(readFileSync(new URL(`./public/${file}`, import.meta.url)))
    .digest("hex"),
}));

/**
 * @serwist/next uses additionalPrecacheEntries INSTEAD OF its public-folder
 * scan when this option is present. Combine both sets explicitly so adding the
 * data-free navigation fallback cannot displace core-v1.json.
 */
export const ADDITIONAL_PRECACHE_ENTRIES = [
  ...PUBLIC_PRECACHE_ENTRIES,
  { url: "/field", revision: OFFLINE_BUILD_REVISION },
  { url: "/field/print", revision: OFFLINE_BUILD_REVISION },
];

/**
 * Offline for the field. Serwist (the maintained next-pwa successor) compiles
 * app/sw.ts into public/sw.js at build time and registers it. The strategy is
 * deliberately conservative — network-first for pages, never-cache for the API
 * — so an online teacher always sees fresh content and only a genuinely
 * offline device falls back to the cached shell. Paper stays the deep offline;
 * this is the belt to those braces.
 *
 * Disabled in development so the service worker never fights hot-reload.
 */
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Next/Image serves responsive derivatives from /_next/image. Precaching the
  // raw landing photographs would add megabytes to every PWA install without
  // satisfying those requests; the signed-out marketing surface does not need
  // its documentary media in the classroom's offline shell.
  globPublicPatterns: PUBLIC_PRECACHE_PATTERNS,
  additionalPrecacheEntries: ADDITIONAL_PRECACHE_ENTRIES,
  /**
   * A RETURNING SIGNAL MUST NOT THROW THE PAGE AWAY (nc#774).
   *
   * @serwist/next defaults this to true, and true means exactly one line of
   * client code:
   *
   *     window.addEventListener("online", () => location.reload())
   *
   * (`node_modules/@serwist/next/dist/sw-entry.mjs`; the default is declared in
   * its options schema, and nothing in this repo had ever chosen it.)
   *
   * On the field surface that is the wrong reflex twice over.
   *
   * It is wrong for the teacher. `/field` is the one page whose whole promise
   * is that it keeps working when the signal does not, and a playground's
   * signal does not fail once — it flaps. Every flap back to "online" reloaded
   * the document out from under her: an open lesson, a half-made choice, and —
   * the case that caught this — a navigation already in flight. Tapping Print
   * with no signal starts a navigation the service worker answers from the
   * precache in a few milliseconds; an `online` event landing inside that
   * window calls `location.reload()`, the browser aborts the print navigation
   * (net::ERR_ABORTED) and re-commits the page she was already on. She taps
   * Print, the screen flickers, and she is still looking at the runner.
   *
   * It is also wrong as engineering: the reload buys nothing this app does not
   * already do better in place. FieldShell listens for `online`/`offline`
   * itself, re-derives the connection banner and re-proves offline readiness at
   * every lifecycle boundary (app/field/FieldShell.tsx), and
   * OfflineOwnerLifecycle re-syncs the owner on the same event. A blanket
   * reload replaces that careful, state-preserving reconnection with a blunt
   * one that discards it.
   *
   * This was found as an intermittent CI failure, on main among other
   * branches: the offline e2e test's Print click was aborted this way on 2 of
   * 20 local repeats before this change and 0 of 20 after (60 of 60 across the
   * whole spec). The test was right; the page really was refusing to open.
   *
   * `tests/e2e/offline-field.spec.ts` pins the behaviour: it takes the signal
   * away and gives it back, and fails if the document is replaced.
   */
  reloadOnOnline: false,
  /**
   * The spoken-line recordings (#358) are served from public/lesson-audio and
   * must NOT be precached. Precaching downloads the whole set on install, and
   * the whole set is the entire curriculum's audio — megabytes of lessons a
   * given school will never run, pushed onto every shared iPad the first time
   * it opens the app.
   *
   * Lesson-preview is a second, larger narrated corpus with the same rule. Both
   * are cached at runtime instead, CacheFirst, warmed only on teacher use. See
   * the audio rule in app/sw.ts.
   */
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: import.meta.dirname,
  /**
   * Authored content is read from disk at runtime, so it has to be traced into
   * the serverless bundle. `packs/` has been reaching production on the
   * tracer's cwd heuristic alone — it works, and it is luck, because the path
   * is built dynamically and nothing declares the dependency. `prompts/` is
   * the same shape and now carries every word the model is given, so both are
   * named explicitly rather than left to inference.
   */
  outputFileTracingIncludes: {
    "/**": ["./prompts/**/*.md", "./packs/**/*.json"],
    "/opengraph-image": ["./app/globals.css"],
  },
  /**
   * The Settings tab lives at /classes, so /settings is the guess a teacher
   * makes and the 404 they actually hit. Send it where they meant to go.
   */
  async redirects() {
    return [
      { source: "/welcome", destination: "/", permanent: true },
      { source: "/settings", destination: "/classes", permanent: false },
      /**
       * The retired plan stops (nc#232). Place, route and take were folded into
       * the doorway or the runner, so each lands on what it became.
       *
       * These are HTTP redirects on purpose. The page-level `redirect()` was
       * tried first and is wrong here: on a DIRECT hit it answered 200 with an
       * empty body rather than a Location, which is the precise failure this
       * ticket exists to remove — a home-screened or cached sub-route opening
       * on a blank page for a teacher standing in a field. A 307 from the
       * config cannot do that, and it works before any React runs.
       *
       * Not `permanent`. These are retired routes in an app that still has the
       * legacy mode alive behind them; a 308 is cached by browsers effectively
       * forever, and we would rather be able to change our minds this week.
       *
       * `missing` keeps `?plan=legacy` out of the redirect so the retired flow
       * can still be walked end to end for comparison.
       */
      /**
       * NOTE: `primer` is deliberately NOT in this list. It is a real page
       * again — Johan: "Read Primer with keyowrds goals, structure long in a
       * page separate" — because the primer is a different READ (seated, the
       * night before) from the doorway, and folding it into the doorway
       * demoted background knowledge to something optional. Re-adding it here
       * would silently bounce the doorway's own "Read the primer" link.
       */
      ...[
        // Kit and space live on the doorway itself, which is short enough to
        // need no anchor.
        ["place", "/session"],
        // The shape of the hour moved to the primer, where a teacher reads it
        // the night before. The spoken lines stayed in the runner.
        ["route", "/session/primer"],
        // Paper became its own step with its own choices.
        ["take", "/print"],
      ].map(([stop, destination]) => ({
        source: `/session/${stop}`,
        destination,
        permanent: false,
        missing: [{ type: "query", key: "plan", value: "legacy" }],
      })),
    ];
  },
};

export default withSerwist(nextConfig);

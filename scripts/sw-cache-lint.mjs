#!/usr/bin/env node
// Service-worker cache-boundary lint (issue #52). The classroom app is a PWA on
// a shared iPad, and the one thing its cache must never do is serve a signed-in
// teacher's personalised page to the next teacher after sign-out. That boundary
// lives in lib/sw-cache-policy.ts (imported by app/sw.ts, which compiles to a
// webworker bundle a plain-node test can't load). This script transpiles that
// policy in memory and asserts the exact rules the worker ships with, so the
// boundary is a red build rather than a manual promise.
//
// It proves, without a browser:
//   1. Personalised navigations (/, /classes, /journal, /read, /run, /start,
//      /season, /print) are never persisted — they resolve to "network-only".
//   2. The public, non-personalised sign-in page is
//      cacheable and therefore work offline.
//   3. On sign-out / worker activate, the sweep drops a cached authenticated
//      page and any legacy blanket "pages" cache, while keeping the public
//      cache, exact active Serwist precache, and public audio/media runtime
//      caches — i.e. the app shell and selected field media survive, while the
//      private page and retired 39 MB precache do not.
//
// SCOPE: NEITHER. It reads lib/sw-cache-policy.ts and asserts routing rules —
// no prose, house or founder. It does not open `packs/` or `fixtures/`.
// Listed because every check in this repo now says whose writing it governs;
// see `scripts/authorship.mjs` for why that stopped being optional.

import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { globSync } from "glob";
import ts from "typescript";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const policyPath = join(root, "lib", "sw-cache-policy.ts");
const cleanupPath = join(root, "lib", "sw-cache-cleanup.ts");

// Transpile the real policy module and load it as ESM (no type-checking here;
// tsc --noEmit in CI already type-checks it).
const importTypeScript = async (path) => {
  const source = readFileSync(path, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  const moduleUrl =
    "data:text/javascript;base64," + Buffer.from(outputText).toString("base64");
  return import(moduleUrl);
};

const policy = await importTypeScript(policyPath);
const cleanup = await importTypeScript(cleanupPath);
const {
  PUBLIC_PRECACHE_PATTERNS,
  PUBLIC_PRECACHE_ENTRIES,
  ADDITIONAL_PRECACHE_ENTRIES,
  OFFLINE_BUILD_REVISION,
} = await import(
  pathToFileURL(join(root, "next.config.mjs")).href
);

const {
  cacheDecisionForNavigation,
  isSpokenAudioRequest,
  isLessonImageRequest,
  AUDIO_CACHE,
  LESSON_IMAGE_CACHE,
  MEDIA_CACHE,
  OFFLINE_FALLBACK_ROUTE,
  OFFLINE_PRINT_FALLBACK_ROUTE,
  PUBLIC_CACHE,
  PUBLIC_ROUTES,
} = policy;
const { cacheNamesToDelete } = cleanup;

const failures = [];
const check = (name, cond) => {
  if (!cond) failures.push(name);
};

// --- 1. Personalised navigations must never be persisted ---------------------
const PRIVATE_PAGES = [
  "/", // teacher-aware public landing
  "/welcome", // landing alias with the same session-aware action
  "/today", // Today: active class, minutes, completions
  "/classes", // school/class roster
  "/journal", // class evidence
  "/run", // runner, class-bound logging
  "/start", // onboarding with teacher
  "/season", // teacher progress
  "/print", // class-scoped print output
  "/read", // resolves active-class place adaptation and nearby observations
  "/session", // lesson preparation renders the teacher's class name and year group
  "/session/preview", // the narrated preview resolves through the same loader (#515)
];
for (const path of PRIVATE_PAGES) {
  check(
    `private page ${path} is network-only (not cached)`,
    cacheDecisionForNavigation(path) === "network-only",
  );
}

// --- 2. Public pages must be cacheable (offline-safe) ------------------------
const PUBLIC_PAGES = ["/sign-in"];
for (const path of PUBLIC_PAGES) {
  check(
    `public page ${path} is cacheable (offline path holds)`,
    cacheDecisionForNavigation(path) === "public-cache",
  );
  check(
    `public page ${path} is on the allowlist`,
    PUBLIC_ROUTES.has(path),
  );
}

// A route added tomorrow is private by default until deliberately allowlisted.
check(
  "an unknown route defaults to network-only",
  cacheDecisionForNavigation("/some-future-teacher-page") === "network-only",
);
check(
  "the public cache is bumped for the teacher-aware landing migration",
  PUBLIC_CACHE === "nc-public-v3",
);
check(
  "the data-free field shell is the navigation fallback",
  OFFLINE_FALLBACK_ROUTE === "/field",
);
check(
  "the field fallback is explicitly precached",
  ADDITIONAL_PRECACHE_ENTRIES.some(
    (entry) => entry.url === OFFLINE_FALLBACK_ROUTE,
  ),
);
check(
  "the field print fallback is explicitly precached",
  OFFLINE_PRINT_FALLBACK_ROUTE === "/field/print" &&
    ADDITIONAL_PRECACHE_ENTRIES.some(
      (entry) => entry.url === OFFLINE_PRINT_FALLBACK_ROUTE,
    ),
);
check(
  "the field fallback precache entry is revisioned",
  typeof OFFLINE_BUILD_REVISION === "string" &&
    OFFLINE_BUILD_REVISION.length >= 7 &&
    ADDITIONAL_PRECACHE_ENTRIES.some(
      (entry) => entry.revision === OFFLINE_BUILD_REVISION,
    ) &&
    ADDITIONAL_PRECACHE_ENTRIES.some(
      (entry) =>
        entry.url === OFFLINE_PRINT_FALLBACK_ROUTE &&
        entry.revision === OFFLINE_BUILD_REVISION,
    ),
);
check(
  "the explicit manifest keeps exactly one open-core artifact",
  PUBLIC_PRECACHE_ENTRIES.filter(
    (entry) => entry.url === "/offline/core-v1.json",
  ).length === 1 &&
    ADDITIONAL_PRECACHE_ENTRIES.filter(
      (entry) => entry.url === "/offline/core-v1.json",
    ).length === 1,
);
check(
  "the explicit manifest keeps both audio corpora runtime-only",
  !ADDITIONAL_PRECACHE_ENTRIES.some(
    (entry) =>
      entry.url.startsWith("/lesson-audio/") ||
      entry.url.startsWith("/lesson-preview/"),
  ),
);

// --- 3. Sweep behaviour: purge drops retired, keeps the exact active caches --
// Model Cache Storage as it looks after a teacher used the app under a worker
// that blanket-cached pages and public audio. purgeStaleCaches keeps only the
// exact cache names supplied by the active worker.
const cachesBeforeSweep = [
  PUBLIC_CACHE, // public pages — keep
  "serwist-precache-v2-http://localhost/", // current app shell — keep
  "serwist-precache-v1-http://localhost/", // retired app shell — drop
  "serwist-runtime-http://localhost/", // unowned Serwist runtime — drop
  "pages", // legacy blanket cache that held authenticated HTML — drop
  "nc-public-v1", // the public cache that could hold personalised /read — drop
  AUDIO_CACHE, // selected lesson audio — keep
  MEDIA_CACHE, // public observation photographs — keep
  LESSON_IMAGE_CACHE, // lesson photography and illustration — keep
];
const deletionPlan = cacheNamesToDelete(cachesBeforeSweep, {
  currentPrecache: "serwist-precache-v2-http://localhost/",
  currentPublicCache: PUBLIC_CACHE,
  persistentRuntimeCaches: [AUDIO_CACHE, MEDIA_CACHE, LESSON_IMAGE_CACHE],
});
const cachesAfterSweep = cachesBeforeSweep.filter(
  (name) => !deletionPlan.includes(name),
);

check(
  "sweep DROPS the legacy blanket 'pages' cache (the leak)",
  !cachesAfterSweep.includes("pages"),
);
check(
  "sweep DROPS an older public-cache version",
  !cachesAfterSweep.includes("nc-public-v1"),
);
check(
  "sweep DROPS a retired Serwist precache",
  !cachesAfterSweep.includes("serwist-precache-v1-http://localhost/"),
);
check(
  "sweep DROPS an unowned Serwist runtime cache",
  !cachesAfterSweep.includes("serwist-runtime-http://localhost/"),
);
check(
  "sweep KEEPS the current public cache (demo/offline path)",
  cachesAfterSweep.includes(PUBLIC_CACHE),
);
check(
  "sweep KEEPS Serwist's precache (app shell)",
  cachesAfterSweep.includes("serwist-precache-v2-http://localhost/"),
);
check("sweep KEEPS the audio cache", cachesAfterSweep.includes(AUDIO_CACHE));
check("sweep KEEPS the media cache", cachesAfterSweep.includes(MEDIA_CACHE));
check(
  "sweep KEEPS the lesson-image cache",
  cachesAfterSweep.includes(LESSON_IMAGE_CACHE),
);

// --- 4. Public-folder precache boundary -------------------------------------
// @serwist/next scans public/ with globPublicPatterns before InjectManifest's
// webpack `exclude` option applies. Exercise the configured globs against the
// real public tree so neither audio corpus can silently return to the install.
check(
  "next.config exports the public precache patterns for verification",
  Array.isArray(PUBLIC_PRECACHE_PATTERNS),
);
const publicPrecacheEntries = Array.isArray(PUBLIC_PRECACHE_PATTERNS)
  ? globSync(PUBLIC_PRECACHE_PATTERNS, {
      cwd: join(root, "public"),
      nodir: true,
      follow: true,
      ignore: ["sw.js", "sw.js.map", "swe-worker-*.js", "swe-worker-*.js.map"],
    })
  : [];
check(
  "the normal public app assets remain in the precache scan",
  publicPrecacheEntries.includes("brand/nature-class-seed.svg"),
);
check(
  "the lesson-audio corpus is excluded from public precache",
  !publicPrecacheEntries.some((entry) => entry.startsWith("lesson-audio/")),
);
check(
  "the lesson-preview corpus is excluded from public precache",
  !publicPrecacheEntries.some((entry) => entry.startsWith("lesson-preview/")),
);
// #1077: two folders of photography were swept into the install shell simply
// by existing. The rule is that lesson MEDIA is runtime-cached, whatever it is
// made of, so the check names the folders rather than trusting the next
// content PR to remember this file.
check(
  "the lesson photography is excluded from public precache",
  !publicPrecacheEntries.some((entry) => entry.startsWith("lesson-examples/")),
);
check(
  "the lesson illustration is excluded from public precache",
  !publicPrecacheEntries.some((entry) => entry.startsWith("lesson-illustrations/")),
);
// The install shell is small on purpose. A number rather than a folder list:
// the next folder of pictures added to public/ trips this even if nobody
// thought to name it above.
const publicPrecacheBytes = publicPrecacheEntries.reduce(
  (total, entry) => total + statSync(join(root, "public", entry)).size,
  0,
);
check(
  `the install shell stays under 1 MB of public assets (is ${(publicPrecacheBytes / 1e6).toFixed(2)} MB)`,
  publicPrecacheBytes < 1_000_000,
);

// --- 5. The spoken-line audio boundary (#358) --------------------------------
// These recordings are pack content — the identical file for every school, no
// teacher, class or child in them — so they may be cached where a navigation
// may not, and they survive the sign-out sweep. The boundary that has to hold
// is that the rule catches ONLY them: same-origin, under the prefix, .mp3.
check(
  "a spoken-line recording is cacheable",
  isSpokenAudioRequest(true, "/lesson-audio/0123456789abcdef.mp3"),
);
check(
  "a cross-origin file under the same path is NOT",
  !isSpokenAudioRequest(false, "/lesson-audio/0123456789abcdef.mp3"),
);
check(
  "a non-mp3 under the prefix is NOT",
  !isSpokenAudioRequest(true, "/lesson-audio/index.html"),
);
check(
  "a personalised page is NOT caught by the audio rule",
  !isSpokenAudioRequest(true, "/run"),
);
// The lesson preview's narrated cards (#515) share this cache and this rule:
// the same argument holds for them word for word, and they must not need a
// second boundary to keep straight.
check(
  "a lesson-preview recording is cacheable",
  isSpokenAudioRequest(true, "/lesson-preview/0123456789abcdef.mp3"),
);
check(
  "a cross-origin file under the preview path is NOT",
  !isSpokenAudioRequest(false, "/lesson-preview/0123456789abcdef.mp3"),
);
check(
  "a non-mp3 under the preview prefix is NOT",
  !isSpokenAudioRequest(true, "/lesson-preview/index.html"),
);

// --- 6. The lesson-image boundary (#1077) ------------------------------------
// Same argument as the recordings above, and the same shape of boundary: it
// must catch ONLY the pictures this app ships, same-origin, under the prefix.
check(
  "a lesson photograph is cacheable",
  isLessonImageRequest(true, "/lesson-examples/woodlice.webp"),
);
check(
  "a lesson illustration is cacheable",
  isLessonImageRequest(true, "/lesson-illustrations/animal-masks/fox.webp"),
);
check(
  "a cross-origin file under the same path is NOT",
  !isLessonImageRequest(false, "/lesson-examples/woodlice.webp"),
);
check(
  "the provenance README under the prefix is NOT",
  !isLessonImageRequest(true, "/lesson-examples/README.md"),
);
check(
  "a personalised page is NOT caught by the lesson-image rule",
  !isLessonImageRequest(true, "/run"),
);

// --- Report ------------------------------------------------------------------
if (failures.length > 0) {
  console.error(
    `SW cache lint FAILED. ${failures.length} boundary rule(s) broken:`,
  );
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "A personalised page must never be persistently cached, and sign-out must " +
      "sweep private caches. See app/sw.ts and lib/sw-cache-policy.ts (#52).",
  );
  process.exit(1);
}

console.log(
  `SW cache lint passed: ${PRIVATE_PAGES.length} private page(s) network-only, ` +
    `${PUBLIC_PAGES.length} public page(s) cacheable, audio corpora runtime-only, ` +
    "upgrade cleanup exact-name safe.",
);

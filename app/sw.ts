import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  CacheableResponsePlugin,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  cacheNames,
} from "serwist";
import { cacheNamesToDelete } from "@/lib/sw-cache-cleanup";
import {
  AUDIO_CACHE,
  LESSON_IMAGE_CACHE,
  MEDIA_CACHE,
  OFFLINE_FALLBACK_ROUTE,
  OFFLINE_PRINT_FALLBACK_ROUTE,
  PUBLIC_CACHE,
  PUBLIC_ROUTES,
  PURGE_PRIVATE_CACHES,
  isCacheableImageRequest,
  isLessonImageRequest,
  isSpokenAudioRequest,
} from "@/lib/sw-cache-policy";

/**
 * The field service worker. Two laws pull against each other and both must hold:
 *
 *   1. An online teacher must always get fresh content — the classroom app can
 *      never serve yesterday's session because a cache went stale.
 *   2. A shared iPad is a shared device. When a teacher signs out, nothing they
 *      saw may survive in the cache for the next teacher to read offline. A
 *      personalised page — Today with a class's minutes, /classes with a
 *      school's roster, /journal, /read, the runner, /start, /season and
 *      /print — carries one teacher's context and must never be persistently
 *      cached (issue #52).
 *
 * So the caching is allowlisted, not blanket:
 *
 *   - The API (/api/*): NetworkOnly, never cached. Auth, live conditions, and
 *     session logging must be live or fail honestly — a cached auth or a cached
 *     "log" would be worse than an error. (Logging has its own localStorage
 *     queue for the offline case.)
 *   - Public, non-personalised pages (PUBLIC_ROUTES below): NetworkFirst into a
 *     versioned public cache. These render the same for everyone signed in or
 *     out — currently only sign-in — so caching them leaks nothing.
 *   - Every other navigation (the personalised pages): NetworkOnly. Fresh when
 *     online; honestly unavailable offline rather than served from a cache that
 *     would outlive the session. Paper remains the deep offline for the field,
 *     and the runner keeps its own resume/queue state in localStorage.
 *   - Build assets (precache): the shell — JS, CSS, fonts — cached on install so
 *     the cached public pages actually render offline. Deliberately NOT the
 *     lesson audio, preview narration or lesson photography: those are pack
 *     content by the megabyte, cached at runtime on first use instead.
 *
 * On sign-out the client posts PURGE_PRIVATE_CACHES; the worker keeps only the
 * exact active precache, the current public cache, and the explicitly public
 * media/audio runtime caches. Prefix matching is forbidden: it would preserve
 * an old audio-heavy precache from a previous worker.
 *
 * The public cache is versioned (PUBLIC_CACHE). Bumping the version is how a fix
 * reaches an already-installed, sticky service worker: on activate we delete
 * every cache whose name is not in the current keep-set, so old caches —
 * including the legacy blanket "pages" cache that this change replaces — are
 * cleaned up the moment the new worker takes over.
 */

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * The public-route allowlist, the versioned cache name, and the keep/drop rule
 * live in @/lib/sw-cache-policy so a plain-node test can assert the exact
 * boundary this worker ships with. The full reasoning for each public route is
 * documented there:
 *
 *   /sign-in — the only navigation cached here.
 *
 * The teacher-aware landing (/ and /welcome), Today (/today), /classes,
 * /journal, /read, /run, /start, /season and /print are deliberately absent:
 * they fall through to NetworkOnly.
 */

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Serwist removes entries no longer present in this worker's manifest and
  // incompatible precache cache names during activate. Our explicit sweep
  // below also removes this app's retired public/runtime caches.
  // Source: https://serwist.pages.dev/docs/serwist/guide/precaching#cleaning-up-old-precaches
  precacheOptions: { cleanupOutdatedCaches: true },
  skipWaiting: true,
  clientsClaim: true,
  // A failed navigation preload races Chromium's cached field response and
  // can complete `/field/print` with the generic `/field` fallback. These two
  // tiny static shells are already precached, so the race buys no useful
  // latency; the current worker's revisioned precache owns both documents.
  navigationPreload: false,
  runtimeCaching: [
    {
      // Never cache the API: it must be live (auth, conditions, completions).
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkOnly(),
    },
    {
      // Photographs from the record's own hosts (#375): cache-first, so a
      // lesson opened on staffroom wifi still shows its photo references in a
      // field with no signal. Opaque (no-cors) responses are the normal case
      // for a cross-origin <img>, so status 0 is deliberately cacheable here.
      // Bounded: the cap and age keep a shared iPad's storage honest.
      matcher: ({ request, url, sameOrigin }) =>
        isCacheableImageRequest(sameOrigin, request.destination, url.protocol),
      handler: new CacheFirst({
        cacheName: MEDIA_CACHE,
        plugins: [
          new CacheableResponsePlugin({ statuses: [0, 200] }),
          new ExpirationPlugin({
            maxEntries: 120,
            maxAgeSeconds: 28 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    {
      // The spoken-line recordings (#358) and the lesson preview's narrated
      // cards (#515): cache-first, so a teacher who
      // pressed play on staffroom wifi still has the rest of the lesson's
      // audio in a field with no signal. Content-addressed filenames, so a
      // cached file can never be stale — a changed line gets a new name.
      // Pack content, identical for every school, so this survives the
      // sign-out sweep exactly as the photograph cache does.
      matcher: ({ url, sameOrigin }) => isSpokenAudioRequest(sameOrigin, url.pathname),
      handler: new CacheFirst({
        cacheName: AUDIO_CACHE,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            // #358's corpus is 225 files and #515's is 485; they share this
            // cache and the ceiling has to hold both, or the older half is
            // evicted the first time somebody watches a few previews.
            maxEntries: 800,
            maxAgeSeconds: 90 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    {
      // The lesson photographs and illustrations (#1077): cache-first, so a
      // teacher who opened the lesson indoors still has its pictures in a
      // field with no signal. Excluded from the install-time precache for the
      // same reason the audio corpora are — the corpus is megabytes of
      // lessons a given school will never run — and warmed here on the one
      // event that says she wants them, which is opening the lesson.
      //
      // Pack content, identical for every school, so this survives the
      // sign-out sweep exactly as the audio and photograph caches do.
      matcher: ({ url, sameOrigin }) => isLessonImageRequest(sameOrigin, url.pathname),
      handler: new CacheFirst({
        cacheName: LESSON_IMAGE_CACHE,
        plugins: [
          new CacheableResponsePlugin({ statuses: [200] }),
          new ExpirationPlugin({
            // One lesson shows at most a handful; this holds a term's worth of
            // lessons without letting a shared iPad fill up with terms past.
            maxEntries: 200,
            maxAgeSeconds: 90 * 24 * 60 * 60,
            maxAgeFrom: "last-used",
          }),
        ],
      }),
    },
    {
      // Public pages: fresh when online, cached copy when the field has no
      // signal. Only the allowlisted, non-personalised routes reach here.
      matcher: ({ request, url }) =>
        request.mode === "navigate" && PUBLIC_ROUTES.has(url.pathname),
      handler: new NetworkFirst({
        cacheName: PUBLIC_CACHE,
        networkTimeoutSeconds: 5,
      }),
    },
    {
      // Every other navigation is personalised: live or honestly unavailable,
      // never written to a cache that could outlive the session.
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_PRINT_FALLBACK_ROUTE,
        matcher: ({ request }) =>
          request.mode === "navigate" &&
          new URL(request.url).pathname.startsWith(OFFLINE_PRINT_FALLBACK_ROUTE),
      },
      {
        url: OFFLINE_FALLBACK_ROUTE,
        matcher: ({ request }) => request.mode === "navigate",
      },
    ],
  },
});

/**
 * Delete every cache except the exact active app shell, current public cache,
 * and the public media/audio/lesson-image runtime caches. Used both on
 * activate (drop old versions and legacy caches) and on sign-out (defence in
 * depth).
 */
async function purgeStaleCaches(): Promise<void> {
  const storedNames = await caches.keys();
  const staleNames = cacheNamesToDelete(storedNames, {
    currentPrecache: cacheNames.precache,
    currentPublicCache: PUBLIC_CACHE,
    persistentRuntimeCaches: [AUDIO_CACHE, MEDIA_CACHE, LESSON_IMAGE_CACHE],
  });
  await Promise.all(staleNames.map((name) => caches.delete(name)));
}

// Version cleanup on activate: drop the legacy blanket "pages" cache and any
// prior public-cache version so the fix rolls out cleanly to sticky installs.
// Runs alongside Serwist's own activate handling — both listeners fire.
self.addEventListener("activate", (event) => {
  event.waitUntil(purgeStaleCaches());
});

// Sign-out purge: the SignOutButton posts this after the session is revoked. We
// ack the sending client so it can wait for the sweep before navigating away.
self.addEventListener("message", (event) => {
  if (event.data?.type !== PURGE_PRIVATE_CACHES) return;
  event.waitUntil(
    (async () => {
      await purgeStaleCaches();
      const source = event.source;
      if (source && "postMessage" in source) {
        (source as Client).postMessage({
          type: `${PURGE_PRIVATE_CACHES}_DONE`,
        });
      }
    })(),
  );
});

serwist.addEventListeners();

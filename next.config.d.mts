/**
 * Types for `next.config.mjs`.
 *
 * Next reads the config as `.mjs` and `tsconfig.json` sets `allowJs: false`,
 * so without a declaration an import of it is an implicit `any` — which is a
 * red build under `strict`, and before that a spec that asserts nothing about
 * shape. Same pattern as `scripts/schema-mirror-lint.d.mts`.
 *
 * Only the values a test or a lint reads are declared. The default export is
 * Next's own config object and nothing in this repo imports it.
 */

/**
 * The globs `@serwist/next` scans `public/` with. Exported so a test and
 * `scripts/sw-cache-lint.mjs` can run them against the real public tree
 * rather than assert on the source text of this file.
 */
export const PUBLIC_PRECACHE_PATTERNS: string[];

/** One precache entry: a public URL and the hash that revisions it. */
export interface PrecacheEntry {
  url: string;
  revision: string;
}

/** Every file the public-folder scan picks up, revisioned by content hash. */
export const PUBLIC_PRECACHE_ENTRIES: PrecacheEntry[];

/** The public scan plus the explicitly named offline navigation fallbacks. */
export const ADDITIONAL_PRECACHE_ENTRIES: PrecacheEntry[];

/** The commit (or content hash) the offline shell's entries are revisioned by. */
export const OFFLINE_BUILD_REVISION: string;

declare const config: unknown;
export default config;

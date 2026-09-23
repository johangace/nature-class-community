export type CacheCleanupPolicy = Readonly<{
  /** The exact Serwist precache name used by the active worker. */
  currentPrecache: string;
  /** The one public-navigation cache version the active worker writes. */
  currentPublicCache: string;
  /** Public, non-account runtime caches that intentionally survive sign-out. */
  persistentRuntimeCaches: readonly string[];
}>;

/**
 * Return the cache names an activate/sign-out sweep must remove.
 *
 * The active app shell is kept by exact name. Prefix matching is deliberately
 * forbidden: an upgraded iPad can still hold an older Serwist precache (and,
 * historically, the full lesson-preview audio corpus) under another name.
 */
export function cacheNamesToDelete(
  cacheNames: readonly string[],
  policy: CacheCleanupPolicy,
): string[] {
  const keep = new Set([
    policy.currentPrecache,
    policy.currentPublicCache,
    ...policy.persistentRuntimeCaches,
  ]);

  return cacheNames.filter((cacheName) => !keep.has(cacheName));
}

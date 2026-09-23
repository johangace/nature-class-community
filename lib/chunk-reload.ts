/**
 * Deploy-swap resilience (nc#75).
 *
 * This repo deploys on every merge to main. A teacher who has a page open
 * across a deploy is running React built against the OLD build's chunk
 * manifest. The moment that tab needs a chunk it has not already fetched — a
 * step it has not reached yet, a route segment it has not visited — it asks
 * for a hashed URL the new deployment never shipped (verified live 2026-08-03:
 * every chunk on the new build was itself fine, 200 and self-consistent; the
 * old tab was just asking for a URL that stopped existing). The result is a
 * hard client-side crash that has nothing to do with a code bug.
 *
 * The fix is the standard one: recognise that specific failure shape and
 * recover with a single full-page reload, which re-fetches the HTML document
 * and picks up the CURRENT build's manifest fresh. `app/error.tsx` and
 * `app/global-error.tsx` both use this.
 */

const RELOAD_GUARD_KEY = "nc:chunk-reload-attempted";

/**
 * True for the failure shapes a stale chunk manifest produces. Webpack names
 * the error `ChunkLoadError`; the message text varies by which asset 404s
 * first (a JS chunk, a CSS chunk, or a dynamic `import()`), so this matches
 * on the well-known shapes rather than the exact string.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ChunkLoadError") return true;
  return /(loading chunk [\w.-]+ failed|loading css chunk [\w.-]+ failed|failed to fetch dynamically imported module|chunkloaderror)/i.test(
    error.message ?? "",
  );
}

/**
 * Has this tab already spent its one automatic reload? Scoped to
 * sessionStorage on purpose: it survives the reload itself (so the guard
 * actually guards) but clears when the tab closes, so a fresh tab always
 * gets its own attempt. A browser that denies storage access (private mode,
 * a locked-down embed) fails CLOSED — treated as "already attempted" — so a
 * chunk error there shows the manual-reload screen once rather than risking
 * a loop it has no way to remember it already tried to break.
 */
export function hasAttemptedChunkReload(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_GUARD_KEY) === "1";
  } catch {
    return true;
  }
}

/**
 * Record that the one automatic reload is spent. Called immediately before
 * triggering it, never after — the reload tears the page down, so anything
 * ordered after it is not guaranteed to run.
 */
export function markChunkReloadAttempted(): void {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  } catch {
    // Storage isn't reachable — hasAttemptedChunkReload() already fails
    // closed in that case, so there is nothing further to record.
  }
}

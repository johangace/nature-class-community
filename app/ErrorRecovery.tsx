"use client";

import { useEffect, useState, type ReactElement } from "react";
import { Wordmark } from "./Wordmark";
import {
  hasAttemptedChunkReload,
  isChunkLoadError,
  markChunkReloadAttempted,
} from "@/lib/chunk-reload";

type Props = {
  error: Error & { digest?: string };
};

/**
 * The shared crash screen (nc#75). `app/error.tsx` and `app/global-error.tsx`
 * both render this — one covers a route segment crashing, the other covers
 * the root layout itself, and they share every byte of the actual recovery
 * logic here rather than each carrying their own copy to drift apart.
 *
 * A stale-chunk crash (see lib/chunk-reload.ts) gets exactly one silent
 * `window.location.reload()`, spent immediately via sessionStorage before the
 * reload fires so a SECOND crash of the same shape — a genuinely broken
 * deployment, not a stale tab — lands on the calm screen below instead of
 * reloading forever. Every other error renders that screen straight away:
 * house voice, a working reload button, never Next's default stack trace.
 */
export function ErrorRecovery({ error }: Props): ReactElement | null {
  const staleDeploy = isChunkLoadError(error);

  // Computed once, in the lazy initializer, so the very FIRST render — the
  // one that actually gets painted — already knows whether it's about to
  // reload. That is what keeps a teacher from ever seeing the calm screen
  // flash before the page turns over: if this render decides "reloading",
  // it renders null from the start rather than painting the screen and then
  // hiding it a frame later.
  const [reloading] = useState(() => staleDeploy && !hasAttemptedChunkReload());

  useEffect(() => {
    if (!reloading) return;
    markChunkReloadAttempted();
    window.location.reload();
    // No cleanup: the reload tears this page down.
  }, [reloading]);

  // The reload is already in flight — nothing to paint.
  if (reloading) return null;

  return (
    <main className="crashed">
      <Wordmark className="crashed-brand" />
      <h1>{staleDeploy ? "A new version just went out." : "Something went sideways."}</h1>
      <p>
        {staleDeploy
          ? "This tab was still running the last one. Reload to pick up the current build."
          : "Reload usually clears it. If it keeps happening, tell us what you were doing when it broke."}
      </p>
      <button
        type="button"
        className="crashed-reload btn-start"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </main>
  );
}

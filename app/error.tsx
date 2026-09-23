"use client";

import type { ReactElement } from "react";
import { ErrorRecovery } from "./ErrorRecovery";

/**
 * Segment-level crash boundary (nc#75). Next mounts this for anything a route
 * segment throws below the root layout — most crashes, including a
 * stale-chunk fetch failure from a deploy that landed while this tab was
 * still open (see lib/chunk-reload.ts). The actual recovery-or-calm-screen
 * logic lives in ErrorRecovery, shared with app/global-error.tsx, which is
 * this file's twin for a crash in the root layout itself.
 *
 * `reset` (Next's usual invitation to retry the segment in place) is
 * deliberately unused: a stale-chunk crash needs a real navigation to pick up
 * a fresh HTML document and script manifest, which only `window.location`
 * gives us, so ErrorRecovery always reaches for that instead.
 */
export default function Error({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): ReactElement {
  return <ErrorRecovery error={error} />;
}

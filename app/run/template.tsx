"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DandelionTransition } from "../DandelionTransition";

/** Long enough to register as a threshold, short enough to keep lesson entry brisk. */
export const RUN_ENTRY_TRANSITION_MS = 900;

/**
 * Give every entry into `/run` the same intentional threshold.
 *
 * `loading.tsx` only appears while a segment is unresolved. A prefetched run
 * can resolve before that fallback paints, so this route template owns the
 * brief minimum transition and remounts whenever the run segment is entered.
 */
export default function RunTemplate({ children }: { children: ReactNode }) {
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    const transition = window.setTimeout(
      () => setIsEntering(false),
      RUN_ENTRY_TRANSITION_MS
    );

    return () => window.clearTimeout(transition);
  }, []);

  if (isEntering) {
    return <DandelionTransition message="Opening the lesson." />;
  }

  return children;
}
